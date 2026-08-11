import * as vscode from 'vscode';
import { SharpLspClientManager } from '../languageServer/sharpLspClient';
import { getSharpLspOutputChannel } from '../languageServer/sharpLspNotifications';

const SHARPLSP_README_URL = 'https://github.com/Nimblesite/SharpLsp#readme';

export function registerLanguageServerCommands(context: vscode.ExtensionContext, manager: SharpLspClientManager): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.sharpLsp.restart', () => manager.restart()),
        vscode.commands.registerCommand('dotnet-creator.sharpLsp.showOutput', () => {
            (manager.getRealOutputChannel() ?? getSharpLspOutputChannel()).show();
        }),
        vscode.commands.registerCommand('dotnet-creator.sharpLsp.showMenu', () => showMenu(manager)),
        vscode.commands.registerCommand('dotnet-creator.sharpLsp.download', () => manager.downloadAndStart())
    );
}

async function showMenu(manager: SharpLspClientManager): Promise<void> {
    type Item = vscode.QuickPickItem & { action: 'restart' | 'showOutput' | 'download' | 'instructions' | 'openSettings' };

    const alreadyResolved = manager.getStatus() !== 'NotInstalled';
    const items: Item[] = [
        { label: '$(sync) Restart Language Server', action: 'restart' },
        { label: '$(output) Show Language Server Output', action: 'showOutput' },
        { label: alreadyResolved ? '$(cloud-download) Update SharpLsp' : '$(cloud-download) Download SharpLsp', action: 'download' },
        { label: '$(link-external) Install Instructions', action: 'instructions' },
        { label: '$(gear) Open Settings', action: 'openSettings' }
    ];

    const selection = await vscode.window.showQuickPick(items, { title: 'SharpLsp (C#/F# Language Server)' });
    if (!selection) { return; }

    switch (selection.action) {
        case 'restart':
            await manager.restart();
            break;
        case 'showOutput':
            (manager.getRealOutputChannel() ?? getSharpLspOutputChannel()).show();
            break;
        case 'download':
            await manager.downloadAndStart();
            break;
        case 'instructions':
            await vscode.env.openExternal(vscode.Uri.parse(SHARPLSP_README_URL));
            break;
        case 'openSettings':
            await vscode.commands.executeCommand('workbench.action.openSettings', 'dotnet-creator.sharpLsp');
            break;
    }
}
