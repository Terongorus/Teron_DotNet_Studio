import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from './process';

export interface DotnetTemplate {
    name: string;
    shortName: string;
    language: string;
    tags: string;
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
