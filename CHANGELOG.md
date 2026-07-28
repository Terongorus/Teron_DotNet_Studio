# Change Log

All notable changes to the **.NET Project Creator** extension will be documented in this file.

## [0.0.1] - 2026-07-29

* **Initial Release**:
  * Added a clean, lightweight UI wrapper for the official `.NET CLI`.
  * Implemented dynamic template detection and parsing via `dotnet new list`.
  * Added template installation flow to pull third-party or custom templates from NuGet using `dotnet new install`.
  * Introduced an interactive 4-step workflow covering template selection, project naming, destination folder picking, and workspace configuration.
  * Added optional generation of `.NET` solution (`.sln`) files with automatic project linking (`dotnet sln add`).
