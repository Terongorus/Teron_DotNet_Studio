import * as vscode from 'vscode';
import { getCurrentConfiguration, onDidChangeConfiguration } from '../utils/configurationPicker';

/**
 * Rightmost of the three .NET status bar segments. Only ever two choices, so
 * clicking goes directly to the Debug/Release QuickPick - no intermediate menu.
 */
export function registerConfigurationStatusBarItem(context: vscode.ExtensionContext): void {
    const item = vscode.window.createStatusBarItem('dotnet-creator.configurationStatus', vscode.StatusBarAlignment.Left, 100);
    item.name = '.NET: Build Configuration';
    item.command = 'dotnet-creator.pickConfiguration';

    const refresh = () => updateStatusBarItem(context, item);

    context.subscriptions.push(item, onDidChangeConfiguration(refresh));

    refresh();
    item.show();
}

function updateStatusBarItem(context: vscode.ExtensionContext, item: vscode.StatusBarItem): void {
    const configuration = getCurrentConfiguration(context);
    item.text = `$(gear) ${configuration}`;
    item.tooltip = 'Click to change the build configuration (Debug/Release).';
}
