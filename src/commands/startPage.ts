import * as vscode from 'vscode';
import { showStartPage } from '../startPage/startPagePanel';

export function registerStartPageCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-studio.showStartPage', () => showStartPage(context));
    context.subscriptions.push(disposable);
}

/**
 * Mirrors VS Code's own Welcome page: only auto-shows when there's nothing
 * else to show (no folder/workspace open), and only if the user hasn't
 * disabled it.
 */
export function maybeShowStartPageOnStartup(context: vscode.ExtensionContext) {
    const enabled = vscode.workspace.getConfiguration('dotnet-studio').get<boolean>('showStartPageOnStartup', true);
    const hasFolder = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;

    if (enabled && !hasFolder) {
        showStartPage(context);
    }
}
