import * as vscode from 'vscode';
import * as path from 'path';
import { runDotnet } from '../utils/process';

export interface TestProjectInfo {
    csprojPath: string;
    /** The built assembly VSTest actually discovers/runs against - resolved the same way projectAssemblyResolver.ts does (a real MSBuild query, not a bin/ convention guess), since a test project can have a custom OutputPath too. */
    targetPath: string | undefined;
}

interface TestProjectPropertiesResult {
    IsTestProject?: string;
    TargetPath?: string;
    TargetFrameworks?: string;
}

async function queryTestProjectInfo(csprojPath: string, configuration: string, targetFramework?: string): Promise<TestProjectInfo | undefined> {
    const args = [
        'msbuild', csprojPath,
        '-getProperty:IsTestProject,TargetPath,TargetFrameworks',
        `-p:Configuration=${configuration}`,
        '-nologo'
    ];
    if (targetFramework) { args.push(`-p:TargetFramework=${targetFramework}`); }

    let stdout: string;
    try {
        stdout = await runDotnet(args, path.dirname(csprojPath));
    } catch {
        return undefined;
    }

    const jsonStart = stdout.indexOf('{');
    if (jsonStart < 0) { return undefined; }
    let parsed: { Properties?: TestProjectPropertiesResult } | undefined;
    try {
        parsed = JSON.parse(stdout.slice(jsonStart));
    } catch {
        return undefined;
    }

    const properties = parsed?.Properties;
    if (properties?.IsTestProject !== 'true') { return undefined; }

    if (!properties.TargetPath && !targetFramework && properties.TargetFrameworks) {
        // Multi-targeted project - same retry-with-first-framework approach as projectAssemblyResolver.ts.
        const first = properties.TargetFrameworks.split(';')[0]?.trim();
        if (first) { return queryTestProjectInfo(csprojPath, configuration, first); }
    }

    return {
        csprojPath,
        targetPath: properties.TargetPath ? path.resolve(path.dirname(csprojPath), properties.TargetPath) : undefined
    };
}

/**
 * Finds every real test project (`IsTestProject == true`, the property `Microsoft.NET.Test.Sdk`
 * itself sets - the same signal VS/Rider use, not a guess based on naming conventions like
 * `*.Tests.csproj`) under a workspace folder. Deliberately excludes bin/obj so a stale/copied
 * .csproj left in build output never gets discovered as a second copy of the same project.
 */
export async function findTestProjects(folder: vscode.WorkspaceFolder, configuration: string): Promise<TestProjectInfo[]> {
    const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.{csproj,fsproj}'),
        '**/{bin,obj,node_modules}/**'
    );

    const results = await Promise.all(found.map(uri => queryTestProjectInfo(uri.fsPath, configuration)));
    return results.filter((info): info is TestProjectInfo => info !== undefined);
}
