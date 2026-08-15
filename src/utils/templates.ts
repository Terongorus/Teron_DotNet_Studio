import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from './process';

export interface DotnetTemplate {
    name: string;
    shortName: string;
    language: string;
    tags: string;
}

export interface ClassifiedTemplate {
    name: string;
    shortName: string;
    /** Every language the template supports, brackets stripped (e.g. ["C#", "F#", "VB"]). */
    languages: string[];
    /** The language `dotnet new list` marks as the default via [brackets] - falls back to the first language if none is bracketed. */
    primaryLanguage: string;
    /** Recognized platform restrictions (Windows, Android, iOS, ...). Empty when the template doesn't declare one - treated as "runs everywhere" by callers, not "unknown". */
    platforms: string[];
    /** Every Tags token that isn't a recognized platform word (Console, Web, Test, MAUI, ...). */
    types: string[];
}

/**
 * `dotnet new list`'s Language column wraps the default/recommended language in brackets and
 * comma-separates the rest, e.g. "[C#],F#,VB". Splits it into a clean list with brackets removed.
 */
export function parseTemplateLanguages(rawLanguage: string): string[] {
    return rawLanguage.split(',').map(part => part.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
}

/** The bracketed (default) language, or the first listed language if none is bracketed. */
export function primaryTemplateLanguage(rawLanguage: string): string {
    const bracketed = rawLanguage.match(/\[([^\]]+)\]/);
    if (bracketed) { return bracketed[1]; }
    return parseTemplateLanguages(rawLanguage)[0] ?? '';
}

/** `dotnet new list`'s Tags column is a flat "/"-joined list, e.g. "Web/gRPC/API/Service". */
export function parseTemplateTags(rawTags: string): string[] {
    return rawTags.split('/').map(t => t.trim()).filter(Boolean);
}

/**
 * Recognized platform-restriction words, sourced from Visual Studio's own "Create a new
 * project" Platform dropdown (Android/Azure/iOS/Linux/macOS/tvOS/Windows/Xbox) plus two tokens
 * confirmed present in real `dotnet new list` Tags output that VS's dropdown groups under macOS/
 * doesn't surface separately (Mac Catalyst, Tizen). This is a fixed vocabulary of platform
 * *names*, not derived from any one machine's installed templates, so a template installed later
 * classifies correctly as long as it uses one of these words - only a genuinely novel platform
 * name would fall through to the Type bucket instead.
 */
const PLATFORM_TAG_WORDS = new Set(['Windows', 'Linux', 'macOS', 'Mac Catalyst', 'Android', 'iOS', 'tvOS', 'Xbox', 'Azure', 'Tizen']);

/**
 * `dotnet new list` doesn't tag WinForms/WPF templates with "Windows" at all (unlike MAUI, which
 * does) despite them being unambiguously Windows-only - these short names are stable, official
 * .NET SDK template identifiers, so this closes that specific, known gap without guessing at
 * platform words for templates that haven't been seen yet.
 */
const KNOWN_WINDOWS_ONLY_SHORT_NAMES = new Set([
    'winforms', 'winformslib', 'winformscontrollib',
    'wpf', 'wpflib', 'wpfcustomcontrollib', 'wpfusercontrollib'
]);

export function classifyTemplate(template: DotnetTemplate): ClassifiedTemplate {
    const shortName = firstShortName(template);
    const tagTokens = parseTemplateTags(template.tags);
    const platforms = new Set(tagTokens.filter(tag => PLATFORM_TAG_WORDS.has(tag)));
    if (KNOWN_WINDOWS_ONLY_SHORT_NAMES.has(shortName)) { platforms.add('Windows'); }

    return {
        name: template.name,
        shortName,
        languages: parseTemplateLanguages(template.language),
        primaryLanguage: primaryTemplateLanguage(template.language),
        platforms: [...platforms],
        types: tagTokens.filter(tag => !PLATFORM_TAG_WORDS.has(tag))
    };
}

/**
 * Parses the tabular output of `dotnet new list`. Columns are separated by
 * 2+ spaces; the header/data split is marked by a line of dashes.
 */
export function parseTemplateListOutput(stdout: string): DotnetTemplate[] {
    const templates: DotnetTemplate[] = [];
    const lines = stdout.split('\n');
    let isParsing = false;

    for (const line of lines) {
        if (line.startsWith('---')) {
            isParsing = true;
            continue;
        }

        if (isParsing && line.trim().length > 0) {
            const columns = line.split(/ {2,}/);
            if (columns.length >= 2) {
                templates.push({
                    name: columns[0].trim(),
                    shortName: columns[1].trim(),
                    language: columns.length >= 3 ? columns[2].trim() : '',
                    tags: columns.length >= 4 ? columns[3].trim() : ''
                });
            }
        }
    }

    return templates;
}

/**
 * Several templates register more than one short name (e.g. "webapp,razor",
 * "gitignore,.gitignore"). `dotnet new` expects a single one.
 */
export function firstShortName(template: DotnetTemplate): string {
    return template.shortName.split(',')[0].trim();
}

export async function getProjectTemplates(): Promise<DotnetTemplate[]> {
    const stdout = await runDotnet(['new', 'list', '--type', 'project']);
    return parseTemplateListOutput(stdout);
}

/**
 * The scaffold-level templates that `--type project` deliberately excludes
 * (.gitignore, .editorconfig, NuGet.Config, solution files, etc). Neither
 * `--type item` nor `--type solution` isolates this set cleanly, so it's
 * identified by Tags instead.
 */
export async function getSolutionFileTemplates(): Promise<DotnetTemplate[]> {
    const stdout = await runDotnet(['new', 'list']);
    return parseTemplateListOutput(stdout).filter(t => t.tags === 'Config' || t.tags === 'Solution');
}

const FIXED_SCAFFOLD_FILENAMES: Record<string, string> = {
    'gitignore': '.gitignore',
    'gitattributes': '.gitattributes',
    'editorconfig': '.editorconfig',
    'globaljson': 'global.json',
    'nugetconfig': 'NuGet.Config',
    'webconfig': 'Web.config',
    'tool-manifest': path.join('.config', 'dotnet-tools.json'),
    'buildprops': 'Directory.Build.props',
    'buildtargets': 'Directory.Build.targets',
    'packagesprops': 'Directory.Packages.props'
};

export interface ExistingScaffoldFile {
    template: DotnetTemplate;
    filePath: string;
}

/**
 * Given the scaffold templates and a target folder, returns only the ones
 * that actually exist on disk there, with their resolved file path.
 */
export function getExistingScaffoldFiles(templates: DotnetTemplate[], folder: string): ExistingScaffoldFile[] {
    const found: ExistingScaffoldFile[] = [];

    for (const template of templates) {
        const shortName = firstShortName(template);

        if (shortName === 'sln' || shortName === 'slnf') {
            const extension = shortName === 'sln' ? ['.sln', '.slnx'] : ['.slnf'];
            const entries = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
            for (const entry of entries) {
                if (extension.includes(path.extname(entry))) {
                    found.push({ template, filePath: path.join(folder, entry) });
                }
            }
            continue;
        }

        const fixedName = FIXED_SCAFFOLD_FILENAMES[shortName];
        if (fixedName) {
            const filePath = path.join(folder, fixedName);
            if (fs.existsSync(filePath)) {
                found.push({ template, filePath });
            }
        }
    }

    return found;
}
