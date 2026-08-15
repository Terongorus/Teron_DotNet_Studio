import * as vscode from 'vscode';
import * as path from 'path';
import { setCurrentSolution } from './currentSolution';
import { recordPickedCsprojFile } from './projectPicker';
import { writeFolderStateAtUri, markFolderExplicitlyOpened, FolderState } from './folderState';
import { openFolderUnlessAlreadyOpen } from './openFolder';

function findOpenFolder(folderPath: string): vscode.WorkspaceFolder | undefined {
    const target = path.resolve(folderPath).toLowerCase();
    return vscode.workspace.workspaceFolders?.find(f => path.resolve(f.uri.fsPath).toLowerCase() === target);
}

/**
 * The single choke point every real "open a solution/project via .NET Studio" action goes
 * through - Open Existing, Create Solution, Create New Project, and the Start Page's Recently
 * Used list. Always marks the target folder as explicitly opened (see projectOpened.ts), which is
 * what actually turns on the status bar/Resource Monitor/Solution Explorer/F5 - unlike
 * autoPickSoleProject's silent derivation, which deliberately does NOT set this flag.
 *
 * `markFolderExplicitlyOpened` runs *before* `setCurrentSolution`/`recordPickedCsprojFile` so
 * that by the time their change events fire (which is what recomputes the projectOpened context
 * key - see extension.ts), the flag is already true in the folder-state cache, not one tick
 * behind.
 */
export async function openSolutionTarget(folderPath: string, solutionPath: string, projectPath?: string): Promise<void> {
    const folder = findOpenFolder(folderPath);
    if (folder) {
        await markFolderExplicitlyOpened(folder);
        await setCurrentSolution(folder, solutionPath);
        if (projectPath) {
            await recordPickedCsprojFile(folder, projectPath);
        }
    } else {
        const patch: Partial<FolderState> = { currentSolution: solutionPath, explicitlyOpened: true };
        if (projectPath) { patch.currentProject = projectPath; }
        await writeFolderStateAtUri(vscode.Uri.file(folderPath), patch);
    }
    openFolderUnlessAlreadyOpen(folderPath);
}

export async function openProjectTarget(folderPath: string, projectPath: string): Promise<void> {
    const folder = findOpenFolder(folderPath);
    if (folder) {
        await markFolderExplicitlyOpened(folder);
        await recordPickedCsprojFile(folder, projectPath);
    } else {
        await writeFolderStateAtUri(vscode.Uri.file(folderPath), { currentProject: projectPath, explicitlyOpened: true });
    }
    openFolderUnlessAlreadyOpen(folderPath);
}
