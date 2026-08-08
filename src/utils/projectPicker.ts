import * as vscode from 'vscode';
import * as path from 'path';

export interface PickCsprojArgs {
    include?: string;
    acceptIfOneFile?: boolean;
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
 */
export async function pickCsprojFile(args?: PickCsprojArgs): Promise<string | undefined> {
    const include = args?.include ?? '**/*.csproj';
    const acceptIfOneFile = args?.acceptIfOneFile ?? true;

    const found = await vscode.workspace.findFiles(include, '**/{bin,obj,node_modules}/**');

    if (found.length === 0) {
        vscode.window.showWarningMessage(`No project files found matching "${include}".`);
        return undefined;
    }

    if (found.length === 1 && acceptIfOneFile) {
        return found[0].fsPath;
    }

    const items = found.map(uri => ({
        label: `$(file) ${path.basename(uri.fsPath)}`,
        description: uri.fsPath,
        uri
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a project file',
        title: 'Select .csproj'
    });

    return selection?.uri.fsPath;
}
