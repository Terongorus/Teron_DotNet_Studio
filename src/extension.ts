import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('dotnet-creator.newProject', async () => {
        
        // 1. Fetch available templates dynamically
        const templates = await getDotNetTemplates();

        // 2. Add an "Install New Template" option at the very top
        templates.unshift({
            label: '$(cloud-download) Install new template...',
            description: 'Download from NuGet',
            detail: 'Runs dotnet new install <package-id>',
            alwaysShow: true 
        });

        // 3. Prompt the user for template
        const selection = await vscode.window.showQuickPick(templates, { 
            placeHolder: 'Select a .NET project template or install a new one',
            title: 'Create .NET Project (1/4)'
        });

        if (!selection) { return; } 

        // 4. Handle template installation flow
        if (selection.description === 'Download from NuGet') {
            await installNewTemplate();
            return; 
        }

        // 5. Prompt for Project Name
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter the name of your new project',
            placeHolder: 'MyDotNetProject',
            title: 'Create .NET Project (2/4)'
        });

        if (!projectName) { return; } 

        // 6. Prompt for Save Location
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Create Project Here',
            title: 'Create .NET Project (3/4)'
        });

        if (!folderUri || folderUri.length === 0) { return; } 
        
        const targetDirectory = folderUri[0].fsPath;
        const fullProjectPath = path.join(targetDirectory, projectName);

        // 7. Prompt for Solution (.sln) creation
        const createSln = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Create a new Solution (.sln) and add this project to it?',
            title: 'Create .NET Project (4/4)'
        });

        if (!createSln) { return; }

        // 8. Execute the creation commands
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${projectName}...`,
            cancellable: false
        }, async () => {
            return new Promise<void>((resolve) => {
                // Command to create the project
                let command = `dotnet new ${selection.description} -n "${projectName}" -o "${fullProjectPath}"`;
                
                // If requested, chain the commands to create a solution and add the project to it
                if (createSln === 'Yes') {
                    const slnPath = path.join(targetDirectory, `${projectName}.sln`);
                    // dotnet sln add accepts the project folder path and automatically finds the .csproj/.fsproj
                    command += ` && dotnet new sln -n "${projectName}" -o "${targetDirectory}" && dotnet sln "${slnPath}" add "${fullProjectPath}"`;
                }
                
                cp.exec(command, (error, stdout, stderr) => {
                    if (error) {
                        vscode.window.showErrorMessage(`Failed to create project/solution: ${stderr || error.message}`);
                        resolve();
                        return;
                    }

                    vscode.window.showInformationMessage(`Successfully created ${projectName}!`, 'Open Project')
                        .then(choice => {
                            if (choice === 'Open Project') {
                                // If a solution was created, open the parent directory so the .sln is visible in the workspace
                                const openPath = createSln === 'Yes' ? targetDirectory : fullProjectPath;
                                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(openPath), false);
                            }
                        });
                    resolve();
                });
            });
        });
    });

    context.subscriptions.push(disposable);
}

// --- HELPER FUNCTIONS ---

function getDotNetTemplates(): Promise<vscode.QuickPickItem[]> {
    return new Promise((resolve) => {
        cp.exec('dotnet new list', (error, stdout) => {
            if (error) {
                vscode.window.showErrorMessage('Failed to list .NET templates. Is the .NET SDK installed?');
                return resolve([]);
            }

            const templates: vscode.QuickPickItem[] = [];
            const lines = stdout.split('\n');
            let isParsing = false;

            for (const line of lines) {
                if (line.startsWith('---')) {
                    isParsing = true;
                    continue;
                }

                if (isParsing && line.trim().length > 0) {
                    const columns = line.split(/ {2,}/);
                    if (columns.length >= 2) {
                        templates.push({
                            label: `$(code) ${columns[0].trim()}`, 
                            description: columns[1].trim(),        
                            detail: columns.length >= 4 ? columns[3].trim() : '' 
                        });
                    }
                }
            }
            resolve(templates);
        });
    });
}

async function installNewTemplate() {
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the NuGet package ID of the template',
        placeHolder: 'e.g., Microsoft.Web.Library.ProjectTemplates'
    });

    if (!packageId) { return; }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing template: ${packageId}...`,
        cancellable: false
    }, async () => {
        return new Promise<void>((resolve) => {
            cp.exec(`dotnet new install ${packageId}`, (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`Failed to install template: ${stderr || error.message}`);
                } else {
                    vscode.window.showInformationMessage(`Successfully installed template: ${packageId}! Run the project creator again to use it.`);
                }
                resolve();
            });
        });
    });
}

export function deactivate() {}