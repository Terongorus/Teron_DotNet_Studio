import * as vscode from 'vscode';
import { registerNewProjectCommand } from './commands/newProject';
import { registerCreateSolutionCommand } from './commands/createSolution';
import { registerManageSolutionCommand } from './commands/manageSolution';
import { registerOpenExistingCommand } from './commands/openExisting';
import { registerStartPageCommand, maybeShowStartPageOnStartup } from './commands/startPage';

export function activate(context: vscode.ExtensionContext) {
    registerNewProjectCommand(context);
    registerCreateSolutionCommand(context);
    registerManageSolutionCommand(context);
    registerOpenExistingCommand(context);
    registerStartPageCommand(context);

    maybeShowStartPageOnStartup(context);
}

export function deactivate() {}
