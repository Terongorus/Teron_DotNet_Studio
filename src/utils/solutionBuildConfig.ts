import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { peekFolderState, updateFolderState } from './folderState';

/**
 * Real per-project build exclusion, backed by classic .sln's own `ProjectConfigurationPlatforms`
 * GlobalSection - the `.Build.0` line for a project's GUID is what `dotnet build <sln>` actually
 * reads to decide whether to build it, verified directly (stripped a real project's `.Build.0`
 * lines from a real two-project solution, confirmed `dotnet build` then skipped it). .slnx has no
 * working equivalent yet on the current SDK - three different `<Build>` element variants were
 * tried against a real `.slnx` and `dotnet build` built the project regardless every time, and
 * Visual Studio itself has an open bug (microsoft/vs-solutionpersistence#138) reliably persisting
 * this exact state - see FolderState.unloadedProjects for the UI-only fallback used there instead.
 *
 * Regex-based line editing, matching solutionParser.ts's own "lightweight extraction over a full
 * parser" convention - .sln's GlobalSection format is line-oriented and well-known enough that
 * this is safe as long as edits are surgical (only touch the exact lines for one project's GUID),
 * not a full reparse/rewrite that could disturb comments/formatting elsewhere in the file.
 */
const SLN_PROJECT_LINE = /^Project\("\{[^}]+\}"\)\s*=\s*"[^"]+",\s*"([^"]+\.csproj)",\s*"\{([A-Fa-f0-9-]+)\}"/gm;

export function isClassicSln(solutionPath: string): boolean {
    return solutionPath.toLowerCase().endsWith('.sln');
}

function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

async function findProjectGuid(solutionPath: string, projectPath: string, content: string): Promise<string | undefined> {
    const solutionDir = path.dirname(solutionPath);
    const target = path.resolve(projectPath).toLowerCase();

    const pattern = new RegExp(SLN_PROJECT_LINE.source, 'gm');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
        const relativePath = match[1].replace(/\\/g, path.sep);
        if (path.resolve(solutionDir, relativePath).toLowerCase() === target) {
            return match[2];
        }
    }
    return undefined;
}

/** True when the project has no `.Build.0` line at all for its GUID - dotnet build genuinely skips it. Always false for .slnx (no working file-level signal - see FolderState.unloadedProjects). */
export async function isProjectUnloaded(solutionPath: string, projectPath: string): Promise<boolean> {
    if (!isClassicSln(solutionPath)) { return false; }

    let content: string;
    try {
        content = await fs.promises.readFile(solutionPath, 'utf8');
    } catch {
        return false;
    }

    const guid = await findProjectGuid(solutionPath, projectPath, content);
    if (!guid) { return false; }

    return !new RegExp(`\\{${guid}\\}\\.[^\\r\\n]*\\.Build\\.0\\s*=`, 'i').test(content);
}

/**
 * unloaded=true removes every `.Build.0` line for the project's GUID (across every configuration/
 * platform - matches real Visual Studio's Unload Project, which excludes the project from every
 * build, not just the currently active configuration). unloaded=false (Reload Project)
 * reconstructs a `.Build.0` line for every existing `.ActiveCfg` line, since those two are always
 * paired 1:1 in a normal solution (skips any that already exist, so a partial/already-mixed state
 * doesn't get duplicated).
 */
export async function setProjectUnloaded(solutionPath: string, projectPath: string, unloaded: boolean): Promise<void> {
    if (!isClassicSln(solutionPath)) {
        throw new Error('setProjectUnloaded only supports classic .sln solutions.');
    }

    const content = await fs.promises.readFile(solutionPath, 'utf8');
    const guid = await findProjectGuid(solutionPath, projectPath, content);
    if (!guid) {
        throw new Error(`Could not find ${path.basename(projectPath)} in ${path.basename(solutionPath)}.`);
    }

    const eol = detectEol(content);
    const lines = content.split(/\r\n|\n/);
    const guidPrefix = `{${guid}}.`;

    let result: string[];
    if (unloaded) {
        result = lines.filter(line => {
            const trimmed = line.trim();
            return !(trimmed.startsWith(guidPrefix) && trimmed.includes('.Build.0'));
        });
    } else {
        const existingBuildKeys = new Set(
            lines
                .filter(line => { const t = line.trim(); return t.startsWith(guidPrefix) && t.includes('.Build.0'); })
                .map(line => line.trim().split('=')[0].trim())
        );

        result = [];
        for (const line of lines) {
            result.push(line);
            const trimmed = line.trim();
            if (trimmed.startsWith(guidPrefix) && trimmed.includes('.ActiveCfg')) {
                const buildKey = trimmed.split('=')[0].trim().replace('.ActiveCfg', '.Build.0');
                if (!existingBuildKeys.has(buildKey)) {
                    result.push(line.replace('.ActiveCfg', '.Build.0'));
                    existingBuildKeys.add(buildKey);
                }
            }
        }
    }

    await fs.promises.writeFile(solutionPath, result.join(eol), 'utf8');
}

function isUnloadedInFolderState(folder: vscode.WorkspaceFolder, projectPath: string): boolean {
    const list = peekFolderState(folder).unloadedProjects ?? [];
    const target = path.resolve(projectPath).toLowerCase();
    return list.some(p => path.resolve(p).toLowerCase() === target);
}

/**
 * Solution-format-agnostic entry point - real .Build.0 state for .sln, the UI-only FolderState
 * marker for .slnx. Used by both the tree's rendering and the pickers that need to exclude
 * unloaded projects.
 */
export function isProjectUnloadedInSolution(folder: vscode.WorkspaceFolder, solutionPath: string, projectPath: string): Promise<boolean> {
    if (isClassicSln(solutionPath)) { return isProjectUnloaded(solutionPath, projectPath); }
    return Promise.resolve(isUnloadedInFolderState(folder, projectPath));
}

/**
 * Solution-format-agnostic toggle. For .slnx, updates FolderState.unloadedProjects directly
 * (no real build-time effect - see the module doc comment) rather than throwing, since the UI
 * offers this action for .slnx too, just with a caveat shown to the user before calling this.
 */
export async function setProjectUnloadedInSolution(folder: vscode.WorkspaceFolder, solutionPath: string, projectPath: string, unloaded: boolean): Promise<void> {
    if (isClassicSln(solutionPath)) {
        await setProjectUnloaded(solutionPath, projectPath, unloaded);
        return;
    }

    const target = path.resolve(projectPath).toLowerCase();
    const existing = peekFolderState(folder).unloadedProjects ?? [];
    const withoutTarget = existing.filter(p => path.resolve(p).toLowerCase() !== target);
    const updated = unloaded ? [...withoutTarget, path.resolve(projectPath)] : withoutTarget;
    await updateFolderState(folder, { unloadedProjects: updated });
}
