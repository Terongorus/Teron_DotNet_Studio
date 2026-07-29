import * as vscode from 'vscode';
import * as path from 'path';
import { runDotnet } from '../utils/process';
import { isValidProjectName } from '../utils/validation';

/**
 * Interactive core for creating an empty solution. Reused directly by the
 * New Project flow when the user opts to create a new solution on the fly,
 * so it deliberately does not show its own success notification.
 *
 * When `presetName` is given (New Project passing its project name), the
 * name prompt is skipped entirely and the solution takes that name - this
 * mirrors Visual Studio's "place solution and project in the same
 * directory" behavior, where the solution name field is disabled and just
 * follows the project name. Without a preset name (the standalone Create
 * Solution command has no project to borrow a name from), the user is
 * prompted for one.
 *
 * Returns the created .slnx path, or undefined if cancelled or failed.
 */
export async function promptCreateSolution(presetName?: string): Promise<string | undefined> {
    let name = presetName;

    if (!name) {
        name = await vscode.window.showInputBox({
            prompt: 'Enter the name of your new solution',
            placeHolder: 'MySolution',
            title: 'Create Solution',
            validateInput: isValidProjectName
        });

        if (!name) {
            return undefined;
        }
    }

    const folderUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Create Solution Here',
        title: 'Create Solution'
    });

    if (!folderUri || folderUri.length === 0) {
        return undefined;
    }

    const folder = folderUri[0].fsPath;
    const slnPath = path.join(folder, `${name}.slnx`);

    try {
        await runDotnet(['new', 'sln', '-n', name, '-o', folder, '--format', 'slnx']);
        return slnPath;
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create solution: ${error.message}`);
        return undefined;
    }
}

export function registerCreateSolutionCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.createSolution', async () => {
        const slnPath = await promptCreateSolution();
        if (!slnPath) {
            return;
        }

        const folder = path.dirname(slnPath);
        vscode.window.showInformationMessage(`Successfully created solution!`, 'Open Folder')
            .then(choice => {
                if (choice === 'Open Folder') {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), false);
                }
            });
    });

    context.subscriptions.push(disposable);
}
