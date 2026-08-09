import * as vscode from 'vscode';

export type BuildConfiguration = 'Debug' | 'Release';

const CONFIGURATION_KEY = 'dotnetCreator.currentConfiguration';

const _onDidChangeConfiguration = new vscode.EventEmitter<BuildConfiguration>();
export const onDidChangeConfiguration = _onDidChangeConfiguration.event;

export function getCurrentConfiguration(context: vscode.ExtensionContext): BuildConfiguration {
    return context.workspaceState.get<BuildConfiguration>(CONFIGURATION_KEY, 'Debug');
}

export async function pickConfiguration(context: vscode.ExtensionContext): Promise<BuildConfiguration | undefined> {
    const selection = await vscode.window.showQuickPick(['Debug', 'Release'], {
        title: '.NET Build Configuration',
        placeHolder: 'Select the active build configuration'
    });

    if (!selection) { return undefined; }

    const configuration = selection as BuildConfiguration;
    await context.workspaceState.update(CONFIGURATION_KEY, configuration);
    _onDidChangeConfiguration.fire(configuration);
    return configuration;
}
