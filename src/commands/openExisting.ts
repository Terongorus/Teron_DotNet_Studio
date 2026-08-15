import * as vscode from 'vscode';
import * as path from 'path';
import { addRecentItem, RecentItemKind } from '../startPage/recentItems';
import { openSolutionTarget, openProjectTarget } from '../utils/openTarget';

export function registerOpenExistingCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-studio.openExisting', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Solutions & Projects': ['sln', 'slnx', 'csproj', 'fsproj'] },
            title: 'Open Existing Solution or Project'
        });

        if (!uris || uris.length === 0) { return; }

        const filePath = uris[0].fsPath;
        const ext = path.extname(filePath).toLowerCase();
        const folderPath = path.dirname(filePath);
        const kind: RecentItemKind = (ext === '.sln' || ext === '.slnx') ? 'solution' : 'project';

        await addRecentItem(context.globalState, {
            kind,
            name: path.basename(filePath, ext),
            folderPath,
            filePath
        });

        if (kind === 'solution') {
            await openSolutionTarget(folderPath, filePath);
        } else {
            await openProjectTarget(folderPath, filePath);
        }
    });

    context.subscriptions.push(disposable);
}
