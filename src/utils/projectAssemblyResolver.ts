import * as fs from 'fs';
import * as path from 'path';

/**
 * Finds the built assembly (.dll) for a given .csproj - the same thing Visual Studio's designer
 * (and, now, the debug adapter launch config resolution) relies on the project having already
 * been built for. Returns undefined if no matching built DLL can be found.
 */
export function findAssemblyForCsproj(csprojPath: string): string | undefined {
    const projectDir = path.dirname(csprojPath);
    let assemblyName = path.basename(csprojPath, path.extname(csprojPath));
    try {
        const content = fs.readFileSync(csprojPath, 'utf8');
        assemblyName = extractXmlValue(content, 'AssemblyName') ?? assemblyName;
    } catch {
        // Fall back to the .csproj's own base name.
    }

    const binDir = path.join(projectDir, 'bin');
    return findAssemblyInBin(binDir, assemblyName);
}

/**
 * Finds the built assembly (.dll) for the .csproj that owns a given .xaml
 * file, so the designer-host helper can load it and resolve clr-namespace:
 * references to the project's own converters/controls/behaviors - the same
 * thing Visual Studio's designer relies on the project having already been
 * built for. Returns undefined if no .csproj or no matching built DLL can be
 * found (the caller renders framework-only types in that case).
 */
export function findProjectAssembly(xamlFilePath: string): string | undefined {
    const csprojPath = findNearestCsproj(path.dirname(xamlFilePath));
    if (!csprojPath) { return undefined; }
    return findAssemblyForCsproj(csprojPath);
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

export type HelperPlatform = 'x86' | 'x64';

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

function extractXmlValue(xml: string, tag: string): string | undefined {
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml);
    return match?.[1]?.trim();
}

/** Recursively searches bin/ for <assemblyName>.dll, returning the most recently built match. */
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
