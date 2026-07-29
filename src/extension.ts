import * as vscode from 'vscode';
import { registerNewProjectCommand } from './commands/newProject';
import { registerCreateSolutionCommand } from './commands/createSolution';
import { registerManageSolutionCommand } from './commands/manageSolution';

export function activate(context: vscode.ExtensionContext) {
    registerNewProjectCommand(context);
    registerCreateSolutionCommand(context);
    registerManageSolutionCommand(context);
}

export function deactivate() {}
