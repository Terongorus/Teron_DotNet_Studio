import * as vscode from 'vscode';
import { fetchLatestRelease, downloadToBuffer } from './githubReleaseInstaller';
import { maybeNotifyUpdate } from './toolUpdateCheck';

const GITHUB_OWNER = 'Terongorus';
const GITHUB_REPO = 'dotnet-project-creator';

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
            } catch (error: any) {
                vscode.window.showErrorMessage(`.NET Studio: failed to check for updates - ${error.message}`);
                return;
            }

            progress.report({ message: `Downloading v${version}...` });
            let vsixPath: vscode.Uri;
            try {
                const bytes = await downloadToBuffer(vsixUrl, new vscode.CancellationTokenSource().token);
                await vscode.workspace.fs.createDirectory(context.globalStorageUri);
                vsixPath = vscode.Uri.joinPath(context.globalStorageUri, `dotnet-project-creator-${version}.vsix`);
                await vscode.workspace.fs.writeFile(vsixPath, bytes);
            } catch (error: any) {
                vscode.window.showErrorMessage(`.NET Studio: failed to download v${version} - ${error.message}`);
                return;
            }

            progress.report({ message: 'Installing...' });
            try {
                await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixPath);
            } catch (error: any) {
                vscode.window.showErrorMessage(`.NET Studio: failed to install v${version} - ${error.message}`);
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
