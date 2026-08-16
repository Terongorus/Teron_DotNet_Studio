import * as vscode from 'vscode';

/**
 * The only place in this codebase that touches `context.secrets` (VS Code's SecretStorage) - no
 * prior feature here has ever needed credential storage. Backed by the OS-native secure store
 * (Windows: DPAPI-encrypted, inside VS Code's own user-data SQLite store, not a separate
 * Credential Manager entry; macOS: Keychain; Linux: Keyring), scoped per Windows/OS user account
 * and per VS Code profile - it does not roam with the project, so cloning the repo elsewhere (or
 * another person opening it) means re-entering these credentials, the same experience as VS
 * Code's own built-in GitHub auth.
 *
 * Web Server (Web Deploy) deliberately does NOT use this - its password lives in
 * `<name>.pubxml.user`, matching real Visual Studio's own convention exactly (see
 * readWebDeployPassword/writeWebDeployPassword in publishProfiles.ts).
 */
export type PublishSecretKind =
    | 'containerRegistryPassword'
    | 'sftpPassword'
    | 'sftpPrivateKeyPassphrase'
    | 'azureAppServicePassword';

const ALL_KINDS: PublishSecretKind[] = [
    'containerRegistryPassword',
    'sftpPassword',
    'sftpPrivateKeyPassphrase',
    'azureAppServicePassword'
];

function secretKey(csprojPath: string, profileName: string, kind: PublishSecretKind): string {
    return `dotnet-studio.publish.${kind}::${csprojPath}::${profileName}`;
}

export async function storePublishSecret(context: vscode.ExtensionContext, csprojPath: string, profileName: string, kind: PublishSecretKind, value: string): Promise<void> {
    await context.secrets.store(secretKey(csprojPath, profileName, kind), value);
}

export async function getPublishSecret(context: vscode.ExtensionContext, csprojPath: string, profileName: string, kind: PublishSecretKind): Promise<string | undefined> {
    return context.secrets.get(secretKey(csprojPath, profileName, kind));
}

export async function deletePublishSecret(context: vscode.ExtensionContext, csprojPath: string, profileName: string, kind: PublishSecretKind): Promise<void> {
    await context.secrets.delete(secretKey(csprojPath, profileName, kind));
}

/** Carries over any stored secret(s) to a profile's new name after a rename, then removes the old entries - profile renaming itself lives in publishProfiles.ts, which has no ExtensionContext to reach secrets with, so the panel calls this alongside renamePublishProfile. */
export async function renamePublishSecrets(context: vscode.ExtensionContext, csprojPath: string, oldName: string, newName: string): Promise<void> {
    for (const kind of ALL_KINDS) {
        const value = await getPublishSecret(context, csprojPath, oldName, kind);
        if (value !== undefined) {
            await storePublishSecret(context, csprojPath, newName, kind, value);
            await deletePublishSecret(context, csprojPath, oldName, kind);
        }
    }
}

export async function deleteAllPublishSecrets(context: vscode.ExtensionContext, csprojPath: string, profileName: string): Promise<void> {
    for (const kind of ALL_KINDS) { await deletePublishSecret(context, csprojPath, profileName, kind); }
}
