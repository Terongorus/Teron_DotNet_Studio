# .NET Project Creator

A clean, lightweight Visual Studio Code extension for generating C# and F# .NET projects directly from the command palette.

Unlike the heavyweight C# Dev Kit, this extension purely acts as a UI wrapper for the official `.NET CLI`, allowing you to scaffold projects and solutions without unnecessary bloat.

## Features

* **Dynamic Template Loading:** Automatically detects and lists all available `.NET` project templates installed on your machine (`dotnet new list --type project`) — scaffold-only templates like `.gitignore` or `.editorconfig` are kept out of this list.
* **Install Templates from NuGet:** Download and install third-party or custom company templates directly via the extension UI.
* **Solution-Aware Project Creation:** Optionally add your new project to an existing solution, or create a brand new one on the spot, as part of the project creation flow.
* **Standalone Solution Creation:** Create an empty `.slnx` solution on its own via **.NET: Create Solution**.
* **Solution Scaffold File Management:** Add or permanently delete solution-level scaffold files (`.gitignore`, `.editorconfig`, `NuGet.Config`, `global.json`, `.sln`/`.slnx`, etc.) in any folder via **.NET: Manage Solution Files**.
* **Fast and Lightweight:** No heavy background language servers or telemetry; just pure UI to CLI bridging.

## Requirements

You must have the official [.NET SDK](https://dotnet.microsoft.com/download) installed on your system and accessible in your system's `PATH`.

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

## Known Issues

* If no templates are loading, ensure that your `.NET SDK` is installed properly and that the `dotnet` command is recognized in your terminal.

## Author

Kaloyan Kolev

## License

This extension is licensed under the GNU General Public License v3.0 (GPLv3).
