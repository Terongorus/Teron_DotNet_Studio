import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { resolveGlobalDotnetPath } from '../utils/dotnetPath';

/** context.globalState key holding the path to a binary previously fetched via sharpLspInstaller.ts. */
export const RESOLVED_PATH_STATE_KEY = 'dotnet-studio.sharpLsp.resolvedPath';
/** Sibling to RESOLVED_PATH_STATE_KEY - the version of whatever's stored there, for update-awareness comparisons on later sessions. */
export const RESOLVED_VERSION_STATE_KEY = 'dotnet-studio.sharpLsp.resolvedVersion';

const BINARY_NAME = process.platform === 'win32' ? 'sharplsp.exe' : 'sharplsp';

export interface ResolvedCommand {
    command: string;
    source: 'configured' | 'env' | 'cached' | 'path';
}

export interface MisconfiguredPath {
    misconfigured: true;
    detail: string;
}

/** Maps to the exact `<os>-<arch>` scheme confirmed in SharpLsp's own platform.ts, and matches their release asset naming (`sharplsp-<platform>.vsix`) and the VSIX's own internal directory layout. */
export function detectPlatform(): string {
    if (process.platform === 'darwin') { return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'; }
    if (process.platform === 'linux') { return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'; }
    if (process.platform === 'win32') { return process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'; }
    return 'linux-x64';
}

/**
 * A workspace-scoped setting that selects/configures a spawned executable is a real
 * code-execution vector via a malicious repo's own .vscode/settings.json - mirrors
 * SharpLsp's own [DIST-WORKSPACE-TRUST] guard in its config.ts, not an optional nicety.
 * package.json's untrustedWorkspaces.restrictedConfigurations already blocks the
 * workspace-scoped value pre-trust; this is defence-in-depth for the same reason they added it.
 */
function getTrustedConfig<T>(key: string, defaultValue: T): T {
    if (!vscode.workspace.isTrusted) { return defaultValue; }
    return vscode.workspace.getConfiguration('dotnet-studio').get<T>(key, defaultValue);
}

/**
 * Silent resolution order (adapted from SharpLsp's own resolveServerPath): (1) the user's own
 * configured path, (2) the SHARPLSP_EXECUTABLE_PATH env var - the exact variable SharpLsp's own
 * reference client checks for an externally available install, not workspace-trust-gated since
 * a workspace can't set process env vars just by being opened, (3) a path cached from a previous
 * download, (4) the bare command name resolved via the shell's PATH (covers
 * `cargo install sharplsp`).
 */
export function resolveSharpLspCommand(context: vscode.ExtensionContext): ResolvedCommand | MisconfiguredPath {
    const configuredPath = getTrustedConfig('sharpLsp.path', '');
    if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return { command: configuredPath, source: 'configured' };
        }
        return { misconfigured: true, detail: `dotnet-studio.sharpLsp.path is set to "${configuredPath}", but no file exists there.` };
    }

    const envPath = process.env.SHARPLSP_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return { command: envPath, source: 'env' };
    }

    const cachedPath = context.globalState.get<string>(RESOLVED_PATH_STATE_KEY);
    if (cachedPath && fs.existsSync(cachedPath)) {
        return { command: cachedPath, source: 'cached' };
    }

    return { command: BINARY_NAME, source: 'path' };
}

/**
 * SharpLsp's own official extension explicitly points its Rust host at its sidecars via these
 * exact env vars (confirmed in their client.ts) rather than relying on the host's own
 * relative-path autodiscovery - our downloaded/bundled copies use the identical vsix-derived
 * layout (a sibling "all/" folder next to the host binary), so the same approach applies here.
 * Best-effort: if no "all/" folder exists next to the resolved command (e.g. a PATH/configured
 * install with some other layout we don't control), this contributes nothing, leaving
 * SharpLsp's own fallback discovery to try on its own.
 */
export function resolveSidecarEnv(command: string): Record<string, string> {
    const sidecarDir = path.join(path.dirname(command), 'all');
    const csharpExe = process.platform === 'win32' ? 'sharplsp-sidecar-csharp.exe' : 'sharplsp-sidecar-csharp';
    const fsharpExe = process.platform === 'win32' ? 'sharplsp-sidecar-fsharp.exe' : 'sharplsp-sidecar-fsharp';

    const env: Record<string, string> = {};
    const csharpPath = path.join(sidecarDir, csharpExe);
    const fsharpPath = path.join(sidecarDir, fsharpExe);
    if (fs.existsSync(csharpPath)) { env.SHARPLSP_CSHARP_SIDECAR_PATH = csharpPath; }
    if (fs.existsSync(fsharpPath)) { env.SHARPLSP_FSHARP_SIDECAR_PATH = fsharpPath; }
    return env;
}

/** Path to a specific `dotnet` executable for the SharpLsp sidecar - just the extension-wide `dotnet-studio.dotnetPath` (dotnetPath.ts); SharpLsp has no dotnet-resolution needs distinct from anything else this extension drives. */
export function resolveDotnetPath(): string | undefined {
    return resolveGlobalDotnetPath();
}

export function getExtraArgs(): string[] {
    return getTrustedConfig<string[]>('sharpLsp.extraArgs', []);
}

export interface ProbeResult {
    ok: boolean;
    reason?: 'not-found' | 'error';
    detail?: string;
}

/** Short-lived precondition check before ever spawning the real long-lived server - mirrors designerHostClient.ts's checkDesktopRuntime(). */
export function probeSharpLsp(command: string): Promise<ProbeResult> {
    return new Promise(resolve => {
        cp.execFile(command, ['--version'], error => {
            if (!error) {
                resolve({ ok: true });
                return;
            }
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
                resolve({ ok: false, reason: 'not-found', detail: error.message });
            } else {
                // Binary exists but didn't like these args, or exited non-zero - the important
                // signal is "can we spawn this at all", which we just did.
                resolve({ ok: true });
            }
        });
    });
}
