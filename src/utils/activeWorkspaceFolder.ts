import * as vscode from 'vscode';

let current: vscode.WorkspaceFolder | undefined;

const _onDidChangeActiveWorkspaceFolder = new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>();
export const onDidChangeActiveWorkspaceFolder = _onDidChangeActiveWorkspaceFolder.event;

/** The workspace folder owning the active editor's document, falling back to the first open folder. */
function resolve(): vscode.WorkspaceFolder | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const owningFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;
    return owningFolder ?? vscode.workspace.workspaceFolders?.[0];
}

function refresh(): void {
    const next = resolve();
    const changed = next?.uri.toString() !== current?.uri.toString();
    current = next;
    if (changed) {
        _onDidChangeActiveWorkspaceFolder.fire(current);
    }
}

export function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return current;
}

export function registerActiveWorkspaceFolderTracker(context: vscode.ExtensionContext): void {
    refresh();
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(refresh),
        vscode.workspace.onDidChangeWorkspaceFolders(refresh)
    );
}
