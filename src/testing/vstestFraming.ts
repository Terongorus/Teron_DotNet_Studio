/**
 * VSTest's design-mode protocol (the same one Visual Studio/Rider use to drive
 * `vstest.console.exe --port:<port> --parentprocessid:<pid>`) frames each JSON message using
 * .NET's `BinaryWriter.Write(string)`/`BinaryReader.ReadString()` format: a 7-bit-encoded
 * (LEB128-style) length prefix over the UTF-8 byte length, followed by the UTF-8 bytes
 * themselves. There's no Node.js/JSON-RPC equivalent (this is .NET's own binary serialization
 * primitive, not a documented wire protocol), so both directions are implemented here.
 * Verified against a real vstest.console process (real xUnit discovery + run, including a
 * failing test) before trusting this, not just against Microsoft's own protocol docs - see
 * project memory for the verification session.
 */

export function encode7BitLength(length: number): Buffer {
    const bytes: number[] = [];
    let value = length;
    do {
        let b = value & 0x7f;
        value >>>= 7;
        if (value !== 0) { b |= 0x80; }
        bytes.push(b);
    } while (value !== 0);
    return Buffer.from(bytes);
}

export function frameMessage(obj: unknown): Buffer {
    const utf8 = Buffer.from(JSON.stringify(obj), 'utf8');
    return Buffer.concat([encode7BitLength(utf8.length), utf8]);
}

export interface VsTestMessage {
    MessageType: string;
    Payload?: unknown;
    Version?: number;
}

/**
 * Incremental decoder over a raw byte stream from the vstest.console socket - messages can
 * arrive split across multiple TCP `data` events (including the length prefix itself), so this
 * buffers until a complete message is available rather than assuming one `data` event is one
 * message.
 */
export class VsTestMessageDecoder {
    private buffer = Buffer.alloc(0);

    constructor(private readonly onMessage: (message: VsTestMessage) => void, private readonly onError: (error: Error) => void) {}

    push(chunk: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.tryParseOne()) { /* drain all complete messages currently buffered */ }
    }

    private tryParseOne(): boolean {
        let pos = 0;
        let length = 0;
        let shift = 0;
        for (;;) {
            if (pos >= this.buffer.length) { return false; } // need more bytes for the length prefix itself
            const b = this.buffer[pos++];
            length |= (b & 0x7f) << shift;
            if ((b & 0x80) === 0) { break; }
            shift += 7;
        }
        if (this.buffer.length < pos + length) { return false; } // need more bytes for the payload

        const jsonBytes = this.buffer.subarray(pos, pos + length);
        this.buffer = this.buffer.subarray(pos + length);

        try {
            this.onMessage(JSON.parse(jsonBytes.toString('utf8')) as VsTestMessage);
        } catch (error: any) {
            this.onError(error instanceof Error ? error : new Error(String(error)));
        }
        return true;
    }
}
