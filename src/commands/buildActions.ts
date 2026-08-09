import * as vscode from 'vscode';
import { runDotnet } from '../utils/process';
import { BuildConfiguration } from '../utils/configurationPicker';

export type BuildAction = 'build' | 'rebuild' | 'clean';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('.NET Build');
    }
    return outputChannel;
}

const VERBS: Record<BuildAction, string> = {
    build: 'Building',
    rebuild: 'Rebuilding',
    clean: 'Cleaning'
};

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
    const channel = getOutputChannel();

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${VERBS[action]} ${targetName} (${configuration})...`,
        cancellable: false
    }, async () => {
        try {
            if (action === 'clean' || action === 'rebuild') {
                await runLogged(channel, ['clean', targetPath, '-c', configuration]);
            }
            if (action === 'build' || action === 'rebuild') {
                await runLogged(channel, ['build', targetPath, '-c', configuration]);
            }

            vscode.window.showInformationMessage(`${targetName}: ${action} succeeded (${configuration}).`);
        } catch (error: any) {
            channel.appendLine(`ERROR: ${error.message}`);
            const choice = await vscode.window.showErrorMessage(
                `${targetName}: ${action} failed (${configuration}).`,
                'Show Output'
            );
            if (choice === 'Show Output') {
                channel.show();
            }
        }
    });
}

async function runLogged(channel: vscode.OutputChannel, args: string[]): Promise<void> {
    channel.appendLine(`> dotnet ${args.join(' ')}`);
    const output = await runDotnet(args);
    if (output.trim()) {
        channel.appendLine(output);
    }
}

/**
 * Builds the project fresh, then launches it via vscode.debug.startDebugging
 * with an inline DebugConfiguration - deliberately not a by-name lookup into
 * launch.json, so this works whether or not ".NET: Set Up Debug/Build Tasks"
 * was ever run. There's no supported VS Code API to set which entry is
 * "selected" in the native Run and Debug dropdown, so this is a second,
 * self-sufficient launch path through our own tracked project+configuration
 * state rather than an attempt to drive that UI.
 */
export async function runProject(
    projectPath: string,
    projectName: string,
    configuration: BuildConfiguration,
    noDebug: boolean = false
): Promise<void> {
    const channel = getOutputChannel();
    let buildSucceeded = false;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Building ${projectName} (${configuration})...`,
        cancellable: false
    }, async () => {
        try {
            await runLogged(channel, ['build', projectPath, '-c', configuration]);
            buildSucceeded = true;
        } catch (error: any) {
            channel.appendLine(`ERROR: ${error.message}`);
            const choice = await vscode.window.showErrorMessage(
                `${projectName}: build failed, not launching (${configuration}).`,
                'Show Output'
            );
            if (choice === 'Show Output') {
                channel.show();
            }
        }
    });

    if (!buildSucceeded) { return; }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectPath));

    const started = await vscode.debug.startDebugging(workspaceFolder, {
        name: configuration === 'Release' ? '.NET Release' : '.NET Debug',
        type: 'dotnet',
        request: 'launch',
        projectPath,
        args: [],
        internalConsoleOptions: 'neverOpen',
        noDebug
    });

    if (!started) {
        vscode.window.showErrorMessage(`${projectName}: failed to start the debug session.`);
    }
}
