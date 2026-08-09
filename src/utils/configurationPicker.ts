import * as vscode from 'vscode';
import { peekFolderState, updateFolderState } from './folderState';

export type BuildConfiguration = 'Debug' | 'Release';

export interface ConfigurationChangeEvent {
    folder: vscode.WorkspaceFolder;
    configuration: BuildConfiguration;
}

const _onDidChangeConfiguration = new vscode.EventEmitter<ConfigurationChangeEvent>();
export const onDidChangeConfiguration = _onDidChangeConfiguration.event;

export function getCurrentConfiguration(folder: vscode.WorkspaceFolder): BuildConfiguration {
    return peekFolderState(folder).currentConfiguration ?? 'Debug';
}

export async function pickConfiguration(folder: vscode.WorkspaceFolder): Promise<BuildConfiguration | undefined> {
    const selection = await vscode.window.showQuickPick(['Debug', 'Release'], {
        title: '.NET Build Configuration',
        placeHolder: 'Select the active build configuration'
    });

    if (!selection) { return undefined; }

    const configuration = selection as BuildConfiguration;
    await updateFolderState(folder, { currentConfiguration: configuration });
    _onDidChangeConfiguration.fire({ folder, configuration });
    return configuration;
}
