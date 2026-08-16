import * as vscode from 'vscode';
import * as path from 'path';
import {
    listPublishProfiles,
    readPublishProfile,
    deletePublishProfile,
    renamePublishProfile,
    isValidProfileName
} from '../utils/publishProfiles';
import { renamePublishSecrets, deleteAllPublishSecrets } from '../utils/publishSecrets';
import { publishProject } from '../commands/publishActions';
import { getPublishHtml } from './publishHtml';
import { showPublishProfileWizard } from './publishProfileWizardPanel';
import { registerPublishPanelRefresh, unregisterPublishPanelRefresh } from './publishPanelRegistry';

const VIEW_TYPE = 'dotnetCreator.publish';

const panels = new Map<string, vscode.WebviewPanel>();

/** One panel per project, keyed by resolved path - mirrors nugetManagerPanel.ts's Map<filePath, WebviewPanel> pattern. Lists profiles and shows a read-only preview of the selected one; creating/editing a profile's settings happens in the separate publishProfileWizardPanel.ts window instead. */
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
    panel.webview.html = getPublishHtml(panel.webview, projectName);

    let selectedName: string | undefined;

    const postProfileList = async (selected?: string): Promise<void> => {
        const names = await listPublishProfiles(projectPath);
        selectedName = selected ?? (names.includes(selectedName ?? '') ? selectedName : names[0]);
        void panel.webview.postMessage({ command: 'profileList', names, selected: selectedName });
    };

    const postProfile = async (name: string): Promise<void> => {
        const profile = await readPublishProfile(projectPath, name);
        if (profile) { void panel.webview.postMessage({ command: 'profileData', profile }); }
    };

    registerPublishPanelRefresh(projectPath, selectName_ => {
        void (async () => {
            await postProfileList(selectName_);
            if (selectedName) { await postProfile(selectedName); }
        })();
    });

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'newProfile': {
                showPublishProfileWizard(context, projectPath);
                break;
            }

            case 'editProfile': {
                const profile = await readPublishProfile(projectPath, message.name);
                if (!profile) { break; }
                showPublishProfileWizard(context, projectPath, profile);
                break;
            }

            case 'selectProfile': {
                selectedName = message.name;
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

            case 'publish': {
                const profile = message.profile;
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
        unregisterPublishPanelRefresh(projectPath);
    });

    panels.set(projectPath, panel);

    // If a profile exists, the client's own 'profileList' handler follows up with 'selectProfile',
    // which triggers postProfile() above - no need to duplicate that call here for the initial load.
    void postProfileList();
}
