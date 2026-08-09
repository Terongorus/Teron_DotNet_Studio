import * as vscode from 'vscode';
import { parse } from 'jsonc-parser';
import { appendMissingJsoncArrayEntries, mergeIntoGlobalConfigurationArray } from '../utils/jsoncMerge';
import {
    RECOMMENDED_TASKS,
    RECOMMENDED_TASK_INPUTS,
    RECOMMENDED_LAUNCH_CONFIGS,
    RECOMMENDED_LAUNCH_INPUTS,
    SETUP_MARKER_TASK_LABEL
} from '../utils/debugTaskDefinitions';

const GLOBAL_SETUP_DONE_KEY = 'dotnetCreator.globalDebugTasksSetupDone';
const GLOBAL_USER_TASKS_URI_KEY = 'dotnetCreator.userTasksFileUri';

const taskLabel = (entry: Record<string, unknown>) => entry.label as string;
const inputId = (entry: Record<string, unknown>) => entry.id as string;
const launchConfigName = (entry: Record<string, unknown>) => entry.name as string;

export function registerSetupDebugTasksCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.setupDebugTasks', () => setupDebugTasks(context));
    context.subscriptions.push(disposable);
}

async function setupDebugTasks(context: vscode.ExtensionContext): Promise<void> {
    const choice = await vscode.window.showQuickPick(
        [
            { label: 'This Workspace Only', value: 'workspace' as const },
            { label: 'Global (User Settings/Tasks)', value: 'global' as const }
        ],
        { title: 'Set Up .NET Debug/Build Tasks', placeHolder: 'Where should these be added?' }
    );

    if (!choice) { return; }

    if (choice.value === 'workspace') {
        await applyWorkspaceSetup();
    } else {
        await applyGlobalSetup(context);
    }
}

interface MergeSpec {
    path: (string | number)[];
    candidates: Record<string, unknown>[];
    identity: (entry: Record<string, unknown>) => string;
}

async function mergeIntoWorkspaceFile(uri: vscode.Uri, specs: MergeSpec[], skeleton: string): Promise<boolean> {
    let text: string;
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        text = Buffer.from(bytes).toString('utf8');
    } catch {
        text = skeleton;
    }

    let addedAny = false;
    for (const spec of specs) {
        const result = appendMissingJsoncArrayEntries(text, spec.path, spec.candidates, spec.identity);
        text = result.text;
        if (result.addedCount > 0) { addedAny = true; }
    }

    if (addedAny) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    }

    return addedAny;
}

async function applyWorkspaceSetup(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }

    const tasksAdded = await mergeIntoWorkspaceFile(
        vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks.json'),
        [
            { path: ['tasks'], candidates: RECOMMENDED_TASKS, identity: taskLabel },
            { path: ['inputs'], candidates: RECOMMENDED_TASK_INPUTS, identity: inputId }
        ],
        '{\n    "version": "2.0.0"\n}\n'
    );

    const launchAdded = await mergeIntoWorkspaceFile(
        vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json'),
        [
            { path: ['configurations'], candidates: RECOMMENDED_LAUNCH_CONFIGS, identity: launchConfigName },
            { path: ['inputs'], candidates: RECOMMENDED_LAUNCH_INPUTS, identity: inputId }
        ],
        '{\n    "version": "0.2.0"\n}\n'
    );

    vscode.window.showInformationMessage(
        tasksAdded || launchAdded
            ? '.NET debug/build tasks set up for this workspace.'
            : '.NET debug/build tasks were already set up for this workspace.'
    );
}

function isUserTasksUri(uri: vscode.Uri): boolean {
    return /[\\/]User[\\/]tasks\.json$/.test(uri.fsPath);
}

function raceActiveEditorChange(timeoutMs: number): Promise<vscode.TextEditor | undefined> {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            disposable.dispose();
            resolve(vscode.window.activeTextEditor);
        }, timeoutMs);

        const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isUserTasksUri(editor.document.uri)) {
                clearTimeout(timeout);
                disposable.dispose();
                resolve(editor);
            }
        });
    });
}

/**
 * Opens (or creates) the User Tasks file via the real, documented
 * `workbench.action.tasks.openUserTasks` command - there's no public API
 * for the resolved User-data-dir path, so this is the only reliable,
 * portable way to get there (works the same under portable installs,
 * custom --user-data-dir, and Remote-SSH/WSL/Codespaces). Verifies the
 * opened document by URI shape rather than assuming activeTextEditor
 * updates synchronously with the command's promise resolution.
 */
async function resolveUserTasksDocument(): Promise<vscode.TextDocument> {
    await vscode.commands.executeCommand('workbench.action.tasks.openUserTasks');

    let editor = vscode.window.activeTextEditor;
    if (!editor || !isUserTasksUri(editor.document.uri)) {
        editor = await raceActiveEditorChange(1500);
    }
    if (!editor || !isUserTasksUri(editor.document.uri)) {
        throw new Error('Could not locate the opened User Tasks document.');
    }
    return editor.document;
}

async function mergeIntoUserTasksDocument(document: vscode.TextDocument): Promise<boolean> {
    let text = document.getText();

    let addedAny = false;
    const tasksResult = appendMissingJsoncArrayEntries(text, ['tasks'], RECOMMENDED_TASKS, taskLabel);
    text = tasksResult.text;
    if (tasksResult.addedCount > 0) { addedAny = true; }

    const inputsResult = appendMissingJsoncArrayEntries(text, ['inputs'], RECOMMENDED_TASK_INPUTS, inputId);
    text = inputsResult.text;
    if (inputsResult.addedCount > 0) { addedAny = true; }

    if (addedAny) {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, text);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }

    return addedAny;
}

/** Non-disruptive fast path for a re-run once we already know the file's Uri - no editor tab, direct fs read/write. */
async function mergeIntoUserTasksFileAtUri(uri: vscode.Uri): Promise<boolean> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    let text = Buffer.from(bytes).toString('utf8');

    let addedAny = false;
    const tasksResult = appendMissingJsoncArrayEntries(text, ['tasks'], RECOMMENDED_TASKS, taskLabel);
    text = tasksResult.text;
    if (tasksResult.addedCount > 0) { addedAny = true; }

    const inputsResult = appendMissingJsoncArrayEntries(text, ['inputs'], RECOMMENDED_TASK_INPUTS, inputId);
    text = inputsResult.text;
    if (inputsResult.addedCount > 0) { addedAny = true; }

    if (addedAny) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    }

    return addedAny;
}

async function mergeIntoUserTasksFile(context: vscode.ExtensionContext): Promise<boolean> {
    const cachedUriString = context.globalState.get<string>(GLOBAL_USER_TASKS_URI_KEY);

    if (cachedUriString) {
        try {
            const uri = vscode.Uri.parse(cachedUriString);
            await vscode.workspace.fs.stat(uri);
            return await mergeIntoUserTasksFileAtUri(uri);
        } catch {
            // Cached Uri no longer valid (file deleted, etc.) - fall through to reopening.
        }
    }

    const document = await resolveUserTasksDocument();
    await context.globalState.update(GLOBAL_USER_TASKS_URI_KEY, document.uri.toString());
    return mergeIntoUserTasksDocument(document);
}

async function applyGlobalSetup(context: vscode.ExtensionContext): Promise<void> {
    const launchConfigsResult = await mergeIntoGlobalConfigurationArray(
        'launch', 'configurations', RECOMMENDED_LAUNCH_CONFIGS, launchConfigName
    );
    const launchInputsResult = await mergeIntoGlobalConfigurationArray(
        'launch', 'inputs', RECOMMENDED_LAUNCH_INPUTS, inputId
    );
    const tasksAdded = await mergeIntoUserTasksFile(context);

    await context.globalState.update(GLOBAL_SETUP_DONE_KEY, true);

    const anyAdded = launchConfigsResult.addedCount > 0 || launchInputsResult.addedCount > 0 || tasksAdded;
    vscode.window.showInformationMessage(
        anyAdded
            ? '.NET debug/build tasks set up globally (User Settings/Tasks).'
            : '.NET debug/build tasks were already set up globally.'
    );
}

async function hasWorkspaceSetup(folder: vscode.WorkspaceFolder): Promise<boolean> {
    try {
        const uri = vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks.json');
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        const parsed = text.trim().length === 0 ? {} : parse(text);
        const tasks: unknown = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).tasks : undefined;
        return Array.isArray(tasks) && tasks.some(t => t && typeof t === 'object' && (t as Record<string, unknown>).label === SETUP_MARKER_TASK_LABEL);
    } catch {
        return false;
    }
}

/**
 * One-time activation prompt, mirroring commands/startPage.ts's
 * maybeShowStartPageOnStartup precedent. Global-scope detection is a
 * globalState flag set only after this extension's own successful global
 * write - deliberately not a peek at the real User Tasks file, which would
 * mean an unwanted editor tab opening on every single activation.
 */
export async function maybeShowSetupDebugTasksPrompt(context: vscode.ExtensionContext): Promise<void> {
    const offerSetup = vscode.workspace.getConfiguration('dotnet-creator').get<boolean>('offerDebugTaskSetup', true);
    if (!offerSetup) { return; }

    if (context.globalState.get<boolean>(GLOBAL_SETUP_DONE_KEY, false)) { return; }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { return; }

    const hasCsproj = (await vscode.workspace.findFiles('**/*.csproj', '**/{bin,obj,node_modules}/**', 1)).length > 0;
    if (!hasCsproj) { return; }

    if (await hasWorkspaceSetup(folder)) { return; }

    const choice = await vscode.window.showInformationMessage(
        'This workspace looks like a .NET project without debug/build tasks set up for it.',
        'Set Up',
        "Don't Ask Again"
    );

    if (choice === 'Set Up') {
        await setupDebugTasks(context);
    } else if (choice === "Don't Ask Again") {
        await vscode.workspace.getConfiguration('dotnet-creator').update('offerDebugTaskSetup', false, vscode.ConfigurationTarget.Global);
    }
}
