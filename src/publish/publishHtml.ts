import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

/** Same label/description text as publishProfileFormMarkup.ts's own PUBLISH_TARGET_TYPES table - kept as an independent copy rather than a shared import, matching this codebase's existing convention of self-contained per-panel webview scripts. */
const TARGET_TYPE_INFO: Record<string, { label: string; description: string }> = {
    folder: {
        label: 'Folder',
        description: 'Publish to a local or network folder. The simplest option - copies the built output to a folder you choose.'
    },
    azureAppService: {
        label: 'Azure App Service',
        description: 'Publish directly to an Azure App Service via Kudu ZipDeploy - no local tooling required.'
    },
    containerRegistry: {
        label: 'Container Registry',
        description: 'Build and push a container image using the .NET SDK\'s own built-in container support - no Docker installation required.'
    },
    webServer: {
        label: 'Web Server',
        description: 'Publish to a remote IIS server via Web Deploy - requires msdeploy.exe installed locally.'
    },
    sftp: {
        label: 'SFTP',
        description: 'Upload the published output to a remote server over SFTP.'
    }
};

export function getPublishHtml(webview: vscode.Webview, projectName: string): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Publish: ${projectName}</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
        }
        h1 { font-size: 16px; font-weight: 600; margin: 0 0 16px; }
        .layout { display: flex; gap: 20px; flex-wrap: wrap; }
        .list-column { flex: 1 1 220px; min-width: 200px; }
        .form-column { flex: 2 1 380px; min-width: 340px; }
        .profile-list { list-style: none; margin: 0 0 8px; padding: 0; }
        .profile-row { padding: 6px 8px; cursor: pointer; border-radius: 3px; font-size: 13px; }
        .profile-row:hover { background: var(--vscode-list-hoverBackground); }
        .profile-row.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .empty-note { font-size: 12px; opacity: 0.7; margin-bottom: 8px; }
        button.action {
            background: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border: none; padding: 6px 14px; cursor: pointer; font-size: 13px;
        }
        button.action:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
        button.action:disabled { opacity: 0.6; cursor: default; }
        button.secondary {
            background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-panel-border);
            padding: 6px 14px; cursor: pointer; font-size: 13px;
        }
        button.secondary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
        button.secondary:disabled { opacity: 0.6; cursor: default; }
        button.link {
            background: none;
            border: 1px solid transparent;
            border-radius: 3px;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            font-size: 12px;
            padding: 4px 10px;
        }
        button.link:hover {
            background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
            border-color: var(--vscode-panel-border);
        }
        button.link.danger { color: var(--vscode-errorForeground); }
        button.link.danger:hover {
            background: var(--vscode-inputValidation-errorBackground, var(--vscode-list-hoverBackground));
            border-color: var(--vscode-errorForeground);
        }
        .name-actions { display: flex; align-items: center; gap: 6px; }
        .name-actions .divider {
            width: 1px;
            align-self: stretch;
            background: var(--vscode-panel-border);
            margin: 0 4px;
        }
        .actions-row { display: flex; gap: 8px; margin-top: 18px; align-items: center; }
        .status-line { font-size: 12px; opacity: 0.85; margin-top: 10px; min-height: 16px; }
        .name-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 12px; }
        .target-type-badge { font-size: 12px; opacity: 0.8; margin-bottom: 4px; }
        .target-type-desc { font-size: 12px; opacity: 0.7; margin-bottom: 16px; }
        .info-grid { display: grid; grid-template-columns: 160px 1fr; row-gap: 8px; column-gap: 12px; font-size: 13px; margin-bottom: 6px; }
        .info-label { opacity: 0.65; }
        .info-value { word-break: break-word; }
        .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.6; margin: 18px 0 8px; }
        .flag-list { font-size: 13px; }
        .flag-list .flag-off { opacity: 0.45; text-decoration: none; }
        .empty-preview { font-size: 13px; opacity: 0.7; margin-top: 12px; }
    </style>
</head>
<body>
    <h1>Publish: ${projectName}</h1>
    <div class="layout">
        <div class="list-column">
            <ul class="profile-list" id="profileList"></ul>
            <div class="empty-note" id="emptyNote" style="display:none;">No publish profiles yet.</div>
            <button class="secondary" id="newProfileBtn">+ New Profile</button>
        </div>
        <div class="form-column" id="formColumn" style="display:none;">
            <div class="name-row">
                <strong id="profileName"></strong>
                <span class="name-actions">
                    <button class="link" id="editBtn">Edit</button>
                    <button class="link" id="renameBtn">Rename</button>
                    <span class="divider"></span>
                    <button class="link danger" id="deleteBtn">Delete</button>
                </span>
            </div>
            <div class="target-type-badge" id="targetTypeBadge"></div>
            <div class="target-type-desc" id="targetTypeDesc"></div>

            <div class="info-grid" id="commonInfoGrid"></div>

            <div id="advancedFlagsSection" style="display:none;">
                <div class="section-title">Advanced</div>
                <div class="flag-list" id="advancedFlagsList"></div>
            </div>

            <div id="typeSpecificSection" style="display:none;">
                <div class="section-title" id="typeSpecificTitle"></div>
                <div class="info-grid" id="typeSpecificGrid"></div>
            </div>

            <div class="actions-row">
                <button class="action" id="publishBtn">Publish</button>
            </div>
            <div class="status-line" id="statusLine"></div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const TARGET_TYPE_INFO = ${JSON.stringify(TARGET_TYPE_INFO)};

        const profileListEl = document.getElementById('profileList');
        const emptyNote = document.getElementById('emptyNote');
        const formColumn = document.getElementById('formColumn');
        const profileNameEl = document.getElementById('profileName');
        const targetTypeBadge = document.getElementById('targetTypeBadge');
        const targetTypeDesc = document.getElementById('targetTypeDesc');
        const commonInfoGrid = document.getElementById('commonInfoGrid');
        const advancedFlagsSection = document.getElementById('advancedFlagsSection');
        const advancedFlagsList = document.getElementById('advancedFlagsList');
        const typeSpecificSection = document.getElementById('typeSpecificSection');
        const typeSpecificTitle = document.getElementById('typeSpecificTitle');
        const typeSpecificGrid = document.getElementById('typeSpecificGrid');
        const statusLine = document.getElementById('statusLine');

        let profiles = [];
        let selectedName = null;
        let currentProfile = null;

        function escapeHtml(value) {
            return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function renderProfileList() {
            profileListEl.innerHTML = '';
            emptyNote.style.display = profiles.length === 0 ? 'block' : 'none';
            profiles.forEach(name => {
                const li = document.createElement('li');
                li.className = 'profile-row' + (name === selectedName ? ' selected' : '');
                li.textContent = name;
                li.addEventListener('click', () => selectProfile(name));
                profileListEl.appendChild(li);
            });
        }

        function selectProfile(name) {
            selectedName = name;
            statusLine.textContent = '';
            renderProfileList();
            vscode.postMessage({ command: 'selectProfile', name });
        }

        function infoRow(grid, label, value) {
            const l = document.createElement('div');
            l.className = 'info-label';
            l.textContent = label;
            const v = document.createElement('div');
            v.className = 'info-value';
            v.textContent = value;
            grid.appendChild(l);
            grid.appendChild(v);
        }

        function flagRow(list, label, enabled) {
            const div = document.createElement('div');
            div.className = enabled ? '' : 'flag-off';
            div.textContent = (enabled ? '\\u2713 ' : '\\u2717 ') + label;
            list.appendChild(div);
        }

        function renderPreview(p) {
            currentProfile = p;
            profileNameEl.textContent = p.name;

            const typeInfo = TARGET_TYPE_INFO[p.targetType] || TARGET_TYPE_INFO.folder;
            targetTypeBadge.textContent = typeInfo.label;
            targetTypeDesc.textContent = typeInfo.description;

            commonInfoGrid.innerHTML = '';
            infoRow(commonInfoGrid, 'Target Framework', p.targetFramework || '(default)');
            infoRow(commonInfoGrid, 'Deployment Mode', p.selfContained ? 'Self-Contained' : 'Framework-Dependent');
            infoRow(commonInfoGrid, 'Target Runtime', p.runtimeIdentifier || 'Portable');
            if (p.targetType === 'folder') { infoRow(commonInfoGrid, 'Target Location', p.publishDir); }
            else if (p.targetType === 'sftp' || p.targetType === 'azureAppService') { infoRow(commonInfoGrid, 'Local Staging Folder', p.publishDir); }

            const showAdvanced = p.targetType === 'folder' || p.targetType === 'sftp' || p.targetType === 'azureAppService';
            advancedFlagsSection.style.display = showAdvanced ? 'block' : 'none';
            if (showAdvanced) {
                advancedFlagsList.innerHTML = '';
                flagRow(advancedFlagsList, 'Produce single file', !!p.publishSingleFile);
                flagRow(advancedFlagsList, 'Enable ReadyToRun compilation', !!p.publishReadyToRun);
                flagRow(advancedFlagsList, 'Compress single file', !!p.enableCompressionInSingleFile);
                flagRow(advancedFlagsList, 'Trim unused assemblies', !!p.publishTrimmed);
                flagRow(advancedFlagsList, 'Exclude debug symbols (PDB files)', !!p.noDebugSymbols);
            }

            typeSpecificGrid.innerHTML = '';
            typeSpecificSection.style.display = 'none';
            if (p.targetType === 'containerRegistry') {
                typeSpecificSection.style.display = 'block';
                typeSpecificTitle.textContent = 'Container Registry';
                infoRow(typeSpecificGrid, 'Registry', p.containerRegistry || '(Docker Hub)');
                infoRow(typeSpecificGrid, 'Repository', p.containerRepository || '(unset)');
                infoRow(typeSpecificGrid, 'Image Tag', p.containerImageTag || 'latest');
                infoRow(typeSpecificGrid, 'Registry Username', p.containerRegistryUsername || '(unset)');
            } else if (p.targetType === 'webServer') {
                typeSpecificSection.style.display = 'block';
                typeSpecificTitle.textContent = 'Web Server (Web Deploy)';
                infoRow(typeSpecificGrid, 'Server URL', p.webDeployServiceUrl || '(unset)');
                infoRow(typeSpecificGrid, 'Site/Application', p.webDeployIisAppPath || '(unset)');
                infoRow(typeSpecificGrid, 'Username', p.webDeployUsername || '(unset)');
                infoRow(typeSpecificGrid, 'Allow untrusted certificate', p.webDeployAllowUntrustedCertificate ? 'Yes' : 'No');
            } else if (p.targetType === 'azureAppService') {
                typeSpecificSection.style.display = 'block';
                typeSpecificTitle.textContent = 'Azure App Service';
                infoRow(typeSpecificGrid, 'Publish URL', p.azurePublishUrl || '(not imported yet)');
                infoRow(typeSpecificGrid, 'Username', p.azureUsername || '(not imported yet)');
            } else if (p.targetType === 'sftp') {
                typeSpecificSection.style.display = 'block';
                typeSpecificTitle.textContent = 'SFTP';
                infoRow(typeSpecificGrid, 'Host', p.sftpHost || '(unset)');
                infoRow(typeSpecificGrid, 'Port', String(p.sftpPort || 22));
                infoRow(typeSpecificGrid, 'Username', p.sftpUsername || '(unset)');
                infoRow(typeSpecificGrid, 'Remote Path', p.sftpRemotePath || '(unset)');
                infoRow(typeSpecificGrid, 'Authentication', p.sftpAuthMethod === 'privateKey' ? 'Private Key' : 'Password');
                if (p.sftpAuthMethod === 'privateKey') { infoRow(typeSpecificGrid, 'Private Key File', p.sftpPrivateKeyPath || '(unset)'); }
            }
        }

        document.getElementById('newProfileBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'newProfile' });
        });

        document.getElementById('editBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            vscode.postMessage({ command: 'editProfile', name: selectedName });
        });

        document.getElementById('renameBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            vscode.postMessage({ command: 'renameProfile', oldName: selectedName });
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            vscode.postMessage({ command: 'deleteProfile', name: selectedName });
        });

        document.getElementById('publishBtn').addEventListener('click', () => {
            if (!selectedName || !currentProfile) { return; }
            statusLine.textContent = 'Publishing... see the ".NET Studio" terminal for progress.';
            vscode.postMessage({ command: 'publish', profile: currentProfile });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'profileList': {
                    profiles = message.names;
                    if (message.selected !== undefined) { selectedName = message.selected; }
                    else if (selectedName && !profiles.includes(selectedName)) { selectedName = profiles[0] || null; }
                    renderProfileList();
                    formColumn.style.display = selectedName ? 'block' : 'none';
                    if (selectedName) { vscode.postMessage({ command: 'selectProfile', name: selectedName }); }
                    break;
                }
                case 'profileData': {
                    renderPreview(message.profile);
                    formColumn.style.display = 'block';
                    break;
                }
                case 'status': {
                    statusLine.textContent = message.message;
                    break;
                }
            }
        });
    </script>
</body>
</html>`;
}
