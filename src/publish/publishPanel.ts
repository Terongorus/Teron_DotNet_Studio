import * as vscode from 'vscode';
import * as path from 'path';
import {
    PublishProfile,
    PublishTargetType,
    PUBLISH_RUNTIME_IDENTIFIERS,
    listPublishProfiles,
    readPublishProfile,
    writePublishProfile,
    writeWebDeployPassword,
    deletePublishProfile,
    renamePublishProfile,
    defaultPublishProfile,
    isValidProfileName,
    listTargetFrameworks
} from '../utils/publishProfiles';
import { storePublishSecret, renamePublishSecrets, deleteAllPublishSecrets } from '../utils/publishSecrets';
import { readAndParsePublishSettingsFile } from './azurePublishSettingsImport';
import { publishProject } from '../commands/publishActions';
import { getPublishHtml } from './publishHtml';

const VIEW_TYPE = 'dotnetCreator.publish';

const panels = new Map<string, vscode.WebviewPanel>();

/** Secret fields a saveProfile/publish message may carry alongside the (secret-free) PublishProfile itself - present only for the target type the profile is currently set to, and only when the user actually typed something (undefined/omitted means "leave whatever's already stored unchanged"). Azure's password is handled separately, entirely through the Import Publish Settings flow below - it's never typed directly into this form. */
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

/** One panel per project, keyed by resolved path - mirrors nugetManagerPanel.ts's Map<filePath, WebviewPanel> pattern. */
export function showPublishPanel(context: vscode.ExtensionContext, projectPath: string): void {
    const existing = panels.get(projectPath);
    if (existing) {
        existing.reveal();
        return;
    }

    const projectName = path.basename(projectPath, path.extname(projectPath));
    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        `Publish: ${projectName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    panel.webview.html = getPublishHtml(panel.webview, projectName, PUBLISH_RUNTIME_IDENTIFIERS);

    let selectedName: string | undefined;

    const postProfileList = async (selected?: string): Promise<void> => {
        const names = await listPublishProfiles(projectPath);
        selectedName = selected ?? (names.includes(selectedName ?? '') ? selectedName : names[0]);
        void panel.webview.postMessage({ command: 'profileList', names, selected: selectedName });
    };

    const postTargetFrameworks = async (): Promise<void> => {
        const frameworks = await listTargetFrameworks(projectPath);
        void panel.webview.postMessage({ command: 'targetFrameworks', frameworks });
    };

    const postProfile = async (name: string): Promise<void> => {
        const profile = await readPublishProfile(projectPath, name);
        if (profile) { void panel.webview.postMessage({ command: 'profileData', profile }); }
    };

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'newProfile': {
                const targetType = message.targetType as PublishTargetType;
                const namePrefixes: Record<PublishTargetType, string> = {
                    folder: 'FolderProfile',
                    azureAppService: 'AzureProfile',
                    containerRegistry: 'ContainerRegistryProfile',
                    webServer: 'WebServerProfile',
                    sftp: 'SftpProfile'
                };
                const name = await vscode.window.showInputBox({
                    title: 'New Publish Profile',
                    prompt: 'Profile name',
                    value: `${namePrefixes[targetType]}${(await listPublishProfiles(projectPath)).length + 1}`,
                    validateInput: value => isValidProfileName(value) ? undefined : 'Enter a valid file name.'
                });
                if (!name) { break; }

                const frameworks = await listTargetFrameworks(projectPath);
                const profile = defaultPublishProfile(name, frameworks[0] ?? '', targetType);
                await writePublishProfile(projectPath, profile);
                // The client's own 'profileList' handler follows up with 'selectProfile' once it
                // sees `selected: name`, which re-fetches target frameworks + profile data - no
                // need to duplicate those MSBuild/disk reads here.
                await postProfileList(name);
                break;
            }

            case 'selectProfile': {
                selectedName = message.name;
                await postTargetFrameworks();
                await postProfile(message.name);
                break;
            }

            case 'renameProfile': {
                const newName = await vscode.window.showInputBox({
                    title: 'Rename Publish Profile',
                    prompt: 'New profile name',
                    value: message.oldName,
                    validateInput: value => isValidProfileName(value) ? undefined : 'Enter a valid file name.'
                });
                if (!newName || newName === message.oldName) { break; }

                await renamePublishProfile(projectPath, message.oldName, newName);
                await renamePublishSecrets(context, projectPath, message.oldName, newName);
                await postProfileList(newName);
                break;
            }

            case 'deleteProfile': {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete publish profile "${message.name}"?`,
                    { modal: true },
                    'Delete'
                );
                if (confirm !== 'Delete') { break; }

                await deletePublishProfile(projectPath, message.name);
                await deleteAllPublishSecrets(context, projectPath, message.name);
                selectedName = undefined;
                await postProfileList();
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
                if (!selectedName) { break; }
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

                await storePublishSecret(context, projectPath, selectedName, 'azureAppServicePassword', credentials.password);
                void panel.webview.postMessage({
                    command: 'publishSettingsImported',
                    azurePublishUrl: credentials.publishUrl,
                    azureSiteName: credentials.siteName,
                    azureUsername: credentials.userName
                });
                break;
            }

            case 'saveProfile': {
                const profile = message.profile as PublishProfile;
                await writePublishProfile(projectPath, profile);
                await persistSecrets(context, projectPath, profile, message.secret as PublishSecretBag | undefined);
                void panel.webview.postMessage({ command: 'status', message: 'Profile saved.' });
                break;
            }

            case 'publish': {
                const profile = message.profile as PublishProfile;
                await persistSecrets(context, projectPath, profile, message.secret as PublishSecretBag | undefined);
                const succeeded = await publishProject(context, projectPath, projectName, profile);
                void panel.webview.postMessage({
                    command: 'status',
                    message: succeeded
                        ? (profile.targetType === 'folder' ? `Published to ${profile.publishDir}` : 'Published successfully.')
                        : 'Publish failed - see the ".NET Studio" terminal for details.'
                });
                if (!succeeded) {
                    const choice = await vscode.window.showErrorMessage(`Publish failed for ${projectName}.`, 'Show Terminal');
                    if (choice === 'Show Terminal') { vscode.window.terminals.find(t => t.name.includes('Publish'))?.show(); }
                }
                break;
            }
        }
    });

    panel.onDidDispose(() => {
        panels.delete(projectPath);
    });

    panels.set(projectPath, panel);

    // If a profile exists, the client's 'profileList' handler follows up with its own
    // 'selectProfile' message, which triggers postTargetFrameworks()/postProfile() below - no
    // need to duplicate those calls here for the initial load.
    void postProfileList();
}
