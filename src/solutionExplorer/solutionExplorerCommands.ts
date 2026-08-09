import * as vscode from 'vscode';
import * as path from 'path';
import { runDotnet } from '../utils/process';
import { peekCurrentSolution } from '../utils/currentSolution';
import { recordPickedCsprojFile, findAllCsprojFiles } from '../utils/projectPicker';
import { getCurrentConfiguration } from '../utils/configurationPicker';
import { parseSolutionProjects } from '../utils/solutionParser';
import { parseProjectReferences, addProjectReference, removeProjectReference } from '../utils/projectReferences';
import { excludeFromProject, includeInProject } from '../utils/csprojItemEdits';
import { runBuildAction, runProject, BuildAction } from '../commands/buildActions';
import { manageNugetPackages } from '../commands/manageNugetPackages';
import {
    ProjectNode,
    SolutionNode,
    DependenciesNode,
    PackageNode,
    FolderNode,
    FileNode,
    targetDirectoryFor
} from './solutionExplorerNodes';
import { SolutionExplorerProvider } from './solutionExplorerProvider';

type NewItemTargetNode = ProjectNode | FolderNode | FileNode;
type MovableNode = FolderNode | FileNode;

let clipboard: { uris: vscode.Uri[]; cut: boolean } | undefined;

function projectPathFor(node: NewItemTargetNode): string {
    return node.kind === 'project' ? node.projectPath : node.projectNode.projectPath;
}

function defaultNamespaceFor(projectPath: string): string {
    return path.basename(projectPath, path.extname(projectPath)).replace(/[^A-Za-z0-9_.]/g, '_');
}

async function newFile(node: NewItemTargetNode): Promise<void> {
    const dir = targetDirectoryFor(node);
    const name = await vscode.window.showInputBox({ prompt: 'File name', placeHolder: 'NewFile.cs' });
    if (!name) { return; }

    const uri = vscode.Uri.joinPath(dir, name);
    await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    await vscode.window.showTextDocument(uri);
}

async function newClass(node: NewItemTargetNode): Promise<void> {
    const dir = targetDirectoryFor(node);
    const name = await vscode.window.showInputBox({ prompt: 'Class name', placeHolder: 'MyClass' });
    if (!name) { return; }

    const uri = vscode.Uri.joinPath(dir, `${name}.cs`);
    const namespaceName = defaultNamespaceFor(projectPathFor(node));
    const content = `namespace ${namespaceName}\n{\n    public class ${name}\n    {\n    }\n}\n`;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    await vscode.window.showTextDocument(uri);
}

async function newFolder(node: NewItemTargetNode): Promise<void> {
    const dir = targetDirectoryFor(node);
    const name = await vscode.window.showInputBox({ prompt: 'Folder name', placeHolder: 'NewFolder' });
    if (!name) { return; }

    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(dir, name));
}

async function addExistingFile(node: NewItemTargetNode): Promise<void> {
    const dir = targetDirectoryFor(node);
    const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: true, title: 'Add Existing File' });
    if (!picked || picked.length === 0) { return; }

    for (const source of picked) {
        const target = vscode.Uri.joinPath(dir, path.basename(source.fsPath));
        await vscode.workspace.fs.copy(source, target, { overwrite: false });
    }
}

async function rename(node: MovableNode): Promise<void> {
    const oldUri = node.uri;
    const oldName = path.basename(oldUri.fsPath);
    const newName = await vscode.window.showInputBox({ prompt: 'New name', value: oldName });
    if (!newName || newName === oldName) { return; }

    const newUri = vscode.Uri.joinPath(oldUri, '..', newName);
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldUri, newUri);
    await vscode.workspace.applyEdit(edit);
}

async function deleteNodes(node: MovableNode, selected?: MovableNode[]): Promise<void> {
    const nodes = selected && selected.length > 0 ? selected : [node];
    const names = nodes.map(n => path.basename(n.uri.fsPath)).join(', ');

    const confirm = await vscode.window.showWarningMessage(`Delete ${names}?`, { modal: true }, 'Delete');
    if (confirm !== 'Delete') { return; }

    for (const n of nodes) {
        await vscode.workspace.fs.delete(n.uri, { recursive: true, useTrash: true });
    }
}

function copy(node: MovableNode, selected?: MovableNode[]): void {
    clipboard = { uris: (selected && selected.length > 0 ? selected : [node]).map(n => n.uri), cut: false };
}

function cut(node: MovableNode, selected?: MovableNode[]): void {
    clipboard = { uris: (selected && selected.length > 0 ? selected : [node]).map(n => n.uri), cut: true };
}

async function paste(node: NewItemTargetNode): Promise<void> {
    if (!clipboard) { return; }
    const targetDir = targetDirectoryFor(node);

    for (const source of clipboard.uris) {
        const target = vscode.Uri.joinPath(targetDir, path.basename(source.fsPath));
        if (target.fsPath.toLowerCase() === source.fsPath.toLowerCase()) { continue; }

        if (clipboard.cut) {
            const edit = new vscode.WorkspaceEdit();
            edit.renameFile(source, target);
            await vscode.workspace.applyEdit(edit);
        } else {
            await vscode.workspace.fs.copy(source, target, { overwrite: false });
        }
    }

    if (clipboard.cut) { clipboard = undefined; }
}

async function copyPath(node: MovableNode): Promise<void> {
    await vscode.env.clipboard.writeText(node.uri.fsPath);
}

async function copyRelativePath(node: MovableNode): Promise<void> {
    await vscode.env.clipboard.writeText(vscode.workspace.asRelativePath(node.uri, false));
}

async function excludeCommand(node: FileNode, provider: SolutionExplorerProvider): Promise<void> {
    await excludeFromProject(node.projectNode.projectPath, node.uri.fsPath);
    provider.refresh(node.parent);
}

async function includeCommand(node: FileNode, provider: SolutionExplorerProvider): Promise<void> {
    await includeInProject(node.projectNode.projectPath, node.uri.fsPath);
    provider.refresh(node.parent);
}

async function revealInFileExplorer(node: MovableNode | ProjectNode | SolutionNode): Promise<void> {
    const uri = node.kind === 'project' ? vscode.Uri.file(node.projectPath)
        : node.kind === 'solution' ? vscode.Uri.file(node.solutionPath)
        : node.uri;
    await vscode.commands.executeCommand('revealFileInOS', uri);
}

async function openInIntegratedTerminal(node: MovableNode | ProjectNode | SolutionNode): Promise<void> {
    let uri: vscode.Uri;
    if (node.kind === 'project') { uri = vscode.Uri.file(path.dirname(node.projectPath)); }
    else if (node.kind === 'solution') { uri = vscode.Uri.file(path.dirname(node.solutionPath)); }
    else if (node.kind === 'folder') { uri = node.uri; }
    else { uri = vscode.Uri.joinPath(node.uri, '..'); }
    await vscode.commands.executeCommand('openInTerminal', uri);
}

async function editProjectFile(node: ProjectNode): Promise<void> {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(node.projectPath));
}

async function editSolutionFile(node: SolutionNode): Promise<void> {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(node.solutionPath));
}

async function removeFromSolution(node: ProjectNode, provider: SolutionExplorerProvider): Promise<void> {
    const solutionNode = node.parent;
    if (!solutionNode || solutionNode.kind !== 'solution') { return; }

    const name = path.basename(node.projectPath, path.extname(node.projectPath));
    const confirm = await vscode.window.showWarningMessage(`Remove ${name} from the solution? This does not delete any files.`, { modal: true }, 'Remove');
    if (confirm !== 'Remove') { return; }

    await runDotnet(['sln', solutionNode.solutionPath, 'remove', node.projectPath]);
    provider.refresh(solutionNode);
}

async function pickProjectToReference(currentProjectPath: string, folder: vscode.WorkspaceFolder): Promise<string | undefined> {
    const solutionPath = peekCurrentSolution(folder);
    const candidates = solutionPath
        ? await parseSolutionProjects(solutionPath)
        : (await findAllCsprojFiles(folder)).map(u => u.fsPath);
    const filtered = candidates.filter(p => p.toLowerCase() !== currentProjectPath.toLowerCase());

    type Item = vscode.QuickPickItem & { projectPath?: string; browse?: boolean };
    const items: Item[] = filtered.map(p => ({ label: `$(project) ${path.basename(p, path.extname(p))}`, description: p, projectPath: p }));
    items.push({ label: '$(folder-opened) Browse for project file...', browse: true });

    const selection = await vscode.window.showQuickPick(items, { title: 'Add Project Reference' });
    if (!selection) { return undefined; }
    if (selection.browse) {
        const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, filters: { Projects: ['csproj'] } });
        return picked?.[0]?.fsPath;
    }
    return selection.projectPath;
}

async function manageProjectReferences(node: DependenciesNode, provider: SolutionExplorerProvider): Promise<void> {
    const projectNode = node.parent;
    const projectPath = projectNode.projectPath;

    type Item = vscode.QuickPickItem & { referencePath?: string; addNew?: boolean };

    while (true) {
        const current = await parseProjectReferences(projectPath);
        const items: Item[] = [{ label: '$(add) Add Reference...', addNew: true }];
        if (current.length > 0) {
            items.push({ label: 'References', kind: vscode.QuickPickItemKind.Separator });
            for (const refPath of current) {
                items.push({ label: `$(references) ${path.basename(refPath)}`, description: refPath, referencePath: refPath });
            }
        }

        const selection = await vscode.window.showQuickPick(items, {
            title: 'Manage Project References',
            placeHolder: 'Select a reference to remove, or add a new one'
        });
        if (!selection) { break; }

        if (selection.addNew) {
            const target = await pickProjectToReference(projectPath, projectNode.folder);
            if (target) { await addProjectReference(projectPath, target); }
            continue;
        }

        if (selection.referencePath) {
            const confirm = await vscode.window.showWarningMessage(
                `Remove reference to ${path.basename(selection.referencePath)}?`,
                { modal: true },
                'Remove'
            );
            if (confirm === 'Remove') { await removeProjectReference(projectPath, selection.referencePath); }
            continue;
        }

        break;
    }

    provider.invalidatePackageCache(projectPath);
    provider.refresh(node);
}

async function setAsStartupProject(node: ProjectNode): Promise<void> {
    await recordPickedCsprojFile(node.folder, node.projectPath);
}

async function buildTarget(node: ProjectNode | SolutionNode, action: BuildAction): Promise<void> {
    const targetPath = node.kind === 'project' ? node.projectPath : node.solutionPath;
    const name = path.basename(targetPath, path.extname(targetPath));
    const configuration = getCurrentConfiguration(node.folder);
    await runBuildAction(targetPath, name, action, configuration);
}

async function runTarget(node: ProjectNode): Promise<void> {
    const name = path.basename(node.projectPath, path.extname(node.projectPath));
    const configuration = getCurrentConfiguration(node.folder);
    await runProject(node.projectPath, name, configuration);
}

async function openNugetManager(node: ProjectNode | DependenciesNode | PackageNode, context: vscode.ExtensionContext): Promise<void> {
    const projectPath = node.kind === 'project' ? node.projectPath
        : node.kind === 'dependencies' ? node.parent.projectPath
        : node.projectNode.projectPath;
    await manageNugetPackages(context, projectPath);
}

export function registerSolutionExplorerCommands(context: vscode.ExtensionContext, provider: SolutionExplorerProvider): void {
    const register = (id: string, handler: (...args: any[]) => unknown) => {
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    };

    register('dotnet-creator.solutionExplorer.refresh', () => provider.refresh(undefined));
    register('dotnet-creator.solutionExplorer.newFile', newFile);
    register('dotnet-creator.solutionExplorer.newClass', newClass);
    register('dotnet-creator.solutionExplorer.newFolder', newFolder);
    register('dotnet-creator.solutionExplorer.addExistingFile', addExistingFile);
    register('dotnet-creator.solutionExplorer.rename', rename);
    register('dotnet-creator.solutionExplorer.delete', deleteNodes);
    register('dotnet-creator.solutionExplorer.copy', copy);
    register('dotnet-creator.solutionExplorer.cut', cut);
    register('dotnet-creator.solutionExplorer.paste', paste);
    register('dotnet-creator.solutionExplorer.copyPath', copyPath);
    register('dotnet-creator.solutionExplorer.copyRelativePath', copyRelativePath);
    register('dotnet-creator.solutionExplorer.exclude', (node: FileNode) => excludeCommand(node, provider));
    register('dotnet-creator.solutionExplorer.include', (node: FileNode) => includeCommand(node, provider));
    register('dotnet-creator.solutionExplorer.revealInFileExplorer', revealInFileExplorer);
    register('dotnet-creator.solutionExplorer.openInIntegratedTerminal', openInIntegratedTerminal);
    register('dotnet-creator.solutionExplorer.editProjectFile', editProjectFile);
    register('dotnet-creator.solutionExplorer.editSolutionFile', editSolutionFile);
    register('dotnet-creator.solutionExplorer.removeFromSolution', (node: ProjectNode) => removeFromSolution(node, provider));
    register('dotnet-creator.solutionExplorer.manageProjectReferences', (node: DependenciesNode) => manageProjectReferences(node, provider));
    register('dotnet-creator.solutionExplorer.setAsStartupProject', setAsStartupProject);
    register('dotnet-creator.solutionExplorer.build', (node: ProjectNode | SolutionNode) => buildTarget(node, 'build'));
    register('dotnet-creator.solutionExplorer.rebuild', (node: ProjectNode | SolutionNode) => buildTarget(node, 'rebuild'));
    register('dotnet-creator.solutionExplorer.clean', (node: ProjectNode | SolutionNode) => buildTarget(node, 'clean'));
    register('dotnet-creator.solutionExplorer.run', runTarget);
    register('dotnet-creator.solutionExplorer.openNugetManager', (node: ProjectNode | DependenciesNode | PackageNode) => openNugetManager(node, context));
}
