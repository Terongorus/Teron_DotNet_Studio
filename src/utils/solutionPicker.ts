import * as vscode from 'vscode';
import * as path from 'path';

const BROWSE_LABEL = '$(folder-opened) Browse for solution file...';

/**
 * Lets the user pick an existing .sln/.slnx file: first from the current
 * workspace, falling back to a file picker when nothing is found or the
 * user wants a file outside the workspace.
 */
export async function pickExistingSolution(): Promise<string | undefined> {
    const found = await vscode.workspace.findFiles('**/*.{sln,slnx}', '**/node_modules/**', 20);

    const items: vscode.QuickPickItem[] = found.map(uri => ({
        label: `$(file) ${path.basename(uri.fsPath)}`,
        description: uri.fsPath
    }));
    items.push({ label: BROWSE_LABEL, description: '' });

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a solution to add this project to',
        title: 'Choose Existing Solution'
    });

    if (!selection) {
        return undefined;
    }

    if (selection.label === BROWSE_LABEL) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { Solutions: ['sln', 'slnx'] },
            title: 'Select Solution File'
        });
        return uris?.[0]?.fsPath;
    }

    return selection.description;
}
