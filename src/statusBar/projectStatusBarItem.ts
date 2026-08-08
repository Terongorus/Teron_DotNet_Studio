import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { peekPickedCsprojFile, onDidChangePickedCsproj } from '../utils/projectPicker';

/**
 * Shows the currently picked Debug/Build/Release project (and its owning
 * solution, if one can be found nearby) in the status bar. Clicking it runs
 * ".NET: Change Debug Project" (dotnet-creator.pickCsprojFile) - the same
 * command tasks.json/launch.json inputs end up using via
 * getPickedCsprojFile, so this widget and the actual build/debug/release
 * flow always agree on which project is active.
 */
export function registerProjectStatusBarItem(context: vscode.ExtensionContext): void {
    const item = vscode.window.createStatusBarItem('dotnet-creator.projectStatus', vscode.StatusBarAlignment.Left, 100);
    item.name = '.NET: Debug Project';
    item.command = 'dotnet-creator.pickCsprojFile';

    const refresh = () => updateStatusBarItem(context, item);

    context.subscriptions.push(item, onDidChangePickedCsproj(refresh));

    refresh();
    item.show();
}

function updateStatusBarItem(context: vscode.ExtensionContext, item: vscode.StatusBarItem): void {
    const picked = peekPickedCsprojFile(context);

    if (!picked) {
        item.text = '$(folder-library) Select Project';
        item.tooltip = 'Click to choose the .NET project used for Debug/Build/Release.';
        return;
    }

    const projectName = path.basename(picked, path.extname(picked));
    const solutionPath = findNearestSolutionFile(path.dirname(picked));
    const solutionName = solutionPath ? path.basename(solutionPath, path.extname(solutionPath)) : undefined;

    item.text = solutionName
        ? `$(folder-library) ${solutionName} › ${projectName}`
        : `$(folder-library) ${projectName}`;
    item.tooltip = `Debug/Build project: ${picked}\nClick to change.`;
}

/** Walks up from a project's folder looking for the nearest .sln/.slnx - same bounded walk-up shape as projectAssemblyResolver's nearest-.csproj search. */
function findNearestSolutionFile(startDir: string): string | undefined {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
        if (!fs.existsSync(dir)) { break; }

        const sln = fs.readdirSync(dir).find(entry => {
            const lower = entry.toLowerCase();
            return lower.endsWith('.sln') || lower.endsWith('.slnx');
        });
        if (sln) {
            return path.join(dir, sln);
        }

        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}
