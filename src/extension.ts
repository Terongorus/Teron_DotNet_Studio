import * as vscode from 'vscode';
import { registerNewProjectCommand } from './commands/newProject';
import { registerCreateSolutionCommand } from './commands/createSolution';
import { registerManageSolutionCommand } from './commands/manageSolution';
import { registerOpenExistingCommand } from './commands/openExisting';
import { registerStartPageCommand, maybeShowStartPageOnStartup } from './commands/startPage';
import { registerXamlDesignerCommand } from './commands/xamlDesigner';
import { disposeDesignerHost } from './xamlDesigner/xamlDesignerPanel';
import { registerPickCsprojFileCommand } from './commands/pickCsprojFile';
import { registerProjectStatusBarItem } from './statusBar/projectStatusBarItem';
import { registerSolutionStatusBarItem } from './statusBar/solutionStatusBarItem';
import { registerConfigurationStatusBarItem } from './statusBar/configurationStatusBarItem';
import { registerPickConfigurationCommand } from './commands/pickConfiguration';
import { registerStatusBarMenuCommands } from './commands/statusBarMenus';
import { registerSetupDebugTasksCommand, maybeShowSetupDebugTasksPrompt } from './commands/setupDebugTasks';
import { registerDebugKeybindingCommands } from './commands/debugKeybindingCommands';
import { registerDebugSessionTracker } from './utils/debugSessionTracker';
import { registerResourceMonitorPanel } from './resourceMonitor/resourceMonitorProvider';
import { registerManageNugetPackagesCommand } from './commands/manageNugetPackages';
import { registerActiveWorkspaceFolderTracker } from './utils/activeWorkspaceFolder';
import { warmFolderState, disposeFolderStateWatchers } from './utils/folderState';
import { registerSolutionExplorerView } from './solutionExplorer/solutionExplorerProvider';
import { registerSolutionExplorerCommands } from './solutionExplorer/solutionExplorerCommands';
import { hasAnyDotnetProject } from './utils/workspaceHasProject';
import { SharpLspClientManager } from './languageServer/sharpLspClient';
import { registerSharpLspStatusBarItem } from './languageServer/sharpLspStatusBarItem';
import { registerLanguageServerCommands } from './commands/languageServerCommands';

const WORKSPACE_HAS_PROJECT_CONTEXT = 'dotnet-creator.workspaceHasProject';
const SHARPLSP_LANGUAGE_IDS = ['csharp', 'fsharp'];

let sharpLsp: SharpLspClientManager | undefined;

async function warmAllWorkspaceFolders(): Promise<void> {
    await Promise.all((vscode.workspace.workspaceFolders ?? []).map(folder => warmFolderState(folder)));
}

async function updateWorkspaceHasProjectContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', WORKSPACE_HAS_PROJECT_CONTEXT, await hasAnyDotnetProject());
}

async function maybeStartSharpLsp(manager: SharpLspClientManager, doc: vscode.TextDocument): Promise<void> {
    if (!vscode.workspace.getConfiguration('dotnet-creator').get<boolean>('sharpLsp.enabled', true)) { return; }
    if (!SHARPLSP_LANGUAGE_IDS.includes(doc.languageId)) { return; }
    if (!(await hasAnyDotnetProject())) { return; }
    await manager.ensureStarted();
}

export function activate(context: vscode.ExtensionContext) {
    registerNewProjectCommand(context);
    registerCreateSolutionCommand(context);
    registerManageSolutionCommand(context);
    registerOpenExistingCommand(context);
    registerStartPageCommand(context);
    registerXamlDesignerCommand(context);
    registerPickCsprojFileCommand(context);
    registerPickConfigurationCommand(context);
    registerStatusBarMenuCommands(context);
    registerSetupDebugTasksCommand(context);
    registerDebugKeybindingCommands(context);
    registerDebugSessionTracker(context);
    registerResourceMonitorPanel(context);
    registerManageNugetPackagesCommand(context);
    registerActiveWorkspaceFolderTracker(context);
    registerSolutionStatusBarItem(context);
    registerProjectStatusBarItem(context);
    registerConfigurationStatusBarItem(context);

    const solutionExplorerProvider = registerSolutionExplorerView(context);
    registerSolutionExplorerCommands(context, solutionExplorerProvider);

    sharpLsp = new SharpLspClientManager(context);
    registerSharpLspStatusBarItem(context, sharpLsp);
    registerLanguageServerCommands(context, sharpLsp);
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => void maybeStartSharpLsp(sharpLsp!, doc)),
        { dispose: () => sharpLsp?.dispose() }
    );
    for (const doc of vscode.workspace.textDocuments) {
        void maybeStartSharpLsp(sharpLsp, doc);
    }

    maybeShowStartPageOnStartup(context);
    void maybeShowSetupDebugTasksPrompt(context);

    void updateWorkspaceHasProjectContext();
    void warmAllWorkspaceFolders();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
        void updateWorkspaceHasProjectContext();
        void Promise.all(event.added.map(folder => warmFolderState(folder)));
    }));
}

export function deactivate() {
    disposeDesignerHost();
    disposeFolderStateWatchers();
    void sharpLsp?.dispose();
}
