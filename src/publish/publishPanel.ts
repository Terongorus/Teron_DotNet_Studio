import * as vscode from 'vscode';
import * as path from 'path';
import {
    PublishProfile,
    PUBLISH_RUNTIME_IDENTIFIERS,
    listPublishProfiles,
    readPublishProfile,
    writePublishProfile,
    deletePublishProfile,
    renamePublishProfile,
    defaultPublishProfile,
    isValidProfileName,
    listTargetFrameworks
} from '../utils/publishProfiles';
import { publishProject } from '../commands/publishActions';
import { getPublishHtml } from './publishHtml';

const VIEW_TYPE = 'dotnetCreator.publish';

const panels = new Map<string, vscode.WebviewPanel>();

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
                const name = await vscode.window.showInputBox({
                    title: 'New Publish Profile',
                    prompt: 'Profile name',
                    value: `FolderProfile${(await listPublishProfiles(projectPath)).length + 1}`,
                    validateInput: value => isValidProfileName(value) ? undefined : 'Enter a valid file name.'
                });
                if (!name) { break; }

                const frameworks = await listTargetFrameworks(projectPath);
                const profile = defaultPublishProfile(name, frameworks[0] ?? '');
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

            case 'saveProfile': {
                await writePublishProfile(projectPath, message.profile as PublishProfile);
                void panel.webview.postMessage({ command: 'status', message: 'Profile saved.' });
                break;
            }

            case 'publish': {
                const profile = message.profile as PublishProfile;
                const succeeded = await publishProject(projectPath, projectName, profile);
                void panel.webview.postMessage({
                    command: 'status',
                    message: succeeded
                        ? `Published to ${profile.publishDir}`
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
