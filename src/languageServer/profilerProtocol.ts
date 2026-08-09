/**
 * Wire shapes for SharpLsp's `sharplsp/profiler/*` custom LSP requests/notifications - verified
 * against SharpLsp's own docs/specs/PROFILER-SPEC.md (Nimblesite/SharpLsp on GitHub), not guessed.
 * Only the subset this extension actually drives (live counters + trace recording) is modeled
 * here - SharpLsp's profiler surface also covers process list/kill, heap dump collection/
 * analysis, GC root tracing, and an object retention graph, none of which this extension uses.
 */

export const PROFILER_START_COUNTERS = 'sharplsp/profiler/startCounters';
export const PROFILER_STOP_COUNTERS = 'sharplsp/profiler/stopCounters';
export const PROFILER_COUNTER_UPDATE = 'sharplsp/profiler/counterUpdate';
export const PROFILER_START_TRACE = 'sharplsp/profiler/startTrace';
export const PROFILER_STOP_TRACE = 'sharplsp/profiler/stopTrace';

export interface StartCountersParams {
    pid: number;
    /** Counter providers. Server default: ["System.Runtime"]. */
    providers?: string[];
    /** Refresh interval in seconds. Server default: 1. */
    refresh_interval?: number;
}

export interface StartCountersResult {
    session_id: string;
}

export interface StopCountersParams {
    session_id: string;
}

export interface CounterValue {
    provider: string;
    name: string;
    display_name: string;
    value: number;
    unit: string;
}

export interface CounterUpdateParams {
    session_id: string;
    counters: CounterValue[];
}

export type TraceProfile = 'cpu-sampling' | 'gc-verbose';

export interface StartTraceParams {
    pid: number;
    /** EventPipe profile: "cpu-sampling" | "gc-verbose" | "gc-collect" | custom provider string. */
    profile?: string;
    /** Output format: "nettrace" | "speedscope" | "chromium". Server default: "speedscope". */
    format?: string;
    /** Max duration in seconds. 0 = unlimited. Server default: 30. */
    duration?: number;
    /** Output file path. Auto-generated if omitted. */
    output_path?: string;
}

export interface StartTraceResult {
    session_id: string;
    output_path: string;
}

export interface StopTraceParams {
    session_id: string;
}

export interface StopTraceResult {
    output_path: string;
    file_size_bytes: number;
    duration_ms: number;
}
