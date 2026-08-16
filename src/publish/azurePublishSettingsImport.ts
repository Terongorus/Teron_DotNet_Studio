import * as fs from 'fs';

/**
 * Parses a `.PublishSettings` file - the same file Visual Studio's own "Import publish settings"
 * flow consumes, downloadable from the Azure Portal (App Service > Overview > Get publish
 * profile). It's a small, stable, well-known XML schema (a `<publishData>` root with one
 * `<publishProfile ...>` per publish method, each an attribute bag rather than nested elements),
 * so this uses a targeted attribute regex rather than pulling in a general XML library - the same
 * "no XML dependency, parse only the fixed shape actually needed" approach publishProfiles.ts
 * already takes for `.pubxml`, just attribute- instead of element-based since that's this file's
 * real shape.
 */
export interface AzureZipDeployCredentials {
    /** Kudu SCM base URL, e.g. `https://myapp.scm.azurewebsites.net` - ready to append `/api/zipdeploy` to. */
    publishUrl: string;
    siteName: string;
    userName: string;
    /** Never persisted to the .pubxml - the caller is expected to hand this to context.secrets and discard it. */
    password: string;
}

function parseAttributes(attrText: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRegex = /([\w-]+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(attrText))) {
        attrs[match[1]] = match[2];
    }
    return attrs;
}

/** Prefers a ZipDeploy profile entry (no local tooling needed); falls back to MSDeploy's own publishUrl/credentials if no ZipDeploy entry exists, since MSDeploy profiles point at the same Kudu host/credentials and the SCM zipdeploy endpoint accepts the same auth. */
export function parsePublishSettingsForZipDeploy(xml: string): AzureZipDeployCredentials | undefined {
    const profiles: Record<string, string>[] = [];
    const profileTagRegex = /<publishProfile\b([^>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = profileTagRegex.exec(xml))) {
        profiles.push(parseAttributes(match[1]));
    }

    const chosen = profiles.find(p => p.publishMethod === 'ZipDeploy') ?? profiles.find(p => p.publishMethod === 'MSDeploy');
    if (!chosen?.publishUrl || !chosen.userName || !chosen.userPWD) { return undefined; }

    // publishUrl is host[:port] (e.g. "myapp.scm.azurewebsites.net:443"), not a full URL.
    const host = chosen.publishUrl.split(':')[0];
    if (!host) { return undefined; }

    return {
        publishUrl: `https://${host}`,
        siteName: chosen.msdeploySite ?? '',
        userName: chosen.userName,
        password: chosen.userPWD
    };
}

export async function readAndParsePublishSettingsFile(fsPath: string): Promise<AzureZipDeployCredentials | undefined> {
    const xml = await fs.promises.readFile(fsPath, 'utf8');
    return parsePublishSettingsForZipDeploy(xml);
}
