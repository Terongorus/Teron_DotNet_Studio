import * as cp from 'child_process';
import { resolveDotnetCommand, resolveDotnetEnv } from './dotnetPath';

/**
 * Runs `dotnet <args>` without a shell, so arguments never need manual quoting
 * and can't be interpreted as shell metacharacters. Uses dotnet-studio.dotnetPath's resolved
 * command/env when configured (see dotnetPath.ts), PATH resolution otherwise - the single choke
 * point almost every other dotnet CLI invocation in this extension already routes through.
 */
export function runDotnet(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const env = resolveDotnetEnv();
        cp.execFile(resolveDotnetCommand(), args, { cwd, env: env ? { ...process.env, ...env } : undefined }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout);
            }
        });
    });
}
