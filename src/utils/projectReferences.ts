import * as fs from 'fs';
import * as path from 'path';
import { runDotnet } from './process';

const PROJECT_REFERENCE = /<ProjectReference\s+Include="([^"]+)"/g;

/** Extracts <ProjectReference> target paths from a .csproj, resolved to absolute paths - mirrors solutionParser.ts's regex-extraction style. */
export async function parseProjectReferences(projectPath: string): Promise<string[]> {
    let content: string;
    try {
        content = await fs.promises.readFile(projectPath, 'utf8');
    } catch {
        return [];
    }

    const projectDir = path.dirname(projectPath);
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = PROJECT_REFERENCE.exec(content)) !== null) {
        const relativePath = match[1].replace(/\\/g, path.sep);
        results.push(path.resolve(projectDir, relativePath));
    }

    return results;
}

export async function addProjectReference(projectPath: string, targetProjectPath: string): Promise<void> {
    await runDotnet(['add', projectPath, 'reference', targetProjectPath]);
}

export async function removeProjectReference(projectPath: string, targetProjectPath: string): Promise<void> {
    await runDotnet(['remove', projectPath, 'reference', targetProjectPath]);
}
