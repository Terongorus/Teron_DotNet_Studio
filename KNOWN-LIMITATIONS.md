# Known Limitations of Third-Party Components

.NET Studio drives several third-party, early-stage tools directly (SharpLsp, Microsoft's
standalone Roslyn Language Server, netcoredbg) instead of bundling its own reimplementation of
their functionality. This is a deliberate tradeoff - it avoids duplicating a huge amount of
compiler/debugger engineering - but it also means bugs in those tools show up here. This file
tracks the ones found through direct testing, with what was actually verified, so a real
limitation isn't confused with a guess.

## Roslyn Language Server

**Project/solution loading is currently unreliable on at least some Windows environments.**
Verified directly (spawning the real server binary and driving it over stdio, independent of VS
Code, against multiple real projects and Roslyn versions - not inferred from a single error):

* `solution/open` fails for a `.slnx` solution with an internal server assertion
  (`SolutionFileReader.cs`, `Contract.Fail("Unexpected false")`) - a known, still-open upstream
  MSBuild/Roslyn limitation ([dotnet/roslyn#73004](https://github.com/dotnet/roslyn/issues/73004)).
* `solution/open` **also** fails for a classic `.sln` solution, with the same class of internal
  assertion - not a `.slnx`-specific problem.
* `project/open` (this extension's fallback for `.slnx`, since it sidesteps the solution-file
  reader entirely) **also** fails, with a different internal assertion
  (`LanguageServerProjectLoader.cs`, same `Contract.Fail("Unexpected false")` pattern) - reproduced
  against multiple unrelated projects, opened individually and in batches, across three Roslyn
  versions spanning roughly seven months of builds. Pinning to an older installed .NET SDK via
  `global.json` didn't change the outcome either.

In short: on the machine this was tested on, every one of Roslyn's own project/solution loading
paths failed, regardless of file format, project count, or Roslyn version. When this happens,
diagnostics, completions, hover, and go-to-definition don't work at all while Roslyn is selected -
not degraded, just silently absent, since the server never successfully loads a workspace to
analyze in the first place. **If you hit this, switch to SharpLsp** (`.NET: Switch Language
Server`) - it's the only language server option confirmed working end-to-end in this same testing.

This has not been confirmed as a universal Roslyn Language Server bug versus something specific to
this environment (SDK layout, MSBuild resolution, etc.) - only that it reproduces consistently,
extensively, and independently of anything this extension sends it.

**No runtime diagnostics/profiler integration.** Unlike SharpLsp, Roslyn's Language Server has no
`dotnet-trace`/`dotnet-counters`/`dotnet-dump` integration at all (confirmed by searching Roslyn's
own source directly - zero references anywhere in the repo). This is a real, permanent feature
gap, not a bug: the Resource Monitor's live runtime counters and **Start/Stop Recording Trace**
require SharpLsp specifically, and will continue to regardless of which language server you have
selected for C#/F# - the "Start SharpLsp" action in those panels starts it alongside your selected
language server just for this capability, without changing that selection.

## SharpLsp

**Trace recording (`Start Recording Trace`) fails with `invalid type: map, expected u32`.**
Verified against SharpLsp's own real Rust source at the exact version tag matching a real install
(`v0.18.0`): the request this extension sends matches the server's expected `StartTraceParams`
struct field-for-field, and every function in the actual code path that runs afterward was checked
for anything that could produce this specific deserialization error - none of them could. This
looks like a genuine bug inside SharpLsp itself, not something this extension's request
construction can work around. Live counters and everything else SharpLsp provides (diagnostics,
completion, hover, navigation) are unaffected - this is isolated to trace recording specifically.

## Why these aren't "fixed"

Both of the above are bugs inside third-party binaries this extension downloads and drives, not in
this extension's own TypeScript. There's no reliable client-side workaround for either - that was
tested, not assumed. If you hit one of these and want to help move it forward, the SharpLsp issue
is the more actionable of the two to report upstream (a specific, reproducible request/response
pair); the Roslyn one needs more data on whether it's environment-specific before it's clearly
actionable as a bug report.
