import * as vscode from 'vscode';
import * as path from 'path';
import { getPickedCsprojFile } from '../utils/projectPicker';
import { getCurrentConfiguration } from '../utils/configurationPicker';
import { runProject } from './buildActions';

/**
 * F5/Ctrl+F5 entry points, scoped to .NET workspaces only via the
 * "dotnet-creator.workspaceHasProject" context key on the keybindings
 * themselves (see package.json) - these commands are inert no-ops outside
 * that scope since the keybinding simply won't fire, letting VS Code's own
 * defaults take over.
 */
export function registerDebugKeybindingCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.debugStart', () => runViaKeybinding(context, false)),
        vscode.commands.registerCommand('dotnet-creator.runWithoutDebugging', () => runViaKeybinding(context, true))
    );
}

async function runViaKeybinding(context: vscode.ExtensionContext, noDebug: boolean): Promise<void> {
    const projectPath = await getPickedCsprojFile(context);
    if (!projectPath) { return; }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const configuration = getCurrentConfiguration(context);
    await runProject(projectPath, projectName, configuration, noDebug);
}
