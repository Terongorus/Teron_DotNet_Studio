import * as vscode from 'vscode';
import { SharpLspClientManager } from '../languageServer/sharpLspClient';
import { RoslynClientManager } from '../languageServer/roslynClient';

export type LanguageServerChoice = 'sharpLsp' | 'roslyn';

/**
 * Mutually exclusive by design: dotnet-studio.languageServer selects exactly one, and only that
 * one is ever started (see extension.ts's maybeStartSharpLsp/maybeStartRoslyn gates). Switching
 * stops whichever is currently running before starting the newly selected one - both binaries
 * can be installed side by side without conflict, but only one process runs at a time.
 */
export function registerSwitchLanguageServerCommand(context: vscode.ExtensionContext, sharpLsp: SharpLspClientManager, roslyn: RoslynClientManager): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-studio.switchLanguageServer', () => switchLanguageServer(sharpLsp, roslyn))
    );
}

async function switchLanguageServer(sharpLsp: SharpLspClientManager, roslyn: RoslynClientManager): Promise<void> {
    const config = vscode.workspace.getConfiguration('dotnet-studio');
    const current = config.get<LanguageServerChoice>('languageServer', 'sharpLsp');

    type Item = vscode.QuickPickItem & { choice: LanguageServerChoice };
    const items: Item[] = [
        { label: '$(check-all) SharpLsp', description: current === 'sharpLsp' ? 'Currently selected' : undefined, choice: 'sharpLsp' },
        { label: '$(check-all) Roslyn Language Server', description: current === 'roslyn' ? 'Currently selected' : undefined, choice: 'roslyn' }
    ];

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Switch C#/F# Language Server',
        placeHolder: 'Only one language server runs at a time'
    });
    if (!selection || selection.choice === current) { return; }

    await config.update('languageServer', selection.choice, vscode.ConfigurationTarget.Global);

    if (selection.choice === 'roslyn') {
        await sharpLsp.stop();
        await roslyn.ensureStarted();
    } else {
        await roslyn.stop();
        await sharpLsp.ensureStarted();
    }
}
