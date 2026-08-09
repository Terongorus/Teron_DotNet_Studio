import * as vscode from 'vscode';

export interface TrackedDebugProcess {
    sessionId: string;
    pid: number;
}

interface DapEvent {
    type: string;
    event?: string;
    body?: { systemProcessId?: number };
}

const _onDidChangePid = new vscode.EventEmitter<TrackedDebugProcess | undefined>();
export const onDidChangePid = _onDidChangePid.event;

/**
 * Watches DAP traffic for sessions of type 'dotnet' (this extension's only
 * debug type - see runProject in commands/buildActions.ts) to recover the
 * debuggee's real OS process id from the standard DAP 'process' event. Any
 * fresh 'process' event re-fires with the new pid, which covers both
 * terminate+relaunch and in-place restart without needing to know which one
 * the underlying debug adapter (vsdbg) uses for a given session.
 */
export function registerDebugSessionTracker(context: vscode.ExtensionContext): void {
    const disposable = vscode.debug.registerDebugAdapterTrackerFactory('dotnet', {
        createDebugAdapterTracker(session: vscode.DebugSession) {
            return {
                onDidSendMessage(message: DapEvent) {
                    if (message.type === 'event' && message.event === 'process') {
                        const pid = message.body?.systemProcessId;
                        if (typeof pid === 'number') {
                            _onDidChangePid.fire({ sessionId: session.id, pid });
                        }
                    }
                },
                onWillStopSession() {
                    _onDidChangePid.fire(undefined);
                }
            };
        }
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(() => {
        _onDidChangePid.fire(undefined);
    }));
}
