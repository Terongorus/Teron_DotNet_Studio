import * as vscode from 'vscode';
import * as path from 'path';
import {
    PublishProfile,
    PUBLISH_RUNTIME_IDENTIFIERS,
    writePublishProfile,
    writeWebDeployPassword,
    isValidProfileName,
    listTargetFrameworks
} from '../utils/publishProfiles';
import { storePublishSecret } from '../utils/publishSecrets';
import { readAndParsePublishSettingsFile } from './azurePublishSettingsImport';
import { getNewPublishProfileHtml } from './newPublishProfileHtml';
import { refreshPublishPanelIfOpen } from './publishPanelRegistry';

const VIEW_TYPE = 'dotnetCreator.newPublishProfile';

/** One panel per project, keyed by resolved csproj path - mirrors publishPanel.ts's own Map pattern. */
const panels = new Map<string, vscode.WebviewPanel>();

/** Secret fields a save message may carry alongside the (secret-free) PublishProfile itself - present only for the target type currently selected, and only when the user actually typed something. Azure's password never appears here - it's captured directly by the Import Publish Settings handler below. */
interface PublishSecretBag {
    webDeployPassword?: string;
    containerRegistryPassword?: string;
    sftpPassword?: string;
    sftpPrivateKeyPassphrase?: string;
}

async function persistSecrets(context: vscode.ExtensionContext, projectPath: string, profile: PublishProfile, secret: PublishSecretBag | undefined): Promise<void> {
    if (!secret) { return; }
    if (secret.webDeployPassword) { await writeWebDeployPassword(projectPath, profile.name, secret.webDeployPassword); }
    if (secret.containerRegistryPassword) { await storePublishSecret(context, projectPath, profile.name, 'containerRegistryPassword', secret.containerRegistryPassword); }
    if (secret.sftpPassword) { await storePublishSecret(context, projectPath, profile.name, 'sftpPassword', secret.sftpPassword); }
    if (secret.sftpPrivateKeyPassphrase) { await storePublishSecret(context, projectPath, profile.name, 'sftpPrivateKeyPassphrase', secret.sftpPrivateKeyPassphrase); }
}

/**
 * Opens the new-profile form - a one-shot panel, disposed as soon as Save succeeds or the user
 * cancels. Kept as its own module/panel (not shared with editPublishProfilePanel.ts behind an
 * "existingProfile?" flag) so this flow's message handling only ever deals with brand-new profiles.
 */
export function showNewPublishProfileWizard(context: vscode.ExtensionContext, projectPath: string): void {
    const existingPanel = panels.get(projectPath);
    if (existingPanel) {
        existingPanel.reveal();
        return;
    }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        `New Publish Profile: ${projectName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    panel.webview.html = getNewPublishProfileHtml(panel.webview, projectName, PUBLISH_RUNTIME_IDENTIFIERS);

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'ready': {
                const frameworks = await listTargetFrameworks(projectPath);
                void panel.webview.postMessage({ command: 'targetFrameworks', frameworks });
                break;
            }

            case 'validateName': {
                const error = isValidProfileName(message.value) ? undefined : 'Enter a valid file name.';
                void panel.webview.postMessage({ command: 'nameValidation', error });
                break;
            }

            case 'browseFolder': {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    defaultUri: vscode.Uri.file(path.dirname(projectPath)),
                    title: 'Select Publish Target Location'
                });
                if (!picked || picked.length === 0) { break; }

                const relative = path.relative(path.dirname(projectPath), picked[0].fsPath);
                const displayPath = (relative && !relative.startsWith('..') ? relative : picked[0].fsPath) + path.sep;
                void panel.webview.postMessage({ command: 'folderPicked', path: displayPath });
                break;
            }

            case 'browsePrivateKeyFile': {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    title: 'Select SFTP Private Key'
                });
                if (!picked || picked.length === 0) { break; }
                void panel.webview.postMessage({ command: 'privateKeyFilePicked', path: picked[0].fsPath });
                break;
            }

            case 'browsePublishSettingsFile': {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 'Publish Settings': ['PublishSettings'] },
                    title: 'Import Azure Publish Settings'
                });
                if (!picked || picked.length === 0) { break; }

                const credentials = await readAndParsePublishSettingsFile(picked[0].fsPath);
                if (!credentials) {
                    void vscode.window.showErrorMessage('Could not find a usable ZipDeploy/MSDeploy profile in that .PublishSettings file.');
                    break;
                }

                // The profile doesn't have a saved name yet until Save runs - store the secret
                // under whatever name is currently typed so it's associated with the right profile
                // once written; if the name changes before Save, this secret will need
                // re-importing, an acceptable edge case for a rarely-changed field.
                const profileName = message.profileName as string;
                if (profileName && isValidProfileName(profileName)) {
                    await storePublishSecret(context, projectPath, profileName, 'azureAppServicePassword', credentials.password);
                }
                void panel.webview.postMessage({
                    command: 'publishSettingsImported',
                    azurePublishUrl: credentials.publishUrl,
                    azureSiteName: credentials.siteName,
                    azureUsername: credentials.userName
                });
                break;
            }

            case 'save': {
                const profile = message.profile as PublishProfile;
                if (!isValidProfileName(profile.name)) {
                    void panel.webview.postMessage({ command: 'saveFailed', message: 'Enter a valid profile name.' });
                    break;
                }
                try {
                    await writePublishProfile(projectPath, profile);
                    await persistSecrets(context, projectPath, profile, message.secret as PublishSecretBag | undefined);
                    refreshPublishPanelIfOpen(projectPath, profile.name);
                    panel.dispose();
                } catch (error) {
                    void panel.webview.postMessage({ command: 'saveFailed', message: `Failed to save: ${error instanceof Error ? error.message : String(error)}` });
                }
                break;
            }

            case 'cancel':
                panel.dispose();
                break;
        }
    });

    panel.onDidDispose(() => {
        panels.delete(projectPath);
    });

    panels.set(projectPath, panel);
}
