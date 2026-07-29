import * as cp from 'child_process';

/**
 * Runs `dotnet <args>` without a shell, so arguments never need manual quoting
 * and can't be interpreted as shell metacharacters.
 */
export function runDotnet(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.execFile('dotnet', args, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout);
            }
        });
    });
}
