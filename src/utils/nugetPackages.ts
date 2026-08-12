import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from './process';

export interface PackageReference {
    id: string;
    requestedVersion: string;
    resolvedVersion: string;
}

interface DotnetListPackageOutput {
    projects?: Array<{
        frameworks?: Array<{
            topLevelPackages?: Array<{
                id?: string;
                requestedVersion?: string;
                resolvedVersion?: string;
            }>;
        }>;
    }>;
}

export interface PackageVulnerability {
    severity: string;
    advisoryUrl: string;
}

export interface PackageDeprecation {
    reasons: string[];
    alternativePackage?: string;
}

interface DotnetListVulnerableOutput {
    projects?: Array<{
        frameworks?: Array<{
            topLevelPackages?: Array<{ id?: string; vulnerabilities?: Array<{ severity?: string; advisoryurl?: string }> }>;
            transitivePackages?: Array<{ id?: string; vulnerabilities?: Array<{ severity?: string; advisoryurl?: string }> }>;
        }>;
    }>;
}

interface DotnetListDeprecatedOutput {
    projects?: Array<{
        frameworks?: Array<{
            topLevelPackages?: Array<{ id?: string; deprecationReasons?: string[]; alternativePackage?: { id?: string; versionRange?: string } }>;
            transitivePackages?: Array<{ id?: string; deprecationReasons?: string[]; alternativePackage?: { id?: string; versionRange?: string } }>;
        }>;
    }>;
}

/**
 * Uses `--format json` (a real structured contract, supported since .NET SDK
 * 7.0.200) rather than scraping the default human-formatted table - unlike
 * solutionParser.ts's regex parsing, which exists because .sln has no
 * structured-output alternative at all.
 */
export async function listPackageReferences(projectPath: string): Promise<PackageReference[]> {
    let output: string;
    try {
        output = await runDotnet(['list', projectPath, 'package', '--format', 'json']);
    } catch (error: any) {
        throw new Error(`Failed to list packages (requires .NET SDK 7.0.200 or later): ${error.message}`);
    }

    let parsed: DotnetListPackageOutput;
    try {
        parsed = JSON.parse(output) as DotnetListPackageOutput;
    } catch {
        throw new Error('NuGet package management requires .NET SDK 7.0.200 or later.');
    }

    const byId = new Map<string, PackageReference>();
    for (const project of parsed.projects ?? []) {
        for (const framework of project.frameworks ?? []) {
            for (const pkg of framework.topLevelPackages ?? []) {
                if (!pkg.id) { continue; }
                byId.set(pkg.id, {
                    id: pkg.id,
                    requestedVersion: pkg.requestedVersion ?? '',
                    resolvedVersion: pkg.resolvedVersion ?? pkg.requestedVersion ?? ''
                });
            }
        }
    }

    return [...byId.values()];
}

/**
 * Runs `dotnet list package --vulnerable --include-transitive --format json` - a single
 * project-wide advisory check (NuGetAudit, backed by GitHub Advisory Database data) rather than
 * a per-package query, so unlike checkForUpdates() in nugetManagerPanel.ts this doesn't need to
 * fan out one request per installed package. `--include-transitive` matters here specifically:
 * a vulnerable package pulled in indirectly is exactly as real a risk as a direct one, and
 * Rider/ReSharper's own equivalent doesn't limit itself to direct references either. Returns an
 * empty map (never throws) on any failure - this is a "nice to know" security signal layered on
 * top of the package list, not something that should block the panel from showing installed
 * packages at all if the audit check itself fails (offline, SDK too old, registry unreachable).
 */
export async function listVulnerablePackages(projectPath: string): Promise<Map<string, PackageVulnerability[]>> {
    const byId = new Map<string, PackageVulnerability[]>();

    let output: string;
    try {
        output = await runDotnet(['list', projectPath, 'package', '--vulnerable', '--include-transitive', '--format', 'json']);
    } catch {
        return byId;
    }

    let parsed: DotnetListVulnerableOutput;
    try {
        parsed = JSON.parse(output) as DotnetListVulnerableOutput;
    } catch {
        return byId;
    }

    for (const project of parsed.projects ?? []) {
        for (const framework of project.frameworks ?? []) {
            for (const pkg of [...(framework.topLevelPackages ?? []), ...(framework.transitivePackages ?? [])]) {
                if (!pkg.id || !pkg.vulnerabilities?.length) { continue; }
                byId.set(pkg.id, pkg.vulnerabilities.map(v => ({
                    severity: v.severity ?? 'Unknown',
                    advisoryUrl: v.advisoryurl ?? ''
                })));
            }
        }
    }

    return byId;
}

/** Same shape and reasoning as listVulnerablePackages, for `--deprecated` instead of `--vulnerable`. */
export async function listDeprecatedPackages(projectPath: string): Promise<Map<string, PackageDeprecation>> {
    const byId = new Map<string, PackageDeprecation>();

    let output: string;
    try {
        output = await runDotnet(['list', projectPath, 'package', '--deprecated', '--include-transitive', '--format', 'json']);
    } catch {
        return byId;
    }

    let parsed: DotnetListDeprecatedOutput;
    try {
        parsed = JSON.parse(output) as DotnetListDeprecatedOutput;
    } catch {
        return byId;
    }

    for (const project of parsed.projects ?? []) {
        for (const framework of project.frameworks ?? []) {
            for (const pkg of [...(framework.topLevelPackages ?? []), ...(framework.transitivePackages ?? [])]) {
                if (!pkg.id || !pkg.deprecationReasons?.length) { continue; }
                byId.set(pkg.id, {
                    reasons: pkg.deprecationReasons,
                    alternativePackage: pkg.alternativePackage?.id
                });
            }
        }
    }

    return byId;
}

export async function addOrUpdatePackage(projectPath: string, packageId: string, version?: string): Promise<void> {
    const args = ['add', projectPath, 'package', packageId];
    if (version) { args.push('-v', version); }
    await runDotnet(args);
}

export async function removePackage(projectPath: string, packageId: string): Promise<void> {
    await runDotnet(['remove', projectPath, 'package', packageId]);
}

/**
 * Resolves the actual compile-time assembly files a package contributes to the build - the
 * one piece of NuGet data `dotnet list package` doesn't expose (it only reports IDs/versions).
 * `obj/project.assets.json` is NuGet's own restore output and the same source Visual
 * Studio/ReSharper read for this - it already resolved the exact files used for compilation
 * (accounting for multi-targeting, PrivateAssets, asset trimming, etc.), so this reads it
 * directly rather than re-deriving that resolution by scanning the global packages cache.
 *
 * Returns an empty array if the project hasn't been restored yet, the package contributes no
 * compile assets (e.g. a build-only or analyzer-only package), or anything about the assets
 * file can't be parsed - never throws, since this is a "nice to know" tree expansion, not a
 * required build step.
 */
export async function getPackageAssemblies(projectPath: string, packageId: string, resolvedVersion: string): Promise<string[]> {
    const assetsPath = path.join(path.dirname(projectPath), 'obj', 'project.assets.json');

    let assets: any;
    try {
        const raw = await fs.promises.readFile(assetsPath, 'utf8');
        assets = JSON.parse(raw);
    } catch {
        return [];
    }

    const targets = assets.targets;
    if (!targets || typeof targets !== 'object') { return []; }

    // Multi-targeted projects resolve differently per framework; this mirrors the same
    // simplification listPackageReferences already makes (flattening across frameworks) by
    // just using whichever target comes first.
    const targetKey = Object.keys(targets)[0];
    const targetEntries = targetKey ? targets[targetKey] : undefined;
    if (!targetEntries) { return []; }

    const libraryKey = Object.keys(targetEntries).find(key => {
        const separatorIndex = key.lastIndexOf('/');
        if (separatorIndex < 0) { return false; }
        return key.slice(0, separatorIndex).toLowerCase() === packageId.toLowerCase()
            && key.slice(separatorIndex + 1).toLowerCase() === resolvedVersion.toLowerCase();
    });
    if (!libraryKey) { return []; }

    const compile = targetEntries[libraryKey]?.compile;
    if (!compile || typeof compile !== 'object') { return []; }

    const packageFolders: string[] = Object.keys(assets.packageFolders ?? {});
    const results: string[] = [];

    for (const relativePath of Object.keys(compile)) {
        // A package with no real compile assets lists a "_._" placeholder here - never a
        // real file.
        if (!relativePath.toLowerCase().endsWith('.dll')) { continue; }

        for (const folder of packageFolders) {
            const candidate = path.join(folder, packageId.toLowerCase(), resolvedVersion, relativePath);
            if (fs.existsSync(candidate)) {
                results.push(candidate);
                break;
            }
        }
    }

    return results;
}
