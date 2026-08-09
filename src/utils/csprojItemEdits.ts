import * as fs from 'fs';
import * as path from 'path';

type MSBuildItemType = 'Compile' | 'Page' | 'EmbeddedResource' | 'None';

/**
 * Heuristic item-type mapping by extension, not full MSBuild evaluation - the
 * same accepted-approximation category as this codebase's other lightweight
 * .csproj/.sln handling (solutionParser.ts, the Solution Explorer file-walk).
 * Wrong for unusual project layouts, right for the overwhelming common case.
 */
function getItemTypeForFile(filePath: string): MSBuildItemType {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.cs') { return 'Compile'; }
    if (ext === '.xaml') { return 'Page'; }
    if (ext === '.resx') { return 'EmbeddedResource'; }
    return 'None';
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excludePattern(itemType: MSBuildItemType, relativePath: string): RegExp {
    return new RegExp(`[ \\t]*<${itemType}\\s+Remove="${escapeRegExp(relativePath)}"\\s*/>\\r?\\n?`);
}

export async function isExcluded(projectPath: string, absoluteFilePath: string): Promise<boolean> {
    let content: string;
    try {
        content = await fs.promises.readFile(projectPath, 'utf8');
    } catch {
        return false;
    }

    const relative = path.relative(path.dirname(projectPath), absoluteFilePath);
    const itemType = getItemTypeForFile(absoluteFilePath);
    return excludePattern(itemType, relative).test(content);
}

/**
 * Adds an explicit `<ItemType Remove="...">` entry so an SDK-style project's
 * implicit glob include stops picking the file up, without touching it on
 * disk - the classic "Exclude From Project." Plain text find/replace against
 * the raw .csproj (a new single-line self-closing element in a new
 * ItemGroup), the same "regex over a full XML parser/writer" philosophy as
 * solutionParser.ts, now applied to writing - a hand-formatted multi-line
 * entry for the same file wouldn't be recognized by includeInProject below,
 * an accepted edge case.
 */
export async function excludeFromProject(projectPath: string, absoluteFilePath: string): Promise<void> {
    if (await isExcluded(projectPath, absoluteFilePath)) { return; }

    const relative = path.relative(path.dirname(projectPath), absoluteFilePath);
    const itemType = getItemTypeForFile(absoluteFilePath);
    const entry = `    <${itemType} Remove="${relative}" />\n`;

    let content = await fs.promises.readFile(projectPath, 'utf8');
    content = content.includes('</Project>')
        ? content.replace('</Project>', `  <ItemGroup>\n${entry}  </ItemGroup>\n</Project>`)
        : `${content}\n<ItemGroup>\n${entry}</ItemGroup>\n`;

    await fs.promises.writeFile(projectPath, content, 'utf8');
}

export async function includeInProject(projectPath: string, absoluteFilePath: string): Promise<void> {
    const relative = path.relative(path.dirname(projectPath), absoluteFilePath);
    const itemType = getItemTypeForFile(absoluteFilePath);

    const content = await fs.promises.readFile(projectPath, 'utf8');
    const updated = content.replace(excludePattern(itemType, relative), '');

    await fs.promises.writeFile(projectPath, updated, 'utf8');
}
