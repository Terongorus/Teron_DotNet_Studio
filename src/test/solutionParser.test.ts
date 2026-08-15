import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSolutionProjects, findNearestSolutionFile } from '../utils/solutionParser';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'dotnet-studio-sln-test-'));
}

suite('solutionParser', () => {
    test('parseSolutionProjects finds .slnx member projects, including nested in a solution folder', async () => {
        const dir = makeTempDir();
        const slnxPath = path.join(dir, 'Sample.slnx');
        fs.writeFileSync(slnxPath, `<Solution>
  <Project Path="AppA\\AppA.csproj" />
  <Folder Name="Solution Items">
    <Project Path="Nested\\AppB\\AppB.csproj" />
  </Folder>
</Solution>`);

        const projects = await parseSolutionProjects(slnxPath);

        assert.strictEqual(projects.length, 2);
        assert.ok(projects.some(p => p === path.resolve(dir, 'AppA', 'AppA.csproj')));
        assert.ok(projects.some(p => p === path.resolve(dir, 'Nested', 'AppB', 'AppB.csproj')));

        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('parseSolutionProjects finds classic .sln project entries, excluding solution-folder pseudo-entries', async () => {
        const dir = makeTempDir();
        const slnPath = path.join(dir, 'Sample.sln');
        fs.writeFileSync(slnPath, [
            'Microsoft Visual Studio Solution File, Format Version 12.00',
            'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "AppA", "AppA\\AppA.csproj", "{11111111-1111-1111-1111-111111111111}"',
            'EndProject',
            'Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Solution Items", "Solution Items", "{22222222-2222-2222-2222-222222222222}"',
            'EndProject',
            'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "AppB", "Nested\\AppB\\AppB.csproj", "{33333333-3333-3333-3333-333333333333}"',
            'EndProject'
        ].join('\n'));

        const projects = await parseSolutionProjects(slnPath);

        assert.strictEqual(projects.length, 2);
        assert.ok(projects.some(p => p === path.resolve(dir, 'AppA', 'AppA.csproj')));
        assert.ok(projects.some(p => p === path.resolve(dir, 'Nested', 'AppB', 'AppB.csproj')));

        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('parseSolutionProjects returns an empty array for a missing file rather than throwing', async () => {
        const projects = await parseSolutionProjects('C:\\does\\not\\exist.slnx');
        assert.deepStrictEqual(projects, []);
    });

    test('findNearestSolutionFile walks up from a nested project folder to find the .slnx', () => {
        const dir = makeTempDir();
        const projectDir = path.join(dir, 'src', 'AppA');
        fs.mkdirSync(projectDir, { recursive: true });
        const slnxPath = path.join(dir, 'Sample.slnx');
        fs.writeFileSync(slnxPath, '<Solution></Solution>');

        const found = findNearestSolutionFile(projectDir);

        assert.strictEqual(found, slnxPath);

        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('findNearestSolutionFile returns undefined when no .sln/.slnx exists above', () => {
        const dir = makeTempDir();

        const found = findNearestSolutionFile(dir);

        assert.strictEqual(found, undefined);

        fs.rmSync(dir, { recursive: true, force: true });
    });
});
