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
import { registerBuildShortcutCommands } from './commands/buildShortcutCommands';
import { registerDebugSessionTracker } from './utils/debugSessionTracker';
import { registerResourceMonitorPanel } from './resourceMonitor/resourceMonitorProvider';
import { registerProfilerCommands } from './commands/profilerCommands';
import { registerManageNugetPackagesCommand } from './commands/manageNugetPackages';
import { registerActiveWorkspaceFolderTracker } from './utils/activeWorkspaceFolder';
import { warmFolderState, disposeFolderStateWatchers } from './utils/folderState';
import { registerSolutionExplorerView } from './solutionExplorer/solutionExplorerProvider';
import { registerSolutionExplorerCommands } from './solutionExplorer/solutionExplorerCommands';
import { hasAnyDotnetProject } from './utils/workspaceHasProject';
import { SharpLspClientManager } from './languageServer/sharpLspClient';
import { registerSharpLspStatusBarItem } from './languageServer/sharpLspStatusBarItem';
import { registerLanguageServerCommands } from './commands/languageServerCommands';
import { RoslynClientManager } from './languageServer/roslynClient';
import { registerRoslynStatusBarItem } from './languageServer/roslynStatusBarItem';
import { registerRoslynCommands } from './commands/roslynCommands';
import { registerSwitchLanguageServerCommand, LanguageServerChoice } from './commands/switchLanguageServer';
import { NetcoredbgAdapterFactory } from './debugAdapter/netcoredbgAdapterFactory';
import { registerDebugAdapterCommands } from './commands/debugAdapterCommands';
import { registerNetcoredbgConfigurationProvider } from './debugAdapter/netcoredbgConfigurationProvider';
import { registerExtensionUpdateCommands, checkForExtensionUpdate } from './utils/extensionUpdateCheck';

const WORKSPACE_HAS_PROJECT_CONTEXT = 'dotnet-creator.workspaceHasProject';
const SHARPLSP_LANGUAGE_IDS = ['csharp', 'fsharp'];

let sharpLsp: SharpLspClientManager | undefined;
let roslyn: RoslynClientManager | undefined;

async function warmAllWorkspaceFolders(): Promise<void> {
    await Promise.all((vscode.workspace.workspaceFolders ?? []).map(folder => warmFolderState(folder)));
}

async function updateWorkspaceHasProjectContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', WORKSPACE_HAS_PROJECT_CONTEXT, await hasAnyDotnetProject());
}

function getSelectedLanguageServer(): LanguageServerChoice {
    return vscode.workspace.getConfiguration('dotnet-creator').get<LanguageServerChoice>('languageServer', 'sharpLsp');
}

/** Mutually exclusive with maybeStartRoslyn() via dotnet-creator.languageServer - both managers exist so either can be restarted/switched to, but only the selected one's ensureStarted() ever actually runs here. */
async function maybeStartSharpLsp(manager: SharpLspClientManager, doc: vscode.TextDocument): Promise<void> {
    if (getSelectedLanguageServer() !== 'sharpLsp') { return; }
    if (!vscode.workspace.getConfiguration('dotnet-creator').get<boolean>('sharpLsp.enabled', true)) { return; }
    if (!SHARPLSP_LANGUAGE_IDS.includes(doc.languageId)) { return; }
    if (!(await hasAnyDotnetProject())) { return; }
    await manager.ensureStarted();
}

async function maybeStartRoslyn(manager: RoslynClientManager, doc: vscode.TextDocument): Promise<void> {
    if (getSelectedLanguageServer() !== 'roslyn') { return; }
    if (doc.languageId !== 'csharp') { return; }
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

    const debugAdapterFactory = new NetcoredbgAdapterFactory(context);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('dotnet-creator-debug', debugAdapterFactory));
    registerDebugAdapterCommands(context, debugAdapterFactory);
    registerNetcoredbgConfigurationProvider(context);

    registerStatusBarMenuCommands(context, debugAdapterFactory);
    registerSetupDebugTasksCommand(context);
    registerDebugKeybindingCommands(context);
    registerBuildShortcutCommands(context);
    registerExtensionUpdateCommands(context);
    void checkForExtensionUpdate(context);
    registerDebugSessionTracker(context);
    registerManageNugetPackagesCommand(context);
    registerActiveWorkspaceFolderTracker(context);
    registerSolutionStatusBarItem(context);
    registerProjectStatusBarItem(context);
    registerConfigurationStatusBarItem(context);

    const solutionExplorerProvider = registerSolutionExplorerView(context);
    registerSolutionExplorerCommands(context, solutionExplorerProvider);

    sharpLsp = new SharpLspClientManager(context);
    roslyn = new RoslynClientManager(context);
    registerSharpLspStatusBarItem(context, sharpLsp);
    registerLanguageServerCommands(context, sharpLsp);
    registerRoslynStatusBarItem(context, roslyn);
    registerRoslynCommands(context, roslyn);
    registerSwitchLanguageServerCommand(context, sharpLsp, roslyn);

    const resourceMonitorProvider = registerResourceMonitorPanel(context, sharpLsp);
    registerProfilerCommands(context, sharpLsp, resourceMonitorProvider);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            void maybeStartSharpLsp(sharpLsp!, doc);
            void maybeStartRoslyn(roslyn!, doc);
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            // Fires for both the "Switch Language Server" command (which already does this
            // itself, so this is a harmless no-op restart there) and a direct Settings UI/
            // settings.json edit - the latter has no other trigger to start the newly selected
            // server, since maybeStartSharpLsp/maybeStartRoslyn only run on document-open and
            // any relevant C# file is typically already open by the time someone flips this
            // setting. Stop whichever is no longer selected, then start the newly selected one
            // (mirrors switchLanguageServer.ts's own stop-then-start pair) so switching via
            // settings offers the same install prompt switching via the command does.
            if (!e.affectsConfiguration('dotnet-creator.languageServer')) { return; }
            const selected = getSelectedLanguageServer();
            if (selected === 'roslyn') {
                void sharpLsp?.stop();
                void roslyn?.ensureStarted();
            } else {
                void roslyn?.stop();
                void sharpLsp?.ensureStarted();
            }
        }),
        { dispose: () => sharpLsp?.dispose() },
        { dispose: () => roslyn?.dispose() }
    );
    for (const doc of vscode.workspace.textDocuments) {
        void maybeStartSharpLsp(sharpLsp, doc);
        void maybeStartRoslyn(roslyn, doc);
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
    void roslyn?.dispose();
}
