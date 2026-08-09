import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runDotnet } from './process';
import { BuildConfiguration } from './configurationPicker';

export type HelperPlatform = 'x86' | 'x64';

interface GetPropertyResult {
    TargetPath?: string;
    TargetFrameworks?: string;
}

const targetPathCache = new Map<string, Promise<string | undefined>>();
let cacheWatcher: vscode.Disposable | undefined;

function cacheKey(csprojPath: string, configuration: BuildConfiguration): string {
    return `${path.resolve(csprojPath).toLowerCase()}|${configuration}`;
}

/**
 * Clears the whole cache on any .csproj/.props/.targets change anywhere in the workspace -
 * broad rather than precisely scoped to the one affected project, but cheap (just a Map) and
 * simple, and avoids needing to track which projects import which shared Directory.Build.props.
 */
function ensureCacheWatcher(): void {
    if (cacheWatcher) { return; }
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,props,targets}');
    const clear = () => targetPathCache.clear();
    watcher.onDidChange(clear);
    watcher.onDidCreate(clear);
    watcher.onDidDelete(clear);
    cacheWatcher = watcher;
}

/** `-getProperty` with 2+ properties prints one JSON object `{"Properties": {...}}` to stdout - scans for the JSON rather than assuming it's the only output, since MSBuild can still print warnings above it despite `-nologo`. */
function parseGetPropertyOutput(stdout: string): GetPropertyResult | undefined {
    const jsonStart = stdout.indexOf('{');
    if (jsonStart < 0) { return undefined; }
    try {
        const parsed = JSON.parse(stdout.slice(jsonStart));
        return parsed?.Properties;
    } catch {
        return undefined;
    }
}

function extractXmlValue(xml: string, tag: string): string | undefined {
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml);
    return match?.[1]?.trim();
}

/** Recursively searches binDir for <assemblyName>.dll, returning the most recently built match. */
function findAssemblyInBin(binDir: string, assemblyName: string): string | undefined {
    const targetFileName = `${assemblyName.toLowerCase()}.dll`;
    let best: { filePath: string; mtimeMs: number } | undefined;

    const walk = (dir: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase() === targetFileName) {
                const mtimeMs = fs.statSync(fullPath).mtimeMs;
                if (!best || mtimeMs > best.mtimeMs) {
                    best = { filePath: fullPath, mtimeMs };
                }
            }
        }
    };

    walk(binDir);
    return best?.filePath;
}

/**
 * Last-resort fallback when `-getProperty` itself isn't available - specifically, an SDK older
 * than .NET 8 (the switch was added in MSBuild 17.8), which this extension's debugging features
 * don't otherwise require (only the optional SharpLsp language server has its own, separate
 * SDK 10+ requirement). Standard-layout projects (the common case on an older SDK) still resolve
 * correctly this way; a custom OutputPath/Directory.Build.props setup won't, same as before this
 * function existed - that combination needs a real .NET 8+ SDK for the correct path above to work.
 */
function findAssemblyInBinFallback(csprojPath: string): string | undefined {
    let assemblyName = path.basename(csprojPath, path.extname(csprojPath));
    try {
        assemblyName = extractXmlValue(fs.readFileSync(csprojPath, 'utf8'), 'AssemblyName') ?? assemblyName;
    } catch {
        // Fall back to the .csproj's own base name.
    }
    return findAssemblyInBin(path.join(path.dirname(csprojPath), 'bin'), assemblyName);
}

async function queryTargetPath(csprojPath: string, configuration: BuildConfiguration, targetFramework?: string): Promise<string | undefined> {
    const args = [
        'msbuild', csprojPath,
        '-getProperty:TargetPath,TargetFrameworks',
        `-p:Configuration=${configuration}`,
        '-nologo'
    ];
    if (targetFramework) { args.push(`-p:TargetFramework=${targetFramework}`); }

    let stdout: string;
    try {
        stdout = await runDotnet(args, path.dirname(csprojPath));
    } catch {
        return undefined;
    }

    const parsed = parseGetPropertyOutput(stdout);
    if (!parsed) { return undefined; }

    if (parsed.TargetPath) {
        return path.isAbsolute(parsed.TargetPath) ? parsed.TargetPath : path.resolve(path.dirname(csprojPath), parsed.TargetPath);
    }

    // A multi-targeted outer project (<TargetFrameworks>, plural) has no single TargetPath of
    // its own - that only exists in each inner per-TFM build. Retry once against the first
    // listed framework, matching what "just build it" would reasonably mean without asking.
    if (!targetFramework && parsed.TargetFrameworks) {
        const first = parsed.TargetFrameworks.split(';')[0]?.trim();
        if (first) { return queryTargetPath(csprojPath, configuration, first); }
    }

    return undefined;
}

/**
 * Resolves the real built assembly (.dll) path for a .csproj under a given configuration by
 * asking MSBuild directly for its `TargetPath` property (`dotnet msbuild -getProperty:`, .NET 8+
 * SDK), rather than guessing a filesystem location. This is the only approach that's correct for
 * a project with a custom `OutputPath`/`BaseOutputPath`/`ArtifactsPath`, or one whose
 * `AssemblyName`/output location is set conditionally or via `Directory.Build.props` rather than
 * a plain, literal `<AssemblyName>` in the .csproj itself - a `<projectDir>/bin` filesystem walk
 * can't find those, or worse, can silently find a stale DLL left over from an earlier
 * default-path build. No target runs and nothing is built - `-getProperty` alone only evaluates
 * the project, so this is safe to call speculatively (e.g. before a build has even happened).
 * Falls back to the old `<projectDir>/bin` filesystem walk only if the MSBuild query itself
 * fails outright (most likely an SDK older than 8.0, where `-getProperty` doesn't exist) - so a
 * standard-layout project on an older SDK still resolves correctly instead of a hard regression,
 * while a custom-layout project gets the real fix whenever a modern SDK is available. Memoized
 * per (csproj, configuration) since MSBuild evaluation has real process-spawn cost - safe to
 * cache because the answer is structural ("where would the output be"), not dependent on whether
 * a build has actually run; invalidated on any .csproj/.props/.targets change anywhere in the
 * workspace (see ensureCacheWatcher).
 */
export function resolveTargetPath(csprojPath: string, configuration: BuildConfiguration): Promise<string | undefined> {
    ensureCacheWatcher();
    const key = cacheKey(csprojPath, configuration);
    let cached = targetPathCache.get(key);
    if (!cached) {
        cached = queryTargetPath(csprojPath, configuration).then(resolved => resolved ?? findAssemblyInBinFallback(csprojPath));
        targetPathCache.set(key, cached);
    }
    return cached;
}

function findNearestCsproj(startDir: string): string | undefined {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
        if (!fs.existsSync(dir)) { break; }

        const csproj = fs.readdirSync(dir).find(entry => entry.toLowerCase().endsWith('.csproj'));
        if (csproj) {
            return path.join(dir, csproj);
        }

        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}

/**
 * Finds the built assembly (.dll) for the .csproj that owns a given .xaml file, at the given
 * configuration, so the designer-host helper can load it and resolve clr-namespace: references
 * to the project's own converters/controls/behaviors - the same thing Visual Studio's designer
 * relies on the project having already been built for. Returns undefined if no .csproj can be
 * found, or MSBuild can't resolve a TargetPath for it (the caller renders framework-only types
 * in that case).
 */
export function findProjectAssembly(xamlFilePath: string, configuration: BuildConfiguration): Promise<string | undefined> {
    const csprojPath = findNearestCsproj(path.dirname(xamlFilePath));
    if (!csprojPath) { return Promise.resolve(undefined); }
    return resolveTargetPath(csprojPath, configuration);
}

/**
 * Reads the project's App.xaml (the sibling file conventionally named
 * App.xaml at the project root), if any, so its <Application.Resources>
 * (global styles/brushes/fonts) can be merged into the preview - those are
 * ambient to every window in a real running app via Application.Current, and
 * previewing a window in isolation would otherwise fail on any StaticResource
 * defined only at the app level. Returns undefined when previewing App.xaml
 * itself, since there's nothing to merge into it.
 */
export function findAppXamlText(xamlFilePath: string): string | undefined {
    const csprojPath = findNearestCsproj(path.dirname(xamlFilePath));
    if (!csprojPath) { return undefined; }

    const projectDir = path.dirname(csprojPath);
    const appXamlName = fs.existsSync(projectDir)
        ? fs.readdirSync(projectDir).find(entry => entry.toLowerCase() === 'app.xaml')
        : undefined;
    if (!appXamlName) { return undefined; }

    const appXamlPath = path.join(projectDir, appXamlName);
    if (path.resolve(appXamlPath).toLowerCase() === path.resolve(xamlFilePath).toLowerCase()) {
        return undefined;
    }

    try {
        return fs.readFileSync(appXamlPath, 'utf8');
    } catch {
        return undefined;
    }
}

/**
 * A helper process's bitness must match the target assembly's, or the CLR
 * refuses to load it (BadImageFormatException). The build output path
 * itself is the most reliable signal - `bin\x86\...` vs `bin\x64\...` -
 * since that's literally what MSBuild named the folder for the configured
 * PlatformTarget. AnyCPU (no platform segment) defaults to x64, matching the
 * modern .NET default and this machine's architecture.
 */
export function detectAssemblyPlatform(assemblyPath: string): HelperPlatform {
    const segments = assemblyPath.toLowerCase().split(/[\\/]+/);
    if (segments.includes('x86')) { return 'x86'; }
    return 'x64';
}
