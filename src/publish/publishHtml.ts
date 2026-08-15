import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

export function getPublishHtml(webview: vscode.Webview, projectName: string, runtimeIdentifiers: string[]): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
    const ridOptions = runtimeIdentifiers.map(rid => `<option value="${rid}">${rid}</option>`).join('');

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
        .form-row select, .form-row input[type="text"] {
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

            <div class="form-row">
                <label for="publishDir">Target Location</label>
                <div class="path-row">
                    <input type="text" id="publishDir">
                    <button class="secondary" id="browseBtn">Browse...</button>
                </div>
            </div>

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
        const singleFileEl = document.getElementById('publishSingleFile');
        const readyToRunEl = document.getElementById('publishReadyToRun');
        const trimmedEl = document.getElementById('publishTrimmed');
        const compressionEl = document.getElementById('enableCompressionInSingleFile');
        const singleFileRow = document.getElementById('singleFileRow');
        const readyToRunRow = document.getElementById('readyToRunRow');
        const trimmedRow = document.getElementById('trimmedRow');
        const compressionRow = document.getElementById('compressionRow');
        const statusLine = document.getElementById('statusLine');

        let profiles = [];
        let selectedName = null;
        let currentConfiguration = 'Release';
        // No UI control for this anymore (legacy, SDK-deprecated) - preserved only so an existing
        // profile that already has it set (from before this option was removed, or from real VS)
        // round-trips through Save Profile unchanged instead of silently losing the value.
        let currentIncludeAllContent = false;

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

        function collectProfile() {
            return {
                name: selectedName,
                configuration: currentConfiguration,
                targetFramework: targetFrameworkEl.value,
                runtimeIdentifier: runtimeIdentifierEl.value,
                selfContained: modeSelfContained.checked,
                publishDir: publishDirEl.value,
                publishSingleFile: singleFileEl.checked,
                publishReadyToRun: readyToRunEl.checked,
                publishTrimmed: trimmedEl.checked,
                includeAllContentForSelfExtract: currentIncludeAllContent,
                enableCompressionInSingleFile: compressionEl.checked
            };
        }

        document.getElementById('newProfileBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'newProfile' });
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

        document.getElementById('saveBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            statusLine.textContent = 'Saving...';
            vscode.postMessage({ command: 'saveProfile', profile: collectProfile() });
        });

        document.getElementById('publishBtn').addEventListener('click', () => {
            if (!selectedName) { return; }
            statusLine.textContent = 'Publishing... see the ".NET Studio" terminal for progress.';
            vscode.postMessage({ command: 'publish', profile: collectProfile() });
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
                    updateConditionalRows();
                    formColumn.style.display = 'block';
                    break;
                }
                case 'folderPicked': {
                    publishDirEl.value = message.path;
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
