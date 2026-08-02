import * as vscode from 'vscode';
import * as path from 'path';
import { DesignerHostClient } from './designerHostClient';
import { getXamlDesignerHtml } from './xamlDesignerHtml';
import { findProjectAssembly, findAppXamlText, detectAssemblyPlatform, HelperPlatform } from './projectAssemblyResolver';

// One helper process per bitness - a helper process can only load assemblies
// matching its own architecture, and different open projects may target
// different platforms (e.g. an x86 app and an AnyCPU/x64 one) in the same
// VS Code session.
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
        const platform = assemblyPath ? detectAssemblyPlatform(assemblyPath) : 'x64';
        const frame = await getClient(context, platform).loadXaml(document.getText(), uri.fsPath, assemblyPath, appXamlText);
        panel.webview.postMessage({ command: 'frame', dataUrl: `data:image/png;base64,${frame.pngBase64}` });
    } catch (error: any) {
        panel.webview.postMessage({ command: 'error', message: error.message ?? String(error) });
    }
}
