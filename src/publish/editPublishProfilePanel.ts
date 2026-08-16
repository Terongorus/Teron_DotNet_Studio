import * as vscode from 'vscode';
import * as path from 'path';
import {
    PublishProfile,
    PUBLISH_RUNTIME_IDENTIFIERS,
    writePublishProfile,
    writeWebDeployPassword,
    readWebDeployPassword,
    deletePublishProfile,
    isValidProfileName,
    listTargetFrameworks
} from '../utils/publishProfiles';
import { storePublishSecret, renamePublishSecrets } from '../utils/publishSecrets';
import { readAndParsePublishSettingsFile } from './azurePublishSettingsImport';
import { getEditPublishProfileHtml } from './editPublishProfileHtml';
import { refreshPublishPanelIfOpen } from './publishPanelRegistry';

const VIEW_TYPE = 'dotnetCreator.editPublishProfile';

/** One panel per project, keyed by resolved csproj path - mirrors publishPanel.ts's own Map pattern. */
const panels = new Map<string, vscode.WebviewPanel>();

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
 * Opens the edit-profile form for an existing profile - a one-shot panel, disposed as soon as Save
 * succeeds or the user cancels. Kept as its own module/panel (not shared with
 * newPublishProfilePanel.ts behind a flag) so renaming - the one thing edit needs that new-profile
 * creation never does - lives entirely in this file's save handler.
 */
export function showEditPublishProfileWizard(context: vscode.ExtensionContext, projectPath: string, existingProfile: PublishProfile): void {
    const existingPanel = panels.get(projectPath);
    if (existingPanel) {
        existingPanel.reveal();
        return;
    }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        `Edit Publish Profile: ${existingProfile.name}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    panel.webview.html = getEditPublishProfileHtml(panel.webview, projectName, PUBLISH_RUNTIME_IDENTIFIERS, existingProfile);

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

                // If the name has been edited away from the profile's saved name before this
                // import happens, this secret lands under the in-progress (not-yet-saved) name,
                // same acceptable edge case as the New Profile flow.
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
                const previousName = message.previousName as string;
                if (!isValidProfileName(profile.name)) {
                    void panel.webview.postMessage({ command: 'saveFailed', message: 'Enter a valid profile name.' });
                    break;
                }
                try {
                    const renamed = !!previousName && profile.name !== previousName;
                    if (renamed) {
                        // Carry forward whatever's already stored under the old name before
                        // writing the new file - persistSecrets() below then overwrites only the
                        // specific secrets the user actually retyped, same "blank = unchanged"
                        // semantics as an in-place edit.
                        if (profile.targetType === 'webServer') {
                            const existingPassword = await readWebDeployPassword(projectPath, previousName);
                            if (existingPassword) { await writeWebDeployPassword(projectPath, profile.name, existingPassword); }
                        }
                        await renamePublishSecrets(context, projectPath, previousName, profile.name);
                    }
                    await writePublishProfile(projectPath, profile);
                    await persistSecrets(context, projectPath, profile, message.secret as PublishSecretBag | undefined);
                    if (renamed) { await deletePublishProfile(projectPath, previousName); }
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
