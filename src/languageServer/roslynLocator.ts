import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';

/** context.globalState key holding the path to a binary previously fetched via roslynInstaller.ts. */
export const RESOLVED_PATH_STATE_KEY = 'dotnet-studio.roslyn.resolvedPath';
/** Sibling to RESOLVED_PATH_STATE_KEY - the version of whatever's stored there, for update-awareness comparisons on later sessions. */
export const RESOLVED_VERSION_STATE_KEY = 'dotnet-studio.roslyn.resolvedVersion';

const BINARY_NAME = process.platform === 'win32' ? 'Microsoft.CodeAnalysis.LanguageServer.exe' : 'Microsoft.CodeAnalysis.LanguageServer';

export interface ResolvedCommand {
    command: string;
    source: 'configured' | 'cached' | 'path';
}

export interface MisconfiguredPath {
    misconfigured: true;
    detail: string;
}

/**
 * The RID-style platform strings Microsoft's own package IDs use
 * (`Microsoft.CodeAnalysis.LanguageServer.<platform>`) - confirmed against the real, public
 * Azure DevOps feed (win-x64/linux-x64/osx-x64/neutral are the documented set; only win-x64 was
 * actually downloaded and inspected this session). No arm64-specific package was confirmed to
 * exist - falls back to the x64 package name for arm64 hosts rather than guessing a name that
 * might not exist; if that's wrong for a given platform, resolution simply fails cleanly rather
 * than silently misbehaving.
 */
export function detectPlatform(): string {
    if (process.platform === 'darwin') { return 'osx-x64'; }
    if (process.platform === 'linux') { return 'linux-x64'; }
    return 'win-x64';
}

/**
 * A workspace-scoped setting that selects/configures a spawned executable is a real
 * code-execution vector via a malicious repo's own .vscode/settings.json - same
 * [DIST-WORKSPACE-TRUST]-style guard sharpLspLocator.ts already applies, not an optional nicety.
 */
function getTrustedConfig<T>(key: string, defaultValue: T): T {
    if (!vscode.workspace.isTrusted) { return defaultValue; }
    return vscode.workspace.getConfiguration('dotnet-studio').get<T>(key, defaultValue);
}

/**
 * Silent resolution order, mirroring sharpLspLocator.ts's resolveSharpLspCommand() minus the
 * env-var tier (SharpLsp's own reference client defines SHARPLSP_EXECUTABLE_PATH as a real,
 * documented convention to mirror - there's no equivalent well-known env var for a standalone
 * Roslyn Language Server install, so inventing one here would just be a made-up convention no
 * other tool would ever set): (1) the user's own configured path, (2) a path cached from a
 * previous download, (3) the bare command name resolved via the shell's PATH (covers
 * `dotnet tool install --global roslyn-language-server`).
 */
export function resolveRoslynCommand(context: vscode.ExtensionContext): ResolvedCommand | MisconfiguredPath {
    const configuredPath = getTrustedConfig('roslyn.path', '');
    if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return { command: configuredPath, source: 'configured' };
        }
        return { misconfigured: true, detail: `dotnet-studio.roslyn.path is set to "${configuredPath}", but no file exists there.` };
    }

    const cachedPath = context.globalState.get<string>(RESOLVED_PATH_STATE_KEY);
    if (cachedPath && fs.existsSync(cachedPath)) {
        return { command: cachedPath, source: 'cached' };
    }

    return { command: BINARY_NAME, source: 'path' };
}

export function getExtraArgs(): string[] {
    return getTrustedConfig<string[]>('roslyn.extraArgs', []);
}

export interface ProbeResult {
    ok: boolean;
    reason?: 'not-found' | 'error';
    detail?: string;
}

/** Short-lived precondition check before ever spawning the real long-lived server - same shape as sharpLspLocator.ts's probeSharpLsp(). */
export function probeRoslyn(command: string): Promise<ProbeResult> {
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
                // Binary exists but didn't like these args (--version may not even be a real
                // supported flag) - the important signal is "can we spawn this at all", which we
                // just did.
                resolve({ ok: true });
            }
        });
    });
}
