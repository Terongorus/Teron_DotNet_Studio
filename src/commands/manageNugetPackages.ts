import * as vscode from 'vscode';
import { getPickedCsprojFile } from '../utils/projectPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { showNugetManager } from '../nugetManager/nugetManagerPanel';

export function registerManageNugetPackagesCommand(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('dotnet-creator.manageNugetPackages', () => manageNugetPackages(context));
    context.subscriptions.push(disposable);
}

export async function manageNugetPackages(context: vscode.ExtensionContext, projectPath?: string): Promise<void> {
    let resolvedPath = projectPath;
    if (!resolvedPath) {
        const folder = getActiveWorkspaceFolder();
        if (!folder) { return; }
        resolvedPath = await getPickedCsprojFile(folder);
    }
    if (!resolvedPath) { return; }

    showNugetManager(context, resolvedPath);
}
