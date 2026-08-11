import * as vscode from 'vscode';
import { fetchLatestRelease, downloadToBuffer } from './githubReleaseInstaller';
import { maybeNotifyUpdate } from './toolUpdateCheck';

const GITHUB_OWNER = 'Terongorus';
const GITHUB_REPO = 'dotnet-project-creator';

/**
 * `workbench.extensions.installExtension` (and other internal VS Code commands) don't always
 * reject with a real `Error` - sometimes it's a plain object or string with no `message` property
 * at all, which previously rendered literally as the text "undefined" with zero diagnostic value.
 * Falls back to a full JSON/string dump so a future failure is at least legible.
 */
function describeError(error: unknown): string {
    if (error instanceof Error && error.message) { return error.message; }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

/**
 * Self-update via this extension's own GitHub Releases, not the VS Code Marketplace - the
 * Marketplace requires publishing through an Azure DevOps organization, which this project
 * deliberately doesn't use. Reuses maybeNotifyUpdate() (toolUpdateCheck.ts) exactly as-is - same
 * 24h-throttled "Update / Not Now / Don't Ask for This Version" flow already used for SharpLsp/
 * netcoredbg, just pointed at this extension's own repo/version instead of a bundled tool's.
 *
 * Reads the running version from context.extension.id rather than a hardcoded
 * "<publisher>.<name>" string - this project's publisher ID has already changed multiple times
 * (see git history), and a stale hardcoded ID here would make getExtension() return undefined,
 * silently disabling the entire self-update check with no error.
 */
export async function checkForExtensionUpdate(context: vscode.ExtensionContext, force = false): Promise<void> {
    const currentVersion = context.extension.packageJSON.version as string | undefined;
    if (!currentVersion) { return; }

    await maybeNotifyUpdate(context, 'extension', '.NET Studio', GITHUB_OWNER, GITHUB_REPO, currentVersion, () => downloadAndInstallLatest(context), force);
}

async function downloadAndInstallLatest(context: vscode.ExtensionContext): Promise<void> {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '.NET Studio Update', cancellable: false },
        async progress => {
            progress.report({ message: 'Checking latest release...' });

            let vsixUrl: string;
            let version: string;
            try {
                const release = await fetchLatestRelease(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
                const asset = release.assets.find(a => a.name.toLowerCase().endsWith('.vsix'));
                if (!asset) { throw new Error('The latest release has no .vsix asset.'); }
                vsixUrl = asset.browser_download_url;
                version = release.tag_name.replace(/^v/, '');
            } catch (error) {
                vscode.window.showErrorMessage(`.NET Studio: failed to check for updates - ${describeError(error)}`);
                return;
            }

            progress.report({ message: `Downloading v${version}...` });
            let vsixPath: vscode.Uri;
            try {
                const bytes = await downloadToBuffer(vsixUrl, new vscode.CancellationTokenSource().token);
                await vscode.workspace.fs.createDirectory(context.globalStorageUri);
                vsixPath = vscode.Uri.joinPath(context.globalStorageUri, `dotnet-project-creator-${version}.vsix`);
                await vscode.workspace.fs.writeFile(vsixPath, bytes);
            } catch (error) {
                vscode.window.showErrorMessage(`.NET Studio: failed to download v${version} - ${describeError(error)}`);
                return;
            }

            progress.report({ message: 'Installing...' });
            try {
                // The second (undocumented but real, confirmed via microsoft/vscode#88713)
                // throwOnFailure argument matters: without it, this command logs the real
                // exception internally and rejects with essentially nothing useful, which
                // previously rendered as the literal text "undefined" here.
                //
                // Re-wrapping via Uri.file(vsixPath.fsPath) matters too - confirmed by reading
                // VS Code's own source (extensionManagementService.ts): the install command's
                // getManifest() rejects with the literal string "No Servers" unless the URI's
                // `.scheme` is exactly "file" (or "vscode-remote"). vscode.workspace.fs.writeFile
                // above succeeds regardless of scheme (it abstracts over any filesystem
                // provider), so context.globalStorageUri not being a literal file:// URI in this
                // environment silently writes the file fine but breaks only this specific command.
                await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsixPath.fsPath), true);
            } catch (error) {
                // workbench.extensions.installExtension is an internal command with no documented
                // rejection shape - always offer the already-downloaded file as a manual fallback
                // via "Extensions: Install from VSIX...", since automatic install failing here
                // doesn't mean the download itself was bad.
                const choice = await vscode.window.showErrorMessage(
                    `.NET Studio: failed to install v${version} - ${describeError(error)}`,
                    'Reveal Downloaded VSIX'
                );
                if (choice === 'Reveal Downloaded VSIX') { await vscode.commands.executeCommand('revealFileInOS', vsixPath); }
                return;
            }

            const choice = await vscode.window.showInformationMessage(`.NET Studio updated to v${version}. Reload the window to finish.`, 'Reload Window');
            if (choice === 'Reload Window') { void vscode.commands.executeCommand('workbench.action.reloadWindow'); }
        }
    );
}

export function registerExtensionUpdateCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.checkForUpdates', () => checkForExtensionUpdate(context, true))
    );
}
