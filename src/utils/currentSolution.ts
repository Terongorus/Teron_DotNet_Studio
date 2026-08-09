import * as vscode from 'vscode';
import { getRecentItems } from '../startPage/recentItems';
import { clearPickedCsprojFile } from './projectPicker';
import { peekFolderState, updateFolderState } from './folderState';

export interface SolutionChangeEvent {
    folder: vscode.WorkspaceFolder;
    solutionPath: string | undefined;
}

const _onDidChangeCurrentSolution = new vscode.EventEmitter<SolutionChangeEvent>();
export const onDidChangeCurrentSolution = _onDidChangeCurrentSolution.event;

export function peekCurrentSolution(folder: vscode.WorkspaceFolder): string | undefined {
    return peekFolderState(folder).currentSolution;
}

export async function setCurrentSolution(folder: vscode.WorkspaceFolder, solutionPath: string | undefined): Promise<void> {
    await updateFolderState(folder, { currentSolution: solutionPath });
    _onDidChangeCurrentSolution.fire({ folder, solutionPath });
}

/**
 * Switching solutions clears the current project (confirmed behavior): a
 * project picked under a different solution shouldn't linger and look like
 * it belongs to the newly selected one.
 */
export async function selectSolution(folder: vscode.WorkspaceFolder, solutionPath: string): Promise<void> {
    await setCurrentSolution(folder, solutionPath);
    await clearPickedCsprojFile(folder);
}

export interface RecentSolutionItem extends vscode.QuickPickItem {
    solutionPath: string;
}

/** Reuses the Start Page's existing recent-items list rather than a fourth parallel "recent" tracker - still global (cross-workspace), unlike the folder-scoped "current" solution above. */
export function getRecentSolutionItems(context: vscode.ExtensionContext): RecentSolutionItem[] {
    return getRecentItems(context.globalState)
        .filter((item): item is typeof item & { filePath: string } => item.kind === 'solution' && !!item.filePath)
        .map(item => ({
            label: `$(history) ${item.name}`,
            description: item.filePath,
            solutionPath: item.filePath
        }));
}

export async function browseForSolutionFile(): Promise<string | undefined> {
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { Solutions: ['sln', 'slnx'] },
        title: 'Select Solution File'
    });
    return uris?.[0]?.fsPath;
}

const BROWSE_LABEL = '$(folder-opened) Browse for solution file...';

/** Always shows a picker (Recently Used + Browse). */
export async function pickCurrentSolution(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder): Promise<string | undefined> {
    type Item = vscode.QuickPickItem & { solutionPath?: string; browse?: boolean };

    const recent = getRecentSolutionItems(context);
    const items: Item[] = [];
    if (recent.length > 0) {
        items.push({ label: 'Recently Used', kind: vscode.QuickPickItemKind.Separator });
        items.push(...recent);
    }
    items.push({ label: BROWSE_LABEL, browse: true });

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a solution',
        title: 'Select Solution'
    });

    if (!selection) { return undefined; }

    const picked = selection.browse ? await browseForSolutionFile() : selection.solutionPath;
    if (!picked) { return undefined; }

    await selectSolution(folder, picked);
    return picked;
}
