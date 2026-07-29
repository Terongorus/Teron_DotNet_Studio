import * as vscode from 'vscode';
import * as fs from 'fs';
import { runDotnet } from '../utils/process';
import { getSolutionFileTemplates, getExistingScaffoldFiles, firstShortName } from '../utils/templates';

interface BatchResult {
    label: string;
    ok: boolean;
    error?: string;
}

export function registerManageSolutionCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.manageSolution', async () => {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Folder',
            title: 'Manage Solution Files'
        });

        if (!folderUri || folderUri.length === 0) { return; }

        const targetFolder = folderUri[0].fsPath;

        const action = await vscode.window.showQuickPick(
            [
                { label: '$(add) Add scaffold files', value: 'add' as const },
                { label: '$(trash) Delete scaffold files permanently', value: 'delete' as const }
            ],
            { placeHolder: 'What would you like to do?', title: 'Manage Solution Files' }
        );

        if (!action) { return; }

        if (action.value === 'add') {
            await addScaffoldFiles(targetFolder);
        } else {
            await deleteScaffoldFiles(targetFolder);
        }
    });

    context.subscriptions.push(disposable);
}

async function addScaffoldFiles(targetFolder: string) {
    const templates = await getSolutionFileTemplates();

    const picks = await vscode.window.showQuickPick(
        templates.map(t => ({ label: t.name, detail: firstShortName(t), template: t })),
        {
            placeHolder: 'Select scaffold files to add',
            title: 'Add Scaffold Files',
            canPickMany: true
        }
    );

    if (!picks || picks.length === 0) { return; }

    const results: BatchResult[] = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Adding scaffold files...',
        cancellable: false
    }, async () => {
        for (const pick of picks) {
            const shortName = firstShortName(pick.template);
            const args = ['new', shortName, '-o', targetFolder];
            if (shortName === 'sln') {
                args.push('--format', 'slnx');
            }

            try {
                await runDotnet(args);
                results.push({ label: pick.template.name, ok: true });
            } catch (error: any) {
                results.push({ label: pick.template.name, ok: false, error: error.message });
            }
        }
    });

    showBatchSummary('added', results);
}

async function deleteScaffoldFiles(targetFolder: string) {
    const templates = await getSolutionFileTemplates();
    const existing = getExistingScaffoldFiles(templates, targetFolder);

    if (existing.length === 0) {
        vscode.window.showInformationMessage('No scaffold files found in this folder.');
        return;
    }

    const picks = await vscode.window.showQuickPick(
        existing.map(e => ({ label: e.filePath.split(/[\\/]/).pop()!, detail: e.template.name, entry: e })),
        {
            placeHolder: 'Select scaffold files to delete permanently',
            title: 'Delete Scaffold Files',
            canPickMany: true
        }
    );

    if (!picks || picks.length === 0) { return; }

    const fileList = picks.map(p => p.label).join('\n');
    const confirm = await vscode.window.showWarningMessage(
        `Permanently delete ${picks.length} file(s)? This cannot be undone.\n\n${fileList}`,
        { modal: true },
        'Delete Permanently'
    );

    if (confirm !== 'Delete Permanently') { return; }

    const results: BatchResult[] = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Deleting scaffold files...',
        cancellable: false
    }, async () => {
        for (const pick of picks) {
            try {
                fs.unlinkSync(pick.entry.filePath);
                results.push({ label: pick.label, ok: true });
            } catch (error: any) {
                results.push({ label: pick.label, ok: false, error: error.message });
            }
        }
    });

    showBatchSummary('deleted', results);
}

function showBatchSummary(verb: 'added' | 'deleted', results: BatchResult[]) {
    const succeeded = results.filter(r => r.ok).map(r => r.label);
    const failed = results.filter(r => !r.ok);

    const parts: string[] = [];
    if (succeeded.length > 0) {
        parts.push(`${verb === 'added' ? 'Added' : 'Deleted'}: ${succeeded.join(', ')}`);
    }
    if (failed.length > 0) {
        parts.push(`Failed: ${failed.map(f => `${f.label} (${f.error})`).join(', ')}`);
    }

    if (failed.length > 0) {
        vscode.window.showWarningMessage(parts.join(' — '));
    } else {
        vscode.window.showInformationMessage(parts.join(' — '));
    }
}
