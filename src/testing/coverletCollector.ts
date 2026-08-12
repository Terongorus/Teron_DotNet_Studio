import * as fs from 'fs';
import * as path from 'path';

const COVERLET_PACKAGE_ID = 'coverlet.collector';

/** Light text scan for a PackageReference, matching this codebase's existing preference (see projectAssemblyResolver.ts) for regex-based .csproj reads over adding an XML library dependency - true even if the project hasn't been restored yet, unlike resolveCoverletCollectorPath below. */
export function hasCoverletCollectorReference(csprojContent: string): boolean {
    return new RegExp(`<PackageReference\\s+Include="${COVERLET_PACKAGE_ID}"`, 'i').test(csprojContent);
}

/**
 * Locates the installed `coverlet.collector` package's own build output folder
 * (`coverlet.collector.dll` lives here) via the project's real restore output
 * (`obj/project.assets.json`) - the same source of truth `nugetPackages.ts`'s
 * `getPackageAssemblies()` already reads for package compile assets. Needed because, unlike a
 * test adapter (e.g. `xunit.runner.visualstudio`), coverlet.collector is **not** copied into the
 * test project's own build output - confirmed empirically, not assumed: a real coverage run
 * against a design-mode session with no `TestAdaptersPaths` silently produced zero coverage data
 * (VSTest's own `AttachmentSets` came back empty, no error), because it simply never found the
 * collector DLL to load. `dotnet test --collect` papers over this because the MSBuild VSTestTask
 * resolves and passes this same path automatically; nothing does that for a raw design-mode
 * session.
 */
export async function resolveCoverletCollectorPath(csprojPath: string): Promise<string | undefined> {
    const assetsPath = path.join(path.dirname(csprojPath), 'obj', 'project.assets.json');

    let assets: any;
    try {
        assets = JSON.parse(await fs.promises.readFile(assetsPath, 'utf8'));
    } catch {
        return undefined;
    }

    const libraries = assets.libraries;
    if (!libraries || typeof libraries !== 'object') { return undefined; }

    const libraryKey = Object.keys(libraries).find(key => key.toLowerCase().startsWith(`${COVERLET_PACKAGE_ID}/`));
    if (!libraryKey) { return undefined; }
    const version = libraryKey.slice(COVERLET_PACKAGE_ID.length + 1);

    const packageFolders: string[] = Object.keys(assets.packageFolders ?? {});
    for (const folder of packageFolders) {
        const candidate = path.join(folder, COVERLET_PACKAGE_ID, version, 'build', 'netstandard2.0');
        if (fs.existsSync(path.join(candidate, 'coverlet.collector.dll'))) { return candidate; }
    }
    return undefined;
}

/**
 * The RunSettings VSTest needs to actually invoke coverlet.collector during a design-mode run -
 * verified end-to-end against a real vstest.console process, not assumed from coverlet's own
 * `--collect`-oriented documentation (which only documents the `dotnet test` CLI flag, not what
 * that flag expands to on the wire). `TestAdaptersPaths` is what makes the collector
 * discoverable at all (see resolveCoverletCollectorPath's own comment); the friendly name
 * `"XPlat code coverage"` (lowercase "code coverage") must match exactly - it's how VSTest
 * resolves the request to coverlet's own registered `ExtensionUri`.
 */
export function buildCoverageRunSettings(coverletCollectorPath: string): string {
    return `<RunSettings>
  <RunConfiguration>
    <TestAdaptersPaths>${coverletCollectorPath}</TestAdaptersPaths>
  </RunConfiguration>
  <DataCollectionRunSettings>
    <DataCollectors>
      <DataCollector friendlyName="XPlat code coverage" />
    </DataCollectors>
  </DataCollectionRunSettings>
</RunSettings>`;
}
