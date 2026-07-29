# Change Log

All notable changes to the **.NET Project Creator** extension will be documented in this file.

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
