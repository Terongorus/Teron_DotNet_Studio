import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as crypto from 'crypto';
import { runDotnet } from '../utils/process';
import { OutboundMessage, InboundMessage, TransformKind, Bounds } from './designerHostProtocol';
import { HelperPlatform } from '../utils/projectAssemblyResolver';

const MAX_RESTART_ATTEMPTS = 3;
const CONNECT_MAX_ATTEMPTS = 30;
const CONNECT_RETRY_DELAY_MS = 100;

interface PendingRequest {
    resolve: (message: InboundMessage) => void;
    reject: (error: Error) => void;
}

export interface RenderedFrame {
    width: number;
    height: number;
    pngBase64: string;
}

export interface CommitResult extends RenderedFrame {
    xamlText: string;
}

export interface Selection {
    path: string;
    bounds: Bounds;
}

/**
 * Owns the designer-host helper process and its named-pipe connection.
 * Restarts the process up to MAX_RESTART_ATTEMPTS times if it exits
 * unexpectedly; after that, fails permanently rather than restart-looping
 * forever (a bad XAML file that crashes rendering shouldn't spin up the
 * helper indefinitely).
 */
export class DesignerHostClient {
    private child: cp.ChildProcess | undefined;
    private socket: net.Socket | undefined;
    private buffer = '';
    private starting: Promise<void> | undefined;
    private readyResolve: (() => void) | undefined;
    private readonly pending = new Map<string, PendingRequest>();
    private restartAttempts = 0;
    private disposed = false;
    private permanentFailure: Error | undefined;

    constructor(private readonly context: vscode.ExtensionContext, private readonly platform: HelperPlatform) {}

    async loadXaml(xamlText: string, filePath?: string, assemblyPath?: string, appXamlText?: string): Promise<RenderedFrame> {
        const frame = await this.request<Extract<InboundMessage, { type: 'frame' }>>(
            requestId => ({ type: 'loadXaml', requestId, xamlText, filePath, assemblyPath, appXamlText })
        );
        return { width: frame.width, height: frame.height, pngBase64: frame.pngBase64 };
    }

    /**
     * x/y are device pixels in filePath's last-rendered frame coordinate space (same units
     * the webview maps its own CSS pixels into via the image's naturalWidth/rendered-width
     * ratio). filePath disambiguates which document to hit-test against, since one helper
     * process is shared across every open preview panel of this platform - resolves to
     * undefined when the point hit nothing trackable, or filePath was never rendered.
     */
    async selectAt(filePath: string, x: number, y: number): Promise<Selection | undefined> {
        const selection = await this.request<Extract<InboundMessage, { type: 'selection' }>>(
            requestId => ({ type: 'selectAt', requestId, filePath, x, y })
        );
        return selection.path && selection.bounds ? { path: selection.path, bounds: selection.bounds } : undefined;
    }

    async commitTransform(filePath: string, path: string, kind: TransformKind, bounds: Bounds): Promise<CommitResult> {
        const result = await this.request<Extract<InboundMessage, { type: 'transformResult' }>>(
            requestId => ({ type: 'commitTransform', requestId, filePath, path, kind, bounds })
        );
        return { width: result.width, height: result.height, pngBase64: result.pngBase64, xamlText: result.xamlText };
    }

    private async request<T extends InboundMessage>(buildMessage: (requestId: string) => OutboundMessage): Promise<T> {
        if (this.permanentFailure) {
            throw this.permanentFailure;
        }

        await this.ensureStarted();

        const requestId = crypto.randomUUID();
        const responsePromise = new Promise<InboundMessage>((resolve, reject) => {
            this.pending.set(requestId, { resolve, reject });
        });

        this.send(buildMessage(requestId));

        return (await responsePromise) as T;
    }

    dispose(): void {
        this.disposed = true;

        if (this.socket) {
            this.send({ type: 'shutdown' });
        }

        const child = this.child;
        setTimeout(() => {
            if (child && !child.killed) {
                child.kill();
            }
        }, 2000);

        this.socket?.destroy();
        this.rejectAllPending(new Error('Designer host disposed.'));
    }

    private async ensureStarted(): Promise<void> {
        if (!this.starting) {
            this.starting = this.start().catch(error => {
                this.starting = undefined;
                this.registerFailure(error instanceof Error ? error : new Error(String(error)));
                throw this.permanentFailure ?? error;
            });
        }
        await this.starting;
    }

    private async start(): Promise<void> {
        await this.checkDesktopRuntime();

        const pipeName = `dotnet-studio-designer-${crypto.randomUUID()}`;
        const pipePath = `\\\\.\\pipe\\${pipeName}`;
        const exePath = this.context.asAbsolutePath(path.join('dist', 'designer-host', `win-${this.platform}`, 'DesignerHost.exe'));

        const child = cp.spawn(exePath, ['--pipe', pipeName], { stdio: ['ignore', 'pipe', 'pipe'] });
        this.child = child;
        child.stderr?.on('data', (chunk: Buffer) => console.error(`[DesignerHost] ${chunk.toString('utf8')}`));
        child.on('exit', () => this.handleUnexpectedExit());

        const socket = await this.connectWithRetry(pipePath);
        this.socket = socket;
        this.buffer = '';

        const readyPromise = new Promise<void>(resolve => {
            this.readyResolve = resolve;
        });

        socket.on('data', (chunk: Buffer) => this.handleData(chunk));
        socket.on('close', () => this.handleUnexpectedExit());
        socket.on('error', () => { /* handled via 'close' */ });

        await readyPromise;
        this.restartAttempts = 0;
    }

    private connectWithRetry(pipePath: string): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            let attempt = 0;

            const tryConnect = () => {
                attempt++;
                const socket = net.connect(pipePath);

                const onError = (error: Error) => {
                    socket.removeAllListeners();
                    socket.destroy();
                    if (attempt >= CONNECT_MAX_ATTEMPTS) {
                        reject(error);
                    } else {
                        setTimeout(tryConnect, CONNECT_RETRY_DELAY_MS);
                    }
                };

                socket.once('error', onError);
                socket.once('connect', () => {
                    socket.removeListener('error', onError);
                    resolve(socket);
                });
            };

            tryConnect();
        });
    }

    private async checkDesktopRuntime(): Promise<void> {
        let output: string;
        try {
            output = await runDotnet(['--list-runtimes']);
        } catch (error: any) {
            throw new Error(`Could not verify the .NET runtime (is "dotnet" on PATH?): ${error.message}`);
        }

        if (!output.includes('Microsoft.WindowsDesktop.App')) {
            throw new Error(
                'The .NET Desktop Runtime is required for the XAML designer preview but was not found. ' +
                'Install it from https://dotnet.microsoft.com/download/dotnet and reload the window.'
            );
        }
    }

    private handleData(chunk: Buffer): void {
        this.buffer += chunk.toString('utf8');

        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);
            if (!line) { continue; }

            try {
                this.handleMessage(JSON.parse(line) as InboundMessage);
            } catch {
                // Malformed line - ignore rather than take down the client over one bad frame.
            }
        }
    }

    private handleMessage(message: InboundMessage): void {
        switch (message.type) {
            case 'ready':
                this.readyResolve?.();
                break;
            case 'frame':
            case 'selection':
            case 'transformResult': {
                this.pending.get(message.requestId)?.resolve(message);
                this.pending.delete(message.requestId);
                break;
            }
            case 'error': {
                this.pending.get(message.requestId)?.reject(new Error(message.message));
                this.pending.delete(message.requestId);
                break;
            }
        }
    }

    private handleUnexpectedExit(): void {
        if (this.disposed || (!this.child && !this.socket)) { return; }

        this.registerFailure(new Error('The XAML designer helper process exited unexpectedly.'));
        this.starting = undefined;
        this.rejectAllPending(
            this.permanentFailure ??
            new Error('The XAML designer helper process exited unexpectedly; it will be restarted on the next request.')
        );
    }

    private registerFailure(error: Error): void {
        this.child = undefined;
        this.socket = undefined;

        if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
            this.permanentFailure = new Error(
                `The XAML designer helper process failed repeatedly and will not be restarted (${error.message}). ` +
                'Reload the window to try again.'
            );
        } else {
            this.restartAttempts++;
        }
    }

    private send(message: OutboundMessage): void {
        this.socket?.write(JSON.stringify(message) + '\n');
    }

    private rejectAllPending(error: Error): void {
        for (const { reject } of this.pending.values()) {
            reject(error);
        }
        this.pending.clear();
    }
}
