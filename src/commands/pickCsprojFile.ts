import * as vscode from 'vscode';
import { pickCsprojFile, getPickedCsprojFile, PickCsprojArgs } from '../utils/projectPicker';

/**
 * `getPickedCsprojFile` is the one both launch.json and tasks.json should
 * reference from their `"inputs"` - silent, reuses the stored last pick, and
 * only actually prompts the very first time (nothing stored yet). That makes
 * F5 instant on every run after the first, rather than re-prompting on every
 * single debug/build - the whole reason `pickCsprojFile` shouldn't be wired
 * to `${input:...}` directly (see utils/projectPicker.ts for why the two
 * documents can't share one `${input:...}` id anyway).
 *
 * `pickCsprojFile` is the one exposed as ".NET: Change Debug Project" in the
 * Command Palette (see package.json's `contributes.commands`) - it always
 * shows the picker (with a "Recently Used" section), and updates the stored
 * pick that `getPickedCsprojFile` will hand back from then on. This is the
 * "change it" half: run it once when you want to switch projects, then F5
 * goes back to being silent against the new selection.
 *
 * Example:
 *
 *   // launch.json
 *   { "id": "pickCsproj", "type": "command", "command": "dotnet-creator.getPickedCsprojFile" }
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
