import * as vscode from 'vscode';
import { PublishProfile } from '../utils/publishProfiles';
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
 * Editing an existing profile - fields come pre-filled from `profile`, embedded directly into the
 * script at generation time (no message round-trip needed to populate, unlike the old wizard's
 * 'editProfile' postMessage flow). The profile name field is a plain editable input here, same as
 * every other field - editing the name renames the profile on save (see editPublishProfilePanel.ts),
 * it doesn't just silently write a second profile under the new name.
 */
export function getEditPublishProfileHtml(webview: vscode.Webview, projectName: string, runtimeIdentifiers: string[], profile: PublishProfile): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    const ridOptions = runtimeIdentifiers.map(rid => `<option value="${rid}">${rid}</option>`).join('');
    // Safe to embed directly: escaping '<' prevents a stray "</script>" (or "<!--") inside a path/
    // username field from breaking out of the script block early.
    const profileJson = JSON.stringify(profile).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Edit Publish Profile: ${profile.name}</title>
    <style nonce="${nonce}">${getPublishProfileFormStyles()}</style>
</head>
<body>
    <h1>Edit Publish Profile</h1>
    <p class="subtitle">Update settings for ${projectName}.</p>

    ${getPublishProfileFormBodyHtml(ridOptions)}

    <script nonce="${nonce}">
        ${getPublishProfileFormScript()}

        const existingProfile = ${profileJson};
        const previousName = existingProfile.name;
        populateFromProfile(existingProfile);
        nameValid = true;
        updateConditionalRows();
        saveBtn.disabled = !canSave();

        saveBtn.addEventListener('click', () => {
            if (!canSave()) { return; }
            saveBtn.disabled = true;
            statusLine.textContent = 'Saving...';
            vscode.postMessage({ command: 'save', profile: collectProfile(), secret: collectSecret(), previousName });
        });

        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
}
