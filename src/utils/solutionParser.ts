import * as fs from 'fs';
import * as path from 'path';

const SLNX_PROJECT_PATH = /<Project\s+Path="([^"]+)"/g;
const SLN_PROJECT_LINE = /^Project\("\{[^}]+\}"\)\s*=\s*"[^"]+",\s*"([^"]+\.csproj)",/gm;

/**
 * Extracts the member .csproj paths from a .sln/.slnx file, resolved to
 * absolute paths. Regex-based rather than a full parser, matching this
 * codebase's existing "lightweight extraction over a real XML/solution
 * parser for one narrow, well-known shape" convention (see
 * projectAssemblyResolver.ts's extractXmlValue).
 */
export async function parseSolutionProjects(solutionPath: string): Promise<string[]> {
    let content: string;
    try {
        content = await fs.promises.readFile(solutionPath, 'utf8');
    } catch {
        return [];
    }

    const solutionDir = path.dirname(solutionPath);
    const isSlnx = solutionPath.toLowerCase().endsWith('.slnx');
    const pattern = isSlnx ? SLNX_PROJECT_PATH : SLN_PROJECT_LINE;

    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
        const relativePath = match[1].replace(/\\/g, path.sep);
        results.push(path.resolve(solutionDir, relativePath));
    }

    return results;
}

/**
 * Walks up from a starting folder looking for the nearest .sln/.slnx - used
 * both by the project status bar item and projectPicker's cold-start
 * solution auto-derive, so both stay consistent with the same logic.
 */
export function findNearestSolutionFile(startDir: string): string | undefined {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
        if (!fs.existsSync(dir)) { break; }

        const sln = fs.readdirSync(dir).find(entry => {
            const lower = entry.toLowerCase();
            return lower.endsWith('.sln') || lower.endsWith('.slnx');
        });
        if (sln) {
            return path.join(dir, sln);
        }

        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}
