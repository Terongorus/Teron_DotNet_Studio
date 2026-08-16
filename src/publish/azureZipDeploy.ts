import * as fs from 'fs';
import * as cp from 'child_process';

/**
 * Azure App Service publish, via Kudu's `/api/zipdeploy` endpoint rather than Web Deploy/msdeploy.exe
 * - confirmed via research that Visual Studio itself supports this as a real, first-class
 * WebPublishMethod (`ZipDeploy`), not a workaround. Avoids needing msdeploy.exe as a second local
 * tool dependency (Web Server already needs it) and works from any OS, matching this extension's
 * existing "resolve from environment, don't force-install anything" posture.
 */

/** Zips the `dotnet publish` output folder's *contents* (not the folder itself) so the zip's root matches what Kudu expects to land at the site's wwwroot. Windows-only (PowerShell's Compress-Archive) - same precedent as processStats.ts's existing powershell.exe usage for a Windows-specific helper. */
export function createZipArchive(sourceDir: string, destZipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const escapedSource = sourceDir.replace(/'/g, "''");
        const escapedDest = destZipPath.replace(/'/g, "''");
        const psCommand = `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDest}' -Force`;
        cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], (error, _stdout, stderr) => {
            if (error) { reject(new Error(stderr || error.message)); return; }
            resolve();
        });
    });
}

export interface KuduZipDeployOptions {
    /** Kudu SCM base URL, e.g. `https://myapp.scm.azurewebsites.net`. */
    publishUrl: string;
    userName: string;
    password: string;
    zipPath: string;
}

/** POSTs the zip directly via Node's built-in fetch (same mechanism githubReleaseInstaller.ts already uses for downloads) with HTTP Basic Auth - deliberately not run as a visible ShellExecution Task, since that would put the password in plain sight in the integrated terminal. Synchronous zipdeploy: the request doesn't resolve until Kudu finishes extracting/deploying. */
export async function deployZipToKudu(options: KuduZipDeployOptions): Promise<void> {
    const zipData = await fs.promises.readFile(options.zipPath);
    const auth = Buffer.from(`${options.userName}:${options.password}`).toString('base64');

    const response = await fetch(`${options.publishUrl}/api/zipdeploy`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/zip'
        },
        body: zipData
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Kudu zipdeploy failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }
}
