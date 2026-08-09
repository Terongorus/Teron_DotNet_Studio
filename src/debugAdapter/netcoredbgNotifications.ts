import * as vscode from 'vscode';

const DONT_ASK_AGAIN_KEY = 'dotnetCreator.netcoredbgNotInstalledDontAskAgain';
const NETCOREDBG_README_URL = 'https://github.com/Samsung/netcoredbg#readme';

let outputChannel: vscode.OutputChannel | undefined;
let shownThisSession = false;

/** Our own pre-spawn diagnostics channel - separate from any debug-session output, so "Show Output" always means these resolution/download diagnostics. */
export function getNetcoredbgOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('.NET Debugger');
    }
    return outputChannel;
}

export type NotInstalledChoice = 'download' | 'instructions' | 'dont-ask-again' | undefined;

/** One-shot per session (in-memory guard) - pressing F5 again in the same window shouldn't re-prompt. Checks the persisted "Don't Ask Again" flag first. */
export async function showNotInstalledNotice(context: vscode.ExtensionContext): Promise<NotInstalledChoice> {
    if (context.globalState.get<boolean>(DONT_ASK_AGAIN_KEY, false)) { return undefined; }
    if (shownThisSession) { return undefined; }
    shownThisSession = true;

    const DOWNLOAD = 'Download netcoredbg';
    const INSTRUCTIONS = 'Install Instructions';
    const DONT_ASK = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(
        'netcoredbg (an open-source, MIT-licensed .NET debugger) was not found. Install it to debug with breakpoints/stepping without Microsoft\'s C# extension.',
        DOWNLOAD, INSTRUCTIONS, DONT_ASK
    );

    if (choice === DOWNLOAD) { return 'download'; }
    if (choice === INSTRUCTIONS) {
        void vscode.env.openExternal(vscode.Uri.parse(NETCOREDBG_README_URL));
        return 'instructions';
    }
    if (choice === DONT_ASK) {
        await context.globalState.update(DONT_ASK_AGAIN_KEY, true);
        return 'dont-ask-again';
    }
    return undefined;
}

export function showMisconfiguredPathNotice(detail: string): void {
    void vscode.window.showErrorMessage(`netcoredbg: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { getNetcoredbgOutputChannel().show(); }
    });
}

export function showDownloadFailedNotice(detail: string): void {
    void vscode.window.showErrorMessage(`Failed to download netcoredbg: ${detail}`, 'Show Output').then(choice => {
        if (choice === 'Show Output') { getNetcoredbgOutputChannel().show(); }
    });
}

export function showDownloadSucceededNotice(version: string): void {
    void vscode.window.showInformationMessage(`netcoredbg ${version} installed. Press F5 again to start debugging.`);
}
