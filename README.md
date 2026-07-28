# .NET Project Creator

A clean, lightweight Visual Studio Code extension for generating C# and F# .NET projects directly from the command palette.

Unlike the heavyweight C# Dev Kit, this extension purely acts as a UI wrapper for the official `.NET CLI`, allowing you to scaffold projects and solutions without unnecessary bloat.

## Features

* **Dynamic Template Loading:** Automatically detects and lists all available `.NET` templates installed on your machine (`dotnet new list`).
* **Install Templates from NuGet:** Download and install third-party or custom company templates directly via the extension UI.
* **Solution File Generation:** Optionally generate a `.sln` file in the parent directory and automatically link your new project to it.
* **Fast and Lightweight:** No heavy background language servers or telemetry; just pure UI to CLI bridging.

## Requirements

You must have the official [.NET SDK](https://dotnet.microsoft.com/download) installed on your system and accessible in your system's `PATH`.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS).
2. Type **.NET: Create New Project** and press Enter.
3. Follow the 4-step prompt to:
   * Select your project template.
   * Name your project.
   * Choose the destination folder.
   * Optionally create and link a `.sln` file.

## Known Issues

* If no templates are loading, ensure that your `.NET SDK` is installed properly and that the `dotnet` command is recognized in your terminal.

## Author

Kaloyan Kolev

## License

This extension is licensed under the GNU General Public License v3.0 (GPLv3).