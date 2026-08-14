import * as cp from 'child_process';
import * as vscode from 'vscode';

const STARTED_ON_RE = /^Started on (\d+)/m;
const START_TIMEOUT_MS = 15000;

interface FormatFileResult {
    formattedFile: string | null;
    status: 'Formatted' | 'Ignored' | 'Failed' | 'UnsupportedFile';
    errorMessage: string | null;
}

/**
 * Drives a real `csharpier server` process directly, over the same HTTP protocol CSharpier's own
 * official VS Code extension uses (`POST http://127.0.0.1:<port>/format` with
 * `{ fileName, fileContents }`, verified against their real source
 * (`Src/CSharpier.VSCode/src/CSharpierProcessServer.ts`) and confirmed live against a real spawned
 * server before writing this) - not the one-shot `csharpier format --write-stdout` CLI, which
 * pays CSharpier's own Roslyn JIT startup cost (~0.4-0.7s, measured) on every single format
 * request. One persistent server process per extension session, matching this codebase's
 * `VsTestSession` precedent for "one process, many operations" over "process per operation" when
 * an operation is genuinely hot (format-on-save can fire often).
 */
export class CsharpierServer {
    private process: cp.ChildProcess | undefined;
    private startPromise: Promise<number> | undefined;
    private disposed = false;

    constructor(private readonly executablePath: string, private readonly outputChannel: vscode.OutputChannel) {}

    private start(): Promise<number> {
        if (!this.startPromise) {
            this.startPromise = new Promise<number>((resolve, reject) => {
                const proc = cp.spawn(this.executablePath, ['server'], { stdio: 'pipe' });
                this.process = proc;

                const timeout = setTimeout(() => {
                    proc.kill();
                    reject(new Error('Timed out waiting for csharpier server to start.'));
                }, START_TIMEOUT_MS);

                let buffer = '';
                proc.stdout?.on('data', chunk => {
                    buffer += chunk.toString();
                    const match = STARTED_ON_RE.exec(buffer);
                    if (match) {
                        clearTimeout(timeout);
                        resolve(Number(match[1]));
                    }
                });
                proc.stderr?.on('data', chunk => this.outputChannel.appendLine(chunk.toString().trimEnd()));
                proc.on('error', error => { clearTimeout(timeout); reject(error); });
                proc.on('exit', code => {
                    if (!this.disposed) { this.outputChannel.appendLine(`csharpier server exited unexpectedly (code ${code}).`); }
                    this.startPromise = undefined;
                });
            });
        }
        return this.startPromise;
    }

    /** Returns the formatted text, or undefined if nothing should change (ignored/unsupported file, or a real formatting failure - logged to the output channel either way). */
    async formatDocument(content: string, filePath: string): Promise<string | undefined> {
        const port = await this.start();
        const response = await fetch(`http://127.0.0.1:${port}/format`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: filePath, fileContents: content })
        });
        const result = await response.json() as FormatFileResult;

        if (result.status === 'Formatted' && result.formattedFile !== null) { return result.formattedFile; }
        if (result.status === 'Failed') { this.outputChannel.appendLine(`csharpier: failed to format ${filePath}: ${result.errorMessage}`); }
        return undefined;
    }

    dispose(): void {
        this.disposed = true;
        this.process?.kill();
    }
}
