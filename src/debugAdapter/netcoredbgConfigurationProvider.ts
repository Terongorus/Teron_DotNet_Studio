import * as vscode from 'vscode';
import * as path from 'path';
import { resolveProjectInfo, findX86DotnetHost } from '../utils/projectAssemblyResolver';
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
 * 2. x86 PlatformTarget: needs the 32-bit .NET host via DOTNET_ROOT, or the debug adapter faults
 *    with an opaque CLR error before user code runs - see buildActions.ts's identical fix for
 *    the full explanation.
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
                        const x86Host = findX86DotnetHost();
                        if (!x86Host) {
                            vscode.window.showErrorMessage(
                                `${projectName} targets x86, but no 32-bit .NET host was found at the expected install location. Install the x86 .NET SDK/runtime to debug this project.`
                            );
                            return undefined;
                        }
                        config.env = { ...config.env, DOTNET_ROOT: path.dirname(x86Host) };
                    }
                }

                return config;
            }
        })
    );
}
