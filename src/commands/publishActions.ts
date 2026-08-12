import * as path from 'path';
import { runDotnetTask } from './buildActions';
import { PublishProfile, writePublishProfile } from '../utils/publishProfiles';

/**
 * Saves the profile, then restores and publishes against it via `-p:PublishProfile=<name>` - the
 * same mechanism Visual Studio's own Publish button uses, so this only works because
 * publishProfiles.ts writes a real, VS-schema `.pubxml` first. Restore runs as its own explicit
 * step before `--no-restore` publish for the same reason runBuildAction does (see its comment):
 * `dotnet publish`'s implicit restore doesn't reliably see Configuration/RuntimeIdentifier-
 * conditional MSBuild properties, and a RuntimeIdentifier is exactly the kind of property publish
 * itself introduces - restoring without it explicitly passed first can leave the wrong (or no)
 * runtime-specific assets in project.assets.json.
 */
export async function publishProject(csprojPath: string, projectName: string, profile: PublishProfile): Promise<boolean> {
    await writePublishProfile(csprojPath, profile);

    const restoreArgs = ['restore', csprojPath, `-p:Configuration=${profile.configuration}`];
    if (profile.runtimeIdentifier) { restoreArgs.push('-r', profile.runtimeIdentifier); }

    const restored = await runDotnetTask(csprojPath, restoreArgs, `.NET Publish Restore: ${projectName}`);
    if (!restored) { return false; }

    return runDotnetTask(
        csprojPath,
        ['publish', csprojPath, '-c', profile.configuration, `-p:PublishProfile=${profile.name}`, '--no-restore'],
        `.NET Publish: ${projectName} (${profile.name})`
    );
}

/** The absolute path a profile's PublishDir resolves to, for "Reveal in File Explorer"-style affordances after a successful publish. */
export function resolvePublishDirAbsolute(csprojPath: string, publishDir: string): string {
    return path.isAbsolute(publishDir) ? publishDir : path.resolve(path.dirname(csprojPath), publishDir);
}
