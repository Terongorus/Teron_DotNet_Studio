import * as vscode from 'vscode';
import { resolveGlobalToolPath, installGlobalTool } from './formatterTools';
import { CsharpierServer } from './csharpierFormatter';
import { FantomasDaemon } from './fantomasFormatter';
import { showNotInstalledNotice, showInstallFailedNotice, showInstallSucceededNotice, FormatterToolInfo } from './formatterNotifications';

const CSHARPIER: FormatterToolInfo = { displayName: 'CSharpier', packageId: 'csharpier', docsUrl: 'https://csharpier.com/docs/Installation' };
const FANTOMAS: FormatterToolInfo = { displayName: 'Fantomas', packageId: 'fantomas', docsUrl: 'https://fsprojects.github.io/fantomas/docs/end-users/VSCode.html' };

interface Formatter {
    formatDocument(content: string, filePath: string): Promise<string | undefined>;
    dispose(): void;
}

/**
 * Neither SharpLsp nor the Roslyn Language Server provide code formatting (SharpLsp disables its
 * own formatter by design; Roslyn's standalone server has no formatting request handler at all -
 * see KNOWN-LIMITATIONS.md) - this extension drives CSharpier/Fantomas directly instead, the same
 * "no dependency on another VS Code extension" philosophy as every other feature here. Registered
 * unconditionally (not gated on which language server is selected, or even whether one is
 * running at all) since formatting has nothing to do with the language server.
 */
export function registerFormatters(context: vscode.ExtensionContext): void {
    const outputChannel = vscode.window.createOutputChannel('.NET Code Formatter');
    context.subscriptions.push(outputChannel);

    const csharpierCache: { instance: CsharpierServer | undefined } = { instance: undefined };
    const fantomasCache: { instance: FantomasDaemon | undefined } = { instance: undefined };

    async function getOrCreateFormatter<T extends Formatter>(
        tool: FormatterToolInfo,
        cache: { instance: T | undefined },
        create: (executablePath: string) => T
    ): Promise<T | undefined> {
        if (cache.instance) { return cache.instance; }

        let executablePath = resolveGlobalToolPath(tool.packageId);
        if (!executablePath) {
            const choice = await showNotInstalledNotice(context, tool);
            if (choice !== 'install') { return undefined; }

            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Installing ${tool.displayName}...` },
                    () => installGlobalTool(tool.packageId)
                );
            } catch (error: any) {
                showInstallFailedNotice(tool, error.message ?? String(error), outputChannel);
                return undefined;
            }

            executablePath = resolveGlobalToolPath(tool.packageId);
            if (!executablePath) {
                showInstallFailedNotice(tool, 'Installed, but the tool executable still could not be found under .dotnet/tools.', outputChannel);
                return undefined;
            }
            showInstallSucceededNotice(tool);
        }

        cache.instance = create(executablePath);
        return cache.instance;
    }

    function fullDocumentEdit(document: vscode.TextDocument, formatted: string): vscode.TextEdit[] {
        const original = document.getText();
        if (formatted === original) { return []; }
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }

    async function format<T extends Formatter>(
        document: vscode.TextDocument,
        tool: FormatterToolInfo,
        cache: { instance: T | undefined },
        create: (executablePath: string) => T
    ): Promise<vscode.TextEdit[]> {
        if (document.uri.scheme !== 'file') { return []; }

        const formatter = await getOrCreateFormatter(tool, cache, create);
        if (!formatter) { return []; }

        try {
            const formatted = await formatter.formatDocument(document.getText(), document.uri.fsPath);
            return formatted === undefined ? [] : fullDocumentEdit(document, formatted);
        } catch (error: any) {
            outputChannel.appendLine(`${tool.displayName}: ${error.message ?? error}`);
            return [];
        }
    }

    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('csharp', {
        provideDocumentFormattingEdits: document =>
            format(document, CSHARPIER, csharpierCache, executablePath => new CsharpierServer(executablePath, outputChannel))
    }));

    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('fsharp', {
        provideDocumentFormattingEdits: document =>
            format(document, FANTOMAS, fantomasCache, executablePath => new FantomasDaemon(executablePath, outputChannel))
    }));

    context.subscriptions.push({
        dispose() {
            csharpierCache.instance?.dispose();
            fantomasCache.instance?.dispose();
        }
    });
}
