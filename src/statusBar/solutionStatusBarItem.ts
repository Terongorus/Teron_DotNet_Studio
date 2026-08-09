import * as vscode from 'vscode';
import * as path from 'path';
import { peekCurrentSolution, onDidChangeCurrentSolution } from '../utils/currentSolution';

/**
 * First (leftmost within the right-aligned group) of the three .NET status
 * bar segments (Solution › Project › Configuration, priorities 101/100/99) -
 * carries the ".NET:" prefix so the group reads as one widget belonging to
 * this extension rather than three unrelated items (VS Code has no API to
 * visually fuse multiple StatusBarItems into one "pill").
 */
export function registerSolutionStatusBarItem(context: vscode.ExtensionContext): void {
    const item = vscode.window.createStatusBarItem('dotnet-creator.solutionStatus', vscode.StatusBarAlignment.Right, 101);
    item.name = '.NET: Solution';
    item.command = 'dotnet-creator.showSolutionMenu';

    const refresh = () => updateStatusBarItem(context, item);

    context.subscriptions.push(item, onDidChangeCurrentSolution(refresh));

    refresh();
    item.show();
}

function updateStatusBarItem(context: vscode.ExtensionContext, item: vscode.StatusBarItem): void {
    const solutionPath = peekCurrentSolution(context);

    if (!solutionPath) {
        item.text = '$(folder-library) .NET: Select Solution';
        item.tooltip = 'Click to choose a solution, or build/rebuild/clean it.';
        return;
    }

    const solutionName = path.basename(solutionPath, path.extname(solutionPath));
    item.text = `$(folder-library) Solution: ${solutionName}`;
    item.tooltip = `Solution: ${solutionPath}\nClick for actions or to change.`;
}
