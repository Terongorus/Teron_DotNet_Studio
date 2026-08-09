/**
 * Client-side (webview) select/move/resize interaction for the XAML designer preview.
 * Plain JS template literal, not a bundled/compiled file - matches the existing
 * hand-written-webview-JS convention (see the inline <script> in xamlDesignerHtml.ts),
 * no new build step needed.
 *
 * The extension host owns all WPF/XAML domain knowledge; this script only ever reports
 * "moved/resized from bounds A to bounds B" in device pixels (the same coordinate space
 * the rendered PNG uses) and lets xamlDesignerPanel.ts/RenderHost.cs decide what that
 * means for the actual XAML (Canvas.Left/Top vs. Margin, etc).
 */
export function getInteractionScript(): string {
    return `
(function () {
    const vscode = acquireVsCodeApi();
    const img = document.getElementById('preview');
    const box = document.getElementById('selection-box');
    const dragError = document.getElementById('drag-error');

    /** { path, bounds: {x,y,width,height} } in image-pixel space, or null when nothing is selected. */
    let selection = null;
    /** In-progress move/resize, or null between drags - never sent over the wire until mouseup. */
    let drag = null;
    let dragErrorTimeout;

    // The image's rendered CSS size changes with VS Code's own editor zoom level, so this
    // is recomputed on every use rather than assumed to be 1:1.
    function imagePixelsPerCssPixel() {
        const rect = img.getBoundingClientRect();
        return rect.width > 0 ? img.naturalWidth / rect.width : 1;
    }

    function showSelectionBox(bounds) {
        const scale = imagePixelsPerCssPixel();
        box.style.left = (bounds.x / scale) + 'px';
        box.style.top = (bounds.y / scale) + 'px';
        box.style.width = (bounds.width / scale) + 'px';
        box.style.height = (bounds.height / scale) + 'px';
        box.style.display = 'block';
    }

    function hideSelectionBox() {
        box.style.display = 'none';
        selection = null;
    }

    function showDragError(message) {
        clearTimeout(dragErrorTimeout);
        dragError.textContent = message;
        dragError.style.display = 'block';
        dragErrorTimeout = setTimeout(() => { dragError.style.display = 'none'; }, 4000);
    }

    // A click lands on the raw <img> only when it's NOT on the selection box/a handle
    // (those are separate, later-painted DOM elements that capture the event first) - so
    // this can only ever mean "select whatever's under this point," never a
    // rubber-band/draw-new-selection gesture (out of scope for this milestone).
    img.addEventListener('mousedown', event => {
        const rect = img.getBoundingClientRect();
        const scale = imagePixelsPerCssPixel();
        const x = (event.clientX - rect.left) * scale;
        const y = (event.clientY - rect.top) * scale;
        vscode.postMessage({ command: 'selectAt', x, y });
    });

    box.addEventListener('mousedown', event => {
        if (!selection) { return; }
        event.preventDefault();
        event.stopPropagation();

        const handle = event.target.dataset ? event.target.dataset.handle : undefined;
        drag = {
            kind: handle ? 'resize' : 'move',
            handle,
            scale: imagePixelsPerCssPixel(),
            startClientX: event.clientX,
            startClientY: event.clientY,
            startBounds: Object.assign({}, selection.bounds),
            currentBounds: Object.assign({}, selection.bounds)
        };
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);
    });

    function onDragMove(event) {
        if (!drag) { return; }

        const dx = (event.clientX - drag.startClientX) * drag.scale;
        const dy = (event.clientY - drag.startClientY) * drag.scale;

        const bounds = Object.assign({}, drag.startBounds);
        if (drag.kind === 'move') {
            bounds.x = drag.startBounds.x + dx;
            bounds.y = drag.startBounds.y + dy;
        } else {
            applyResizeDelta(bounds, drag.handle, dx, dy, drag.startBounds);
        }

        drag.currentBounds = bounds;
        showSelectionBox(bounds);
    }

    // Opposite-corner/edge anchoring: dragging the top-left handle moves the top-left
    // corner while the bottom-right stays put, etc. - standard crop-tool behavior.
    function applyResizeDelta(bounds, handle, dx, dy, start) {
        if (handle.indexOf('w') >= 0) { bounds.x = start.x + dx; bounds.width = start.width - dx; }
        if (handle.indexOf('e') >= 0) { bounds.width = start.width + dx; }
        if (handle.indexOf('n') >= 0) { bounds.y = start.y + dy; bounds.height = start.height - dy; }
        if (handle.indexOf('s') >= 0) { bounds.height = start.height + dy; }

        // Never let a drag invert the box - clamp rather than send a negative size.
        if (bounds.width < 1) { bounds.width = 1; }
        if (bounds.height < 1) { bounds.height = 1; }
    }

    function onDragEnd() {
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        if (!drag) { return; }

        const path = selection.path;
        const kind = drag.kind;
        const bounds = drag.currentBounds;
        drag = null;

        vscode.postMessage({ command: 'commitTransform', path, kind, bounds });
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'selection':
                if (message.path && message.bounds) {
                    selection = { path: message.path, bounds: message.bounds };
                    showSelectionBox(message.bounds);
                } else {
                    hideSelectionBox();
                }
                break;
            case 'frame':
            case 'error':
                // The element behind the current selection may have just moved, resized,
                // or disappeared entirely (this commit's own result, or an unrelated save
                // elsewhere) - never leave a stale overlay pointing at outdated bounds.
                hideSelectionBox();
                break;
            case 'commitRejected':
                showDragError(message.message || 'Could not apply that change.');
                // Revert to wherever the box was before this drag started.
                if (selection) { showSelectionBox(selection.bounds); }
                break;
        }
    });
})();
`;
}
