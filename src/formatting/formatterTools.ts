import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runDotnet } from '../utils/process';

/**
 * CSharpier and Fantomas are plain `dotnet tool` global tools (confirmed by installing both for
 * real - `dotnet tool install -g csharpier`/`fantomas` resolves them from NuGet like any other
 * global tool), not a downloaded platform-specific binary release like SharpLsp/netcoredbg. So
 * detection/install here is just the standard dotnet-tools global install directory, not this
 * extension's own checksum-verified GitHub release download machinery.
 *
 * Resolving the executable's real path under `.dotnet/tools` directly (rather than trusting
 * `PATH`) matches how Fantomas' own reference client (`Fantomas.Client`'s `FantomasToolLocator.fs`,
 * `FantomasToolStartInfo.GlobalTool` case) resolves its own daemon - deliberately, not a guess:
 * `dotnet tool install -g` only adds `.dotnet/tools` to the user's `PATH` once, and that change
 * isn't visible to an already-running process (this extension's own host) until VS Code itself is
 * restarted, so a "just installed, still not found on PATH" false negative is a real, easily-hit
 * failure mode immediately after using the install prompt below.
 */
function globalToolExecutablePath(commandName: string): string {
    const toolsDir = path.join(process.env.DOTNET_CLI_HOME ?? os.homedir(), '.dotnet', 'tools');
    const fileName = process.platform === 'win32' ? `${commandName}.exe` : commandName;
    return path.join(toolsDir, fileName);
}

/** Resolves a global dotnet tool's real executable path, or undefined if it isn't installed there. */
export function resolveGlobalToolPath(commandName: string): string | undefined {
    const candidate = globalToolExecutablePath(commandName);
    return fs.existsSync(candidate) ? candidate : undefined;
}

export async function installGlobalTool(packageId: string): Promise<void> {
    await runDotnet(['tool', 'install', '-g', packageId]);
}
