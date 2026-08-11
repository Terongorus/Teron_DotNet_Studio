import * as vscode from 'vscode';
import { RoslynClientManager } from '../languageServer/roslynClient';
import { getRoslynOutputChannel } from '../languageServer/roslynNotifications';

const ROSLYN_README_URL = 'https://github.com/dotnet/roslyn/blob/main/src/LanguageServer/Microsoft.CodeAnalysis.LanguageServer/README.md';

export function registerRoslynCommands(context: vscode.ExtensionContext, manager: RoslynClientManager): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.roslyn.restart', () => manager.restart()),
        vscode.commands.registerCommand('dotnet-creator.roslyn.showOutput', () => {
            (manager.getRealOutputChannel() ?? getRoslynOutputChannel()).show();
        }),
        vscode.commands.registerCommand('dotnet-creator.roslyn.showMenu', () => showMenu(manager))
    );
}

async function showMenu(manager: RoslynClientManager): Promise<void> {
    type Item = vscode.QuickPickItem & { action: 'restart' | 'showOutput' | 'download' | 'instructions' | 'openSettings' };

    const alreadyResolved = manager.getStatus() !== 'NotInstalled';
    const items: Item[] = [
        { label: '$(sync) Restart Language Server', action: 'restart' },
        { label: '$(output) Show Language Server Output', action: 'showOutput' },
        { label: alreadyResolved ? '$(cloud-download) Update Roslyn Language Server' : '$(cloud-download) Download Roslyn Language Server', action: 'download' },
        { label: '$(link-external) Install Instructions', action: 'instructions' },
        { label: '$(gear) Open Settings', action: 'openSettings' }
    ];

    const selection = await vscode.window.showQuickPick(items, { title: 'Roslyn Language Server (C#)' });
    if (!selection) { return; }

    switch (selection.action) {
        case 'restart':
            await manager.restart();
            break;
        case 'showOutput':
            (manager.getRealOutputChannel() ?? getRoslynOutputChannel()).show();
            break;
        case 'download':
            await manager.downloadAndStart();
            break;
        case 'instructions':
            await vscode.env.openExternal(vscode.Uri.parse(ROSLYN_README_URL));
            break;
        case 'openSettings':
            await vscode.commands.executeCommand('workbench.action.openSettings', 'dotnet-creator.roslyn');
            break;
    }
}
