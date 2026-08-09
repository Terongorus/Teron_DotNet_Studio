/**
 * Message vocabulary for the named-pipe protocol spoken with the
 * designer-host helper process (designer-host/Protocol.cs). Newline-delimited
 * JSON, camelCase - keep both sides in sync by hand, there's no shared schema
 * generation for this spike.
 */

export interface LoadXamlRequest {
    type: 'loadXaml';
    requestId: string;
    xamlText: string;
    filePath?: string;
    /** Built DLL for the .xaml file's containing project, if one could be located - lets the
     *  helper resolve clr-namespace: references to the project's own converters/controls. */
    assemblyPath?: string;
    /** Raw text of the project's App.xaml, if found - its <Application.Resources> are merged
     *  into the helper's own Application.Resources so app-level StaticResources resolve. */
    appXamlText?: string;
}

export interface ShutdownRequest {
    type: 'shutdown';
}

export interface SelectAtRequest {
    type: 'selectAt';
    requestId: string;
    /** Identifies which of this process's (possibly several, one per open panel) rendered documents to hit-test against. */
    filePath?: string;
    x: number;
    y: number;
}

export type TransformKind = 'move' | 'resize';

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CommitTransformRequest {
    type: 'commitTransform';
    requestId: string;
    /** Identifies which of this process's (possibly several, one per open panel) rendered documents to commit against. */
    filePath?: string;
    path: string;
    kind: TransformKind;
    bounds: Bounds;
}

export type OutboundMessage = LoadXamlRequest | ShutdownRequest | SelectAtRequest | CommitTransformRequest;

export interface ReadyMessage {
    type: 'ready';
}

export interface FrameMessage {
    type: 'frame';
    requestId: string;
    width: number;
    height: number;
    pngBase64: string;
}

/** path/bounds are both undefined when the point hit nothing trackable (e.g. empty canvas background) - not an error, just "nothing there". */
export interface SelectionMessage {
    type: 'selection';
    requestId: string;
    path?: string;
    bounds?: Bounds;
}

export interface TransformResultMessage {
    type: 'transformResult';
    requestId: string;
    width: number;
    height: number;
    pngBase64: string;
    /** The real file content to write back through VS Code's document API - the helper never touches the file on disk itself. */
    xamlText: string;
}

export interface ErrorMessage {
    type: 'error';
    requestId: string;
    message: string;
    stack?: string;
}

export type InboundMessage = ReadyMessage | FrameMessage | SelectionMessage | TransformResultMessage | ErrorMessage;
