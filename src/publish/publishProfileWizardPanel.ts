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
import { getPublishProfileWizardHtml } from './publishProfileWizardHtml';
import { refreshPublishPanelIfOpen } from './publishPanelRegistry';

const VIEW_TYPE = 'dotnetCreator.publishProfileWizard';

/** One wizard per project, keyed by resolved csproj path - mirrors publishPanel.ts's own Map pattern, since a user could reasonably have two different projects' wizards open at once (unlike Create New Project, which is workspace-wide and only ever makes sense as a single instance). */
const panels = new Map<string, vscode.WebviewPanel>();

/** Secret fields a save message may carry alongside the (secret-free) PublishProfile itself - present only for the target type currently selected, and only when the user actually typed something (omitted means "leave whatever's already stored unchanged"). Azure's password never appears here - it's captured directly by the Import Publish Settings handler below. */
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
 * Opens the profile creation/edit wizard - a one-shot panel, disposed as soon as Save succeeds or
 * the user cancels, mirroring newProjectPanel.ts's own showNewProjectPanel/handleCreate lifecycle.
 * Pass `existingProfile` to edit it in place instead of creating a new one; its `name` is what
 * gets overwritten on save (renaming happens from the Publish page, not here).
 */
export function showPublishProfileWizard(context: vscode.ExtensionContext, projectPath: string, existingProfile?: PublishProfile): void {
    const existingPanel = panels.get(projectPath);
    if (existingPanel) {
        existingPanel.reveal();
        return;
    }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        existingProfile ? `Edit Publish Profile: ${existingProfile.name}` : `New Publish Profile: ${projectName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    const codiconCssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'codicons', 'codicon.css'));
    panel.webview.html = getPublishProfileWizardHtml(panel.webview, codiconCssUri, projectName, PUBLISH_RUNTIME_IDENTIFIERS);

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'ready': {
                const frameworks = await listTargetFrameworks(projectPath);
                void panel.webview.postMessage({ command: 'targetFrameworks', frameworks });
                if (existingProfile) {
                    void panel.webview.postMessage({ command: 'editProfile', profile: existingProfile });
                }
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

                // The profile doesn't have a saved name yet on first-time creation until Save runs
                // - store the secret under whatever name is currently typed so it's associated with
                // the right profile once written; if the name changes before Save, this secret
                // will need re-importing, which is an acceptable edge case for a rarely-changed field.
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
