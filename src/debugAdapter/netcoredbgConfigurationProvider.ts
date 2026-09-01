import * as vscode from 'vscode';
import * as path from 'path';
import { resolveProjectInfo } from '../utils/projectAssemblyResolver';
import { peekPickedCsprojFile } from '../utils/projectPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { BuildConfiguration } from '../utils/configurationPicker';

/**
 * Applies the same two fixes to launches started from the generated launch.json (VS Code's own
 * Run and Debug dropdown) that buildActions.ts's runProject() already applies to the F5/status
 * bar path - both are real gaps in the *generated* config alone, not fixable by editing
 * debugTaskDefinitions.ts's static JSON:
 *
 * 1. Session naming: a static launch.json name ("`.NET Debug`"/"`.NET Release`") is identical for
 *    every project, so launching several concurrently is indistinguishable in the Call Stack/
 *    session switcher. Rewritten here to include the actual project name.
 * 2. x86 PlatformTarget: refused outright with an explanatory message rather than attempted -
 *    netcoredbg only ships a 64-bit Windows build and crashes attaching to a 32-bit target
 *    (confirmed by directly driving a real netcoredbg.exe over DAP against a real x86 build; see
 *    buildActions.ts's runProject() for the full finding). Unlike that function, this provider
 *    has no plain-Task fallback for noDebug launches, so x86 is blocked here unconditionally -
 *    the message points the user at Ctrl+F5, which does have that fallback.
 *
 * The owning .csproj is looked up via peekPickedCsprojFile() (the same stored selection
 * ${input:pickAssemblyDebug}/${input:pickAssemblyRelease} just resolved `program` from) rather
 * than walking up from `program`'s own directory - a custom OutputPath can put the built
 * assembly in a tree that isn't nested under the project directory at all (this session's own
 * earlier fix subject), so there's no filesystem-ancestor relationship to walk back through.
 */
export function registerNetcoredbgConfigurationProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('dotnet-studio-debug', {
            async resolveDebugConfiguration(folder, config) {
                if (typeof config.program !== 'string' || !config.program) { return config; }

                const projectName = path.basename(config.program, path.extname(config.program));
                const configurationLabel: BuildConfiguration = /release/i.test(String(config.name ?? '')) ? 'Release' : 'Debug';
                config.name = `${projectName} (${configurationLabel})`;

                const activeFolder = folder ?? getActiveWorkspaceFolder();
                const csprojPath = activeFolder ? peekPickedCsprojFile(activeFolder) : undefined;
                if (csprojPath) {
                    const { platformTarget } = await resolveProjectInfo(csprojPath, configurationLabel);
                    if (platformTarget === 'x86') {
                        vscode.window.showErrorMessage(
                            `${projectName} targets x86, but netcoredbg (this extension's debugger) can't debug or run 32-bit .NET processes on Windows through the Run and Debug dropdown - it only ships a 64-bit build and crashes when attached to a 32-bit target (an upstream limitation, not a configuration problem). Use "Start Without Debugging" (Ctrl+F5) from the status bar/editor instead - that path runs the project directly under the 32-bit host without going through the debugger.`
                        );
                        return undefined;
                    }
                }

                return config;
            }
        })
    );
}
