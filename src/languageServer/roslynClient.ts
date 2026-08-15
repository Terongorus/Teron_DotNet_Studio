import * as vscode from 'vscode';
import {
    CloseAction,
    ErrorAction,
    type CloseHandlerResult,
    type ErrorHandlerResult,
    type Executable,
    LanguageClient,
    type LanguageClientOptions,
    type Message,
    type ServerOptions,
    TransportKind,
    State,
    RevealOutputChannelOn
} from 'vscode-languageclient/node';
import {
    resolveRoslynCommand,
    getExtraArgs,
    probeRoslyn,
    RESOLVED_PATH_STATE_KEY,
    RESOLVED_VERSION_STATE_KEY
} from './roslynLocator';
import { downloadLatestRoslyn } from './roslynInstaller';
import {
    showNotInstalledNotice,
    showMisconfiguredPathNotice,
    showGaveUpNotice,
    showDownloadFailedNotice,
    showDownloadSucceededNotice
} from './roslynNotifications';
import { peekCurrentSolution, onDidChangeCurrentSolution } from '../utils/currentSolution';
import { peekPickedCsprojFile, onDidChangePickedCsproj } from '../utils/projectPicker';
import { parseSolutionProjects } from '../utils/solutionParser';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';

export type RoslynStatus = 'NotInstalled' | 'Starting' | 'Running' | 'Restarting' | 'Stopped' | 'Failed';

const MAX_RESTART_ATTEMPTS = 5;
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Drives Microsoft's own Roslyn Language Server directly (the same binary VS Code's C# Dev Kit
 * uses internally, downloaded from Microsoft's own public feed - see roslynInstaller.ts),
 * following the same standalone-integration approach roslyn.nvim uses for Neovim. Same lifecycle
 * shape as SharpLspClientManager (sharpLspClient.ts) - kept as an independent class rather than a
 * shared base, since this is the second, not yet a pattern worth abstracting.
 *
 * One non-standard requirement beyond a normal vscode-languageclient setup, confirmed against
 * roslyn.nvim's and nvim-lspconfig's real source (not guessed): after the server reaches
 * Running, a custom `solution/open` (or `project/open`) notification must be sent - the server
 * does not discover the workspace on its own the way SharpLsp does, and skipping this produces a
 * server that starts but silently shows zero diagnostics. (Neovim's own LSP client additionally
 * needs an explicit `textDocument.diagnostic.dynamicRegistration` capability override for
 * diagnostics to appear at all - confirmed NOT needed here, since vscode-languageclient's own
 * DiagnosticFeature already sets that automatically; verified in the installed package's source
 * rather than assumed just because Neovim needed it.)
 */
export class RoslynClientManager implements vscode.Disposable {
    private readonly _onDidChangeStatus = new vscode.EventEmitter<RoslynStatus>();
    readonly onDidChangeStatus = this._onDidChangeStatus.event;

    private client: LanguageClient | undefined;
    private starting: Promise<void> | undefined;
    private restartAttempts = 0;
    private disposed = false;
    private notInstalled = false;
    private status: RoslynStatus = 'Stopped';
    private readonly workspaceSubscriptions: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.workspaceSubscriptions.push(
            onDidChangeCurrentSolution(() => void this.openCurrentWorkspace()),
            onDidChangePickedCsproj(() => void this.openCurrentWorkspace())
        );
    }

    getStatus(): RoslynStatus {
        return this.status;
    }

    private setStatus(status: RoslynStatus): void {
        this.status = status;
        this._onDidChangeStatus.fire(status);
    }

    /** Memoized so concurrent triggers never double-spawn. */
    async ensureStarted(): Promise<void> {
        if (this.disposed || this.notInstalled || this.client) { return; }
        if (!this.starting) {
            this.starting = this.start().finally(() => { this.starting = undefined; });
        }
        return this.starting;
    }

    private async start(): Promise<void> {
        const resolved = resolveRoslynCommand(this.context);
        if ('misconfigured' in resolved) {
            showMisconfiguredPathNotice(resolved.detail);
            this.setStatus('Failed');
            return;
        }

        const probe = await probeRoslyn(resolved.command);
        if (!probe.ok) {
            if (probe.reason === 'not-found') {
                this.notInstalled = true;
                this.setStatus('NotInstalled');
                const choice = await showNotInstalledNotice(this.context);
                if (choice === 'download') {
                    await this.downloadAndStart();
                }
            } else {
                this.setStatus('Failed');
            }
            return;
        }

        await this.spawnClient(resolved.command);
    }

    /** Invoked by the not-installed notice's "Download" action and by the status bar/switch command's "Download/Update" entry. */
    async downloadAndStart(): Promise<void> {
        // Same reasoning as SharpLsp's downloadAndStart(): a running client holding this exact
        // file open would fail to be overwritten on Windows.
        await this.stopClient();

        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Roslyn Language Server', cancellable: true },
            (progress, token) => downloadLatestRoslyn(this.context, progress, token)
        );

        if (!result.ok) {
            if (result.detail !== 'Cancelled.') { showDownloadFailedNotice(result.detail); }
            return;
        }

        showDownloadSucceededNotice(result.version);
        await this.useResolvedPath(result.path, result.version);
    }

    private async useResolvedPath(resolvedPath: string, version: string | undefined): Promise<void> {
        await this.context.globalState.update(RESOLVED_PATH_STATE_KEY, resolvedPath);
        await this.context.globalState.update(RESOLVED_VERSION_STATE_KEY, version);
        this.notInstalled = false;
        this.restartAttempts = 0;
        await this.spawnClient(resolvedPath);
    }

    private async spawnClient(command: string): Promise<void> {
        // --logLevel and --extensionLogDirectory are both marked (REQUIRED) by the server's own
        // `--help` output (confirmed by actually running the downloaded binary, not guessed from
        // roslyn.nvim/nvim-lspconfig's source, which only pass --stdio) - omitting either makes
        // the process print its usage text to stdout instead of starting, which the LSP client
        // then fails trying to parse as protocol frames ("Header must provide a Content-Length
        // property"). context.logUri is this extension's own per-install log directory - exactly
        // what --extensionLogDirectory is for - but must exist before the server starts, hence
        // creating it first.
        const logDirectory = this.context.logUri;
        await vscode.workspace.fs.createDirectory(logDirectory);

        const run: Executable = {
            command,
            args: ['--logLevel', 'Information', '--extensionLogDirectory', logDirectory.fsPath, '--stdio', ...getExtraArgs()],
            transport: TransportKind.stdio
        };
        const serverOptions: ServerOptions = { run, debug: run };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'csharp' },
                { scheme: 'untitled', language: 'csharp' }
            ],
            revealOutputChannelOn: RevealOutputChannelOn.Never,
            errorHandler: this.makeErrorHandler()
            // No manual capability overrides needed: vscode-languageclient's own DiagnosticFeature
            // already sets textDocument.diagnostic.dynamicRegistration = true automatically
            // (confirmed in the installed package's own source, node_modules/vscode-languageclient/
            // lib/common/diagnostic.js) - the explicit capability hack some other LSP clients need
            // (e.g. Neovim's built-in client, per nvim-lspconfig's own source) doesn't apply here.
        };

        const client = new LanguageClient('dotnet-studio.roslyn', 'Roslyn Language Server (C#)', serverOptions, clientOptions);
        this.client = client;

        client.onDidChangeState(event => {
            if (event.newState === State.Starting) {
                this.setStatus('Starting');
            } else if (event.newState === State.Running) {
                this.setStatus('Running');
                this.restartAttempts = 0;
                void this.openCurrentWorkspace();
            }
        });

        this.setStatus('Starting');
        await client.start();
    }

    /**
     * The custom handshake Roslyn needs beyond standard LSP init (see class doc comment) -
     * sends whichever the extension already tracks: the current solution if one is picked,
     * otherwise the current project. Re-sent whenever either changes while the server is already
     * running (see the constructor's subscriptions), not just once at startup, so switching
     * solutions doesn't leave the server pointed at a stale workspace.
     */
    private async openCurrentWorkspace(): Promise<void> {
        if (!this.client || this.status !== 'Running') { return; }

        const folder = getActiveWorkspaceFolder();
        if (!folder) { return; }

        const solutionPath = peekCurrentSolution(folder);
        if (solutionPath) {
            // .slnx specifically (not classic .sln) goes through project/open instead, one
            // project per member .csproj - a real, confirmed upstream bug, not a guess: Roslyn's
            // own SolutionFileReader (the .slnx-specific solution/open code path) throws a hard
            // internal assertion failure (Contract.Fail, "Unexpected false", SolutionFileReader.cs
            // line 24) trying to read a real .slnx here, verified against this exact server
            // version's real log output - and confirmed as a known, still-unresolved MSBuild/
            // Roslyn .slnx limitation (github.com/dotnet/roslyn/issues/73004, deferred to
            // github.com/dotnet/msbuild/issues/10012), not something fixable from this extension.
            // Once that failure happens the server is left in a broken state where even ordinary
            // file diagnostics fail with malformed URIs - project/open's per-project MSBuild
            // evaluation is the same mature, working code path already exercised by SharpLsp and
            // this extension's own build/debug features, so it sidesteps the broken reader
            // entirely. Classic .sln keeps using solution/open - that's the older, more mature
            // MSBuild code path per the same upstream issue thread, but it hasn't been driven
            // through a real Roslyn session in this codebase yet either; worth confirming live.
            if (solutionPath.toLowerCase().endsWith('.slnx')) {
                const projects = await parseSolutionProjects(solutionPath);
                if (projects.length > 0) {
                    await this.client.sendNotification('project/open', { projects: projects.map(p => vscode.Uri.file(p).toString()) });
                    return;
                }
            }

            await this.client.sendNotification('solution/open', { solution: vscode.Uri.file(solutionPath).toString() });
            return;
        }

        const projectPath = peekPickedCsprojFile(folder);
        if (projectPath) {
            await this.client.sendNotification('project/open', { projects: [vscode.Uri.file(projectPath).toString()] });
        }
    }

    private makeErrorHandler(): { error: (error: Error, message: Message | undefined, count: number | undefined) => ErrorHandlerResult; closed: () => CloseHandlerResult } {
        return {
            error: (_error, _message, count) => {
                return (count ?? 0) <= MAX_CONSECUTIVE_ERRORS
                    ? { action: ErrorAction.Continue }
                    : { action: ErrorAction.Shutdown };
            },
            closed: () => {
                if (this.disposed) { return { action: CloseAction.DoNotRestart }; }

                if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
                    this.setStatus('Failed');
                    showGaveUpNotice();
                    return { action: CloseAction.DoNotRestart, handled: true };
                }

                this.restartAttempts++;
                this.setStatus('Restarting');
                return { action: CloseAction.Restart, handled: true };
            }
        };
    }

    /** Clears all latches and retries - what the restart command calls. */
    async restart(): Promise<void> {
        await this.stopClient();
        this.restartAttempts = 0;
        this.notInstalled = false;
        this.setStatus('Stopped');
        await this.ensureStarted();
    }

    /**
     * Stops the client WITHOUT the permanent `disposed = true` latch `dispose()` sets - for the
     * "switch to the other language server" flow (switchLanguageServer.ts), which needs this one
     * stoppable now and startable again later. See SharpLspClientManager.stop()'s identical
     * comment for why `dispose()` alone would be wrong here.
     */
    async stop(): Promise<void> {
        await this.stopClient();
        this.restartAttempts = 0;
        this.setStatus('Stopped');
    }

    private async stopClient(): Promise<void> {
        const client = this.client;
        this.client = undefined;
        if (client) {
            try { await client.stop(); } catch { /* best-effort */ }
        }
    }

    /** The real server's own LSP log, for the "Show Language Server Output" command - falls back to undefined if never started. */
    getRealOutputChannel(): vscode.OutputChannel | undefined {
        return this.client?.outputChannel;
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        await this.stopClient();
        this._onDidChangeStatus.dispose();
        for (const sub of this.workspaceSubscriptions) { sub.dispose(); }
    }
}
