/**
 * Lets newPublishProfilePanel.ts/editPublishProfilePanel.ts tell an already-open Publish page
 * (publishPanel.ts) to refresh after a profile is saved, without those modules importing each
 * other directly - publishPanel.ts already needs to import their show*() functions (to open the
 * right form for New/Edit), so having either of them import back from publishPanel.ts too would
 * be a genuine circular dependency. This tiny registry breaks that cycle: all three panels only
 * ever import from here, never from each other.
 */
type RefreshCallback = (selectName?: string) => void;

const refreshCallbacks = new Map<string, RefreshCallback>();

export function registerPublishPanelRefresh(projectPath: string, callback: RefreshCallback): void {
    refreshCallbacks.set(projectPath, callback);
}

export function unregisterPublishPanelRefresh(projectPath: string): void {
    refreshCallbacks.delete(projectPath);
}

/** No-op if this project's Publish page isn't currently open - it'll read the fresh profile from disk next time it opens anyway. */
export function refreshPublishPanelIfOpen(projectPath: string, selectName?: string): void {
    refreshCallbacks.get(projectPath)?.(selectName);
}
