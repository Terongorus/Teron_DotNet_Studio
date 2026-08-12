import * as vscode from 'vscode';
import * as path from 'path';
import {
    listPackageReferences,
    addOrUpdatePackage,
    removePackage,
    listVulnerablePackages,
    listDeprecatedPackages,
    PackageReference,
    PackageVulnerability,
    PackageDeprecation
} from '../utils/nugetPackages';
import { searchPackages, getPackageVersions } from '../utils/nugetRegistry';
import { getNugetManagerHtml } from './nugetManagerHtml';

const VIEW_TYPE = 'dotnetCreator.nugetManager';

const panels = new Map<string, vscode.WebviewPanel>();
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('.NET NuGet');
    }
    return outputChannel;
}

/** One panel per project, keyed by resolved path - mirrors xamlDesignerPanel.ts's Map<filePath, WebviewPanel> pattern. */
export function showNugetManager(context: vscode.ExtensionContext, projectPath: string): void {
    const existing = panels.get(projectPath);
    if (existing) {
        existing.reveal();
        return;
    }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        `NuGet: ${projectName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    panel.webview.html = getNugetManagerHtml(panel.webview, projectName);

    let installed: PackageReference[] = [];
    let vulnerabilities = new Map<string, PackageVulnerability[]>();
    let deprecations = new Map<string, PackageDeprecation>();

    const refreshInstalled = async (): Promise<void> => {
        try {
            installed = await listPackageReferences(projectPath);
            void panel.webview.postMessage({ command: 'installedPackages', packages: installed });
            void checkForUpdates();
            void checkForAdvisories();
        } catch (error: any) {
            void panel.webview.postMessage({ command: 'searchError', message: error.message });
        }
    };

    /** Runs after the installed list refreshes - checks each package against NuGet's latest stable version, reported separately since it's slower than the local `dotnet list` call. */
    const checkForUpdates = async (): Promise<void> => {
        const currentInstalled = installed;
        const updates = await Promise.all(currentInstalled.map(async pkg => {
            try {
                const versions = await getPackageVersions(pkg.id);
                const latestStable = versions.find(v => !v.includes('-'));
                return { id: pkg.id, hasUpdate: !!latestStable && latestStable !== pkg.resolvedVersion };
            } catch {
                return { id: pkg.id, hasUpdate: false };
            }
        }));

        if (currentInstalled !== installed) { return; } // superseded by a newer refresh while this was in flight
        void panel.webview.postMessage({ command: 'updateAvailability', updates });
    };

    /**
     * Also runs after the installed list refreshes - unlike checkForUpdates() this is a single
     * project-wide `dotnet list package --vulnerable`/`--deprecated` call each (NuGetAudit,
     * GitHub Advisory Database-backed), not one request per package, and includes transitive
     * packages since a vulnerability pulled in indirectly is exactly as real a risk as a direct
     * one.
     */
    const checkForAdvisories = async (): Promise<void> => {
        const currentInstalled = installed;
        const [vulnResult, depResult] = await Promise.all([
            listVulnerablePackages(projectPath),
            listDeprecatedPackages(projectPath)
        ]);

        if (currentInstalled !== installed) { return; } // superseded by a newer refresh while this was in flight
        vulnerabilities = vulnResult;
        deprecations = depResult;
        void panel.webview.postMessage({
            command: 'packageAdvisories',
            vulnerabilities: Object.fromEntries(vulnerabilities),
            deprecations: Object.fromEntries(deprecations)
        });
    };

    const postDetails = async (packageId: string): Promise<void> => {
        const versions = await getPackageVersions(packageId);
        const installedRef = installed.find(p => p.id.toLowerCase() === packageId.toLowerCase());
        void panel.webview.postMessage({
            command: 'packageDetails',
            id: packageId,
            versions,
            installedVersion: installedRef?.resolvedVersion,
            vulnerabilities: vulnerabilities.get(packageId),
            deprecation: deprecations.get(packageId)
        });
    };

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'search': {
                try {
                    const results = await searchPackages(message.query);
                    void panel.webview.postMessage({ command: 'searchResults', results });
                } catch (error: any) {
                    void panel.webview.postMessage({ command: 'searchError', message: error.message });
                }
                break;
            }

            case 'selectPackage': {
                try {
                    await postDetails(message.id);
                } catch (error: any) {
                    void panel.webview.postMessage({ command: 'searchError', message: error.message });
                }
                break;
            }

            case 'install': {
                const channel = getOutputChannel();
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Installing ${message.id}${message.version ? ' ' + message.version : ''}...`,
                    cancellable: false
                }, async () => {
                    try {
                        channel.appendLine(`> dotnet add ${projectPath} package ${message.id}${message.version ? ' -v ' + message.version : ''}`);
                        await addOrUpdatePackage(projectPath, message.id, message.version);
                        await refreshInstalled();
                        await postDetails(message.id);
                        void panel.webview.postMessage({ command: 'actionDone', success: true, id: message.id, message: `Installed ${message.id}` });
                    } catch (error: any) {
                        channel.appendLine(`ERROR: ${error.message}`);
                        void panel.webview.postMessage({ command: 'actionDone', success: false, id: message.id, message: error.message });
                        const choice = await vscode.window.showErrorMessage(`Failed to install ${message.id}.`, 'Show Output');
                        if (choice === 'Show Output') { channel.show(); }
                    }
                });
                break;
            }

            case 'remove': {
                const confirm = await vscode.window.showWarningMessage(
                    `Remove ${message.id} from ${projectName}?`,
                    { modal: true },
                    'Remove'
                );
                if (confirm !== 'Remove') { break; }

                const channel = getOutputChannel();
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Removing ${message.id}...`,
                    cancellable: false
                }, async () => {
                    try {
                        channel.appendLine(`> dotnet remove ${projectPath} package ${message.id}`);
                        await removePackage(projectPath, message.id);
                        await refreshInstalled();
                        await postDetails(message.id);
                        void panel.webview.postMessage({ command: 'actionDone', success: true, id: message.id, message: `Removed ${message.id}` });
                    } catch (error: any) {
                        channel.appendLine(`ERROR: ${error.message}`);
                        void panel.webview.postMessage({ command: 'actionDone', success: false, id: message.id, message: error.message });
                        const choice = await vscode.window.showErrorMessage(`Failed to remove ${message.id}.`, 'Show Output');
                        if (choice === 'Show Output') { channel.show(); }
                    }
                });
                break;
            }
        }
    });

    // refreshInstalled() only ever ran on open and after this panel's own install/remove
    // actions - an external change to the .csproj (a source-control revert/checkout, a manual
    // edit in another editor, another tool) left the Installed tab silently stale until the
    // panel was closed and reopened. A FileSystemWatcher sees real disk changes regardless of
    // how they were made, unlike onDidSaveTextDocument, which only fires for VS Code's own
    // editor saves.
    const projectWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(path.dirname(projectPath)), path.basename(projectPath))
    );
    const handleProjectFileChange = () => void refreshInstalled();
    projectWatcher.onDidChange(handleProjectFileChange);
    projectWatcher.onDidCreate(handleProjectFileChange);
    projectWatcher.onDidDelete(handleProjectFileChange);

    panel.onDidDispose(() => {
        panels.delete(projectPath);
        projectWatcher.dispose();
    });

    panels.set(projectPath, panel);
    void refreshInstalled();
}
