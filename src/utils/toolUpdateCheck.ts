import * as vscode from 'vscode';
import { fetchLatestRelease } from './githubReleaseInstaller';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function lastCheckedKey(toolKey: string): string { return `dotnet-studio.${toolKey}.lastVersionCheck`; }

/**
 * Throttled to once per 24h per tool, so this never hammers GitHub's API on every activation.
 * `force` (the manual "Check for Updates"-style commands) bypasses the throttle entirely - an
 * explicit user action should never be silently swallowed by a window meant only to rate-limit
 * the automatic background check.
 *
 * The "last checked" timestamp is only persisted on an actual successful response - previously it
 * was set unconditionally before the fetch even ran, so a single transient failure (a network
 * blip, or a GitHub API rate limit - unauthenticated requests are capped at 60/hour) would
 * silently block every check, automatic or manual, for a full 24h with no visible sign anything
 * had gone wrong.
 */
async function checkForUpdate(context: vscode.ExtensionContext, toolKey: string, owner: string, repo: string, currentVersion: string, force: boolean): Promise<string | undefined> {
    if (!force) {
        const lastChecked = context.globalState.get<number>(lastCheckedKey(toolKey), 0);
        if (Date.now() - lastChecked < CHECK_INTERVAL_MS) { return undefined; }
    }

    try {
        const release = await fetchLatestRelease(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
        await context.globalState.update(lastCheckedKey(toolKey), Date.now());
        const latestVersion = release.tag_name.replace(/^v/, '');
        return latestVersion !== currentVersion.replace(/^v/, '') ? latestVersion : undefined;
    } catch {
        return undefined; // Best-effort - a failed check is silent, never surfaced as an error, and never marked as "checked" so the next attempt retries for real.
    }
}

/**
 * Only meaningful for resolutions where the active version is actually known (a fresh download,
 * or a bundled copy whose build-time version.txt was read) - configured/env/PATH installs are
 * the user's own explicit choice and are not nudged, consistent with "Download/Update" already
 * being their own manual lever for those. Never auto-switches; "Update" is the only thing that
 * changes anything, and only because the caller's onUpdate does exactly what the existing
 * Download action already does.
 */
export async function maybeNotifyUpdate(
    context: vscode.ExtensionContext,
    toolKey: string,
    displayName: string,
    owner: string,
    repo: string,
    currentVersion: string,
    onUpdate: () => Promise<void>,
    force = false
): Promise<void> {
    const latestVersion = await checkForUpdate(context, toolKey, owner, repo, currentVersion, force);
    if (!latestVersion) {
        // A silent no-op is correct for the automatic background check, but a manual "Check for
        // Updates" click met with total silence looks broken/unresponsive - say so explicitly.
        if (force) { vscode.window.showInformationMessage(`${displayName}: you're on the latest version (${currentVersion}).`); }
        return;
    }

    // force skips the per-version dismissal too - an explicit re-check should always be able to
    // surface an update, even one the user previously dismissed.
    const dontAskKey = `dotnet-studio.${toolKey}.updateDismissed.${latestVersion}`;
    if (!force && context.globalState.get<boolean>(dontAskKey, false)) { return; }

    const UPDATE = 'Update';
    const NOT_NOW = 'Not Now';
    const DONT_ASK = "Don't Ask for This Version";
    const choice = await vscode.window.showInformationMessage(
        `${displayName} ${latestVersion} is available (you're on ${currentVersion}).`,
        UPDATE, NOT_NOW, DONT_ASK
    );

    if (choice === UPDATE) {
        await onUpdate();
    } else if (choice === DONT_ASK) {
        await context.globalState.update(dontAskKey, true);
    }
}
