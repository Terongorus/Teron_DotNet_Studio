import * as vscode from 'vscode';

const DONT_ASK_AGAIN_KEY = 'dotnetCreator.sharpLspNotInstalledDontAskAgain';
const SHARPLSP_README_URL = 'https://github.com/Nimblesite/SharpLsp#readme';

let outputChannel: vscode.OutputChannel | undefined;
let shownThisSession = false;

/** Our own pre-spawn diagnostics channel - kept separate from the real server's LSP log (client.outputChannel), so "Show Output" on a server failure always means the actual server log. */
export function getSharpLspOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('.NET Language Server');
    }
    return outputChannel;
}

export type NotInstalledChoice = 'download' | 'bundled' | 'instructions' | 'dont-ask-again' | undefined;

/** One-shot per session (in-memory guard) - a second C#/F# file opened in the same window shouldn't re-prompt. Checks the persisted "Don't Ask Again" flag first. */
export async function showNotInstalledNotice(context: vscode.ExtensionContext, hasBundled: boolean): Promise<NotInstalledChoice> {
    if (context.globalState.get<boolean>(DONT_ASK_AGAIN_KEY, false)) { return undefined; }
    if (shownThisSession) { return undefined; }
    shownThisSession = true;

    const USE_BUNDLED = 'Use Bundled SharpLsp';
    const DOWNLOAD = 'Download SharpLsp';
    const INSTRUCTIONS = 'Install Instructions';
    const DONT_ASK = "Don't Ask Again";

    const actions = hasBundled ? [USE_BUNDLED, DOWNLOAD, INSTRUCTIONS, DONT_ASK] : [DOWNLOAD, INSTRUCTIONS, DONT_ASK];

    const choice = await vscode.window.showInformationMessage(
        'SharpLsp (an open-source, MIT-licensed C#/F# language server) was not found. Install it for C# and F# language features - everything else in .NET Studio works normally without it.',
        ...actions
    );

    if (choice === USE_BUNDLED) { return 'bundled'; }
    if (choice === DOWNLOAD) { return 'download'; }
    if (choice === INSTRUCTIONS) {
        void vscode.env.openExternal(vscode.Uri.parse(SHARPLSP_README_URL));
        return 'instructions';
    }
    if (choice === DONT_ASK) {
        await context.globalState.update(DONT_ASK_AGAIN_KEY, true);
        return 'dont-ask-again';
    }
    return undefined;
}

export function showMisconfiguredPathNotice(detail: string): void {
    void vscode.window.showErrorMessage(`SharpLsp: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { getSharpLspOutputChannel().show(); }
    });
}

export function showGaveUpNotice(): void {
    void vscode.window.showErrorMessage(
        "SharpLsp: language server failed to start after multiple attempts. C#/F# language features are unavailable until it's restarted.",
        'Show Output'
    ).then(choice => {
        if (choice === 'Show Output') { getSharpLspOutputChannel().show(); }
    });
}

export function showDownloadFailedNotice(detail: string): void {
    void vscode.window.showErrorMessage(`Failed to download SharpLsp: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { getSharpLspOutputChannel().show(); }
    });
}

export function showDownloadSucceededNotice(version: string): void {
    void vscode.window.showInformationMessage(`SharpLsp ${version} installed. Starting the language server...`);
}
