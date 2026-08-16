# Change Log

All notable changes to the **.NET Studio** extension will be documented in this file.

## [1.21.3] - 2026-08-17

* **Corrected v1.21.2's design: New Profile and Edit Profile are separate windows again, but not
  the same page twice.** v1.21.2 replaced the original 2-step wizard (target-type card picker,
  then configure) with one single-page form used for both creating and editing. That went further
  than intended - the guided card-picker step was genuinely good UX for a first-time, unfamiliar
  choice among 5 target types, and shouldn't have been removed for profile creation. Now:
  * **+ New Profile** opens the original 2-step wizard (card grid step, then configure step)
    unchanged from v1.21.0/v1.21.1 - it never had the disabled-name-field bug in the first place,
    since that only ever applied to editing.
  * **Edit** opens the single-page form introduced in v1.21.2 - Publish Target as a plain dropdown
    (no separate step, since the type is already chosen and rarely changes), and the profile name
    is a normal editable field with real rename support (`.pubxml`/`.pubxml.user`/credentials all
    carry over to the new name).

## [1.21.2] - 2026-08-17

* **Publish Profile editing: the name field is no longer stuck disabled.** You can now rename a
  profile directly from **Edit** - it carries the `.pubxml`/`.pubxml.user` and any stored
  credentials over to the new name and removes the old files/entries, the same as using
  **Rename** on the Publish page itself, just without a separate step.
* **Removed the "Choose a publish target" step.** The 2-step wizard (pick a target type, then
  configure it) is now a single page: a **Publish Target** dropdown sits right below the profile
  name, with the same short description of what the selected type does shown underneath it. No
  more Back/Next - just Save and Cancel.
* **New Profile and Edit Profile are now separate flows**, not one form reused with an
  "editing?" flag - each has its own panel and message handling. New always starts from a clean
  slate; Edit is the only one of the two that needs to think about renaming.

## [1.21.1] - 2026-08-17

* **Publish page: fixed the Edit/Rename/Delete buttons sitting right next to each other with no
  padding** - real misclick risk, especially next to **Delete**. They now have proper hit-target
  padding and a visible gap; **Delete** also gets a divider before it and its own red/danger
  styling so it's both harder to hit by accident and unmistakable when focused.

## [1.21.0] - 2026-08-16

* **Publish is now two separate windows instead of one.** Previously the Publish panel mixed the
  profile list, an always-editable form, and profile creation into a single page. Now:
  * The **Publish page** (same entry points as before - Solution Explorer, Project status bar,
    Command Palette) lists your saved profiles and shows a **read-only preview** of the selected
    one's settings, with **Publish**/**Edit**/**Rename**/**Delete** actions.
  * A separate **Publish Profile wizard** (opened via **+ New Profile** or **Edit**) handles actual
    configuration - a 2-step flow mirroring this extension's own Create New Project wizard: step 1
    picks the target type from a card per option, each with a short description of what it does
    and what it needs; step 2 configures that profile's details. Editing pre-populates the wizard
    and jumps straight to step 2.

  This is a UI-layer restructuring only - the underlying profile model, `.pubxml`/`.pubxml.user`
  I/O, credential storage, and all 5 publish executors (shipped in v1.20.0) are unchanged.

## [1.20.0] - 2026-08-16

* **Four new Publish targets: Azure App Service, Container Registry, Web Server, and SFTP** -
  the Publish panel previously supported Folder only. Creating a new profile now starts with a
  target-type picker; each type gets its own configuration fields alongside the existing
  target framework/deployment mode/runtime controls.
  * **Azure App Service** publishes via Kudu's ZipDeploy endpoint (the same mechanism Visual
    Studio itself offers as an alternative to Web Deploy) - no local tooling required. Use
    **Import Publish Settings...** to load a `.PublishSettings` file downloaded from the Azure
    Portal (App Service → Overview → Get publish profile), the same file real Visual Studio's own
    "Import publish settings" flow consumes.
  * **Container Registry** publishes via the .NET SDK's own built-in container support
    (`dotnet publish /t:PublishContainer`) - genuinely no Docker installation needed, even to push
    to a remote registry.
  * **Web Server** publishes via Web Deploy, exactly like Visual Studio's own Web Server target -
    requires a local Web Deploy (`msdeploy.exe`) install, detected the same way this extension
    already detects netcoredbg/SharpLsp/Roslyn, with an "Install Instructions" prompt if it's
    missing. New setting: `dotnet-studio.webDeploy.path`.
  * **SFTP** is a .NET Studio-original addition, not Visual Studio parity - confirmed via research
    that Visual Studio has never actually shipped an SFTP publish target (only an open,
    unimplemented feature request). Publishes the same local `dotnet publish` output Folder
    profiles produce, then uploads it over SFTP.

  Profiles remain real `Properties/PublishProfiles/<name>.pubxml` files, using Visual Studio's own
  schema for the two targets that have a real VS equivalent (Azure App Service, Web Server) so
  they stay interoperable with VS's own Publish UI - Container Registry and SFTP have no VS schema
  to match and use this extension's own profile shape. Credentials are never written into the
  (typically source-controlled) `.pubxml` itself: Web Server's password lives in the sibling
  `<name>.pubxml.user` file, exactly matching real Visual Studio's own convention; Azure/Container
  Registry/SFTP credentials go through VS Code's own encrypted SecretStorage instead (this
  extension's first use of it - no prior feature here needed credential storage).

## [1.19.1] - 2026-08-15

* **Publish panel Advanced section cleanup.** Removed the "Include all content in single file"
  checkbox - a legacy option the .NET SDK itself has deprecated, so it no longer belongs as a
  first-class control. An existing profile that already has it set (from before this change, or
  authored by real Visual Studio) still round-trips through Save Profile unchanged - it's just no
  longer settable from this UI. Reordered the remaining Advanced checkboxes to
  Produce single file → Enable ReadyToRun compilation → Compress single file → Trim unused
  assemblies, and dropped the "(requires self-contained)" note from Compress single file's label
  (the checkbox already disables itself when that requirement isn't met).

## [1.19.0] - 2026-08-15

* **The status bar, Resource Monitor, Solution Explorer, and F5/build keybindings no longer
  activate in a workspace just because a `.csproj`/`.sln` happens to exist in it somewhere.**
  Previously these were gated only by `hasAnyDotnetProject()` (or, for the status bar and
  Resource Monitor, not gated at all) - a cheap "does a project file exist anywhere" scan that
  activated .NET Studio's own UI even in workspaces you never asked it to touch. This extension's
  own repository was a real example: its `designer-host/DesignerHost.csproj` (a native sub-tool,
  not something you'd ever build/debug directly) was enough to auto-select itself as "the"
  project and light up the status bar, Resource Monitor panel, and F5 - despite this being a
  TypeScript codebase with no other .NET involvement.

  Everything now requires a real, explicit open action first: **Open Existing**, **Create New
  Project**, **Create Solution**, or picking an item from the Start Page's Recently Used list.
  The existing "auto-pick the sole project" convenience (when a folder has exactly one
  unambiguous `.csproj`) still works in the background for build/run resolution, but no longer by
  itself turns any of this UI on - it's not the same thing as you having actually asked .NET
  Studio to do something in this folder. Once a folder has been explicitly opened once, this is
  remembered permanently (same per-folder `.vscode/dotnet-studio.state.json` used for the current
  project/solution), so this is a one-time thing per folder, not a repeated prompt.

  Along the way, found and fixed a real, separate bug: the v1.17.0 `dotnet-creator.` →
  `dotnet-studio.` prefix rename changed this same per-folder state file's name but never migrated
  existing `.vscode/dotnet-creator.state.json` files forward, so every previously-tracked current
  project/solution silently reverted to "nothing selected" after upgrading. Fixed with a one-time
  forward migration (old file is read once, copied to the new filename, and left in place
  untouched) - the same shape as `legacyPrefixMigration.ts` already used for settings/commands.

  Note for anyone who had already picked a project/solution before this version: that pick is
  migrated forward by the fix above, but (deliberately, since the old data doesn't distinguish an
  explicit pick from the auto-pick convenience) isn't automatically counted as "explicitly
  opened" - the status bar/Resource Monitor/Solution Explorer/F5 will stay quiet once, until you
  reopen that folder's project/solution through one of the explicit actions above.

  Verified against the real compiled output (not just type-checked): a Node harness drives the
  real `folderState`/`currentSolution`/`projectPicker`/`openTarget`/`projectOpened` modules
  end-to-end, covering the legacy state-file migration (including that it does *not* grant the
  new flag), both branches of opening a project/solution (an already-open workspace folder vs. one
  that needs a real `vscode.openFolder` switch), the exact ordering guarantee that the new
  "explicitly opened" flag is set before the change events that recompute visibility fire (so
  nothing observes a stale value), and the visibility-gating helpers themselves.

## [1.18.0] - 2026-08-15

* **"Create New Project" is now a visual, two-step wizard instead of a chain of Command Palette
  prompts.** Mirrors Visual Studio's own "Create a new project" flow: a searchable template
  gallery filterable by Language, Platform, and Project Type (matching VS's own 3-dropdown row),
  then a "Configure your new project" page with a labeled 3-way pill selector - a standalone
  segmented control, not a tab strip physically attached to the panel below it - switching between
  three purpose-built forms matching Visual Studio's own layout for each case, rather than one
  generic form:
  * **Standalone** - just a project name and a Location field.
  * **New Solution** - project name, Location, Solution name, and a **"Place solution and project
    in the same directory"** toggle, unchecked by default (matching VS's own default - not
    checked) but persisted afterward, same as VS: whichever way you last left it is how the wizard
    opens next time, not reset to the default. Checked forces Solution name to track the project
    name and disables it (a single-project solution takes the project's own name, matching VS);
    unchecked makes it independently editable again and gives the project its own subfolder inside
    a dedicated solution folder, ready for more projects later.
  * **Existing Solution** - pick a `.sln`/`.slnx` file via a Browse button next to the Location
    field itself (previously a separate, redundant "Solution" row showing the same path twice);
    Location and Solution name are then shown read-only (inherited from the picked solution,
    matching VS) and only the project name is editable.

  The Project name and Solution name fields now consistently fill the available width instead of
  Solution name rendering at its cramped default browser size.

  A live preview at the bottom always shows the exact path the project will be created at. Nothing
  is created until the final Create click - picking "New Solution" no longer eagerly creates the
  `.slnx` the moment you choose a location; the solution and project are now created together in
  one atomic step, exactly mirroring when Visual Studio's own dialog actually touches disk. Reuses
  the same `dotnet new`/`dotnet sln add`/`dotnet new sln` calls and the same native
  `pickExistingSolution` file picker the original flow used - only the front end and the ordering
  of *when* things get created changed, not the underlying CLI commands. The panel disposes itself
  automatically once creation succeeds, and stays open (with the failure surfaced inline) if it
  doesn't, so a failed attempt can be corrected without restarting the wizard.

  Each template row shows its real tags (e.g. `MAUI · Android · iOS · macOS · Windows`) and a
  distinct per-type [Codicon](https://github.com/microsoft/vscode-codicons) icon (the same icon
  set VS Code's own Explorer/Extensions view uses) - `terminal` for Console, `library` for Class
  Library, `beaker` for MSTest/NUnit/xUnit, `window` for WinForms vs. `layout` for WPF, `globe` for
  Web/Blazor, `radio-tower` for gRPC, `device-mobile` for MAUI/Android/iOS, and so on - not just an
  identical colored circle. `dotnet new list`'s `Language` column is bracket-wrapped and often
  multi-valued (`[C#],F#,VB`) and its `Tags` column is a flat `/`-joined list
  (`Web/gRPC/API/Service`) with no built-in platform/type split; a new `classifyTemplate()` parses
  both properly and splits Tags into Platform vs. Project Type using a fixed vocabulary of real
  platform names (sourced from Visual Studio's own Platform dropdown -
  Android/Azure/iOS/Linux/macOS/tvOS/Windows/Xbox - plus Mac Catalyst/Tizen, confirmed present in
  real CLI output), with a manual override for WinForms/WPF specifically since `dotnet new list`
  doesn't tag those as Windows-only despite them being unambiguously so. Since that vocabulary is
  necessarily hand-maintained, not derived from real per-template platform metadata (the CLI
  doesn't expose that), template tags that don't match a known platform word and land in the
  Project Type bucket are logged once per session to a new **.NET Studio: Create New Project**
  output channel the first time they're seen, so a genuinely new platform word (e.g. from a
  workload installed later) surfaces instead of silently blending in unnoticed.

  A **Recent project templates** rail (also matching Visual Studio's dialog) appears to the left
  of the gallery once at least one project has been created through the wizard, letting you jump
  straight back to a template you've used before instead of re-searching for it; it re-resolves
  against the live template list each time, so a since-uninstalled template just quietly drops out
  rather than showing a dead entry. The gallery itself is a scrollable list of full-width rows
  (matching VS's actual dialog layout), not a card grid. Once a Language filter is active, each
  row shows only the filtered language instead of the template's full language list, so a
  C#-filtered view doesn't read as if F#/VB support is still being advertised back at you.

  Verified against the real compiled panel module (not just type-checked): a message-flow harness
  drives `ready` → `templates`, `validateName`, `browseFolder` → a real `showOpenDialog` call, all
  three `create` variants (standalone, new-solution with both `placeTogether` settings, and
  existing-solution), the unfamiliar-tag logger (fires once per new tag, not on repeat loads), the
  recent-templates round trip (a successful create records a recent entry, newest first, surfaced
  back on the next `templates` load), and the `placeTogether` preference round trip (defaults to
  `false`, persists to `globalState` on change, and a genuinely fresh panel instance sees the
  persisted value rather than the default) - asserting the exact `dotnet` CLI arguments and their
  call order (`sln new` before `dotnet new` before `sln add` for the new-solution case), the
  recent-items entry, and that the panel disposes on success but stays open when the user declines
  the overwrite-confirmation warning. `classifyTemplate()` itself has real unit tests
  (`src/test/templateClassification.test.ts`) covering bracket/multi-language parsing and the real
  MAUI/ASP.NET Core/WinForms tag shapes pulled from an actual `dotnet new list --type project`
  run, not synthetic data, plus a real classifier pass against this machine's full 39-template
  installed set as an end-to-end sanity check. `recentTemplates.ts` has its own unit tests
  (`src/test/recentTemplates.test.ts`) mirroring the existing `recentItems.ts` coverage. The
  generated webview script was checked for syntax validity; its Windows path-separator,
  tag-separator (·), and (new) solution-name-from-filename/path-split regex escaping were each
  traced through the Node-side template literal and the browser-side string/regex literal parsing
  to confirm they render correctly rather than as literal escape text or a doubled/dropped
  character; and the Configure page's live path-preview logic (`locationDisplay()`) was extracted
  from the real compiled output and executed directly against all four mode branches, matching the
  exact same folder math the create step itself uses.

## [1.17.0] - 2026-08-15

* **Renamed the `dotnet-creator.` command/settings prefix to `dotnet-studio.`.** The extension's
  display name was corrected to ".NET Studio" a while back, but every command id, setting key,
  keybinding, and the debug type itself were still registered under the old `dotnet-creator.`
  name from before that rebrand. All ~150 identifiers across commands, settings, views, and the
  debug type are renamed - e.g. `dotnet-creator.newProject` is now `dotnet-studio.newProject`,
  `dotnet-creator.dotnetPath` is now `dotnet-studio.dotnetPath`.

  Existing setups keep working automatically, not just via documentation:
  * **Settings**: on first activation after upgrading, any value explicitly set under the old
    `dotnet-creator.*` prefix (Global or Workspace scope) is copied to the new `dotnet-studio.*`
    key and the old one cleared - a one-time migration, not a permanent dual-setting.
  * **Commands**: every real `dotnet-studio.*` command also gets a forwarding alias registered
    under its old `dotnet-creator.*` id, so a `keybindings.json` entry or a generated
    `tasks.json`/`launch.json` `"input"` block written before this rename keeps working rather
    than failing with "command not found." Built by enumerating the actual registered command
    list at activation, not a hand-maintained one.
  * **Debug type**: `"type": "dotnet-creator-debug"` in an already-generated `launch.json` still
    resolves to the same debug adapter as the new `dotnet-studio-debug` type, so existing debug
    configurations don't need to be regenerated.

  View layout (Solution Explorer/Resource Monitor panel position/size) resets once, since VS Code
  ties that state to the view id itself and there's no view-id aliasing mechanism - cosmetic only,
  not a functional break.

  Verified against the real compiled migration/aliasing modules before shipping: simulated a user
  with settings under the old prefix and commands already registered, confirmed values moved to
  the new keys with the old ones cleared, and that invoking an old command id actually reached the
  new implementation - not just that the code compiled.

## [1.16.0] - 2026-08-15

* **New: `dotnet-creator.dotnetPath` setting.** A specific `dotnet` executable to use for every
  dotnet CLI invocation this extension makes - build/restore/publish, NuGet, Test Explorer, and
  debug launches - instead of resolving `dotnet` from `PATH`. Fixes a real class of failure: the
  VS Code Extension Host inherits the machine's own environment variables directly, unlike an
  integrated terminal, so a user-local SDK install that only a terminal has been manually
  redirected to (a real scenario on a machine without admin rights, where a system-wide install
  under `Program Files` isn't possible) stays completely invisible to the Extension Host even
  though every terminal command resolves `dotnet` correctly. Previously this override only existed
  as `dotnet-creator.sharpLsp.dotnetPath`, scoped to the SharpLsp sidecar alone - removed in favor
  of this one extension-wide setting, since nothing else about SharpLsp's dotnet needs differ from
  anywhere else in the extension.

  The debug launch path (`buildActions.ts`) needed its own explicit fix beyond the shared
  `runDotnet()` helper - netcoredbg launches the actual debuggee using its own inherited
  environment, not through `runDotnet()` at all, so it was silently exempt from every other
  dotnet-resolution fix already in the extension until now.

  Verified against the real compiled resolver and `runDotnet()` before shipping: pointed the
  setting at a real (different) `dotnet.exe` path and confirmed both the resolved command and a
  live `dotnet --version` invocation actually used it, not just that the code compiled.

## [1.15.1] - 2026-08-15

* **New: two more single-file publish options.** The Publish panel's Advanced section now offers
  **Compress single file** (`EnableCompressionInSingleFile`) and **Include all content in single
  file** (`IncludeAllContentForSelfExtract`, flagged as legacy - the .NET SDK itself emits a
  deprecation warning for it). Both are only ever read by the SDK inside its single-file bundling
  step (confirmed against `Microsoft.NET.Publish.targets` directly) - a no-op without **Produce
  single file** enabled, so both are disabled/unchecked in the UI until then; compression is
  further gated on **Self-Contained**, since the SDK raises a real build error
  (`CompressionInSingleFileRequiresSelfContained`) otherwise rather than silently ignoring it.

  Verified against a real `dotnet publish` run before shipping: a self-contained single-file
  publish with compression enabled produced a 37.6 MB executable versus 73.5 MB uncompressed for
  the identical app - roughly half the size, not just a flag that compiles.

## [1.15.0] - 2026-08-15

* **New: Code Formatting.** Drives [CSharpier](https://csharpier.com/) (C#) and
  [Fantomas](https://fsprojects.github.io/fantomas/) (F#) directly - both plain `dotnet tool`
  global tools, not a downloaded binary release - registered as real VS Code document formatters,
  so **Format Document** and `editor.formatOnSave` both work. CSharpier is driven through its own
  persistent `server` mode (the same HTTP protocol its official VS Code extension uses, confirmed
  against that extension's real source) and Fantomas through its own `--daemon` JSON-RPC mode
  (confirmed to interoperate with `vscode-jsonrpc` against a real spawned daemon) - not a slow
  one-shot CLI call per format. Entirely opt-in: formatting a file for the first time when the
  tool isn't installed offers **Install** (`dotnet tool install -g csharpier`/`fantomas`) or
  **Install Instructions**, the same pattern as every other optional tool this extension drives.

  Registered unconditionally, regardless of which language server is selected. SharpLsp disables
  its own formatter entirely by design; the Roslyn Language Server, confirmed via a real
  `initialize` handshake against the actual installed binary, *does* format C# on its own via LSP,
  so with Roslyn selected, two formatters are now registered for `.cs` files, and VS Code will
  prompt once to pick a default (or set `editor.defaultFormatter` yourself) rather than silently
  picking one.

* **Fixed: Resource Monitor panel doesn't focus when a debug session starts.** Starting one of
  this extension's own debug sessions now reveals/focuses the Resource Monitor panel tab
  automatically, scoped to this extension's own debug type only - starting an unrelated debug
  session (a different extension entirely) no longer steals focus to a panel that has nothing to
  show for it.

* **Fixed: README overclaimed SharpLsp's formatting support.** Corrected "C#-aware Code
  Formatting" (SharpLsp disables its own formatter by design) - superseded by the new Code
  Formatting feature above, which fills the gap directly rather than just disclaiming it. Also
  removed a stale Roadmap entry still listing Test Explorer as "planned, not yet started" a full
  two releases after it shipped.

## [1.14.0] - 2026-08-12

* **New: Code Coverage.** A **Run Tests with Coverage** profile alongside Test Explorer's plain
  Run profile - collects real per-line coverage via `coverlet.collector` and highlights it in the
  editor gutter (not just a summary percentage), using VS Code's native
  `TestRunProfileKind.Coverage`/`FileCoverage.fromDetails` API. Offers to add the
  `coverlet.collector` NuGet reference automatically if a test project doesn't have it yet -
  nothing installs without an explicit confirmation, the same pattern already used for
  SharpLsp/netcoredbg downloads.

  Verified end-to-end against a real coverage run before shipping, which surfaced a real,
  undocumented requirement: unlike a test adapter, `coverlet.collector.dll` is **not** copied into
  a test project's own build output, so a design-mode session needs an explicit
  `TestAdaptersPaths` (resolved from the project's own `obj/project.assets.json`, not hardcoded)
  pointing at the collector's NuGet package folder - omitting it silently produces zero coverage
  data with no error at all.

* **Fixed: a real bug in the Test Explorer shipped in 1.13.0** - `vstest.console` was spawned
  without an explicit working directory, so it silently inherited the extension host's own cwd
  rather than the test project's directory. Harmless for plain test runs, but any data collector's
  default output location (most notably coverage's own `TestResults/` folder) would land in the
  wrong place entirely - caught during this release's own verification, where it left a stray
  `TestResults/` folder in this very repo.

## [1.13.0] - 2026-08-12

* **New: Test Explorer.** Discovers and runs xUnit, NUnit, and MSTest tests via VS Code's native
  Testing view. Drives `vstest.console.dll` (bundled with the .NET SDK) directly over its own
  design-mode protocol - the same JSON-RPC-over-socket protocol Visual Studio/Rider use - rather
  than parsing `dotnet test`'s human-readable CLI output, which has no reliable file/line mapping.
  Each test resolves to its real source file and line; results (including failure messages) stream
  in as they complete, not only after the whole run finishes. Test projects are found via the real
  `IsTestProject` MSBuild property (what `Microsoft.NET.Test.Sdk` itself sets), not filename
  conventions, and built - skipping the build when already up to date, same as every other build
  path in this extension - before every run.

  The wire protocol (a 7-bit-encoded length-prefix framing with no off-the-shelf Node.js
  equivalent) was verified against a real `vstest.console` process before writing the extension
  code: real discovery and execution against real xUnit and NUnit projects, including a genuine
  server-side crash found and fixed along the way (`TestExecution.RunSelectedWithDefaultHost`
  needs an explicit `Sources` array, not just `TestCases` - omitting it crashes vstest.console's
  own source-detection with a null-key exception in a fresh session).

  Debugging an individual test isn't wired up yet - a deliberate, scoped-out follow-up, not an
  oversight.

## [1.12.0] - 2026-08-12

* **New: NuGet vulnerability and deprecated-package scanning.** The NuGet Package Manager now
  checks every installed package (including transitive dependencies) against
  `dotnet list package --vulnerable`/`--deprecated` (NuGetAudit, GitHub Advisory Database-backed)
  alongside the existing outdated-version check. Vulnerable packages show a red dot in the list
  and a severity + advisory link in the details panel; deprecated packages show an amber dot and
  the deprecation reason, plus a suggested alternative package when NuGet publishes one. Verified
  against real advisory data (a known-vulnerable `Newtonsoft.Json 6.0.1` and a known-deprecated
  `Microsoft.Net.Compilers`), not just the documented JSON schema.

## [1.11.0] - 2026-08-12

* **New: Publish.** An interactive Publish panel (**Publish...** on a project's Solution Explorer
  context menu, or from the Project status bar item) for creating and managing folder publish
  profiles - target framework, framework-dependent vs. self-contained, target runtime, target
  location, and single-file/ReadyToRun/trimming options. Profiles are saved as real
  `Properties/PublishProfiles/<name>.pubxml` files matching Visual Studio's own schema exactly
  (verified via a byte-for-byte round-trip and a real `dotnet publish -p:PublishProfile=` run
  against the generated file), so they're fully interoperable with VS's own Publish UI rather than
  a parallel, extension-specific format. Publishing restores explicitly first (with the profile's
  own `Configuration`/`RuntimeIdentifier`) before running `--no-restore` publish, the same fix
  applied to Build/Rebuild in 1.10.13. Folder targets only - no Azure/IIS/container publish yet.
* **New: built-in "JetBrains Rider Dark" color theme**, based on
  [edsulaiman/jetbrains-rider-dark-theme](https://github.com/edsulaiman/jetbrains-rider-dark-theme)
  (MIT) - previously only recommended as a separate marketplace install, now bundled directly
  (Preferences: Color Theme).

## [1.10.13] - 2026-08-12

* **Fixed: Release builds could fail with `NETSDK1047` for projects setting `<RuntimeIdentifier>`
  (or other properties) inside a `Configuration`-conditional `PropertyGroup`.** `dotnet build`'s
  own implicit restore doesn't reliably see Configuration-conditional MSBuild properties - it can
  restore against the wrong (default) branch of the condition, leaving `project.assets.json`
  without the target the build actually needs (e.g. `net10.0/win-x86`) and failing later with
  `NETSDK1047`, even though the project itself is fine. Every build path this extension drives
  (the Build/Rebuild status bar actions, F5's own build-then-launch, and the generated
  `tasks.json` build tasks from ".NET: Set Up Debug/Build Tasks") now runs an explicit
  `dotnet restore -p:Configuration=<config>` first, then builds with `--no-restore` against that
  known-good restore - reported by a real user's build against a Release-only
  `<RuntimeIdentifier>win-x86</RuntimeIdentifier>`.

## [1.10.12] - 2026-08-12

* **New: `KNOWN-LIMITATIONS.md`, documenting verified (not guessed) limitations in the third-party
  language servers this extension drives.** Covers Roslyn Language Server's project/solution
  loading currently failing on at least some Windows environments across every loading path
  tested (`solution/open` for both `.slnx` and classic `.sln`, and `project/open`, independent of
  file format, project count, or Roslyn version) with no reliable client-side workaround found;
  Roslyn having no `dotnet-trace`/`dotnet-counters`/`dotnet-dump` integration at all (a permanent
  feature gap, not a bug); and SharpLsp's trace recording failing with `invalid type: map,
  expected u32`, root-caused as a likely genuine upstream SharpLsp bug. Linked from README's Known
  Issues section.

## [1.10.11] - 2026-08-12

* **Diagnostics: "Start Trace Recording" logs the exact request/error to the ".NET Language
  Server" output channel.** Investigating a real report of `Failed to start trace recording:
  invalid type: map, expected u32` - verified directly against SharpLsp's own real Rust source
  (fetched at the exact `v0.18.0` tag) that the request this extension sends already matches the
  server's `StartTraceParams` struct field-for-field, so the mismatch isn't visible from reading
  either side's source alone. This isn't the fix yet - it's the instrumentation needed to catch
  the actual wire payload on the next reproduction, since the failure only reveals itself once a
  real trace-start request round-trips against a real SharpLsp server.

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
