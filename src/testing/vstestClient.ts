import * as net from 'net';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { frameMessage, VsTestMessage, VsTestMessageDecoder } from './vstestFraming';

const PROTOCOL_VERSION = 7;
/** Matches VSTest's own documented "generic bag" for an empty settings document - required (not optional/null) per the protocol's own examples. */
const EMPTY_RUN_SETTINGS = '<RunSettings></RunSettings>';
const CONNECT_TIMEOUT_MS = 30000;

export interface VsTestCase {
    Id: string;
    FullyQualifiedName: string;
    DisplayName: string;
    ExecutorUri: string;
    Source: string;
    CodeFilePath: string | null;
    LineNumber: number;
}

/** 0 = None, 1 = Passed, 2 = Failed, 3 = Skipped, 4 = NotFound - values 1/2 confirmed empirically against a real run; the rest match VSTest's own TestOutcome enum ordering. */
export type VsTestOutcome = 0 | 1 | 2 | 3 | 4;

export interface VsTestResult {
    TestCase: VsTestCase;
    Outcome: VsTestOutcome;
    ErrorMessage: string | null;
    ErrorStackTrace: string | null;
    Duration: string;
}

export interface VsTestAttachment {
    Uri: string;
}

export interface VsTestAttachmentSet {
    Uri: string;
    DisplayName: string;
    Attachments: VsTestAttachment[];
}

/**
 * A live connection to one `vstest.console.exe --port:<port> --parentprocessid:<pid>` process -
 * the design-mode protocol used by Visual Studio/Rider (see vstestFraming.ts for the wire
 * framing). One session per discovery/run operation is simplest and matches how this extension
 * already treats `dotnet build`/`dotnet publish` invocations - a short-lived process per
 * operation, not a long-running daemon to keep alive and resynchronize state with.
 */
export class VsTestSession {
    private readonly decoder: VsTestMessageDecoder;
    private disposed = false;

    private constructor(
        private readonly child: cp.ChildProcess,
        private readonly socket: net.Socket,
        private readonly outputChannel: vscode.OutputChannel
    ) {
        this.decoder = new VsTestMessageDecoder(
            message => this.handleMessage(message),
            error => this.outputChannel.appendLine(`[Test Explorer] Failed to parse a message from vstest.console: ${error.message}`)
        );
        this.socket.on('data', chunk => this.decoder.push(chunk));
    }

    private pendingHandler: ((message: VsTestMessage) => void) | undefined;

    private handleMessage(message: VsTestMessage): void {
        if (message.MessageType === 'TestSession.Message') {
            const payload = message.Payload as { Message?: string } | undefined;
            if (payload?.Message) { this.outputChannel.appendLine(payload.Message); }
            return;
        }
        this.pendingHandler?.(message);
    }

    /** Runs exactly one request/response "operation" - VSTest's own server only processes one request at a time (per its protocol docs), so overlapping calls would be a real bug, not just wasteful. */
    private async runOperation<T>(send: () => void, handle: (message: VsTestMessage, resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
        if (this.pendingHandler) { throw new Error('A previous VSTest operation is still in progress.'); }
        return new Promise<T>((resolve, reject) => {
            this.pendingHandler = message => handle(message, resolve, reject);
            try {
                send();
            } catch (error: any) {
                this.pendingHandler = undefined;
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        }).finally(() => { this.pendingHandler = undefined; });
    }

    private send(messageType: string, payload?: unknown): void {
        this.socket.write(frameMessage(payload === undefined ? { MessageType: messageType } : { MessageType: messageType, Payload: payload }));
    }

    /**
     * `cwd` matters beyond tidiness: vstest.console defaults any relative output (most notably
     * data collectors' `TestResults/` directory, used by code coverage) to its own working
     * directory - omitting this left a stray `TestResults/` folder in this extension's own repo
     * root during development, since the child process silently inherited the extension host's
     * cwd instead of the test project's directory.
     */
    static async start(vstestConsolePath: string, outputChannel: vscode.OutputChannel, cwd: string): Promise<VsTestSession> {
        const server = net.createServer();
        const port = await new Promise<number>((resolve, reject) => {
            server.on('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address === 'object') { resolve(address.port); } else { reject(new Error('Failed to bind a local port for the vstest.console connection.')); }
            });
        });

        const child = cp.spawn('dotnet', [vstestConsolePath, `--port:${port}`, `--parentprocessid:${process.pid}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout?.on('data', d => outputChannel.appendLine(d.toString().trimEnd()));
        child.stderr?.on('data', d => outputChannel.appendLine(d.toString().trimEnd()));

        const socket = await new Promise<net.Socket>((resolve, reject) => {
            const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for vstest.console to connect.')); }, CONNECT_TIMEOUT_MS);
            const cleanup = () => { clearTimeout(timeout); server.close(); child.removeListener('exit', onExit); };
            const onExit = (code: number | null) => { cleanup(); reject(new Error(`vstest.console exited before connecting (code ${code}).`)); };

            child.once('exit', onExit);
            server.once('connection', s => { cleanup(); resolve(s); });
        });

        const session = new VsTestSession(child, socket, outputChannel);
        await session.handshake();
        return session;
    }

    private async handshake(): Promise<void> {
        await this.runOperation<void>(
            () => { /* the runner speaks first (TestSession.Connected) - nothing to send yet */ },
            (message, resolve, reject) => {
                if (message.MessageType === 'TestSession.Connected') {
                    this.send('ProtocolVersion', PROTOCOL_VERSION);
                } else if (message.MessageType === 'ProtocolVersion') {
                    resolve();
                } else {
                    reject(new Error(`Unexpected message during handshake: ${message.MessageType}`));
                }
            }
        );
    }

    /** Discovers tests in the given built assemblies. `onTestsFound` fires once per batch as VSTest reports them (never one giant batch at the very end), so a caller can render results incrementally for large suites. */
    async discoverTests(sources: string[], onTestsFound: (cases: VsTestCase[]) => void): Promise<{ totalTests: number }> {
        return this.runOperation<{ totalTests: number }>(
            () => this.send('TestDiscovery.Start', { Sources: sources, RunSettings: EMPTY_RUN_SETTINGS }),
            (message, resolve, reject) => {
                if (message.MessageType === 'TestDiscovery.TestFound') {
                    onTestsFound(message.Payload as VsTestCase[]);
                } else if (message.MessageType === 'TestDiscovery.Completed') {
                    const payload = message.Payload as { TotalTests: number; LastDiscoveredTests?: VsTestCase[] | null };
                    if (payload.LastDiscoveredTests?.length) { onTestsFound(payload.LastDiscoveredTests); }
                    resolve({ totalTests: payload.TotalTests });
                } else if (message.MessageType !== 'TestSession.Message') {
                    reject(new Error(`Unexpected message during discovery: ${message.MessageType}`));
                }
            }
        );
    }

    /**
     * Runs the given test cases (a subset - use discoverTests()'s results to pick which ones).
     * `onResults` fires once per batch as results complete, streamed rather than only delivered
     * at the very end. Explicitly includes `Sources` (not just `TestCases`) - confirmed necessary
     * against a real vstest.console 18.6.0: omitting it crashes the server's own
     * `TestRequestManager.RunTests` with a null-key `ArgumentNullException` when a run happens in
     * a fresh session (its `GetSources()` helper prefers `Sources` when present and otherwise
     * derives it from `TestCases`, and that derivation path is the one that crashes).
     *
     * `runSettings`, when provided, replaces the default empty settings document - used for code
     * coverage, which needs a `<DataCollectionRunSettings>` section (see coverletCollector.ts).
     * Returns whatever attachments the run produced (e.g. a coverage report) - `AttachmentSets`
     * is empty unless RunSettings actually requested a data collector.
     */
    async runTests(testCases: VsTestCase[], onResults: (results: VsTestResult[]) => void, runSettings: string = EMPTY_RUN_SETTINGS): Promise<{ attachmentSets: VsTestAttachmentSet[] }> {
        const sources = [...new Set(testCases.map(tc => tc.Source))];
        return this.runOperation<{ attachmentSets: VsTestAttachmentSet[] }>(
            () => this.send('TestExecution.RunSelectedWithDefaultHost', { TestCases: testCases, Sources: sources, RunSettings: runSettings }),
            (message, resolve, reject) => {
                if (message.MessageType === 'TestExecution.StatsChange') {
                    const payload = message.Payload as { NewTestResults?: VsTestResult[] };
                    if (payload.NewTestResults?.length) { onResults(payload.NewTestResults); }
                } else if (message.MessageType === 'TestExecution.Completed') {
                    const payload = message.Payload as { TestRunCompleteArgs?: { AttachmentSets?: VsTestAttachmentSet[] } };
                    resolve({ attachmentSets: payload.TestRunCompleteArgs?.AttachmentSets ?? [] });
                } else if (message.MessageType !== 'TestSession.Message') {
                    reject(new Error(`Unexpected message during test run: ${message.MessageType}`));
                }
            }
        );
    }

    dispose(): void {
        if (this.disposed) { return; }
        this.disposed = true;
        try { this.send('TestSession.Terminate'); } catch { /* best-effort - the process gets killed below regardless */ }
        this.socket.destroy();
        if (!this.child.killed) { this.child.kill(); }
    }
}
