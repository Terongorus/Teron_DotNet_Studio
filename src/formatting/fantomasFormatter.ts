import * as cp from 'child_process';
import * as vscode from 'vscode';
import { StreamMessageReader, StreamMessageWriter, createMessageConnection, MessageConnection } from 'vscode-jsonrpc/node';

const START_TIMEOUT_MS = 15000;

/**
 * Fantomas' own JSON-RPC "Formatted"/"Unchanged"/"Error"/"IgnoredFile" case, encoded the way
 * F#'s Newtonsoft.Json DU serialization writes it (`{ Case, Fields }`) - confirmed against a real
 * spawned daemon, matching `Fantomas.Client`'s own `decodeFormatResult` (`LSPFantomasService.fs`),
 * which exists specifically because the daemon's raw wire shape isn't its own client's public
 * `FantomasResponse` type. Reimplemented minimally here (just the "Formatted" case's content, the
 * only one this extension needs) rather than pulling in the whole `Fantomas.Client` .NET-oriented
 * client abstraction for a single field.
 */
interface FantomasDuResponse {
    Case: 'Formatted' | 'Unchanged' | 'Error' | 'IgnoredFile';
    Fields: unknown[];
}

/**
 * Drives a real `fantomas --daemon` process directly over its own JSON-RPC protocol (StreamJsonRpc
 * on the .NET side, Content-Length-delimited like LSP - confirmed to interoperate with
 * `vscode-jsonrpc` against a real spawned daemon before writing this, not assumed from the two
 * libraries merely both claiming "JSON-RPC"). One persistent daemon per extension session, the
 * same "warm process, not one per request" reasoning as CsharpierServer - Fantomas' own plain CLI
 * doesn't even support stdin/buffer content at all (only real file paths), so the daemon is the
 * only way to format unsaved editor content in the first place, not just a performance choice.
 */
export class FantomasDaemon {
    private process: cp.ChildProcess | undefined;
    private connectionPromise: Promise<MessageConnection> | undefined;
    private disposed = false;

    constructor(private readonly executablePath: string, private readonly outputChannel: vscode.OutputChannel) {}

    private start(): Promise<MessageConnection> {
        if (!this.connectionPromise) {
            this.connectionPromise = new Promise<MessageConnection>((resolve, reject) => {
                const proc = cp.spawn(this.executablePath, ['--daemon'], { stdio: 'pipe' });
                this.process = proc;

                const timeout = setTimeout(() => {
                    proc.kill();
                    reject(new Error('Timed out waiting for fantomas daemon to start.'));
                }, START_TIMEOUT_MS);

                proc.stderr?.on('data', chunk => this.outputChannel.appendLine(chunk.toString().trimEnd()));
                proc.on('error', error => { clearTimeout(timeout); reject(error); });
                proc.on('exit', code => {
                    if (!this.disposed) { this.outputChannel.appendLine(`fantomas daemon exited unexpectedly (code ${code}).`); }
                    this.connectionPromise = undefined;
                });

                const connection = createMessageConnection(
                    new StreamMessageReader(proc.stdout!),
                    new StreamMessageWriter(proc.stdin!)
                );
                connection.listen();

                // Sanity-check the connection actually works (same reasoning as Fantomas.Client's
                // own FantomasToolLocator.createFor - "Get the version first as a sanity check")
                // before handing out a connection callers will assume is live.
                connection.sendRequest<string>('fantomas/version').then(
                    () => { clearTimeout(timeout); resolve(connection); },
                    error => { clearTimeout(timeout); reject(error); }
                );
            });
        }
        return this.connectionPromise;
    }

    /** Returns the formatted text, or undefined if nothing should change (already-formatted, ignored, or a real formatting error - logged to the output channel either way). */
    async formatDocument(content: string, filePath: string): Promise<string | undefined> {
        const connection = await this.start();
        const response = await connection.sendRequest<FantomasDuResponse>('fantomas/formatDocument', {
            SourceCode: content,
            FilePath: filePath,
            Config: null,
            Cursor: null
        });

        if (response.Case === 'Formatted') { return response.Fields[1] as string; }
        if (response.Case === 'Error') { this.outputChannel.appendLine(`fantomas: failed to format ${filePath}: ${response.Fields[1]}`); }
        return undefined;
    }

    dispose(): void {
        this.disposed = true;
        this.process?.kill();
    }
}
