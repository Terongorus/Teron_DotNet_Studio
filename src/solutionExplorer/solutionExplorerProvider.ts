import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { peekCurrentSolution, onDidChangeCurrentSolution } from '../utils/currentSolution';
import { peekPickedCsprojFile, onDidChangePickedCsproj, findAllCsprojFiles } from '../utils/projectPicker';
import { parseSolutionProjects } from '../utils/solutionParser';
import { listPackageReferences, PackageReference } from '../utils/nugetPackages';
import { parseProjectReferences } from '../utils/projectReferences';
import { parseAnalyzerReferences } from '../utils/analyzerReferences';
import { isExcluded } from '../utils/csprojItemEdits';
import {
    SolutionExplorerNode,
    WorkspaceFolderNode,
    SolutionNode,
    ProjectNode,
    DependenciesNode,
    PackageNode,
    ProjectReferenceNode,
    AnalyzersNode,
    AnalyzerNode,
    FolderNode,
    FileNode,
    getParentNode
} from './solutionExplorerNodes';

const IGNORED_DIR_NAMES = new Set(['bin', 'obj']);
const DEBOUNCE_MS = 250;
export const DRAG_MIME_TYPE = 'application/vnd.dotnet-creator.solutionexplorer';

/**
 * TreeDataProvider + TreeDragAndDropController for the .NET Solution Explorer view.
 * getChildren is lazy per-expansion (real I/O only happens there, never in getTreeItem).
 * Every node carries a stable id (see solutionExplorerNodes.ts) so VS Code can correlate
 * instances across refreshes and so reveal()/getParent work correctly.
 */
export class SolutionExplorerProvider implements vscode.TreeDataProvider<SolutionExplorerNode>, vscode.TreeDragAndDropController<SolutionExplorerNode>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<SolutionExplorerNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    readonly dropMimeTypes = [DRAG_MIME_TYPE];
    readonly dragMimeTypes = [DRAG_MIME_TYPE];

    private readonly packageCache = new Map<string, PackageReference[]>();
    private readonly nodeCache = new Map<string, SolutionExplorerNode>();
    private readonly watchers = new Map<string, vscode.Disposable>();
    private readonly pendingRefresh = new Set<string>();
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    dispose(): void {
        for (const watcher of this.watchers.values()) { watcher.dispose(); }
        this.watchers.clear();
        this._onDidChangeTreeData.dispose();
    }

    invalidatePackageCache(projectPath: string): void {
        this.packageCache.delete(projectPath);
    }

    notifySolutionChanged(folder: vscode.WorkspaceFolder): void {
        this.refreshFolderSection(folder);
    }

    notifyPickedProjectChanged(folder: vscode.WorkspaceFolder): void {
        this.refreshFolderSection(folder);
    }

    private refreshFolderSection(folder: vscode.WorkspaceFolder): void {
        const node = this.nodeCache.get(`wsFolder::${folder.uri.toString()}`);
        this._onDidChangeTreeData.fire(node);
    }

    refresh(node?: SolutionExplorerNode): void {
        this._onDidChangeTreeData.fire(node);
    }

    getParent(element: SolutionExplorerNode): SolutionExplorerNode | undefined {
        return getParentNode(element);
    }

    getTreeItem(element: SolutionExplorerNode): vscode.TreeItem {
        return this.buildTreeItem(element);
    }

    async getChildren(element?: SolutionExplorerNode): Promise<SolutionExplorerNode[]> {
        if (!element) { return this.getRootChildren(); }

        switch (element.kind) {
            case 'workspaceFolder': return this.getFolderChildren(element.folder, element);
            case 'solution': return this.getSolutionChildren(element);
            case 'project': return this.getProjectChildren(element);
            case 'dependencies': return this.getDependenciesChildren(element);
            case 'analyzers': return this.getAnalyzersChildren(element);
            case 'folder': return this.readFsChildren(element.projectNode, element.uri.fsPath, element);
            default: return [];
        }
    }

    private async getRootChildren(): Promise<SolutionExplorerNode[]> {
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.length === 0) { return []; }
        if (folders.length === 1) { return this.getFolderChildren(folders[0], undefined); }

        return folders.map(folder => this.cacheNode<WorkspaceFolderNode>({
            kind: 'workspaceFolder',
            id: `wsFolder::${folder.uri.toString()}`,
            folder
        }));
    }

    private async getFolderChildren(folder: vscode.WorkspaceFolder, parent: WorkspaceFolderNode | undefined): Promise<SolutionExplorerNode[]> {
        const solutionPath = peekCurrentSolution(folder);
        if (solutionPath) {
            return [this.cacheNode<SolutionNode>({
                kind: 'solution',
                id: `solution::${solutionPath}`,
                folder,
                solutionPath,
                parent
            })];
        }

        const found = await findAllCsprojFiles(folder);
        return found.map(uri => this.cacheNode<ProjectNode>({
            kind: 'project',
            id: `project::${uri.fsPath}`,
            folder,
            projectPath: uri.fsPath,
            parent
        }));
    }

    private async getSolutionChildren(node: SolutionNode): Promise<SolutionExplorerNode[]> {
        const projectPaths = await parseSolutionProjects(node.solutionPath);
        return projectPaths.map(projectPath => this.cacheNode<ProjectNode>({
            kind: 'project',
            id: `project::${projectPath}`,
            folder: node.folder,
            projectPath,
            parent: node
        }));
    }

    private async getProjectChildren(node: ProjectNode): Promise<SolutionExplorerNode[]> {
        this.ensureWatcher(node);
        const dependencies = this.cacheNode<DependenciesNode>({ kind: 'dependencies', id: `deps::${node.projectPath}`, parent: node });
        const fsChildren = await this.readFsChildren(node, path.dirname(node.projectPath), node);
        return [dependencies, ...fsChildren];
    }

    private async getDependenciesChildren(node: DependenciesNode): Promise<SolutionExplorerNode[]> {
        const projectNode = node.parent;
        const [packages, references, analyzerIds] = await Promise.all([
            this.getCachedPackages(projectNode.projectPath),
            parseProjectReferences(projectNode.projectPath),
            parseAnalyzerReferences(projectNode.projectPath)
        ]);

        const nodes: SolutionExplorerNode[] = [];

        for (const pkg of packages) {
            nodes.push(this.cacheNode<PackageNode>({
                kind: 'package',
                id: `pkg::${projectNode.projectPath}::${pkg.id}`,
                parent: node,
                projectNode,
                packageId: pkg.id,
                version: pkg.resolvedVersion
            }));
        }

        for (const referencedProjectPath of references) {
            nodes.push(this.cacheNode<ProjectReferenceNode>({
                kind: 'projectReference',
                id: `ref::${projectNode.projectPath}::${referencedProjectPath}`,
                parent: node,
                projectNode,
                referencedProjectPath
            }));
        }

        if (analyzerIds.length > 0) {
            nodes.push(this.cacheNode<AnalyzersNode>({
                kind: 'analyzers',
                id: `analyzers::${projectNode.projectPath}`,
                parent: node,
                projectNode
            }));
        }

        return nodes;
    }

    private async getCachedPackages(projectPath: string): Promise<PackageReference[]> {
        const cached = this.packageCache.get(projectPath);
        if (cached) { return cached; }
        try {
            const packages = await listPackageReferences(projectPath);
            this.packageCache.set(projectPath, packages);
            return packages;
        } catch {
            return [];
        }
    }

    private async getAnalyzersChildren(node: AnalyzersNode): Promise<SolutionExplorerNode[]> {
        const analyzerIds = await parseAnalyzerReferences(node.projectNode.projectPath);
        return analyzerIds.map(packageId => this.cacheNode<AnalyzerNode>({
            kind: 'analyzer',
            id: `analyzer::${node.projectNode.projectPath}::${packageId}`,
            parent: node,
            packageId
        }));
    }

    private async readFsChildren(projectNode: ProjectNode, dirPath: string, parent: ProjectNode | FolderNode): Promise<SolutionExplorerNode[]> {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch {
            return [];
        }

        entries = entries
            .filter(entry => !entry.name.startsWith('.'))
            .filter(entry => !(entry.isDirectory() && IGNORED_DIR_NAMES.has(entry.name.toLowerCase())))
            .sort((a, b) => {
                if (a.isDirectory() !== b.isDirectory()) { return a.isDirectory() ? -1 : 1; }
                return a.name.localeCompare(b.name);
            });

        const nodes: SolutionExplorerNode[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const uri = vscode.Uri.file(fullPath);

            if (entry.isDirectory()) {
                nodes.push(this.cacheNode<FolderNode>({ kind: 'folder', id: `folder::${fullPath}`, parent, projectNode, uri }));
            } else {
                const isProjectFile = fullPath.toLowerCase() === projectNode.projectPath.toLowerCase();
                const excluded = await isExcluded(projectNode.projectPath, fullPath);
                nodes.push(this.cacheNode<FileNode>({ kind: 'file', id: `file::${fullPath}`, parent, projectNode, uri, isProjectFile, excluded }));
            }
        }
        return nodes;
    }

    private cacheNode<T extends SolutionExplorerNode>(node: T): T {
        this.nodeCache.set(node.id, node);
        return node;
    }

    private buildTreeItem(element: SolutionExplorerNode): vscode.TreeItem {
        switch (element.kind) {
            case 'workspaceFolder': {
                const item = new vscode.TreeItem(element.folder.name, vscode.TreeItemCollapsibleState.Expanded);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('root-folder');
                item.contextValue = 'dotnetWorkspaceFolder';
                return item;
            }
            case 'solution': {
                const name = path.basename(element.solutionPath, path.extname(element.solutionPath));
                const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.Expanded);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('folder-library');
                item.tooltip = element.solutionPath;
                item.resourceUri = vscode.Uri.file(element.solutionPath);
                item.contextValue = 'dotnetSolution';
                return item;
            }
            case 'project': {
                const name = path.basename(element.projectPath, path.extname(element.projectPath));
                const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.Collapsed);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('project');
                item.tooltip = element.projectPath;
                const picked = peekPickedCsprojFile(element.folder);
                item.description = picked && picked.toLowerCase() === element.projectPath.toLowerCase() ? 'Startup Project' : undefined;
                item.contextValue = element.parent?.kind === 'solution' ? 'dotnetProject inSolution' : 'dotnetProject';
                return item;
            }
            case 'dependencies': {
                const item = new vscode.TreeItem('Dependencies', vscode.TreeItemCollapsibleState.Collapsed);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('package');
                item.contextValue = 'dotnetDependencies';
                return item;
            }
            case 'package': {
                const item = new vscode.TreeItem(`${element.packageId} ${element.version}`, vscode.TreeItemCollapsibleState.None);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('package');
                item.contextValue = 'dotnetPackage';
                item.command = { command: 'dotnet-creator.solutionExplorer.openNugetManager', title: 'Manage NuGet Packages', arguments: [element] };
                return item;
            }
            case 'projectReference': {
                const item = new vscode.TreeItem(path.basename(element.referencedProjectPath), vscode.TreeItemCollapsibleState.None);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('references');
                item.tooltip = element.referencedProjectPath;
                item.contextValue = 'dotnetProjectReference';
                item.command = { command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.file(element.referencedProjectPath)] };
                return item;
            }
            case 'analyzers': {
                const item = new vscode.TreeItem('Analyzers', vscode.TreeItemCollapsibleState.Collapsed);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('symbol-misc');
                item.contextValue = 'dotnetAnalyzers';
                return item;
            }
            case 'analyzer': {
                const item = new vscode.TreeItem(element.packageId, vscode.TreeItemCollapsibleState.None);
                item.id = element.id;
                item.iconPath = new vscode.ThemeIcon('symbol-misc');
                item.contextValue = 'dotnetAnalyzer';
                return item;
            }
            case 'folder': {
                const item = new vscode.TreeItem(element.uri, vscode.TreeItemCollapsibleState.Collapsed);
                item.id = element.id;
                item.contextValue = 'dotnetFolder canRename canDelete canNew canCopy canCut';
                return item;
            }
            case 'file': {
                const item = new vscode.TreeItem(element.uri, vscode.TreeItemCollapsibleState.None);
                item.id = element.id;
                item.command = { command: 'vscode.open', title: 'Open', arguments: [element.uri] };
                item.description = element.excluded ? '(excluded)' : undefined;
                const tokens = ['dotnetFile'];
                if (!element.isProjectFile) { tokens.push('canRename'); }
                tokens.push('canDelete', 'canNew', 'canCopy', 'canCut');
                tokens.push(element.excluded ? 'canInclude' : 'canExclude');
                item.contextValue = tokens.join(' ');
                return item;
            }
        }
    }

    // --- File watching -----------------------------------------------------

    private ensureWatcher(node: ProjectNode): void {
        if (this.watchers.has(node.projectPath)) { return; }

        const projectDir = path.dirname(node.projectPath);
        const pattern = new vscode.RelativePattern(vscode.Uri.file(projectDir), '**/*');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const handle = (uri: vscode.Uri) => this.scheduleRefresh(uri, node);
        watcher.onDidCreate(handle);
        watcher.onDidChange(handle);
        watcher.onDidDelete(handle);

        this.watchers.set(node.projectPath, watcher);
    }

    private scheduleRefresh(uri: vscode.Uri, projectNode: ProjectNode): void {
        const lower = uri.fsPath.toLowerCase();
        if (lower.includes(`${path.sep}bin${path.sep}`) || lower.includes(`${path.sep}obj${path.sep}`)) { return; }

        if (lower === projectNode.projectPath.toLowerCase()) {
            this.invalidatePackageCache(projectNode.projectPath);
        }

        const parentDir = path.dirname(uri.fsPath);
        const nodeId = parentDir.toLowerCase() === path.dirname(projectNode.projectPath).toLowerCase()
            ? projectNode.id
            : `folder::${parentDir}`;

        this.pendingRefresh.add(nodeId);
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.debounceTimer = setTimeout(() => this.flushPendingRefresh(), DEBOUNCE_MS);
    }

    private flushPendingRefresh(): void {
        const ids = [...this.pendingRefresh];
        this.pendingRefresh.clear();
        for (const id of ids) {
            this._onDidChangeTreeData.fire(this.nodeCache.get(id));
        }
    }

    // --- Drag and drop -------------------------------------------------------

    async handleDrag(source: readonly SolutionExplorerNode[], dataTransfer: vscode.DataTransfer): Promise<void> {
        const movable = source.filter((n): n is FolderNode | FileNode => n.kind === 'folder' || n.kind === 'file');
        if (movable.length === 0) { return; }
        dataTransfer.set(DRAG_MIME_TYPE, new vscode.DataTransferItem(movable));
    }

    async handleDrop(target: SolutionExplorerNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferItem = dataTransfer.get(DRAG_MIME_TYPE);
        if (!transferItem) { return; }

        const sources = transferItem.value as (FolderNode | FileNode)[];

        let targetDir: vscode.Uri | undefined;
        if (target?.kind === 'folder') { targetDir = target.uri; }
        else if (target?.kind === 'project') { targetDir = vscode.Uri.file(path.dirname(target.projectPath)); }
        if (!targetDir) { return; }

        for (const source of sources) {
            const newUri = vscode.Uri.joinPath(targetDir, path.basename(source.uri.fsPath));
            if (newUri.fsPath.toLowerCase() === source.uri.fsPath.toLowerCase()) { continue; }

            const edit = new vscode.WorkspaceEdit();
            edit.renameFile(source.uri, newUri);
            await vscode.workspace.applyEdit(edit);
        }
    }

    // --- Sync with active editor --------------------------------------------

    /** Reconstructs the node (and its full parent chain) for an arbitrary file URI, for TreeView.reveal(). Best-effort: nodes aren't kept permanently cached, so this walks the path back up to the owning project. */
    async resolveNodeForUri(uri: vscode.Uri): Promise<FileNode | undefined> {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) { return undefined; }

        const projectPath = await this.findOwningProject(folder, uri.fsPath);
        if (!projectPath) { return undefined; }

        const projectDir = path.dirname(projectPath);
        if (!uri.fsPath.toLowerCase().startsWith(projectDir.toLowerCase())) { return undefined; }

        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const wsParent: WorkspaceFolderNode | undefined = workspaceFolders.length > 1
            ? { kind: 'workspaceFolder', id: `wsFolder::${folder.uri.toString()}`, folder }
            : undefined;

        const solutionPath = peekCurrentSolution(folder);
        const solutionParent: SolutionNode | undefined = solutionPath
            ? { kind: 'solution', id: `solution::${solutionPath}`, folder, solutionPath, parent: wsParent }
            : undefined;

        const projectNode: ProjectNode = {
            kind: 'project',
            id: `project::${projectPath}`,
            folder,
            projectPath,
            parent: solutionParent ?? wsParent
        };

        const relativeDir = path.relative(projectDir, path.dirname(uri.fsPath));
        const segments = relativeDir ? relativeDir.split(path.sep) : [];

        let parent: ProjectNode | FolderNode = projectNode;
        let currentDir = projectDir;
        for (const segment of segments) {
            currentDir = path.join(currentDir, segment);
            parent = { kind: 'folder', id: `folder::${currentDir}`, parent, projectNode, uri: vscode.Uri.file(currentDir) };
        }

        const excluded = await isExcluded(projectPath, uri.fsPath);
        return {
            kind: 'file',
            id: `file::${uri.fsPath}`,
            parent,
            projectNode,
            uri,
            isProjectFile: uri.fsPath.toLowerCase() === projectPath.toLowerCase(),
            excluded
        };
    }

    private async findOwningProject(folder: vscode.WorkspaceFolder, filePath: string): Promise<string | undefined> {
        const solutionPath = peekCurrentSolution(folder);
        const candidates = solutionPath
            ? await parseSolutionProjects(solutionPath)
            : (await findAllCsprojFiles(folder)).map(uri => uri.fsPath);

        let best: string | undefined;
        for (const candidate of candidates) {
            const dir = path.dirname(candidate).toLowerCase();
            if (filePath.toLowerCase().startsWith(dir) && (!best || dir.length > path.dirname(best).length)) {
                best = candidate;
            }
        }
        return best;
    }
}

export function registerSolutionExplorerView(context: vscode.ExtensionContext): SolutionExplorerProvider {
    const provider = new SolutionExplorerProvider();
    const treeView = vscode.window.createTreeView('dotnet-creator.solutionExplorerView', {
        treeDataProvider: provider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: provider
    });

    context.subscriptions.push(
        treeView,
        provider,
        onDidChangeCurrentSolution(event => provider.notifySolutionChanged(event.folder)),
        onDidChangePickedCsproj(event => provider.notifyPickedProjectChanged(event.folder)),
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            if (!editor || !treeView.visible) { return; }
            const node = await provider.resolveNodeForUri(editor.document.uri);
            if (node) {
                try {
                    await treeView.reveal(node, { select: true, focus: false });
                } catch {
                    // Not resolvable in the current tree state - acceptable, not every open file belongs to a tracked project.
                }
            }
        })
    );

    return provider;
}
