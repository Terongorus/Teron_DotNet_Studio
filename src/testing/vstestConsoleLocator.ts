import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { resolveDotnetCommand, resolveDotnetEnv } from '../utils/dotnetPath';

/**
 * Resolves `vstest.console.dll`, bundled with every .NET SDK install (found directly under the
 * SDK's own base directory, not a separate download) - reused for both discovery and execution.
 * Resolved via `dotnet --info`'s "Base Path" line rather than `dotnet --list-sdks` (which lists
 * every installed SDK, not the one actually selected for this directory) - running `--info` from
 * the project's own directory means a `global.json` pinning an older SDK is respected, matching
 * whichever SDK would actually build/run the project.
 */
export async function resolveVsTestConsolePath(cwd: string): Promise<string | undefined> {
    let output: string;
    try {
        output = await new Promise<string>((resolve, reject) => {
            const env = resolveDotnetEnv();
            cp.execFile(resolveDotnetCommand(), ['--info'], { cwd, env: env ? { ...process.env, ...env } : undefined }, (error, stdout, stderr) => {
                if (error) { reject(new Error(stderr || error.message)); } else { resolve(stdout); }
            });
        });
    } catch {
        return undefined;
    }

    const match = /Base Path:\s*(.+)/.exec(output);
    if (!match) { return undefined; }

    const basePath = match[1].trim();
    const dllPath = path.join(basePath, 'vstest.console.dll');
    return fs.existsSync(dllPath) ? dllPath : undefined;
}
