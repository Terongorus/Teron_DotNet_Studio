import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as yauzl from 'yauzl';
import * as tarStream from 'tar-stream';

/**
 * Generic, tool-agnostic pieces of "download a GitHub release asset, verify its checksum,
 * extract one file from it" - originally written for SharpLsp, generalized here so the
 * netcoredbg installer can reuse the exact same checksum-verified download/extract logic
 * instead of duplicating it.
 */

const GITHUB_HEADERS = { 'User-Agent': 'dotnet-project-creator-vscode-extension', 'Accept': 'application/vnd.github+json' };

export interface ReleaseAsset {
    name: string;
    browser_download_url: string;
    /** GitHub-computed "sha256:<hex>" for this exact uploaded asset - present on newer releases, used when a project doesn't publish its own checksums file (e.g. netcoredbg, unlike SharpLsp's SHA256SUMS). */
    digest?: string;
}

export interface Release {
    tag_name: string;
    assets: ReleaseAsset[];
}

export async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: GITHUB_HEADERS });
    if (!response.ok) { throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`); }
    return response.json() as Promise<T>;
}

export function fetchLatestRelease(releasesApiUrl: string): Promise<Release> {
    return fetchJson<Release>(releasesApiUrl);
}

export async function downloadToBuffer(url: string, token: vscode.CancellationToken): Promise<Buffer> {
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

export async function downloadText(url: string): Promise<string> {
    const response = await fetch(url, { headers: GITHUB_HEADERS });
    if (!response.ok) { throw new Error(`Download failed: ${response.status} ${response.statusText}`); }
    return response.text();
}

/** Standard `sha256sum`-style output: "<64-hex-hash>  <filename>" (or "*<filename>" for binary mode). */
export function parseShaSums(text: string, filename: string): string | undefined {
    for (const line of text.split(/\r?\n/)) {
        const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
        if (match && match[2] === filename) { return match[1]; }
    }
    return undefined;
}

export function extractFileFromZip(zipPath: string, internalPath: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
            if (openErr || !zipfile) { reject(openErr ?? new Error(`Failed to open archive: ${zipPath}`)); return; }

            let found = false;
            zipfile.on('entry', entry => {
                if (entry.fileName !== internalPath) {
                    zipfile.readEntry();
                    return;
                }
                found = true;
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr || !readStream) { reject(streamErr ?? new Error(`Failed to read archive entry: ${internalPath}`)); return; }
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    const writeStream = fs.createWriteStream(destPath);
                    readStream.pipe(writeStream);
                    writeStream.on('finish', () => { zipfile.close(); resolve(); });
                    writeStream.on('error', reject);
                });
            });
            zipfile.on('end', () => {
                if (!found) { reject(new Error(`"${internalPath}" was not found inside ${zipPath}.`)); }
            });
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

/** Extracts every entry under `internalPrefix/` from a zip into destDir, preserving relative structure - for archives where the binary depends on sibling files (e.g. netcoredbg's managed DLLs next to its .exe), unlike extractFileFromZip's single-file case. */
export function extractFolderFromZip(zipPath: string, internalPrefix: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
            if (openErr || !zipfile) { reject(openErr ?? new Error(`Failed to open archive: ${zipPath}`)); return; }

            const prefix = internalPrefix.endsWith('/') ? internalPrefix : `${internalPrefix}/`;
            let anyExtracted = false;

            const finish = () => {
                if (!anyExtracted) { reject(new Error(`No entries found under "${prefix}" inside ${zipPath}.`)); }
                else { resolve(); }
            };

            zipfile.on('entry', entry => {
                if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith('/')) {
                    zipfile.readEntry();
                    return;
                }
                anyExtracted = true;
                const destPath = path.join(destDir, entry.fileName.slice(prefix.length));
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr || !readStream) { reject(streamErr ?? new Error(`Failed to read archive entry: ${entry.fileName}`)); return; }
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    const writeStream = fs.createWriteStream(destPath);
                    readStream.pipe(writeStream);
                    writeStream.on('finish', () => zipfile.readEntry());
                    writeStream.on('error', reject);
                });
            });
            zipfile.on('end', finish);
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

/** Folder-extraction analogue of extractFolderFromZip, for .tar.gz assets. */
export function extractFolderFromTarGz(tarGzPath: string, internalPrefix: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const extract = tarStream.extract();
        const prefix = internalPrefix.endsWith('/') ? internalPrefix : `${internalPrefix}/`;
        let anyExtracted = false;

        extract.on('entry', (header, stream, next) => {
            const normalizedName = header.name.replace(/^\.\//, '');
            if (header.type !== 'file' || !normalizedName.startsWith(prefix)) {
                stream.resume();
                next();
                return;
            }
            anyExtracted = true;
            const destPath = path.join(destDir, normalizedName.slice(prefix.length));
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            const writeStream = fs.createWriteStream(destPath);
            stream.pipe(writeStream);
            writeStream.on('finish', next);
            writeStream.on('error', reject);
        });

        extract.on('finish', () => {
            if (!anyExtracted) { reject(new Error(`No entries found under "${prefix}" inside ${tarGzPath}.`)); }
            else { resolve(); }
        });
        extract.on('error', reject);

        fs.createReadStream(tarGzPath).pipe(zlib.createGunzip()).pipe(extract);
    });
}

/** Same shape as extractFileFromZip, for the .tar.gz assets used by non-Windows releases (Node has no built-in tar reader). */
export function extractFileFromTarGz(tarGzPath: string, internalPath: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const extract = tarStream.extract();
        let found = false;

        extract.on('entry', (header, stream, next) => {
            const normalizedName = header.name.replace(/^\.\//, '');
            if (normalizedName !== internalPath) {
                stream.resume();
                next();
                return;
            }
            found = true;
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            const writeStream = fs.createWriteStream(destPath);
            stream.pipe(writeStream);
            writeStream.on('finish', next);
            writeStream.on('error', reject);
        });

        extract.on('finish', () => {
            if (!found) { reject(new Error(`"${internalPath}" was not found inside ${tarGzPath}.`)); }
            else { resolve(); }
        });
        extract.on('error', reject);

        fs.createReadStream(tarGzPath).pipe(zlib.createGunzip()).pipe(extract);
    });
}
