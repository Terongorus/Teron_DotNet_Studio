import * as vscode from 'vscode';
import { getRecentItems } from '../startPage/recentItems';
import { clearPickedCsprojFile } from './projectPicker';

const CURRENT_SOLUTION_KEY = 'dotnetCreator.currentSolution';

const _onDidChangeCurrentSolution = new vscode.EventEmitter<string | undefined>();
export const onDidChangeCurrentSolution = _onDidChangeCurrentSolution.event;

export function peekCurrentSolution(context: vscode.ExtensionContext): string | undefined {
    return context.workspaceState.get<string>(CURRENT_SOLUTION_KEY);
}

export async function setCurrentSolution(context: vscode.ExtensionContext, solutionPath: string | undefined): Promise<void> {
    await context.workspaceState.update(CURRENT_SOLUTION_KEY, solutionPath);
    _onDidChangeCurrentSolution.fire(solutionPath);
}

/**
 * Switching solutions clears the current project (confirmed behavior): a
 * project picked under a different solution shouldn't linger and look like
 * it belongs to the newly selected one.
 */
export async function selectSolution(context: vscode.ExtensionContext, solutionPath: string): Promise<void> {
    await setCurrentSolution(context, solutionPath);
    await clearPickedCsprojFile(context);
}

export interface RecentSolutionItem extends vscode.QuickPickItem {
    solutionPath: string;
}

/** Reuses the Start Page's existing recent-items list rather than a fourth parallel "recent" tracker. */
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
export async function pickCurrentSolution(context: vscode.ExtensionContext): Promise<string | undefined> {
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

    await selectSolution(context, picked);
    return picked;
}
