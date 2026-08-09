import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';

export interface ProcessStats {
    cpuPercent: number;
    memoryBytes: number;
    uptimeMs: number;
}

interface RawSample {
    TotalProcessorSeconds: number;
    WorkingSet64: number;
    StartTimeTicks: number;
}

const POLL_INTERVAL_MS = 1500;

/** .NET DateTime ticks (100ns units since 0001-01-01) for the Unix epoch. */
const DOTNET_EPOCH_TICKS = 621355968000000000;

function ticksToUnixMs(ticks: number): number {
    return (ticks - DOTNET_EPOCH_TICKS) / 10000;
}

/**
 * Queries a single process's cumulative CPU time, working set, and start
 * time via PowerShell - matches this repo's existing convention (see
 * process.ts's runDotnet) of using execFile with an argument array, never
 * shell string interpolation. -NoProfile/-NonInteractive avoid the overhead
 * of loading the user's PowerShell profile at this polling cadence.
 * Resolves undefined once the process has exited (Get-Process errors are
 * suppressed via -ErrorAction SilentlyContinue, which yields empty stdout).
 */
function getProcessStats(pid: number): Promise<RawSample | undefined> {
    const command = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object ` +
        `@{N='TotalProcessorSeconds';E={$_.TotalProcessorTime.TotalSeconds}}, WorkingSet64, ` +
        `@{N='StartTimeTicks';E={$_.StartTime.ToUniversalTime().Ticks}} | ConvertTo-Json -Compress`;

    return new Promise(resolve => {
        cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], (error, stdout) => {
            if (error || !stdout.trim()) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(stdout) as RawSample);
            } catch {
                resolve(undefined);
            }
        });
    });
}

/**
 * Polls a debuggee's process stats at a fixed interval, computing CPU%
 * extension-side from the delta of cumulative CPU-seconds between polls
 * divided by wall-clock delta and logical core count - matches modern
 * (Windows 10/11) Task Manager's normalized-to-100% convention. The first
 * successful sample has no prior delta to compare against, so it reports
 * 0% CPU rather than waiting a full interval before showing anything.
 */
export function startPolling(pid: number, onSample: (stats: ProcessStats | undefined) => void): vscode.Disposable {
    const logicalCores = os.cpus().length;
    let previous: { atMs: number; totalProcessorSeconds: number } | undefined;
    let disposed = false;

    const poll = async () => {
        const sample = await getProcessStats(pid);
        if (disposed) { return; }

        if (!sample) {
            onSample(undefined);
            return;
        }

        const now = Date.now();
        let cpuPercent = 0;
        if (previous) {
            const deltaSeconds = (now - previous.atMs) / 1000;
            const deltaCpuSeconds = sample.TotalProcessorSeconds - previous.totalProcessorSeconds;
            if (deltaSeconds > 0) {
                cpuPercent = Math.max(0, (deltaCpuSeconds / deltaSeconds) / logicalCores * 100);
            }
        }
        previous = { atMs: now, totalProcessorSeconds: sample.TotalProcessorSeconds };

        onSample({
            cpuPercent,
            memoryBytes: sample.WorkingSet64,
            uptimeMs: Math.max(0, now - ticksToUnixMs(sample.StartTimeTicks))
        });
    };

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return new vscode.Disposable(() => {
        disposed = true;
        clearInterval(interval);
    });
}
