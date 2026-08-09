import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

/** context.globalState key holding the path to a binary either previously fetched via sharpLspInstaller.ts, or chosen via "Use Bundled SharpLsp". */
export const RESOLVED_PATH_STATE_KEY = 'dotnet-creator.sharpLsp.resolvedPath';

const BUNDLED_BINARY_NAME = process.platform === 'win32' ? 'sharplsp.exe' : 'sharplsp';

export interface ResolvedCommand {
    command: string;
    source: 'configured' | 'env' | 'cached' | 'path';
}

export interface MisconfiguredPath {
    misconfigured: true;
    detail: string;
}

/** Maps to the exact `<os>-<arch>` scheme confirmed in SharpLsp's own platform.ts, and matches their release asset naming (`sharplsp-<platform>.vsix`) and bundled-directory layout. */
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
    return vscode.workspace.getConfiguration('dotnet-creator').get<T>(key, defaultValue);
}

/**
 * Silent resolution order (adapted from SharpLsp's own resolveServerPath): (1) the user's own
 * configured path, (2) the SHARPLSP_EXECUTABLE_PATH env var - the exact variable SharpLsp's own
 * reference client checks for an externally available install, not workspace-trust-gated since
 * a workspace can't set process env vars just by being opened, (3) a path cached from a previous
 * download or "Use Bundled SharpLsp" choice, (4) the bare command name resolved via the shell's
 * PATH (covers `cargo install sharplsp`). The bundled copy is deliberately NOT part of this
 * silent list - see getBundledCommand() - so using it always requires the explicit click even
 * though the file already ships inside the extension.
 */
export function resolveSharpLspCommand(context: vscode.ExtensionContext): ResolvedCommand | MisconfiguredPath {
    const configuredPath = getTrustedConfig('sharpLsp.path', '');
    if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return { command: configuredPath, source: 'configured' };
        }
        return { misconfigured: true, detail: `dotnet-creator.sharpLsp.path is set to "${configuredPath}", but no file exists there.` };
    }

    const envPath = process.env.SHARPLSP_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return { command: envPath, source: 'env' };
    }

    const cachedPath = context.globalState.get<string>(RESOLVED_PATH_STATE_KEY);
    if (cachedPath && fs.existsSync(cachedPath)) {
        return { command: cachedPath, source: 'cached' };
    }

    return { command: BUNDLED_BINARY_NAME, source: 'path' };
}

/** The binary staged inside this extension's own package at build time (see tools/build-sharplsp.js), if any - currently only for the current host platform. Never silently resolved; only offered through the not-installed notice/menu. */
export function getBundledCommand(context: vscode.ExtensionContext): string | undefined {
    const bundledPath = context.asAbsolutePath(path.join('dist', 'sharplsp', detectPlatform(), BUNDLED_BINARY_NAME));
    return fs.existsSync(bundledPath) ? bundledPath : undefined;
}

/** Path to a specific `dotnet` executable for the SharpLsp sidecar (portable/user-local SDK installs not on PATH). Same trust gate as resolveSharpLspCommand. */
export function resolveDotnetPath(): string | undefined {
    const dotnetPath = getTrustedConfig('sharpLsp.dotnetPath', '');
    return dotnetPath && fs.existsSync(dotnetPath) ? dotnetPath : undefined;
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
