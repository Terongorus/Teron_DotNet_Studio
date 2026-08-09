import * as vscode from 'vscode';
import { MAX_SAMPLES } from '../utils/processStats';

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
        .content {
            display: none;
        }
        .session {
            font-size: 12px;
            opacity: 0.7;
            margin-bottom: 16px;
            font-variant-numeric: tabular-nums;
        }
        .chart-block {
            margin-bottom: 20px;
        }
        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 4px;
        }
        .chart-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            opacity: 0.7;
        }
        .chart-value {
            font-size: 14px;
            font-variant-numeric: tabular-nums;
        }
        .chart-wrap {
            position: relative;
            height: 72px;
        }
        canvas {
            width: 100%;
            height: 100%;
            display: block;
        }
        .mem-chart-wrap canvas {
            color: var(--vscode-charts-blue);
        }
        .cpu-chart-wrap canvas {
            color: var(--vscode-charts-orange);
        }
        .axis-label {
            position: absolute;
            right: 4px;
            font-size: 10px;
            font-variant-numeric: tabular-nums;
            color: var(--vscode-charts-foreground);
            opacity: 0.7;
            pointer-events: none;
        }
        .axis-top {
            top: 2px;
        }
        .axis-bottom {
            bottom: 2px;
        }
    </style>
</head>
<body>
    <p class="idle" id="idle">No active .NET debug session.</p>
    <div class="content" id="content">
        <div class="session" id="session">Session: 0:00</div>
        <div class="chart-block">
            <div class="chart-header">
                <span class="chart-label">Process Memory (MB)</span>
                <span class="chart-value" id="memValue">-</span>
            </div>
            <div class="chart-wrap mem-chart-wrap">
                <canvas id="memCanvas"></canvas>
                <span class="axis-label axis-top" id="memMaxLabel">-</span>
                <span class="axis-label axis-bottom">0</span>
            </div>
        </div>
        <div class="chart-block">
            <div class="chart-header">
                <span class="chart-label">CPU (% of all processors)</span>
                <span class="chart-value" id="cpuValue">-</span>
            </div>
            <div class="chart-wrap cpu-chart-wrap">
                <canvas id="cpuCanvas"></canvas>
                <span class="axis-label axis-top">100</span>
                <span class="axis-label axis-bottom">0</span>
            </div>
        </div>
    </div>
    <script nonce="${nonce}">
        const MAX_SAMPLES = ${MAX_SAMPLES};

        const idleEl = document.getElementById('idle');
        const contentEl = document.getElementById('content');
        const sessionEl = document.getElementById('session');
        const memValueEl = document.getElementById('memValue');
        const memMaxLabelEl = document.getElementById('memMaxLabel');
        const memCanvas = document.getElementById('memCanvas');
        const cpuValueEl = document.getElementById('cpuValue');
        const cpuCanvas = document.getElementById('cpuCanvas');

        let samples = [];

        function formatUptime(ms) {
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return minutes + ':' + String(seconds).padStart(2, '0');
        }

        /** Rounds up to a "nice" scale step so the memory chart's axis only grows on real peaks, not every sample. */
        function niceCeiling(value) {
            const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
            for (const step of steps) {
                if (value <= step) { return step; }
            }
            const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
            return Math.ceil(value / magnitude) * magnitude;
        }

        function redraw(canvas, values, yMax) {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.round(rect.width * dpr));
            const height = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== width) { canvas.width = width; }
            if (canvas.height !== height) { canvas.height = height; }

            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);
            if (values.length === 0 || yMax <= 0 || rect.width === 0) { return; }

            const color = getComputedStyle(canvas).color;
            const stepX = rect.width / (MAX_SAMPLES - 1);
            const offset = MAX_SAMPLES - values.length;
            const pointX = i => (offset + i) * stepX;
            const pointY = v => rect.height - (Math.min(v, yMax) / yMax) * rect.height;

            ctx.beginPath();
            values.forEach((v, i) => {
                if (i === 0) { ctx.moveTo(pointX(i), pointY(v)); } else { ctx.lineTo(pointX(i), pointY(v)); }
            });
            ctx.lineTo(pointX(values.length - 1), rect.height);
            ctx.lineTo(pointX(0), rect.height);
            ctx.closePath();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = color;
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            values.forEach((v, i) => {
                if (i === 0) { ctx.moveTo(pointX(i), pointY(v)); } else { ctx.lineTo(pointX(i), pointY(v)); }
            });
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        function render() {
            const hasData = samples.length > 0;
            idleEl.style.display = hasData ? 'none' : 'block';
            contentEl.style.display = hasData ? 'block' : 'none';
            if (!hasData) { return; }

            const latest = samples[samples.length - 1];
            sessionEl.textContent = 'Session: ' + formatUptime(latest.uptimeMs);

            const memValuesMB = samples.map(s => s.memoryBytes / (1024 * 1024));
            const memMax = niceCeiling(Math.max(...memValuesMB) * 1.15);
            memValueEl.textContent = memValuesMB[memValuesMB.length - 1].toFixed(1) + ' MB';
            memMaxLabelEl.textContent = String(memMax);
            redraw(memCanvas, memValuesMB, memMax);

            const cpuValues = samples.map(s => s.cpuPercent);
            cpuValueEl.textContent = cpuValues[cpuValues.length - 1].toFixed(1) + '%';
            redraw(cpuCanvas, cpuValues, 100);
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'history') {
                samples = (message.samples || []).slice(-MAX_SAMPLES);
                render();
            } else if (message.command === 'sample') {
                samples = message.stats ? samples.concat([message.stats]).slice(-MAX_SAMPLES) : [];
                render();
            }
        });

        new ResizeObserver(() => render()).observe(document.body);
    </script>
</body>
</html>`;
}
