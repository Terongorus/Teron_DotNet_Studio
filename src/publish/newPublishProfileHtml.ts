import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

interface TargetTypeInfo {
    value: string;
    label: string;
    icon: string;
    description: string;
}

const TARGET_TYPES: TargetTypeInfo[] = [
    {
        value: 'folder', label: 'Folder', icon: 'folder',
        description: 'Publish to a local or network folder. The simplest option - copies the built output to a folder you choose.'
    },
    {
        value: 'azureAppService', label: 'Azure App Service', icon: 'cloud',
        description: 'Publish directly to an Azure App Service via Kudu ZipDeploy - no local tooling required. Needs a .PublishSettings file imported from the Azure Portal.'
    },
    {
        value: 'containerRegistry', label: 'Container Registry', icon: 'package',
        description: 'Build and push a container image to a registry (Docker Hub, Azure Container Registry, etc.) using the .NET SDK\'s own built-in container support - no Docker installation required.'
    },
    {
        value: 'webServer', label: 'Web Server', icon: 'server-environment',
        description: 'Publish to a remote IIS server via Web Deploy, the same mechanism Visual Studio itself uses for this target. Requires Web Deploy (msdeploy.exe) installed locally.'
    },
    {
        value: 'sftp', label: 'SFTP', icon: 'key',
        description: 'Upload the published output to a remote server over SFTP. Not a Visual Studio feature - a .NET Studio-original addition.'
    }
];

/**
 * A brand-new profile. Step 1 picks the publish target type (a card per type, with a description,
 * since there are only 5 fixed choices rather than a searchable list); step 2 configures that
 * profile's details - this is the guided, first-time-choice flow, deliberately kept distinct from
 * editPublishProfileHtml.ts's single-page form (which assumes the target type is already known and
 * rarely changes). Same step-indicator/step-panel/footer mechanics, one-shot-dispose-on-success
 * panel lifecycle as this extension's own Create New Project wizard (see newPublishProfilePanel.ts).
 */
export function getNewPublishProfileHtml(webview: vscode.Webview, codiconCssUri: vscode.Uri, projectName: string, runtimeIdentifiers: string[]): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    const ridOptions = runtimeIdentifiers.map(rid => `<option value="${rid}">${rid}</option>`).join('');
    const targetCards = TARGET_TYPES.map(t => `
        <div class="target-card" data-type="${t.value}">
            <i class="codicon codicon-${t.icon}"></i>
            <div class="target-card-body">
                <div class="target-card-title">${t.label}</div>
                <div class="target-card-desc">${t.description}</div>
            </div>
        </div>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <link rel="stylesheet" href="${codiconCssUri}">
    <title>New Publish Profile: ${projectName}</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px 20px;
        }
        h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
        .subtitle { font-size: 12px; opacity: 0.7; margin: 0 0 16px; }
        .steps { display: flex; gap: 6px; margin-bottom: 20px; max-width: 700px; }
        .step-indicator {
            flex: 1; padding: 6px 4px; text-align: center; font-size: 11px;
            text-transform: uppercase; opacity: 0.5; border-bottom: 2px solid var(--vscode-panel-border);
        }
        .step-indicator.active { opacity: 1; font-weight: 600; border-bottom-color: var(--vscode-focusBorder); }
        .step-indicator.done { opacity: 0.8; border-bottom-color: var(--vscode-charts-green, var(--vscode-focusBorder)); }
        .step-panel { display: none; max-width: 700px; }
        .step-panel.active { display: block; }

        .target-grid { display: flex; flex-direction: column; gap: 8px; }
        .target-card {
            display: flex; gap: 12px; align-items: flex-start; padding: 12px;
            border: 1px solid var(--vscode-panel-border); border-radius: 6px; cursor: pointer;
        }
        .target-card:hover { background: var(--vscode-list-hoverBackground); }
        .target-card.selected {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .target-card .codicon { font-size: 20px; margin-top: 2px; }
        .target-card-title { font-weight: 600; font-size: 13px; }
        .target-card-desc { font-size: 12px; opacity: 0.85; margin-top: 3px; }

        .form-row { margin-bottom: 14px; }
        .form-row label { display: block; font-size: 12px; opacity: 0.75; margin-bottom: 4px; }
        .form-row select, .form-row input[type="text"], .form-row input[type="password"], .form-row input[type="number"] {
            width: 100%; box-sizing: border-box; background: var(--vscode-input-background);
            color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent);
            padding: 5px 6px; font-size: 13px;
        }
        .radio-group { display: flex; gap: 16px; }
        .radio-group label { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 1; }
        .path-row { display: flex; gap: 6px; }
        .checkbox-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 13px; }
        .checkbox-row.disabled { opacity: 0.5; }
        .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.6; margin: 18px 0 8px; }
        button.action {
            background: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border: none; padding: 6px 14px; cursor: pointer; font-size: 13px;
        }
        button.action:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
        button.action:disabled { opacity: 0.6; cursor: default; }
        button.secondary {
            background: none; color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border);
            padding: 6px 14px; cursor: pointer; font-size: 13px;
        }
        button.secondary:disabled { opacity: 0.5; cursor: default; }
        .footer { display: flex; gap: 8px; margin-top: 20px; align-items: center; max-width: 700px; }
        .footer .spacer { flex: 1; }
        .status-line { font-size: 12px; opacity: 0.85; margin-top: 10px; min-height: 16px; }
        .error-text { font-size: 11px; color: var(--vscode-errorForeground); min-height: 14px; margin-top: 2px; }
        .field-hint { font-size: 11px; opacity: 0.65; margin-top: -10px; margin-bottom: 14px; }
        .imported-note { font-size: 12px; opacity: 0.8; }
    </style>
</head>
<body>
    <h1>New Publish Profile</h1>
    <p class="subtitle">Choose a publish target, then configure it.</p>

    <div class="steps">
        <div class="step-indicator" data-step="1">1. Choose a publish target</div>
        <div class="step-indicator" data-step="2">2. Configure profile</div>
    </div>

    <div class="step-panel" id="step1">
        <div class="target-grid" id="targetGrid">${targetCards}</div>
    </div>

    <div class="step-panel" id="step2">
        <div class="form-row">
            <label for="profileName">Profile name</label>
            <input type="text" id="profileName" placeholder="MyPublishProfile">
            <div class="error-text" id="nameError"></div>
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
            <div class="field-hint">Leave the password blank to use credentials from a prior "docker login" to this registry instead.</div>
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
    </div>

    <div class="footer">
        <button class="secondary" id="backBtn">Back</button>
        <button class="action" id="nextBtn">Next</button>
        <button class="action" id="saveBtn" style="display:none;">Save</button>
        <div class="spacer"></div>
        <button class="secondary" id="cancelBtn">Cancel</button>
    </div>
    <div class="status-line" id="statusLine"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const stepIndicators = [...document.querySelectorAll('.step-indicator')];
        const stepPanels = { 1: document.getElementById('step1'), 2: document.getElementById('step2') };
        const backBtn = document.getElementById('backBtn');
        const nextBtn = document.getElementById('nextBtn');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const statusLine = document.getElementById('statusLine');

        const targetGrid = document.getElementById('targetGrid');
        const targetCards = [...document.querySelectorAll('.target-card')];

        const profileNameEl = document.getElementById('profileName');
        const nameErrorEl = document.getElementById('nameError');
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

        let step = 1;
        let selectedType = null;
        let nameValid = false;
        const currentConfiguration = 'Release';
        // No UI control for this anymore (legacy, SDK-deprecated) - preserved only so it never
        // gets written back in as true by accident.
        const currentIncludeAllContent = false;

        function selectTargetType(type) {
            selectedType = type;
            targetCards.forEach(c => c.classList.toggle('selected', c.dataset.type === type));
            nextBtn.disabled = !canAdvanceFrom1();
        }

        targetGrid.addEventListener('click', event => {
            const card = event.target.closest('.target-card');
            if (!card) { return; }
            selectTargetType(card.dataset.type);
        });
        targetGrid.addEventListener('dblclick', event => {
            const card = event.target.closest('.target-card');
            if (!card) { return; }
            selectTargetType(card.dataset.type);
            showStep(2);
        });

        function canAdvanceFrom1() { return !!selectedType; }

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
            const canCompress = isSingleFile && isSelfContained;
            compressionRow.classList.toggle('disabled', !canCompress);
            compressionEl.disabled = !canCompress;
            if (!canCompress) { compressionEl.checked = false; }

            if (isSelfContained && isPortable && runtimeIdentifierEl.options.length > 1) {
                runtimeIdentifierEl.selectedIndex = 1;
                updateConditionalRows();
            }
        }
        modeFramework.addEventListener('change', updateConditionalRows);
        modeSelfContained.addEventListener('change', updateConditionalRows);
        runtimeIdentifierEl.addEventListener('change', updateConditionalRows);
        singleFileEl.addEventListener('change', updateConditionalRows);

        function updateVisibilityForType() {
            const localOutputTypes = ['folder', 'sftp', 'azureAppService'];
            const showPublishDir = localOutputTypes.includes(selectedType);
            publishDirRow.style.display = showPublishDir ? 'block' : 'none';
            publishDirLabel.textContent = selectedType === 'folder' ? 'Target Location' : 'Local Staging Folder';
            advancedSection.style.display = showPublishDir ? 'block' : 'none';

            containerFields.style.display = selectedType === 'containerRegistry' ? 'block' : 'none';
            webServerFields.style.display = selectedType === 'webServer' ? 'block' : 'none';
            azureFields.style.display = selectedType === 'azureAppService' ? 'block' : 'none';
            sftpFields.style.display = selectedType === 'sftp' ? 'block' : 'none';

            if (selectedType === 'sftp') { updateSftpAuthVisibility(); }
        }

        function updateSftpAuthVisibility() {
            const usePrivateKey = sftpAuthPrivateKeyEl.checked;
            sftpPasswordRow.style.display = usePrivateKey ? 'none' : 'block';
            sftpPrivateKeyRow.style.display = usePrivateKey ? 'block' : 'none';
            sftpPassphraseRow.style.display = usePrivateKey ? 'block' : 'none';
        }
        sftpAuthPasswordEl.addEventListener('change', updateSftpAuthVisibility);
        sftpAuthPrivateKeyEl.addEventListener('change', updateSftpAuthVisibility);

        function canSave() { return nameValid && !!selectedType; }

        function showStep(n) {
            step = n;
            stepIndicators.forEach(el => {
                const s = Number(el.dataset.step);
                el.classList.toggle('active', s === n);
                el.classList.toggle('done', s < n);
            });
            Object.entries(stepPanels).forEach(([s, el]) => el.classList.toggle('active', Number(s) === n));
            backBtn.disabled = n === 1;
            nextBtn.style.display = n === 1 ? 'inline-block' : 'none';
            saveBtn.style.display = n === 2 ? 'inline-block' : 'none';
            nextBtn.disabled = !canAdvanceFrom1();
            statusLine.textContent = '';
            if (n === 2) {
                updateVisibilityForType();
                saveBtn.disabled = !canSave();
            }
        }

        backBtn.addEventListener('click', () => { if (step > 1) { showStep(step - 1); } });
        nextBtn.addEventListener('click', () => { if (canAdvanceFrom1() && step === 1) { showStep(2); } });
        cancelBtn.addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));

        let nameDebounce;
        profileNameEl.addEventListener('input', () => {
            clearTimeout(nameDebounce);
            const value = profileNameEl.value;
            nameDebounce = setTimeout(() => vscode.postMessage({ command: 'validateName', value }), 150);
        });

        document.getElementById('browseBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browseFolder', currentValue: publishDirEl.value });
        });
        document.getElementById('browsePrivateKeyBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browsePrivateKeyFile' });
        });
        document.getElementById('importPublishSettingsBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browsePublishSettingsFile', profileName: profileNameEl.value });
        });

        function collectProfile() {
            return {
                name: profileNameEl.value,
                targetType: selectedType,
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

        function collectSecret() {
            const secret = {};
            if (selectedType === 'webServer' && webDeployPasswordEl.value) { secret.webDeployPassword = webDeployPasswordEl.value; }
            if (selectedType === 'containerRegistry' && containerRegistryPasswordEl.value) { secret.containerRegistryPassword = containerRegistryPasswordEl.value; }
            if (selectedType === 'sftp' && sftpAuthPasswordEl.checked && sftpPasswordEl.value) { secret.sftpPassword = sftpPasswordEl.value; }
            if (selectedType === 'sftp' && sftpAuthPrivateKeyEl.checked && sftpPrivateKeyPassphraseEl.value) { secret.sftpPrivateKeyPassphrase = sftpPrivateKeyPassphraseEl.value; }
            return secret;
        }

        saveBtn.addEventListener('click', () => {
            if (!canSave()) { return; }
            saveBtn.disabled = true;
            backBtn.disabled = true;
            statusLine.textContent = 'Saving...';
            vscode.postMessage({ command: 'save', profile: collectProfile(), secret: collectSecret() });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
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
                case 'nameValidation': {
                    nameValid = !message.error;
                    nameErrorEl.textContent = message.error || '';
                    saveBtn.disabled = !canSave();
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
                    statusLine.textContent = 'Publish settings imported.';
                    break;
                }
                case 'saveFailed': {
                    statusLine.textContent = message.message;
                    saveBtn.disabled = !canSave();
                    backBtn.disabled = false;
                    break;
                }
            }
        });

        vscode.postMessage({ command: 'ready' });
        showStep(1);
    </script>
</body>
</html>`;
}
