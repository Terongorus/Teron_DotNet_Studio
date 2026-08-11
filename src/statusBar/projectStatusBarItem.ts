import * as vscode from 'vscode';
import * as path from 'path';
import { peekPickedCsprojFile, recordPickedCsprojFile, findAllCsprojFiles, onDidChangePickedCsproj } from '../utils/projectPicker';
import { getActiveWorkspaceFolder, onDidChangeActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { peekCurrentSolution, onDidChangeCurrentSolution } from '../utils/currentSolution';
import { parseSolutionProjects } from '../utils/solutionParser';
import { isProjectUnloadedInSolution } from '../utils/solutionBuildConfig';

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

    const refresh = () => {
        updateStatusBarItem(item);
        void autoPickSoleProject();
    };

    context.subscriptions.push(
        item,
        onDidChangePickedCsproj(() => updateStatusBarItem(item)),
        onDidChangeActiveWorkspaceFolder(refresh),
        onDidChangeCurrentSolution(refresh)
    );

    refresh();
    item.show();
}

/**
 * When a solution (or, absent one, the whole workspace folder) resolves to exactly one
 * possible project, there's no real choice to make - Visual Studio auto-selects it as the
 * startup project rather than making the user explicitly confirm the only option. A solution
 * with more than one project is left alone, since which one is "current" genuinely matters
 * there. Never overrides an already-recorded pick.
 */
async function autoPickSoleProject(): Promise<void> {
    const folder = getActiveWorkspaceFolder();
    if (!folder || peekPickedCsprojFile(folder)) { return; }

    const solutionPath = peekCurrentSolution(folder);
    let candidates = solutionPath
        ? await parseSolutionProjects(solutionPath)
        : (await findAllCsprojFiles(folder)).map(uri => uri.fsPath);

    // An unloaded project isn't a real choice for "the" startup project either - excluded the
    // same way a picker would exclude it, so a solution with one loaded + one unloaded project
    // still auto-picks the loaded one instead of treating it as "more than one candidate."
    if (solutionPath) {
        const loadedFlags = await Promise.all(candidates.map(p => isProjectUnloadedInSolution(folder, solutionPath, p).then(unloaded => !unloaded)));
        candidates = candidates.filter((_, i) => loadedFlags[i]);
    }

    if (candidates.length === 1) {
        await recordPickedCsprojFile(folder, candidates[0]);
    }
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
