import * as vscode from 'vscode';
import * as path from 'path';
import { peekPickedCsprojFile, onDidChangePickedCsproj } from '../utils/projectPicker';
import { getActiveWorkspaceFolder, onDidChangeActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';

/**
 * Middle of the three .NET status bar segments (Solution › Project ›
 * Configuration). Solution name no longer appears here - it has its own
 * segment. Clicking it opens the combined Run/Build/Rebuild/Clean +
 * project-picker menu (dotnet-creator.showProjectMenu), not the raw picker
 * directly - see commands/statusBarMenus.ts.
 */
export function registerProjectStatusBarItem(context: vscode.ExtensionContext): void {
    const item = vscode.window.createStatusBarItem('dotnet-creator.projectStatus', vscode.StatusBarAlignment.Left, 4);
    item.name = '.NET: Project';
    item.command = 'dotnet-creator.showProjectMenu';

    const refresh = () => updateStatusBarItem(item);

    context.subscriptions.push(item, onDidChangePickedCsproj(refresh), onDidChangeActiveWorkspaceFolder(refresh));

    refresh();
    item.show();
}

function updateStatusBarItem(item: vscode.StatusBarItem): void {
    const folder = getActiveWorkspaceFolder();
    const picked = folder ? peekPickedCsprojFile(folder) : undefined;

    if (!picked) {
        item.text = '$(project) Select Project';
        item.tooltip = 'Click to choose a project, or run/build/rebuild/clean it.';
        return;
    }

    const projectName = path.basename(picked, path.extname(picked));
    item.text = `$(project) Project: ${projectName}`;
    item.tooltip = `Project: ${picked}\nClick for actions or to change.`;
}
