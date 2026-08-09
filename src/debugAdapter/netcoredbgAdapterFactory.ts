import * as vscode from 'vscode';
import {
    resolveNetcoredbgCommand,
    probeNetcoredbg,
    getExtraArgs,
    RESOLVED_PATH_STATE_KEY,
    RESOLVED_VERSION_STATE_KEY
} from './netcoredbgLocator';
import { downloadLatestRelease } from './netcoredbgInstaller';
import {
    showNotInstalledNotice,
    showMisconfiguredPathNotice,
    showDownloadFailedNotice,
    showDownloadSucceededNotice
} from './netcoredbgNotifications';
import { maybeNotifyUpdate } from '../utils/toolUpdateCheck';

const NETCOREDBG_GITHUB_OWNER = 'Samsung';
const NETCOREDBG_GITHUB_REPO = 'netcoredbg';

/**
 * Unlike SharpLsp's long-lived LanguageClient, a debug adapter has no standing "running" state
 * to manage - VS Code calls createDebugAdapterDescriptor fresh for every debug session (each F5
 * press), so there's no restart-cap/crash-recovery logic needed here; that's between VS Code and
 * the DAP session itself once a real descriptor is returned.
 */
export class NetcoredbgAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async createDebugAdapterDescriptor(): Promise<vscode.DebugAdapterDescriptor | undefined> {
        const resolved = resolveNetcoredbgCommand(this.context);
        if ('misconfigured' in resolved) {
            showMisconfiguredPathNotice(resolved.detail);
            return undefined;
        }

        const probe = await probeNetcoredbg(resolved.command);
        if (probe.ok) {
            if (resolved.source === 'cached') {
                const knownVersion = this.context.globalState.get<string>(RESOLVED_VERSION_STATE_KEY);
                if (knownVersion) { void this.checkForUpdate(knownVersion); }
            }
            return this.makeExecutable(resolved.command);
        }
        if (probe.reason !== 'not-found') { return undefined; }

        const choice = await showNotInstalledNotice(this.context);

        if (choice === 'download') {
            const downloadedPath = await this.downloadAndCache();
            if (downloadedPath) { return this.makeExecutable(downloadedPath); }
        }

        // Returning undefined surfaces VS Code's own "no debug adapter descriptor" failure -
        // the not-installed notice already explained why and what to do; the user retries F5
        // once resolved (Download resolves inline above without needing that, since this
        // factory call is itself async and can just wait).
        return undefined;
    }

    /** Invoked by this factory's own not-installed notice and by the "Download netcoredbg" command. */
    async downloadAndCache(): Promise<string | undefined> {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'netcoredbg', cancellable: true },
            (progress, token) => downloadLatestRelease(this.context, progress, token)
        );

        if (!result.ok) {
            if (result.detail !== 'Cancelled.') { showDownloadFailedNotice(result.detail); }
            return undefined;
        }

        showDownloadSucceededNotice(result.version);
        await this.recordResolved(result.path, result.version);
        return result.path;
    }

    private async recordResolved(resolvedPath: string, version: string | undefined): Promise<void> {
        await this.context.globalState.update(RESOLVED_PATH_STATE_KEY, resolvedPath);
        await this.context.globalState.update(RESOLVED_VERSION_STATE_KEY, version);
    }

    private async checkForUpdate(currentVersion: string): Promise<void> {
        await maybeNotifyUpdate(this.context, 'debugAdapter', 'netcoredbg', NETCOREDBG_GITHUB_OWNER, NETCOREDBG_GITHUB_REPO, currentVersion, async () => { await this.downloadAndCache(); });
    }

    private makeExecutable(command: string): vscode.DebugAdapterExecutable {
        return new vscode.DebugAdapterExecutable(command, ['--interpreter=vscode', ...getExtraArgs()]);
    }
}
