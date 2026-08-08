# Change Log

All notable changes to the **.NET Project Creator** extension will be documented in this file.

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
