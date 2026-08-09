import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as yauzl from 'yauzl';
import { detectPlatform } from './sharpLspLocator';

const RELEASES_API_URL = 'https://api.github.com/repos/Nimblesite/SharpLsp/releases/latest';
const GITHUB_HEADERS = { 'User-Agent': 'dotnet-project-creator-vscode-extension', 'Accept': 'application/vnd.github+json' };

export type InstallResult =
    | { ok: true; path: string; version: string }
    | { ok: false; detail: string };

interface ReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface Release {
    tag_name: string;
    assets: ReleaseAsset[];
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: GITHUB_HEADERS });
    if (!response.ok) { throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`); }
    return response.json() as Promise<T>;
}

async function downloadToBuffer(url: string, token: vscode.CancellationToken): Promise<Buffer> {
    const controller = new AbortController();
    const subscription = token.onCancellationRequested(() => controller.abort());
    try {
        const response = await fetch(url, { headers: GITHUB_HEADERS, signal: controller.signal });
        if (!response.ok) { throw new Error(`Download failed: ${response.status} ${response.statusText}`); }
        return Buffer.from(await response.arrayBuffer());
    } finally {
        subscription.dispose();
    }
}

async function downloadText(url: string): Promise<string> {
    const response = await fetch(url, { headers: GITHUB_HEADERS });
    if (!response.ok) { throw new Error(`Download failed: ${response.status} ${response.statusText}`); }
    return response.text();
}

/** Standard `sha256sum`-style output: "<64-hex-hash>  <filename>" (or "*<filename>" for binary mode). */
function parseShaSums(text: string, filename: string): string | undefined {
    for (const line of text.split(/\r?\n/)) {
        const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
        if (match && match[2] === filename) { return match[1]; }
    }
    return undefined;
}

function extractFileFromZip(zipPath: string, internalPath: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
            if (openErr || !zipfile) { reject(openErr ?? new Error('Failed to open SharpLsp .vsix archive.')); return; }

            let found = false;
            zipfile.on('entry', entry => {
                if (entry.fileName !== internalPath) {
                    zipfile.readEntry();
                    return;
                }
                found = true;
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr || !readStream) { reject(streamErr ?? new Error('Failed to read the SharpLsp binary entry.')); return; }
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    const writeStream = fs.createWriteStream(destPath);
                    readStream.pipe(writeStream);
                    writeStream.on('finish', () => { zipfile.close(); resolve(); });
                    writeStream.on('error', reject);
                });
            });
            zipfile.on('end', () => {
                if (!found) { reject(new Error(`"${internalPath}" was not found inside the SharpLsp .vsix archive.`)); }
            });
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

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
        const release = await fetchJson<Release>(RELEASES_API_URL);
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
        const destPath = vscode.Uri.joinPath(context.globalStorageUri, 'sharplsp', version, binaryName).fsPath;
        const tempVsixPath = path.join(os.tmpdir(), `sharplsp-download-${Date.now()}.vsix`);

        await fs.promises.writeFile(tempVsixPath, vsixBuffer);
        try {
            await extractFileFromZip(tempVsixPath, `extension/bin/${platform}/${binaryName}`, destPath);
        } finally {
            await fs.promises.unlink(tempVsixPath).catch(() => { /* best-effort cleanup */ });
        }

        if (process.platform !== 'win32') {
            await fs.promises.chmod(destPath, 0o755);
        }

        return { ok: true, path: destPath, version };
    } catch (error: any) {
        return { ok: false, detail: error.message ?? String(error) };
    }
}
