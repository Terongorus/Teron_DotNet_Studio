import * as fs from 'fs';
import * as path from 'path';
import { BuildConfiguration } from './configurationPicker';
import { resolveProjectInfo } from './projectAssemblyResolver';
import { parseSolutionProjects } from './solutionParser';

const PROJECT_REFERENCE = /<ProjectReference\s+Include="([^"]+)"/g;
const SKIPPED_DIR_NAMES = new Set(['bin', 'obj']);

/** Newest mtime (ms) among all files under `dir`, skipping bin/obj (their timestamps are touched by the build/restore process itself, not by source edits - including them would make a project look permanently "never up to date"). */
function newestMtimeUnder(dir: string): number {
    let newest = 0;

    const walk = (current: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (SKIPPED_DIR_NAMES.has(entry.name.toLowerCase())) { continue; }
                walk(path.join(current, entry.name));
                continue;
            }
            try {
                const mtimeMs = fs.statSync(path.join(current, entry.name)).mtimeMs;
                if (mtimeMs > newest) { newest = mtimeMs; }
            } catch {
                // Ignore files that vanish mid-walk.
            }
        }
    };

    walk(dir);
    return newest;
}

function mtimeOrUndefined(filePath: string): number | undefined {
    try {
        return fs.statSync(filePath).mtimeMs;
    } catch {
        return undefined;
    }
}

function extractProjectReferences(csprojPath: string): string[] {
    let content: string;
    try {
        content = fs.readFileSync(csprojPath, 'utf8');
    } catch {
        return [];
    }

    const projectDir = path.dirname(csprojPath);
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = PROJECT_REFERENCE.exec(content)) !== null) {
        results.push(path.resolve(projectDir, match[1].replace(/\\/g, path.sep)));
    }
    return results;
}

/**
 * Conservative "is there anything to build" pre-check, mirroring what Visual Studio's own Fast
 * Up-to-Date Check does before spawning a real build - `dotnet build` itself already correctly
 * skips recompilation when nothing changed (verified directly: `CoreCompile` gets reported as
 * "Skipping target... because all output files are up-to-date"), but that skip only happens
 * *after* MSBuild has already spent ~1-2s spinning up and evaluating the whole project graph, so
 * a build task always visibly runs even when it's about to do nothing. This check runs first, so
 * that case can be skipped entirely rather than just fast.
 *
 * Deliberately biased to false negatives over false positives - any ambiguity (unresolvable
 * TargetPath, output missing, restore state unreadable) reports NOT up to date, since skipping a
 * build that was actually needed means silently debugging/shipping a stale binary, which is far
 * worse than an unnecessary ~1-2s no-op build. Only ever consulted for the plain "build" action -
 * "clean" and "rebuild" always mean to do the work regardless.
 */
export async function isProjectUpToDate(
    csprojPath: string,
    configuration: BuildConfiguration,
    visiting: Set<string> = new Set()
): Promise<boolean> {
    const key = `${path.resolve(csprojPath).toLowerCase()}|${configuration}`;
    if (visiting.has(key)) { return true; }
    visiting.add(key);

    const { targetPath } = await resolveProjectInfo(csprojPath, configuration);
    if (!targetPath) { return false; }

    const targetMtime = mtimeOrUndefined(targetPath);
    if (targetMtime === undefined) { return false; }

    const projectDir = path.dirname(csprojPath);

    // Restore state: no project.assets.json at all means it's never been restored, so a build is
    // needed regardless of source timestamps. A stale one (older than the .csproj that produced
    // it) means references/packages may have changed since the last restore.
    const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');
    const assetsMtime = mtimeOrUndefined(assetsPath);
    if (assetsMtime === undefined) { return false; }
    const csprojMtime = mtimeOrUndefined(csprojPath);
    if (csprojMtime !== undefined && csprojMtime > assetsMtime) { return false; }

    if (newestMtimeUnder(projectDir) > targetMtime) { return false; }

    for (const reference of extractProjectReferences(csprojPath)) {
        if (!(await isProjectUpToDate(reference, configuration, visiting))) { return false; }
    }

    return true;
}

/** Same check as isProjectUpToDate, applied to every member project of a .sln/.slnx - up to date only if all of them are. */
export async function isUpToDate(targetPath: string, configuration: BuildConfiguration): Promise<boolean> {
    const extension = path.extname(targetPath).toLowerCase();
    if (extension !== '.sln' && extension !== '.slnx') {
        return isProjectUpToDate(targetPath, configuration);
    }

    const projects = await parseSolutionProjects(targetPath);
    if (projects.length === 0) { return false; }

    for (const project of projects) {
        if (!(await isProjectUpToDate(project, configuration))) { return false; }
    }
    return true;
}
