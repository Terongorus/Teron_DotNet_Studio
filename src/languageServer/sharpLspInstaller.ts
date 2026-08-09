import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { fetchLatestRelease, downloadToBuffer, downloadText, parseShaSums, extractFileFromZip, extractFolderFromZip } from '../utils/githubReleaseInstaller';
import { detectPlatform } from './sharpLspLocator';

const RELEASES_API_URL = 'https://api.github.com/repos/Nimblesite/SharpLsp/releases/latest';

export type InstallResult =
    | { ok: true; path: string; version: string }
    | { ok: false; detail: string };

/**
 * Downloads, checksum-verifies, and extracts the SharpLsp binary from the current platform's
 * official .vsix release asset - only ever invoked by an explicit user action (the
 * "Download SharpLsp" notification/command), never automatically. A mismatch or any failure
 * aborts before anything is extracted or executed.
 */
export async function downloadLatestRelease(
    context: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
): Promise<InstallResult> {
    try {
        progress.report({ message: 'Checking latest SharpLsp release...' });
        const release = await fetchLatestRelease(RELEASES_API_URL);
        const version = release.tag_name.replace(/^v/, '');
        const platform = detectPlatform();
        const assetName = `sharplsp-${platform}.vsix`;

        const asset = release.assets.find(a => a.name === assetName);
        if (!asset) { return { ok: false, detail: `SharpLsp ${release.tag_name} has no release asset for platform "${platform}".` }; }

        const sumsAsset = release.assets.find(a => a.name === 'SHA256SUMS');
        if (!sumsAsset) { return { ok: false, detail: `SharpLsp ${release.tag_name} is missing its SHA256SUMS file - refusing to install an unverified download.` }; }

        if (token.isCancellationRequested) { return { ok: false, detail: 'Cancelled.' }; }
        progress.report({ message: `Downloading ${assetName}...` });
        const vsixBuffer = await downloadToBuffer(asset.browser_download_url, token);

        if (token.isCancellationRequested) { return { ok: false, detail: 'Cancelled.' }; }
        progress.report({ message: 'Verifying checksum...' });
        const sumsText = await downloadText(sumsAsset.browser_download_url);
        const expectedHash = parseShaSums(sumsText, assetName);
        if (!expectedHash) { return { ok: false, detail: `SHA256SUMS did not list a hash for ${assetName}.` }; }

        const actualHash = crypto.createHash('sha256').update(vsixBuffer).digest('hex');
        if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
            return { ok: false, detail: `Checksum mismatch for ${assetName} - the download does not match SharpLsp's published SHA256SUMS. Refusing to install it.` };
        }

        progress.report({ message: 'Extracting...' });
        const binaryName = process.platform === 'win32' ? 'sharplsp.exe' : 'sharplsp';
        const destDir = vscode.Uri.joinPath(context.globalStorageUri, 'sharplsp', version).fsPath;
        const destPath = path.join(destDir, binaryName);
        const tempVsixPath = path.join(os.tmpdir(), `sharplsp-download-${Date.now()}.vsix`);

        await fs.promises.writeFile(tempVsixPath, vsixBuffer);
        try {
            await extractFileFromZip(tempVsixPath, `extension/bin/${platform}/${binaryName}`, destPath);
            // Both sidecars (C# and F#) live in a shared, platform-independent "bin/all/"
            // folder in the real .vsix, separate from the per-platform host binary - confirmed
            // by inspecting a real release directly, not assumed. The original implementation
            // only extracted the host binary, leaving the sidecars unresolved for anyone using
            // this download path without also having a local from-source build.
            await extractFolderFromZip(tempVsixPath, 'extension/bin/all', path.join(destDir, 'all'));
        } finally {
            await fs.promises.unlink(tempVsixPath).catch(() => { /* best-effort cleanup */ });
        }

        if (process.platform !== 'win32') {
            await fs.promises.chmod(destPath, 0o755);
            await fs.promises.chmod(path.join(destDir, 'all', 'sharplsp-sidecar-csharp'), 0o755).catch(() => { /* platform-specific file, may not exist */ });
            await fs.promises.chmod(path.join(destDir, 'all', 'sharplsp-sidecar-fsharp'), 0o755).catch(() => { /* platform-specific file, may not exist */ });
        }

        return { ok: true, path: destPath, version };
    } catch (error: any) {
        return { ok: false, detail: error.message ?? String(error) };
    }
}
