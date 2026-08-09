// Stages SharpLsp into dist/sharplsp/<platform>/ so it ships inside this extension's own VSIX.
// Fetches the official release .vsix (the same asset src/languageServer/sharpLspInstaller.ts's
// "Download SharpLsp" action fetches), verifies it against the release's published SHA256SUMS
// file, and extracts both the per-platform host binary and the shared "bin/all/" sidecars
// folder - confirmed by inspecting a real release directly, not assumed. No local Rust/dotnet
// build is required for this staging step.
//
// Optional packaging enrichment, not a hard build requirement: any failure (network, mismatch,
// missing asset) logs a warning and exits 0 rather than failing the whole `vscode:prepublish`
// pipeline.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const yauzl = require('yauzl');

const RELEASES_API_URL = 'https://api.github.com/repos/Nimblesite/SharpLsp/releases/latest';
const GITHUB_HEADERS = { 'User-Agent': 'dotnet-project-creator-vscode-extension', 'Accept': 'application/vnd.github+json' };

// Mirrors src/languageServer/sharpLspLocator.ts's detectPlatform() - kept in sync by hand,
// same as build-netcoredbg.js's copy.
function detectPlatform() {
    if (process.platform === 'darwin') { return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'; }
    if (process.platform === 'linux') { return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'; }
    if (process.platform === 'win32') { return process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'; }
    return 'linux-x64';
}

function parseShaSums(text, filename) {
    for (const line of text.split(/\r?\n/)) {
        const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
        if (match && match[2] === filename) { return match[1]; }
    }
    return undefined;
}

function extractFromZip(zipPath, internalPrefix, destDir, { wholeFolder }) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
            if (openErr || !zipfile) { reject(openErr || new Error(`Failed to open archive: ${zipPath}`)); return; }

            const prefix = wholeFolder ? (internalPrefix.endsWith('/') ? internalPrefix : `${internalPrefix}/`) : null;
            let anyExtracted = false;

            zipfile.on('entry', entry => {
                const matches = wholeFolder ? (entry.fileName.startsWith(prefix) && !entry.fileName.endsWith('/')) : entry.fileName === internalPrefix;
                if (!matches) {
                    zipfile.readEntry();
                    return;
                }
                anyExtracted = true;
                const destPath = wholeFolder ? path.join(destDir, entry.fileName.slice(prefix.length)) : destDir;
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr || !readStream) { reject(streamErr || new Error(`Failed to read archive entry: ${entry.fileName}`)); return; }
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    const writeStream = fs.createWriteStream(destPath);
                    readStream.pipe(writeStream);
                    writeStream.on('finish', () => zipfile.readEntry());
                    writeStream.on('error', reject);
                });
            });
            zipfile.on('end', () => {
                if (!anyExtracted) { reject(new Error(`"${internalPrefix}" was not found inside ${zipPath}.`)); }
                else { resolve(); }
            });
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

async function main() {
    const platform = detectPlatform();
    const binaryName = process.platform === 'win32' ? 'sharplsp.exe' : 'sharplsp';
    const assetName = `sharplsp-${platform}.vsix`;

    let release;
    try {
        const response = await fetch(RELEASES_API_URL, { headers: GITHUB_HEADERS });
        if (!response.ok) { throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`); }
        release = await response.json();
    } catch (error) {
        console.warn(`[build-sharplsp] Skipping: failed to check latest release (${error.message}).`);
        return;
    }

    const asset = release.assets.find(a => a.name === assetName);
    const sumsAsset = release.assets.find(a => a.name === 'SHA256SUMS');
    if (!asset || !sumsAsset) {
        console.warn(`[build-sharplsp] Skipping: release ${release.tag_name} is missing "${assetName}" or SHA256SUMS.`);
        return;
    }

    console.log(`[build-sharplsp] Downloading ${assetName} (${release.tag_name})...`);
    const [assetResponse, sumsResponse] = await Promise.all([
        fetch(asset.browser_download_url, { headers: GITHUB_HEADERS }),
        fetch(sumsAsset.browser_download_url, { headers: GITHUB_HEADERS })
    ]);
    if (!assetResponse.ok || !sumsResponse.ok) {
        console.warn('[build-sharplsp] Skipping: download failed.');
        return;
    }

    const vsixBuffer = Buffer.from(await assetResponse.arrayBuffer());
    const sumsText = await sumsResponse.text();
    const expectedHash = parseShaSums(sumsText, assetName);
    const actualHash = crypto.createHash('sha256').update(vsixBuffer).digest('hex');
    if (!expectedHash || actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
        console.warn('[build-sharplsp] Skipping: checksum mismatch against SharpLsp\'s published SHA256SUMS - refusing to bundle an unverified download.');
        return;
    }

    const repoRoot = path.join(__dirname, '..');
    const destDir = path.join(repoRoot, 'dist', 'sharplsp', platform);
    const tempVsixPath = path.join(os.tmpdir(), `sharplsp-build-${Date.now()}.vsix`);

    fs.rmSync(destDir, { recursive: true, force: true });
    fs.writeFileSync(tempVsixPath, vsixBuffer);
    try {
        await extractFromZip(tempVsixPath, `extension/bin/${platform}/${binaryName}`, path.join(destDir, binaryName), { wholeFolder: false });
        // Both sidecars (C# and F#) live in a shared, platform-independent "bin/all/" folder,
        // separate from the per-platform host binary - confirmed by inspecting a real release.
        await extractFromZip(tempVsixPath, 'extension/bin/all', path.join(destDir, 'all'), { wholeFolder: true });
    } finally {
        fs.rmSync(tempVsixPath, { force: true });
    }

    fs.writeFileSync(path.join(destDir, 'version.txt'), release.tag_name.replace(/^v/, ''), 'utf8');
    console.log(`[build-sharplsp] Staged SharpLsp ${release.tag_name} (${platform}) into ${destDir}`);
}

main().catch(error => {
    console.warn(`[build-sharplsp] Skipping: ${error.message}`);
});
