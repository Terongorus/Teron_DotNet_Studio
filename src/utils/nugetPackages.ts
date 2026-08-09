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
