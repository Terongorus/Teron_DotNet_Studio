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
 * Runs `<command> <args>` in `cwd` as a real VS Code Task (ShellExecution) rather than a
 * background child_process - shows live output in an integrated Terminal tab exactly like a task
 * from tasks.json (matches the RECOMMENDED_TASKS this extension itself generates), with the same
 * `$msCompile` problem matcher surfacing errors/warnings in the Problems panel, which the
 * previous plain-output-channel approach never did at all. Resolves to whether the process
 * exited 0. `env`, when given, is merged over the task's inherited environment - used for
 * passing credentials to a publish step without them appearing in the command line itself.
 */
export function runShellTask(command: string, args: string[], cwd: string, taskName: string, env?: Record<string, string>): Promise<boolean> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(cwd)) ?? vscode.TaskScope.Workspace;

    const execution = new vscode.ShellExecution(command, args, { cwd, env });
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

/** `runShellTask` specialized to `dotnet`, cwd'd to the target project/solution's own folder - the shape almost every build/publish call site here actually needs. */
export function runDotnetTask(targetPath: string, args: string[], taskName: string, env?: Record<string, string>): Promise<boolean> {
    return runShellTask('dotnet', args, path.dirname(targetPath), taskName, env);
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
 * `dotnet-studio-debug` type (netcoredbg) - not VS Code's built-in `dotnet`
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

    // PlatformTarget=x86 can't go through netcoredbg at all - confirmed by directly driving a
    // real cached netcoredbg.exe over DAP against a real x86 net10.0 build: it only ships a
    // 64-bit Windows binary (no win32 release asset exists), and that 64-bit process crashes
    // with STATUS_ACCESS_VIOLATION (0xC0000005) the moment it tries to launch/attach to a 32-bit
    // target - reproduced with a fully valid x86 host+runtime present, and identically with
    // noDebug:true (vscode.debug.startDebugging always routes through the same netcoredbg
    // process regardless of that flag). Pointing DOTNET_ROOT at the 32-bit host (the previous
    // fix here) never actually worked - it just swapped the opaque configurationDone: 0x80004005
    // for a silent debugger crash. Debugging is genuinely not possible here; running is - the
    // built assembly launches fine directly under the real x86 host (verified) - so noDebug
    // bypasses netcoredbg entirely via a plain Task instead of vscode.debug.startDebugging.
    if (platformTarget === 'x86') {
        const x86Host = findX86DotnetHost();
        if (!x86Host) {
            vscode.window.showErrorMessage(
                `${projectName} targets x86, but no 32-bit .NET host was found at the expected install location. Install the x86 .NET SDK/runtime to run this project.`
            );
            return;
        }

        if (!noDebug) {
            vscode.window.showErrorMessage(
                `${projectName} targets x86, but netcoredbg (this extension's debugger) can't debug 32-bit .NET processes on Windows - it only ships a 64-bit build and crashes when attached to a 32-bit target (an upstream limitation, not a configuration problem). Use "Start Without Debugging" (Ctrl+F5) instead - that runs the project directly under the 32-bit host without going through the debugger.`
            );
            return;
        }

        const ok = await runShellTask(x86Host, [assemblyPath], path.dirname(projectPath), `.NET Run: ${projectName}`, { DOTNET_ROOT: path.dirname(x86Host) });
        if (!ok) {
            vscode.window.showErrorMessage(`${projectName}: failed to run (${configuration}).`);
        }
        return;
    }

    // netcoredbg launches the debuggee (a .dll) using its own inherited environment, unlike this
    // extension's other dotnet CLI invocations which all route through runDotnet() - so
    // dotnet-studio.dotnetPath needs its own explicit application here too, or a debug session
    // silently fails to find the runtime on a machine where the Extension Host can't see it (see
    // dotnetPath.ts's own comment on why the Extension Host and a terminal can disagree about this).
    const env: NodeJS.ProcessEnv | undefined = resolveDotnetEnv();

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectPath));

    const started = await vscode.debug.startDebugging(workspaceFolder, {
        name: `${projectName} (${configuration})`,
        type: 'dotnet-studio-debug',
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
