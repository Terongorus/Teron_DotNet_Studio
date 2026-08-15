import * as vscode from 'vscode';
import { SharpLspClientManager, SharpLspStatus } from './sharpLspClient';

/**
 * Fourth .NET status bar segment (Solution(5)·Project(4)·Configuration(3)·Language Server(2)).
 * Stays hidden until the manager's status changes for the first time - which only happens once
 * a C#/F# file is actually opened and ensureStarted() runs - so users who never touch C#/F#
 * never see it at all.
 */
export function registerSharpLspStatusBarItem(context: vscode.ExtensionContext, manager: SharpLspClientManager): void {
    const item = vscode.window.createStatusBarItem('dotnet-studio.sharpLspStatus', vscode.StatusBarAlignment.Right, 2);
    item.name = '.NET: C# Language Server';
    item.command = 'dotnet-studio.sharpLsp.showMenu';

    let everShown = false;

    context.subscriptions.push(item, manager.onDidChangeStatus(status => {
        updateStatusBarItem(item, status);
        if (!everShown) {
            everShown = true;
            item.show();
        }
    }));
}

function updateStatusBarItem(item: vscode.StatusBarItem, status: SharpLspStatus): void {
    switch (status) {
        case 'NotInstalled':
            item.text = '$(circle-slash) C# Language Server: Not Installed';
            item.tooltip = 'SharpLsp was not found. Click for options.';
            break;
        case 'Starting':
            item.text = '$(sync~spin) C# Language Server: Starting...';
            item.tooltip = 'Click for options.';
            break;
        case 'Restarting':
            item.text = '$(sync~spin) C# Language Server: Restarting...';
            item.tooltip = 'Click for options.';
            break;
        case 'Running':
            item.text = '$(check) C# Language Server';
            item.tooltip = 'SharpLsp is running. Click for options.';
            break;
        case 'Failed':
            item.text = '$(error) C# Language Server: Stopped';
            item.tooltip = 'SharpLsp failed to start. Click for options.';
            break;
        case 'Stopped':
            item.text = '$(circle-outline) C# Language Server: Stopped';
            item.tooltip = 'Click for options.';
            break;
    }
}
