import * as vscode from 'vscode';
import * as path from 'path';
import {
    peekCurrentSolution,
    pickCurrentSolution,
    getRecentSolutionItems,
    selectSolution,
    browseForSolutionFile
} from '../utils/currentSolution';
import {
    peekPickedCsprojFile,
    getPickedCsprojFile,
    recordPickedCsprojFile,
    getRecentCsprojItems,
    findAllCsprojFiles
} from '../utils/projectPicker';
import { getCurrentConfiguration } from '../utils/configurationPicker';
import { getActiveWorkspaceFolder } from '../utils/activeWorkspaceFolder';
import { parseSolutionProjects } from '../utils/solutionParser';
import { runBuildAction, runProject, BuildAction } from './buildActions';
import { manageNugetPackages } from './manageNugetPackages';
import { showMenu as showDebugAdapterMenu } from './debugAdapterCommands';
import { NetcoredbgAdapterFactory } from '../debugAdapter/netcoredbgAdapterFactory';

export function registerStatusBarMenuCommands(context: vscode.ExtensionContext, debugAdapterFactory: NetcoredbgAdapterFactory) {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet-creator.showSolutionMenu', () => showSolutionMenu(context)),
        vscode.commands.registerCommand('dotnet-creator.showProjectMenu', () => showProjectMenu(context, debugAdapterFactory))
    );
}

async function showSolutionMenu(context: vscode.ExtensionContext): Promise<void> {
    const folder = getActiveWorkspaceFolder();
    if (!folder) { return; }

    type Item = vscode.QuickPickItem & { action?: BuildAction; solutionPath?: string; browse?: boolean };

    const current = peekCurrentSolution(folder);
    const currentName = current ? path.basename(current, path.extname(current)) : undefined;

    const items: Item[] = [
        { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(tools) Build Solution', action: 'build' },
        { label: '$(sync) Rebuild Solution', action: 'rebuild' },
        { label: '$(trash) Clean Solution', action: 'clean' }
    ];

    const recent = getRecentSolutionItems(context);
    if (recent.length > 0) {
        items.push({ label: 'Recently Used', kind: vscode.QuickPickItemKind.Separator });
        items.push(...recent);
    }
    items.push({ label: '$(folder-opened) Browse for solution file...', browse: true });

    const selection = await vscode.window.showQuickPick(items, {
        title: currentName ? `Solution: ${currentName}` : 'Select a Solution',
        placeHolder: 'Select an action or a solution'
    });

    if (!selection) { return; }

    if (selection.browse || selection.solutionPath) {
        const picked = selection.browse ? await browseForSolutionFile() : selection.solutionPath;
        if (picked) {
            await selectSolution(folder, picked);
        }
        return;
    }

    if (selection.action) {
        const solutionPath = peekCurrentSolution(folder) ?? await pickCurrentSolution(context, folder);
        if (!solutionPath) { return; }

        const configuration = getCurrentConfiguration(folder);
        const name = path.basename(solutionPath, path.extname(solutionPath));
        await runBuildAction(solutionPath, name, selection.action, configuration);
    }
}

async function showProjectMenu(context: vscode.ExtensionContext, debugAdapterFactory: NetcoredbgAdapterFactory): Promise<void> {
    const folder = getActiveWorkspaceFolder();
    if (!folder) { return; }

    type Item = vscode.QuickPickItem & { action?: BuildAction | 'run'; projectPath?: string; manageNuget?: boolean; debuggerOptions?: boolean };

    const items: Item[] = [
        { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(play) Run', action: 'run' },
        { label: '$(tools) Build Project', action: 'build' },
        { label: '$(sync) Rebuild Project', action: 'rebuild' },
        { label: '$(trash) Clean Project', action: 'clean' },
        { label: '$(package) Manage NuGet Packages...', manageNuget: true },
        { label: '$(debug-alt) Debugger Options...', debuggerOptions: true }
    ];

    const recent = getRecentCsprojItems(folder);
    if (recent.length > 0) {
        items.push({ label: 'Recently Used', kind: vscode.QuickPickItemKind.Separator });
        items.push(...recent);
    }

    const currentSolution = peekCurrentSolution(folder);
    if (currentSolution) {
        const solutionProjects = await parseSolutionProjects(currentSolution);
        const remaining = solutionProjects.filter(
            p => !recent.some(r => r.projectPath.toLowerCase() === p.toLowerCase())
        );
        if (remaining.length > 0) {
            const solutionName = path.basename(currentSolution, path.extname(currentSolution));
            items.push({ label: `Projects in ${solutionName}`, kind: vscode.QuickPickItemKind.Separator });
            for (const projectPath of remaining) {
                items.push({ label: `$(file) ${path.basename(projectPath)}`, description: projectPath, projectPath });
            }
        }
    } else {
        const found = await findAllCsprojFiles(folder);
        const remaining = found.filter(
            uri => !recent.some(r => r.projectPath.toLowerCase() === uri.fsPath.toLowerCase())
        );
        if (remaining.length > 0) {
            items.push({ label: 'All Projects', kind: vscode.QuickPickItemKind.Separator });
            for (const uri of remaining) {
                items.push({ label: `$(file) ${path.basename(uri.fsPath)}`, description: uri.fsPath, projectPath: uri.fsPath });
            }
        }
    }

    const current = peekPickedCsprojFile(folder);
    const currentName = current ? path.basename(current, path.extname(current)) : undefined;

    const selection = await vscode.window.showQuickPick(items, {
        title: currentName ? `Project: ${currentName}` : 'Select a Project',
        placeHolder: 'Select an action or a project'
    });

    if (!selection) { return; }

    if (selection.projectPath) {
        await recordPickedCsprojFile(folder, selection.projectPath);
        return;
    }

    if (selection.manageNuget) {
        const projectPath = await getPickedCsprojFile(folder);
        if (!projectPath) { return; }
        await manageNugetPackages(context, projectPath);
        return;
    }

    if (selection.debuggerOptions) {
        await showDebugAdapterMenu(context, debugAdapterFactory);
        return;
    }

    if (selection.action) {
        const projectPath = await getPickedCsprojFile(folder);
        if (!projectPath) { return; }

        const configuration = getCurrentConfiguration(folder);
        const name = path.basename(projectPath, path.extname(projectPath));

        if (selection.action === 'run') {
            await runProject(projectPath, name, configuration);
        } else {
            await runBuildAction(projectPath, name, selection.action, configuration);
        }
    }
}
