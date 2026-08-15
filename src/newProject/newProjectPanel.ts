import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from '../utils/process';
import { isValidProjectName, isValidPackageId } from '../utils/validation';
import { getProjectTemplates, classifyTemplate, ClassifiedTemplate } from '../utils/templates';
import { pickExistingSolution } from '../utils/solutionPicker';
import { addRecentItem } from '../startPage/recentItems';
import { openFolderUnlessAlreadyOpen } from '../utils/openFolder';
import { getNewProjectHtml } from './newProjectHtml';
import { getRecentTemplates, addRecentTemplate } from './recentTemplates';

const VIEW_TYPE = 'dotnetCreator.newProject';
// A persisted UI preference, not a settings.json-visible setting - mirrors how recentTemplates.ts
// stores its own wizard-only state. Defaults to false: Visual Studio's own Configure page doesn't
// enable this by default either, so a first-run user sees the same starting point VS would show.
const PLACE_TOGETHER_KEY = 'dotnet-studio.newProject.placeSolutionAndProjectTogether';

type CreateMode = 'standalone' | 'newSolution' | 'existingSolution';

interface CreateMessage {
    templateShortName: string;
    templateName: string;
    projectName: string;
    mode: CreateMode;
    /** standalone/newSolution only - the base folder the user picked/typed. */
    location?: string;
    /** newSolution only. */
    solutionName?: string;
    /** newSolution only - true places the .slnx directly in the project's own folder. */
    placeTogether?: boolean;
    /** existingSolution only. */
    existingSlnPath?: string;
}

interface CreateTarget {
    /** Where `dotnet new <template>` actually scaffolds into. */
    projectFolder: string;
    /** Set only when a solution is involved (newSolution/existingSolution). */
    solutionFolder?: string;
    slnPath?: string;
    /** Set only for newSolution - the solution doesn't exist yet and must be created first. */
    newSolutionName?: string;
}

function resolveCreateTarget(message: CreateMessage): CreateTarget {
    if (message.mode === 'standalone') {
        return { projectFolder: path.join(message.location!, message.projectName) };
    }
    if (message.mode === 'newSolution') {
        const solutionFolder = message.placeTogether
            ? path.join(message.location!, message.projectName)
            : path.join(message.location!, message.solutionName!);
        const projectFolder = message.placeTogether ? solutionFolder : path.join(solutionFolder, message.projectName);
        return {
            projectFolder,
            solutionFolder,
            slnPath: path.join(solutionFolder, `${message.solutionName}.slnx`),
            newSolutionName: message.solutionName
        };
    }
    // existingSolution
    const solutionFolder = path.dirname(message.existingSlnPath!);
    return { projectFolder: path.join(solutionFolder, message.projectName), solutionFolder, slnPath: message.existingSlnPath };
}

let currentPanel: vscode.WebviewPanel | undefined;

let unclassifiedTagOutput: vscode.OutputChannel | undefined;
// Tracked for the life of the extension host, not per-panel - so re-opening the wizard doesn't
// re-log tags this session has already reported.
const loggedTypeTags = new Set<string>();

/**
 * `classifyTemplate()`'s platform/type split relies on a fixed, hand-maintained vocabulary of
 * platform words (see PLATFORM_TAG_WORDS in utils/templates.ts) - there's no way to algorithmically
 * know whether an unfamiliar Tags token is a platform name or a project-type name, so this can't
 * auto-correct anything. What it CAN do cheaply: surface the raw tag tokens that landed in the
 * "type" bucket, once each per session, so a genuinely new platform word (e.g. from a workload
 * installed later) gets a visible pointer to update that vocabulary instead of silently blending
 * into the Type filter unnoticed.
 */
function logUnfamiliarTypeTags(classified: ClassifiedTemplate[]): void {
    const newTags = new Set<string>();
    for (const t of classified) {
        for (const tag of t.types) {
            if (!loggedTypeTags.has(tag)) {
                loggedTypeTags.add(tag);
                newTags.add(tag);
            }
        }
    }
    if (newTags.size === 0) { return; }

    if (!unclassifiedTagOutput) {
        unclassifiedTagOutput = vscode.window.createOutputChannel('.NET Studio: Create New Project');
    }
    unclassifiedTagOutput.appendLine(
        `Template tag(s) classified as project type (not platform): ${[...newTags].sort().join(', ')}. ` +
        'If any of these is actually a platform name, add it to PLATFORM_TAG_WORDS in src/utils/templates.ts.'
    );
}

/** Single-instance wizard panel, disposed as soon as project creation succeeds (or the user cancels). */
export function showNewProjectPanel(context: vscode.ExtensionContext): void {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Active);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        'Create .NET Project',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'appicon.png');
    const codiconCssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'codicons', 'codicon.css'));
    panel.webview.html = getNewProjectHtml(panel.webview, codiconCssUri);

    const postTemplates = async (): Promise<void> => {
        const templates = await getProjectTemplates();
        const classified = templates.map(classifyTemplate);
        logUnfamiliarTypeTags(classified);
        void panel.webview.postMessage({
            command: 'templates',
            templates: classified,
            recent: getRecentTemplates(context.globalState),
            placeTogether: context.globalState.get<boolean>(PLACE_TOGETHER_KEY, false)
        });
    };

    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'ready':
                await postTemplates();
                break;

            case 'installTemplate': {
                const packageId = await vscode.window.showInputBox({
                    title: 'Install New Template',
                    prompt: 'Enter the NuGet package ID of the template',
                    placeHolder: 'e.g., Microsoft.Web.Library.ProjectTemplates',
                    validateInput: isValidPackageId
                });
                if (!packageId) { break; }

                void panel.webview.postMessage({ command: 'status', message: `Installing template: ${packageId}...` });
                try {
                    await runDotnet(['new', 'install', packageId]);
                    void panel.webview.postMessage({ command: 'status', message: `Installed ${packageId}.` });
                    await postTemplates();
                } catch (error: any) {
                    void panel.webview.postMessage({ command: 'status', message: `Failed to install template: ${error.message}` });
                }
                break;
            }

            case 'validateName':
                void panel.webview.postMessage({ command: 'nameValidation', error: isValidProjectName(message.value) });
                break;

            case 'browseFolder': {
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Folder',
                    title: 'Create .NET Project'
                });
                if (!folderUri || folderUri.length === 0) { break; }
                void panel.webview.postMessage({ command: 'folderPicked', target: message.target, folderPath: folderUri[0].fsPath });
                break;
            }

            case 'chooseExistingSolution': {
                const slnPath = await pickExistingSolution();
                if (!slnPath) { break; }
                void panel.webview.postMessage({ command: 'solutionPicked', slnPath, solutionFolder: path.dirname(slnPath) });
                break;
            }

            case 'placeTogetherChanged':
                await context.globalState.update(PLACE_TOGETHER_KEY, !!message.value);
                break;

            case 'create':
                await handleCreate(context, panel, message as CreateMessage);
                break;

            case 'cancel':
                panel.dispose();
                break;
        }
    });

    panel.onDidDispose(() => {
        currentPanel = undefined;
    });

    currentPanel = panel;
}

async function handleCreate(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, message: CreateMessage): Promise<void> {
    const { templateShortName, templateName, projectName, mode } = message;
    const target = resolveCreateTarget(message);

    if (fs.existsSync(target.projectFolder) && fs.readdirSync(target.projectFolder).length > 0) {
        const confirm = await vscode.window.showWarningMessage(
            `The folder "${target.projectFolder}" already exists and is not empty. Continue anyway?`,
            { modal: true },
            'Continue'
        );
        if (confirm !== 'Continue') {
            void panel.webview.postMessage({ command: 'createFailed', message: 'Cancelled.' });
            return;
        }
    }

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${projectName}...`,
            cancellable: false
        }, async () => {
            // newSolution's solution doesn't exist yet - create it before the project so `sln add`
            // below has something to add to. existingSolution's is already on disk.
            if (mode === 'newSolution') {
                await runDotnet(['new', 'sln', '-n', target.newSolutionName!, '-o', target.solutionFolder!, '--format', 'slnx']);
            }
            await runDotnet(['new', templateShortName, '-n', projectName, '-o', target.projectFolder]);
            if (target.slnPath) {
                await runDotnet(['sln', target.slnPath, 'add', target.projectFolder]);
            }
        });

        await addRecentItem(context.globalState, {
            kind: 'project',
            name: projectName,
            folderPath: target.solutionFolder ?? target.projectFolder
        });
        await addRecentTemplate(context.globalState, { shortName: templateShortName, name: templateName });

        vscode.window.showInformationMessage(`Successfully created ${projectName}!`);
        openFolderUnlessAlreadyOpen(target.solutionFolder ?? target.projectFolder);

        // Per design, the wizard is a one-shot flow - it's done once creation succeeds.
        panel.dispose();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
        void panel.webview.postMessage({ command: 'createFailed', message: error.message });
    }
}
