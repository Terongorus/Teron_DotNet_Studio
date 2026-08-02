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
        '.NET Project Creator',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');

    const refresh = () => {
        const items = getRecentItems(context.globalState).filter(i => fs.existsSync(i.folderPath));
        panel.webview.html = getStartPageHtml(panel.webview, items);
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
        }
    });

    panel.onDidDispose(() => {
        changeSubscription.dispose();
        currentPanel = undefined;
    });

    currentPanel = panel;
    refresh();
}
