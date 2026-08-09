import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';

/** context.globalState key holding the path to a binary previously fetched via sharpLspInstaller.ts, if any. */
export const DOWNLOADED_PATH_STATE_KEY = 'dotnet-creator.sharpLsp.downloadedPath';

export interface ResolvedCommand {
    command: string;
    source: 'configured' | 'downloaded' | 'path';
}

export interface MisconfiguredPath {
    misconfigured: true;
    detail: string;
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
 * Resolution order (adapted from SharpLsp's own resolveServerPath, minus the bundled-path
 * steps - this extension never bundles the binary): (1) the user's own configured path,
 * (2) a binary previously fetched via the optional "Download SharpLsp" action, (3) the bare
 * command name resolved via the shell's PATH (covers `cargo install sharplsp`).
 */
export function resolveSharpLspCommand(context: vscode.ExtensionContext): ResolvedCommand | MisconfiguredPath {
    const configuredPath = getTrustedConfig('sharpLsp.path', '');
    if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return { command: configuredPath, source: 'configured' };
        }
        return { misconfigured: true, detail: `dotnet-creator.sharpLsp.path is set to "${configuredPath}", but no file exists there.` };
    }

    const downloadedPath = context.globalState.get<string>(DOWNLOADED_PATH_STATE_KEY);
    if (downloadedPath && fs.existsSync(downloadedPath)) {
        return { command: downloadedPath, source: 'downloaded' };
    }

    return { command: process.platform === 'win32' ? 'sharplsp.exe' : 'sharplsp', source: 'path' };
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
