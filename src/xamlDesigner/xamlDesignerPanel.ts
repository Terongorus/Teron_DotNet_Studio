import * as vscode from 'vscode';
import * as path from 'path';
import { DesignerHostClient } from './designerHostClient';
import { getXamlDesignerHtml } from './xamlDesignerHtml';
import { Bounds, TransformKind } from './designerHostProtocol';
import { findProjectAssembly, findAppXamlText, detectAssemblyPlatform, HelperPlatform } from '../utils/projectAssemblyResolver';

// One helper process per bitness - a helper process can only load assemblies
// matching its own architecture, and different open projects may target
// different platforms (e.g. an x86 app and an AnyCPU/x64 one) in the same
// VS Code session. Multiple panels of the same platform share one process -
// see designer-host/RenderHost.cs's per-file DocumentState for how that stays
// correct once a process is also asked to track selection/commit state.
const sharedClients = new Map<HelperPlatform, DesignerHostClient>();
const panels = new Map<string, vscode.WebviewPanel>();
let saveListenerRegistered = false;

function getClient(context: vscode.ExtensionContext, platform: HelperPlatform): DesignerHostClient {
    let client = sharedClients.get(platform);
    if (!client) {
        client = new DesignerHostClient(context, platform);
        sharedClients.set(platform, client);
    }
    return client;
}

function resolvePlatformForAssembly(assemblyPath: string | undefined): HelperPlatform {
    return assemblyPath ? detectAssemblyPlatform(assemblyPath) : 'x64';
}

/**
 * Called from extension.ts's deactivate() - the helper processes have no
 * other way to know the extension host is shutting down.
 */
export function disposeDesignerHost(): void {
    for (const client of sharedClients.values()) {
        client.dispose();
    }
    sharedClients.clear();
}

function normalize(uri: vscode.Uri): string {
    return uri.fsPath.toLowerCase();
}

export function showXamlDesigner(context: vscode.ExtensionContext, uri: vscode.Uri): void {
    const key = normalize(uri);
    const existing = panels.get(key);

    if (existing) {
        existing.reveal(vscode.ViewColumn.Beside);
        void renderInto(context, existing, uri);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'dotnetCreator.xamlDesigner',
        `Preview: ${path.basename(uri.fsPath)}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    panel.webview.html = getXamlDesignerHtml(panel.webview);

    panel.onDidDispose(() => {
        panels.delete(key);
    });

    // uri is captured by closure rather than looked up per-message - the panel's own
    // messages are always about the one file it was created for, for its entire lifetime.
    panel.webview.onDidReceiveMessage(message => void handleWebviewMessage(context, panel, uri, message));

    panels.set(key, panel);
    ensureSaveListener(context);

    void renderInto(context, panel, uri);
}

/**
 * Registered once (not per-panel) and dispatches to whichever open panel
 * matches the saved document - the file being edited/re-saved is the trigger
 * for a live-updating preview.
 */
function ensureSaveListener(context: vscode.ExtensionContext): void {
    if (saveListenerRegistered) { return; }
    saveListenerRegistered = true;

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
        const panel = panels.get(normalize(document.uri));
        if (panel) {
            void renderInto(context, panel, document.uri);
        }
    }));
}

async function renderInto(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, uri: vscode.Uri): Promise<void> {
    panel.webview.postMessage({ command: 'loading' });

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const assemblyPath = findProjectAssembly(uri.fsPath);
        const appXamlText = findAppXamlText(uri.fsPath);
        const platform = resolvePlatformForAssembly(assemblyPath);
        const frame = await getClient(context, platform).loadXaml(document.getText(), uri.fsPath, assemblyPath, appXamlText);
        panel.webview.postMessage({ command: 'frame', dataUrl: `data:image/png;base64,${frame.pngBase64}` });
    } catch (error: any) {
        panel.webview.postMessage({ command: 'error', message: error.message ?? String(error) });
    }
}

interface WebviewMessage {
    command: string;
    x?: number;
    y?: number;
    path?: string;
    kind?: TransformKind;
    bounds?: Bounds;
}

async function handleWebviewMessage(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, uri: vscode.Uri, message: WebviewMessage): Promise<void> {
    switch (message.command) {
        case 'selectAt':
            await handleSelectAt(context, panel, uri, message.x!, message.y!);
            break;
        case 'commitTransform':
            await handleCommitTransform(context, panel, uri, message.path!, message.kind!, message.bounds!);
            break;
    }
}

async function handleSelectAt(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, uri: vscode.Uri, x: number, y: number): Promise<void> {
    try {
        const platform = resolvePlatformForAssembly(findProjectAssembly(uri.fsPath));
        const selection = await getClient(context, platform).selectAt(uri.fsPath, x, y);
        panel.webview.postMessage({ command: 'selection', path: selection?.path, bounds: selection?.bounds });
    } catch {
        // A failed lookup just means "nothing selected" from the webview's perspective -
        // not worth an error banner over what's ultimately a hover/click gesture.
        panel.webview.postMessage({ command: 'selection', path: undefined, bounds: undefined });
    }
}

async function handleCommitTransform(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, uri: vscode.Uri, elementPath: string, kind: TransformKind, bounds: Bounds): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);

    // The helper's pristine document reflects the file as of the last render (on open or
    // save), not unsaved edits sitting in this buffer - committing against a dirty
    // document would silently discard whatever hasn't been saved yet. Rejected here,
    // before the helper is ever asked to do anything, rather than after.
    if (document.isDirty) {
        panel.webview.postMessage({
            command: 'commitRejected',
            message: 'Save your changes first - dragging while the file has unsaved edits would discard them.'
        });
        return;
    }

    try {
        const platform = resolvePlatformForAssembly(findProjectAssembly(uri.fsPath));
        const result = await getClient(context, platform).commitTransform(uri.fsPath, elementPath, kind, bounds);

        // The helper only ever computed the new text in its own memory - never touched the
        // real file. Applied here through VS Code's document API (never a raw fs write) so
        // other extensions watching this file (e.g. a C# language server) see the edit, and
        // so it lands as one Ctrl+Z-able undo step. applyEdit alone doesn't trigger
        // onDidSaveTextDocument, so this can't loop back into another render via the save
        // listener above.
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        edit.replace(uri, fullRange, result.xamlText);
        await vscode.workspace.applyEdit(edit);

        panel.webview.postMessage({ command: 'frame', dataUrl: `data:image/png;base64,${result.pngBase64}` });
    } catch (error: any) {
        panel.webview.postMessage({ command: 'commitRejected', message: error.message ?? String(error) });
    }
}
