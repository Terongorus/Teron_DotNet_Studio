import * as vscode from 'vscode';
import * as path from 'path';

export interface WorkspaceFolderNode {
    kind: 'workspaceFolder';
    id: string;
    folder: vscode.WorkspaceFolder;
}

export interface SolutionNode {
    kind: 'solution';
    id: string;
    folder: vscode.WorkspaceFolder;
    solutionPath: string;
    parent: WorkspaceFolderNode | undefined;
}

export interface ProjectNode {
    kind: 'project';
    id: string;
    folder: vscode.WorkspaceFolder;
    projectPath: string;
    parent: SolutionNode | WorkspaceFolderNode | undefined;
}

export interface DependenciesNode {
    kind: 'dependencies';
    id: string;
    parent: ProjectNode;
}

export interface PackageNode {
    kind: 'package';
    id: string;
    parent: DependenciesNode;
    projectNode: ProjectNode;
    packageId: string;
    version: string;
}

export interface ProjectReferenceNode {
    kind: 'projectReference';
    id: string;
    parent: DependenciesNode;
    projectNode: ProjectNode;
    referencedProjectPath: string;
}

export interface AnalyzersNode {
    kind: 'analyzers';
    id: string;
    parent: DependenciesNode;
    projectNode: ProjectNode;
}

export interface AnalyzerNode {
    kind: 'analyzer';
    id: string;
    parent: AnalyzersNode;
    packageId: string;
}

export interface FolderNode {
    kind: 'folder';
    id: string;
    parent: ProjectNode | FolderNode;
    projectNode: ProjectNode;
    uri: vscode.Uri;
}

export interface FileNode {
    kind: 'file';
    id: string;
    parent: ProjectNode | FolderNode | FileNode;
    projectNode: ProjectNode;
    uri: vscode.Uri;
    isProjectFile: boolean;
    excluded: boolean;
    /** Filenames (not full paths, same directory) of code-behind/designer files nested under this one - e.g. "MainWindow.xaml.cs" under "MainWindow.xaml". Matches VS/ReSharper's dependent-file grouping. */
    dependentNames?: string[];
}

export type SolutionExplorerNode =
    | WorkspaceFolderNode
    | SolutionNode
    | ProjectNode
    | DependenciesNode
    | PackageNode
    | ProjectReferenceNode
    | AnalyzersNode
    | AnalyzerNode
    | FolderNode
    | FileNode;

/** Directory a "New File/Folder"-style action targets when invoked on this node. */
export function targetDirectoryFor(node: ProjectNode | FolderNode | FileNode): vscode.Uri {
    if (node.kind === 'project') { return vscode.Uri.file(path.dirname(node.projectPath)); }
    if (node.kind === 'folder') { return node.uri; }
    return vscode.Uri.joinPath(node.uri, '..');
}

export function getParentNode(node: SolutionExplorerNode): SolutionExplorerNode | undefined {
    switch (node.kind) {
        case 'workspaceFolder':
            return undefined;
        case 'solution':
        case 'project':
        case 'dependencies':
        case 'package':
        case 'projectReference':
        case 'analyzers':
        case 'analyzer':
        case 'folder':
        case 'file':
            return node.parent;
    }
}
