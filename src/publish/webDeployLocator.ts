import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';

/**
 * Detects Web Deploy (msdeploy.exe) - required for the Web Server publish target. Confirmed via
 * research (not assumed): `dotnet publish -p:WebPublishMethod=MSDeploy` genuinely shells out to
 * msdeploy.exe under the hood during publish, so this is a real prerequisite, not a nice-to-have.
 * We only ever need to detect its presence here - MSBuild invokes it directly once publish runs,
 * this extension never spawns it itself.
 *
 * Follows the same tiered-resolution shape as netcoredbgLocator.ts/sharpLspLocator.ts, but
 * Install-Instructions-only (no auto-download): Web Deploy ships as a signed MSI installer, the
 * same class of tool as the Azure CLI/Docker CLI, not a single portable binary release asset like
 * netcoredbg.
 */
const BINARY_NAME = 'msdeploy.exe';

/** Web Deploy's own MSI installer does not reliably add itself to PATH, unlike most CLI tools - these are its real, documented default install locations across the still-current V3 and the older V2 installer, checked as a fallback tier before giving up and just trying the bare command name. */
const WELL_KNOWN_INSTALL_PATHS = [
    'C:\\Program Files\\IIS\\Microsoft Web Deploy V3\\msdeploy.exe',
    'C:\\Program Files (x86)\\IIS\\Microsoft Web Deploy V3\\msdeploy.exe',
    'C:\\Program Files\\IIS\\Microsoft Web Deploy\\msdeploy.exe'
];

export interface ResolvedCommand {
    command: string;
    source: 'configured' | 'well-known' | 'path';
}

export interface MisconfiguredPath {
    misconfigured: true;
    detail: string;
}

/** A workspace-scoped setting selecting a spawned executable is a real code-execution vector via a malicious repo's .vscode/settings.json - same guard as every other *.path setting in this extension. */
function getTrustedConfig<T>(key: string, defaultValue: T): T {
    if (!vscode.workspace.isTrusted) { return defaultValue; }
    return vscode.workspace.getConfiguration('dotnet-studio').get<T>(key, defaultValue);
}

/** Silent resolution order: (1) configured path, (2) a well-known default install location, (3) bare command name on PATH. No cached-download tier (unlike netcoredbg/SharpLsp/Roslyn) - there is nothing to download here. */
export function resolveWebDeployCommand(): ResolvedCommand | MisconfiguredPath {
    const configuredPath = getTrustedConfig('webDeploy.path', '');
    if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return { command: configuredPath, source: 'configured' };
        }
        return { misconfigured: true, detail: `dotnet-studio.webDeploy.path is set to "${configuredPath}", but no file exists there.` };
    }

    for (const candidate of WELL_KNOWN_INSTALL_PATHS) {
        if (fs.existsSync(candidate)) {
            return { command: candidate, source: 'well-known' };
        }
    }

    return { command: BINARY_NAME, source: 'path' };
}

export interface ProbeResult {
    ok: boolean;
    reason?: 'not-found' | 'error';
    detail?: string;
}

/** Short-lived precondition check before letting a Web Server publish start - mirrors probeNetcoredbg/probeSharpLsp. msdeploy.exe exits non-zero and prints a usage banner for `-?`, which is fine - only ENOENT (the binary genuinely isn't there) counts as "not found". */
export function probeWebDeploy(command: string): Promise<ProbeResult> {
    return new Promise(resolve => {
        cp.execFile(command, ['-?'], error => {
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
