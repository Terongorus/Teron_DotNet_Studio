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
