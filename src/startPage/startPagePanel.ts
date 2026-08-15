import * as vscode from 'vscode';
import * as fs from 'fs';
import { getRecentItems, removeRecentItem, onDidChangeRecentItems } from './recentItems';
import { getStartPageHtml } from './startPageHtml';
import { openSolutionTarget, openProjectTarget } from '../utils/openTarget';
import { openFolderUnlessAlreadyOpen } from '../utils/openFolder';

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
        const showOnStartup = vscode.workspace.getConfiguration('dotnet-studio').get<boolean>('showStartPageOnStartup', true);
        panel.webview.html = getStartPageHtml(panel.webview, items, iconUri, showOnStartup);
    };

    const changeSubscription = onDidChangeRecentItems(refresh);

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'newProject':
            case 'createSolution':
            case 'manageSolution':
            case 'openExisting':
                vscode.commands.executeCommand(`dotnet-studio.${message.command}`);
                break;
            case 'openRecent': {
                // Older recent entries (pre-dating this field) may have no filePath - fall back to
                // a plain folder open for those rather than failing, since there's nothing to track.
                const item = getRecentItems(context.globalState)
                    .find(i => i.folderPath.toLowerCase() === message.folderPath.toLowerCase());
                if (item?.filePath && item.kind === 'solution') {
                    await openSolutionTarget(item.folderPath, item.filePath);
                } else if (item?.filePath && item.kind === 'project') {
                    await openProjectTarget(item.folderPath, item.filePath);
                } else {
                    openFolderUnlessAlreadyOpen(message.folderPath);
                }
                break;
            }
            case 'removeRecent':
                await removeRecentItem(context.globalState, message.folderPath);
                break;
            case 'toggleShowOnStartup':
                await vscode.workspace.getConfiguration('dotnet-studio').update('showStartPageOnStartup', message.checked, vscode.ConfigurationTarget.Global);
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
