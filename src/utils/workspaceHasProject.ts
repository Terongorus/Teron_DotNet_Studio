import * as vscode from 'vscode';

/** Cheap existence check - stops at the first match, doesn't enumerate every project. */
export async function hasAnyDotnetProject(): Promise<boolean> {
    return (await vscode.workspace.findFiles('**/*.csproj', '**/{bin,obj,node_modules}/**', 1)).length > 0;
}
