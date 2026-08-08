import * as vscode from 'vscode';
import * as path from 'path';

export interface PickCsprojArgs {
    include?: string;
    acceptIfOneFile?: boolean;
}

const PICKED_CSPROJ_KEY = 'dotnetCreator.pickedCsprojFile';
const RECENT_CSPROJ_KEY = 'dotnetCreator.recentCsprojFiles';
const MAX_RECENT_CSPROJ = 5;

function getRecentCsprojFiles(context: vscode.ExtensionContext): string[] {
    return context.workspaceState.get<string[]>(RECENT_CSPROJ_KEY, []);
}

/** Newest-first, deduped case-insensitively, capped - same shape as startPage/recentItems.ts. */
async function addRecentCsprojFile(context: vscode.ExtensionContext, filePath: string): Promise<void> {
    const existing = getRecentCsprojFiles(context).filter(p => p.toLowerCase() !== filePath.toLowerCase());
    const updated = [filePath, ...existing].slice(0, MAX_RECENT_CSPROJ);
    await context.workspaceState.update(RECENT_CSPROJ_KEY, updated);
}

/**
 * Finds .csproj files in the workspace and lets the user pick one -
 * auto-accepting the single match when there is exactly one, mirroring the
 * `extension.commandvariable.file.pickFile` input used in tasks.json/
 * launch.json `inputs`. Exposed as a command (see
 * commands/pickCsprojFile.ts) so a tasks.json/launch.json `"type": "command"`
 * input can call it directly instead of depending on a third-party
 * extension. Returns the picked file's fsPath, or undefined if cancelled/
 * nothing found - VS Code treats an undefined "command" input result as the
 * user cancelling the associated task/debug session.
 *
 * When there's a real choice to make, a "Recently Used" section is shown
 * first - this picker runs on every single debug/run instance (it's the
 * driving reason it exists at all), so re-scanning the full project list
 * each time is real friction in a solution with more than a couple of
 * projects.
 *
 * Also remembers the result in workspaceState (see getPickedCsprojFile) -
 * `${input:...}` only resolves against the `inputs` array declared in the
 * *same* JSON document, so a launch.json input and a tasks.json input can't
 * reference the same id even though they both run through this extension.
 * Persisting the pick lets a separate task-side command hand back the same
 * choice without prompting the user twice.
 */
export async function pickCsprojFile(context: vscode.ExtensionContext, args?: PickCsprojArgs): Promise<string | undefined> {
    const include = args?.include ?? '**/*.csproj';
    const acceptIfOneFile = args?.acceptIfOneFile ?? true;

    const found = await vscode.workspace.findFiles(include, '**/{bin,obj,node_modules}/**');

    if (found.length === 0) {
        vscode.window.showWarningMessage(`No project files found matching "${include}".`);
        return undefined;
    }

    let picked: string | undefined;

    if (found.length === 1 && acceptIfOneFile) {
        picked = found[0].fsPath;
    } else {
        picked = await showCsprojQuickPick(context, found);
    }

    if (picked) {
        await context.workspaceState.update(PICKED_CSPROJ_KEY, picked);
        await addRecentCsprojFile(context, picked);
    }

    return picked;
}

async function showCsprojQuickPick(context: vscode.ExtensionContext, found: vscode.Uri[]): Promise<string | undefined> {
    type Item = vscode.QuickPickItem & { uri?: vscode.Uri };

    const recentPaths = getRecentCsprojFiles(context)
        .filter(recent => found.some(uri => uri.fsPath.toLowerCase() === recent.toLowerCase()));

    const items: Item[] = [];

    if (recentPaths.length > 0) {
        items.push({ label: 'Recently Used', kind: vscode.QuickPickItemKind.Separator });
        for (const recent of recentPaths) {
            const uri = found.find(u => u.fsPath.toLowerCase() === recent.toLowerCase())!;
            items.push({ label: `$(history) ${path.basename(uri.fsPath)}`, description: uri.fsPath, uri });
        }
        items.push({ label: 'All Projects', kind: vscode.QuickPickItemKind.Separator });
    }

    for (const uri of found) {
        if (recentPaths.some(recent => recent.toLowerCase() === uri.fsPath.toLowerCase())) {
            continue;
        }
        items.push({ label: `$(file) ${path.basename(uri.fsPath)}`, description: uri.fsPath, uri });
    }

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a project file',
        title: 'Select .csproj'
    });

    return selection?.uri?.fsPath;
}

/**
 * Returns the last path stored by pickCsprojFile with no UI - for a
 * tasks.json `"inputs"` entry (a separate JSON document from launch.json,
 * see pickCsprojFile's doc comment) that needs the same selection a
 * preLaunchTask's launch config already prompted for, without prompting
 * again. Falls back to running the picker itself if nothing has been picked
 * yet (e.g. the task was run directly via "Tasks: Run Task" rather than as
 * part of an F5 debug session), so this never silently resolves to nothing.
 */
export async function getPickedCsprojFile(context: vscode.ExtensionContext, args?: PickCsprojArgs): Promise<string | undefined> {
    const stored = context.workspaceState.get<string>(PICKED_CSPROJ_KEY);
    if (stored) {
        return stored;
    }
    return pickCsprojFile(context, args);
}
