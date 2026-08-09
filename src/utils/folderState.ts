import * as vscode from 'vscode';

export interface FolderState {
    currentSolution?: string;
    currentProject?: string;
    currentConfiguration?: 'Debug' | 'Release';
    recentCsprojFiles?: string[];
}

const STATE_FILE_SEGMENTS = ['.vscode', 'dotnet-creator.state.json'];

const cache = new Map<string, FolderState>();
const watchers = new Map<string, vscode.Disposable>();

function key(folder: vscode.WorkspaceFolder): string {
    return folder.uri.toString();
}

function stateUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(folder.uri, ...STATE_FILE_SEGMENTS);
}

async function loadIntoCache(folder: vscode.WorkspaceFolder): Promise<FolderState> {
    let state: FolderState = {};
    try {
        const bytes = await vscode.workspace.fs.readFile(stateUri(folder));
        state = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
        // Missing or invalid file - start from an empty state rather than throwing.
    }
    cache.set(key(folder), state);
    return state;
}

function ensureWatcher(folder: vscode.WorkspaceFolder): void {
    const k = key(folder);
    if (watchers.has(k)) { return; }

    const pattern = new vscode.RelativePattern(folder, '.vscode/dotnet-creator.state.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = () => { void loadIntoCache(folder); };
    watcher.onDidChange(reload);
    watcher.onDidCreate(reload);
    watcher.onDidDelete(() => cache.set(k, {}));
    watchers.set(k, watcher);
}

/**
 * Populates the in-memory cache for a folder from its `.vscode/dotnet-creator.state.json` -
 * call once per known folder at activation, and whenever a folder is added, before relying on
 * peekFolderState's synchronous reads. Matches this codebase's existing fire-and-forget
 * activation convention (e.g. extension.ts's updateWorkspaceHasProjectContext) - callers that
 * read before this resolves just see the empty-state default briefly, then the real value once
 * loaded (via the onDidChange* events the wrapping modules fire on state changes).
 */
export async function warmFolderState(folder: vscode.WorkspaceFolder): Promise<FolderState> {
    ensureWatcher(folder);
    return loadIntoCache(folder);
}

/** Synchronous - reads only the in-memory cache. Defaults to {} if warmFolderState hasn't resolved yet for this folder. */
export function peekFolderState(folder: vscode.WorkspaceFolder): FolderState {
    return cache.get(key(folder)) ?? {};
}

export async function updateFolderState(folder: vscode.WorkspaceFolder, patch: Partial<FolderState>): Promise<void> {
    const updated = { ...peekFolderState(folder), ...patch };
    cache.set(key(folder), updated);
    ensureWatcher(folder);

    const uri = stateUri(folder);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(updated, null, 2), 'utf8'));
}

export function disposeFolderStateWatchers(): void {
    for (const watcher of watchers.values()) {
        watcher.dispose();
    }
    watchers.clear();
    cache.clear();
}
