import * as vscode from 'vscode';
import * as fs from 'fs';
import { getRecentItems, removeRecentItem, onDidChangeRecentItems } from './recentItems';
import { getStartPageHtml } from './startPageHtml';

const VIEW_TYPE = 'dotnetCreator.startPage';

let currentPanel: vscode.WebviewPanel | undefined;

export function showStartPage(context: vscode.ExtensionContext): void {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        '.NET Studio',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    const iconFsUri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    panel.iconPath = iconFsUri;
    const iconUri = panel.webview.asWebviewUri(iconFsUri);

    const refresh = () => {
        const items = getRecentItems(context.globalState).filter(i => fs.existsSync(i.folderPath));
        const showOnStartup = vscode.workspace.getConfiguration('dotnet-creator').get<boolean>('showStartPageOnStartup', true);
        panel.webview.html = getStartPageHtml(panel.webview, items, iconUri, showOnStartup);
    };

    const changeSubscription = onDidChangeRecentItems(refresh);

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'newProject':
            case 'createSolution':
            case 'manageSolution':
            case 'openExisting':
                vscode.commands.executeCommand(`dotnet-creator.${message.command}`);
                break;
            case 'openRecent':
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(message.folderPath), false);
                break;
            case 'removeRecent':
                await removeRecentItem(context.globalState, message.folderPath);
                break;
            case 'toggleShowOnStartup':
                await vscode.workspace.getConfiguration('dotnet-creator').update('showStartPageOnStartup', message.checked, vscode.ConfigurationTarget.Global);
                break;
        }
    });

    panel.onDidDispose(() => {
        changeSubscription.dispose();
        currentPanel = undefined;
    });

    currentPanel = panel;
    refresh();
}
