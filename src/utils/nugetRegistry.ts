const SERVICE_INDEX_URL = 'https://api.nuget.org/v3/index.json';
const FLAT_CONTAINER_BASE = 'https://api.nuget.org/v3-flatcontainer';

export interface NugetSearchResult {
    id: string;
    version: string;
    description: string;
    totalDownloads: number;
}

interface ServiceIndexResource {
    '@id': string;
    '@type': string;
}

let cachedSearchEndpoint: Promise<string> | undefined;

/**
 * Resolves the live SearchQueryService URL from NuGet's stable service index
 * rather than hardcoding a search host directly - NuGet's own docs warn the
 * search host has rotated before, while the service index itself is a
 * permanent, documented entry point. Cached for the extension's lifetime.
 */
function resolveSearchEndpoint(): Promise<string> {
    if (!cachedSearchEndpoint) {
        cachedSearchEndpoint = (async () => {
            const response = await fetch(SERVICE_INDEX_URL);
            if (!response.ok) {
                throw new Error(`NuGet service index request failed: ${response.status} ${response.statusText}`);
            }
            const body = await response.json() as { resources: ServiceIndexResource[] };
            const resource = body.resources?.find(r => r['@type']?.startsWith('SearchQueryService'));
            if (!resource) {
                throw new Error('NuGet service index did not list a SearchQueryService resource.');
            }
            return resource['@id'];
        })();

        cachedSearchEndpoint.catch(() => { cachedSearchEndpoint = undefined; });
    }

    return cachedSearchEndpoint;
}

export async function searchPackages(query: string, take = 20): Promise<NugetSearchResult[]> {
    const endpoint = await resolveSearchEndpoint();
    const url = `${endpoint}?q=${encodeURIComponent(query)}&take=${take}&prerelease=false`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`NuGet search failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.json() as { data: Array<Record<string, unknown>> };
    return (body.data ?? []).map(entry => ({
        id: String(entry.id ?? ''),
        version: String(entry.version ?? ''),
        description: String(entry.description ?? entry.summary ?? ''),
        totalDownloads: Number(entry.totalDownloads ?? 0)
    })).filter(result => result.id.length > 0);
}

/** Includes prerelease versions - the version dropdown lets the user pick any of them explicitly. */
export async function getPackageVersions(packageId: string): Promise<string[]> {
    const url = `${FLAT_CONTAINER_BASE}/${packageId.toLowerCase()}/index.json`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not fetch versions for ${packageId}: ${response.status} ${response.statusText}`);
    }

    const body = await response.json() as { versions: string[] };
    return (body.versions ?? []).slice().sort(compareVersionsDescending);
}

/** Naive numeric-part comparison, newest first - not full SemVer2 prerelease precedence, just good display ordering. */
function compareVersionsDescending(a: string, b: string): number {
    const partsA = a.split(/[.\-]/).map(p => parseInt(p, 10));
    const partsB = b.split(/[.\-]/).map(p => parseInt(p, 10));
    const length = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < length; i++) {
        const numA = Number.isNaN(partsA[i]) ? 0 : (partsA[i] ?? 0);
        const numB = Number.isNaN(partsB[i]) ? 0 : (partsB[i] ?? 0);
        if (numA !== numB) { return numB - numA; }
    }
    return b.localeCompare(a);
}
