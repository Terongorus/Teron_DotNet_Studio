import * as vscode from 'vscode';
import { pickCsprojFile, PickCsprojArgs } from '../utils/projectPicker';

/**
 * Not contributed to package.json's `commands` (and so doesn't appear in the
 * Command Palette) - this is an internal-use command meant to be referenced
 * from a `.vscode/tasks.json` or `launch.json` `"inputs"` entry with
 * `"type": "command"`, e.g.:
 *
 *   { "id": "pickCsproj", "type": "command", "command": "dotnet-creator.pickCsprojFile",
 *     "args": { "acceptIfOneFile": true } }
 */
export function registerPickCsprojFileCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.pickCsprojFile', (args?: PickCsprojArgs) => pickCsprojFile(args));
    context.subscriptions.push(disposable);
}
