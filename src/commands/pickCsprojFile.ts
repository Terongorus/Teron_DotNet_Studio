import * as vscode from 'vscode';
import { pickCsprojFile, getPickedCsprojFile, PickCsprojArgs } from '../utils/projectPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { resolveTargetPath } from '../utils/projectAssemblyResolver';
import { getCurrentConfiguration, BuildConfiguration } from '../utils/configurationPicker';

interface PickAssemblyArgs extends PickCsprojArgs {
    /** Which configuration to resolve the TargetPath for - the generated .NET Debug/.NET Release launch configs each pass their own literal value, so picking "Release" always resolves a Release build regardless of the status bar's current pick. Defaults to the status bar's current configuration when omitted. */
    configuration?: BuildConfiguration;
}

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
 * Both commands are invoked by VS Code's own `"type": "command"` input
 * resolution, which doesn't pass along which folder's tasks.json/launch.json
 * triggered it - resolved here via `getActiveWorkspaceFolder()` (the active
 * editor's folder, falling back to the first open folder), the same
 * heuristic the status bar items use.
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
        vscode.commands.registerCommand('dotnet-creator.pickCsprojFile', (args?: PickCsprojArgs) => {
            const folder = getActiveWorkspaceFolder();
            return folder ? pickCsprojFile(folder, args) : undefined;
        }),
        vscode.commands.registerCommand('dotnet-creator.getPickedCsprojFile', (args?: PickCsprojArgs) => {
            const folder = getActiveWorkspaceFolder();
            return folder ? getPickedCsprojFile(folder, args) : undefined;
        }),
        // The netcoredbg-backed debug type needs the built assembly path (`program`), not the
        // .csproj path itself, unlike VS Code's own "dotnet" debug type which resolved that
        // internally - see utils/projectAssemblyResolver.ts (already proven by the XAML
        // Designer's own "find the built DLL for a project" need).
        vscode.commands.registerCommand('dotnet-creator.getPickedAssemblyPath', async (args?: PickAssemblyArgs) => {
            const folder = getActiveWorkspaceFolder();
            if (!folder) { return undefined; }
            const csprojPath = await getPickedCsprojFile(folder, args);
            if (!csprojPath) { return undefined; }
            return resolveTargetPath(csprojPath, args?.configuration ?? getCurrentConfiguration(folder));
        })
    );
}
