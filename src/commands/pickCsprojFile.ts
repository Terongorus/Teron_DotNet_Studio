import * as vscode from 'vscode';
import { pickCsprojFile, getPickedCsprojFile, PickCsprojArgs } from '../utils/projectPicker';

/**
 * Neither command is contributed to package.json's `commands` (so neither
 * appears in the Command Palette) - both are internal-use, meant to be
 * referenced from a `.vscode/tasks.json` or `launch.json` `"inputs"` entry
 * with `"type": "command"`.
 *
 * `pickCsprojFile` always shows the picker (or auto-accepts a single match).
 * `getPickedCsprojFile` hands back whatever the last pick was with no UI -
 * use this one from a tasks.json `preLaunchTask` so it doesn't re-prompt for
 * a project the launch config's own input already picked (see
 * utils/projectPicker.ts for why the two documents can't just share one
 * `${input:...}` id directly). Example:
 *
 *   // launch.json
 *   { "id": "pickCsproj", "type": "command", "command": "dotnet-creator.pickCsprojFile",
 *     "args": { "acceptIfOneFile": true } }
 *
 *   // tasks.json
 *   { "id": "selectedCsproj", "type": "command", "command": "dotnet-creator.getPickedCsprojFile" }
 */
export function registerPickCsprojFileCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.pickCsprojFile', (args?: PickCsprojArgs) => pickCsprojFile(context, args)),
        vscode.commands.registerCommand('dotnet-creator.getPickedCsprojFile', (args?: PickCsprojArgs) => getPickedCsprojFile(context, args))
    );
}
