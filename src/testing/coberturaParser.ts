import * as fs from 'fs';
import * as path from 'path';

export interface CoberturaLine {
    line: number;
    hits: number;
}

export interface CoberturaClassCoverage {
    /** As reported by the tool - relative to one of the report's <source> roots, not necessarily the filesystem's cwd. */
    filename: string;
    /** From the class's own <lines> block specifically, not the per-<method> ones nested inside <methods> (which would double-count the same lines). */
    lines: CoberturaLine[];
}

export interface CoberturaReport {
    sources: string[];
    classes: CoberturaClassCoverage[];
}

const SOURCE_RE = /<source>([^<]*)<\/source>/g;
const CLASS_RE = /<class\s+([^>]*?)>([\s\S]*?)<\/class>/g;
const FILENAME_RE = /filename="([^"]*)"/;
const LINE_RE = /<line\s+number="(\d+)"\s+hits="(\d+)"/g;

/**
 * Parses a `coverage.cobertura.xml` report (coverlet's own default output format) via targeted
 * regex extraction, matching this codebase's existing preference for small, purpose-built parsing
 * over adding an XML library dependency (see projectAssemblyResolver.ts's extractXmlValue). Safe
 * here because Cobertura's `<class>` elements never nest, so a non-greedy match up to the next
 * `</class>` can't accidentally cross a class boundary.
 *
 * The class-level `<lines>` block (as opposed to each `<method>`'s own nested one, covering the
 * same lines) is always the last `<lines>...</lines>` in the class body - it comes after
 * `</methods>` in every real coverlet-produced report - verified against a real coverage run
 * before trusting this, not assumed from the schema alone.
 */
export function parseCoberturaXml(xmlContent: string): CoberturaReport {
    const sources: string[] = [];
    for (const match of xmlContent.matchAll(SOURCE_RE)) { sources.push(match[1].trim()); }

    const classes: CoberturaClassCoverage[] = [];
    for (const classMatch of xmlContent.matchAll(CLASS_RE)) {
        const [, attributes, body] = classMatch;
        const filenameMatch = FILENAME_RE.exec(attributes);
        if (!filenameMatch) { continue; }

        const methodsEnd = body.lastIndexOf('</methods>');
        const classLevelBody = methodsEnd >= 0 ? body.slice(methodsEnd + '</methods>'.length) : body;

        const lines: CoberturaLine[] = [];
        for (const lineMatch of classLevelBody.matchAll(LINE_RE)) {
            lines.push({ line: Number(lineMatch[1]), hits: Number(lineMatch[2]) });
        }

        classes.push({ filename: filenameMatch[1], lines });
    }

    return { sources, classes };
}

/** Tries each <source> root in turn (Cobertura doesn't say which one a given class's filename is relative to when there's more than one) and returns the first that resolves to a real file on disk. */
export function resolveCoberturaFilePath(report: CoberturaReport, classCoverage: CoberturaClassCoverage): string | undefined {
    if (path.isAbsolute(classCoverage.filename) && fs.existsSync(classCoverage.filename)) { return classCoverage.filename; }
    for (const source of report.sources) {
        const candidate = path.resolve(source, classCoverage.filename);
        if (fs.existsSync(candidate)) { return candidate; }
    }
    return undefined;
}
