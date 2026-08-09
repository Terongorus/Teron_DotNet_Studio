import * as vscode from 'vscode';
import { pickConfiguration, getCurrentConfiguration } from '../utils/configurationPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';

export function registerPickConfigurationCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.pickConfiguration', () => {
            const folder = getActiveWorkspaceFolder();
            return folder ? pickConfiguration(folder) : undefined;
        }),
        // Silent, reused as a "type": "command" input by the generated tasks.json's general-
        // purpose build tasks (see debugTaskDefinitions.ts) - matches getPickedCsprojFile's
        // never-prompts convention, so build/rebuild via a task always uses the status bar's
        // current configuration without asking.
        vscode.commands.registerCommand('dotnet-creator.getCurrentConfiguration', () => {
            const folder = getActiveWorkspaceFolder();
            return folder ? getCurrentConfiguration(folder) : 'Debug';
        })
    );
}
