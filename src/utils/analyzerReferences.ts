import * as fs from 'fs';

const ANALYZER_PACKAGE_REFERENCE = /<PackageReference\s+Include="([^"]+)"[^>]*OutputItemType="Analyzer"/g;

/** Detects packages referenced as Roslyn analyzers/source generators via the standard OutputItemType="Analyzer" MSBuild attribute. */
export async function parseAnalyzerReferences(projectPath: string): Promise<string[]> {
    let content: string;
    try {
        content = await fs.promises.readFile(projectPath, 'utf8');
    } catch {
        return [];
    }

    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = ANALYZER_PACKAGE_REFERENCE.exec(content)) !== null) {
        results.push(match[1]);
    }

    return results;
}
