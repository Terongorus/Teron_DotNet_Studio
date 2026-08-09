import * as vscode from 'vscode';
import { pickConfiguration } from '../utils/configurationPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';

export function registerPickConfigurationCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.pickConfiguration', () => {
        const folder = getActiveWorkspaceFolder();
        return folder ? pickConfiguration(folder) : undefined;
    });
    context.subscriptions.push(disposable);
}
