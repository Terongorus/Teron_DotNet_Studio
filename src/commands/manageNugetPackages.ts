import * as vscode from 'vscode';
import { getPickedCsprojFile } from '../utils/projectPicker';
import { showNugetManager } from '../nugetManager/nugetManagerPanel';

export function registerManageNugetPackagesCommand(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('dotnet-creator.manageNugetPackages', () => manageNugetPackages(context));
    context.subscriptions.push(disposable);
}

export async function manageNugetPackages(context: vscode.ExtensionContext, projectPath?: string): Promise<void> {
    const resolvedPath = projectPath ?? await getPickedCsprojFile(context);
    if (!resolvedPath) { return; }

    showNugetManager(context, resolvedPath);
}
