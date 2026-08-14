import * as vscode from 'vscode';
import * as path from 'path';
import { BuildConfiguration } from '../utils/configurationPicker';
import { resolveProjectInfo, findX86DotnetHost } from '../utils/projectAssemblyResolver';
import { isUpToDate } from '../utils/buildUpToDateCheck';
import { resolveDotnetEnv } from '../utils/dotnetPath';

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
export function runDotnetTask(targetPath: string, args: string[], taskName: string): Promise<boolean> {
    const cwd = path.dirname(targetPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath)) ?? vscode.TaskScope.Workspace;

    const execution = new vscode.ShellExecution('dotnet', args, { cwd });
    const task = new vscode.Task({ type: 'shell' }, workspaceFolder, taskName, TASK_SOURCE, execution, ['$msCompile']);
    task.group = vscode.TaskGroup.Build;
    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        // Dedicated (not Shared) so two different projects/solutions building concurrently get
        // their own terminals instead of one overwriting/interleaving with the other - task
        // identity for this already varies by name (e.g. ".NET Build: ProjectName"), so the same
        // build re-run still reuses its own terminal.
        panel: vscode.TaskPanelKind.Dedicated,
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
        // Only worth checking for a standalone "build" - "rebuild" just ran clean, so its output
        // can never be up to date, and checking would just be wasted work.
        if (action === 'build' && await isUpToDate(targetPath, configuration)) {
            vscode.window.showInformationMessage(`${targetName}: already up to date (${configuration}).`);
            return;
        }

        // `dotnet build`'s own implicit restore doesn't reliably see Configuration-conditional
        // MSBuild properties (e.g. a Release-only <RuntimeIdentifier>) - it can restore against
        // the wrong (default) branch of the condition, leaving project.assets.json without the
        // target this build actually needs and failing later with NETSDK1047. Restoring explicitly
        // with the same -p:Configuration first, then building with --no-restore, avoids that.
        const restored = await runDotnetTask(targetPath, ['restore', targetPath, `-p:Configuration=${configuration}`], `.NET Restore: ${targetName}`);
        if (!restored) {
            vscode.window.showErrorMessage(`${targetName}: restore failed (${configuration}).`);
            return;
        }

        const ok = await runDotnetTask(targetPath, ['build', targetPath, '-c', configuration, '--no-restore'], `.NET ${VERBS.build}: ${targetName}`);
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
    let buildSucceeded = await isUpToDate(projectPath, configuration);
    if (!buildSucceeded) {
        // See runBuildAction's identical restore step for why this can't just rely on `dotnet
        // build`'s own implicit restore (NETSDK1047 on Configuration-conditional properties).
        const restored = await runDotnetTask(projectPath, ['restore', projectPath, `-p:Configuration=${configuration}`], `.NET Restore: ${projectName}`);
        if (!restored) {
            vscode.window.showErrorMessage(`${projectName}: restore failed, not launching (${configuration}).`);
            return;
        }
        buildSucceeded = await runDotnetTask(projectPath, ['build', projectPath, '-c', configuration, '--no-restore'], `.NET Build: ${projectName}`);
    }
    if (!buildSucceeded) {
        vscode.window.showErrorMessage(`${projectName}: build failed, not launching (${configuration}).`);
        return;
    }

    const { targetPath: assemblyPath, platformTarget } = await resolveProjectInfo(projectPath, configuration);
    if (!assemblyPath) {
        vscode.window.showErrorMessage(`${projectName}: build succeeded, but MSBuild couldn't resolve a TargetPath for it (${configuration}).`);
        return;
    }

    // netcoredbg launches the debuggee (a .dll) using its own inherited environment, unlike this
    // extension's other dotnet CLI invocations which all route through runDotnet() - so
    // dotnet-creator.dotnetPath needs its own explicit application here too, or a debug session
    // silently fails to find the runtime on a machine where the Extension Host can't see it (see
    // dotnetPath.ts's own comment on why the Extension Host and a terminal can disagree about this).
    let env: NodeJS.ProcessEnv | undefined = resolveDotnetEnv();

    // PlatformTarget=x86 needs the 32-bit .NET host - the system-default (x64) host faults
    // trying to load an x86-only IL image with an opaque CLR error (0x80004005) during the debug
    // adapter's configurationDone handshake, before any user code runs. Takes priority over the
    // dotnetPath override above for DOTNET_ROOT specifically - a configured dotnetPath is very
    // unlikely to itself be the distinct 32-bit host this needs.
    if (platformTarget === 'x86') {
        const x86Host = findX86DotnetHost();
        if (!x86Host) {
            vscode.window.showErrorMessage(
                `${projectName} targets x86, but no 32-bit .NET host was found at the expected install location. Install the x86 .NET SDK/runtime to debug this project.`
            );
            return;
        }
        env = { ...env, DOTNET_ROOT: path.dirname(x86Host) };
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectPath));

    const started = await vscode.debug.startDebugging(workspaceFolder, {
        name: `${projectName} (${configuration})`,
        type: 'dotnet-creator-debug',
        request: 'launch',
        program: assemblyPath,
        cwd: path.dirname(projectPath),
        args: [],
        env,
        internalConsoleOptions: 'neverOpen',
        noDebug
    });

    if (!started) {
        vscode.window.showErrorMessage(`${projectName}: failed to start the debug session.`);
    }
}
