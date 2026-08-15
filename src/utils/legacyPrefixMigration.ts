import * as vscode from 'vscode';

const OLD_PREFIX = 'dotnet-creator';
const NEW_PREFIX = 'dotnet-studio';
const MIGRATION_DONE_KEY = 'dotnet-studio.legacySettingsMigrationDone';

interface ConfigurationGroup {
    properties?: Record<string, unknown>;
}

/**
 * One-time migration for the dotnet-creator. -> dotnet-studio. settings/commands rename - copies
 * forward any value a user has explicitly set under the old prefix (an unset/default value has
 * nothing worth migrating) and clears the old key afterward, so it doesn't linger as an "unknown
 * configuration" warning in the Settings UI forever. Reads the real declared setting list from
 * this extension's own package.json (via vscode.extensions) rather than a hand-maintained list of
 * keys, so it can't silently drift out of sync as settings are added/removed later.
 *
 * Global and Workspace scopes only - WorkspaceFolder-scoped overrides for a tool-path-style
 * setting are rare enough (and require a specific resource to target correctly in a multi-root
 * workspace) that they're not worth the added complexity here; anyone in that situation can just
 * re-set the value under the new key directly.
 */
export async function migrateLegacySettings(context: vscode.ExtensionContext): Promise<void> {
    if (context.globalState.get<boolean>(MIGRATION_DONE_KEY, false)) { return; }

    const extension = vscode.extensions.getExtension(context.extension.id);
    const groups = (extension?.packageJSON?.contributes?.configuration ?? []) as ConfigurationGroup[];
    const newKeys = groups.flatMap(g => Object.keys(g.properties ?? {}));

    const oldConfig = vscode.workspace.getConfiguration(OLD_PREFIX);
    const newConfig = vscode.workspace.getConfiguration(NEW_PREFIX);

    for (const fullNewKey of newKeys) {
        if (!fullNewKey.startsWith(`${NEW_PREFIX}.`)) { continue; }
        const key = fullNewKey.slice(NEW_PREFIX.length + 1);
        const inspected = oldConfig.inspect(key);
        if (!inspected) { continue; }

        if (inspected.globalValue !== undefined) {
            await newConfig.update(key, inspected.globalValue, vscode.ConfigurationTarget.Global);
            await oldConfig.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
        if (inspected.workspaceValue !== undefined) {
            await newConfig.update(key, inspected.workspaceValue, vscode.ConfigurationTarget.Workspace);
            await oldConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }
    }

    await context.globalState.update(MIGRATION_DONE_KEY, true);
}

/**
 * Registers a forwarding command under the old dotnet-creator.* id for every real dotnet-studio.*
 * command this extension just registered, so a keybindings.json entry or a generated
 * tasks.json/launch.json "input" block written before the rename keeps working instead of
 * failing with "command not found." Must run after every other register*Commands() call in
 * activate() - it enumerates the real registered command list (vscode.commands.getCommands)
 * rather than a hand-maintained list, so it can't silently drift out of sync either.
 */
export async function registerLegacyCommandAliases(context: vscode.ExtensionContext): Promise<void> {
    const allCommands = await vscode.commands.getCommands(true);
    const ownCommands = allCommands.filter(id => id.startsWith(`${NEW_PREFIX}.`));

    for (const newId of ownCommands) {
        const oldId = OLD_PREFIX + newId.slice(NEW_PREFIX.length);
        context.subscriptions.push(
            vscode.commands.registerCommand(oldId, (...args: unknown[]) => vscode.commands.executeCommand(newId, ...args))
        );
    }
}
