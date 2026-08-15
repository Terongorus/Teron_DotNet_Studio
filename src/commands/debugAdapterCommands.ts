import * as vscode from 'vscode';
import { NetcoredbgAdapterFactory } from '../debugAdapter/netcoredbgAdapterFactory';
import { getNetcoredbgOutputChannel } from '../debugAdapter/netcoredbgNotifications';

const NETCOREDBG_README_URL = 'https://github.com/Samsung/netcoredbg#readme';

export function registerDebugAdapterCommands(context: vscode.ExtensionContext, factory: NetcoredbgAdapterFactory): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-studio.debugAdapter.showOutput', () => {
            getNetcoredbgOutputChannel().show();
        }),
        vscode.commands.registerCommand('dotnet-studio.debugAdapter.showMenu', () => showMenu(factory))
    );
}

export async function showMenu(factory: NetcoredbgAdapterFactory): Promise<void> {
    type Item = vscode.QuickPickItem & { action: 'showOutput' | 'download' | 'instructions' | 'openSettings' };

    const items: Item[] = [
        { label: '$(output) Show Debugger Output', action: 'showOutput' },
        { label: '$(cloud-download) Download netcoredbg', action: 'download' },
        { label: '$(link-external) Install Instructions', action: 'instructions' },
        { label: '$(gear) Open Settings', action: 'openSettings' }
    ];

    const selection = await vscode.window.showQuickPick(items, { title: 'netcoredbg (.NET Debugger)' });
    if (!selection) { return; }

    switch (selection.action) {
        case 'showOutput':
            getNetcoredbgOutputChannel().show();
            break;
        case 'download':
            await factory.downloadAndCache();
            break;
        case 'instructions':
            await vscode.env.openExternal(vscode.Uri.parse(NETCOREDBG_README_URL));
            break;
        case 'openSettings':
            await vscode.commands.executeCommand('workbench.action.openSettings', 'dotnet-studio.debugAdapter');
            break;
    }
}
