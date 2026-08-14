import * as vscode from 'vscode';

export interface FormatterToolInfo {
    /** e.g. "CSharpier" - display name only. */
    displayName: string;
    /** e.g. "csharpier" - the NuGet package id / dotnet tool command name (same value for both, true for both CSharpier and Fantomas). */
    packageId: string;
    docsUrl: string;
}

export type NotInstalledChoice = 'install' | 'instructions' | 'dont-ask-again' | undefined;

const shownThisSession = new Set<string>();

/** One-shot per session per tool (in-memory guard) - reformatting a second file for the same language shouldn't re-prompt. Checks the persisted "Don't Ask Again" flag first, same pattern as sharpLspNotifications.ts. */
export async function showNotInstalledNotice(context: vscode.ExtensionContext, tool: FormatterToolInfo): Promise<NotInstalledChoice> {
    const dontAskAgainKey = `dotnetCreator.${tool.packageId}NotInstalledDontAskAgain`;
    if (context.globalState.get<boolean>(dontAskAgainKey, false)) { return undefined; }
    if (shownThisSession.has(tool.packageId)) { return undefined; }
    shownThisSession.add(tool.packageId);

    const INSTALL = `Install ${tool.displayName}`;
    const INSTRUCTIONS = 'Install Instructions';
    const DONT_ASK = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(
        `${tool.displayName} (a dotnet global tool) was not found. Install it to enable code formatting - everything else in .NET Studio works normally without it.`,
        INSTALL, INSTRUCTIONS, DONT_ASK
    );

    if (choice === INSTALL) { return 'install'; }
    if (choice === INSTRUCTIONS) {
        void vscode.env.openExternal(vscode.Uri.parse(tool.docsUrl));
        return 'instructions';
    }
    if (choice === DONT_ASK) {
        await context.globalState.update(dontAskAgainKey, true);
        return 'dont-ask-again';
    }
    return undefined;
}

export function showInstallFailedNotice(tool: FormatterToolInfo, detail: string, outputChannel: vscode.OutputChannel): void {
    void vscode.window.showErrorMessage(`Failed to install ${tool.displayName}: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { outputChannel.show(); }
    });
}

export function showInstallSucceededNotice(tool: FormatterToolInfo): void {
    void vscode.window.showInformationMessage(`${tool.displayName} installed. Formatting is now available.`);
}
