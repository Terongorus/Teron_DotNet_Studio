import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

export function getNugetManagerHtml(webview: vscode.Webview, projectName: string): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>NuGet: ${projectName}</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
        }
        h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 16px;
        }
        .tabs {
            display: flex;
            gap: 4px;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 12px;
        }
        .tab-button {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            opacity: 0.7;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 13px;
            border-bottom: 2px solid transparent;
        }
        .tab-button.active {
            opacity: 1;
            border-bottom-color: var(--vscode-textLink-foreground);
        }
        #searchInput {
            width: 100%;
            box-sizing: border-box;
            padding: 6px 8px;
            margin-bottom: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            font-size: 13px;
        }
        .status-line {
            font-size: 12px;
            opacity: 0.7;
            margin-bottom: 8px;
        }
        .layout {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        .list-column {
            flex: 1 1 320px;
            min-width: 280px;
        }
        .details-column {
            flex: 1 1 280px;
            min-width: 260px;
        }
        .package-list {
            list-style: none;
            margin: 0;
            padding: 0;
            max-height: 480px;
            overflow-y: auto;
        }
        .package-row {
            padding: 6px 8px;
            cursor: pointer;
            border-radius: 3px;
        }
        .package-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .package-row.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .package-id {
            font-size: 13px;
            color: var(--vscode-textLink-foreground);
        }
        .package-row.selected .package-id {
            color: inherit;
        }
        .package-meta {
            font-size: 11px;
            opacity: 0.7;
        }
        .package-desc {
            font-size: 11px;
            opacity: 0.6;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .details {
            display: none;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
        }
        .details-header {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 6px;
        }
        .details-description {
            font-size: 12px;
            opacity: 0.8;
            margin-bottom: 12px;
        }
        .details-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        .details-row label {
            font-size: 12px;
            opacity: 0.7;
        }
        .details-row select {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 4px;
        }
        .details-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }
        button.action {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            font-size: 13px;
        }
        button.action:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }
        button.action:disabled {
            opacity: 0.6;
            cursor: default;
        }
        button.secondary {
            background: none;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
        }
        .details-status {
            font-size: 12px;
            opacity: 0.8;
            min-height: 16px;
        }
    </style>
</head>
<body>
    <h1>${projectName}</h1>
    <div class="tabs">
        <button class="tab-button active" id="tabBrowse">Browse</button>
        <button class="tab-button" id="tabInstalled">Installed</button>
    </div>
    <div class="layout">
        <div class="list-column">
            <div id="browsePane">
                <input type="text" id="searchInput" placeholder="Search NuGet.org (min. 2 characters)...">
                <div class="status-line" id="browseStatus"></div>
                <ul class="package-list" id="searchResults"></ul>
            </div>
            <div id="installedPane" style="display: none;">
                <div class="status-line" id="installedStatus">Loading...</div>
                <ul class="package-list" id="installedList"></ul>
            </div>
        </div>
        <div class="details-column">
            <div class="details" id="details">
                <div class="details-header" id="detailsId"></div>
                <div class="details-description" id="detailsDescription"></div>
                <div class="details-row">
                    <label for="detailsVersions">Version</label>
                    <select id="detailsVersions"></select>
                </div>
                <div class="details-actions">
                    <button class="action" id="detailsInstall">Install</button>
                    <button class="action secondary" id="detailsRemove" style="display: none;">Remove</button>
                </div>
                <div class="details-status" id="detailsStatus"></div>
            </div>
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const tabBrowseBtn = document.getElementById('tabBrowse');
        const tabInstalledBtn = document.getElementById('tabInstalled');
        const browsePane = document.getElementById('browsePane');
        const installedPane = document.getElementById('installedPane');
        const searchInput = document.getElementById('searchInput');
        const browseStatus = document.getElementById('browseStatus');
        const searchResultsEl = document.getElementById('searchResults');
        const installedStatus = document.getElementById('installedStatus');
        const installedListEl = document.getElementById('installedList');
        const detailsEl = document.getElementById('details');
        const detailsId = document.getElementById('detailsId');
        const detailsDescription = document.getElementById('detailsDescription');
        const detailsVersions = document.getElementById('detailsVersions');
        const detailsInstall = document.getElementById('detailsInstall');
        const detailsRemove = document.getElementById('detailsRemove');
        const detailsStatus = document.getElementById('detailsStatus');

        let selectedId = null;
        let lastInstalledVersion = undefined;
        const descriptionsById = {};

        function showTab(tab) {
            const isBrowse = tab === 'browse';
            browsePane.style.display = isBrowse ? 'block' : 'none';
            installedPane.style.display = isBrowse ? 'none' : 'block';
            tabBrowseBtn.classList.toggle('active', isBrowse);
            tabInstalledBtn.classList.toggle('active', !isBrowse);
        }
        tabBrowseBtn.addEventListener('click', () => showTab('browse'));
        tabInstalledBtn.addEventListener('click', () => showTab('installed'));

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function formatDownloads(n) {
            if (n >= 1000000) { return (n / 1000000).toFixed(1) + 'M downloads'; }
            if (n >= 1000) { return (n / 1000).toFixed(1) + 'K downloads'; }
            return n + ' downloads';
        }

        function renderPackageRow(id, meta, description) {
            const li = document.createElement('li');
            li.className = 'package-row' + (id === selectedId ? ' selected' : '');
            li.dataset.id = id;
            li.innerHTML = '<div class="package-id">' + escapeHtml(id) + '</div>' +
                '<div class="package-meta">' + escapeHtml(meta) + '</div>' +
                (description ? '<div class="package-desc">' + escapeHtml(description) + '</div>' : '');
            li.addEventListener('click', () => selectPackage(id));
            return li;
        }

        function selectPackage(id) {
            selectedId = id;
            document.querySelectorAll('.package-row').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });
            detailsStatus.textContent = '';
            vscode.postMessage({ command: 'selectPackage', id });
        }

        function updateInstallButton() {
            const selectedVersion = detailsVersions.value;
            if (lastInstalledVersion && lastInstalledVersion === selectedVersion) {
                detailsInstall.textContent = 'Installed';
                detailsInstall.disabled = true;
            } else if (lastInstalledVersion) {
                detailsInstall.textContent = 'Update to ' + selectedVersion;
                detailsInstall.disabled = false;
            } else {
                detailsInstall.textContent = 'Install';
                detailsInstall.disabled = false;
            }
            detailsRemove.style.display = lastInstalledVersion ? 'inline-block' : 'none';
        }

        detailsVersions.addEventListener('change', updateInstallButton);

        detailsInstall.addEventListener('click', () => {
            if (!selectedId) { return; }
            detailsStatus.textContent = 'Working...';
            vscode.postMessage({ command: 'install', id: selectedId, version: detailsVersions.value });
        });

        detailsRemove.addEventListener('click', () => {
            if (!selectedId) { return; }
            detailsStatus.textContent = 'Working...';
            vscode.postMessage({ command: 'remove', id: selectedId });
        });

        let searchDebounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchResultsEl.innerHTML = '';
                browseStatus.textContent = query.length === 0 ? '' : 'Type at least 2 characters...';
                return;
            }
            browseStatus.textContent = 'Searching...';
            searchDebounceTimer = setTimeout(() => {
                vscode.postMessage({ command: 'search', query });
            }, 300);
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'searchResults': {
                    searchResultsEl.innerHTML = '';
                    if (message.results.length === 0) {
                        browseStatus.textContent = 'No results.';
                    } else {
                        browseStatus.textContent = '';
                        message.results.forEach(r => {
                            descriptionsById[r.id] = r.description;
                            searchResultsEl.appendChild(renderPackageRow(r.id, r.version + ' · ' + formatDownloads(r.totalDownloads), r.description));
                        });
                    }
                    break;
                }
                case 'searchError': {
                    browseStatus.textContent = 'Error: ' + message.message;
                    break;
                }
                case 'installedPackages': {
                    installedListEl.innerHTML = '';
                    if (message.packages.length === 0) {
                        installedStatus.textContent = 'No packages installed.';
                    } else {
                        installedStatus.textContent = '';
                        message.packages.forEach(p => {
                            installedListEl.appendChild(renderPackageRow(p.id, p.resolvedVersion, ''));
                        });
                    }
                    break;
                }
                case 'packageDetails': {
                    if (message.id !== selectedId) { break; }
                    detailsEl.style.display = 'block';
                    detailsId.textContent = message.id;
                    detailsDescription.textContent = descriptionsById[message.id] || '';
                    detailsVersions.innerHTML = '';
                    message.versions.forEach(v => {
                        const opt = document.createElement('option');
                        opt.value = v;
                        opt.textContent = v;
                        detailsVersions.appendChild(opt);
                    });
                    if (message.installedVersion && message.versions.includes(message.installedVersion)) {
                        detailsVersions.value = message.installedVersion;
                    }
                    lastInstalledVersion = message.installedVersion;
                    detailsStatus.textContent = '';
                    updateInstallButton();
                    break;
                }
                case 'actionDone': {
                    detailsStatus.textContent = message.success ? message.message : ('Failed: ' + message.message);
                    break;
                }
            }
        });
    </script>
</body>
</html>`;
}
