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

const WORKSPACE_HAS_PROJECT_CONTEXT = 'dotnet-creator.workspaceHasProject';

async function updateWorkspaceHasProjectContext(): Promise<void> {
    const hasCsproj = (await vscode.workspace.findFiles('**/*.csproj', '**/{bin,obj,node_modules}/**', 1)).length > 0;
    await vscode.commands.executeCommand('setContext', WORKSPACE_HAS_PROJECT_CONTEXT, hasCsproj);
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
    registerSolutionStatusBarItem(context);
    registerProjectStatusBarItem(context);
    registerConfigurationStatusBarItem(context);

    maybeShowStartPageOnStartup(context);
    void maybeShowSetupDebugTasksPrompt(context);

    void updateWorkspaceHasProjectContext();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void updateWorkspaceHasProjectContext();
    }));
}

export function deactivate() {
    disposeDesignerHost();
}
