import * as vscode from 'vscode';

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
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: auto;
            padding: 16px;
            box-sizing: border-box;
        }
        #preview {
            display: none;
            box-shadow: 0 0 0 1px var(--vscode-panel-border);
        }
    </style>
</head>
<body>
    <div id="status">Loading preview…</div>
    <div id="canvas">
        <img id="preview" alt="XAML preview">
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
</body>
</html>`;
}
