import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { fetchLatestRelease, downloadToBuffer, extractFolderFromZip, extractFolderFromTarGz } from '../utils/githubReleaseInstaller';
import { detectNetcoredbgAssetSuffix } from './netcoredbgLocator';

const RELEASES_API_URL = 'https://api.github.com/repos/Samsung/netcoredbg/releases/latest';

export type InstallResult =
    | { ok: true; path: string; version: string }
    | { ok: false; detail: string };

/**
 * Downloads, checksum-verifies, and extracts netcoredbg from the current platform's official
 * release asset - only ever invoked by an explicit user action, never automatically.
 *
 * Unlike SharpLsp's release (which publishes its own SHA256SUMS file), netcoredbg's releases
 * carry no author-published checksum file - confirmed by inspecting a real release directly.
 * GitHub's own Releases API computes and serves a "sha256:<hex>" digest per uploaded asset
 * regardless, which this verifies against instead - confirmed correct by downloading a real
 * asset and comparing its actual SHA256 against the API's reported digest before writing this.
 */
export async function downloadLatestRelease(
    context: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
): Promise<InstallResult> {
    try {
        progress.report({ message: 'Checking latest netcoredbg release...' });
        const release = await fetchLatestRelease(RELEASES_API_URL);
        const version = release.tag_name;

        const assetSuffix = detectNetcoredbgAssetSuffix();
        if (!assetSuffix) { return { ok: false, detail: `netcoredbg does not publish a release for this platform (${process.platform}/${process.arch}).` }; }

        const isZip = assetSuffix === 'win64' || assetSuffix === 'osx-arm64';
        const assetName = `netcoredbg-${assetSuffix}.${isZip ? 'zip' : 'tar.gz'}`;

        const asset = release.assets.find(a => a.name === assetName);
        if (!asset) { return { ok: false, detail: `netcoredbg ${version} has no release asset named "${assetName}".` }; }
        if (!asset.digest) { return { ok: false, detail: `netcoredbg ${version}'s "${assetName}" asset has no GitHub-published digest - refusing to install an unverified download.` }; }

        if (token.isCancellationRequested) { return { ok: false, detail: 'Cancelled.' }; }
        progress.report({ message: `Downloading ${assetName}...` });
        const archiveBuffer = await downloadToBuffer(asset.browser_download_url, token);

        progress.report({ message: 'Verifying checksum...' });
        const [, expectedHash] = asset.digest.split(':');
        const actualHash = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
        if (actualHash.toLowerCase() !== (expectedHash ?? '').toLowerCase()) {
            return { ok: false, detail: `Checksum mismatch for ${assetName} - the download does not match GitHub's published digest for this asset. Refusing to install it.` };
        }

        progress.report({ message: 'Extracting...' });
        const binaryName = process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg';
        const destDir = vscode.Uri.joinPath(context.globalStorageUri, 'netcoredbg', version).fsPath;
        const tempArchivePath = path.join(os.tmpdir(), `netcoredbg-download-${Date.now()}.${isZip ? 'zip' : 'tar.gz'}`);

        await fs.promises.writeFile(tempArchivePath, archiveBuffer);
        try {
            // Every release archive nests its contents under a "netcoredbg/" folder (confirmed
            // identical layout across win64/linux-amd64) - the binary depends on sibling DLLs/
            // .so files there, so the whole folder is extracted, not just the executable.
            if (isZip) {
                await extractFolderFromZip(tempArchivePath, 'netcoredbg', destDir);
            } else {
                await extractFolderFromTarGz(tempArchivePath, 'netcoredbg', destDir);
            }
        } finally {
            await fs.promises.unlink(tempArchivePath).catch(() => { /* best-effort cleanup */ });
        }

        const destPath = path.join(destDir, binaryName);
        if (process.platform !== 'win32') {
            await fs.promises.chmod(destPath, 0o755);
        }

        return { ok: true, path: destPath, version };
    } catch (error: any) {
        return { ok: false, detail: error.message ?? String(error) };
    }
}
