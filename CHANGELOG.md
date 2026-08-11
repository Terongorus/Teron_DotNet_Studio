# Change Log

All notable changes to the **.NET Studio** extension will be documented in this file.

## [1.10.10] - 2026-08-12

* **Fix: Resource Monitor never detected an active debug session, even while genuinely
  debugging.** Its PID tracker was watching DAP traffic for VS Code's own *built-in* `dotnet`
  debug type (contributed by Microsoft's C# extension, which this project deliberately doesn't
  depend on) instead of this extension's actual debug type, `dotnet-creator-debug`. Since nothing
  here ever starts a session of the type it was listening for, it never once captured a real
  process id - Resource Monitor's live counters and "Start Trace Recording" always showed "No
  active .NET debug session" / "Start debugging a .NET project first," regardless of which
  language server was selected or whether a debug session was actually running. Found from a real
  screenshot of an active, successful debug session next to that exact message.

## [1.10.9] - 2026-08-12

* **Fix: self-update's install step failed with `"No Servers"`.** Root cause confirmed by reading
  VS Code's own source (`extensionManagementService.ts`): the install command's internal
  `getManifest()` rejects with that literal string unless the given URI's `.scheme` is exactly
  `"file"` (or `"vscode-remote"`) - `context.globalStorageUri` isn't guaranteed to be a literal
  `file://` URI in every environment, and `vscode.workspace.fs.writeFile` succeeds regardless of
  scheme (it abstracts over any filesystem provider), so the download silently worked while only
  the install step broke. Now explicitly re-wraps the downloaded path via `Uri.file(fsPath)`
  before installing, guaranteeing the scheme the install command actually requires.

## [1.10.8] - 2026-08-11

* **Fix: the Project status bar's "Recently Used" list could show projects from a solution
  other than the one currently open.** Recently-picked projects were tracked once per workspace
  folder, shared across every solution ever opened there - switching to an unrelated solution
  left the old one's projects sitting in "Recently Used" indefinitely, out of context. Recent
  projects are now bucketed by solution within the same per-workspace state file
  (`.vscode/dotnet-creator.state.json`) - switching solutions now shows only that solution's own
  recently-used projects, and switching back restores its list exactly as it was, with no history
  lost.

## [1.10.7] - 2026-08-11

* **Fix: self-update's install step failed with an unhelpful "undefined" error message.**
  `workbench.extensions.installExtension` silently swallows the real exception unless a
  second, undocumented `throwOnFailure` argument is passed
  ([microsoft/vscode#88713](https://github.com/microsoft/vscode/issues/88713)) - now passed, so a
  future install failure shows the actual reason instead of nothing. All three self-update
  failure messages (check/download/install) also now handle non-`Error` rejections gracefully
  instead of assuming a `.message` property exists. Install failures also offer a "Reveal
  Downloaded VSIX" action, so a failed automatic install doesn't strand the already-downloaded
  file with no way to install it manually.
  > Note: since this fix lives in the self-update code that only ships starting with this
  > version, an update *to* v1.10.7 itself from an older version will still show the old
  > "undefined" message - install v1.10.7 once manually, and self-update from then on will show
  > real diagnostics if it ever fails again.

## [1.10.6] - 2026-08-11

* **New: "Start" and "Stop" for each language server, alongside the existing "Restart".**
  Previously the only way to stop a running SharpLsp or Roslyn Language Server (short of switching
  the other one on, which stops it as a side effect) was closing VS Code. Both language server
  menus (and the Command Palette) now offer **.NET: Start/Stop Language Server** and
  **.NET: Start/Stop Roslyn Language Server** - Start/Stop show contextually (Start only once the
  binary's been resolved at least once and it isn't already running; Stop only while it's
  active), so there's never a dead button.

## [1.10.5] - 2026-08-11

* **Fix: self-update (and the SharpLsp/netcoredbg update checks it shares code with) could go
  silent for a full 24 hours after a single transient failure.** The "last checked" timestamp was
  being recorded *before* the GitHub API request even ran, so any blip - a network hiccup, or an
  unauthenticated rate limit (capped at 60 requests/hour) - would silently block every future
  check, automatic or manual, for a full day with no visible sign anything had gone wrong. Now
  only recorded after an actual successful response.
* **Fix: the manual `.NET: Check for Updates` command did nothing if the automatic background
  check had already run recently.** It shared the exact same 24h throttle meant only to rate-limit
  the automatic check - an explicit user action should never be silently swallowed by that.
  Manual checks now always run for real, and say so explicitly either way ("you're on the latest
  version" if nothing's newer, instead of total silence).

## [1.10.4] - 2026-08-11

* **Fix: Roslyn Language Server produced zero diagnostics for `.slnx` solutions - not just
  slow to warm up, genuinely never analyzing anything.** Confirmed via real server logs and
  upstream research: Microsoft's own Roslyn Language Server's `.slnx`-specific solution reader
  throws a hard internal assertion failure trying to load a real `.slnx` (a known, still-open
  MSBuild/Roslyn limitation - see
  [dotnet/roslyn#73004](https://github.com/dotnet/roslyn/issues/73004)), leaving the server's
  project system completely unpopulated afterward - so every file's diagnostics, completions, and
  navigation silently came back empty regardless of what the code actually contained. Classic
  `.sln` was unaffected. Worked around by opening each member project individually
  (`project/open`) instead of the solution as a whole (`solution/open`) specifically for `.slnx`,
  bypassing the broken reader entirely.
* **Fix: "Start Trace Recording" gave dead-end instructions when Roslyn is the selected language
  server.** Runtime trace recording and the Resource Monitor's live counters both drive SharpLsp's
  own profiler protocol extension specifically (Roslyn doesn't implement an equivalent) - the
  error shown when SharpLsp isn't running told users to "open a C#/F# file, or use the status bar"
  to start it, but neither works when Roslyn is selected (SharpLsp's own auto-start is gated off,
  and its status bar item never even appears). Both messages now explain this is a SharpLsp-
  specific capability and offer a direct "Start SharpLsp" action that works regardless of which
  language server is currently selected.

## [1.10.3] - 2026-08-11

* **New: Build now skips the task entirely when the project/solution is already up to date.**
  Previously, running Build always spawned a `dotnet build` task and showed a terminal, even when
  nothing had changed - MSBuild's own `CoreCompile` incremental check was already correctly
  skipping recompilation underneath (confirmed via `-v:normal`: `Skipping target "CoreCompile"
  because all output files are up-to-date`), but the ~1-2s process-spawn/evaluation overhead ran
  every time regardless, unlike Visual Studio's own instant Fast Up-to-Date Check. Added a
  conservative pre-check (source files, the `.csproj` itself, restore state, and referenced
  projects' outputs, all compared against the built output's timestamp) that skips the task and
  shows an instant "already up to date" message when it's confident nothing changed - falls back
  to always building on any ambiguity, so a stale binary is never silently used. Applies to the
  Build action (status bar, `Ctrl+K B`/`Ctrl+K Ctrl+B`, and the debug launch's pre-build step) -
  Rebuild and Clean always run regardless, since forcing the work is the whole point of those.

## [1.10.2] - 2026-08-11

* **Fix: the Roslyn Language Server never actually started - it errored on every launch attempt
  and looped restarting forever.** The real `Microsoft.CodeAnalysis.LanguageServer.exe` marks
  `--logLevel` and `--extensionLogDirectory` as required command-line options (confirmed by
  running the binary's own `--help`); neither was being passed, so the process printed its usage
  text to stdout instead of starting, which the LSP client then failed trying to parse as
  protocol frames ("Header must provide a Content-Length property"). Now passes both -
  `--extensionLogDirectory` pointed at this extension's own per-install log directory.

## [1.10.1] - 2026-08-11

* **Fix: Settings page showed the extension's old pre-rebrand name** (".NET Project Creator" /
  the raw "Dotnet-creator" ID-derived heading) instead of ".NET Studio".
* **Fix: all settings were jammed into one flat, unlabeled list.** Split into four labeled
  sections: **.NET Studio** (general + the language server picker), **SharpLsp Language
  Server**, **Roslyn Language Server**, and **Debugger (netcoredbg)**.
* **Fix: switching to the Roslyn Language Server via the settings dropdown never actually
  started it or offered to install it** - only the **.NET: Switch Language Server** command did.
  Changing `dotnet-creator.languageServer` directly (Settings UI or `settings.json`) now starts
  the newly selected server the same way the command does.
* **Fix: no way to install Roslyn (or SharpLsp) directly from the Command Palette.** Both
  "Download..." actions previously lived only inside a QuickPick reachable by clicking their
  status bar item - and Roslyn's status bar item stays hidden until the server has started at
  least once, a chicken-and-egg gap. Added standalone **.NET: Download Roslyn Language Server**
  and **.NET: Download SharpLsp** commands.
* **Fix: self-update silently never checked for updates.** `checkForExtensionUpdate()` looked up
  the running extension by a hardcoded `publisher.name` string that no longer matched this
  project's current publisher ID (changed since), so it silently found nothing every time. Now
  reads its own identity from the extension context instead of a literal string.

## [1.10.0] - 2026-08-11

* **New: Build/Rebuild/Clean keyboard shortcuts.** Six new commands operating on the currently
  selected project/solution: **Build/Rebuild/Clean Project** (`Ctrl+K B` / `Ctrl+K Shift+B` /
  `Ctrl+K C`) and **Build/Rebuild/Clean Solution** (`Ctrl+K Ctrl+B` / `Ctrl+K Ctrl+Shift+B` /
  `Ctrl+K Ctrl+C`) - previously only reachable via the status bar's Build/Rebuild/Clean QuickPick
  entries, with no way to bind a key to them directly.
* **New: Solution Explorer auto-refreshes on external `.sln`/`.slnx` changes.** Adding or
  removing a project via `dotnet sln`, another tool, or another VS Code window now updates the
  tree automatically - previously only each project's own folder was watched, not the solution
  file itself.
* **New: choice of C#/F# language server - SharpLsp or Microsoft's own Roslyn Language Server.**
  A new setting, `dotnet-creator.languageServer` (`sharpLsp` or `roslyn`, default `sharpLsp`),
  and a new command, **.NET: Switch Language Server**, let you pick. The Roslyn option downloads
  and drives Microsoft's real `Microsoft.CodeAnalysis.LanguageServer` binary - the same one C#
  Dev Kit uses internally - standalone, from Microsoft's own public feed, the same approach the
  `roslyn.nvim` Neovim plugin uses. Both language servers can be installed side by side; only the
  selected one ever runs.
* **New: self-update via GitHub Releases.** .NET Studio now checks its own GitHub releases (not
  the VS Code Marketplace) for updates once a day and offers to download and install the latest
  `.vsix` directly - **.NET: Check for Updates** triggers this on demand too.

## [1.9.0] - 2026-08-11

A detailed bug report plus 5 more issues, all found through real, hands-on use of the packaged
extension - investigating one of them (a supposedly missing context menu entry) surfaced a wider,
previously unnoticed bug affecting several others.

* **Fixed: debugging an x86 `PlatformTarget` project failed immediately with `Failed command
  'configurationDone' : 0x80004005`.** The debug launch never told the .NET host to use the
  32-bit runtime, so the system-default x64 host faulted trying to load an x86-only IL image
  before any user code ran. Now detects `PlatformTarget` via the same MSBuild query used to
  resolve the build output, and points `DOTNET_ROOT` at the 32-bit .NET host when needed - or
  shows a clear error if that host isn't installed, instead of the opaque CLR failure.
* **Fixed: several Solution Explorer context menu items were silently missing for any project
  that's part of a solution** (New File/Class/Folder, Add Existing File, Reveal in File Explorer,
  Open in Integrated Terminal, Paste) - almost every real project, since nearly everyone uses
  solutions. Root cause: a project's context value is `"dotnetProject inSolution"`, but these
  entries checked for exact equality against `"dotnetProject"` alone, which never matched.
* **Fixed: debug sessions were hard to tell apart when running several at once** - both the F5/
  status bar Run path and VS Code's native Run and Debug dropdown always named every session
  generically (".NET Debug"/".NET Debug 2"/".NET Debug 3"...). Session names now include the
  actual project name.
* **Fixed: F5 did nothing while a debug session was already running**, even after selecting a
  different project - the keybinding was gated to only fire when no session was active at all.
  Multiple concurrent debug sessions via F5 now work the same way they already did through the
  Run and Debug panel.
* **Fixed: two build tasks running at once would overwrite or silently no-op each other's
  output** - build tasks shared a single terminal panel. Each distinct build (by project/solution
  name) now gets its own dedicated terminal, so building two different projects concurrently
  shows both live, separately.
* **New: Unload Project.** A project can now be unloaded/reloaded from its Solution Explorer
  context menu, matching Visual Studio. For classic `.sln` solutions this is real: it edits the
  solution's own build configuration so `dotnet build` genuinely skips the project (verified
  directly against a real solution before shipping). `.slnx` solutions get a UI-only version
  instead (hidden from pickers, shown dimmed) with an explicit note that a solution build will
  still build it - `.slnx` doesn't yet reliably support build exclusion on the current SDK
  (confirmed via a real round-trip test; even Visual Studio itself has an open, unresolved bug
  in this exact area). Unloaded projects are excluded from the auto-pick-sole-project logic and
  the project QuickPick either way.

## [1.8.0] - 2026-08-10

* **Fixed: debug session launching didn't work with a custom build output path.** Resolving the
  built assembly to launch (Run/F5, and the generated `launch.json`'s `program`) walked
  `<projectDir>/bin` on disk looking for a matching `.dll` - which can't find a project whose
  `OutputPath`/`BaseOutputPath`/`ArtifactsPath` is redirected elsewhere (a common
  `Directory.Build.props` pattern), and could silently pick up a stale DLL left over from an
  earlier default-path build. Now asks MSBuild directly for the project's real `TargetPath`
  (`dotnet msbuild -getProperty:TargetPath`, .NET 8+ SDK) - correct for any custom output layout,
  and for `AssemblyName`/output paths set conditionally or via `Directory.Build.props` rather
  than a plain literal in the `.csproj` itself. Falls back to the previous filesystem walk only
  if `-getProperty` itself isn't available (an SDK older than 8.0), so a standard-layout project
  on an older SDK doesn't regress.
* **Fixed: the generated build tasks ignored the Debug/Release configuration entirely.** `.NET:
  Set Up Debug/Build Tasks`' generated `tasks.json` entries never passed `-c`/`--configuration` to
  `dotnet build` at all, always building with whatever MSBuild's own default resolved to -
  silently ignoring the status bar's Debug/Release picker, and meaning the generated `.NET
  Release` launch config didn't actually build Release before launching it (both `.NET Debug` and
  `.NET Release` shared the exact same untargeted preLaunchTask). Each launch config now has its
  own hidden build task hardcoding its own configuration (`.NET Build Project Hidden (Debug)` /
  `(Release)`), and the general-purpose visible build tasks now pass the status bar's current
  configuration via a new silent `dotnet-creator.getCurrentConfiguration` command. **Workspaces
  that already ran .NET: Set Up Debug/Build Tasks before this update should re-run it** to pick
  up the new tasks/inputs - the old ones are left in place (nothing is removed automatically) and
  keep working exactly as before, just without this fix, until re-run.

## [1.7.1] - 2026-08-10

* **Fixed: build output was only visible as a notification toast and an easy-to-miss Output
  channel.** **.NET: Build/Rebuild/Clean** and the pre-launch build behind **Run**/F5 now run as
  a real VS Code Task (the same mechanism `tasks.json` entries use), so output shows in an
  integrated Terminal tab that reveals itself automatically - matching how VS Code's own build
  tasks behave. Errors and warnings are now also parsed by the `$msCompile` problem matcher into
  the Problems panel, which the previous plain-text output channel never did at all.

## [1.7.0] - 2026-08-10

Five real bugs found using the packaged (installed, not just Extension Development Host)
extension in a live project, plus the "Deeper runtime diagnostics" roadmap item.

* **Fixed: Run/F5 launched with an unsupported debug type.** The status bar's "Run" action and
  the F5 keybinding both built an inline debug configuration that still hardcoded
  `"type": "dotnet"` (Microsoft's C# extension's debug type, not installed) and a `projectPath`
  field left over from before this extension's own `dotnet-creator-debug` type (netcoredbg)
  existed - producing "Configured debug type 'dotnet' is not supported" instead of launching. Now
  resolves the built assembly and launches with `dotnet-creator-debug`, matching what
  **.NET: Set Up Debug/Build Tasks** already generated correctly.
* **Fixed: per-workspace state didn't restore after "Reload Window."** The selected
  solution/project/configuration are read from `.vscode/dotnet-creator.state.json` asynchronously
  on activation; the status bar items and Solution Explorer read the in-memory cache
  synchronously at registration time, before that load resolved, and nothing ever refreshed them
  once it did - so restored state was on disk and in the cache, but never actually shown until an
  unrelated action was taken. Fixed with a load-completion event that the existing
  solution/project/configuration change notifications now relay.
* **Fixed: switching to a different solution didn't switch the real VS Code workspace.** Picking
  a solution living outside the currently open folder only updated this extension's own tracked
  state - the real file Explorer, git, integrated terminal, and debug configuration resolution
  all stayed scoped to the old folder. Now switches the actual workspace to the solution's own
  folder when it isn't already open (skipped for a solution legitimately nested inside an
  already-open folder, to avoid a disruptive switch).
* **Changed: no more interactive "Workspace / Global" prompt for debug/build task setup.**
  **.NET: Set Up Debug/Build Tasks** and the one-time-per-workspace setup prompt no longer ask
  where to add the generated tasks/launch entries. A new setting,
  `dotnet-creator.useGlobalDebugTasks` (off by default), decides instead: off keeps the existing
  per-workspace behavior; on creates global (User Tasks/launch) configuration once and skips the
  per-workspace prompt entirely, using the shared global configuration for every workspace from
  then on.
* **New: Resource Monitor runtime diagnostics**, closing the "Deeper runtime diagnostics" roadmap
  item. When [SharpLsp](https://github.com/Nimblesite/SharpLsp) is running, the .NET Resource
  Monitor panel now also shows live GC heap/ThreadPool runtime counters, and a title-bar
  **Start/Stop Recording Trace** action records a CPU-sampling or Memory/GC EventPipe trace to a
  file (via SharpLsp's own `dotnet-trace`/`dotnet-counters` integration) - the existing OS-level
  CPU/memory charts are unaffected and still work with or without SharpLsp.

## [1.6.0] - 2026-08-09

A live verification pass (actually running every recent feature in a real Extension Development
Host, not just reading the code) turned up a real bug or gap for nearly everything touched.

* **Solution Explorer**:
  * The project's own `.csproj` and the current `.sln`/`.slnx` no longer show up as ordinary
    loose file leaves (redundant with the Project/Solution nodes themselves - this happened
    whenever they sat in a directory this extension already lists, common in a
    single-project-at-repo-root layout). Replaced with explicit **Edit Project File** / **Edit
    Solution File** context-menu commands on the Project/Solution nodes.
  * **Manage NuGet Packages** is now on the project node's own context menu directly, not only
    on its Dependencies sub-node.
  * Expanding a NuGet package now shows the actual compile-time assembly file(s) it contributes
    (or a "No compile-time assemblies" placeholder for build/analyzer-only packages), read
    directly from `obj/project.assets.json` - matches Visual Studio/ReSharper, which this didn't
    have at all before.
  * Fixed: XAML Live Preview was completely unreachable from this view's own right-click menu -
    a stale, mismatched view ID and a contextValue pattern that never matched anything, present
    since it was first wired up. Every other surface for the same command (editor title bar,
    native Explorer, editor context menu) already worked correctly.
  * Fixed: "Reveal in File Explorer"/"Open in Integrated Terminal" would have failed on a
    Solution node (`Uri.joinPath` against a field that node type doesn't have).
* **A single-project solution now auto-selects that project** as the startup project instead of
  showing an unresolved "Select Project" placeholder - matches Visual Studio; a solution with
  more than one project is left alone, since which one is current genuinely matters there.
* **Create New Project / Create Solution now open the result automatically** instead of asking
  via an easy-to-miss, auto-dismissing toast notification - matches Visual Studio's own behavior.
  A missed prompt previously left the real VS Code workspace on the old folder (git, the actual
  Explorer, the terminal) while this extension's own Solution Explorer showed the new project,
  a confusing split. Skipped automatically when the target is already the open workspace folder
  (e.g. adding a project to an already-open solution), so nothing reloads unnecessarily.
* **NuGet Manager panel now refreshes on external `.csproj` changes** (a source-control
  revert/checkout, a manual edit in another editor, another tool) - previously only refreshed on
  open and after its own install/remove actions, silently going stale otherwise.
* **Fixed**: "Download SharpLsp" could fail with `EBUSY` when SharpLsp's own client was already
  running from the exact file being overwritten (re-downloading the active version, or updating
  while connected) - Windows locks a running executable's file. The client is now stopped first.
* **Removed**: "Use Bundled SharpLsp" and "Use Bundled netcoredbg". Both tools now resolve via
  configured path, environment variable, a previously-downloaded cached copy, or PATH -
  **Download** is the only way to get a managed copy of either going forward. Removes the
  build-time binary staging (`tools/build-sharplsp.js`, `tools/build-netcoredbg.js`) and the
  corresponding VSIX bloat entirely.

## [1.5.0] - 2026-08-09

* **XAML Live Preview: interactive editing** - the read-only preview added in 1.2.0 ("interactive
  editing is planned for a future release") now supports it:
  * Click an element in the preview to select it - a real, server-side hit-test against the
    live WPF visual tree (correct z-order/opacity/hit-test-visibility handling for free), not
    an approximation.
  * Drag the selected element to move it, or drag one of its 8 resize handles to resize it -
    both are a zero-network-round-trip client-side overlay while dragging, with the actual
    change applied to the real `.xaml` file (through VS Code's document API, never a raw
    filesystem write, so other extensions watching the file see the edit) on release.
  * Canvas-parented elements get true absolute positioning (`Canvas.Left`/`Canvas.Top`);
    anything else gets an approximate `Margin` nudge on its own top/left, since XAML layout has
    no universal absolute-positioning concept outside a `Canvas`.
  * Refuses to commit a drag while the file has unsaved edits, rather than silently discarding
    them - save first, then drag.
* **Fixed**: previewing two different `.xaml` files of the same target platform (the common
  case, since most projects are AnyCPU) shares one underlying render process - selection/commit
  state is now tracked per file rather than as a single shared slot, so interacting with one
  preview panel can no longer be silently redirected onto whichever file was rendered most
  recently in another panel.
* **Fixed**: a `<Window>`-rooted `.xaml` file's render target was closed immediately after
  capturing its preview frame, leaving nothing left to hit-test - selection/dragging now works
  for `<Window>`-rooted files, not just `<Grid>`/`<UserControl>`/etc. fragments.

## [1.4.0] - 2026-08-09

* **Standalone Debugging**: a new debug type, `dotnet-creator-debug` (`.NET (netcoredbg)`),
  backed by [netcoredbg](https://github.com/Samsung/netcoredbg) (MIT-licensed, Samsung) - real
  breakpoints, stepping, call stacks, and variable inspection via the Debug Adapter Protocol,
  without needing Microsoft's C# extension (whose `vsdbg` debugger is proprietary and
  license-locked to official Microsoft VS Code builds). `.NET: Set Up Debug/Build Tasks` now
  generates `launch.json` entries using this type by default instead of VS Code's `"dotnet"`
  type (which does nothing without that extension installed). Entirely opt-in: if netcoredbg
  isn't found, pressing F5 offers **Download netcoredbg** (checksum-verified against GitHub's
  own published digest for the release asset) or **Install Instructions** - nothing is ever
  installed automatically. Reachable via the Project status bar menu's new **Debugger
  Options...** entry.
* **Update Notifications**: both SharpLsp and netcoredbg now check once per day (after being
  resolved) for a newer release, showing a quiet, dismissible notice - never auto-switching.
  Addresses a bundled or previously-downloaded copy otherwise going stale with no signal to the
  user that a newer version exists.
* **Fixed**: "Download SharpLsp" previously only extracted the host binary from the release
  asset, never the C#/F# sidecar processes it depends on at runtime (they live in a separate
  `bin/all/` folder inside the release) - C#/F# analysis could silently fail to fully start for
  anyone who had already used the download path. The extension now extracts that folder too and
  points the sidecars at it explicitly via environment variables, matching what SharpLsp's own
  official extension does internally.
* **Changed**: SharpLsp is no longer built from a vendored copy of its source at packaging time
  * `tools/build-sharplsp.js` and the new `tools/build-netcoredbg.js` both now fetch each tool's
  official, checksum-verified release binary directly, matching exactly what the in-extension
  "Download" action already did. No local Rust/CMake/MSVC toolchain is required to package this
  extension, and no third-party source tree is vendored in this repository.

## [1.3.0] - 2026-08-09

* **NuGet Package Manager**: a dedicated panel (`.NET: Manage NuGet Packages`, or from the
  Project status bar item) with Browse (live NuGet.org search, resolved via NuGet's stable
  service index) and Installed tabs, package details with a version dropdown, and
  Install/Update/Remove actions. Requires .NET SDK 7.0.200 or later. Installed-tab rows show an
  update-available indicator.
* **Solution Explorer**: a dedicated activity bar view showing the current solution, its
  projects, each project's dependencies (NuGet packages, project references, detected
  analyzers/source generators) and real file/folder structure - matched precisely against
  ReSharper's own Solution Explorer, including code-behind/designer-file nesting (e.g.
  `MainWindow.xaml.cs` under `MainWindow.xaml`) and a pinned `Properties` folder. Full New
  File/Class/Folder, Add Existing File, Rename, Delete, Cut/Copy/Paste, Exclude/Include From
  Project, drag-and-drop move, Build/Rebuild/Clean/Run, Set as Startup Project, Remove from
  Solution, and sync-with-active-editor support. One independent section per folder in a
  multi-root workspace.
* **Per-folder state storage**: the current solution/project/build configuration now persist
  per workspace folder (`.vscode/dotnet-creator.state.json`) instead of a single shared bucket,
  so a multi-root workspace with different solutions per folder no longer cross-contaminates.
* **Optional C#/F# Language Server**: drives [SharpLsp](https://github.com/Nimblesite/SharpLsp)
  directly as a standard language server (diagnostics, completions, hover, go-to-definition,
  Outline/breadcrumbs, code folding) via the standard `vscode-languageclient` package - not
  SharpLsp's own VS Code extension, avoiding duplicate Solution Explorer/NuGet UI. Entirely
  opt-in: detects an install via a `dotnet-creator.sharpLsp.path` setting, the
  `SHARPLSP_EXECUTABLE_PATH` environment variable, or PATH; if none is found, offers a one-click
  **Download SharpLsp** (checksum-verified against SharpLsp's published hashes) or **Use Bundled
  SharpLsp** (a copy built from vendored source and shipped inside this extension's own package,
  Windows x64 only for now) alongside **Install Instructions** for building it yourself -
  nothing ever runs without an explicit choice. A new status bar item shows its state, with
  Restart/Show Output actions.

## [1.2.1] - 2026-08-09

* **`.csproj` picker**:
  * Split `pickCsprojFile` (always prompts) from `getPickedCsprojFile` (silent, reuses the
    last pick, only prompts the first time) - `launch.json`/`tasks.json` `"inputs"` should
    reference the latter so debugging doesn't re-prompt for a project on every single run.
  * Added `.NET: Change Debug Project` to the Command Palette (`pickCsprojFile`) as the
    explicit way to switch projects, with a "Recently Used" section (persisted per workspace)
    so switching in a larger solution doesn't mean scanning the full list every time.

## [1.2.0] - 2026-08-09

* **Start Page**:
  * Added a `.NET: Show Start Page` webview tab (modeled on VS Code's own Welcome page) with
    quick actions for New Project, Create Solution, Manage Solution Files, and a new
    `.NET: Open Existing Solution/Project` command.
  * Recent Solutions/Projects list, persisted across sessions, with click-to-reopen and
    per-item removal.
  * Auto-shows on launch when no folder is open, controlled by the new
    `dotnet-creator.showStartPageOnStartup` setting.
* **XAML Live Preview** (read-only; interactive editing is planned for a future release):
  * Added `.NET: Preview XAML (Live)`, rendering `.xaml` files inside a VS Code webview using
    genuine WPF output (an out-of-process helper renders via `XamlReader` and streams a PNG
    frame back over a named pipe) rather than an HTML/CSS approximation.
  * Re-renders automatically on every save.
  * Resolves the target project's built assembly so `clr-namespace:` references to its own
    converters/controls resolve correctly, including bare same-assembly references.
  * Merges the project's `App.xaml` `Application.Resources` so app-level styles/brushes/fonts
    are available when previewing a single window in isolation.
  * Supports both x86 and x64 target projects, auto-detected and launched accordingly.
  * Gracefully degrades on code-behind-dependent constructs (event handlers, command
    bindings) instead of failing the whole render.
  * Exposed via an editor title-bar button and context menus in the native Explorer, the
    editor, and (where installed) ReSharper's Solution Explorer.
* **New commands**:
  * `dotnet-creator.pickCsprojFile` — an internal-use command (not in the Command Palette)
    for referencing from a `.vscode/tasks.json` or `launch.json` `"inputs"` entry to pick a
    `.csproj` from the workspace, auto-accepting a single match.

## [1.1.0] - 2026-07-29

* **Security fix**:
  * Replaced shell-string `dotnet` invocations with `execFile`, eliminating a command
    injection vector via project name, package ID, and template selection.
* **New commands**:
  * Added `.NET: Create Solution` for creating a standalone, empty solution.
  * Implemented `.NET: Manage Solution Files`, which adds or permanently deletes
    solution-level scaffold files (`.gitignore`, `.editorconfig`, `NuGet.Config`,
    `global.json`, `.sln`/`.slnx`, etc.) in a chosen folder.
* **Create New Project changes**:
  * Filtered the template picker down to real project templates only
    (`dotnet new list --type project`), removing scaffold-file entries.
  * Replaced the old parent-folder-only `.sln` prompt with a choice to add the new project
    to an existing solution or a newly created one, determining where the project lives.
  * New solutions are created as `.slnx` by default.
  * Fixed template/short-name parsing for entries with multiple comma-separated short names
    (e.g. `webapp,razor`).
  * Added input validation for project names and NuGet package IDs.
  * Added a confirmation prompt before creating into a non-empty existing folder.

## [1.0.3] - 2026-07-29

* **Latest changes**:
  * Added additional extenstion metadata
  * Added a proper icon

## [1.0.1] - 2026-07-29

* **Stable Release**:
  * Finalized and refined UI wrapper for the official `.NET CLI`.
  * Robust dynamic template detection and parsing via `dotnet new list`.
  * Streamlined template installation flow to pull third-party or custom templates from NuGet using `dotnet new install`.
  * Polished interactive 4-step workflow covering template selection, project naming, destination folder picking, and workspace configuration.
  * Enhanced optional generation of `.NET` solution (`.sln`) files with automatic project linking (`dotnet sln add`).
  * Formally configured project licensing under the GNU General Public License v3.0 (GPLv3).

## [0.0.1] - 2026-07-29

* **Initial Release**:
  * Added a clean, lightweight UI wrapper for the official `.NET CLI`.
  * Implemented dynamic template detection and parsing via `dotnet new list`.
  * Added template installation flow to pull third-party or custom templates from NuGet using `dotnet new install`.
  * Introduced an interactive 4-step workflow covering template selection, project naming, destination folder picking, and workspace configuration.
  * Added optional generation of `.NET` solution (`.sln`) files with automatic project linking (`dotnet sln add`).
