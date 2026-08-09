import * as vscode from 'vscode';
import { SharpLspClientManager } from '../languageServer/sharpLspClient';
import { ResourceMonitorProvider } from '../resourceMonitor/resourceMonitorProvider';
import { onDidChangePid } from '../utils/debugSessionTracker';
import {
    PROFILER_START_TRACE,
    PROFILER_STOP_TRACE,
    StartTraceResult,
    StopTraceResult,
    TraceProfile
} from '../languageServer/profilerProtocol';

const TRACING_CONTEXT_KEY = 'dotnet-creator.resourceMonitor.tracing';

interface ActiveTrace {
    sessionId: string;
    profile: TraceProfile;
    outputPath: string;
}

let activeTrace: ActiveTrace | undefined;

export function registerProfilerCommands(context: vscode.ExtensionContext, sharpLsp: SharpLspClientManager, resourceMonitor: ResourceMonitorProvider): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.profiler.startTrace', () => startTrace(sharpLsp, resourceMonitor)),
        vscode.commands.registerCommand('dotnet-creator.profiler.stopTrace', () => stopTrace(sharpLsp)),
        resourceMonitor.onDidResolveView(() => resourceMonitor.postTracingState(!!activeTrace, activeTrace?.profile)),
        onDidChangePid(() => {
            if (activeTrace) { void stopTrace(sharpLsp, 'the debug session changed'); }
        }),
        sharpLsp.onDidChangeStatus(status => {
            if (activeTrace && status !== 'Running') { forceResetTrace(resourceMonitor, 'SharpLsp stopped'); }
        })
    );
}

async function startTrace(sharpLsp: SharpLspClientManager, resourceMonitor: ResourceMonitorProvider): Promise<void> {
    if (sharpLsp.getStatus() !== 'Running') {
        vscode.window.showErrorMessage('SharpLsp is not running. Open a C#/F# file, or use the status bar, to start it.');
        return;
    }

    const pid = resourceMonitor.getCurrentPid();
    if (pid === undefined) {
        vscode.window.showErrorMessage('Start debugging a .NET project first.');
        return;
    }

    type ProfilePick = vscode.QuickPickItem & { profile: TraceProfile };
    const picked = await vscode.window.showQuickPick<ProfilePick>(
        [
            { label: '$(pulse) CPU', description: 'Sampling profiler', profile: 'cpu-sampling' },
            { label: '$(database) Memory / GC', description: 'GC-verbose (allocations, collections)', profile: 'gc-verbose' }
        ],
        { title: 'Start Trace Recording' }
    );
    if (!picked) { return; }

    try {
        const result = await sharpLsp.sendRequest<StartTraceResult>(PROFILER_START_TRACE, { pid, profile: picked.profile, duration: 0 });
        activeTrace = { sessionId: result.session_id, profile: picked.profile, outputPath: result.output_path };
        await vscode.commands.executeCommand('setContext', TRACING_CONTEXT_KEY, true);
        resourceMonitor.postTracingState(true, picked.profile);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start trace recording: ${(error as Error).message}`);
    }
}

async function stopTrace(sharpLsp: SharpLspClientManager, reason?: string): Promise<void> {
    if (!activeTrace) { return; }
    const sessionId = activeTrace.sessionId;
    activeTrace = undefined;
    await vscode.commands.executeCommand('setContext', TRACING_CONTEXT_KEY, false);

    try {
        const result = await sharpLsp.sendRequest<StopTraceResult>(PROFILER_STOP_TRACE, { session_id: sessionId });
        const sizeKb = (result.file_size_bytes / 1024).toFixed(1);
        const durationSec = (result.duration_ms / 1000).toFixed(1);
        const suffix = reason ? ` (stopped automatically - ${reason})` : '';
        const choice = await vscode.window.showInformationMessage(
            `Trace recorded: ${result.output_path} (${sizeKb} KB, ${durationSec}s)${suffix}.`,
            'Reveal in File Explorer'
        );
        if (choice === 'Reveal in File Explorer') {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.output_path));
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to stop trace recording: ${(error as Error).message}`);
    }
}

/** Used when a clean stopTrace RPC isn't possible (SharpLsp itself just dropped out of Running) - resets local/UI state and warns using the output path already known from startTrace's result. */
function forceResetTrace(resourceMonitor: ResourceMonitorProvider, reason: string): void {
    if (!activeTrace) { return; }
    const outputPath = activeTrace.outputPath;
    activeTrace = undefined;
    void vscode.commands.executeCommand('setContext', TRACING_CONTEXT_KEY, false);
    resourceMonitor.postTracingState(false);
    void vscode.window.showWarningMessage(
        `${reason} while a trace recording was in progress. The file may be incomplete: ${outputPath}`
    );
}
