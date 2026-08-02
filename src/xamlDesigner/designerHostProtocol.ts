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

export type OutboundMessage = LoadXamlRequest | ShutdownRequest;

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

export interface ErrorMessage {
    type: 'error';
    requestId: string;
    message: string;
    stack?: string;
}

export type InboundMessage = ReadyMessage | FrameMessage | ErrorMessage;
