import * as vscode from 'vscode';
import { RecentItem } from './recentItems';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const ICONS: Record<string, string> = {
    newProject: '<path d="M8 2v9M3.5 6.5h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2" fill="none"/>',
    createSolution: '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M2 6h12" stroke="currentColor" stroke-width="1.2"/>',
    manageSolution: '<path d="M8 2l1.3 2.7 3 .4-2.15 2.1.5 3-2.65-1.4-2.65 1.4.5-3L3.7 5.1l3-.4z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round"/>',
    openExisting: '<path d="M2 5.5a1 1 0 0 1 1-1h3l1.3 1.6H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/>',
    project: '<path d="M4 2h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round"/>',
    solution: '<rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.1" fill="none"/>'
};

function iconSvg(name: string): string {
    return `<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">${ICONS[name]}</svg>`;
}

function renderRecentItem(item: RecentItem): string {
    return `
        <li class="recent-item" data-folder="${escapeHtml(item.folderPath)}">
            <span class="recent-icon">${iconSvg(item.kind)}</span>
            <span class="recent-text">
                <span class="recent-name">${escapeHtml(item.name)}</span>
                <span class="recent-path">${escapeHtml(item.folderPath)}</span>
            </span>
            <button class="recent-remove" data-remove-folder="${escapeHtml(item.folderPath)}" title="Remove from Recent" aria-label="Remove from Recent">&times;</button>
        </li>`;
}

export function getStartPageHtml(webview: vscode.Webview, recentItems: RecentItem[], iconUri: vscode.Uri, showOnStartup: boolean): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    const recentHtml = recentItems.length > 0
        ? `<ul class="recent-list">${recentItems.map(renderRecentItem).join('')}</ul>`
        : `<p class="empty-state">No recent projects or solutions yet.</p>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>.NET Studio</title>
    <style nonce="${nonce}">
        html, body {
            height: 100%;
        }
        body {
            display: flex;
            justify-content: center;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
        }
        .page {
            width: 100%;
            max-width: 760px;
            box-sizing: border-box;
            padding: 72px 32px 48px;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 48px;
        }
        .header img {
            width: 48px;
            height: 48px;
        }
        h1 {
            font-weight: 300;
            font-size: 30px;
            margin: 0;
        }
        .subtitle {
            font-size: 14px;
            opacity: 0.7;
            margin-top: 4px;
        }
        .columns {
            display: flex;
            gap: 96px;
            flex-wrap: wrap;
        }
        h2 {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            opacity: 0.7;
            margin-bottom: 16px;
        }
        .actions {
            list-style: none;
            padding: 0;
            margin: 0;
            min-width: 260px;
        }
        .actions button {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            background: none;
            border: none;
            color: var(--vscode-textLink-foreground);
            font-size: 14px;
            padding: 6px 0;
            cursor: pointer;
            text-align: left;
        }
        .actions button:hover {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
        .icon {
            flex-shrink: 0;
            opacity: 0.9;
        }
        .recent-list {
            list-style: none;
            padding: 0;
            margin: 0;
            min-width: 320px;
        }
        .recent-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0;
        }
        .recent-icon {
            flex-shrink: 0;
            opacity: 0.8;
        }
        .recent-text {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1;
            cursor: pointer;
        }
        .recent-name {
            color: var(--vscode-textLink-foreground);
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .recent-item:hover .recent-name {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
        .recent-path {
            font-size: 12px;
            opacity: 0.6;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .recent-remove {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            opacity: 0;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 4px;
            flex-shrink: 0;
        }
        .recent-item:hover .recent-remove {
            opacity: 0.6;
        }
        .recent-remove:hover {
            opacity: 1 !important;
        }
        .empty-state {
            opacity: 0.6;
            font-size: 13px;
        }
        .footer-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 56px;
            font-size: 13px;
            opacity: 0.8;
            cursor: pointer;
            user-select: none;
        }
        .footer-toggle input {
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="page">
        <div class="header">
            <img src="${iconUri}" alt="">
            <div>
                <h1>.NET Studio</h1>
                <div class="subtitle">Your solution, streamlined.</div>
            </div>
        </div>
        <div class="columns">
            <div>
                <h2>Start</h2>
                <ul class="actions">
                    <li><button data-command="newProject">${iconSvg('newProject')}<span>Create New Project...</span></button></li>
                    <li><button data-command="createSolution">${iconSvg('createSolution')}<span>Create Solution...</span></button></li>
                    <li><button data-command="manageSolution">${iconSvg('manageSolution')}<span>Manage Solution Files...</span></button></li>
                    <li><button data-command="openExisting">${iconSvg('openExisting')}<span>Open Existing Solution/Project...</span></button></li>
                </ul>
            </div>
            <div>
                <h2>Recent</h2>
                ${recentHtml}
            </div>
        </div>
        <label class="footer-toggle">
            <input type="checkbox" id="showOnStartup" ${showOnStartup ? 'checked' : ''}>
            <span>Show start page on startup</span>
        </label>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.querySelectorAll('[data-command]').forEach(el => {
            el.addEventListener('click', () => {
                vscode.postMessage({ command: el.getAttribute('data-command') });
            });
        });

        document.querySelectorAll('.recent-text').forEach(el => {
            el.addEventListener('click', () => {
                const folderPath = el.closest('.recent-item').getAttribute('data-folder');
                vscode.postMessage({ command: 'openRecent', folderPath });
            });
        });

        document.querySelectorAll('.recent-remove').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ command: 'removeRecent', folderPath: el.getAttribute('data-remove-folder') });
            });
        });

        document.getElementById('showOnStartup').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'toggleShowOnStartup', checked: e.target.checked });
        });
    </script>
</body>
</html>`;
}
