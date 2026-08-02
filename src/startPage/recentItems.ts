import * as vscode from 'vscode';

export type RecentItemKind = 'project' | 'solution';

export interface RecentItem {
    kind: RecentItemKind;
    name: string;
    folderPath: string;
    filePath?: string;
    timestamp: number;
}

/**
 * Structural subset of vscode.Memento - lets recentItems be unit tested
 * against a fake store without pulling in the vscode module at test time.
 */
export interface MementoLike {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

export const MAX_RECENT_ITEMS = 10;
const RECENT_ITEMS_KEY = 'dotnetCreator.recentItems';

const _onDidChangeRecentItems = new vscode.EventEmitter<void>();
export const onDidChangeRecentItems = _onDidChangeRecentItems.event;

export function getRecentItems(state: MementoLike): RecentItem[] {
    return state.get<RecentItem[]>(RECENT_ITEMS_KEY, []);
}

/**
 * Adds an item to the front of the recent list, deduping by folderPath
 * (case-insensitive - Windows paths are case-insensitive) and capping at
 * MAX_RECENT_ITEMS.
 */
export async function addRecentItem(state: MementoLike, item: Omit<RecentItem, 'timestamp'>): Promise<void> {
    const existing = getRecentItems(state)
        .filter(i => i.folderPath.toLowerCase() !== item.folderPath.toLowerCase());

    const updated: RecentItem[] = [{ ...item, timestamp: Date.now() }, ...existing].slice(0, MAX_RECENT_ITEMS);

    await state.update(RECENT_ITEMS_KEY, updated);
    _onDidChangeRecentItems.fire();
}

export async function removeRecentItem(state: MementoLike, folderPath: string): Promise<void> {
    const updated = getRecentItems(state)
        .filter(i => i.folderPath.toLowerCase() !== folderPath.toLowerCase());

    await state.update(RECENT_ITEMS_KEY, updated);
    _onDidChangeRecentItems.fire();
}
