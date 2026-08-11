import * as vscode from 'vscode';

const DONT_ASK_AGAIN_KEY = 'dotnetCreator.roslynNotInstalledDontAskAgain';
const ROSLYN_README_URL = 'https://github.com/dotnet/roslyn/blob/main/src/LanguageServer/Microsoft.CodeAnalysis.LanguageServer/README.md';

let outputChannel: vscode.OutputChannel | undefined;
let shownThisSession = false;

/** Our own pre-spawn diagnostics channel - kept separate from the real server's LSP log, so "Show Output" on a server failure always means the actual server log. */
export function getRoslynOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('.NET Roslyn Language Server');
    }
    return outputChannel;
}

export type NotInstalledChoice = 'download' | 'instructions' | 'dont-ask-again' | undefined;

/** One-shot per session (in-memory guard) - mirrors sharpLspNotifications.ts's showNotInstalledNotice(). */
export async function showNotInstalledNotice(context: vscode.ExtensionContext): Promise<NotInstalledChoice> {
    if (context.globalState.get<boolean>(DONT_ASK_AGAIN_KEY, false)) { return undefined; }
    if (shownThisSession) { return undefined; }
    shownThisSession = true;

    const DOWNLOAD = 'Download Roslyn Language Server';
    const INSTRUCTIONS = 'Install Instructions';
    const DONT_ASK = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(
        'The Roslyn Language Server (Microsoft\'s own C#/F# language server, MIT-licensed) was not found. Install it for C# language features - everything else in .NET Studio works normally without it.',
        DOWNLOAD, INSTRUCTIONS, DONT_ASK
    );

    if (choice === DOWNLOAD) { return 'download'; }
    if (choice === INSTRUCTIONS) {
        void vscode.env.openExternal(vscode.Uri.parse(ROSLYN_README_URL));
        return 'instructions';
    }
    if (choice === DONT_ASK) {
        await context.globalState.update(DONT_ASK_AGAIN_KEY, true);
        return 'dont-ask-again';
    }
    return undefined;
}

export function showMisconfiguredPathNotice(detail: string): void {
    void vscode.window.showErrorMessage(`Roslyn Language Server: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { getRoslynOutputChannel().show(); }
    });
}

export function showGaveUpNotice(): void {
    void vscode.window.showErrorMessage(
        "Roslyn Language Server: failed to start after multiple attempts. C# language features are unavailable until it's restarted.",
        'Show Output'
    ).then(choice => {
        if (choice === 'Show Output') { getRoslynOutputChannel().show(); }
    });
}

export function showDownloadFailedNotice(detail: string): void {
    void vscode.window.showErrorMessage(`Failed to download the Roslyn Language Server: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { getRoslynOutputChannel().show(); }
    });
}

export function showDownloadSucceededNotice(version: string): void {
    void vscode.window.showInformationMessage(`Roslyn Language Server ${version} installed. Starting the language server...`);
}
