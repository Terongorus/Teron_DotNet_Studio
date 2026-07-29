import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from '../utils/process';
import { isValidProjectName, isValidPackageId } from '../utils/validation';
import { getProjectTemplates, firstShortName, DotnetTemplate } from '../utils/templates';
import { pickExistingSolution } from '../utils/solutionPicker';
import { promptCreateSolution } from './createSolution';

interface TemplatePickItem extends vscode.QuickPickItem {
    template?: DotnetTemplate;
    isInstallAction?: boolean;
}

export function registerNewProjectCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('dotnet-creator.newProject', async () => {
        // 1. Fetch available project templates (scaffold-only templates like
        // .gitignore/.editorconfig/sln are excluded - see Manage Solution Files)
        const templates = await getProjectTemplates();

        const items: TemplatePickItem[] = templates.map(t => ({
            label: `$(code) ${t.name}`,
            description: firstShortName(t),
            detail: t.language,
            template: t
        }));

        // 2. Add an "Install New Template" option at the very top
        items.unshift({
            label: '$(cloud-download) Install new template...',
            description: 'Download from NuGet',
            detail: 'Runs dotnet new install <package-id>',
            alwaysShow: true,
            isInstallAction: true
        });

        // 3. Prompt the user for template
        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a .NET project template or install a new one',
            title: 'Create .NET Project'
        });

        if (!selection) { return; }

        // 4. Handle template installation flow
        if (selection.isInstallAction) {
            await installNewTemplate();
            return;
        }

        const template = selection.template;
        if (!template) { return; }

        // 5. Prompt for Project Name
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter the name of your new project',
            placeHolder: 'MyDotNetProject',
            title: 'Create .NET Project',
            validateInput: isValidProjectName
        });

        if (!projectName) { return; }

        // 6. Decide whether this project belongs to a solution, and if so, which one
        const addToSolution = await vscode.window.showQuickPick(
            [
                { label: 'Yes', description: 'Add this project to a solution' },
                { label: 'No', description: 'Create a standalone project' }
            ],
            { placeHolder: 'Add this project to a solution?', title: 'Create .NET Project' }
        );

        if (!addToSolution) { return; }

        let solutionFolder: string;
        let slnPath: string | undefined;

        if (addToSolution.label === 'Yes') {
            const solutionChoice = await vscode.window.showQuickPick(
                [
                    { label: 'Use an existing solution', value: 'existing' as const },
                    { label: 'Create a new solution', value: 'new' as const }
                ],
                { placeHolder: 'Use an existing solution or create a new one?', title: 'Create .NET Project' }
            );

            if (!solutionChoice) { return; }

            slnPath = solutionChoice.value === 'existing'
                ? await pickExistingSolution()
                : await promptCreateSolution(projectName);

            if (!slnPath) { return; }

            solutionFolder = path.dirname(slnPath);
        } else {
            // 7. Prompt for Save Location
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Create Project Here',
                title: 'Create .NET Project'
            });

            if (!folderUri || folderUri.length === 0) { return; }

            solutionFolder = folderUri[0].fsPath;
        }

        const fullProjectPath = path.join(solutionFolder, projectName);

        // 8. Overwrite protection
        if (fs.existsSync(fullProjectPath) && fs.readdirSync(fullProjectPath).length > 0) {
            const confirm = await vscode.window.showWarningMessage(
                `The folder "${fullProjectPath}" already exists and is not empty. Continue anyway?`,
                { modal: true },
                'Continue'
            );
            if (confirm !== 'Continue') { return; }
        }

        // 9. Execute sequential creation steps safely
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${projectName}...`,
            cancellable: false
        }, async () => {
            try {
                await runDotnet(['new', firstShortName(template), '-n', projectName, '-o', fullProjectPath]);

                if (slnPath) {
                    await runDotnet(['sln', slnPath, 'add', fullProjectPath]);
                }

                vscode.window.showInformationMessage(`Successfully created ${projectName}!`, 'Open Project')
                    .then(choice => {
                        if (choice === 'Open Project') {
                            const openPath = slnPath ? solutionFolder : fullProjectPath;
                            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(openPath), false);
                        }
                    });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to create project/solution: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

async function installNewTemplate() {
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the NuGet package ID of the template',
        placeHolder: 'e.g., Microsoft.Web.Library.ProjectTemplates',
        validateInput: isValidPackageId
    });

    if (!packageId) { return; }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing template: ${packageId}...`,
        cancellable: false
    }, async () => {
        try {
            await runDotnet(['new', 'install', packageId]);
            vscode.window.showInformationMessage(`Successfully installed template: ${packageId}! Run the project creator again to use it.`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to install template: ${error.message}`);
        }
    });
}
