// Stages a locally-built SharpLsp (see third-party/SharpLsp) into dist/sharplsp/<platform>/ so
// it ships inside this extension's own VSIX. Mirrors the "VSIX layout" SharpLsp's own real
// package uses: sidecar folders sit as direct children of the same directory as the host binary
// (confirmed against their Makefile's HOST_VSIX_BIN/_stage-sidecars targets), which is a
// *different* nesting than third-party/SharpLsp/target/'s own layout (release/ and
// sidecar-csharp/ as siblings under target/) - this script re-nests, it doesn't just copy as-is.
//
// Optional packaging enrichment, not a hard build requirement: if the source artifacts aren't
// present (third-party/SharpLsp never built on this machine), this logs a warning and exits 0
// rather than failing the whole `vscode:prepublish` pipeline.

const fs = require('fs');
const path = require('path');

// Mirrors src/languageServer/sharpLspLocator.ts's detectPlatform() exactly - kept in sync by
// hand since this is a plain Node build script, not compiled TypeScript.
function detectPlatform() {
    if (process.platform === 'darwin') { return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'; }
    if (process.platform === 'linux') { return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'; }
    if (process.platform === 'win32') { return process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'; }
    return 'linux-x64';
}

const repoRoot = path.join(__dirname, '..');
const sharpLspRoot = path.join(repoRoot, 'third-party', 'SharpLsp', 'target');
const platform = detectPlatform();
const binaryName = process.platform === 'win32' ? 'sharplsp.exe' : 'sharplsp';

const hostSource = path.join(sharpLspRoot, 'release', binaryName);
if (!fs.existsSync(hostSource)) {
    console.warn(`[build-sharplsp] Skipping: ${hostSource} not found. Build third-party/SharpLsp first (cargo build --release) if you want SharpLsp bundled in this package.`);
    process.exit(0);
}

const destDir = path.join(repoRoot, 'dist', 'sharplsp', platform);
fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });

fs.copyFileSync(hostSource, path.join(destDir, binaryName));

for (const sidecar of ['sidecar-csharp', 'sidecar-fsharp']) {
    const sidecarSource = path.join(sharpLspRoot, sidecar);
    if (!fs.existsSync(sidecarSource)) {
        console.warn(`[build-sharplsp] Skipping ${sidecar}: ${sidecarSource} not found.`);
        continue;
    }
    fs.cpSync(sidecarSource, path.join(destDir, sidecar), { recursive: true });
}

console.log(`[build-sharplsp] Staged SharpLsp (${platform}) into ${destDir}`);
