import * as vscode from 'vscode';
import { showXamlDesigner } from '../xamlDesigner/xamlDesignerPanel';

/**
 * Explorer/editor context menus pass a real vscode.Uri as the command
 * argument, but a third-party TreeView (e.g. ReSharper's Solution Explorer)
 * passes its own internal tree-item object instead, with the real Uri
 * nested at `.resourceUri` - there's no shared contract for this across
 * extensions, so both shapes need to be handled explicitly.
 */
function resolveClickedUri(arg: unknown): vscode.Uri | undefined {
    if (arg instanceof vscode.Uri) { return arg; }
    if (arg && typeof arg === 'object' && 'resourceUri' in arg) {
        const resourceUri = (arg as { resourceUri?: unknown }).resourceUri;
        if (resourceUri instanceof vscode.Uri) { return resourceUri; }
    }
    return undefined;
}

export function registerXamlDesignerCommand(context: vscode.ExtensionContext) {
    // Context-menu invocations (Explorer, editor context, editor tab, and
    // third-party trees like ReSharper's Solution Explorer) pass the clicked
    // resource as the first argument - falls back to the active editor for
    // the Command Palette, and a file picker if neither applies.
    //
    // The ReSharper Solution Explorer's context menu entry can't be scoped to
    // .xaml specifically (VS Code only exposes the *active editor's* resource
    // to view/item/context `when` clauses, not the right-clicked tree item's
    // own resourceUri - github.com/microsoft/vscode/issues/45067), so it's
    // deliberately shown on every file there; a wrong-extension click here is
    // reported directly rather than falling through to a surprising file-picker.
    const disposable = vscode.commands.registerCommand('dotnet-studio.previewXamlDesigner', async (clickedArg?: unknown) => {
        const clickedUri = resolveClickedUri(clickedArg);

        if (clickedArg && !clickedUri) {
            // Something was clicked, but we couldn't find a file Uri on it
            // (e.g. a solution/project/folder node, not a file) - nothing to preview.
            return;
        }

        if (clickedUri && !clickedUri.fsPath.toLowerCase().endsWith('.xaml')) {
            vscode.window.showWarningMessage('"Preview XAML (Live)" only applies to .xaml files.');
            return;
        }

        const activeUri = clickedUri ?? vscode.window.activeTextEditor?.document.uri;
        let uri = activeUri?.fsPath.toLowerCase().endsWith('.xaml') ? activeUri : undefined;

        if (!uri) {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'XAML files': ['xaml'] },
                title: 'Preview XAML File'
            });
            uri = picked?.[0];
        }

        if (!uri) { return; }

        showXamlDesigner(context, uri);
    });

    context.subscriptions.push(disposable);
}
