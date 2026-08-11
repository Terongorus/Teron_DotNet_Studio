import * as vscode from 'vscode';

export interface FolderState {
    currentSolution?: string;
    currentProject?: string;
    currentConfiguration?: 'Debug' | 'Release';
    /** Keyed by lowercased absolute solution path (or "" for "no solution tracked yet") - a
     *  workspace folder can host many different solutions over its lifetime, and a project
     *  recently used under one shouldn't linger in another's "Recently Used" list. See
     *  projectPicker.ts's solutionKey(). */
    recentCsprojFilesBySolution?: Record<string, string[]>;
    /** UI-only "Unload Project" marker for .slnx solutions (absolute .csproj paths) - classic .sln
     *  solutions use real ProjectConfigurationPlatforms editing instead (see solutionBuildConfig.ts),
     *  since that's verified to actually affect `dotnet build`; this list has no such effect. */
    unloadedProjects?: string[];
}

const STATE_FILE_SEGMENTS = ['.vscode', 'dotnet-creator.state.json'];

const cache = new Map<string, FolderState>();
const watchers = new Map<string, vscode.Disposable>();

/**
 * Fires once the cache actually reflects what's on disk for a folder - both the initial
 * warmFolderState() load (async - resolves after synchronous peekFolderState() readers, like a
 * status bar item's own registration-time refresh, would have already seen an empty default) and
 * any later watcher-triggered reload. Anything that reads folder state synchronously and needs
 * to stay in sync should subscribe to this rather than assuming its own change events cover it -
 * see currentSolution.ts/projectPicker.ts/configurationPicker.ts, which re-fire their own public
 * change events from this so existing consumers (status bar items, Solution Explorer) don't need
 * their own subscription.
 */
const _onDidLoadFolderState = new vscode.EventEmitter<vscode.WorkspaceFolder>();
export const onDidLoadFolderState = _onDidLoadFolderState.event;

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
    _onDidLoadFolderState.fire(folder);
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

/**
 * Read-modify-write for a folder that isn't an open workspace folder (yet) - no WorkspaceFolder
 * object exists for it to key the cache/watcher by, and none should be created here, since the
 * caller is about to switch the real VS Code workspace to it (see currentSolution.ts's
 * selectSolution) rather than track it alongside the current one. Bypasses the cache entirely -
 * the target folder's own activation will warm it normally once it becomes the open workspace.
 */
export async function writeFolderStateAtUri(folderUri: vscode.Uri, patch: Partial<FolderState>): Promise<void> {
    const uri = vscode.Uri.joinPath(folderUri, ...STATE_FILE_SEGMENTS);
    let existing: FolderState = {};
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        existing = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
        // Missing or invalid file - start from an empty state rather than throwing.
    }
    const updated = { ...existing, ...patch };
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folderUri, '.vscode'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(updated, null, 2), 'utf8'));
}

export function disposeFolderStateWatchers(): void {
    for (const watcher of watchers.values()) {
        watcher.dispose();
    }
    watchers.clear();
    cache.clear();
}
