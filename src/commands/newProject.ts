import * as vscode from 'vscode';
import { showNewProjectPanel } from '../newProject/newProjectPanel';

export function registerNewProjectCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-studio.newProject', () => showNewProjectPanel(context));
    context.subscriptions.push(disposable);
}
