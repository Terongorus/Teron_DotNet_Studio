import * as vscode from 'vscode';
import { getPublishProfileFormStyles, getPublishProfileFormBodyHtml, getPublishProfileFormScript } from './publishProfileFormMarkup';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

/**
 * A brand-new profile, always starting from the same defaults (Folder target, no prefill) - a
 * dedicated page/panel from editPublishProfileHtml.ts's own (see newPublishProfilePanel.ts), not
 * the same form reused with a flag.
 */
export function getNewPublishProfileHtml(webview: vscode.Webview, projectName: string, runtimeIdentifiers: string[]): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    const ridOptions = runtimeIdentifiers.map(rid => `<option value="${rid}">${rid}</option>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>New Publish Profile: ${projectName}</title>
    <style nonce="${nonce}">${getPublishProfileFormStyles()}</style>
</head>
<body>
    <h1>New Publish Profile</h1>
    <p class="subtitle">Configure a new publish profile for ${projectName}.</p>

    ${getPublishProfileFormBodyHtml(ridOptions)}

    <script nonce="${nonce}">
        ${getPublishProfileFormScript()}

        targetTypeEl.value = 'folder';
        updateVisibilityForType();
        updateConditionalRows();
        saveBtn.disabled = !canSave();

        saveBtn.addEventListener('click', () => {
            if (!canSave()) { return; }
            saveBtn.disabled = true;
            statusLine.textContent = 'Saving...';
            vscode.postMessage({ command: 'save', profile: collectProfile(), secret: collectSecret() });
        });

        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
}
