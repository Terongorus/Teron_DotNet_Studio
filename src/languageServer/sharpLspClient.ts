import * as vscode from 'vscode';
import * as path from 'path';
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
import { resolveSharpLspCommand, resolveDotnetPath, getExtraArgs, probeSharpLsp } from './sharpLspLocator';
import { downloadLatestRelease } from './sharpLspInstaller';
import {
    showNotInstalledNotice,
    showMisconfiguredPathNotice,
    showGaveUpNotice,
    showDownloadFailedNotice,
    showDownloadSucceededNotice
} from './sharpLspNotifications';

export type SharpLspStatus = 'NotInstalled' | 'Starting' | 'Running' | 'Restarting' | 'Stopped' | 'Failed';

const MAX_RESTART_ATTEMPTS = 5;
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * The vscode-languageclient analogue of xamlDesigner/designerHostClient.ts's DesignerHostClient -
 * same lifecycle idioms (memoized start, capped-restart latch, dispose-wired-to-deactivate),
 * different transport (stdio + the standard LSP client, not a hand-rolled named pipe).
 */
export class SharpLspClientManager implements vscode.Disposable {
    private readonly _onDidChangeStatus = new vscode.EventEmitter<SharpLspStatus>();
    readonly onDidChangeStatus = this._onDidChangeStatus.event;

    private client: LanguageClient | undefined;
    private starting: Promise<void> | undefined;
    private restartAttempts = 0;
    private disposed = false;
    private notInstalled = false;
    private status: SharpLspStatus = 'Stopped';

    constructor(private readonly context: vscode.ExtensionContext) {}

    getStatus(): SharpLspStatus {
        return this.status;
    }

    private setStatus(status: SharpLspStatus): void {
        this.status = status;
        this._onDidChangeStatus.fire(status);
    }

    /** Memoized so concurrent triggers (two files opened at once, a manual Restart racing an auto-trigger) never double-spawn. */
    async ensureStarted(): Promise<void> {
        if (this.disposed || this.notInstalled || this.client) { return; }
        if (!this.starting) {
            this.starting = this.start().finally(() => { this.starting = undefined; });
        }
        return this.starting;
    }

    private async start(): Promise<void> {
        const resolved = resolveSharpLspCommand(this.context);
        if ('misconfigured' in resolved) {
            showMisconfiguredPathNotice(resolved.detail);
            this.setStatus('Failed');
            return;
        }

        const probe = await probeSharpLsp(resolved.command);
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

    /** Invoked by the not-installed notice's "Download" action and by the status bar menu's "Download/Update SharpLsp" entry. */
    async downloadAndStart(): Promise<void> {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'SharpLsp', cancellable: true },
            (progress, token) => downloadLatestRelease(this.context, progress, token)
        );

        if (!result.ok) {
            if (result.detail !== 'Cancelled.') { showDownloadFailedNotice(result.detail); }
            return;
        }

        showDownloadSucceededNotice(result.version);
        this.notInstalled = false;
        this.restartAttempts = 0;
        await this.spawnClient(result.path);
    }

    private async spawnClient(command: string): Promise<void> {
        const dotnetPath = resolveDotnetPath();
        const env: NodeJS.ProcessEnv = { ...process.env };
        if (dotnetPath) {
            const dotnetDir = path.dirname(dotnetPath);
            env.DOTNET_ROOT = dotnetDir;
            env.PATH = `${dotnetDir}${path.delimiter}${env.PATH ?? ''}`;
        }

        const run: Executable = {
            command,
            args: getExtraArgs(),
            transport: TransportKind.stdio,
            options: { env }
        };
        const serverOptions: ServerOptions = { run, debug: run };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'csharp' },
                { scheme: 'file', language: 'fsharp' },
                { scheme: 'untitled', language: 'csharp' },
                { scheme: 'untitled', language: 'fsharp' }
            ],
            // Never steal focus to the Output panel on a server-side diagnostic - the user
            // opens logs explicitly via the Show Output command.
            revealOutputChannelOn: RevealOutputChannelOn.Never,
            errorHandler: this.makeErrorHandler()
        };

        const client = new LanguageClient('dotnet-creator.sharpLsp', 'SharpLsp (C#/F#)', serverOptions, clientOptions);
        this.client = client;

        client.onDidChangeState(event => {
            if (event.newState === State.Starting) {
                this.setStatus('Starting');
            } else if (event.newState === State.Running) {
                this.setStatus('Running');
                this.restartAttempts = 0;
            }
            // State.Stopped is intentionally not mapped here - the errorHandler's closed()
            // below is the single source of truth for Restarting/Failed/Stopped-on-purpose,
            // since it alone knows whether a restart is about to happen.
        });

        this.setStatus('Starting');
        await client.start();
    }

    /**
     * Mirrors SharpLsp's own reference-client error handler exactly (verified in their public
     * client.ts): a few in-place error continues before shutdown, and capped auto-restart on
     * close with one actionable notice only after giving up - not on every transient close.
     * `handled: true` suppresses vscode-languageclient's own default modal dialogs, since our
     * own notifications cover it.
     */
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

    /** Clears all latches and retries - what both the "Restart Language Server" command and the status bar menu's Restart action call. */
    async restart(): Promise<void> {
        await this.stopClient();
        this.restartAttempts = 0;
        this.notInstalled = false;
        this.setStatus('Stopped');
        await this.ensureStarted();
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
    }
}
