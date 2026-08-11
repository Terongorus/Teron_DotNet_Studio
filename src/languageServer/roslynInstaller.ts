import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { downloadToBuffer, extractFolderFromZip } from '../utils/githubReleaseInstaller';
import { detectPlatform } from './roslynLocator';

/**
 * Microsoft's own public NuGet feed for the Roslyn Language Server binaries - the same source
 * documented and recommended by `roslyn.nvim`/`nvim-lspconfig` (real, actively-used third-party
 * editor integrations), not nuget.org (updated far less often per their own docs). This is the
 * stable, publicly documented service index URL - resolved dynamically (rather than hardcoding
 * the feed's internal package-base-address, which is an Azure DevOps implementation detail that
 * could change) via the standard NuGet V3 protocol.
 */
const NUGET_SERVICE_INDEX_URL = 'https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json';

interface ServiceIndexResource {
    '@id': string;
    '@type': string;
}

interface ServiceIndex {
    resources: ServiceIndexResource[];
}

interface FlatVersionsResponse {
    versions: string[];
}

/** Plain JSON fetch, deliberately not reusing githubReleaseInstaller.ts's fetchJson() - that one sends GitHub-flavored Accept/User-Agent headers, which don't belong on a NuGet protocol request even though most servers would probably tolerate them. */
async function fetchJsonPlain<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) { throw new Error(`Request failed: ${response.status} ${response.statusText}`); }
    return response.json() as Promise<T>;
}

async function resolvePackageBaseAddress(): Promise<string> {
    const index = await fetchJsonPlain<ServiceIndex>(NUGET_SERVICE_INDEX_URL);
    const resource = index.resources.find(r => r['@type'] === 'PackageBaseAddress/3.0.0');
    if (!resource) { throw new Error('The NuGet service index has no PackageBaseAddress resource.'); }
    return resource['@id'].replace(/\/$/, '');
}

export type InstallResult =
    | { ok: true; path: string; version: string }
    | { ok: false; detail: string };

/**
 * Downloads and extracts the Roslyn Language Server for the current platform from Microsoft's
 * own public feed - only ever invoked by an explicit user action, same "nothing runs without
 * consent" convention as SharpLsp/netcoredbg's own installers. Unlike those, this feed does not
 * publish a `.nupkg.sha512` checksum sidecar (confirmed by querying it directly - the endpoint
 * exists per the NuGet V3 protocol but 404s for this specific feed), so there's no checksum to
 * verify against; this relies on HTTPS transport security and downloading directly from
 * Microsoft's own official domain, unlike SharpLsp/netcoredbg's checksum-verified downloads -
 * a real, worth-stating difference, not glossed over.
 */
export async function downloadLatestRoslyn(
    context: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
): Promise<InstallResult> {
    try {
        progress.report({ message: 'Checking latest Roslyn Language Server release...' });
        const platform = detectPlatform();
        const packageId = `microsoft.codeanalysis.languageserver.${platform}`;
        const baseAddress = await resolvePackageBaseAddress();

        const versionsResponse = await fetchJsonPlain<FlatVersionsResponse>(`${baseAddress}/${packageId}/index.json`);
        // Empirically verified newest-first for this specific feed (not a general NuGet
        // guarantee - a real download was inspected before trusting this).
        const version = versionsResponse.versions[0];
        if (!version) { return { ok: false, detail: `No published versions found for ${packageId} on Microsoft's feed.` }; }

        if (token.isCancellationRequested) { return { ok: false, detail: 'Cancelled.' }; }
        progress.report({ message: `Downloading Roslyn Language Server ${version} (a large download, ~60MB)...` });
        const nupkgUrl = `${baseAddress}/${packageId}/${version}/${packageId}.${version}.nupkg`;
        const nupkgBuffer = await downloadToBuffer(nupkgUrl, token);

        if (token.isCancellationRequested) { return { ok: false, detail: 'Cancelled.' }; }
        progress.report({ message: 'Extracting...' });
        const binaryName = process.platform === 'win32' ? 'Microsoft.CodeAnalysis.LanguageServer.exe' : 'Microsoft.CodeAnalysis.LanguageServer';
        const destDir = vscode.Uri.joinPath(context.globalStorageUri, 'roslyn', version).fsPath;
        const destPath = path.join(destDir, binaryName);
        const tempNupkgPath = path.join(os.tmpdir(), `roslyn-download-${Date.now()}.nupkg`);

        await fs.promises.writeFile(tempNupkgPath, nupkgBuffer);
        try {
            // A .nupkg is a zip file (NuGet's own format) - the server binary and all its
            // sibling DLLs/resources live under content/LanguageServer/<platform>/, confirmed by
            // downloading and extracting a real package before trusting this path.
            await extractFolderFromZip(tempNupkgPath, `content/LanguageServer/${platform}`, destDir);
        } finally {
            await fs.promises.unlink(tempNupkgPath).catch(() => { /* best-effort cleanup */ });
        }

        if (process.platform !== 'win32') {
            await fs.promises.chmod(destPath, 0o755);
        }

        return { ok: true, path: destPath, version };
    } catch (error: any) {
        return { ok: false, detail: error.message ?? String(error) };
    }
}
