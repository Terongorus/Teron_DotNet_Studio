import * as vscode from 'vscode';
import { onDidChangePid } from '../utils/debugSessionTracker';
import { startPolling, ProcessStats } from '../utils/processStats';
import { getResourceMonitorHtml } from './resourceMonitorHtml';

const VIEW_TYPE = 'dotnet-creator.resourceMonitorView';

/**
 * Read-only telemetry only - no buttons, no onDidReceiveMessage. VS Code's
 * own floating debug toolbar already covers step/continue/restart/stop, so
 * duplicating that here would be pure "reinventing the wheel" (decided
 * during plan review).
 */
class ResourceMonitorProvider implements vscode.WebviewViewProvider {
    private webviewView: vscode.WebviewView | undefined;
    private pidChangeSubscription: vscode.Disposable | undefined;
    private pollingSubscription: vscode.Disposable | undefined;
    private currentPid: number | undefined;
    private lastStats: ProcessStats | undefined;

    constructor(private readonly context: vscode.ExtensionContext) { }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getResourceMonitorHtml(webviewView.webview);
        this.postStats(this.lastStats);

        if (!this.pidChangeSubscription) {
            this.pidChangeSubscription = onDidChangePid(tracked => {
                this.currentPid = tracked?.pid;
                this.lastStats = undefined;
                this.postStats(undefined);
                this.refreshPolling();
            });
            this.context.subscriptions.push(this.pidChangeSubscription);
        }

        webviewView.onDidChangeVisibility(() => this.refreshPolling());
        webviewView.onDidDispose(() => {
            this.pollingSubscription?.dispose();
            this.pollingSubscription = undefined;
            this.webviewView = undefined;
        });

        this.refreshPolling();
    }

    /** Polling only runs while the view is visible and a pid is tracked - re-evaluated on every visibility or pid change. */
    private refreshPolling(): void {
        this.pollingSubscription?.dispose();
        this.pollingSubscription = undefined;

        if (!this.webviewView?.visible || this.currentPid === undefined) {
            return;
        }

        this.pollingSubscription = startPolling(this.currentPid, stats => {
            this.lastStats = stats;
            this.postStats(stats);
        });
    }

    private postStats(stats: ProcessStats | undefined): void {
        void this.webviewView?.webview.postMessage({ command: 'stats', stats });
    }
}

export function registerResourceMonitorPanel(context: vscode.ExtensionContext): void {
    const provider = new ResourceMonitorProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider));
}
