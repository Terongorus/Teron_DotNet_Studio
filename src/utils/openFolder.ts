import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Opens folderPath as the workspace - matching Visual Studio's own behavior of just opening
 * what you created, rather than asking first. Skipped when it's already one of the open
 * workspace folders (e.g. adding a new project to an already-open solution), since calling
 * vscode.openFolder on an already-open folder still triggers a disruptive window/extension-host
 * reload for no reason.
 */
export function openFolderUnlessAlreadyOpen(folderPath: string): void {
    const target = path.resolve(folderPath).toLowerCase();
    const alreadyOpen = (vscode.workspace.workspaceFolders ?? [])
        .some(folder => path.resolve(folder.uri.fsPath).toLowerCase() === target);
    if (alreadyOpen) { return; }

    void vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), false);
}
