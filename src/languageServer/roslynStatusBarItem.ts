import * as vscode from 'vscode';
import { RoslynClientManager, RoslynStatus } from './roslynClient';

function isRoslynSelected(): boolean {
    return vscode.workspace.getConfiguration('dotnet-creator').get<string>('languageServer', 'sharpLsp') === 'roslyn';
}

/**
 * Same status-bar slot as sharpLspStatusBarItem.ts (Right, priority 2) - the two are mutually
 * exclusive (dotnet-creator.languageServer selects exactly one), so they never actually compete
 * for the same visible spot at the same time. Stays hidden until both (a) Roslyn is the selected
 * server and (b) its status has changed at least once (only happens once a C# file is opened and
 * ensureStarted() runs) - matches sharpLspStatusBarItem.ts's own "never shown until relevant"
 * behavior, plus reacting to the setting itself changing (switching servers).
 */
export function registerRoslynStatusBarItem(context: vscode.ExtensionContext, manager: RoslynClientManager): void {
    const item = vscode.window.createStatusBarItem('dotnet-creator.roslynStatus', vscode.StatusBarAlignment.Right, 2);
    item.name = '.NET: Roslyn Language Server';
    item.command = 'dotnet-creator.roslyn.showMenu';

    let everShown = false;
    const refreshVisibility = () => {
        if (isRoslynSelected() && everShown) { item.show(); } else { item.hide(); }
    };

    context.subscriptions.push(
        item,
        manager.onDidChangeStatus(status => {
            updateStatusBarItem(item, status);
            everShown = true;
            refreshVisibility();
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('dotnet-creator.languageServer')) { refreshVisibility(); }
        })
    );
}

function updateStatusBarItem(item: vscode.StatusBarItem, status: RoslynStatus): void {
    switch (status) {
        case 'NotInstalled':
            item.text = '$(circle-slash) Roslyn Language Server: Not Installed';
            item.tooltip = 'The Roslyn Language Server was not found. Click for options.';
            break;
        case 'Starting':
            item.text = '$(sync~spin) Roslyn Language Server: Starting...';
            item.tooltip = 'Click for options.';
            break;
        case 'Restarting':
            item.text = '$(sync~spin) Roslyn Language Server: Restarting...';
            item.tooltip = 'Click for options.';
            break;
        case 'Running':
            item.text = '$(check) Roslyn Language Server';
            item.tooltip = 'The Roslyn Language Server is running. Click for options.';
            break;
        case 'Failed':
            item.text = '$(error) Roslyn Language Server: Stopped';
            item.tooltip = 'The Roslyn Language Server failed to start. Click for options.';
            break;
        case 'Stopped':
            item.text = '$(circle-outline) Roslyn Language Server: Stopped';
            item.tooltip = 'Click for options.';
            break;
    }
}
