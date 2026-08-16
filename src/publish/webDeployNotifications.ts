import * as vscode from 'vscode';

const DONT_ASK_AGAIN_KEY = 'dotnet-studio.webDeployNotInstalledDontAskAgain';
const WEB_DEPLOY_DOWNLOAD_URL = 'https://www.iis.net/downloads/microsoft/web-deploy';

let shownThisSession = false;

export type NotInstalledChoice = 'instructions' | 'dont-ask-again' | undefined;

/** Install-Instructions-only, no Download button - Web Deploy ships as a signed MSI, not a portable release asset this extension could verify/extract itself (same reasoning as the Azure/Docker CLIs, unlike netcoredbg's binary download). One-shot per session, gated by a persisted "Don't Ask Again" flag - mirrors netcoredbgNotifications.ts's showNotInstalledNotice. */
export async function showWebDeployNotInstalledNotice(context: vscode.ExtensionContext): Promise<NotInstalledChoice> {
    if (context.globalState.get<boolean>(DONT_ASK_AGAIN_KEY, false)) { return undefined; }
    if (shownThisSession) { return undefined; }
    shownThisSession = true;

    const INSTRUCTIONS = 'Install Instructions';
    const DONT_ASK = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(
        'Web Deploy (msdeploy.exe) was not found. It\'s required to publish to a Web Server target - Visual Studio itself relies on the same tool under the hood.',
        INSTRUCTIONS, DONT_ASK
    );

    if (choice === INSTRUCTIONS) {
        void vscode.env.openExternal(vscode.Uri.parse(WEB_DEPLOY_DOWNLOAD_URL));
        return 'instructions';
    }
    if (choice === DONT_ASK) {
        await context.globalState.update(DONT_ASK_AGAIN_KEY, true);
        return 'dont-ask-again';
    }
    return undefined;
}

export function showWebDeployMisconfiguredPathNotice(detail: string): void {
    void vscode.window.showErrorMessage(`Web Deploy: ${detail}`);
}
