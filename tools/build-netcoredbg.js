// Stages netcoredbg into dist/netcoredbg/<platform>/ so it ships inside this extension's own
// VSIX, the same way tools/build-sharplsp.js stages SharpLsp. Unlike SharpLsp (built from
// vendored source), netcoredbg is fetched as a verified release binary - building it requires a
// full CMake + MSVC/Visual Studio Build Tools toolchain, decided against for this bundling path.
//
// Downloads the official win64 release asset, verifies it against GitHub's own published
// per-asset SHA256 digest (netcoredbg's releases carry no separate checksums file, unlike
// SharpLsp's SHA256SUMS - confirmed by inspecting a real release before writing this), and
// extracts the whole "netcoredbg/" folder from the zip (the binary depends on sibling DLLs).
//
// Optional packaging enrichment, not a hard build requirement: any failure (network, mismatch,
// missing asset) logs a warning and exits 0 rather than failing the whole `vscode:prepublish`
// pipeline.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const yauzl = require('yauzl');

const RELEASES_API_URL = 'https://api.github.com/repos/Samsung/netcoredbg/releases/latest';
const GITHUB_HEADERS = { 'User-Agent': 'dotnet-project-creator-vscode-extension', 'Accept': 'application/vnd.github+json' };

// Mirrors src/languageServer/sharpLspLocator.ts's detectPlatform() - kept in sync by hand,
// same as build-sharplsp.js's copy.
function detectPlatform() {
    if (process.platform === 'darwin') { return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'; }
    if (process.platform === 'linux') { return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'; }
    if (process.platform === 'win32') { return process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'; }
    return 'linux-x64';
}

// Mirrors src/debugAdapter/netcoredbgLocator.ts's detectNetcoredbgAssetSuffix().
function detectNetcoredbgAssetSuffix(platform) {
    switch (platform) {
        case 'win32-x64': return 'win64';
        case 'linux-x64': return 'linux-amd64';
        case 'linux-arm64': return 'linux-arm64';
        case 'darwin-arm64': return 'osx-arm64';
        default: return undefined;
    }
}

function extractFolderFromZip(zipPath, internalPrefix, destDir) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
            if (openErr || !zipfile) { reject(openErr || new Error(`Failed to open archive: ${zipPath}`)); return; }

            const prefix = internalPrefix.endsWith('/') ? internalPrefix : `${internalPrefix}/`;
            let anyExtracted = false;

            zipfile.on('entry', entry => {
                if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith('/')) {
                    zipfile.readEntry();
                    return;
                }
                anyExtracted = true;
                const destPath = path.join(destDir, entry.fileName.slice(prefix.length));
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
                if (!anyExtracted) { reject(new Error(`No entries found under "${prefix}" inside ${zipPath}.`)); }
                else { resolve(); }
            });
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

async function main() {
    const platform = detectPlatform();
    const assetSuffix = detectNetcoredbgAssetSuffix(platform);
    if (assetSuffix !== 'win64') {
        console.warn(`[build-netcoredbg] Skipping: bundling is currently win32-x64 only (host platform resolved to "${platform}").`);
        return;
    }

    const assetName = `netcoredbg-${assetSuffix}.zip`;

    let release;
    try {
        const response = await fetch(RELEASES_API_URL, { headers: GITHUB_HEADERS });
        if (!response.ok) { throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`); }
        release = await response.json();
    } catch (error) {
        console.warn(`[build-netcoredbg] Skipping: failed to check latest release (${error.message}).`);
        return;
    }

    const asset = release.assets.find(a => a.name === assetName);
    if (!asset || !asset.digest) {
        console.warn(`[build-netcoredbg] Skipping: release ${release.tag_name} has no verifiable "${assetName}" asset.`);
        return;
    }

    console.log(`[build-netcoredbg] Downloading ${assetName} (${release.tag_name})...`);
    const response = await fetch(asset.browser_download_url, { headers: GITHUB_HEADERS });
    if (!response.ok) {
        console.warn(`[build-netcoredbg] Skipping: download failed (${response.status} ${response.statusText}).`);
        return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const [, expectedHash] = asset.digest.split(':');
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualHash.toLowerCase() !== (expectedHash || '').toLowerCase()) {
        console.warn('[build-netcoredbg] Skipping: checksum mismatch against GitHub\'s published digest - refusing to bundle an unverified download.');
        return;
    }

    const repoRoot = path.join(__dirname, '..');
    const destDir = path.join(repoRoot, 'dist', 'netcoredbg', platform);
    const tempZipPath = path.join(os.tmpdir(), `netcoredbg-build-${Date.now()}.zip`);

    fs.rmSync(destDir, { recursive: true, force: true });
    fs.writeFileSync(tempZipPath, buffer);
    try {
        await extractFolderFromZip(tempZipPath, 'netcoredbg', destDir);
    } finally {
        fs.rmSync(tempZipPath, { force: true });
    }

    fs.writeFileSync(path.join(destDir, 'version.txt'), release.tag_name, 'utf8');
    console.log(`[build-netcoredbg] Staged netcoredbg ${release.tag_name} (${platform}) into ${destDir}`);
}

main().catch(error => {
    console.warn(`[build-netcoredbg] Skipping: ${error.message}`);
});
