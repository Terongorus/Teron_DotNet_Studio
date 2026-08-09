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
        label: '.NET Build Solution',
        type: 'shell',
        command: 'dotnet build',
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: false, group: '.NET', order: 2 },
        problemMatcher: '$msCompile'
    },
    {
        label: '.NET Build Project Hidden',
        type: 'shell',
        command: 'dotnet',
        args: ['build', '${input:selectedCsproj}'],
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: true },
        problemMatcher: '$msCompile'
    },
    {
        label: '.NET Build Project',
        type: 'shell',
        command: 'dotnet',
        args: ['build', '${input:pickCsproj}'],
        group: { kind: 'build', isDefault: true },
        presentation: { hidden: false, group: '.NET', order: 1 },
        problemMatcher: '$msCompile'
    }
];

export const RECOMMENDED_TASK_INPUTS: Record<string, unknown>[] = [
    {
        id: 'pickCsproj',
        type: 'command',
        command: 'dotnet-creator.getPickedCsprojFile',
        args: { include: '**/*.csproj', acceptIfOneFile: true }
    },
    {
        id: 'selectedCsproj',
        type: 'command',
        command: 'dotnet-creator.getPickedCsprojFile'
    }
];

export const RECOMMENDED_LAUNCH_CONFIGS: Record<string, unknown>[] = [
    {
        name: '.NET Debug',
        type: 'dotnet',
        request: 'launch',
        preLaunchTask: '.NET Build Project Hidden',
        projectPath: '${input:pickCsproj}',
        presentation: { hidden: false, group: '.NET', order: 1 },
        args: [],
        internalConsoleOptions: 'neverOpen'
    },
    {
        name: '.NET Release',
        type: 'dotnet',
        request: 'launch',
        preLaunchTask: '.NET Build Project Hidden',
        projectPath: '${input:pickCsproj}',
        presentation: { hidden: false, group: '.NET', order: 2 },
        args: [],
        internalConsoleOptions: 'neverOpen'
    }
];

export const RECOMMENDED_LAUNCH_INPUTS: Record<string, unknown>[] = [
    {
        id: 'pickCsproj',
        type: 'command',
        command: 'dotnet-creator.getPickedCsprojFile',
        args: { include: '**/*.csproj', acceptIfOneFile: true }
    }
];

/** The label ".NET Build Project Hidden" specifically is used as the setup-detection marker (see commands/setupDebugTasks.ts). */
export const SETUP_MARKER_TASK_LABEL = '.NET Build Project Hidden';
