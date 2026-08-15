import * as vscode from 'vscode';
import { getPickedCsprojFile } from '../utils/projectPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { showPublishPanel } from '../publish/publishPanel';

export function registerPublishProjectCommand(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('dotnet-studio.publishProject', () => publishProjectCommand(context));
    context.subscriptions.push(disposable);
}

export async function publishProjectCommand(context: vscode.ExtensionContext, projectPath?: string): Promise<void> {
    let resolvedPath = projectPath;
    if (!resolvedPath) {
        const folder = getActiveWorkspaceFolder();
        if (!folder) { return; }
        resolvedPath = await getPickedCsprojFile(folder);
    }
    if (!resolvedPath) { return; }

    showPublishPanel(context, resolvedPath);
}
