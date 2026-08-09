import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { detectPlatform } from '../languageServer/sharpLspLocator';

/** context.globalState key holding the path to a netcoredbg binary either previously downloaded, or chosen via "Use Bundled". */
export const RESOLVED_PATH_STATE_KEY = 'dotnet-creator.debugAdapter.resolvedPath';
/** Sibling to RESOLVED_PATH_STATE_KEY - the version of whatever's stored there, for update-awareness comparisons on later sessions. */
export const RESOLVED_VERSION_STATE_KEY = 'dotnet-creator.debugAdapter.resolvedVersion';

const BUNDLED_BINARY_NAME = process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg';

export interface ResolvedCommand {
    command: string;
    source: 'configured' | 'env' | 'cached' | 'path';
}

export interface MisconfiguredPath {
    misconfigured: true;
    detail: string;
}

/**
 * Maps our own internal dist/<platform> naming (shared with sharpLspLocator's detectPlatform,
 * kept consistent across both bundled tools) to netcoredbg's own release-asset suffix.
 * netcoredbg publishes fewer platform combos than SharpLsp - no win32-arm64 or darwin-x64 asset
 * exists, confirmed against their actual releases.
 */
export function detectNetcoredbgAssetSuffix(): string | undefined {
    switch (detectPlatform()) {
        case 'win32-x64': return 'win64';
        case 'linux-x64': return 'linux-amd64';
        case 'linux-arm64': return 'linux-arm64';
        case 'darwin-arm64': return 'osx-arm64';
        default: return undefined;
    }
}

/** A workspace-scoped setting selecting a spawned executable is a real code-execution vector via a malicious repo's .vscode/settings.json - same [DIST-WORKSPACE-TRUST]-style guard as sharpLspLocator.ts. */
function getTrustedConfig<T>(key: string, defaultValue: T): T {
    if (!vscode.workspace.isTrusted) { return defaultValue; }
    return vscode.workspace.getConfiguration('dotnet-creator').get<T>(key, defaultValue);
}

/**
 * Silent resolution order, mirroring sharpLspLocator.ts's resolveSharpLspCommand exactly:
 * (1) configured path, (2) NETCOREDBG_EXECUTABLE_PATH env var (our own invented name - unlike
 * SHARPLSP_EXECUTABLE_PATH there's no upstream convention to mirror, since netcoredbg isn't
 * itself a VS Code extension author), (3) a path cached from a previous download or "Use
 * Bundled" choice, (4) bare command name on PATH. The bundled copy is deliberately never part
 * of this silent list - see getBundledCommand().
 */
export function resolveNetcoredbgCommand(context: vscode.ExtensionContext): ResolvedCommand | MisconfiguredPath {
    const configuredPath = getTrustedConfig('debugAdapter.path', '');
    if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return { command: configuredPath, source: 'configured' };
        }
        return { misconfigured: true, detail: `dotnet-creator.debugAdapter.path is set to "${configuredPath}", but no file exists there.` };
    }

    const envPath = process.env.NETCOREDBG_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return { command: envPath, source: 'env' };
    }

    const cachedPath = context.globalState.get<string>(RESOLVED_PATH_STATE_KEY);
    if (cachedPath && fs.existsSync(cachedPath)) {
        return { command: cachedPath, source: 'cached' };
    }

    return { command: BUNDLED_BINARY_NAME, source: 'path' };
}

/** The binary staged inside this extension's own package at build time (see tools/build-netcoredbg.js), currently Windows x64 only. Never silently resolved - only offered through the not-installed notice/menu. */
export function getBundledCommand(context: vscode.ExtensionContext): string | undefined {
    const bundledPath = context.asAbsolutePath(path.join('dist', 'netcoredbg', detectPlatform(), BUNDLED_BINARY_NAME));
    return fs.existsSync(bundledPath) ? bundledPath : undefined;
}

/** Reads the version.txt tools/build-netcoredbg.js writes alongside the staged binary, for update-awareness comparisons. */
export function getBundledVersion(context: vscode.ExtensionContext): string | undefined {
    const versionPath = context.asAbsolutePath(path.join('dist', 'netcoredbg', detectPlatform(), 'version.txt'));
    try {
        return fs.readFileSync(versionPath, 'utf8').trim();
    } catch {
        return undefined;
    }
}

export function getExtraArgs(): string[] {
    return getTrustedConfig<string[]>('debugAdapter.extraArgs', []);
}

export interface ProbeResult {
    ok: boolean;
    reason?: 'not-found' | 'error';
    detail?: string;
}

/** Short-lived precondition check before ever using the real binary - mirrors probeSharpLsp. */
export function probeNetcoredbg(command: string): Promise<ProbeResult> {
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
                resolve({ ok: true });
            }
        });
    });
}
