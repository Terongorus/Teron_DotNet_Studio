import * as vscode from 'vscode';
import * as path from 'path';
import { peekCurrentSolution, onDidChangeCurrentSolution } from '../utils/currentSolution';
import { getActiveWorkspaceFolder, onDidChangeActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { applyOpenedVisibility } from '../utils/projectOpened';

/**
 * First (leftmost within the right-aligned group) of the three .NET status
 * bar segments (Solution › Project › Configuration, priorities 101/100/99) -
 * carries the ".NET:" prefix so the group reads as one widget belonging to
 * this extension rather than three unrelated items (VS Code has no API to
 * visually fuse multiple StatusBarItems into one "pill").
 */
export function registerSolutionStatusBarItem(context: vscode.ExtensionContext): void {
    const item = vscode.window.createStatusBarItem('dotnet-studio.solutionStatus', vscode.StatusBarAlignment.Left, 5);
    item.name = '.NET: Solution';
    item.command = 'dotnet-studio.showSolutionMenu';

    const refresh = () => {
        updateStatusBarItem(item);
        applyOpenedVisibility(item, getActiveWorkspaceFolder());
    };

    context.subscriptions.push(item, onDidChangeCurrentSolution(refresh), onDidChangeActiveWorkspaceFolder(refresh));

    refresh();
}

function updateStatusBarItem(item: vscode.StatusBarItem): void {
    const folder = getActiveWorkspaceFolder();
    const solutionPath = folder ? peekCurrentSolution(folder) : undefined;

    if (!solutionPath) {
        item.text = '$(folder-library) .NET: Select Solution';
        item.tooltip = 'Click to choose a solution, or build/rebuild/clean it.';
        return;
    }

    const solutionName = path.basename(solutionPath, path.extname(solutionPath));
    item.text = `$(folder-library) Solution: ${solutionName}`;
    item.tooltip = `Solution: ${solutionPath}\nClick for actions or to change.`;
}
