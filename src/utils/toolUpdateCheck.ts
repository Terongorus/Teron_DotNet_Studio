import * as vscode from 'vscode';
import { fetchLatestRelease } from './githubReleaseInstaller';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function lastCheckedKey(toolKey: string): string { return `dotnet-creator.${toolKey}.lastVersionCheck`; }

/** Throttled to once per 24h per tool, so this never hammers GitHub's API on every activation. */
async function checkForUpdate(context: vscode.ExtensionContext, toolKey: string, owner: string, repo: string, currentVersion: string): Promise<string | undefined> {
    const lastChecked = context.globalState.get<number>(lastCheckedKey(toolKey), 0);
    if (Date.now() - lastChecked < CHECK_INTERVAL_MS) { return undefined; }
    await context.globalState.update(lastCheckedKey(toolKey), Date.now());

    try {
        const release = await fetchLatestRelease(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
        const latestVersion = release.tag_name.replace(/^v/, '');
        return latestVersion !== currentVersion.replace(/^v/, '') ? latestVersion : undefined;
    } catch {
        return undefined; // Best-effort - a failed check is silent, never surfaced as an error.
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
    onUpdate: () => Promise<void>
): Promise<void> {
    const latestVersion = await checkForUpdate(context, toolKey, owner, repo, currentVersion);
    if (!latestVersion) { return; }

    const dontAskKey = `dotnet-creator.${toolKey}.updateDismissed.${latestVersion}`;
    if (context.globalState.get<boolean>(dontAskKey, false)) { return; }

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
