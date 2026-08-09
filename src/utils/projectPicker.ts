import * as vscode from 'vscode';
import * as path from 'path';
import { peekCurrentSolution, setCurrentSolution } from './currentSolution';
import { findNearestSolutionFile } from './solutionParser';
import { peekFolderState, updateFolderState } from './folderState';

export interface PickCsprojArgs {
    include?: string;
    acceptIfOneFile?: boolean;
}

const MAX_RECENT_CSPROJ = 5;

export interface ProjectChangeEvent {
    folder: vscode.WorkspaceFolder;
    projectPath: string | undefined;
}

const _onDidChangePickedCsproj = new vscode.EventEmitter<ProjectChangeEvent>();
/** Fires whenever pickCsprojFile records a new selection - e.g. lets the status bar item stay in sync without polling. */
export const onDidChangePickedCsproj = _onDidChangePickedCsproj.event;

/** Reads the stored last pick with no UI and no fallback picker - unlike getPickedCsprojFile, never prompts. */
export function peekPickedCsprojFile(folder: vscode.WorkspaceFolder): string | undefined {
    return peekFolderState(folder).currentProject;
}

/** Clears the stored pick and fires onDidChangePickedCsproj - used by currentSolution.ts when switching solutions, so a project from the old solution doesn't linger. */
export async function clearPickedCsprojFile(folder: vscode.WorkspaceFolder): Promise<void> {
    await updateFolderState(folder, { currentProject: undefined });
    _onDidChangePickedCsproj.fire({ folder, projectPath: undefined });
}

function getRecentCsprojFiles(folder: vscode.WorkspaceFolder): string[] {
    return peekFolderState(folder).recentCsprojFiles ?? [];
}

/** Newest-first, deduped case-insensitively, capped - same shape as startPage/recentItems.ts. */
async function addRecentCsprojFile(folder: vscode.WorkspaceFolder, filePath: string): Promise<void> {
    const existing = getRecentCsprojFiles(folder).filter(p => p.toLowerCase() !== filePath.toLowerCase());
    const updated = [filePath, ...existing].slice(0, MAX_RECENT_CSPROJ);
    await updateFolderState(folder, { recentCsprojFiles: updated });
}

export interface RecentCsprojItem extends vscode.QuickPickItem {
    projectPath: string;
}

export function getRecentCsprojItems(folder: vscode.WorkspaceFolder): RecentCsprojItem[] {
    return getRecentCsprojFiles(folder).map(projectPath => ({
        label: `$(history) ${path.basename(projectPath)}`,
        description: projectPath,
        projectPath
    }));
}

/** .csproj search scoped to a single workspace folder - important for multi-root correctness, unlike a bare workspace-wide glob. */
export function findAllCsprojFiles(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
    const pattern = new vscode.RelativePattern(folder, '**/*.csproj');
    return Promise.resolve(vscode.workspace.findFiles(pattern, '**/{bin,obj,node_modules}/**'));
}

/**
 * Records a project as the current pick outside of pickCsprojFile's own
 * find+prompt flow - for callers (like the Project status bar menu) that
 * already know the exact path from their own combined menu. Shared so both
 * paths stay in sync on the recent list, the change event, and the
 * cold-start solution auto-derive.
 */
export async function recordPickedCsprojFile(folder: vscode.WorkspaceFolder, picked: string): Promise<void> {
    await updateFolderState(folder, { currentProject: picked });
    await addRecentCsprojFile(folder, picked);
    _onDidChangePickedCsproj.fire({ folder, projectPath: picked });

    // Cold-start default: if no solution is tracked yet, silently derive one
    // from the picked project's nearest .sln/.slnx - never overrides an
    // explicitly-picked solution, just avoids an empty Solution segment /
    // "Projects in Solution" section on first use.
    if (!peekCurrentSolution(folder)) {
        const nearestSolution = findNearestSolutionFile(path.dirname(picked));
        if (nearestSolution) {
            await setCurrentSolution(folder, nearestSolution);
        }
    }
}

/**
 * Finds .csproj files in the workspace folder and lets the user pick one -
 * auto-accepting the single match when there is exactly one, mirroring the
 * `extension.commandvariable.file.pickFile` input used in tasks.json/
 * launch.json `inputs`. Exposed as a command (see
 * commands/pickCsprojFile.ts) so a tasks.json/launch.json `"type": "command"`
 * input can call it directly instead of depending on a third-party
 * extension. Returns the picked file's fsPath, or undefined if cancelled/
 * nothing found - VS Code treats an undefined "command" input result as the
 * user cancelling the associated task/debug session.
 *
 * When there's a real choice to make, a "Recently Used" section is shown
 * first - this picker runs on every single debug/run instance (it's the
 * driving reason it exists at all), so re-scanning the full project list
 * each time is real friction in a solution with more than a couple of
 * projects.
 *
 * Also remembers the result per-folder (see getPickedCsprojFile) -
 * `${input:...}` only resolves against the `inputs` array declared in the
 * *same* JSON document, so a launch.json input and a tasks.json input can't
 * reference the same id even though they both run through this extension.
 * Persisting the pick lets a separate task-side command hand back the same
 * choice without prompting the user twice.
 */
export async function pickCsprojFile(folder: vscode.WorkspaceFolder, args?: PickCsprojArgs): Promise<string | undefined> {
    const include = args?.include ?? '**/*.csproj';
    const acceptIfOneFile = args?.acceptIfOneFile ?? true;

    const pattern = new vscode.RelativePattern(folder, include);
    const found = await vscode.workspace.findFiles(pattern, '**/{bin,obj,node_modules}/**');

    if (found.length === 0) {
        vscode.window.showWarningMessage(`No project files found matching "${include}".`);
        return undefined;
    }

    let picked: string | undefined;

    if (found.length === 1 && acceptIfOneFile) {
        picked = found[0].fsPath;
    } else {
        picked = await showCsprojQuickPick(folder, found);
    }

    if (picked) {
        await recordPickedCsprojFile(folder, picked);
    }

    return picked;
}

async function showCsprojQuickPick(folder: vscode.WorkspaceFolder, found: vscode.Uri[]): Promise<string | undefined> {
    type Item = vscode.QuickPickItem & { uri?: vscode.Uri };

    const recentPaths = getRecentCsprojFiles(folder)
        .filter(recent => found.some(uri => uri.fsPath.toLowerCase() === recent.toLowerCase()));

    const items: Item[] = [];

    if (recentPaths.length > 0) {
        items.push({ label: 'Recently Used', kind: vscode.QuickPickItemKind.Separator });
        for (const recent of recentPaths) {
            const uri = found.find(u => u.fsPath.toLowerCase() === recent.toLowerCase())!;
            items.push({ label: `$(history) ${path.basename(uri.fsPath)}`, description: uri.fsPath, uri });
        }
        items.push({ label: 'All Projects', kind: vscode.QuickPickItemKind.Separator });
    }

    for (const uri of found) {
        if (recentPaths.some(recent => recent.toLowerCase() === uri.fsPath.toLowerCase())) {
            continue;
        }
        items.push({ label: `$(file) ${path.basename(uri.fsPath)}`, description: uri.fsPath, uri });
    }

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a project file',
        title: 'Select .csproj'
    });

    return selection?.uri?.fsPath;
}

/**
 * Returns the last path stored by pickCsprojFile with no UI - for a
 * tasks.json `"inputs"` entry (a separate JSON document from launch.json,
 * see pickCsprojFile's doc comment) that needs the same selection a
 * preLaunchTask's launch config already prompted for, without prompting
 * again. Falls back to running the picker itself if nothing has been picked
 * yet (e.g. the task was run directly via "Tasks: Run Task" rather than as
 * part of an F5 debug session), so this never silently resolves to nothing.
 */
export async function getPickedCsprojFile(folder: vscode.WorkspaceFolder, args?: PickCsprojArgs): Promise<string | undefined> {
    const stored = peekPickedCsprojFile(folder);
    if (stored) {
        return stored;
    }
    return pickCsprojFile(folder, args);
}
