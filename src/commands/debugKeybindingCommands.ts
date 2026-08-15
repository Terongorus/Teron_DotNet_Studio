import * as vscode from 'vscode';
import * as path from 'path';
import { getPickedCsprojFile } from '../utils/projectPicker';
import { getCurrentConfiguration } from '../utils/configurationPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { runProject } from './buildActions';

/**
 * F5/Ctrl+F5 entry points, scoped to workspaces where a project/solution has actually been
 * opened via .NET Studio (not just "a .csproj exists somewhere") via the
 * "dotnet-studio.projectOpened" context key on the keybindings themselves (see package.json and
 * utils/projectOpened.ts) - these commands are inert no-ops outside that scope since the
 * keybinding simply won't fire, letting VS Code's own defaults take over.
 */
export function registerDebugKeybindingCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-studio.debugStart', () => runViaKeybinding(false)),
        vscode.commands.registerCommand('dotnet-studio.runWithoutDebugging', () => runViaKeybinding(true))
    );
}

async function runViaKeybinding(noDebug: boolean): Promise<void> {
    const folder = getActiveWorkspaceFolder();
    if (!folder) { return; }

    const projectPath = await getPickedCsprojFile(folder);
    if (!projectPath) { return; }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const configuration = getCurrentConfiguration(folder);
    await runProject(projectPath, projectName, configuration, noDebug);
}
