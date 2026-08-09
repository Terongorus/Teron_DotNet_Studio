import * as vscode from 'vscode';
import { pickConfiguration } from '../utils/configurationPicker';

export function registerPickConfigurationCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.pickConfiguration', () => pickConfiguration(context));
    context.subscriptions.push(disposable);
}
