import * as vscode from 'vscode';
import * as path from 'path';
import { findTestProjects, TestProjectInfo } from './testProjectFinder';
import { resolveVsTestConsolePath } from './vstestConsoleLocator';
import { VsTestSession, VsTestCase, VsTestResult } from './vstestClient';
import { runDotnetTask } from '../commands/buildActions';
import { isUpToDate } from '../utils/buildUpToDateCheck';
import { getCurrentConfiguration } from '../utils/configurationPicker';

let outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) { outputChannel = vscode.window.createOutputChannel('.NET Test Explorer'); }
    return outputChannel;
}

/** Everything needed to correlate a VS Code TestItem back to the VSTest data it came from. */
interface TestItemData {
    kind: 'project' | 'class' | 'test';
    project: TestProjectInfo;
    /** Only present for kind: 'test' - the exact case VSTest needs for TestExecution.RunSelectedWithDefaultHost. */
    vsTestCase?: VsTestCase;
}

export function registerTestController(context: vscode.ExtensionContext): void {
    const controller = vscode.tests.createTestController('dotnet-creator.tests', '.NET Tests');
    context.subscriptions.push(controller);

    const itemData = new WeakMap<vscode.TestItem, TestItemData>();

    async function discoverAllProjects(): Promise<void> {
        controller.items.replace([]);

        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const configuration = getCurrentConfiguration(folder);
            const projects = await findTestProjects(folder, configuration);

            for (const project of projects) {
                if (!project.targetPath) { continue; }
                const projectName = path.basename(project.csprojPath, path.extname(project.csprojPath));
                const projectItem = controller.createTestItem(`project:${project.csprojPath}`, projectName, vscode.Uri.file(project.csprojPath));
                itemData.set(projectItem, { kind: 'project', project });
                controller.items.add(projectItem);

                await discoverProjectTests(project, projectItem, itemData, new Map());
            }
        }
    }

    async function discoverProjectTests(
        project: TestProjectInfo,
        projectItem: vscode.TestItem,
        data: WeakMap<vscode.TestItem, TestItemData>,
        classItems: Map<string, vscode.TestItem>
    ): Promise<void> {
        if (!project.targetPath) { return; }

        const vstestConsolePath = await resolveVsTestConsolePath(path.dirname(project.csprojPath));
        if (!vstestConsolePath) {
            getOutputChannel().appendLine(`[${path.basename(project.csprojPath)}] Could not locate vstest.console.dll - skipping discovery.`);
            return;
        }

        const channel = getOutputChannel();
        let session: VsTestSession | undefined;
        try {
            session = await VsTestSession.start(vstestConsolePath, channel);
            await session.discoverTests([project.targetPath], cases => {
                for (const testCase of cases) {
                    addTestItem(projectItem, project, testCase, data, classItems);
                }
            });
        } catch (error: any) {
            channel.appendLine(`[${path.basename(project.csprojPath)}] Discovery failed: ${error.message}`);
        } finally {
            session?.dispose();
        }
    }

    function addTestItem(
        projectItem: vscode.TestItem,
        project: TestProjectInfo,
        testCase: VsTestCase,
        data: WeakMap<vscode.TestItem, TestItemData>,
        classItems: Map<string, vscode.TestItem>
    ): void {
        const lastDot = testCase.FullyQualifiedName.lastIndexOf('.');
        const className = lastDot >= 0 ? testCase.FullyQualifiedName.slice(0, lastDot) : testCase.FullyQualifiedName;

        let classItem = classItems.get(className);
        if (!classItem) {
            classItem = controller.createTestItem(`class:${project.csprojPath}:${className}`, className);
            data.set(classItem, { kind: 'class', project });
            projectItem.children.add(classItem);
            classItems.set(className, classItem);
        }

        const uri = testCase.CodeFilePath ? vscode.Uri.file(testCase.CodeFilePath) : undefined;
        const testItem = controller.createTestItem(testCase.Id, testCase.DisplayName, uri);
        if (testCase.CodeFilePath && testCase.LineNumber > 0) {
            const line = testCase.LineNumber - 1;
            testItem.range = new vscode.Range(line, 0, line, 0);
        }
        data.set(testItem, { kind: 'test', project, vsTestCase: testCase });
        classItem.children.add(testItem);
    }

    controller.resolveHandler = async item => {
        if (!item) { await discoverAllProjects(); }
    };
    controller.refreshHandler = async () => discoverAllProjects();

    /** Walks a selected TestItem (project/class/test) down to the individual test cases it covers - a project or class node in the tree isn't itself runnable, VSTest only understands concrete test cases. */
    function collectTestCases(item: vscode.TestItem, results: VsTestCase[]): void {
        const data = itemData.get(item);
        if (data?.vsTestCase) {
            results.push(data.vsTestCase);
            return;
        }
        item.children.forEach(child => collectTestCases(child, results));
    }

    async function runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> {
        const run = controller.createTestRun(request);
        const channel = getOutputChannel();

        const rootItems: vscode.TestItem[] = [];
        if (request.include) {
            rootItems.push(...request.include);
        } else {
            controller.items.forEach(i => rootItems.push(i));
        }

        const casesByProject = new Map<string, { project: TestProjectInfo; cases: VsTestCase[] }>();
        for (const rootItem of rootItems) {
            const data = itemData.get(rootItem);
            if (!data) { continue; }
            const cases: VsTestCase[] = [];
            collectTestCases(rootItem, cases);
            const existing = casesByProject.get(data.project.csprojPath);
            if (existing) { existing.cases.push(...cases); } else { casesByProject.set(data.project.csprojPath, { project: data.project, cases }); }
        }

        // Map VSTest's own case Id straight back to the TestItem instead of re-walking the tree per result.
        const itemsById = new Map<string, vscode.TestItem>();
        const indexItems = (item: vscode.TestItem) => {
            const data = itemData.get(item);
            if (data?.vsTestCase) { itemsById.set(data.vsTestCase.Id, item); }
            item.children.forEach(indexItems);
        };
        controller.items.forEach(indexItems);

        for (const { project, cases } of casesByProject.values()) {
            if (token.isCancellationRequested) { break; }
            if (cases.length === 0 || !project.targetPath) { continue; }

            const projectName = path.basename(project.csprojPath, path.extname(project.csprojPath));
            const configuration = getCurrentConfiguration(
                vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.csprojPath)) ?? vscode.workspace.workspaceFolders![0]
            );

            cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.enqueued(item); } });

            const built = await isUpToDate(project.csprojPath, configuration)
                || await runDotnetTask(project.csprojPath, ['build', project.csprojPath, '-c', configuration, '--no-restore'], `.NET Test Build: ${projectName}`);
            if (!built) {
                cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.errored(item, new vscode.TestMessage('Build failed - see the build task output.')); } });
                continue;
            }

            const vstestConsolePath = await resolveVsTestConsolePath(path.dirname(project.csprojPath));
            if (!vstestConsolePath) {
                cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.errored(item, new vscode.TestMessage('Could not locate vstest.console.dll.')); } });
                continue;
            }

            cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.started(item); } });

            let session: VsTestSession | undefined;
            try {
                session = await VsTestSession.start(vstestConsolePath, channel);
                await session.runTests(cases, (results: VsTestResult[]) => reportResults(results, itemsById, run));
            } catch (error: any) {
                cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.errored(item, new vscode.TestMessage(error.message)); } });
            } finally {
                session?.dispose();
            }
        }

        run.end();
    }

    function reportResults(results: VsTestResult[], itemsById: Map<string, vscode.TestItem>, run: vscode.TestRun): void {
        for (const result of results) {
            const item = itemsById.get(result.TestCase.Id);
            if (!item) { continue; }

            const durationMs = parseVsTestDuration(result.Duration);
            switch (result.Outcome) {
                case 1: // Passed
                    run.passed(item, durationMs);
                    break;
                case 2: { // Failed
                    const text = result.ErrorStackTrace
                        ? `${result.ErrorMessage ?? 'Test failed.'}\n\n${result.ErrorStackTrace}`
                        : (result.ErrorMessage ?? 'Test failed.');
                    run.failed(item, new vscode.TestMessage(text), durationMs);
                    break;
                }
                case 3: // Skipped
                    run.skipped(item);
                    break;
                default:
                    run.errored(item, new vscode.TestMessage(result.ErrorMessage ?? 'Unknown outcome.'), durationMs);
            }
        }
    }

    controller.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandler, true);

    void discoverAllProjects();
}

function parseVsTestDuration(duration: string): number | undefined {
    // VSTest reports Duration as a .NET TimeSpan string, e.g. "00:00:00.3070997".
    const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(duration);
    if (!match) { return undefined; }
    const [, hours, minutes, seconds] = match;
    return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
}
