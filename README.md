# .NET Studio

A clean, lightweight Visual Studio Code extension for generating C# and F# .NET projects directly inside VS Code.

Unlike the heavyweight C# Dev Kit, this extension purely acts as a UI wrapper for the official `.NET CLI`, allowing you to scaffold projects and solutions without unnecessary bloat.

## Features

* **Dynamic Template Loading:** Automatically detects and lists all available `.NET` project templates installed on your machine (`dotnet new list --type project`) — scaffold-only templates like `.gitignore` or `.editorconfig` are kept out of this list.
* **Install Templates from NuGet:** Download and install third-party or custom company templates directly via the extension UI.
* **Solution-Aware Project Creation:** A two-step visual wizard (**.NET: Create New Project**) — template gallery, then name and location — mirroring Visual Studio's own "Create a new project" flow. Optionally add your new project to an existing solution, or create a brand new one on the spot, as part of the same flow.
* **Standalone Solution Creation:** Create an empty `.slnx` solution on its own via **.NET: Create Solution**.
* **Solution Scaffold File Management:** Add or permanently delete solution-level scaffold files (`.gitignore`, `.editorconfig`, `NuGet.Config`, `global.json`, `.sln`/`.slnx`, etc.) in any folder via **.NET: Manage Solution Files**.
* **NuGet Package Manager:** A dedicated panel (**.NET: Manage NuGet Packages**, or from the Project status bar item) to browse NuGet.org, and install, update, or remove package references for a project — no typing exact package IDs required. Installed packages are also checked for known **vulnerabilities** (NuGetAudit, GitHub Advisory Database-backed) and **deprecation**, including transitive dependencies — flagged with a colored dot in the list and full advisory links/alternative-package suggestions in the details panel. Requires .NET SDK 7.0.200 or later.
* **Publish:** a Publish page (**Publish...** on a project's Solution Explorer context menu, or from the Project status bar item) listing your saved publish profiles with a read-only preview of the selected one's settings, plus **Publish**/**Edit**/**Rename**/**Delete**. Creating (**+ New Profile**) or editing (**Edit**) a profile's settings opens its own single-page form — a **Publish Target** dropdown (**Folder**, **Azure App Service**, **Container Registry**, **Web Server**, or **SFTP**, with a short description of what the selected one does and needs) sits right below the profile name, followed by target framework, framework-dependent vs. self-contained, target runtime, and (for Folder/Azure/SFTP) the single-file/ReadyToRun/trimming options that make sense for the selected mode, gated to when they'd actually do anything (single-file and self-contained specifically - the .NET SDK raises a real build error otherwise). The New and Edit forms are separate, purpose-built flows rather than one form wearing two hats: editing lets you freely rename the profile (its `.pubxml`/`.pubxml.user` and any stored credentials move with it), while creating always starts from a clean slate. Profiles are saved as real `Properties/PublishProfiles/<name>.pubxml` files, using Visual Studio's own schema where a matching VS target exists (Folder, Azure App Service via ZipDeploy, Web Server via Web Deploy), so they're fully interoperable with VS's own Publish UI rather than inventing a parallel profile format — Container Registry and SFTP have no VS equivalent to match (SFTP has never been a real Visual Studio publish target at all) and use this extension's own profile shape instead. Credentials are never written into the (typically source-controlled) `.pubxml`: Web Server's password lives in the sibling `<name>.pubxml.user`, exactly like real Visual Studio; Azure/Container Registry/SFTP credentials are stored in VS Code's own encrypted SecretStorage. Container Registry publishes via the .NET SDK's own built-in container support (`dotnet publish /t:PublishContainer`) — no Docker installation required. Web Server needs a local Web Deploy (`msdeploy.exe`) install, the same tool Visual Studio itself relies on for that target; Azure App Service instead uses Kudu's ZipDeploy endpoint (via an imported `.PublishSettings` file from the Azure Portal), needing no local tooling at all. Clicking **Publish** restores explicitly (with the profile's own `Configuration`/`RuntimeIdentifier`, so a self-contained/RID-specific publish always gets the right restored assets) and runs in a visible terminal for the targets that go through `dotnet publish`.
* **Test Explorer:** discovers and runs xUnit, NUnit, and MSTest tests via VS Code's native Testing view — no dependency on any language server. Drives `vstest.console.dll` (bundled with the .NET SDK) directly over its own design-mode protocol, the same one Visual Studio/Rider use, rather than parsing CLI text output — so each test resolves to its real source file and line, and results (including failure messages) stream in as they complete rather than only after the whole run finishes. Test projects are detected via the real `IsTestProject` MSBuild property, not filename conventions, and built (skipping the build entirely when already up to date) before every run. A **Run Tests with Coverage** profile (alongside the plain Run profile) collects line coverage via `coverlet.collector` — real per-line gutter highlighting in the editor, not just a summary percentage — offering to add the `coverlet.collector` NuGet reference automatically if a test project doesn't have it yet. Debugging an individual test isn't wired up yet — a planned follow-up.
* **Solution Explorer:** A dedicated activity bar view (its own icon, separate from the native Explorer) showing your solution, its projects, each project's dependencies (NuGet packages, project references, detected analyzers/source generators), and its real file/folder structure — with full New File/Class/Folder, Add Existing File, Rename, Delete, Cut/Copy/Paste, Exclude/Include From Project, drag-and-drop move, Build/Rebuild/Clean/Run, Set as Startup Project, Remove from Solution, Unload/Reload Project, and sync-with-active-editor support. **Manage NuGet Packages** is available directly on a project node, not just its Dependencies sub-node, and expanding a package shows the actual compile-time assembly file(s) it contributes. The project/solution files themselves aren't shown as ordinary loose files (redundant with the Project/Solution nodes) — **Edit Project File** / **Edit Solution File** context-menu commands open them directly instead. **Unload Project** genuinely excludes the project from `dotnet build` for a classic `.sln` solution (edits its build configuration directly, same as Visual Studio); for a `.slnx` solution it's UI-only (hidden from pickers, shown dimmed) since `.slnx` doesn't yet reliably support build exclusion. Stays in sync with the Solution status bar item, shows one independent section per folder in a multi-root workspace, and auto-refreshes if the `.sln`/`.slnx` file itself changes externally (another tool, another VS Code window, a hand edit). Does not show source generators' actual *generated* output files — that needs a real Roslyn/MSBuild hook, the same boundary as the language-server items below.
* **Build/Rebuild/Clean Keyboard Shortcuts:** `Ctrl+K B` / `Ctrl+K Shift+B` / `Ctrl+K C` for the current project, `Ctrl+K Ctrl+B` / `Ctrl+K Ctrl+Shift+B` / `Ctrl+K Ctrl+C` for the current solution — the same actions already available from the status bar's Build/Rebuild/Clean menu entries, now directly bindable.
* **XAML Live Preview (with select/move/resize):** **.NET: Preview XAML (Live)** renders `.xaml` files inside a VS Code webview using genuine WPF output — an out-of-process helper renders via `XamlReader` and streams a PNG frame back over a named pipe, not an HTML/CSS approximation — re-rendering automatically on every save, and resolving the target project's built assembly/App.xaml resources so `clr-namespace:` references and app-level styles resolve correctly. Click an element to select it (a real hit-test against the live visual tree), then drag it to move it or drag a resize handle to resize it — both are instant client-side while dragging, with the change written back into the real file (through VS Code's document API, never a raw filesystem write) on release. Canvas-parented elements get true `Canvas.Left`/`Canvas.Top` positioning; anything else gets an approximate `Margin` nudge. Refuses to commit a drag while the file has unsaved edits. Code-behind (event handlers, command bindings) isn't executed — this is a visual-tree preview, not a running app.
* **Optional C#/F# Language Server — choice of SharpLsp or Roslyn:** drives a real language server directly, without installing its own VS Code extension (which would duplicate this extension's own Solution Explorer/NuGet browser/profiler). Two options, switchable via **.NET: Switch Language Server** or the `dotnet-studio.languageServer` setting — both can be installed side by side, but only the selected one ever runs:
  * [**SharpLsp**](https://github.com/Nimblesite/SharpLsp) (MIT-licensed, Roslyn for C# + FSharp.Compiler.Service for F#) — the default, and the only option that supports F#.
  * **Roslyn Language Server** — Microsoft's own C# language server, the same binary C# Dev Kit uses internally, driven standalone here instead. Downloaded from Microsoft's own public feed, the same approach the `roslyn.nvim` Neovim plugin uses to drive it outside Visual Studio/C# Dev Kit.

  Either way you get diagnostics, completions, hover, go-to-definition, the Outline panel/breadcrumbs, and code folding. Entirely opt-in: if the selected server isn't found, opening a C#/F# file offers a one-click **Download** (checksum-verified against SharpLsp's own published hashes for SharpLsp; downloaded directly from Microsoft's official feed for Roslyn, which doesn't publish a checksum for this specific feed) or **Install Instructions** — nothing is ever installed automatically. A status bar item shows the active server's state, with Restart/Show Output actions.
* **Code Formatting (C# via CSharpier, F# via Fantomas):** this extension drives [CSharpier](https://csharpier.com/) and [Fantomas](https://fsprojects.github.io/fantomas/) directly, the same "no dependency on another VS Code extension" approach as everywhere else here. Both are plain `dotnet tool` global tools, not a downloaded binary release. Registered unconditionally as a real VS Code document formatter for `.cs`/`.fs` files (not just when a gap exists) — SharpLsp disables its own formatter entirely by design, while the Roslyn Language Server does format C# on its own via LSP, so with Roslyn selected two formatters are now registered for `.cs`; VS Code will prompt once to pick a default (or set `editor.defaultFormatter` yourself) rather than silently picking one. CSharpier is driven through its own persistent `server` mode (the same HTTP protocol its official VS Code extension uses) and Fantomas through its own `--daemon` JSON-RPC mode — not a slow one-shot CLI call per format. Entirely opt-in: if the tool isn't installed, formatting a file for the first time offers **Install** (`dotnet tool install -g csharpier`/`fantomas`) or **Install Instructions** — nothing is ever installed automatically.
* **Standalone Debugging (netcoredbg):** this extension's own debug type, **`.NET (netcoredbg)`**, backed by [netcoredbg](https://github.com/Samsung/netcoredbg) (MIT-licensed, Samsung) — real breakpoints, stepping, call stacks, and variable inspection via the Debug Adapter Protocol, without installing Microsoft's C# extension (whose `vsdbg` debugger is proprietary and license-locked to official Microsoft VS Code builds). **.NET: Set Up Debug/Build Tasks** generates `launch.json` entries using this type by default, scoped to the current workspace — set `dotnet-studio.useGlobalDebugTasks` to use one shared global configuration for every workspace instead, created automatically the first time it's needed. Entirely opt-in, same pattern as the language server: if netcoredbg isn't found, pressing F5 offers **Download netcoredbg** (checksum-verified against GitHub's own published digest for the release asset) or **Install Instructions** — nothing is ever installed automatically. Handles an x86 `PlatformTarget` project correctly (points the debug host at the 32-bit .NET runtime automatically), supports multiple concurrent debug sessions via F5 (each named after its actual project, not a generic label), and doesn't block F5 while another session is already running.
* **.NET Resource Monitor:** a panel showing a running debuggee's live CPU%/memory charts (OS-level, always available, no dependencies). When SharpLsp (above) is running, it also shows live GC heap/ThreadPool runtime counters and a title-bar **Start/Stop Recording Trace** action that records a CPU-sampling or Memory/GC EventPipe trace to a file via SharpLsp's own `dotnet-trace`/`dotnet-counters` integration — an explicit **Start SharpLsp** button appears in its place if SharpLsp isn't running yet, never started automatically just by opening the panel.
* **Update Notifications:** SharpLsp, the Roslyn Language Server, and netcoredbg all periodically (once per day) check for a newer release once resolved, and show a quiet, dismissible notice — never auto-switching — so a previously-downloaded copy doesn't silently go stale.
* **Self-Update via GitHub Releases:** .NET Studio checks its own [GitHub releases](https://github.com/Terongorus/dotnet-project-creator/releases) (not the VS Code Marketplace) once a day and offers to download and install the latest `.vsix` directly — **.NET: Check for Updates** triggers this on demand. GitHub Releases is this extension's actual distribution channel going forward.
* **Fast and Lightweight by Default:** every feature above is pure UI-to-CLI/filesystem bridging — no background processes unless you explicitly opt into the language server or debug adapter integrations.
* **Quiet Until You Ask:** the status bar, Resource Monitor panel, Solution Explorer, and F5/build keybindings stay off in a workspace until you've actually opened a project or solution through .NET Studio — via **Create New Project**, **Open Existing**, **Create Solution**, or a Start Page Recently Used pick. Just having a stray `.csproj`/`.sln` somewhere in the workspace (this extension's own repo included — its native XAML designer helper has one) isn't enough on its own, so .NET Studio doesn't compete with other tooling for status bar space or the F5 key in a workspace you never asked it to manage. Once a folder's been opened this way, it's remembered for next time.

## Requirements

You must have the official [.NET SDK](https://dotnet.microsoft.com/download) installed on your system and accessible in your system's `PATH`. .NET SDK 8.0 or later is recommended: debug session launching resolves the built assembly to run by asking MSBuild for the project's real output path, which correctly handles a custom `OutputPath`/`Directory.Build.props` setup on SDK 8+, and falls back to a best-effort `bin/` folder search (standard layouts only) on older SDKs.

If `dotnet` genuinely works in your terminal but .NET Studio still can't find it (build/publish/debug/test all fail as if the SDK weren't installed at all), set **`dotnet-studio.dotnetPath`** to the full path of your `dotnet` executable. This happens on a machine without admin rights, using a user-local SDK install that only your terminal has been manually redirected to - the VS Code Extension Host inherits the machine's own environment variables directly, not your terminal's, so it never sees that redirection even though every terminal command works fine.

## Looks Great With

This extension's UI (status bar, Solution Explorer, NuGet Manager, Start Page, Create New Project) is built
entirely on VS Code's own theme color variables, so it adapts automatically to whatever color
theme you're running — no configuration needed. Given the Visual Studio/Rider-inspired workflow
this extension goes for, it ships a built-in **JetBrains Rider Dark** color theme (Preferences:
Color Theme) — a fitting, purely cosmetic pairing if you want the look to match, based on
[edsulaiman/jetbrains-rider-dark-theme](https://github.com/edsulaiman/jetbrains-rider-dark-theme)
(MIT, see `THIRD-PARTY-NOTICES.md`).

## Usage

### Create New Project

Run **.NET: Create New Project** from the Command Palette (or the Start Page) to open a
two-step wizard, mirroring Visual Studio's own "Create a new project" flow:

1. **Choose a template** — search and filter by Language, Platform, and Project Type in a
   template gallery (matching Visual Studio's own filter row), each with a distinct icon for its
   project type. A **Recent project templates** rail (once you've created at least one project)
   lets you jump straight back to a template you've used before. Don't see what you need? Install
   a new template from NuGet without leaving the page.
2. **Configure your new project** — a 3-way selector switches between three forms matching Visual
   Studio's own layout for each case, with a live preview of the exact path the project will be
   created at:
   * **Standalone** — project name and a destination folder.
   * **New Solution** — project name, destination folder, and a solution name, plus a "Place
     solution and project in the same directory" toggle (off by default, matching VS, but
     remembers whatever you last set it to) — checked forces the solution name to match the
     project name and keeps them together in one folder; unchecked gives the project its own
     subfolder inside a dedicated solution folder, ready for more projects later.
   * **Existing Solution** — pick an existing `.sln`/`.slnx` file; its location and name are shown
     read-only and the project is added and linked to it automatically.

The wizard closes itself once the project is created.

### Create Solution

Run **.NET: Create Solution** to create an empty `.slnx` solution with no project, ready to have projects added to it later (via Create New Project or `dotnet sln add`).

### Manage Solution Files

Run **.NET: Manage Solution Files**, pick a folder, then choose to **add** scaffold files (`.gitignore`, `.editorconfig`, `NuGet.Config`, `global.json`, `Directory.Build.props`, solution files, etc.) or **permanently delete** the ones already present — deletion asks for confirmation first.

### Wiring Up Debug/Build for Multi-Project Solutions

VS Code's default `.NET` debug configurations hardcode a single project's output path, which breaks down once a solution has more than one runnable project — you either maintain a separate launch config per project, or hand-edit `program` every time you switch. This extension's project picker (and the status bar item next to it) exists to fix that: pick a project once, and every launch config / build task that references the picker resolves to the same project without asking again.

**The two commands involved, and why both exist:**

* `dotnet-studio.pickCsprojFile` — always shows a picker (with a "Recently Used" section). Exposed in the Command Palette as **.NET: Change Debug Project**, and behind the status bar item. This is the one you invoke *explicitly* to switch projects.
* `dotnet-studio.getPickedCsprojFile` — silent. Returns whatever `pickCsprojFile` last resolved to, and only shows a picker itself if nothing has been picked yet. **`launch.json` and `tasks.json` inputs should both call this one**, not `pickCsprojFile` — otherwise you get re-prompted on every single debug/build run instead of once.

This split exists because of a VS Code quirk: `${input:someId}` only resolves against the `"inputs"` array declared in the *same* JSON document. A `launch.json` input and a `tasks.json` input can never share one `${input:...}` id, even though both can call the same extension command — so each file needs its own `"inputs"` entry, both pointed at `getPickedCsprojFile`, to end up agreeing on the same project.

**Before** — a default single-project launch config:

```jsonc
{
    "name": ".NET Core Launch (console)",
    "type": "coreclr",
    "request": "launch",
    "preLaunchTask": "build",
    "program": "${workspaceFolder}/bin/Debug/<target-framework>/<project-name.dll>",
    "args": [],
    "cwd": "${workspaceFolder}",
    "stopAtEntry": false,
    "console": "internalConsole"
}
```

**After** — `launch.json`, using this extension's own `"dotnet-studio-debug"` type (backed by netcoredbg — see **Standalone Debugging** above) instead of a hardcoded `program` path. Unlike VS Code's built-in-looking `"dotnet"` type (actually contributed by Microsoft's C# extension, and non-functional without it), `dotnet-studio-debug` resolves the built assembly itself via `getPickedAssemblyPath` — which asks MSBuild directly for the project's real `TargetPath` (`dotnet msbuild -getProperty:TargetPath`) rather than guessing a filesystem location, so it's correct even for a custom `OutputPath`/`Directory.Build.props` build layout. `.NET Debug` and `.NET Release` each get their own input/preLaunchTask pair with a literal, hardcoded configuration, rather than sharing one — so picking "Release" always actually builds and launches Release regardless of whatever the status bar's configuration picker currently says:

```jsonc
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": ".NET Debug",
            "type": "dotnet-studio-debug",
            "request": "launch",
            "preLaunchTask": ".NET Build Project Hidden (Debug)",
            "program": "${input:pickAssemblyDebug}",
            "cwd": "${workspaceFolder}",
            "console": "internalConsole",
            "stopAtEntry": false,
            "presentation": { "hidden": false, "group": ".NET", "order": 1 },
            "args": [],
            "internalConsoleOptions": "neverOpen"
        },
        {
            "name": ".NET Release",
            "type": "dotnet-studio-debug",
            "request": "launch",
            "preLaunchTask": ".NET Build Project Hidden (Release)",
            "program": "${input:pickAssemblyRelease}",
            "cwd": "${workspaceFolder}",
            "console": "internalConsole",
            "stopAtEntry": false,
            "presentation": { "hidden": false, "group": ".NET", "order": 2 },
            "args": [],
            "internalConsoleOptions": "neverOpen"
        }
    ],
    "inputs": [
        {
            "id": "pickAssemblyDebug",
            "type": "command",
            "command": "dotnet-studio.getPickedAssemblyPath",
            "args": { "include": "**/*.csproj", "acceptIfOneFile": true, "configuration": "Debug" }
        },
        {
            "id": "pickAssemblyRelease",
            "type": "command",
            "command": "dotnet-studio.getPickedAssemblyPath",
            "args": { "include": "**/*.csproj", "acceptIfOneFile": true, "configuration": "Release" }
        }
    ]
}
```

`tasks.json` needs its own `"inputs"` entry for the same reason — a hidden build task per launch config above (each hardcoding its own `-c Debug`/`-c Release`, for the same reason as the split inputs), and general-purpose visible tasks for running a build on demand via **Tasks: Run Build Task**, which build whatever the status bar's configuration picker currently says via the silent `getCurrentConfiguration` command:

```jsonc
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": ".NET Build Solution",
            "type": "shell",
            "command": "dotnet",
            "args": ["build", "-c", "${input:currentConfiguration}"],
            "group": { "kind": "build", "isDefault": true },
            "presentation": { "hidden": false, "group": ".NET", "order": 3 },
            "problemMatcher": "$msCompile"
        },
        {
            "label": ".NET Build Project Hidden (Debug)",
            "type": "shell",
            "command": "dotnet",
            "args": ["build", "${input:selectedCsproj}", "-c", "Debug"],
            "group": { "kind": "build", "isDefault": true },
            "presentation": { "hidden": true },
            "problemMatcher": "$msCompile"
        },
        {
            "label": ".NET Build Project Hidden (Release)",
            "type": "shell",
            "command": "dotnet",
            "args": ["build", "${input:selectedCsproj}", "-c", "Release"],
            "group": { "kind": "build", "isDefault": true },
            "presentation": { "hidden": true },
            "problemMatcher": "$msCompile"
        },
        {
            "label": ".NET Build Project",
            "type": "shell",
            "command": "dotnet",
            "args": ["build", "${input:pickCsproj}", "-c", "${input:currentConfiguration}"],
            "group": { "kind": "build", "isDefault": true },
            "presentation": { "hidden": false, "group": ".NET", "order": 1 },
            "problemMatcher": "$msCompile"
        }
    ],
    "inputs": [
        {
            "id": "pickCsproj",
            "type": "command",
            "command": "dotnet-studio.getPickedCsprojFile",
            "args": { "include": "**/*.csproj", "acceptIfOneFile": true }
        },
        { "id": "selectedCsproj", "type": "command", "command": "dotnet-studio.getPickedCsprojFile" },
        { "id": "currentConfiguration", "type": "command", "command": "dotnet-studio.getCurrentConfiguration" }
    ]
}
```

`args` beyond `include`/`acceptIfOneFile` (e.g. a `fromWorkspace` flag carried over from other pickers) are accepted but ignored — this extension always searches the current workspace.

**Switching projects:** run **.NET: Change Debug Project** from the Command Palette, or click the project name in the status bar — either updates the stored selection, and the next F5 or build picks it up automatically with no further prompting.

## Delegated to the Optional Language Server

This extension provides the plumbing (see the **Optional C#/F# Language Server** feature above)
to drive **[SharpLsp](https://github.com/Nimblesite/SharpLsp)** (MIT licensed, editor-agnostic,
Roslyn for C# + FSharp.Compiler.Service for F#) directly, rather than building a Roslyn-hosting
language server of its own:

* **Code Analysis & Inspections**, **Navigation & Search**, **Code Completion / IntelliSense**,
  and **Code Refactoring** — provided by SharpLsp once it's installed (via the built-in
  **Download SharpLsp** action or your own `cargo install sharplsp`), to whatever extent SharpLsp
  itself implements each one. It's early (v0.18.0 as of writing, requires .NET SDK 10+) but
  actively developed, so coverage and polish will keep improving over time rather than being a
  mature drop-in for ReSharper/C# Dev Kit on day one.
* **Not code formatting** — SharpLsp disables its own document/range/on-type formatters by
  design (its own docs say "prefer CSharpier/Fantomas" instead; see
  [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md)). This extension provides formatting itself
  instead — see **Code Formatting** below.
* Deliberately not using SharpLsp's own VS Code extension: it ships its own Solution Explorer
  and profiler UI, which would overlap with this extension's own Solution Explorer and the
  Resource Monitor's SharpLsp-driven runtime diagnostics (see **Features** above) if both were
  installed - this extension drives SharpLsp's profiler backend directly instead.

## Known Issues

* If no templates are loading, ensure that your `.NET SDK` is installed properly and that the `dotnet` command is recognized in your terminal.
* See [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for verified limitations in the third-party language servers this extension drives (SharpLsp, Roslyn Language Server) - not bugs in this extension itself, but real, directly-tested gaps worth knowing about before relying on either.

## Credits

The optional C#/F# Language Server feature downloads and bundles
**[SharpLsp](https://github.com/Nimblesite/SharpLsp)** by **Christian Findlay** (MIT licensed).
The standalone debug adapter downloads and bundles
**[netcoredbg](https://github.com/Samsung/netcoredbg)** by **Samsung Electronics Co., LTD** (MIT
licensed). See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the full license text and
attribution for both.

## Author

Kaloyan Kolev

## License

This extension is licensed under the GNU General Public License v3.0 (GPLv3).
