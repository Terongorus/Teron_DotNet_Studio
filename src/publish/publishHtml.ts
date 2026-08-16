import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

const TARGET_TYPES = [
    { value: 'folder', label: 'Folder' },
    { value: 'azureAppService', label: 'Azure App Service' },
    { value: 'containerRegistry', label: 'Container Registry' },
    { value: 'webServer', label: 'Web Server' },
    { value: 'sftp', label: 'SFTP' }
];

export function getPublishHtml(webview: vscode.Webview, projectName: string, runtimeIdentifiers: string[]): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
    const ridOptions = runtimeIdentifiers.map(rid => `<option value="${rid}">${rid}</option>`).join('');
    const typePills = TARGET_TYPES.map(t => `<button type="button" class="pill" data-type="${t.value}">${t.label}</button>`).join('');

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
        h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 16px;
        }
        .layout {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        .list-column {
            flex: 1 1 220px;
            min-width: 200px;
        }
        .form-column {
            flex: 2 1 380px;
            min-width: 340px;
        }
        .profile-list {
            list-style: none;
            margin: 0 0 8px;
            padding: 0;
        }
        .profile-row {
            padding: 6px 8px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 13px;
        }
        .profile-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .profile-row.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .empty-note {
            font-size: 12px;
            opacity: 0.7;
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
            padding: 6px 14px;
            cursor: pointer;
            font-size: 13px;
        }
        button.link {
            background: none;
            border: none;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            font-size: 12px;
            padding: 0;
        }
        .form-row {
            margin-bottom: 14px;
        }
        .form-row label {
            display: block;
            font-size: 12px;
            opacity: 0.75;
            margin-bottom: 4px;
        }
        .form-row select, .form-row input[type="text"], .form-row input[type="password"], .form-row input[type="number"] {
            width: 100%;
            box-sizing: border-box;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 5px 6px;
            font-size: 13px;
        }
        .radio-group {
            display: flex;
            gap: 16px;
        }
        .radio-group label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            opacity: 1;
        }
        .path-row {
            display: flex;
            gap: 6px;
        }
        .checkbox-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
            font-size: 13px;
        }
        .checkbox-row.disabled {
            opacity: 0.5;
        }
        .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            opacity: 0.6;
            margin: 18px 0 8px;
        }
        .actions-row {
            display: flex;
            gap: 8px;
            margin-top: 18px;
            align-items: center;
        }
        .status-line {
            font-size: 12px;
            opacity: 0.85;
            margin-top: 10px;
            min-height: 16px;
        }
        .name-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .type-picker {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
            margin-top: 8px;
        }
        .pill-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 10px;
        }
        button.pill {
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        button.pill.selected {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .type-picker-actions {
            display: flex;
            gap: 8px;
        }
        .imported-note {
            font-size: 12px;
            opacity: 0.8;
        }
        .field-hint {
            font-size: 11px;
            opacity: 0.65;
            margin-top: -10px;
            margin-bottom: 14px;
        }
    </style>
</head>
<body>
    <h1>Publish: ${projectName}</h1>
    <div class="layout">
        <div class="list-column">
            <ul class="profile-list" id="profileList"></ul>
            <div class="empty-note" id="emptyNote" style="display:none;">No publish profiles yet.</div>
            <button class="secondary" id="newProfileBtn">+ New Profile</button>
            <div class="type-picker" id="typePicker" style="display:none;">
                <div class="section-title" style="margin-top:0;">Target Type</div>
                <div class="pill-row" id="typePillRow">${typePills}</div>
                <div class="type-picker-actions">
                    <button class="action" id="createProfileBtn">Create</button>
                    <button class="secondary" id="cancelNewProfileBtn">Cancel</button>
                </div>
            </div>
        </div>
        <div class="form-column" id="formColumn" style="display:none;">
            <div class="name-row">
                <strong id="profileName"></strong>
                <span>
                    <button class="link" id="renameBtn">Rename</button>
                    <button class="link" id="deleteBtn">Delete</button>
                </span>
            </div>

            <div class="form-row">
                <label for="targetFramework">Target Framework</label>
                <select id="targetFramework"></select>
            </div>

            <div class="form-row">
                <label>Deployment Mode</label>
                <div class="radio-group">
                    <label><input type="radio" name="deployMode" value="fd" id="modeFramework"> Framework-Dependent</label>
                    <label><input type="radio" name="deployMode" value="sc" id="modeSelfContained"> Self-Contained</label>
                </div>
            </div>

            <div class="form-row">
                <label for="runtimeIdentifier">Target Runtime</label>
                <select id="runtimeIdentifier">
                    <option value="">Portable</option>
                    ${ridOptions}
                </select>
            </div>

            <div class="form-row" id="publishDirRow">
                <label for="publishDir" id="publishDirLabel">Target Location</label>
                <div class="path-row">
                    <input type="text" id="publishDir">
                    <button class="secondary" id="browseBtn">Browse...</button>
                </div>
            </div>

            <div id="advancedSection">
                <div class="section-title">Advanced</div>
                <div class="checkbox-row" id="singleFileRow">
                    <input type="checkbox" id="publishSingleFile">
                    <label for="publishSingleFile">Produce single file</label>
                </div>
                <div class="checkbox-row" id="readyToRunRow">
                    <input type="checkbox" id="publishReadyToRun">
                    <label for="publishReadyToRun">Enable ReadyToRun compilation</label>
                </div>
                <div class="checkbox-row" id="compressionRow">
                    <input type="checkbox" id="enableCompressionInSingleFile">
                    <label for="enableCompressionInSingleFile">Compress single file</label>
                </div>
                <div class="checkbox-row" id="trimmedRow">
                    <input type="checkbox" id="publishTrimmed">
                    <label for="publishTrimmed">Trim unused assemblies</label>
                </div>
            </div>

            <div id="containerFields" style="display:none;">
                <div class="section-title">Container Registry</div>
                <div class="form-row">
                    <label for="containerRegistry">Registry</label>
                    <input type="text" id="containerRegistry" placeholder="myregistry.azurecr.io (blank = Docker Hub)">
                </div>
                <div class="form-row">
                    <label for="containerRepository">Repository (image name)</label>
                    <input type="text" id="containerRepository">
                </div>
                <div class="form-row">
                    <label for="containerImageTag">Image Tag</label>
                    <input type="text" id="containerImageTag" placeholder="latest">
                </div>
                <div class="form-row">
                    <label for="containerRegistryUsername">Registry Username</label>
                    <input type="text" id="containerRegistryUsername">
                </div>
                <div class="form-row">
                    <label for="containerRegistryPassword">Registry Password / Token</label>
                    <input type="password" id="containerRegistryPassword" autocomplete="new-password">
                </div>
                <div class="field-hint">Leave the password blank to keep using either a previously saved one, or credentials from a prior "docker login" to this registry.</div>
            </div>

            <div id="webServerFields" style="display:none;">
                <div class="section-title">Web Server (Web Deploy)</div>
                <div class="form-row">
                    <label for="webDeployServiceUrl">Server URL</label>
                    <input type="text" id="webDeployServiceUrl" placeholder="https://myserver:8172/msdeploy.axd">
                </div>
                <div class="form-row">
                    <label for="webDeployIisAppPath">Site/Application Name</label>
                    <input type="text" id="webDeployIisAppPath">
                </div>
                <div class="form-row">
                    <label for="webDeployUsername">Username</label>
                    <input type="text" id="webDeployUsername">
                </div>
                <div class="form-row">
                    <label for="webDeployPassword">Password</label>
                    <input type="password" id="webDeployPassword" autocomplete="new-password">
                </div>
                <div class="field-hint">Leave the password blank to keep the one already saved for this profile.</div>
                <div class="checkbox-row">
                    <input type="checkbox" id="webDeployAllowUntrustedCertificate">
                    <label for="webDeployAllowUntrustedCertificate">Allow untrusted certificate</label>
                </div>
            </div>

            <div id="azureFields" style="display:none;">
                <div class="section-title">Azure App Service</div>
                <button class="secondary" id="importPublishSettingsBtn">Import Publish Settings...</button>
                <div class="imported-note" id="azureImportedNote" style="margin-top:8px;"></div>
            </div>

            <div id="sftpFields" style="display:none;">
                <div class="section-title">SFTP</div>
                <div class="form-row">
                    <label for="sftpHost">Host</label>
                    <input type="text" id="sftpHost">
                </div>
                <div class="form-row">
                    <label for="sftpPort">Port</label>
                    <input type="number" id="sftpPort" value="22">
                </div>
                <div class="form-row">
                    <label for="sftpUsername">Username</label>
                    <input type="text" id="sftpUsername">
                </div>
                <div class="form-row">
                    <label for="sftpRemotePath">Remote Path</label>
                    <input type="text" id="sftpRemotePath" placeholder="/var/www/myapp">
                </div>
                <div class="form-row">
                    <label>Authentication</label>
                    <div class="radio-group">
                        <label><input type="radio" name="sftpAuthMethod" value="password" id="sftpAuthPassword"> Password</label>
                        <label><input type="radio" name="sftpAuthMethod" value="privateKey" id="sftpAuthPrivateKey"> Private Key</label>
                    </div>
                </div>
                <div class="form-row" id="sftpPasswordRow">
                    <label for="sftpPassword">Password</label>
                    <input type="password" id="sftpPassword" autocomplete="new-password">
                </div>
                <div class="field-hint" id="sftpPasswordHint">Leave blank to keep the one already saved for this profile.</div>
                <div class="form-row" id="sftpPrivateKeyRow" style="display:none;">
                    <label for="sftpPrivateKeyPath">Private Key File</label>
                    <div class="path-row">
                        <input type="text" id="sftpPrivateKeyPath">
                        <button class="secondary" id="browsePrivateKeyBtn">Browse...</button>
                    </div>
                </div>
                <div class="form-row" id="sftpPassphraseRow" style="display:none;">
                    <label for="sftpPrivateKeyPassphrase">Key Passphrase (if any)</label>
                    <input type="password" id="sftpPrivateKeyPassphrase" autocomplete="new-password">
                </div>
            </div>

            <div class="actions-row">
                <button class="action" id="publishBtn">Publish</button>
                <button class="secondary" id="saveBtn">Save Profile</button>
            </div>
            <div class="status-line" id="statusLine"></div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const profileListEl = document.getElementById('profileList');
        const emptyNote = document.getElementById('emptyNote');
        const formColumn = document.getElementById('formColumn');
        const profileNameEl = document.getElementById('profileName');
        const targetFrameworkEl = document.getElementById('targetFramework');
        const modeFramework = document.getElementById('modeFramework');
        const modeSelfContained = document.getElementById('modeSelfContained');
        const runtimeIdentifierEl = document.getElementById('runtimeIdentifier');
        const publishDirEl = document.getElementById('publishDir');
        const publishDirRow = document.getElementById('publishDirRow');
        const publishDirLabel = document.getElementById('publishDirLabel');
        const singleFileEl = document.getElementById('publishSingleFile');
        const readyToRunEl = document.getElementById('publishReadyToRun');
        const trimmedEl = document.getElementById('publishTrimmed');
        const compressionEl = document.getElementById('enableCompressionInSingleFile');
        const singleFileRow = document.getElementById('singleFileRow');
        const readyToRunRow = document.getElementById('readyToRunRow');
        const trimmedRow = document.getElementById('trimmedRow');
        const compressionRow = document.getElementById('compressionRow');
        const advancedSection = document.getElementById('advancedSection');
        const statusLine = document.getElementById('statusLine');

        const typePicker = document.getElementById('typePicker');
        const typePillRow = document.getElementById('typePillRow');
        let pendingNewProfileType = 'folder';

        const containerFields = document.getElementById('containerFields');
        const containerRegistryEl = document.getElementById('containerRegistry');
        const containerRepositoryEl = document.getElementById('containerRepository');
        const containerImageTagEl = document.getElementById('containerImageTag');
        const containerRegistryUsernameEl = document.getElementById('containerRegistryUsername');
        const containerRegistryPasswordEl = document.getElementById('containerRegistryPassword');

        const webServerFields = document.getElementById('webServerFields');
        const webDeployServiceUrlEl = document.getElementById('webDeployServiceUrl');
        const webDeployIisAppPathEl = document.getElementById('webDeployIisAppPath');
        const webDeployUsernameEl = document.getElementById('webDeployUsername');
        const webDeployPasswordEl = document.getElementById('webDeployPassword');
        const webDeployAllowUntrustedCertificateEl = document.getElementById('webDeployAllowUntrustedCertificate');

        const azureFields = document.getElementById('azureFields');
        const azureImportedNote = document.getElementById('azureImportedNote');
        let azurePublishUrl = '';
        let azureSiteName = '';
        let azureUsername = '';

        const sftpFields = document.getElementById('sftpFields');
        const sftpHostEl = document.getElementById('sftpHost');
        const sftpPortEl = document.getElementById('sftpPort');
        const sftpUsernameEl = document.getElementById('sftpUsername');
        const sftpRemotePathEl = document.getElementById('sftpRemotePath');
        const sftpAuthPasswordEl = document.getElementById('sftpAuthPassword');
        const sftpAuthPrivateKeyEl = document.getElementById('sftpAuthPrivateKey');
        const sftpPasswordRow = document.getElementById('sftpPasswordRow');
        const sftpPasswordEl = document.getElementById('sftpPassword');
        const sftpPrivateKeyRow = document.getElementById('sftpPrivateKeyRow');
        const sftpPrivateKeyPathEl = document.getElementById('sftpPrivateKeyPath');
        const sftpPassphraseRow = document.getElementById('sftpPassphraseRow');
        const sftpPrivateKeyPassphraseEl = document.getElementById('sftpPrivateKeyPassphrase');

        let profiles = [];
        let selectedName = null;
        let currentConfiguration = 'Release';
        let currentTargetType = 'folder';
        // No UI control for this anymore (legacy, SDK-deprecated) - preserved only so an existing
        // profile that already has it set (from before this option was removed, or from real VS)
        // round-trips through Save Profile unchanged instead of silently losing the value.
        let currentIncludeAllContent = false;

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

        function updateConditionalRows() {
            const isPortable = runtimeIdentifierEl.value === '';
            singleFileRow.classList.toggle('disabled', isPortable);
            readyToRunRow.classList.toggle('disabled', isPortable);
            singleFileEl.disabled = isPortable;
            readyToRunEl.disabled = isPortable;
            if (isPortable) { singleFileEl.checked = false; readyToRunEl.checked = false; }

            const isSelfContained = modeSelfContained.checked;
            trimmedRow.classList.toggle('disabled', !isSelfContained);
            trimmedEl.disabled = !isSelfContained;
            if (!isSelfContained) { trimmedEl.checked = false; }

            const isSingleFile = singleFileEl.checked && !isPortable;

            // Compression additionally requires self-contained - the SDK raises a real build
            // error otherwise, not just a no-op.
            const canCompress = isSingleFile && isSelfContained;
            compressionRow.classList.toggle('disabled', !canCompress);
            compressionEl.disabled = !canCompress;
            if (!canCompress) { compressionEl.checked = false; }

            // Self-contained requires a concrete runtime - Portable stops making sense once selected.
            if (isSelfContained && isPortable && runtimeIdentifierEl.options.length > 1) {
                runtimeIdentifierEl.selectedIndex = 1;
                updateConditionalRows();
            }
        }

        modeFramework.addEventListener('change', updateConditionalRows);
        modeSelfContained.addEventListener('change', updateConditionalRows);
        runtimeIdentifierEl.addEventListener('change', updateConditionalRows);
        singleFileEl.addEventListener('change', updateConditionalRows);

        /** Toggles which target-type-specific sections are visible - mirrors this extension's own newProjectHtml.ts mode-pill pattern (one hidden/shown sub-panel per choice), just applied to publish target type instead of project-creation mode. */
        function updateVisibilityForTargetType() {
            const localOutputTypes = ['folder', 'sftp', 'azureAppService'];
            const showPublishDir = localOutputTypes.includes(currentTargetType);
            publishDirRow.style.display = showPublishDir ? 'block' : 'none';
            publishDirLabel.textContent = currentTargetType === 'folder' ? 'Target Location' : 'Local Staging Folder';
            advancedSection.style.display = showPublishDir ? 'block' : 'none';

            containerFields.style.display = currentTargetType === 'containerRegistry' ? 'block' : 'none';
            webServerFields.style.display = currentTargetType === 'webServer' ? 'block' : 'none';
            azureFields.style.display = currentTargetType === 'azureAppService' ? 'block' : 'none';
            sftpFields.style.display = currentTargetType === 'sftp' ? 'block' : 'none';

            if (currentTargetType === 'sftp') { updateSftpAuthVisibility(); }
        }

        function updateSftpAuthVisibility() {
            const usePrivateKey = sftpAuthPrivateKeyEl.checked;
            sftpPasswordRow.style.display = usePrivateKey ? 'none' : 'block';
            sftpPrivateKeyRow.style.display = usePrivateKey ? 'block' : 'none';
            sftpPassphraseRow.style.display = usePrivateKey ? 'block' : 'none';
        }
        sftpAuthPasswordEl.addEventListener('change', updateSftpAuthVisibility);
        sftpAuthPrivateKeyEl.addEventListener('change', updateSftpAuthVisibility);

        function collectProfile() {
            return {
                name: selectedName,
                targetType: currentTargetType,
                configuration: currentConfiguration,
                targetFramework: targetFrameworkEl.value,
                runtimeIdentifier: runtimeIdentifierEl.value,
                selfContained: modeSelfContained.checked,
                publishDir: publishDirEl.value,
                publishSingleFile: singleFileEl.checked,
                publishReadyToRun: readyToRunEl.checked,
                publishTrimmed: trimmedEl.checked,
                includeAllContentForSelfExtract: currentIncludeAllContent,
                enableCompressionInSingleFile: compressionEl.checked,

                azurePublishUrl: azurePublishUrl || undefined,
                azureSiteName: azureSiteName || undefined,
                azureUsername: azureUsername || undefined,

                containerRegistry: containerRegistryEl.value || undefined,
                containerRepository: containerRepositoryEl.value || undefined,
                containerImageTag: containerImageTagEl.value || undefined,
                containerRegistryUsername: containerRegistryUsernameEl.value || undefined,

                webDeployServiceUrl: webDeployServiceUrlEl.value || undefined,
                webDeployIisAppPath: webDeployIisAppPathEl.value || undefined,
                webDeployUsername: webDeployUsernameEl.value || undefined,
                webDeployAllowUntrustedCertificate: webDeployAllowUntrustedCertificateEl.checked,

                sftpHost: sftpHostEl.value || undefined,
                sftpPort: sftpPortEl.value ? Number(sftpPortEl.value) : undefined,
                sftpUsername: sftpUsernameEl.value || undefined,
                sftpRemotePath: sftpRemotePathEl.value || undefined,
                sftpAuthMethod: sftpAuthPrivateKeyEl.checked ? 'privateKey' : 'password',
                sftpPrivateKeyPath: sftpPrivateKeyPathEl.value || undefined
            };
        }

        /** Secrets are collected separately from collectProfile() and never round-trip back from the extension host into these fields - an empty field always means "leave whatever's already stored unchanged", not "clear it". */
        function collectSecret() {
            const secret = {};
            if (currentTargetType === 'webServer' && webDeployPasswordEl.value) { secret.webDeployPassword = webDeployPasswordEl.value; }
            if (currentTargetType === 'containerRegistry' && containerRegistryPasswordEl.value) { secret.containerRegistryPassword = containerRegistryPasswordEl.value; }
            if (currentTargetType === 'sftp' && sftpAuthPasswordEl.checked && sftpPasswordEl.value) { secret.sftpPassword = sftpPasswordEl.value; }
            if (currentTargetType === 'sftp' && sftpAuthPrivateKeyEl.checked && sftpPrivateKeyPassphraseEl.value) { secret.sftpPrivateKeyPassphrase = sftpPrivateKeyPassphraseEl.value; }
            return secret;
        }

        function clearSecretFields() {
            webDeployPasswordEl.value = '';
            containerRegistryPasswordEl.value = '';
            sftpPasswordEl.value = '';
            sftpPrivateKeyPassphraseEl.value = '';
        }

        document.getElementById('newProfileBtn').addEventListener('click', () => {
            pendingNewProfileType = 'folder';
            [...typePillRow.children].forEach(btn => btn.classList.toggle('selected', btn.dataset.type === pendingNewProfileType));
            typePicker.style.display = 'block';
        });

        document.getElementById('cancelNewProfileBtn').addEventListener('click', () => {
            typePicker.style.display = 'none';
        });

        typePillRow.addEventListener('click', event => {
            const btn = event.target.closest('.pill');
            if (!btn) { return; }
            pendingNewProfileType = btn.dataset.type;
            [...typePillRow.children].forEach(b => b.classList.toggle('selected', b === btn));
        });

        document.getElementById('createProfileBtn').addEventListener('click', () => {
            typePicker.style.display = 'none';
            vscode.postMessage({ command: 'newProfile', targetType: pendingNewProfileType });
        });

        document.getElementById('renameBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            vscode.postMessage({ command: 'renameProfile', oldName: selectedName });
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            vscode.postMessage({ command: 'deleteProfile', name: selectedName });
        });

        document.getElementById('browseBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browseFolder', currentValue: publishDirEl.value });
        });

        document.getElementById('browsePrivateKeyBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browsePrivateKeyFile' });
        });

        document.getElementById('importPublishSettingsBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browsePublishSettingsFile' });
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            statusLine.textContent = 'Saving...';
            vscode.postMessage({ command: 'saveProfile', profile: collectProfile(), secret: collectSecret() });
            clearSecretFields();
        });

        document.getElementById('publishBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            statusLine.textContent = 'Publishing... see the ".NET Studio" terminal for progress.';
            vscode.postMessage({ command: 'publish', profile: collectProfile(), secret: collectSecret() });
            clearSecretFields();
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
                case 'targetFrameworks': {
                    const current = targetFrameworkEl.value;
                    targetFrameworkEl.innerHTML = '';
                    message.frameworks.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f;
                        opt.textContent = f;
                        targetFrameworkEl.appendChild(opt);
                    });
                    if (message.frameworks.includes(current)) { targetFrameworkEl.value = current; }
                    break;
                }
                case 'profileData': {
                    const p = message.profile;
                    profileNameEl.textContent = p.name;
                    currentConfiguration = p.configuration || 'Release';
                    currentTargetType = p.targetType || 'folder';
                    if ([...targetFrameworkEl.options].some(o => o.value === p.targetFramework)) {
                        targetFrameworkEl.value = p.targetFramework;
                    }
                    modeSelfContained.checked = p.selfContained;
                    modeFramework.checked = !p.selfContained;
                    runtimeIdentifierEl.value = p.runtimeIdentifier || '';
                    publishDirEl.value = p.publishDir;
                    singleFileEl.checked = p.publishSingleFile;
                    readyToRunEl.checked = p.publishReadyToRun;
                    trimmedEl.checked = p.publishTrimmed;
                    currentIncludeAllContent = !!p.includeAllContentForSelfExtract;
                    compressionEl.checked = p.enableCompressionInSingleFile;

                    azurePublishUrl = p.azurePublishUrl || '';
                    azureSiteName = p.azureSiteName || '';
                    azureUsername = p.azureUsername || '';
                    azureImportedNote.textContent = azurePublishUrl
                        ? ('Imported: ' + azureUsername + ' @ ' + azurePublishUrl)
                        : 'Not imported yet - click "Import Publish Settings..." to select a .PublishSettings file downloaded from the Azure Portal.';

                    containerRegistryEl.value = p.containerRegistry || '';
                    containerRepositoryEl.value = p.containerRepository || '';
                    containerImageTagEl.value = p.containerImageTag || '';
                    containerRegistryUsernameEl.value = p.containerRegistryUsername || '';

                    webDeployServiceUrlEl.value = p.webDeployServiceUrl || '';
                    webDeployIisAppPathEl.value = p.webDeployIisAppPath || '';
                    webDeployUsernameEl.value = p.webDeployUsername || '';
                    webDeployAllowUntrustedCertificateEl.checked = !!p.webDeployAllowUntrustedCertificate;

                    sftpHostEl.value = p.sftpHost || '';
                    sftpPortEl.value = p.sftpPort || 22;
                    sftpUsernameEl.value = p.sftpUsername || '';
                    sftpRemotePathEl.value = p.sftpRemotePath || '';
                    sftpAuthPrivateKeyEl.checked = p.sftpAuthMethod === 'privateKey';
                    sftpAuthPasswordEl.checked = p.sftpAuthMethod !== 'privateKey';
                    sftpPrivateKeyPathEl.value = p.sftpPrivateKeyPath || '';

                    clearSecretFields();
                    updateConditionalRows();
                    updateVisibilityForTargetType();
                    formColumn.style.display = 'block';
                    break;
                }
                case 'folderPicked': {
                    publishDirEl.value = message.path;
                    break;
                }
                case 'privateKeyFilePicked': {
                    sftpPrivateKeyPathEl.value = message.path;
                    break;
                }
                case 'publishSettingsImported': {
                    azurePublishUrl = message.azurePublishUrl || '';
                    azureSiteName = message.azureSiteName || '';
                    azureUsername = message.azureUsername || '';
                    azureImportedNote.textContent = 'Imported: ' + azureUsername + ' @ ' + azurePublishUrl;
                    statusLine.textContent = 'Publish settings imported - click Save Profile or Publish.';
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
