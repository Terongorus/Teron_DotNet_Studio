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
    registerSolutionStatusBarItem(context);
    registerProjectStatusBarItem(context);
    registerConfigurationStatusBarItem(context);

    maybeShowStartPageOnStartup(context);
    void maybeShowSetupDebugTasksPrompt(context);
}

export function deactivate() {
    disposeDesignerHost();
}
