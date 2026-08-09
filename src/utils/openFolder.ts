import * as vscode from 'vscode';
import * as path from 'path';

function isDescendantOrSame(candidatePath: string, ancestorPath: string): boolean {
    const ancestor = path.resolve(ancestorPath).toLowerCase();
    const candidate = path.resolve(candidatePath).toLowerCase();
    return candidate === ancestor || candidate.startsWith(ancestor + path.sep);
}

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

/**
 * True when targetPath is inside (or is) any currently open workspace folder - used to decide
 * whether a file discovered elsewhere (e.g. a solution picked via Browse) needs a real workspace
 * switch, or is already reachable from what's open (a multi-root/monorepo layout where switching
 * would be disruptive and wrong).
 */
export function isPathInOpenWorkspace(targetPath: string): boolean {
    return (vscode.workspace.workspaceFolders ?? [])
        .some(folder => isDescendantOrSame(targetPath, folder.uri.fsPath));
}
