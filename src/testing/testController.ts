import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findTestProjects, TestProjectInfo } from './testProjectFinder';
import { resolveVsTestConsolePath } from './vstestConsoleLocator';
import { VsTestSession, VsTestCase, VsTestResult, VsTestAttachmentSet } from './vstestClient';
import { resolveCoverletCollectorPath, hasCoverletCollectorReference, buildCoverageRunSettings } from './coverletCollector';
import { parseCoberturaXml, resolveCoberturaFilePath } from './coberturaParser';
import { runDotnetTask } from '../commands/buildActions';
import { isUpToDate } from '../utils/buildUpToDateCheck';
import { getCurrentConfiguration } from '../utils/configurationPicker';
import { addOrUpdatePackage } from '../utils/nugetPackages';

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
    const controller = vscode.tests.createTestController('dotnet-studio.tests', '.NET Tests');
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
            session = await VsTestSession.start(vstestConsolePath, channel, path.dirname(project.csprojPath));
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

    /** Ensures `coverlet.collector` is referenced by the project before a coverage run - prompts to add it if missing, matching this extension's existing "nothing installs without an explicit action" pattern (SharpLsp/netcoredbg downloads, publish's own profile creation). Returns the resolved collector path to pass as TestAdaptersPaths, or undefined if it's missing and the user declined (or the add failed). */
    async function ensureCoverletCollector(project: TestProjectInfo): Promise<string | undefined> {
        const existing = await resolveCoverletCollectorPath(project.csprojPath);
        if (existing) { return existing; }

        const csprojContent = await fs.promises.readFile(project.csprojPath, 'utf8').catch(() => '');
        if (!hasCoverletCollectorReference(csprojContent)) {
            const projectName = path.basename(project.csprojPath, path.extname(project.csprojPath));
            const choice = await vscode.window.showWarningMessage(
                `Code coverage needs "coverlet.collector", which ${projectName} doesn't reference yet. Add it now?`,
                'Add Package', 'Cancel'
            );
            if (choice !== 'Add Package') { return undefined; }

            try {
                await addOrUpdatePackage(project.csprojPath, 'coverlet.collector');
            } catch (error: any) {
                getOutputChannel().appendLine(`[${projectName}] Failed to add coverlet.collector: ${error.message}`);
                return undefined;
            }
        }

        // Either just added (dotnet add package restores automatically) or referenced but not yet
        // resolved for some other reason (e.g. a stale/missing obj/project.assets.json) - one more
        // restore covers both without assuming which case this is.
        await runDotnetTask(project.csprojPath, ['restore', project.csprojPath], `.NET Test Restore: ${path.basename(project.csprojPath)}`);
        return resolveCoverletCollectorPath(project.csprojPath);
    }

    /** Reads and applies a coverage.cobertura.xml's per-line data to the given TestRun, attributing it to whichever real files it actually resolves to on disk. */
    async function applyCoverage(attachmentSets: VsTestAttachmentSet[], run: vscode.TestRun): Promise<void> {
        const coverageAttachment = attachmentSets
            .find(set => set.Uri.toLowerCase().startsWith('datacollector://microsoft/coverletcodecoverage/') || set.DisplayName === 'XPlat code coverage')
            ?.Attachments.find(a => a.Uri.endsWith('.cobertura.xml'));
        if (!coverageAttachment) { return; }

        const reportPath = vscode.Uri.parse(coverageAttachment.Uri).fsPath;
        let xmlContent: string;
        try {
            xmlContent = await fs.promises.readFile(reportPath, 'utf8');
        } catch (error: any) {
            getOutputChannel().appendLine(`Failed to read coverage report at ${reportPath}: ${error.message}`);
            return;
        }

        const report = parseCoberturaXml(xmlContent);
        for (const classCoverage of report.classes) {
            const filePath = resolveCoberturaFilePath(report, classCoverage);
            if (!filePath || classCoverage.lines.length === 0) { continue; }

            const details = classCoverage.lines.map(l => new vscode.StatementCoverage(l.hits, new vscode.Position(l.line - 1, 0)));
            run.addCoverage(vscode.FileCoverage.fromDetails(vscode.Uri.file(filePath), details));
        }
    }

    async function runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken, withCoverage: boolean): Promise<void> {
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

            let runSettings: string | undefined;
            if (withCoverage) {
                const collectorPath = await ensureCoverletCollector(project);
                if (!collectorPath) {
                    cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.skipped(item); } });
                    continue;
                }
                runSettings = buildCoverageRunSettings(collectorPath);
            }

            cases.forEach(c => { const item = itemsById.get(c.Id); if (item) { run.started(item); } });

            let session: VsTestSession | undefined;
            try {
                session = await VsTestSession.start(vstestConsolePath, channel, path.dirname(project.csprojPath));
                const { attachmentSets } = await session.runTests(cases, (results: VsTestResult[]) => reportResults(results, itemsById, run), runSettings);
                if (withCoverage) { await applyCoverage(attachmentSets, run); }
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

    controller.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, (request, token) => runHandler(request, token, false), true);
    controller.createRunProfile('Run Tests with Coverage', vscode.TestRunProfileKind.Coverage, (request, token) => runHandler(request, token, true), false);

    void discoverAllProjects();
}

function parseVsTestDuration(duration: string): number | undefined {
    // VSTest reports Duration as a .NET TimeSpan string, e.g. "00:00:00.3070997".
    const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(duration);
    if (!match) { return undefined; }
    const [, hours, minutes, seconds] = match;
    return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
}
