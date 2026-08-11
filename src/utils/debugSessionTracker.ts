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
 * Watches DAP traffic for sessions of type 'dotnet-creator-debug' (this extension's own
 * netcoredbg-backed debug adapter - see extension.ts's registerDebugAdapterDescriptorFactory and
 * runProject in commands/buildActions.ts) to recover the debuggee's real OS process id from the
 * standard DAP 'process' event. Any fresh 'process' event re-fires with the new pid, which covers
 * both terminate+relaunch and in-place restart without needing to know which one the underlying
 * debug adapter (netcoredbg) uses for a given session.
 *
 * Previously registered for type 'dotnet' - VS Code's own *built-in* debug type, contributed by
 * Microsoft's C# extension/C# Dev Kit, which this project deliberately doesn't depend on (see
 * debugTaskDefinitions.ts's own comment on this exact distinction). Since nothing in this
 * extension ever starts a session of that type, this tracker's DAP hook never fired for a real
 * debug session at all - onDidChangePid never delivered a real pid, so Resource Monitor's PID-
 * gated features (live counters, trace recording) never worked regardless of which language
 * server was selected. Found from a real user screenshot: an actual, successful debug session
 * running, Resource Monitor still showing "No active .NET debug session."
 */
export function registerDebugSessionTracker(context: vscode.ExtensionContext): void {
    const disposable = vscode.debug.registerDebugAdapterTrackerFactory('dotnet-creator-debug', {
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
