export interface RecentTemplateEntry {
    shortName: string;
    name: string;
}

/**
 * Structural subset of vscode.Memento - lets recentTemplates be unit tested against a fake store
 * without pulling in the vscode module at test time (mirrors startPage/recentItems.ts).
 */
export interface MementoLike {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

export const MAX_RECENT_TEMPLATES = 6;
const RECENT_TEMPLATES_KEY = 'dotnet-studio.recentProjectTemplates';

export function getRecentTemplates(state: MementoLike): RecentTemplateEntry[] {
    return state.get<RecentTemplateEntry[]>(RECENT_TEMPLATES_KEY, []);
}

/** Adds a template to the front of the recent list, deduping by shortName and capping at MAX_RECENT_TEMPLATES. */
export async function addRecentTemplate(state: MementoLike, entry: RecentTemplateEntry): Promise<void> {
    const existing = getRecentTemplates(state).filter(e => e.shortName !== entry.shortName);
    const updated = [entry, ...existing].slice(0, MAX_RECENT_TEMPLATES);
    await state.update(RECENT_TEMPLATES_KEY, updated);
}
