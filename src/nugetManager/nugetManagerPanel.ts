import * as vscode from 'vscode';
import * as path from 'path';
import { listPackageReferences, addOrUpdatePackage, removePackage, PackageReference } from '../utils/nugetPackages';
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

    const refreshInstalled = async (): Promise<void> => {
        try {
            installed = await listPackageReferences(projectPath);
            void panel.webview.postMessage({ command: 'installedPackages', packages: installed });
        } catch (error: any) {
            void panel.webview.postMessage({ command: 'searchError', message: error.message });
        }
    };

    const postDetails = async (packageId: string): Promise<void> => {
        const versions = await getPackageVersions(packageId);
        const installedRef = installed.find(p => p.id.toLowerCase() === packageId.toLowerCase());
        void panel.webview.postMessage({
            command: 'packageDetails',
            id: packageId,
            versions,
            installedVersion: installedRef?.resolvedVersion
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

    panel.onDidDispose(() => { panels.delete(projectPath); });

    panels.set(projectPath, panel);
    void refreshInstalled();
}
