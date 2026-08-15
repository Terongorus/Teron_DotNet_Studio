import * as vscode from 'vscode';
import * as path from 'path';
import { getPickedCsprojFile } from '../utils/projectPicker';
import { peekCurrentSolution } from '../utils/currentSolution';
import { getCurrentConfiguration } from '../utils/configurationPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { runBuildAction, BuildAction } from './buildActions';

/**
 * Keyboard-shortcut entry points for Build/Rebuild/Clean (see package.json's keybindings) -
 * these operate on the *current* project/solution (same resolution statusBarMenus.ts's
 * showProjectMenu/showSolutionMenu already use for their own Build/Rebuild/Clean QuickPick
 * entries), rather than requiring a tree-node argument the way the Solution Explorer context
 * menu's build commands do, since a keybinding has no "selected node" to pass.
 */
export function registerBuildShortcutCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-studio.buildProject', () => runProjectAction('build')),
        vscode.commands.registerCommand('dotnet-studio.rebuildProject', () => runProjectAction('rebuild')),
        vscode.commands.registerCommand('dotnet-studio.cleanProject', () => runProjectAction('clean')),
        vscode.commands.registerCommand('dotnet-studio.buildSolution', () => runSolutionAction('build')),
        vscode.commands.registerCommand('dotnet-studio.rebuildSolution', () => runSolutionAction('rebuild')),
        vscode.commands.registerCommand('dotnet-studio.cleanSolution', () => runSolutionAction('clean'))
    );
}

async function runProjectAction(action: BuildAction): Promise<void> {
    const folder = getActiveWorkspaceFolder();
    if (!folder) { return; }

    const projectPath = await getPickedCsprojFile(folder);
    if (!projectPath) {
        vscode.window.showErrorMessage('No project selected - click the Project status bar item to pick one first.');
        return;
    }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const configuration = getCurrentConfiguration(folder);
    await runBuildAction(projectPath, projectName, action, configuration);
}

async function runSolutionAction(action: BuildAction): Promise<void> {
    const folder = getActiveWorkspaceFolder();
    if (!folder) { return; }

    const solutionPath = peekCurrentSolution(folder);
    if (!solutionPath) {
        vscode.window.showErrorMessage('No solution selected - click the Solution status bar item to pick one first.');
        return;
    }

    const solutionName = path.basename(solutionPath, path.extname(solutionPath));
    const configuration = getCurrentConfiguration(folder);
    await runBuildAction(solutionPath, solutionName, action, configuration);
}
