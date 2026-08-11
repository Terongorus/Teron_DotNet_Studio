import * as vscode from 'vscode';
import { SharpLspClientManager } from '../languageServer/sharpLspClient';
import { ResourceMonitorProvider } from '../resourceMonitor/resourceMonitorProvider';
import { onDidChangePid } from '../utils/debugSessionTracker';
import { getSharpLspOutputChannel } from '../languageServer/sharpLspNotifications';
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
        // Trace recording drives SharpLsp's own profiler protocol extension specifically - Roslyn
        // doesn't implement it, so this is needed even when Roslyn is the selected language
        // server. "Open a C#/F# file" used to be suggested here, but that's a dead end whenever
        // Roslyn is selected: the auto-start gate in extension.ts only starts SharpLsp when it's
        // the *selected* server, so opening a file does nothing, and SharpLsp's own status bar
        // item never even appears (it only shows once SharpLsp's status changes for the first
        // time). Starting it directly here runs it alongside whichever language server is
        // currently selected - it's only used for its profiler capability, not as your C#
        // language server.
        const choice = await vscode.window.showErrorMessage(
            'Trace recording requires SharpLsp specifically (a capability Roslyn doesn\'t implement), and it isn\'t running.',
            'Start SharpLsp'
        );
        if (choice === 'Start SharpLsp') { await sharpLsp.ensureStarted(); }
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

    // Client-side shape verified against SharpLsp's own real Rust source (trace.rs's
    // StartTraceParams, at the exact tag matching an installed 0.18.0 sidecar) - pid/profile/
    // duration all match field-for-field. If "invalid type: map, expected u32" recurs, this dump
    // (our own pre-spawn diagnostics channel, not the server's own LSP log) shows exactly what we
    // sent, cross-reference against SharpLsp's own log (log_path in its startup line) to find
    // whichever layer is actually transforming it before the server sees it.
    const requestParams = { pid, profile: picked.profile, duration: 0 };
    getSharpLspOutputChannel().appendLine(`[profiler] ${PROFILER_START_TRACE} request: ${JSON.stringify(requestParams)}`);

    try {
        const result = await sharpLsp.sendRequest<StartTraceResult>(PROFILER_START_TRACE, requestParams);
        activeTrace = { sessionId: result.session_id, profile: picked.profile, outputPath: result.output_path };
        await vscode.commands.executeCommand('setContext', TRACING_CONTEXT_KEY, true);
        resourceMonitor.postTracingState(true, picked.profile);
    } catch (error) {
        getSharpLspOutputChannel().appendLine(`[profiler] ${PROFILER_START_TRACE} error: ${JSON.stringify(error)}`);
        void vscode.window.showErrorMessage(`Failed to start trace recording: ${(error as Error).message}`, 'Show Output')
            .then(choice => { if (choice === 'Show Output') { getSharpLspOutputChannel().show(); } });
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
