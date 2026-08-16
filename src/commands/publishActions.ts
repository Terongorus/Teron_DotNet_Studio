import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { runDotnetTask } from './buildActions';
import { PublishProfile, writePublishProfile, readWebDeployPassword } from '../utils/publishProfiles';
import { getPublishSecret, storePublishSecret } from '../utils/publishSecrets';
import { resolveWebDeployCommand, probeWebDeploy } from '../publish/webDeployLocator';
import { showWebDeployNotInstalledNotice, showWebDeployMisconfiguredPathNotice } from '../publish/webDeployNotifications';
import { uploadDirectoryViaSftp } from '../publish/sftpUpload';
import { createZipArchive, deployZipToKudu } from '../publish/azureZipDeploy';

/** The absolute path a profile's PublishDir resolves to, for "Reveal in File Explorer"-style affordances after a successful publish, and as the local staging folder sftp/azureAppService upload/zip from. */
export function resolvePublishDirAbsolute(csprojPath: string, publishDir: string): string {
    return path.isAbsolute(publishDir) ? publishDir : path.resolve(path.dirname(csprojPath), publishDir);
}

/**
 * Restores then publishes to a local folder via `-p:PublishProfile=<name>` - the same mechanism
 * Visual Studio's own Publish button uses for a Folder profile. `PublishDir`/`SelfContained`/
 * `RuntimeIdentifier` are read by MSBuild regardless of `_TargetId`, so this same local-output
 * step is also the first half of the sftp and azureAppService targets below (they upload/zip
 * whatever lands in `profile.publishDir` next) - only the folder target stops here. Restore runs
 * as its own explicit step before `--no-restore` publish for the same reason runBuildAction does
 * (see its comment): `dotnet publish`'s implicit restore doesn't reliably see Configuration/
 * RuntimeIdentifier-conditional MSBuild properties, and a RuntimeIdentifier is exactly the kind of
 * property publish itself introduces - restoring without it explicitly passed first can leave the
 * wrong (or no) runtime-specific assets in project.assets.json.
 */
async function publishLocally(csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    const restoreArgs = ['restore', csprojPath, `-p:Configuration=${profile.configuration}`];
    if (profile.runtimeIdentifier) { restoreArgs.push('-r', profile.runtimeIdentifier); }

    const restored = await runDotnetTask(csprojPath, restoreArgs, `.NET Publish Restore: ${projectName}`);
    if (!restored) { return false; }

    return runDotnetTask(
        csprojPath,
        ['publish', csprojPath, '-c', profile.configuration, `-p:PublishProfile=${profile.name}`, '--no-restore'],
        `.NET Publish: ${projectName} (${profile.name})`
    );
}

async function publishToContainerRegistry(context: vscode.ExtensionContext, csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    const restoreArgs = ['restore', csprojPath, `-p:Configuration=${profile.configuration}`];
    if (profile.runtimeIdentifier) { restoreArgs.push('-r', profile.runtimeIdentifier); }
    const restored = await runDotnetTask(csprojPath, restoreArgs, `.NET Publish Restore: ${projectName}`);
    if (!restored) { return false; }

    const publishArgs = ['publish', csprojPath, '-c', profile.configuration, '/t:PublishContainer', '--no-restore'];
    if (profile.runtimeIdentifier) { publishArgs.push('-r', profile.runtimeIdentifier); }
    if (profile.containerRegistry) { publishArgs.push(`-p:ContainerRegistry=${profile.containerRegistry}`); }
    if (profile.containerRepository) { publishArgs.push(`-p:ContainerRepository=${profile.containerRepository}`); }
    if (profile.containerImageTag) { publishArgs.push(`-p:ContainerImageTag=${profile.containerImageTag}`); }

    // The .NET SDK's container tooling normally authenticates via the same `docker login`-managed
    // ~/.docker/config.json Docker itself uses (Microsoft's own documented preferred mechanism) -
    // that needs no code here at all. DOTNET_CONTAINER_REGISTRY_UNAME/_PWORD are its documented
    // *secondary* environment-variable mechanism, explicitly flagged by Microsoft's own docs as
    // "potentially vulnerable to credential leakage" versus the docker-login path, used here only
    // when this profile actually has a stored registry password (i.e. the user chose to authenticate
    // this way rather than via a prior `docker login`) - passed as task env, never as a `-p:` command
    // line argument, so it never appears in the visible integrated terminal.
    const password = await getPublishSecret(context, csprojPath, profile.name, 'containerRegistryPassword');
    const env = (profile.containerRegistryUsername && password)
        ? { DOTNET_CONTAINER_REGISTRY_UNAME: profile.containerRegistryUsername, DOTNET_CONTAINER_REGISTRY_PWORD: password }
        : undefined;

    return runDotnetTask(csprojPath, publishArgs, `.NET Publish: ${projectName} (${profile.name})`, env);
}

async function publishToWebServer(context: vscode.ExtensionContext, csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    const resolved = resolveWebDeployCommand();
    if ('misconfigured' in resolved) {
        showWebDeployMisconfiguredPathNotice(resolved.detail);
        return false;
    }
    const probe = await probeWebDeploy(resolved.command);
    if (!probe.ok) {
        await showWebDeployNotInstalledNotice(context);
        return false;
    }

    const restoreArgs = ['restore', csprojPath, `-p:Configuration=${profile.configuration}`];
    const restored = await runDotnetTask(csprojPath, restoreArgs, `.NET Publish Restore: ${projectName}`);
    if (!restored) { return false; }

    // Password comes from the sibling .pubxml.user file (matching real Visual Studio's own
    // convention exactly - see readWebDeployPassword's own comment) and is passed as task env
    // rather than a `-p:Password=` command line argument: MSBuild implicitly reads any
    // environment variable as a property of the same name unless a property of that name is set
    // some other way, so `$(Password)` inside Microsoft.NET.Sdk.Publish's Web Deploy targets
    // resolves from this env var - the same technique used for Container Registry credentials
    // above - without the password ever appearing in the visible integrated terminal.
    const password = await readWebDeployPassword(csprojPath, profile.name);
    const env = password ? { Password: password } : undefined;

    return runDotnetTask(
        csprojPath,
        ['publish', csprojPath, '-c', profile.configuration, `-p:PublishProfile=${profile.name}`, '-p:DeployOnBuild=true', '--no-restore'],
        `.NET Publish: ${projectName} (${profile.name})`,
        env
    );
}

async function publishToSftp(context: vscode.ExtensionContext, csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    const publishedLocally = await publishLocally(csprojPath, projectName, profile);
    if (!publishedLocally) { return false; }

    const localDir = resolvePublishDirAbsolute(csprojPath, profile.publishDir);

    let password: string | undefined;
    let privateKeyPassphrase: string | undefined;
    if (profile.sftpAuthMethod === 'privateKey') {
        if (profile.sftpPrivateKeyPath) {
            privateKeyPassphrase = await getPublishSecret(context, csprojPath, profile.name, 'sftpPrivateKeyPassphrase');
        }
    } else {
        password = await getPublishSecret(context, csprojPath, profile.name, 'sftpPassword');
        if (!password) {
            password = await vscode.window.showInputBox({
                title: `SFTP Password for ${profile.sftpUsername ?? profile.name}`,
                password: true,
                ignoreFocusOut: true
            });
            if (password) { await storePublishSecret(context, csprojPath, profile.name, 'sftpPassword', password); }
        }
    }

    if (!profile.sftpHost || !profile.sftpUsername || !profile.sftpRemotePath) {
        void vscode.window.showErrorMessage('SFTP publish needs a host, username, and remote path.');
        return false;
    }
    if (!password && !profile.sftpPrivateKeyPath) {
        void vscode.window.showErrorMessage('SFTP publish needs a password or a private key.');
        return false;
    }

    try {
        await uploadDirectoryViaSftp({
            host: profile.sftpHost,
            port: profile.sftpPort ?? 22,
            username: profile.sftpUsername,
            remotePath: profile.sftpRemotePath,
            localDir,
            password,
            privateKeyPath: profile.sftpPrivateKeyPath,
            privateKeyPassphrase
        });
        return true;
    } catch (error) {
        void vscode.window.showErrorMessage(`SFTP upload failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

async function publishToAzureAppService(context: vscode.ExtensionContext, csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    const publishedLocally = await publishLocally(csprojPath, projectName, profile);
    if (!publishedLocally) { return false; }

    if (!profile.azurePublishUrl || !profile.azureUsername) {
        void vscode.window.showErrorMessage('Azure App Service publish needs an imported publish profile - use "Import Publish Settings..." first.');
        return false;
    }
    const password = await getPublishSecret(context, csprojPath, profile.name, 'azureAppServicePassword');
    if (!password) {
        void vscode.window.showErrorMessage('No stored Azure deployment credentials for this profile - use "Import Publish Settings..." again.');
        return false;
    }

    const localDir = resolvePublishDirAbsolute(csprojPath, profile.publishDir);
    const zipPath = path.join(os.tmpdir(), `${projectName}-${profile.name}-${Date.now()}.zip`);

    try {
        await createZipArchive(localDir, zipPath);
        await deployZipToKudu({
            publishUrl: profile.azurePublishUrl,
            userName: profile.azureUsername,
            password,
            zipPath
        });
        return true;
    } catch (error) {
        void vscode.window.showErrorMessage(`Azure App Service publish failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/**
 * Dispatches to the right target-type executor. Every path writes the `.pubxml` first (so a
 * failed publish still leaves the profile's settings saved) - Web Server's password additionally
 * needs the sibling `.pubxml.user` to already exist by the time its own executor reads it, which
 * publishPanel.ts's `saveProfile`/`publish` handlers guarantee by writing it before calling this.
 */
export async function publishProject(context: vscode.ExtensionContext, csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    await writePublishProfile(csprojPath, profile);

    switch (profile.targetType) {
        case 'folder': return publishLocally(csprojPath, projectName, profile);
        case 'containerRegistry': return publishToContainerRegistry(context, csprojPath, projectName, profile);
        case 'webServer': return publishToWebServer(context, csprojPath, projectName, profile);
        case 'sftp': return publishToSftp(context, csprojPath, projectName, profile);
        case 'azureAppService': return publishToAzureAppService(context, csprojPath, projectName, profile);
    }
}
