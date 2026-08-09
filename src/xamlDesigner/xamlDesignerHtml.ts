import * as vscode from 'vscode';
import { getInteractionScript } from './xamlDesignerInteraction';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

/**
 * Static shell only - frame updates and errors arrive later via
 * webview.postMessage from xamlDesignerPanel.ts, not by re-rendering this
 * HTML, so the image doesn't flicker/reset between saves.
 */
export function getXamlDesignerHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src data:;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>XAML Preview</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            box-sizing: border-box;
        }
        #status {
            padding: 8px 16px;
            font-size: 12px;
            opacity: 0.7;
            flex-shrink: 0;
        }
        #status.error {
            opacity: 1;
            color: var(--vscode-errorForeground);
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
        }
        #canvas {
            position: relative;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: auto;
            padding: 16px;
            box-sizing: border-box;
        }
        #preview-wrap {
            position: relative;
            display: inline-block;
            line-height: 0;
        }
        #preview {
            display: none;
            box-shadow: 0 0 0 1px var(--vscode-panel-border);
        }
        .selection-box {
            display: none;
            position: absolute;
            box-sizing: border-box;
            border: 1.5px solid var(--vscode-focusBorder, #007fd4);
            background: transparent;
            cursor: move;
        }
        .handle {
            position: absolute;
            width: 8px;
            height: 8px;
            margin: -5px;
            background: var(--vscode-focusBorder, #007fd4);
            border: 1px solid var(--vscode-editor-background);
            box-sizing: border-box;
        }
        .handle-nw { top: 0; left: 0; cursor: nwse-resize; }
        .handle-n  { top: 0; left: 50%; cursor: ns-resize; }
        .handle-ne { top: 0; left: 100%; cursor: nesw-resize; }
        .handle-e  { top: 50%; left: 100%; cursor: ew-resize; }
        .handle-se { top: 100%; left: 100%; cursor: nwse-resize; }
        .handle-s  { top: 100%; left: 50%; cursor: ns-resize; }
        .handle-sw { top: 100%; left: 0; cursor: nesw-resize; }
        .handle-w  { top: 50%; left: 0; cursor: ew-resize; }
        #drag-error {
            display: none;
            position: absolute;
            bottom: 8px;
            left: 50%;
            transform: translateX(-50%);
            padding: 4px 10px;
            font-size: 12px;
            border-radius: 3px;
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground, var(--vscode-foreground));
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div id="status">Loading preview…</div>
    <div id="canvas">
        <div id="preview-wrap">
            <img id="preview" alt="XAML preview">
            <div id="selection-box" class="selection-box">
                <div class="handle handle-nw" data-handle="nw"></div>
                <div class="handle handle-n" data-handle="n"></div>
                <div class="handle handle-ne" data-handle="ne"></div>
                <div class="handle handle-e" data-handle="e"></div>
                <div class="handle handle-se" data-handle="se"></div>
                <div class="handle handle-s" data-handle="s"></div>
                <div class="handle handle-sw" data-handle="sw"></div>
                <div class="handle handle-w" data-handle="w"></div>
            </div>
        </div>
        <div id="drag-error"></div>
    </div>
    <script nonce="${nonce}">
        const status = document.getElementById('status');
        const img = document.getElementById('preview');

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loading':
                    status.className = '';
                    status.textContent = 'Rendering…';
                    break;
                case 'frame':
                    img.src = message.dataUrl;
                    img.style.display = 'inline-block';
                    status.className = '';
                    status.textContent = 'Static preview — code-behind not executed';
                    break;
                case 'error':
                    img.style.display = 'none';
                    status.className = 'error';
                    status.textContent = message.message;
                    break;
            }
        });
    </script>
    <script nonce="${nonce}">${getInteractionScript()}</script>
</body>
</html>`;
}
