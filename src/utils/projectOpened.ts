import * as vscode from 'vscode';
import { peekFolderState } from './folderState';

/**
 * The stronger gate item #14 needed: `hasAnyDotnetProject()` (workspaceHasProject.ts) only checks
 * "does a .csproj/.sln exist somewhere in the workspace", which lit up this very extension's own
 * status bar/Resource Monitor/F5 just because of `designer-host/DesignerHost.csproj` - a real but
 * incidental project nobody asked .NET Studio to do anything with. This checks the explicit
 * FolderState.explicitlyOpened flag instead (see openTarget.ts), which only gets set by a real
 * "open this in .NET Studio" action - never by autoPickSoleProject's silent single-candidate
 * derivation.
 */
export function isFolderExplicitlyOpened(folder: vscode.WorkspaceFolder | undefined): boolean {
    return !!folder && !!peekFolderState(folder).explicitlyOpened;
}

/** Workspace-wide version, for gating things that aren't scoped to a single active folder (the
 *  Resource Monitor/Solution Explorer views, F5/build keybindings - see extension.ts). */
export function hasAnyExplicitlyOpenedFolder(): boolean {
    return (vscode.workspace.workspaceFolders ?? []).some(isFolderExplicitlyOpened);
}

/** Shared by all three .NET status bar segments (Solution/Project/Configuration) so they show/hide
 *  together as one unit, gated on the ACTIVE folder specifically - matches what they already
 *  display, and avoids stale info lingering when you switch to an unrelated active folder in a
 *  multi-root workspace. */
export function applyOpenedVisibility(item: vscode.StatusBarItem, folder: vscode.WorkspaceFolder | undefined): void {
    if (isFolderExplicitlyOpened(folder)) { item.show(); } else { item.hide(); }
}
