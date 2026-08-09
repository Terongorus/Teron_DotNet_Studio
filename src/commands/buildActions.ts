import * as vscode from 'vscode';
import * as path from 'path';
import { BuildConfiguration } from '../utils/configurationPicker';
import { resolveTargetPath } from '../utils/projectAssemblyResolver';

export type BuildAction = 'build' | 'rebuild' | 'clean';

const TASK_SOURCE = '.NET Studio';

const VERBS: Record<BuildAction, string> = {
    build: 'Building',
    rebuild: 'Rebuilding',
    clean: 'Cleaning'
};

/**
 * Runs `dotnet <args>` as a real VS Code Task (ShellExecution) rather than a background
 * child_process - shows live output in an integrated Terminal tab exactly like a task from
 * tasks.json (matches the RECOMMENDED_TASKS this extension itself generates), with the same
 * `$msCompile` problem matcher surfacing errors/warnings in the Problems panel, which the
 * previous plain-output-channel approach never did at all. Resolves to whether the process
 * exited 0.
 */
function runDotnetTask(targetPath: string, args: string[], taskName: string): Promise<boolean> {
    const cwd = path.dirname(targetPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath)) ?? vscode.TaskScope.Workspace;

    const execution = new vscode.ShellExecution('dotnet', args, { cwd });
    const task = new vscode.Task({ type: 'shell' }, workspaceFolder, taskName, TASK_SOURCE, execution, ['$msCompile']);
    task.group = vscode.TaskGroup.Build;
    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Shared,
        clear: true,
        focus: false
    };

    return new Promise<boolean>((resolve, reject) => {
        vscode.tasks.executeTask(task).then(taskExecution => {
            const disposable = vscode.tasks.onDidEndTaskProcess(event => {
                if (event.execution === taskExecution) {
                    disposable.dispose();
                    resolve(event.exitCode === 0);
                }
            });
        }, reject);
    });
}

/**
 * Shared build/rebuild/clean executor, parameterized by *what* gets built (a
 * project or a solution path) rather than always resolving the current
 * project - both the Solution and Project status bar menus call into this
 * with their own target, so there's one place that actually invokes dotnet.
 */
export async function runBuildAction(
    targetPath: string,
    targetName: string,
    action: BuildAction,
    configuration: BuildConfiguration
): Promise<void> {
    if (action === 'clean' || action === 'rebuild') {
        const ok = await runDotnetTask(targetPath, ['clean', targetPath, '-c', configuration], `.NET ${VERBS.clean}: ${targetName}`);
        if (!ok) {
            vscode.window.showErrorMessage(`${targetName}: ${action} failed (${configuration}).`);
            return;
        }
    }

    if (action === 'build' || action === 'rebuild') {
        const ok = await runDotnetTask(targetPath, ['build', targetPath, '-c', configuration], `.NET ${VERBS.build}: ${targetName}`);
        if (!ok) {
            vscode.window.showErrorMessage(`${targetName}: ${action} failed (${configuration}).`);
            return;
        }
    }

    vscode.window.showInformationMessage(`${targetName}: ${action} succeeded (${configuration}).`);
}

/**
 * Builds the project fresh, then launches it via vscode.debug.startDebugging
 * with an inline DebugConfiguration - deliberately not a by-name lookup into
 * launch.json, so this works whether or not ".NET: Set Up Debug/Build Tasks"
 * was ever run. There's no supported VS Code API to set which entry is
 * "selected" in the native Run and Debug dropdown, so this is a second,
 * self-sufficient launch path through our own tracked project+configuration
 * state rather than an attempt to drive that UI. Uses this extension's own
 * `dotnet-creator-debug` type (netcoredbg) - not VS Code's built-in `dotnet`
 * type, which is contributed by Microsoft's C# extension and isn't installed
 * here at all (see debugTaskDefinitions.ts's own comment on this exact
 * distinction). That debugger needs the built assembly path via `program`,
 * not the `projectPath` convenience field the `dotnet` type understands.
 */
export async function runProject(
    projectPath: string,
    projectName: string,
    configuration: BuildConfiguration,
    noDebug: boolean = false
): Promise<void> {
    const buildSucceeded = await runDotnetTask(projectPath, ['build', projectPath, '-c', configuration], `.NET Build: ${projectName}`);
    if (!buildSucceeded) {
        vscode.window.showErrorMessage(`${projectName}: build failed, not launching (${configuration}).`);
        return;
    }

    const assemblyPath = await resolveTargetPath(projectPath, configuration);
    if (!assemblyPath) {
        vscode.window.showErrorMessage(`${projectName}: build succeeded, but MSBuild couldn't resolve a TargetPath for it (${configuration}).`);
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectPath));

    const started = await vscode.debug.startDebugging(workspaceFolder, {
        name: configuration === 'Release' ? '.NET Release' : '.NET Debug',
        type: 'dotnet-creator-debug',
        request: 'launch',
        program: assemblyPath,
        cwd: path.dirname(projectPath),
        args: [],
        internalConsoleOptions: 'neverOpen',
        noDebug
    });

    if (!started) {
        vscode.window.showErrorMessage(`${projectName}: failed to start the debug session.`);
    }
}
