import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from './process';

/**
 * Which kind of publish target a profile is. Mirrors Visual Studio's own `_TargetId`/
 * `WebPublishMethod` distinction. `sftp` has no Visual Studio equivalent at all (confirmed via
 * research - VS has never shipped an SFTP publish target) and is a .NET Studio-original addition,
 * not VS parity.
 */
export type PublishTargetType = 'folder' | 'azureAppService' | 'containerRegistry' | 'webServer' | 'sftp';

/**
 * A subset of Visual Studio's own publish profile schema (`Properties/PublishProfiles/<name>.pubxml`)
 * for the target types that have a real VS equivalent (folder/azureAppService/webServer) - reading/
 * writing exactly that shape keeps a profile created here round-trippable through Visual Studio's
 * own Publish UI and vice versa. containerRegistry and sftp have no VS schema to match, so their
 * properties are this extension's own design.
 *
 * Per-target-type fields are optional and only populated/meaningful for their own `targetType`;
 * secrets (passwords, SFTP passphrases) are never stored on this object - see the target-specific
 * `*.pubxml.user` / `context.secrets` handling in publishProfiles.ts's write/read paths and in
 * publishActions.ts.
 */
export interface PublishProfile {
    /** File name without the `.pubxml` extension - not itself a property inside the file. */
    name: string;
    targetType: PublishTargetType;
    configuration: string;
    targetFramework: string;
    /** Empty string means "Portable" (framework-dependent, no specific runtime) - VS omits the `<RuntimeIdentifier>` element entirely in that case, which this mirrors. */
    runtimeIdentifier: string;
    selfContained: boolean;
    /** Local `dotnet publish` output folder. The final destination for `folder`; a staging folder that gets zipped/uploaded for `azureAppService`/`sftp`. Unused for `containerRegistry` (the SDK builds/pushes the image directly, no local output folder) and `webServer` (msdeploy transfers directly). */
    publishDir: string;
    publishSingleFile: boolean;
    publishReadyToRun: boolean;
    publishTrimmed: boolean;
    /** Only meaningful when publishSingleFile is true - both are read exclusively inside the SDK's single-file bundling step (Microsoft.NET.Publish.targets), a no-op otherwise. Confirmed against that target's real source, not assumed from the property names alone. */
    includeAllContentForSelfExtract: boolean;
    /** Also requires selfContained - the SDK raises a real build error (CompressionInSingleFileRequiresSelfContained) otherwise, not just a no-op. */
    enableCompressionInSingleFile: boolean;
    /** Adds `<DebugType>none</DebugType>` when true, which drops PDB files from the publish output entirely. Unlike the other advanced flags this isn't gated by self-contained/single-file - it's a plain MSBuild property that applies regardless of deployment mode. */
    noDebugSymbols: boolean;

    /** Kudu SCM base URL (e.g. `https://<app>.scm.azurewebsites.net`), obtained via Import Publish Settings. */
    azurePublishUrl?: string;
    azureSiteName?: string;
    /** Deployment username (e.g. `$<app>`) - the deployment password is never stored here, see context.secrets in publishActions.ts. */
    azureUsername?: string;

    /** Registry hostname (e.g. `myregistry.azurecr.io`); empty/undefined targets Docker Hub. */
    containerRegistry?: string;
    containerRepository?: string;
    containerImageTag?: string;
    /** The registry password is never stored here - see context.secrets via publishSecrets.ts. */
    containerRegistryUsername?: string;

    webDeployServiceUrl?: string;
    webDeployIisAppPath?: string;
    /** The Web Deploy password is never stored here - it lives in the sibling `<name>.pubxml.user` file, matching real Visual Studio's own convention exactly. */
    webDeployUsername?: string;
    webDeployAllowUntrustedCertificate?: boolean;

    sftpHost?: string;
    sftpPort?: number;
    sftpUsername?: string;
    sftpRemotePath?: string;
    sftpAuthMethod?: 'password' | 'privateKey';
    /** Only meaningful when sftpAuthMethod is 'privateKey'. The key's passphrase (if any) and any stored password are never in this object or the .pubxml - see context.secrets in publishActions.ts. */
    sftpPrivateKeyPath?: string;
}

/** Runtime identifiers offered in the UI - the common desktop/server targets, matching Visual Studio's own Folder publish dropdown rather than every RID the .NET SDK recognizes. */
export const PUBLISH_RUNTIME_IDENTIFIERS = [
    'win-x64', 'win-x86', 'win-arm64',
    'linux-x64', 'linux-arm64', 'linux-musl-x64',
    'osx-x64', 'osx-arm64'
];

function profilesDir(csprojPath: string): string {
    return path.join(path.dirname(csprojPath), 'Properties', 'PublishProfiles');
}

function profilePath(csprojPath: string, name: string): string {
    return path.join(profilesDir(csprojPath), `${name}.pubxml`);
}

function profileUserPath(csprojPath: string, name: string): string {
    return path.join(profilesDir(csprojPath), `${name}.pubxml.user`);
}

/** Property names invalid as Windows file names or that would collide with path separators - the same set `sanitizeFileName`-style checks in this codebase's other rename flows guard against. */
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/;

export function isValidProfileName(name: string): boolean {
    return name.trim().length > 0 && !INVALID_NAME_CHARS.test(name);
}

export async function listPublishProfiles(csprojPath: string): Promise<string[]> {
    try {
        const entries = await fs.promises.readdir(profilesDir(csprojPath), { withFileTypes: true });
        return entries
            .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.pubxml') && !e.name.toLowerCase().endsWith('.pubxml.user'))
            .map(e => e.name.slice(0, -'.pubxml'.length))
            .sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
}

function extractElement(xml: string, tag: string): string | undefined {
    const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
    return match?.[1]?.trim();
}

/** Maps the on-disk `_TargetId` marker back to a PublishTargetType. Unrecognized/missing values fall back to 'folder' (the only type that predates this field), never throw - an unreadable target type shouldn't block opening the profile. */
function targetTypeFromTargetId(targetId: string | undefined): PublishTargetType {
    switch (targetId) {
        case 'AzureAppService': return 'azureAppService';
        case 'ContainerRegistry': return 'containerRegistry';
        case 'WebServer': return 'webServer';
        case 'Sftp': return 'sftp';
        default: return 'folder';
    }
}

function targetIdFromTargetType(targetType: PublishTargetType): string {
    switch (targetType) {
        case 'azureAppService': return 'AzureAppService';
        case 'containerRegistry': return 'ContainerRegistry';
        case 'webServer': return 'WebServer';
        case 'sftp': return 'Sftp';
        case 'folder': return 'Folder';
    }
}

export async function readPublishProfile(csprojPath: string, name: string): Promise<PublishProfile | undefined> {
    let xml: string;
    try {
        xml = await fs.promises.readFile(profilePath(csprojPath, name), 'utf8');
    } catch {
        return undefined;
    }

    const targetType = targetTypeFromTargetId(extractElement(xml, '_TargetId'));

    const profile: PublishProfile = {
        name,
        targetType,
        configuration: extractElement(xml, 'Configuration') ?? 'Release',
        targetFramework: extractElement(xml, 'TargetFramework') ?? '',
        runtimeIdentifier: extractElement(xml, 'RuntimeIdentifier') ?? '',
        selfContained: extractElement(xml, 'SelfContained') === 'true',
        publishDir: extractElement(xml, 'PublishDir') ?? '',
        publishSingleFile: extractElement(xml, 'PublishSingleFile') === 'true',
        publishReadyToRun: extractElement(xml, 'PublishReadyToRun') === 'true',
        publishTrimmed: extractElement(xml, 'PublishTrimmed') === 'true',
        includeAllContentForSelfExtract: extractElement(xml, 'IncludeAllContentForSelfExtract') === 'true',
        enableCompressionInSingleFile: extractElement(xml, 'EnableCompressionInSingleFile') === 'true',
        noDebugSymbols: extractElement(xml, 'DebugType') === 'none'
    };

    switch (targetType) {
        case 'azureAppService':
            profile.azurePublishUrl = extractElement(xml, 'PublishUrl');
            profile.azureSiteName = extractElement(xml, 'ResourceId');
            profile.azureUsername = extractElement(xml, 'UserName');
            break;
        case 'containerRegistry':
            profile.containerRegistry = extractElement(xml, 'ContainerRegistry');
            profile.containerRepository = extractElement(xml, 'ContainerRepository');
            profile.containerImageTag = extractElement(xml, 'ContainerImageTag');
            profile.containerRegistryUsername = extractElement(xml, 'ContainerRegistryUsername');
            break;
        case 'webServer':
            profile.webDeployServiceUrl = extractElement(xml, 'MSDeployServiceURL');
            profile.webDeployIisAppPath = extractElement(xml, 'DeployIisAppPath');
            profile.webDeployUsername = extractElement(xml, 'UserName');
            profile.webDeployAllowUntrustedCertificate = extractElement(xml, 'AllowUntrustedCertificate') === 'true';
            break;
        case 'sftp':
            profile.sftpHost = extractElement(xml, 'SftpHost');
            {
                const port = extractElement(xml, 'SftpPort');
                profile.sftpPort = port ? Number(port) : undefined;
            }
            profile.sftpUsername = extractElement(xml, 'SftpUsername');
            profile.sftpRemotePath = extractElement(xml, 'SftpRemotePath');
            profile.sftpAuthMethod = extractElement(xml, 'SftpAuthMethod') === 'privateKey' ? 'privateKey' : 'password';
            profile.sftpPrivateKeyPath = extractElement(xml, 'SftpPrivateKeyPath');
            break;
        case 'folder':
            break;
    }

    return profile;
}

/** Web Server's deployment password, read from the sibling `.pubxml.user` file - matches Visual Studio's own convention of never writing a Web Deploy password into the (typically source-controlled) `.pubxml` itself. Returns undefined if the file or the element doesn't exist. */
export async function readWebDeployPassword(csprojPath: string, name: string): Promise<string | undefined> {
    let xml: string;
    try {
        xml = await fs.promises.readFile(profileUserPath(csprojPath, name), 'utf8');
    } catch {
        return undefined;
    }
    return extractElement(xml, 'Password');
}

/** Writes/overwrites just the `<Password>` in `<name>.pubxml.user`, preserving nothing else - this extension doesn't otherwise use the .pubxml.user file, and real VS regenerates it wholesale too. */
export async function writeWebDeployPassword(csprojPath: string, name: string, password: string): Promise<void> {
    const dir = profilesDir(csprojPath);
    await fs.promises.mkdir(dir, { recursive: true });
    const lines = [
        '<Project>',
        '  <PropertyGroup>',
        `    <Password>${password}</Password>`,
        '  </PropertyGroup>',
        '</Project>',
        ''
    ];
    await fs.promises.writeFile(profileUserPath(csprojPath, name), lines.join('\r\n'), 'utf8');
}

/** Renders exactly the elements Visual Studio itself writes for a Folder profile - RuntimeIdentifier is omitted (not written as empty) for a portable/framework-dependent profile, matching VS's own output byte-for-byte in that case. Other target types follow the same conditional-emit style; azureAppService/webServer property names follow VS's own real schema (ZipDeploy/MSDeploy respectively) where a matching VS feature exists, cross-checked against public documentation - containerRegistry/sftp have no VS schema to match and use this extension's own property names. */
function renderPublishProfileXml(profile: PublishProfile): string {
    const lines: string[] = [
        '<Project>',
        '  <PropertyGroup>',
        `    <Configuration>${profile.configuration}</Configuration>`,
        '    <Platform>Any CPU</Platform>',
        `    <TargetFramework>${profile.targetFramework}</TargetFramework>`,
        `    <PublishDir>${profile.publishDir}</PublishDir>`
    ];

    switch (profile.targetType) {
        case 'folder':
            lines.push('    <PublishProtocol>FileSystem</PublishProtocol>');
            break;
        case 'azureAppService':
            lines.push('    <WebPublishMethod>ZipDeploy</WebPublishMethod>', '    <PublishProvider>AzureWebSite</PublishProvider>');
            break;
        case 'webServer':
            lines.push('    <WebPublishMethod>MSDeploy</WebPublishMethod>');
            break;
        case 'containerRegistry':
        case 'sftp':
            // No real MSBuild WebPublishMethod for either - PublishProtocol is omitted rather than inventing a misleading value.
            break;
    }
    lines.push(`    <_TargetId>${targetIdFromTargetType(profile.targetType)}</_TargetId>`);
    lines.push(`    <SelfContained>${profile.selfContained}</SelfContained>`);

    if (profile.runtimeIdentifier) {
        lines.push(`    <RuntimeIdentifier>${profile.runtimeIdentifier}</RuntimeIdentifier>`);
    }
    if (profile.publishSingleFile) { lines.push('    <PublishSingleFile>true</PublishSingleFile>'); }
    if (profile.includeAllContentForSelfExtract) { lines.push('    <IncludeAllContentForSelfExtract>true</IncludeAllContentForSelfExtract>'); }
    if (profile.enableCompressionInSingleFile) { lines.push('    <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>'); }
    if (profile.publishReadyToRun) { lines.push('    <PublishReadyToRun>true</PublishReadyToRun>'); }
    if (profile.publishTrimmed) { lines.push('    <PublishTrimmed>true</PublishTrimmed>'); }
    if (profile.noDebugSymbols) { lines.push('    <DebugType>none</DebugType>'); }

    switch (profile.targetType) {
        case 'azureAppService':
            if (profile.azurePublishUrl) { lines.push(`    <PublishUrl>${profile.azurePublishUrl}</PublishUrl>`); }
            if (profile.azureSiteName) { lines.push(`    <ResourceId>${profile.azureSiteName}</ResourceId>`); }
            if (profile.azureUsername) { lines.push(`    <UserName>${profile.azureUsername}</UserName>`); }
            break;
        case 'containerRegistry':
            if (profile.containerRegistry) { lines.push(`    <ContainerRegistry>${profile.containerRegistry}</ContainerRegistry>`); }
            if (profile.containerRepository) { lines.push(`    <ContainerRepository>${profile.containerRepository}</ContainerRepository>`); }
            if (profile.containerImageTag) { lines.push(`    <ContainerImageTag>${profile.containerImageTag}</ContainerImageTag>`); }
            if (profile.containerRegistryUsername) { lines.push(`    <ContainerRegistryUsername>${profile.containerRegistryUsername}</ContainerRegistryUsername>`); }
            break;
        case 'webServer':
            if (profile.webDeployServiceUrl) { lines.push(`    <MSDeployServiceURL>${profile.webDeployServiceUrl}</MSDeployServiceURL>`); }
            if (profile.webDeployIisAppPath) { lines.push(`    <DeployIisAppPath>${profile.webDeployIisAppPath}</DeployIisAppPath>`); }
            if (profile.webDeployUsername) { lines.push(`    <UserName>${profile.webDeployUsername}</UserName>`); }
            if (profile.webDeployAllowUntrustedCertificate) { lines.push('    <AllowUntrustedCertificate>true</AllowUntrustedCertificate>'); }
            break;
        case 'sftp':
            if (profile.sftpHost) { lines.push(`    <SftpHost>${profile.sftpHost}</SftpHost>`); }
            if (profile.sftpPort) { lines.push(`    <SftpPort>${profile.sftpPort}</SftpPort>`); }
            if (profile.sftpUsername) { lines.push(`    <SftpUsername>${profile.sftpUsername}</SftpUsername>`); }
            if (profile.sftpRemotePath) { lines.push(`    <SftpRemotePath>${profile.sftpRemotePath}</SftpRemotePath>`); }
            if (profile.sftpAuthMethod) { lines.push(`    <SftpAuthMethod>${profile.sftpAuthMethod}</SftpAuthMethod>`); }
            if (profile.sftpPrivateKeyPath) { lines.push(`    <SftpPrivateKeyPath>${profile.sftpPrivateKeyPath}</SftpPrivateKeyPath>`); }
            break;
        case 'folder':
            break;
    }

    lines.push('  </PropertyGroup>', '</Project>', '');
    return lines.join('\r\n');
}

export async function writePublishProfile(csprojPath: string, profile: PublishProfile): Promise<void> {
    const dir = profilesDir(csprojPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(profilePath(csprojPath, profile.name), renderPublishProfileXml(profile), 'utf8');
}

export async function deletePublishProfile(csprojPath: string, name: string): Promise<void> {
    await fs.promises.rm(profilePath(csprojPath, name), { force: true });
    await fs.promises.rm(profileUserPath(csprojPath, name), { force: true });
}

export async function renamePublishProfile(csprojPath: string, oldName: string, newName: string): Promise<void> {
    const profile = await readPublishProfile(csprojPath, oldName);
    if (!profile) { return; }
    await writePublishProfile(csprojPath, { ...profile, name: newName });
    if (profile.targetType === 'webServer') {
        const password = await readWebDeployPassword(csprojPath, oldName);
        if (password) { await writeWebDeployPassword(csprojPath, newName, password); }
    }
    await deletePublishProfile(csprojPath, oldName);
}

/** Default publish location matching Visual Studio's own convention for a Folder profile. Also used as the local staging folder for azureAppService/sftp profiles before their zip/upload step. */
export function defaultPublishDir(targetFramework: string): string {
    return `bin\\Release\\${targetFramework}\\publish\\`;
}

export function defaultPublishProfile(name: string, targetFramework: string, targetType: PublishTargetType = 'folder'): PublishProfile {
    return {
        name,
        targetType,
        configuration: 'Release',
        targetFramework,
        runtimeIdentifier: '',
        selfContained: false,
        publishDir: defaultPublishDir(targetFramework),
        publishSingleFile: false,
        publishReadyToRun: false,
        publishTrimmed: false,
        includeAllContentForSelfExtract: false,
        enableCompressionInSingleFile: false,
        noDebugSymbols: false,
        sftpPort: targetType === 'sftp' ? 22 : undefined,
        sftpAuthMethod: targetType === 'sftp' ? 'password' : undefined
    };
}

interface TargetFrameworksResult {
    TargetFramework?: string;
    TargetFrameworks?: string;
}

/** Asks MSBuild directly for the project's target framework(s) - correct for both single- and multi-targeted projects, and for anything set conditionally/via Directory.Build.props, the same reasoning as projectAssemblyResolver.ts's resolveProjectInfo. */
export async function listTargetFrameworks(csprojPath: string): Promise<string[]> {
    let stdout: string;
    try {
        stdout = await runDotnet(['msbuild', csprojPath, '-getProperty:TargetFramework,TargetFrameworks', '-nologo'], path.dirname(csprojPath));
    } catch {
        return [];
    }

    const jsonStart = stdout.indexOf('{');
    if (jsonStart < 0) { return []; }
    let parsed: TargetFrameworksResult | undefined;
    try {
        parsed = JSON.parse(stdout.slice(jsonStart))?.Properties;
    } catch {
        return [];
    }
    if (!parsed) { return []; }

    if (parsed.TargetFrameworks) {
        return parsed.TargetFrameworks.split(';').map(f => f.trim()).filter(Boolean);
    }
    return parsed.TargetFramework ? [parsed.TargetFramework] : [];
}
