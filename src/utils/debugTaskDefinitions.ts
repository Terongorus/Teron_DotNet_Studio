/**
 * The tasks/inputs/launch configs ".NET: Set Up Debug/Build Tasks" injects,
 * kept as plain data in one place so every scope (workspace tasks.json/
 * launch.json, global User Tasks, global launch settings) injects
 * byte-for-byte the same content. See README's "Wiring Up Debug/Build for
 * Multi-Project Solutions" section for the manual-setup equivalent this
 * automates.
 */

export const RECOMMENDED_TASKS: Record<string, unknown>[] = [
    {
        // `dotnet build`'s own implicit restore doesn't reliably see Configuration-conditional
        // MSBuild properties (e.g. a Release-only <RuntimeIdentifier>) - it can restore against
        // the wrong (default) branch of the condition, leaving project.assets.json without the
        // target the build actually needs and failing later with NETSDK1047. Each build task below
        // depends on (dependsOrder: 'sequence') a hidden restore task passing the same
        // -p:Configuration, then builds with --no-restore against that known-good restore.
        label: '.NET Restore Solution Hidden',
        type: 'shell',
        command: 'dotnet',
        args: ['restore', '-p:Configuration=${input:currentConfiguration}'],
        presentation: { hidden: true },
        problemMatcher: []
    },
    {
        label: '.NET Build Solution',
        type: 'shell',
        command: 'dotnet',
        args: ['build', '-c', '${input:currentConfiguration}', '--no-restore'],
        dependsOn: ['.NET Restore Solution Hidden'],
        dependsOrder: 'sequence',
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: false, group: '.NET', order: 3 },
        problemMatcher: '$msCompile'
    },
    {
        label: '.NET Restore Project Hidden (Debug)',
        type: 'shell',
        command: 'dotnet',
        args: ['restore', '${input:selectedCsproj}', '-p:Configuration=Debug'],
        presentation: { hidden: true },
        problemMatcher: []
    },
    {
        // preLaunchTask for the ".NET Debug" launch config specifically - hardcodes -c Debug
        // (rather than the dynamic currentConfiguration input the visible tasks use below) so
        // launching ".NET Debug" always actually builds Debug, regardless of whatever the status
        // bar's configuration picker currently happens to say.
        label: '.NET Build Project Hidden (Debug)',
        type: 'shell',
        command: 'dotnet',
        args: ['build', '${input:selectedCsproj}', '-c', 'Debug', '--no-restore'],
        dependsOn: ['.NET Restore Project Hidden (Debug)'],
        dependsOrder: 'sequence',
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: true },
        problemMatcher: '$msCompile'
    },
    {
        label: '.NET Restore Project Hidden (Release)',
        type: 'shell',
        command: 'dotnet',
        args: ['restore', '${input:selectedCsproj}', '-p:Configuration=Release'],
        presentation: { hidden: true },
        problemMatcher: []
    },
    {
        // Same, for ".NET Release" - see above.
        label: '.NET Build Project Hidden (Release)',
        type: 'shell',
        command: 'dotnet',
        args: ['build', '${input:selectedCsproj}', '-c', 'Release', '--no-restore'],
        dependsOn: ['.NET Restore Project Hidden (Release)'],
        dependsOrder: 'sequence',
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: true },
        problemMatcher: '$msCompile'
    },
    {
        label: '.NET Restore Project Hidden',
        type: 'shell',
        command: 'dotnet',
        args: ['restore', '${input:pickCsproj}', '-p:Configuration=${input:currentConfiguration}'],
        presentation: { hidden: true },
        problemMatcher: []
    },
    {
        label: '.NET Build Project',
        type: 'shell',
        command: 'dotnet',
        args: ['build', '${input:pickCsproj}', '-c', '${input:currentConfiguration}', '--no-restore'],
        dependsOn: ['.NET Restore Project Hidden'],
        dependsOrder: 'sequence',
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: false, group: '.NET', order: 1 },
        problemMatcher: '$msCompile'
    }
];

export const RECOMMENDED_TASK_INPUTS: Record<string, unknown>[] = [
    {
        id: 'pickCsproj',
        type: 'command',
        command: 'dotnet-studio.getPickedCsprojFile',
        args: { include: '**/*.csproj', acceptIfOneFile: true }
    },
    {
        id: 'selectedCsproj',
        type: 'command',
        command: 'dotnet-studio.getPickedCsprojFile'
    },
    {
        // Silent - never prompts, always resolves to the status bar's current Debug/Release
        // pick. Only used by the general-purpose tasks above; the two per-launch-config hidden
        // tasks hardcode their own configuration instead (see their own comments).
        id: 'currentConfiguration',
        type: 'command',
        command: 'dotnet-studio.getCurrentConfiguration'
    }
];

/**
 * `type: 'dotnet-studio-debug'` is this extension's own debug adapter (backed by netcoredbg,
 * see src/debugAdapter/) - not VS Code's built-in "dotnet" type, which is actually contributed
 * by Microsoft's C# extension and does nothing at all without it installed. Unlike that type's
 * convenience `projectPath` field (which it resolves to a built DLL internally), a
 * coreclr-compatible debugger needs the actual built assembly path via `program` - resolved
 * here through `getPickedAssemblyPath` (utils/projectAssemblyResolver.ts), which asks MSBuild
 * directly for the project's real `TargetPath` rather than guessing a filesystem location - the
 * only approach that's correct for a custom `OutputPath`/`Directory.Build.props` setup.
 */
export const RECOMMENDED_LAUNCH_CONFIGS: Record<string, unknown>[] = [
    {
        name: '.NET Debug',
        type: 'dotnet-studio-debug',
        request: 'launch',
        preLaunchTask: '.NET Build Project Hidden (Debug)',
        program: '${input:pickAssemblyDebug}',
        cwd: '${workspaceFolder}',
        console: 'internalConsole',
        stopAtEntry: false,
        presentation: { hidden: false, group: '.NET', order: 1 },
        args: [],
        internalConsoleOptions: 'neverOpen'
    },
    {
        name: '.NET Release',
        type: 'dotnet-studio-debug',
        request: 'launch',
        preLaunchTask: '.NET Build Project Hidden (Release)',
        program: '${input:pickAssemblyRelease}',
        cwd: '${workspaceFolder}',
        console: 'internalConsole',
        stopAtEntry: false,
        presentation: { hidden: false, group: '.NET', order: 2 },
        args: [],
        internalConsoleOptions: 'neverOpen'
    }
];

export const RECOMMENDED_LAUNCH_INPUTS: Record<string, unknown>[] = [
    {
        // Separate Debug/Release inputs (rather than one shared one) so each launch config's
        // resolved `program` always matches its own name, the same reason the preLaunchTasks
        // above are split - a shared input tied to the status bar's current pick would let
        // "Release" silently launch a Debug build (or vice versa) whenever they disagree.
        id: 'pickAssemblyDebug',
        type: 'command',
        command: 'dotnet-studio.getPickedAssemblyPath',
        args: { include: '**/*.csproj', acceptIfOneFile: true, configuration: 'Debug' }
    },
    {
        id: 'pickAssemblyRelease',
        type: 'command',
        command: 'dotnet-studio.getPickedAssemblyPath',
        args: { include: '**/*.csproj', acceptIfOneFile: true, configuration: 'Release' }
    }
];

/** The label ".NET Build Project Hidden (Debug)" specifically is used as the setup-detection marker (see commands/setupDebugTasks.ts). */
export const SETUP_MARKER_TASK_LABEL = '.NET Build Project Hidden (Debug)';
