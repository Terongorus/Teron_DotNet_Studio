# .NET Project Creator

A clean, lightweight Visual Studio Code extension for generating C# and F# .NET projects directly from the command palette.

Unlike the heavyweight C# Dev Kit, this extension purely acts as a UI wrapper for the official `.NET CLI`, allowing you to scaffold projects and solutions without unnecessary bloat.

## Features

* **Dynamic Template Loading:** Automatically detects and lists all available `.NET` project templates installed on your machine (`dotnet new list --type project`) — scaffold-only templates like `.gitignore` or `.editorconfig` are kept out of this list.
* **Install Templates from NuGet:** Download and install third-party or custom company templates directly via the extension UI.
* **Solution-Aware Project Creation:** Optionally add your new project to an existing solution, or create a brand new one on the spot, as part of the project creation flow.
* **Standalone Solution Creation:** Create an empty `.slnx` solution on its own via **.NET: Create Solution**.
* **Solution Scaffold File Management:** Add or permanently delete solution-level scaffold files (`.gitignore`, `.editorconfig`, `NuGet.Config`, `global.json`, `.sln`/`.slnx`, etc.) in any folder via **.NET: Manage Solution Files**.
* **NuGet Package Manager:** A dedicated panel (**.NET: Manage NuGet Packages**, or from the Project status bar item) to browse NuGet.org, and install, update, or remove package references for a project — no typing exact package IDs required. Requires .NET SDK 7.0.200 or later.
* **Solution Explorer:** A dedicated activity bar view (its own icon, separate from the native Explorer) showing your solution, its projects, each project's dependencies (NuGet packages, project references, detected analyzers/source generators), and its real file/folder structure — with full New File/Class/Folder, Add Existing File, Rename, Delete, Cut/Copy/Paste, Exclude/Include From Project, drag-and-drop move, Build/Rebuild/Clean/Run, Set as Startup Project, Remove from Solution, Unload/Reload Project, and sync-with-active-editor support. **Manage NuGet Packages** is available directly on a project node, not just its Dependencies sub-node, and expanding a package shows the actual compile-time assembly file(s) it contributes. The project/solution files themselves aren't shown as ordinary loose files (redundant with the Project/Solution nodes) — **Edit Project File** / **Edit Solution File** context-menu commands open them directly instead. **Unload Project** genuinely excludes the project from `dotnet build` for a classic `.sln` solution (edits its build configuration directly, same as Visual Studio); for a `.slnx` solution it's UI-only (hidden from pickers, shown dimmed) since `.slnx` doesn't yet reliably support build exclusion. Stays in sync with the Solution status bar item, shows one independent section per folder in a multi-root workspace, and auto-refreshes if the `.sln`/`.slnx` file itself changes externally (another tool, another VS Code window, a hand edit). Does not show source generators' actual *generated* output files — that needs a real Roslyn/MSBuild hook, the same boundary as the language-server items below.
* **Build/Rebuild/Clean Keyboard Shortcuts:** `Ctrl+K B` / `Ctrl+K Shift+B` / `Ctrl+K C` for the current project, `Ctrl+K Ctrl+B` / `Ctrl+K Ctrl+Shift+B` / `Ctrl+K Ctrl+C` for the current solution — the same actions already available from the status bar's Build/Rebuild/Clean menu entries, now directly bindable.
* **XAML Live Preview (with select/move/resize):** **.NET: Preview XAML (Live)** renders `.xaml` files inside a VS Code webview using genuine WPF output — an out-of-process helper renders via `XamlReader` and streams a PNG frame back over a named pipe, not an HTML/CSS approximation — re-rendering automatically on every save, and resolving the target project's built assembly/App.xaml resources so `clr-namespace:` references and app-level styles resolve correctly. Click an element to select it (a real hit-test against the live visual tree), then drag it to move it or drag a resize handle to resize it — both are instant client-side while dragging, with the change written back into the real file (through VS Code's document API, never a raw filesystem write) on release. Canvas-parented elements get true `Canvas.Left`/`Canvas.Top` positioning; anything else gets an approximate `Margin` nudge. Refuses to commit a drag while the file has unsaved edits. Code-behind (event handlers, command bindings) isn't executed — this is a visual-tree preview, not a running app.
* **Optional C#/F# Language Server — choice of SharpLsp or Roslyn:** drives a real language server directly, without installing its own VS Code extension (which would duplicate this extension's own Solution Explorer/NuGet browser/profiler). Two options, switchable via **.NET: Switch Language Server** or the `dotnet-creator.languageServer` setting — both can be installed side by side, but only the selected one ever runs:
  * [**SharpLsp**](https://github.com/Nimblesite/SharpLsp) (MIT-licensed, Roslyn for C# + FSharp.Compiler.Service for F#) — the default, and the only option that supports F#.
  * **Roslyn Language Server** — Microsoft's own C# language server, the same binary C# Dev Kit uses internally, driven standalone here instead. Downloaded from Microsoft's own public feed, the same approach the `roslyn.nvim` Neovim plugin uses to drive it outside Visual Studio/C# Dev Kit.

  Either way you get diagnostics, completions, hover, go-to-definition, the Outline panel/breadcrumbs, and code folding. Entirely opt-in: if the selected server isn't found, opening a C#/F# file offers a one-click **Download** (checksum-verified against SharpLsp's own published hashes for SharpLsp; downloaded directly from Microsoft's official feed for Roslyn, which doesn't publish a checksum for this specific feed) or **Install Instructions** — nothing is ever installed automatically. A status bar item shows the active server's state, with Restart/Show Output actions.
* **Standalone Debugging (netcoredbg):** this extension's own debug type, **`.NET (netcoredbg)`**, backed by [netcoredbg](https://github.com/Samsung/netcoredbg) (MIT-licensed, Samsung) — real breakpoints, stepping, call stacks, and variable inspection via the Debug Adapter Protocol, without installing Microsoft's C# extension (whose `vsdbg` debugger is proprietary and license-locked to official Microsoft VS Code builds). **.NET: Set Up Debug/Build Tasks** generates `launch.json` entries using this type by default, scoped to the current workspace — set `dotnet-creator.useGlobalDebugTasks` to use one shared global configuration for every workspace instead, created automatically the first time it's needed. Entirely opt-in, same pattern as the language server: if netcoredbg isn't found, pressing F5 offers **Download netcoredbg** (checksum-verified against GitHub's own published digest for the release asset) or **Install Instructions** — nothing is ever installed automatically. Handles an x86 `PlatformTarget` project correctly (points the debug host at the 32-bit .NET runtime automatically), supports multiple concurrent debug sessions via F5 (each named after its actual project, not a generic label), and doesn't block F5 while another session is already running.
* **.NET Resource Monitor:** a panel showing a running debuggee's live CPU%/memory charts (OS-level, always available, no dependencies). When SharpLsp (above) is running, it also shows live GC heap/ThreadPool runtime counters and a title-bar **Start/Stop Recording Trace** action that records a CPU-sampling or Memory/GC EventPipe trace to a file via SharpLsp's own `dotnet-trace`/`dotnet-counters` integration — an explicit **Start SharpLsp** button appears in its place if SharpLsp isn't running yet, never started automatically just by opening the panel.
* **Update Notifications:** SharpLsp, the Roslyn Language Server, and netcoredbg all periodically (once per day) check for a newer release once resolved, and show a quiet, dismissible notice — never auto-switching — so a previously-downloaded copy doesn't silently go stale.
* **Self-Update via GitHub Releases:** .NET Studio checks its own [GitHub releases](https://github.com/Terongorus/dotnet-project-creator/releases) (not the VS Code Marketplace) once a day and offers to download and install the latest `.vsix` directly — **.NET: Check for Updates** triggers this on demand. GitHub Releases is this extension's actual distribution channel going forward.
* **Fast and Lightweight by Default:** every feature above is pure UI-to-CLI/filesystem bridging — no background processes unless you explicitly opt into the language server or debug adapter integrations.

## Requirements

You must have the official [.NET SDK](https://dotnet.microsoft.com/download) installed on your system and accessible in your system's `PATH`. .NET SDK 8.0 or later is recommended: debug session launching resolves the built assembly to run by asking MSBuild for the project's real output path, which correctly handles a custom `OutputPath`/`Directory.Build.props` setup on SDK 8+, and falls back to a best-effort `bin/` folder search (standard layouts only) on older SDKs.

## Looks Great With

This extension's UI (status bar, Solution Explorer, NuGet Manager, Start Page) is built
entirely on VS Code's own theme color variables, so it adapts automatically to whatever color
theme you're running — no configuration needed. Given the Visual Studio/Rider-inspired workflow
this extension goes for, the [JetBrains Rider Dark Theme](https://marketplace.visualstudio.com/items?itemName=EdwinSulaiman.jetbrains-rider-dark-theme)
is a fitting, purely cosmetic pairing if you want the look to match.

## Usage

### Create New Project

1. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS).
2. Type **.NET: Create New Project** and press Enter.
3. Select your project template, and name your project.
4. Choose whether to add the project to a solution:
   * **No** — pick a destination folder and create a standalone project.
   * **Yes** — either pick an existing `.sln`/`.slnx` file to add the project to, or create a new solution on the spot; the project is placed alongside it and linked automatically.

### Create Solution

Run **.NET: Create Solution** to create an empty `.slnx` solution with no project, ready to have projects added to it later (via Create New Project or `dotnet sln add`).

### Manage Solution Files

Run **.NET: Manage Solution Files**, pick a folder, then choose to **add** scaffold files (`.gitignore`, `.editorconfig`, `NuGet.Config`, `global.json`, `Directory.Build.props`, solution files, etc.) or **permanently delete** the ones already present — deletion asks for confirmation first.

### Wiring Up Debug/Build for Multi-Project Solutions

VS Code's default `.NET` debug configurations hardcode a single project's output path, which breaks down once a solution has more than one runnable project — you either maintain a separate launch config per project, or hand-edit `program` every time you switch. This extension's project picker (and the status bar item next to it) exists to fix that: pick a project once, and every launch config / build task that references the picker resolves to the same project without asking again.

**The two commands involved, and why both exist:**

* `dotnet-creator.pickCsprojFile` — always shows a picker (with a "Recently Used" section). Exposed in the Command Palette as **.NET: Change Debug Project**, and behind the status bar item. This is the one you invoke *explicitly* to switch projects.
* `dotnet-creator.getPickedCsprojFile` — silent. Returns whatever `pickCsprojFile` last resolved to, and only shows a picker itself if nothing has been picked yet. **`launch.json` and `tasks.json` inputs should both call this one**, not `pickCsprojFile` — otherwise you get re-prompted on every single debug/build run instead of once.

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

**After** — `launch.json`, using this extension's own `"dotnet-creator-debug"` type (backed by netcoredbg — see **Standalone Debugging** above) instead of a hardcoded `program` path. Unlike VS Code's built-in-looking `"dotnet"` type (actually contributed by Microsoft's C# extension, and non-functional without it), `dotnet-creator-debug` resolves the built assembly itself via `getPickedAssemblyPath` — which asks MSBuild directly for the project's real `TargetPath` (`dotnet msbuild -getProperty:TargetPath`) rather than guessing a filesystem location, so it's correct even for a custom `OutputPath`/`Directory.Build.props` build layout. `.NET Debug` and `.NET Release` each get their own input/preLaunchTask pair with a literal, hardcoded configuration, rather than sharing one — so picking "Release" always actually builds and launches Release regardless of whatever the status bar's configuration picker currently says:

```jsonc
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": ".NET Debug",
            "type": "dotnet-creator-debug",
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
            "type": "dotnet-creator-debug",
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
            "command": "dotnet-creator.getPickedAssemblyPath",
            "args": { "include": "**/*.csproj", "acceptIfOneFile": true, "configuration": "Debug" }
        },
        {
            "id": "pickAssemblyRelease",
            "type": "command",
            "command": "dotnet-creator.getPickedAssemblyPath",
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
            "command": "dotnet-creator.getPickedCsprojFile",
            "args": { "include": "**/*.csproj", "acceptIfOneFile": true }
        },
        { "id": "selectedCsproj", "type": "command", "command": "dotnet-creator.getPickedCsprojFile" },
        { "id": "currentConfiguration", "type": "command", "command": "dotnet-creator.getCurrentConfiguration" }
    ]
}
```

`args` beyond `include`/`acceptIfOneFile` (e.g. a `fromWorkspace` flag carried over from other pickers) are accepted but ignored — this extension always searches the current workspace.

**Switching projects:** run **.NET: Change Debug Project** from the Command Palette, or click the project name in the status bar — either updates the stored selection, and the next F5 or build picks it up automatically with no further prompting.

## Roadmap

Planned, not yet started:

* **Test Explorer** — discover and run `dotnet test` (NUnit/xUnit/MSTest) through VS Code's
  native Testing API, with results and failure navigation, no semantic C# analysis required.

The items below are no longer a silent gap — this extension now provides the plumbing (see the
**Optional C#/F# Language Server** feature above) to drive **[SharpLsp](https://github.com/Nimblesite/SharpLsp)**
(MIT licensed, editor-agnostic, Roslyn for C# + FSharp.Compiler.Service for F#) directly, rather
than building a Roslyn-hosting language server of its own:

* **Code Analysis & Inspections**, **Navigation & Search**, **Code Completion / IntelliSense**,
  **Code Refactoring**, and **C#-aware Code Formatting** — provided by SharpLsp once it's
  installed (via the built-in **Download SharpLsp** action or your own `cargo install
  sharplsp`), to whatever extent SharpLsp itself implements each one. It's early (v0.18.0 as of
  writing, requires .NET SDK 10+) but actively developed, so coverage and polish will keep
  improving over time rather than being a mature drop-in for ReSharper/C# Dev Kit on day one.
* Deliberately not using SharpLsp's own VS Code extension: it ships its own Solution Explorer
  and profiler UI, which would overlap with this extension's own Solution Explorer and the
  Resource Monitor's SharpLsp-driven runtime diagnostics (see **Features** above) if both were
  installed - this extension drives SharpLsp's profiler backend directly instead.

## Known Issues

* If no templates are loading, ensure that your `.NET SDK` is installed properly and that the `dotnet` command is recognized in your terminal.

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
