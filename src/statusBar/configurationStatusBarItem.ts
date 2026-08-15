import * as vscode from 'vscode';
import { getCurrentConfiguration, onDidChangeConfiguration } from '../utils/configurationPicker';
import { getActiveWorkspaceFolder, onDidChangeActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';

/**
 * Rightmost of the three .NET status bar segments. Only ever two choices, so
 * clicking goes directly to the Debug/Release QuickPick - no intermediate menu.
 */
export function registerConfigurationStatusBarItem(context: vscode.ExtensionContext): void {
    const item = vscode.window.createStatusBarItem('dotnet-studio.configurationStatus', vscode.StatusBarAlignment.Left, 3);
    item.name = '.NET: Build Configuration';
    item.command = 'dotnet-studio.pickConfiguration';

    const refresh = () => updateStatusBarItem(item);

    context.subscriptions.push(item, onDidChangeConfiguration(refresh), onDidChangeActiveWorkspaceFolder(refresh));

    refresh();
    item.show();
}

function updateStatusBarItem(item: vscode.StatusBarItem): void {
    const folder = getActiveWorkspaceFolder();
    const configuration = folder ? getCurrentConfiguration(folder) : 'Debug';
    item.text = `$(gear) Configuration: ${configuration}`;
    item.tooltip = folder
        ? 'Click to change the build configuration (Debug/Release).'
        : 'Open a folder to change the build configuration.';
}
