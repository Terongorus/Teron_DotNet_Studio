import * as vscode from 'vscode';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

export function getResourceMonitorHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>.NET Resource Monitor</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
        }
        .idle {
            opacity: 0.6;
            font-size: 13px;
        }
        .stats {
            display: none;
            flex-direction: column;
            gap: 12px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }
        .stat-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            opacity: 0.7;
        }
        .stat-value {
            font-size: 15px;
            font-variant-numeric: tabular-nums;
        }
    </style>
</head>
<body>
    <p class="idle" id="idle">No active .NET debug session.</p>
    <div class="stats" id="stats">
        <div class="stat-row"><span class="stat-label">Uptime</span><span class="stat-value" id="uptime">-</span></div>
        <div class="stat-row"><span class="stat-label">CPU</span><span class="stat-value" id="cpu">-</span></div>
        <div class="stat-row"><span class="stat-label">Memory</span><span class="stat-value" id="memory">-</span></div>
    </div>
    <script nonce="${nonce}">
        const idleEl = document.getElementById('idle');
        const statsEl = document.getElementById('stats');
        const uptimeEl = document.getElementById('uptime');
        const cpuEl = document.getElementById('cpu');
        const memoryEl = document.getElementById('memory');

        function formatUptime(ms) {
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return minutes + ':' + String(seconds).padStart(2, '0');
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command !== 'stats') { return; }

            const stats = message.stats;
            if (!stats) {
                idleEl.style.display = 'block';
                statsEl.style.display = 'none';
                return;
            }

            idleEl.style.display = 'none';
            statsEl.style.display = 'flex';
            uptimeEl.textContent = formatUptime(stats.uptimeMs);
            cpuEl.textContent = stats.cpuPercent.toFixed(1) + '%';
            memoryEl.textContent = (stats.memoryBytes / (1024 * 1024)).toFixed(1) + ' MB';
        });
    </script>
</body>
</html>`;
}
