/**
 * Field markup and DOM-wiring logic for editPublishProfileHtml.ts's single-page Edit form (name,
 * a Publish Target dropdown, framework/mode/runtime, and the per-type sections, all on one page -
 * no separate "choose a target" step, since by the time you're editing a profile its target type
 * is already known and rarely changes). newPublishProfileHtml.ts is a deliberately different,
 * self-contained design (a guided target-type card-picker step, then a configure step) and does
 * not use this module at all - New and Edit are genuinely two different UIs for two different
 * moments, not the same form reused with a flag.
 */

export interface PublishTargetTypeInfo {
    value: string;
    label: string;
    description: string;
}

export const PUBLISH_TARGET_TYPES: PublishTargetTypeInfo[] = [
    {
        value: 'folder', label: 'Folder',
        description: 'Publish to a local or network folder. The simplest option - copies the built output to a folder you choose.'
    },
    {
        value: 'azureAppService', label: 'Azure App Service',
        description: 'Publish directly to an Azure App Service via Kudu ZipDeploy - no local tooling required. Needs a .PublishSettings file imported from the Azure Portal.'
    },
    {
        value: 'containerRegistry', label: 'Container Registry',
        description: 'Build and push a container image to a registry (Docker Hub, Azure Container Registry, etc.) using the .NET SDK\'s own built-in container support - no Docker installation required.'
    },
    {
        value: 'webServer', label: 'Web Server',
        description: 'Publish to a remote IIS server via Web Deploy, the same mechanism Visual Studio itself uses for this target. Requires Web Deploy (msdeploy.exe) installed locally.'
    },
    {
        value: 'sftp', label: 'SFTP',
        description: 'Upload the published output to a remote server over SFTP. Not a Visual Studio feature - a .NET Studio-original addition.'
    }
];

export function getPublishProfileFormStyles(): string {
    return `
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px 20px;
        }
        h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
        .subtitle { font-size: 12px; opacity: 0.7; margin: 0 0 16px; }
        .form-row { margin-bottom: 14px; max-width: 700px; }
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
        .footer { display: flex; gap: 8px; margin-top: 20px; align-items: center; max-width: 700px; }
        .footer .spacer { flex: 1; }
        .status-line { font-size: 12px; opacity: 0.85; margin-top: 10px; min-height: 16px; }
        .error-text { font-size: 11px; color: var(--vscode-errorForeground); min-height: 14px; margin-top: 2px; }
        .field-hint { font-size: 11px; opacity: 0.65; margin-top: 5px; margin-bottom: 14px; }
        .imported-note { font-size: 12px; opacity: 0.8; }`;
}

export function getPublishProfileFormBodyHtml(ridOptions: string): string {
    const targetTypeOptions = PUBLISH_TARGET_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');

    return `
    <div class="form-row">
        <label for="profileName">Profile name</label>
        <input type="text" id="profileName" placeholder="MyPublishProfile">
        <div class="error-text" id="nameError"></div>
    </div>

    <div class="form-row">
        <label for="targetType">Publish Target</label>
        <select id="targetType">${targetTypeOptions}</select>
        <div class="field-hint" id="targetTypeHint"></div>
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
        <div class="checkbox-row">
            <input type="checkbox" id="noDebugSymbols">
            <label for="noDebugSymbols">Exclude debug symbols (PDB files)</label>
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
        <div class="field-hint" id="webDeployPasswordHint">Leave the password blank to keep the one already saved for this profile.</div>
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

    <div class="footer">
        <button class="action" id="saveBtn">Save</button>
        <div class="spacer"></div>
        <button class="secondary" id="cancelBtn">Cancel</button>
    </div>
    <div class="status-line" id="statusLine"></div>`;
}

/**
 * Common DOM wiring shared verbatim by both pages: element refs, visibility/validation logic,
 * collectProfile()/collectSecret(), the common message listener, and populateFromProfile() (only
 * ever called by the edit page, but harmless to define unconditionally). Each page appends its own
 * small init block and save-button handler after this, in the same script tag.
 */
export function getPublishProfileFormScript(): string {
    const targetTypeDescriptions = JSON.stringify(
        Object.fromEntries(PUBLISH_TARGET_TYPES.map(t => [t.value, t.description]))
    );

    return `
        const vscode = acquireVsCodeApi();
        const TARGET_TYPE_DESCRIPTIONS = ${targetTypeDescriptions};

        const profileNameEl = document.getElementById('profileName');
        const nameErrorEl = document.getElementById('nameError');
        const targetTypeEl = document.getElementById('targetType');
        const targetTypeHintEl = document.getElementById('targetTypeHint');
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
        const noDebugSymbolsEl = document.getElementById('noDebugSymbols');
        const compressionEl = document.getElementById('enableCompressionInSingleFile');
        const singleFileRow = document.getElementById('singleFileRow');
        const readyToRunRow = document.getElementById('readyToRunRow');
        const trimmedRow = document.getElementById('trimmedRow');
        const compressionRow = document.getElementById('compressionRow');
        const advancedSection = document.getElementById('advancedSection');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const statusLine = document.getElementById('statusLine');

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

        let nameValid = false;
        let currentConfiguration = 'Release';
        // No UI control for this anymore (legacy, SDK-deprecated) - preserved only so an existing
        // profile that already has it set (from before this option was removed, or from real VS)
        // round-trips through Save unchanged instead of silently losing the value.
        let currentIncludeAllContent = false;

        function updateTargetTypeHint() {
            targetTypeHintEl.textContent = TARGET_TYPE_DESCRIPTIONS[targetTypeEl.value] || '';
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
            const selectedType = targetTypeEl.value;
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
            updateTargetTypeHint();
        }
        targetTypeEl.addEventListener('change', () => {
            updateVisibilityForType();
            saveBtn.disabled = !canSave();
        });

        function updateSftpAuthVisibility() {
            const usePrivateKey = sftpAuthPrivateKeyEl.checked;
            sftpPasswordRow.style.display = usePrivateKey ? 'none' : 'block';
            sftpPrivateKeyRow.style.display = usePrivateKey ? 'block' : 'none';
            sftpPassphraseRow.style.display = usePrivateKey ? 'block' : 'none';
        }
        sftpAuthPasswordEl.addEventListener('change', updateSftpAuthVisibility);
        sftpAuthPrivateKeyEl.addEventListener('change', updateSftpAuthVisibility);

        function canSave() { return nameValid && !!targetTypeEl.value; }

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
                targetType: targetTypeEl.value,
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
                noDebugSymbols: noDebugSymbolsEl.checked,

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
            const selectedType = targetTypeEl.value;
            const secret = {};
            if (selectedType === 'webServer' && webDeployPasswordEl.value) { secret.webDeployPassword = webDeployPasswordEl.value; }
            if (selectedType === 'containerRegistry' && containerRegistryPasswordEl.value) { secret.containerRegistryPassword = containerRegistryPasswordEl.value; }
            if (selectedType === 'sftp' && sftpAuthPasswordEl.checked && sftpPasswordEl.value) { secret.sftpPassword = sftpPasswordEl.value; }
            if (selectedType === 'sftp' && sftpAuthPrivateKeyEl.checked && sftpPrivateKeyPassphraseEl.value) { secret.sftpPrivateKeyPassphrase = sftpPrivateKeyPassphraseEl.value; }
            return secret;
        }

        /** Only ever called by the Edit page, defined here anyway to keep all per-field DOM wiring in one shared place. */
        function populateFromProfile(p) {
            profileNameEl.value = p.name;
            targetTypeEl.value = p.targetType;
            currentConfiguration = p.configuration || 'Release';
            modeSelfContained.checked = p.selfContained;
            modeFramework.checked = !p.selfContained;
            runtimeIdentifierEl.value = p.runtimeIdentifier || '';
            publishDirEl.value = p.publishDir || '';
            singleFileEl.checked = !!p.publishSingleFile;
            readyToRunEl.checked = !!p.publishReadyToRun;
            trimmedEl.checked = !!p.publishTrimmed;
            currentIncludeAllContent = !!p.includeAllContentForSelfExtract;
            compressionEl.checked = !!p.enableCompressionInSingleFile;
            noDebugSymbolsEl.checked = !!p.noDebugSymbols;

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

            updateVisibilityForType();
        }

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
                    break;
                }
            }
        });`;
}
