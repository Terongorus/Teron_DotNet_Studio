import * as vscode from 'vscode';
import { SharpLspClientManager } from '../languageServer/sharpLspClient';
import { getSharpLspOutputChannel } from '../languageServer/sharpLspNotifications';

const SHARPLSP_README_URL = 'https://github.com/Nimblesite/SharpLsp#readme';

export function registerLanguageServerCommands(context: vscode.ExtensionContext, manager: SharpLspClientManager): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-studio.sharpLsp.restart', () => manager.restart()),
        vscode.commands.registerCommand('dotnet-studio.sharpLsp.start', () => manager.ensureStarted()),
        vscode.commands.registerCommand('dotnet-studio.sharpLsp.stop', () => manager.stop()),
        vscode.commands.registerCommand('dotnet-studio.sharpLsp.showOutput', () => {
            (manager.getRealOutputChannel() ?? getSharpLspOutputChannel()).show();
        }),
        vscode.commands.registerCommand('dotnet-studio.sharpLsp.showMenu', () => showMenu(manager)),
        vscode.commands.registerCommand('dotnet-studio.sharpLsp.download', () => manager.downloadAndStart())
    );
}

async function showMenu(manager: SharpLspClientManager): Promise<void> {
    type Item = vscode.QuickPickItem & { action: 'restart' | 'start' | 'stop' | 'showOutput' | 'download' | 'instructions' | 'openSettings' };

    const status = manager.getStatus();
    const alreadyResolved = status !== 'NotInstalled';
    // "Start"/"Stop" only make sense once the binary has actually been resolved at least once -
    // ensureStarted() silently no-ops while the manager's own `notInstalled` latch is still set
    // (only restart()/a successful download clear it), so offering "Start" from NotInstalled
    // would look like a dead button. Download already covers that case.
    const isActive = status === 'Running' || status === 'Starting' || status === 'Restarting';
    const items: Item[] = [
        { label: '$(sync) Restart Language Server', action: 'restart' },
        ...(alreadyResolved && !isActive ? [{ label: '$(play) Start Language Server', action: 'start' as const }] : []),
        ...(isActive ? [{ label: '$(debug-stop) Stop Language Server', action: 'stop' as const }] : []),
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
        case 'start':
            await manager.ensureStarted();
            break;
        case 'stop':
            await manager.stop();
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
            await vscode.commands.executeCommand('workbench.action.openSettings', 'dotnet-studio.sharpLsp');
            break;
    }
}
