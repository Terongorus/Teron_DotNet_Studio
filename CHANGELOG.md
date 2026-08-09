# Change Log

All notable changes to the **.NET Project Creator** extension will be documented in this file.

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
  - `tools/build-sharplsp.js` and the new `tools/build-netcoredbg.js` both now fetch each tool's
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
