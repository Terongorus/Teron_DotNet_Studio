import * as vscode from 'vscode';
import { onDidChangePid } from '../utils/debugSessionTracker';
import { startPolling, ProcessStats, MAX_SAMPLES } from '../utils/processStats';
import { getResourceMonitorHtml } from './resourceMonitorHtml';
import { SharpLspClientManager, SharpLspStatus } from '../languageServer/sharpLspClient';
import {
    PROFILER_START_COUNTERS,
    PROFILER_STOP_COUNTERS,
    PROFILER_COUNTER_UPDATE,
    StartCountersResult,
    CounterUpdateParams,
    CounterValue
} from '../languageServer/profilerProtocol';

const VIEW_TYPE = 'dotnet-studio.resourceMonitorView';

/**
 * OS-level CPU/memory telemetry is read-only with no buttons - VS Code's own floating debug
 * toolbar already covers step/continue/restart/stop, so duplicating that here would be pure
 * "reinventing the wheel" (decided during plan review). The one deliberate exception is the
 * SharpLsp-backed "Runtime Counters" section's own "Start SharpLsp" button - a single, narrow
 * onDidReceiveMessage handler for that one click, not a general webview-driven action surface.
 */
export class ResourceMonitorProvider implements vscode.WebviewViewProvider {
    private webviewView: vscode.WebviewView | undefined;
    private pidChangeSubscription: vscode.Disposable | undefined;
    private pollingSubscription: vscode.Disposable | undefined;
    private currentPid: number | undefined;
    private sampleHistory: ProcessStats[] = [];

    private counterSessionId: string | undefined;
    private counterGeneration = 0;

    private readonly _onDidResolveView = new vscode.EventEmitter<void>();
    readonly onDidResolveView = this._onDidResolveView.event;

    constructor(private readonly context: vscode.ExtensionContext, private readonly sharpLsp: SharpLspClientManager) {
        this.sharpLsp.onDidChangeStatus(status => {
            this.postSharpLspStatus(status);
            this.refreshCounters();
        });
        this.sharpLsp.onNotification<CounterUpdateParams>(PROFILER_COUNTER_UPDATE, params => {
            if (params.session_id === this.counterSessionId) {
                this.postCounters(params.counters);
            }
        });
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getResourceMonitorHtml(webviewView.webview);
        this.postHistory();
        this.postSharpLspStatus(this.sharpLsp.getStatus());

        if (!this.pidChangeSubscription) {
            this.pidChangeSubscription = onDidChangePid(tracked => {
                this.currentPid = tracked?.pid;
                this.sampleHistory = [];
                this.postHistory();
                this.refreshPolling();
                this.refreshCounters();
            });
            this.context.subscriptions.push(this.pidChangeSubscription);
        }

        webviewView.webview.onDidReceiveMessage(message => {
            if (message?.command === 'startSharpLsp') {
                void this.sharpLsp.ensureStarted();
            }
        });

        webviewView.onDidChangeVisibility(() => {
            this.refreshPolling();
            this.refreshCounters();
        });
        webviewView.onDidDispose(() => {
            this.pollingSubscription?.dispose();
            this.pollingSubscription = undefined;
            this.webviewView = undefined;
            void this.stopCounterSession();
        });

        this.refreshPolling();
        this.refreshCounters();
        this._onDidResolveView.fire();
    }

    /** The debug session's tracked pid, if any - used by profilerCommands.ts to target trace recording. */
    getCurrentPid(): number | undefined {
        return this.currentPid;
    }

    /** Replays whether a trace recording is currently active, for profilerCommands.ts to call on every resolve (the webview's own state is torn down whenever hidden). */
    postTracingState(active: boolean, profile?: string): void {
        void this.webviewView?.webview.postMessage({ command: 'tracing', active, profile });
    }

    /** Polling only runs while the view is visible and a pid is tracked - re-evaluated on every visibility or pid change. */
    private refreshPolling(): void {
        this.pollingSubscription?.dispose();
        this.pollingSubscription = undefined;

        if (!this.webviewView?.visible || this.currentPid === undefined) {
            return;
        }

        this.pollingSubscription = startPolling(this.currentPid, stats => {
            if (!stats) {
                this.sampleHistory = [];
                void this.webviewView?.webview.postMessage({ command: 'sample', stats: undefined });
                return;
            }

            this.sampleHistory = [...this.sampleHistory, stats].slice(-MAX_SAMPLES);
            void this.webviewView?.webview.postMessage({ command: 'sample', stats });
        });
    }

    /**
     * Mirrors refreshPolling()'s gate, plus a Running-status check - re-evaluated on every
     * visibility, pid, or SharpLsp status change (i.e. every input that can flip "should a
     * counters session exist right now"). Never calls ensureStarted() itself - "nothing runs
     * without consent" applies here too; the webview's own "Start SharpLsp" button is the only
     * thing that does that, on an explicit click.
     */
    private refreshCounters(): void {
        const generation = ++this.counterGeneration;
        void this.stopCounterSession();

        const shouldRun = !!this.webviewView?.visible && this.currentPid !== undefined && this.sharpLsp.getStatus() === 'Running';
        if (!shouldRun) {
            this.postCounters([]);
            return;
        }

        const pid = this.currentPid!;
        this.sharpLsp.sendRequest<StartCountersResult>(PROFILER_START_COUNTERS, { pid })
            .then(result => {
                if (generation !== this.counterGeneration) {
                    // Superseded while awaiting (pid/visibility/status changed again mid-flight) -
                    // don't adopt a session nobody asked for anymore.
                    void this.sharpLsp.sendRequest(PROFILER_STOP_COUNTERS, { session_id: result.session_id }).catch(() => { /* best-effort */ });
                    return;
                }
                this.counterSessionId = result.session_id;
            })
            .catch(() => { /* not Running, tool missing, session-limit error - the gating message already told the user */ });
    }

    private async stopCounterSession(): Promise<void> {
        const sessionId = this.counterSessionId;
        this.counterSessionId = undefined;
        if (sessionId) {
            try { await this.sharpLsp.sendRequest(PROFILER_STOP_COUNTERS, { session_id: sessionId }); } catch { /* best-effort, matches stopClient()'s style */ }
        }
    }

    private postCounters(counters: CounterValue[]): void {
        void this.webviewView?.webview.postMessage({ command: 'counters', counters });
    }

    private postSharpLspStatus(status: SharpLspStatus): void {
        void this.webviewView?.webview.postMessage({ command: 'sharpLspStatus', status });
    }

    /** Replays the full rolling buffer in one message - used on resolve (the webview's own DOM/JS is torn down whenever hidden, since retainContextWhenHidden is false) and on every pid change. */
    private postHistory(): void {
        void this.webviewView?.webview.postMessage({ command: 'history', samples: this.sampleHistory });
    }
}

export function registerResourceMonitorPanel(context: vscode.ExtensionContext, sharpLsp: SharpLspClientManager): ResourceMonitorProvider {
    const provider = new ResourceMonitorProvider(context, sharpLsp);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider));
    return provider;
}
