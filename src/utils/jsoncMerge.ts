import * as vscode from 'vscode';
import { modify, applyEdits, parse, JSONPath, FormattingOptions } from 'jsonc-parser';

export interface MergeResult {
    text: string;
    addedCount: number;
}

const DEFAULT_FORMATTING: FormattingOptions = { tabSize: 4, insertSpaces: true, eol: '\n' };

/**
 * Appends entries from `candidates` into the array at `arrayPath` inside a
 * JSONC document's text, skipping any whose identity() already matches an
 * existing entry - comment/formatting-preserving (jsonc-parser, the same
 * library VS Code itself uses for this), not a blind JSON.parse/stringify
 * round-trip that would destroy a hand-edited file's comments.
 *
 * `modify` synthesizes the array (and any missing parent objects) if
 * `arrayPath` doesn't exist yet, so there's no need to special-case a
 * missing `tasks`/`inputs`/etc. key. Edits from separate `modify()` calls
 * must not be batched together (they can conflict), so each candidate is
 * applied one at a time against the just-updated text.
 */
export function appendMissingJsoncArrayEntries<T>(
    text: string,
    arrayPath: JSONPath,
    candidates: T[],
    identity: (entry: T) => string,
    formattingOptions: FormattingOptions = DEFAULT_FORMATTING
): MergeResult {
    let current = text.trim().length === 0 ? '{}' : text;

    const root = parse(current) ?? {};
    let node: unknown = root;
    for (const segment of arrayPath) {
        node = node && typeof node === 'object' ? (node as Record<string | number, unknown>)[segment as string | number] : undefined;
    }
    const existingArray = Array.isArray(node) ? (node as T[]) : [];
    const seen = new Set<string>(existingArray.map(identity));

    let addedCount = 0;
    for (const candidate of candidates) {
        const key = identity(candidate);
        if (seen.has(key)) { continue; }
        seen.add(key);

        const edits = modify(current, [...arrayPath, -1], candidate, { formattingOptions, isArrayInsertion: true });
        current = applyEdits(current, edits);
        addedCount++;
    }

    return { text: current, addedCount };
}

/**
 * Same idempotent-append semantics, but for a Global-scope VS Code
 * configuration array (e.g. `launch.configurations`) rather than a raw
 * JSONC document. Reads specifically via `.inspect(key)?.globalValue`, not
 * `.get(key)` - `.get()` returns the scope-*merged* effective value, which
 * inside a workspace that already has its own `.vscode/launch.json` would
 * silently be the *workspace's* array, and writing that back with
 * ConfigurationTarget.Global would copy workspace-specific entries into the
 * user's global settings. `.update()` is a full replace, not a deep merge,
 * so read-modify-write-the-whole-array is required, not optional.
 */
export async function mergeIntoGlobalConfigurationArray<T>(
    section: string,
    key: string,
    candidates: T[],
    identity: (entry: T) => string
): Promise<{ addedCount: number }> {
    const config = vscode.workspace.getConfiguration(section);
    const existing = config.inspect<T[]>(key)?.globalValue ?? [];

    const seen = new Set<string>(existing.map(identity));
    const merged = [...existing];
    let addedCount = 0;

    for (const candidate of candidates) {
        const identityKey = identity(candidate);
        if (seen.has(identityKey)) { continue; }
        seen.add(identityKey);
        merged.push(candidate);
        addedCount++;
    }

    if (addedCount > 0) {
        await config.update(key, merged, vscode.ConfigurationTarget.Global);
    }

    return { addedCount };
}
