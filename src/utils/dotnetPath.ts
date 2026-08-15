import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * `dotnet-studio.dotnetPath` - a specific `dotnet` executable to use for every dotnet CLI
 * invocation this extension makes, instead of resolving 'dotnet' from PATH. Exists because the VS
 * Code Extension Host inherits the machine's own environment variables directly, unlike an
 * integrated terminal - a user-local SDK install that only the user's terminal has been manually
 * redirected to (a real scenario on a machine without admin rights, where a system-wide install
 * isn't possible) stays completely invisible to the Extension Host even though the same `dotnet`
 * command works fine in a terminal. Gated on workspace trust (see package.json's
 * `restrictedConfigurations`), same as every other path-typed setting this extension has - an
 * untrusted workspace's settings.json shouldn't be able to point this extension at an arbitrary
 * executable.
 */
function getTrustedGlobalDotnetPath(): string {
    if (!vscode.workspace.isTrusted) { return ''; }
    return vscode.workspace.getConfiguration('dotnet-studio').get<string>('dotnetPath', '');
}

/** Resolves the configured dotnet executable path, or undefined if unset/missing (falls back to PATH resolution). */
export function resolveGlobalDotnetPath(): string | undefined {
    const configuredPath = getTrustedGlobalDotnetPath();
    return configuredPath && fs.existsSync(configuredPath) ? configuredPath : undefined;
}

/** The command to spawn for a `dotnet` CLI invocation - the configured absolute path if set, otherwise the bare 'dotnet' PATH lookup as before. */
export function resolveDotnetCommand(): string {
    return resolveGlobalDotnetPath() ?? 'dotnet';
}

/**
 * Env overrides needed for a spawned process to find the configured dotnet install -
 * `DOTNET_ROOT` (what hostfxr itself checks) plus prepending the SDK directory to `PATH` (for
 * anything the spawned process shells back out to `dotnet` for) - the exact same mechanism
 * `sharpLspClient.ts`'s `spawnClient` already uses for the SharpLsp sidecar, generalized here so
 * every other dotnet-invoking spawn in the extension gets the same override. Returns undefined
 * (nothing to merge) when no override is configured, so callers can spread it into `process.env`
 * unconditionally.
 */
export function resolveDotnetEnv(): NodeJS.ProcessEnv | undefined {
    const dotnetPath = resolveGlobalDotnetPath();
    if (!dotnetPath) { return undefined; }

    const dotnetDir = path.dirname(dotnetPath);
    return {
        DOTNET_ROOT: dotnetDir,
        PATH: `${dotnetDir}${path.delimiter}${process.env.PATH ?? ''}`
    };
}
