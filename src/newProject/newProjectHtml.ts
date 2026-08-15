import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

/**
 * 2-step wizard mirroring Visual Studio's own "Create a new project" flow: a searchable template
 * gallery filterable by Language/Platform/Project Type (matching VS's own 3-dropdown row), then a
 * single "Configure your new project" page (name + location, live target-path preview) ending in
 * Create - not a multi-page review wizard.
 */
export function getNewProjectHtml(webview: vscode.Webview, codiconCssUri: vscode.Uri): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <link rel="stylesheet" href="${codiconCssUri}">
    <title>Create a new project</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px 20px;
        }
        h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 4px;
        }
        .subtitle {
            font-size: 12px;
            opacity: 0.7;
            margin: 0 0 16px;
        }
        .steps {
            display: flex;
            gap: 6px;
            margin-bottom: 20px;
            max-width: 980px;
        }
        .step-indicator {
            flex: 1;
            padding: 6px 4px;
            text-align: center;
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.5;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .step-indicator.active {
            opacity: 1;
            font-weight: 600;
            border-bottom-color: var(--vscode-focusBorder);
        }
        .step-indicator.done {
            opacity: 0.8;
            border-bottom-color: var(--vscode-charts-green, var(--vscode-focusBorder));
        }
        .step-panel {
            display: none;
        }
        .step-panel.active {
            display: block;
        }

        /* --- Step 1: template gallery --- */
        .gallery-layout {
            display: flex;
            gap: 20px;
            max-width: 980px;
        }
        .recent-column {
            flex: 0 0 210px;
        }
        .recent-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .recent-row {
            padding: 6px 8px;
            cursor: pointer;
            border-radius: 3px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .recent-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .recent-row.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .recent-row-name {
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .recent-row-lang {
            font-size: 11px;
            opacity: 0.7;
        }
        .gallery-main {
            flex: 1;
            min-width: 0;
        }
        .gallery-toolbar {
            display: flex;
            gap: 10px;
            margin-bottom: 12px;
        }
        .gallery-toolbar input[type="text"] {
            flex: 2;
        }
        .gallery-toolbar select {
            flex: 1;
            min-width: 0;
        }
        input[type="text"], select {
            box-sizing: border-box;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 5px 6px;
            font-size: 13px;
        }
        input[type="text"]:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .template-list {
            display: flex;
            flex-direction: column;
            max-height: 420px;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
        }
        .template-list-row {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 10px 12px;
            cursor: pointer;
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }
        .template-list-row:last-child {
            border-bottom: none;
        }
        .template-list-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .template-list-row.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .template-badge {
            flex: 0 0 auto;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: white;
            background: var(--badge-color, var(--vscode-charts-blue));
        }
        .template-info {
            flex: 1;
            min-width: 0;
        }
        .template-name-row {
            display: flex;
            align-items: baseline;
            gap: 8px;
        }
        .template-name {
            font-size: 13px;
            font-weight: 600;
        }
        .template-lang {
            font-size: 11px;
            opacity: 0.75;
        }
        .template-tags {
            font-size: 11px;
            opacity: 0.6;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-top: 2px;
        }
        .empty-note {
            font-size: 12px;
            opacity: 0.7;
            padding: 10px 2px;
        }
        .install-link {
            margin-top: 10px;
            font-size: 12px;
        }
        .install-link a {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: none;
        }
        .install-link a:hover {
            text-decoration: underline;
        }

        /* --- Step 2: configure --- */
        .configure-layout {
            max-width: 560px;
        }
        .form-row {
            margin-bottom: 16px;
        }
        .form-row label {
            display: block;
            font-size: 12px;
            opacity: 0.75;
            margin-bottom: 4px;
        }
        .error-text {
            color: var(--vscode-errorForeground);
            font-size: 12px;
            margin-top: 4px;
            min-height: 16px;
        }
        .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            opacity: 0.6;
            margin: 4px 0 8px;
        }
        .mode-pill-group {
            display: inline-flex;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        .mode-pill {
            background: none;
            border: none;
            border-right: 1px solid var(--vscode-panel-border);
            color: var(--vscode-foreground);
            opacity: 0.75;
            padding: 6px 16px;
            font-size: 13px;
            cursor: pointer;
        }
        .mode-pill:last-child {
            border-right: none;
        }
        .mode-pill:hover {
            opacity: 1;
            background: var(--vscode-list-hoverBackground);
        }
        .mode-pill.active {
            opacity: 1;
            font-weight: 600;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .mode-body-panel {
            margin-bottom: 6px;
        }
        .location-row {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .location-row input[type="text"] {
            flex: 1;
        }
        .location-path {
            font-size: 12px;
            opacity: 0.85;
            word-break: break-all;
        }
        .checkbox-row {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            margin-bottom: 4px;
        }
        .field-hint {
            font-size: 11px;
            opacity: 0.65;
            margin: 0 0 14px;
        }
        .path-preview {
            font-size: 12px;
            opacity: 0.8;
            margin-top: 10px;
            padding: 8px 10px;
            border: 1px solid var(--vscode-panel-border);
            word-break: break-all;
            min-height: 16px;
        }
        .path-preview .label {
            opacity: 0.7;
            margin-right: 6px;
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
            opacity: 0.5;
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
        button.secondary:disabled {
            opacity: 0.5;
            cursor: default;
        }
        .footer {
            display: flex;
            gap: 8px;
            margin-top: 20px;
            align-items: center;
            max-width: 980px;
        }
        .footer .spacer {
            flex: 1;
        }
        .status-line {
            font-size: 12px;
            opacity: 0.85;
            margin-top: 10px;
            min-height: 16px;
        }
    </style>
</head>
<body>
    <h1>Create a new project</h1>
    <p class="subtitle">Choose a template to get started, then configure where it goes.</p>

    <div class="steps">
        <div class="step-indicator" data-step="1">1. Choose a template</div>
        <div class="step-indicator" data-step="2">2. Configure your new project</div>
    </div>

    <div class="step-panel" id="step1">
        <div class="gallery-layout">
            <div class="recent-column" id="recentColumn" style="display:none;">
                <div class="section-title">Recent project templates</div>
                <div class="recent-list" id="recentList"></div>
            </div>
            <div class="gallery-main">
                <div class="gallery-toolbar">
                    <input type="text" id="templateSearch" placeholder="Search for templates...">
                    <select id="languageFilter"><option value="">All languages</option></select>
                    <select id="platformFilter"><option value="">All platforms</option></select>
                    <select id="typeFilter"><option value="">All project types</option></select>
                </div>
                <div class="template-list" id="templateList"></div>
                <div class="empty-note" id="templateEmptyNote" style="display:none;">No templates match your filters.</div>
                <div class="install-link"><a id="installTemplateLink">Don't see what you're looking for? Install more templates from NuGet...</a></div>
            </div>
        </div>
    </div>

    <div class="step-panel configure-layout" id="step2">
        <div class="form-row">
            <label for="projectName">Project name</label>
            <input type="text" id="projectName" placeholder="MyDotNetProject" style="width:100%;">
            <div class="error-text" id="nameError"></div>
        </div>

        <div class="section-title">Where should this project go?</div>
        <div class="mode-pill-group">
            <button type="button" class="mode-pill" data-mode="standalone">Standalone</button>
            <button type="button" class="mode-pill" data-mode="newSolution">New Solution</button>
            <button type="button" class="mode-pill" data-mode="existingSolution">Existing Solution</button>
        </div>

        <div class="mode-body-panel" id="standaloneBody">
            <div class="form-row">
                <label for="standaloneLocation">Location</label>
                <div class="location-row">
                    <input type="text" id="standaloneLocation" placeholder="Choose a folder...">
                    <button class="secondary" id="standaloneBrowseBtn">Browse...</button>
                </div>
            </div>
        </div>

        <div class="mode-body-panel" id="newSolutionBody" style="display:none;">
            <div class="form-row">
                <label for="newSolutionLocation">Location</label>
                <div class="location-row">
                    <input type="text" id="newSolutionLocation" placeholder="Choose a folder...">
                    <button class="secondary" id="newSolutionBrowseBtn">Browse...</button>
                </div>
            </div>
            <div class="form-row">
                <label for="solutionName">Solution name</label>
                <input type="text" id="solutionName" placeholder="MyDotNetProject" style="width:100%;">
            </div>
            <div class="checkbox-row">
                <input type="checkbox" id="placeTogether">
                <label for="placeTogether">Place solution and project in the same directory</label>
            </div>
            <p class="field-hint">When checked, the solution file is created directly inside the project's folder (using the project's name as the solution name too). When unchecked, the project gets its own subfolder inside a dedicated solution folder, ready for more projects to be added later.</p>
        </div>

        <div class="mode-body-panel" id="existingSolutionBody" style="display:none;">
            <div class="form-row">
                <label for="existingLocation">Location</label>
                <div class="location-row">
                    <input type="text" id="existingLocation" placeholder="No solution selected." disabled>
                    <button class="secondary" id="chooseExistingSolutionBtn">Choose Solution...</button>
                </div>
            </div>
            <div class="form-row">
                <label for="existingSolutionName">Solution name</label>
                <input type="text" id="existingSolutionName" style="width:100%;" disabled>
            </div>
        </div>

        <div class="path-preview"><span class="label">Project will be created at:</span><span id="pathPreview"></span></div>
    </div>

    <div class="footer">
        <button class="secondary" id="backBtn">Back</button>
        <button class="action" id="nextBtn">Next</button>
        <button class="action" id="createBtn" style="display:none;">Create</button>
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
        const createBtn = document.getElementById('createBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const statusLine = document.getElementById('statusLine');

        const templateSearch = document.getElementById('templateSearch');
        const languageFilter = document.getElementById('languageFilter');
        const platformFilter = document.getElementById('platformFilter');
        const typeFilter = document.getElementById('typeFilter');
        const templateListEl = document.getElementById('templateList');
        const templateEmptyNote = document.getElementById('templateEmptyNote');
        const installTemplateLink = document.getElementById('installTemplateLink');
        const recentColumn = document.getElementById('recentColumn');
        const recentListEl = document.getElementById('recentList');

        const projectNameEl = document.getElementById('projectName');
        const nameErrorEl = document.getElementById('nameError');
        const pathPreviewEl = document.getElementById('pathPreview');

        const modePills = [...document.querySelectorAll('.mode-pill')];
        const standaloneBody = document.getElementById('standaloneBody');
        const newSolutionBody = document.getElementById('newSolutionBody');
        const existingSolutionBody = document.getElementById('existingSolutionBody');
        const standaloneLocationEl = document.getElementById('standaloneLocation');
        const newSolutionLocationEl = document.getElementById('newSolutionLocation');
        const solutionNameEl = document.getElementById('solutionName');
        const placeTogetherEl = document.getElementById('placeTogether');
        const existingLocationEl = document.getElementById('existingLocation');
        const existingSolutionNameEl = document.getElementById('existingSolutionName');

        // A handful of VS Code's own chart colors, picked deterministically from the template's
        // primary type tag (falling back to language) - not a real per-type icon set, but enough
        // for same-type templates to visually cluster and different types to stand apart.
        const BADGE_PALETTE = [
            'var(--vscode-charts-blue)', 'var(--vscode-charts-purple)', 'var(--vscode-charts-orange)',
            'var(--vscode-charts-green)', 'var(--vscode-charts-red)', 'var(--vscode-charts-yellow)'
        ];

        let step = 1;
        let templates = [];
        let recentTemplates = [];
        let selectedTemplate = null;
        let nameValid = false;
        let mode = 'standalone';
        let standaloneLocation = '';
        let newSolutionLocation = '';
        let solutionNameTouched = false;
        let existingSln = null;

        function escapeHtml(value) {
            return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function hashString(value) {
            let hash = 0;
            for (let i = 0; i < value.length; i++) { hash = (hash * 31 + value.charCodeAt(i)) | 0; }
            return Math.abs(hash);
        }

        // VS Code's own Codicon set (github.com/microsoft/vscode-codicons), same icons used in
        // the Explorer/Extensions view - real shape differentiation, not just color. Checked
        // against real Tags tokens from an actual "dotnet new list --type project" run. Two
        // tiers: SPECIFIC wins whenever a template has a more identifying tag (gRPC/MVC/WinForms/
        // WPF/...); FALLBACK only applies when nothing specific matched (a template whose only
        // real signal is the broad "Web"/"Mobile"/"Common"/"Desktop" tag). A brand-new tag this
        // table has never seen just falls through to DEFAULT_ICON, same safe-fallback spirit as
        // the platform classification on the extension side.
        const SPECIFIC_TYPE_ICONS = {
            'Console': 'terminal', 'Library': 'library',
            'Test': 'beaker', 'MSTest': 'beaker', 'NUnit': 'beaker', 'xUnit': 'beaker', 'Playwright': 'beaker',
            'gRPC': 'radio-tower', 'MVC': 'layers', 'Razor Pages': 'symbol-namespace', 'Razor': 'symbol-namespace',
            'Blazor Hybrid': 'circuit-board', 'Blazor': 'globe', 'WebAssembly': 'globe', 'PWA': 'globe',
            'Web API': 'server-process', 'API': 'server-process', 'Service': 'server-process',
            'MAUI': 'device-mobile', 'WinForms': 'window', 'WPF': 'layout', 'Worker': 'vm',
            'MCP': 'plug', 'AI': 'sparkle', 'Aspire': 'rocket', 'Cloud': 'cloud', 'Empty': 'file-code'
        };
        const FALLBACK_TYPE_ICONS = { 'Web': 'globe', 'Mobile': 'device-mobile', 'Common': 'file-code', 'Desktop': 'window' };
        const DEFAULT_ICON = 'symbol-file';

        function iconFor(t) {
            for (const tag of t.types) { if (SPECIFIC_TYPE_ICONS[tag]) { return SPECIFIC_TYPE_ICONS[tag]; } }
            for (const tag of t.types) { if (FALLBACK_TYPE_ICONS[tag]) { return FALLBACK_TYPE_ICONS[tag]; } }
            return DEFAULT_ICON;
        }

        function badgeColor(t) {
            return BADGE_PALETTE[hashString(iconFor(t)) % BADGE_PALETTE.length];
        }

        function canAdvanceFrom1() { return !!selectedTemplate; }
        function canCreate() {
            if (!nameValid) { return false; }
            if (mode === 'standalone') { return !!standaloneLocation; }
            if (mode === 'newSolution') { return !!newSolutionLocation && !!solutionNameEl.value.trim(); }
            if (mode === 'existingSolution') { return !!existingSln; }
            return false;
        }

        function locationDisplay() {
            const name = projectNameEl.value || '<project name>';
            if (mode === 'standalone') {
                return standaloneLocation ? standaloneLocation + '\\\\' + name : '';
            }
            if (mode === 'newSolution') {
                const solName = solutionNameEl.value.trim();
                if (!newSolutionLocation || !solName) { return ''; }
                const together = placeTogetherEl.checked;
                const solutionFolder = together ? (newSolutionLocation + '\\\\' + name) : (newSolutionLocation + '\\\\' + solName);
                const projectFolder = together ? solutionFolder : (solutionFolder + '\\\\' + name);
                return projectFolder + '  (new solution "' + solName + '.slnx")';
            }
            if (mode === 'existingSolution') {
                return existingSln ? existingSln.solutionFolder + '\\\\' + name + '  (added to ' + existingSln.slnPath.split(/[\\\\/]/).pop() + ')' : '';
            }
            return '';
        }

        function refreshPreview() {
            pathPreviewEl.textContent = locationDisplay() || 'Choose a location below.';
            createBtn.disabled = !canCreate();
        }

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
            createBtn.style.display = n === 2 ? 'inline-block' : 'none';
            nextBtn.disabled = !canAdvanceFrom1();
            statusLine.textContent = '';
            if (n === 2) { refreshPreview(); }
        }

        function populateFilterOptions(selectEl, values, defaultLabel) {
            const current = selectEl.value;
            selectEl.innerHTML = '<option value="">' + defaultLabel + '</option>';
            [...values].sort().forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                selectEl.appendChild(opt);
            });
            if ([...values].includes(current)) { selectEl.value = current; }
        }

        function renderFilterOptions() {
            populateFilterOptions(languageFilter, new Set(templates.flatMap(t => t.languages)), 'All languages');
            populateFilterOptions(platformFilter, new Set(templates.flatMap(t => t.platforms)), 'All platforms');
            populateFilterOptions(typeFilter, new Set(templates.flatMap(t => t.types)), 'All project types');
        }

        function selectTemplate(t) {
            selectedTemplate = t;
            renderRecentList();
            renderTemplateList();
            nextBtn.disabled = !canAdvanceFrom1();
        }

        function renderTemplateList() {
            const search = templateSearch.value.trim().toLowerCase();
            const lang = languageFilter.value;
            const platform = platformFilter.value;
            const type = typeFilter.value;

            const filtered = templates.filter(t =>
                (!search || t.name.toLowerCase().includes(search)) &&
                (!lang || t.languages.includes(lang)) &&
                (!platform || t.platforms.length === 0 || t.platforms.includes(platform)) &&
                (!type || t.types.includes(type))
            );

            templateListEl.innerHTML = '';
            templateEmptyNote.style.display = filtered.length === 0 ? 'block' : 'none';

            filtered.forEach(t => {
                const row = document.createElement('div');
                row.className = 'template-list-row' + (selectedTemplate && selectedTemplate.shortName === t.shortName ? ' selected' : '');
                const tagLine = [...t.platforms, ...t.types].join(' \\u00b7 ');
                // Once a language filter is active, every visible row already matches it - showing
                // the template's full language list back (e.g. "C#, F#") next to a "C#"-filtered
                // list reads as if the filter isn't really applied. Show only the filtered language.
                const displayLanguages = lang ? lang : t.languages.join(', ');
                row.innerHTML =
                    '<div class="template-badge" style="--badge-color:' + badgeColor(t) + '"><i class="codicon codicon-' + iconFor(t) + '"></i></div>' +
                    '<div class="template-info">' +
                    '<div class="template-name-row"><span class="template-name">' + escapeHtml(t.name) + '</span>' +
                    '<span class="template-lang">' + escapeHtml(displayLanguages) + '</span></div>' +
                    '<div class="template-tags" title="' + escapeHtml(tagLine) + '">' + escapeHtml(tagLine) + '</div>' +
                    '</div>';
                row.addEventListener('click', () => selectTemplate(t));
                row.addEventListener('dblclick', () => { selectTemplate(t); showStep(2); });
                templateListEl.appendChild(row);
            });
        }

        function renderRecentList() {
            // Resolved against the current template list rather than rendered from the stored
            // entry alone, so a since-uninstalled template silently drops out instead of showing
            // a dead entry, and the row gets the same live icon/language classification as the
            // main list.
            const resolved = recentTemplates.map(r => templates.find(t => t.shortName === r.shortName)).filter(Boolean);
            recentColumn.style.display = resolved.length ? 'block' : 'none';
            recentListEl.innerHTML = '';
            resolved.forEach(t => {
                const row = document.createElement('div');
                row.className = 'recent-row' + (selectedTemplate && selectedTemplate.shortName === t.shortName ? ' selected' : '');
                row.innerHTML =
                    '<i class="codicon codicon-' + iconFor(t) + '" style="color:' + badgeColor(t) + '"></i>' +
                    '<div><div class="recent-row-name">' + escapeHtml(t.name) + '</div>' +
                    '<div class="recent-row-lang">' + escapeHtml(t.primaryLanguage) + '</div></div>';
                row.addEventListener('click', () => selectTemplate(t));
                recentListEl.appendChild(row);
            });
        }

        templateSearch.addEventListener('input', renderTemplateList);
        languageFilter.addEventListener('change', renderTemplateList);
        platformFilter.addEventListener('change', renderTemplateList);
        typeFilter.addEventListener('change', renderTemplateList);
        installTemplateLink.addEventListener('click', () => vscode.postMessage({ command: 'installTemplate' }));

        // When "place together" is on, Solution name isn't independently editable at all - it's
        // forced to track Project name (matching Visual Studio's real behavior: a single-project
        // solution takes the project's name). Off, it tracks Project name only until the user
        // types a different one themselves.
        function updateSolutionNameLock() {
            const together = placeTogetherEl.checked;
            solutionNameEl.disabled = together;
            solutionNameTouched = false;
            if (together) { solutionNameEl.value = projectNameEl.value; }
        }

        let nameDebounce;
        projectNameEl.addEventListener('input', () => {
            clearTimeout(nameDebounce);
            const value = projectNameEl.value;
            nameDebounce = setTimeout(() => vscode.postMessage({ command: 'validateName', value }), 150);
            if (placeTogetherEl.checked || !solutionNameTouched) { solutionNameEl.value = value; }
            refreshPreview();
        });

        function selectModeTab(newMode) {
            mode = newMode;
            modePills.forEach(t => t.classList.toggle('active', t.dataset.mode === newMode));
            standaloneBody.style.display = newMode === 'standalone' ? 'block' : 'none';
            newSolutionBody.style.display = newMode === 'newSolution' ? 'block' : 'none';
            existingSolutionBody.style.display = newMode === 'existingSolution' ? 'block' : 'none';
            refreshPreview();
        }
        modePills.forEach(t => t.addEventListener('click', () => selectModeTab(t.dataset.mode)));
        selectModeTab('standalone');

        document.getElementById('standaloneBrowseBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browseFolder', target: 'standalone' });
        });
        document.getElementById('newSolutionBrowseBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browseFolder', target: 'newSolution' });
        });
        standaloneLocationEl.addEventListener('input', () => { standaloneLocation = standaloneLocationEl.value; refreshPreview(); });
        newSolutionLocationEl.addEventListener('input', () => { newSolutionLocation = newSolutionLocationEl.value; refreshPreview(); });
        solutionNameEl.addEventListener('input', () => { solutionNameTouched = true; refreshPreview(); });
        placeTogetherEl.addEventListener('change', () => {
            updateSolutionNameLock();
            vscode.postMessage({ command: 'placeTogetherChanged', value: placeTogetherEl.checked });
            refreshPreview();
        });

        document.getElementById('chooseExistingSolutionBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'chooseExistingSolution' });
        });

        backBtn.addEventListener('click', () => { if (step > 1) { showStep(step - 1); } });
        nextBtn.addEventListener('click', () => { if (canAdvanceFrom1() && step === 1) { showStep(2); } });
        cancelBtn.addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));

        createBtn.addEventListener('click', () => {
            createBtn.disabled = true;
            backBtn.disabled = true;
            statusLine.textContent = 'Creating...';
            const payload = {
                command: 'create',
                templateShortName: selectedTemplate.shortName,
                templateName: selectedTemplate.name,
                projectName: projectNameEl.value,
                mode
            };
            if (mode === 'standalone') {
                payload.location = standaloneLocation;
            } else if (mode === 'newSolution') {
                payload.location = newSolutionLocation;
                payload.solutionName = solutionNameEl.value.trim();
                payload.placeTogether = placeTogetherEl.checked;
            } else if (mode === 'existingSolution') {
                payload.existingSlnPath = existingSln.slnPath;
            }
            vscode.postMessage(payload);
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'templates':
                    templates = message.templates;
                    recentTemplates = message.recent || [];
                    renderFilterOptions();
                    renderTemplateList();
                    renderRecentList();
                    // Restores the "place together" toggle to whatever the user last left it at,
                    // not VS Code's own re-render default - it's a persisted preference, not a
                    // one-shot default.
                    placeTogetherEl.checked = !!message.placeTogether;
                    updateSolutionNameLock();
                    break;
                case 'nameValidation':
                    nameValid = !message.error;
                    nameErrorEl.textContent = message.error || '';
                    refreshPreview();
                    break;
                case 'folderPicked':
                    if (message.target === 'standalone') {
                        standaloneLocation = message.folderPath;
                        standaloneLocationEl.value = message.folderPath;
                    } else if (message.target === 'newSolution') {
                        newSolutionLocation = message.folderPath;
                        newSolutionLocationEl.value = message.folderPath;
                    }
                    refreshPreview();
                    break;
                case 'solutionPicked': {
                    existingSln = { slnPath: message.slnPath, solutionFolder: message.solutionFolder };
                    existingLocationEl.value = message.solutionFolder;
                    const fileName = message.slnPath.split(/[\\\\/]/).pop();
                    existingSolutionNameEl.value = fileName.replace(/\\.(sln|slnx)$/i, '');
                    refreshPreview();
                    break;
                }
                case 'status':
                    statusLine.textContent = message.message;
                    break;
                case 'createFailed':
                    createBtn.disabled = !canCreate();
                    backBtn.disabled = false;
                    statusLine.textContent = message.message;
                    break;
            }
        });

        showStep(1);
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
}
