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
* **Solution Explorer:** A dedicated activity bar view (its own icon, separate from the native Explorer) showing your solution, its projects, each project's dependencies (NuGet packages, project references, detected analyzers/source generators), and its real file/folder structure — with full New File/Class/Folder, Add Existing File, Rename, Delete, Cut/Copy/Paste, Exclude/Include From Project, drag-and-drop move, Build/Rebuild/Clean/Run, Set as Startup Project, Remove from Solution, and sync-with-active-editor support. Stays in sync with the Solution status bar item, and shows one independent section per folder in a multi-root workspace. Does not show source generators' actual *generated* output files — that needs a real Roslyn/MSBuild hook, the same boundary as the language-server items below.
* **Fast and Lightweight:** No heavy background language servers or telemetry; just pure UI to CLI bridging.

## Requirements

You must have the official [.NET SDK](https://dotnet.microsoft.com/download) installed on your system and accessible in your system's `PATH`.

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

**After** — `launch.json`, using the `"dotnet"` debug type's `projectPath` instead of a hardcoded `program` path:

```jsonc
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": ".NET Debug",
            "type": "dotnet",
            "request": "launch",
            "preLaunchTask": ".NET Build Project Hidden",
            "projectPath": "${input:pickCsproj}",
            "presentation": { "hidden": false, "group": ".NET", "order": 1 },
            "args": [],
            "internalConsoleOptions": "neverOpen"
        },
        {
            "name": ".NET Release",
            "type": "dotnet",
            "request": "launch",
            "preLaunchTask": ".NET Build Project Hidden",
            "projectPath": "${input:pickCsproj}",
            "presentation": { "hidden": false, "group": ".NET", "order": 2 },
            "args": [],
            "internalConsoleOptions": "neverOpen"
        }
    ],
    "inputs": [
        {
            "id": "pickCsproj",
            "type": "command",
            "command": "dotnet-creator.getPickedCsprojFile",
            "args": { "include": "**/*.csproj", "acceptIfOneFile": true }
        }
    ]
}
```

`tasks.json` needs its own `"inputs"` entry for the same reason — a hidden build task that runs as the `preLaunchTask` above, and (optionally) a visible one for running a build on demand via **Tasks: Run Build Task**:

```jsonc
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": ".NET Build Project Hidden",
            "type": "shell",
            "command": "dotnet",
            "args": ["build", "${input:selectedCsproj}"],
            "group": { "kind": "build", "isDefault": true },
            "presentation": { "hidden": true },
            "problemMatcher": "$msCompile"
        },
        {
            "label": ".NET Build Project",
            "type": "shell",
            "command": "dotnet",
            "args": ["build", "${input:pickCsproj}"],
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
        { "id": "selectedCsproj", "type": "command", "command": "dotnet-creator.getPickedCsprojFile" }
    ]
}
```

`args` beyond `include`/`acceptIfOneFile` (e.g. a `fromWorkspace` flag carried over from other pickers) are accepted but ignored — this extension always searches the current workspace.

**Switching projects:** run **.NET: Change Debug Project** from the Command Palette, or click the project name in the status bar — either updates the stored selection, and the next F5 or build picks it up automatically with no further prompting.

## Roadmap

Planned, not yet started:

* **Test Explorer** — discover and run `dotnet test` (NUnit/xUnit/MSTest) through VS Code's
  native Testing API, with results and failure navigation, no semantic C# analysis required.
* **Deeper runtime diagnostics** — the .NET Resource Monitor panel currently polls OS-level
  process stats (CPU%, memory) via PowerShell. GC Heap Size, ThreadPool Thread Count, and
  Visual-Studio-style memory snapshots/CPU trace recording would need the .NET runtime's own
  EventCounters/EventPipe diagnostics channel (the same mechanism `dotnet-counters`/
  `dotnet-trace` use) — a materially different, larger feature than OS-level polling. Flagged
  as a real boundary, not a silent omission, in case it's wanted as a future milestone.

Also under consideration, but a different category of effort — each of these needs a real C#
semantic engine (Roslyn or similar), not a CLI wrapper, so they're not planned in detail here.
This extension isn't going to build its own Roslyn-hosting language server, but a real,
free option now exists worth knowing about: **[SharpLsp](https://github.com/Nimblesite/SharpLsp)**
(MIT licensed, editor-agnostic, Roslyn for C# + FSharp.Compiler.Service for F#), installable
separately from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Nimblesite.sharplsp)
the same way ReSharper or C# Dev Kit would be. It's early (v0.18.0 as of writing, ~150
installs, requires .NET SDK 10+) but actively developed, so it's not a mature drop-in yet -
worth revisiting as it matures. Note it also ships its own Solution Explorer and a profiler,
which will overlap with this extension's own Solution Explorer and the "Deeper runtime
diagnostics" item above if both are installed at once.

* **Code Analysis & Inspections** — real-time issue detection and quick fixes.
* **Navigation & Search** — go to definition, find usages, symbol search.
* **Code Refactoring** — Rename, Extract Method, Introduce Variable, and similar operations.
* **Code Completion / IntelliSense** — context-aware completions, live templates, auto-imports.
* **C#-aware Code Formatting** — semantic formatting beyond generic EditorConfig rules.

## Known Issues

* If no templates are loading, ensure that your `.NET SDK` is installed properly and that the `dotnet` command is recognized in your terminal.

## Author

Kaloyan Kolev

## License

This extension is licensed under the GNU General Public License v3.0 (GPLv3).
