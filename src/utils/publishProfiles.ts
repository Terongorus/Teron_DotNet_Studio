import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from './process';

/**
 * A subset of Visual Studio's own Folder publish profile schema
 * (`Properties/PublishProfiles/<name>.pubxml`) - reading/writing exactly this shape (not a
 * superset with extra extension-specific properties) keeps a profile created here fully
 * round-trippable through Visual Studio's own Publish UI and vice versa.
 */
export interface PublishProfile {
    /** File name without the `.pubxml` extension - not itself a property inside the file. */
    name: string;
    configuration: string;
    targetFramework: string;
    /** Empty string means "Portable" (framework-dependent, no specific runtime) - VS omits the `<RuntimeIdentifier>` element entirely in that case, which this mirrors. */
    runtimeIdentifier: string;
    selfContained: boolean;
    publishDir: string;
    publishSingleFile: boolean;
    publishReadyToRun: boolean;
    publishTrimmed: boolean;
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

export async function readPublishProfile(csprojPath: string, name: string): Promise<PublishProfile | undefined> {
    let xml: string;
    try {
        xml = await fs.promises.readFile(profilePath(csprojPath, name), 'utf8');
    } catch {
        return undefined;
    }

    return {
        name,
        configuration: extractElement(xml, 'Configuration') ?? 'Release',
        targetFramework: extractElement(xml, 'TargetFramework') ?? '',
        runtimeIdentifier: extractElement(xml, 'RuntimeIdentifier') ?? '',
        selfContained: extractElement(xml, 'SelfContained') === 'true',
        publishDir: extractElement(xml, 'PublishDir') ?? '',
        publishSingleFile: extractElement(xml, 'PublishSingleFile') === 'true',
        publishReadyToRun: extractElement(xml, 'PublishReadyToRun') === 'true',
        publishTrimmed: extractElement(xml, 'PublishTrimmed') === 'true'
    };
}

/** Renders exactly the elements Visual Studio itself writes for a Folder profile - RuntimeIdentifier is omitted (not written as empty) for a portable/framework-dependent profile, matching VS's own output byte-for-byte in that case. */
function renderPublishProfileXml(profile: PublishProfile): string {
    const lines: string[] = [
        '<Project>',
        '  <PropertyGroup>',
        `    <Configuration>${profile.configuration}</Configuration>`,
        '    <Platform>Any CPU</Platform>',
        `    <TargetFramework>${profile.targetFramework}</TargetFramework>`,
        `    <PublishDir>${profile.publishDir}</PublishDir>`,
        '    <PublishProtocol>FileSystem</PublishProtocol>',
        '    <_TargetId>Folder</_TargetId>',
        `    <SelfContained>${profile.selfContained}</SelfContained>`
    ];
    if (profile.runtimeIdentifier) {
        lines.push(`    <RuntimeIdentifier>${profile.runtimeIdentifier}</RuntimeIdentifier>`);
    }
    if (profile.publishSingleFile) { lines.push('    <PublishSingleFile>true</PublishSingleFile>'); }
    if (profile.publishReadyToRun) { lines.push('    <PublishReadyToRun>true</PublishReadyToRun>'); }
    if (profile.publishTrimmed) { lines.push('    <PublishTrimmed>true</PublishTrimmed>'); }
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
}

export async function renamePublishProfile(csprojPath: string, oldName: string, newName: string): Promise<void> {
    const profile = await readPublishProfile(csprojPath, oldName);
    if (!profile) { return; }
    await writePublishProfile(csprojPath, { ...profile, name: newName });
    await deletePublishProfile(csprojPath, oldName);
}

/** Default publish location matching Visual Studio's own convention for a Folder profile. */
export function defaultPublishDir(targetFramework: string): string {
    return `bin\\Release\\${targetFramework}\\publish\\`;
}

export function defaultPublishProfile(name: string, targetFramework: string): PublishProfile {
    return {
        name,
        configuration: 'Release',
        targetFramework,
        runtimeIdentifier: '',
        selfContained: false,
        publishDir: defaultPublishDir(targetFramework),
        publishSingleFile: false,
        publishReadyToRun: false,
        publishTrimmed: false
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
