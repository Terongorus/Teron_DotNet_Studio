import * as fs from 'fs';
import SftpClient from 'ssh2-sftp-client';

/**
 * SFTP has no MSBuild/dotnet CLI equivalent to shell out to (unlike every other publish target
 * in this feature) and has never been a real Visual Studio publish target at all - this is a
 * .NET Studio-original addition. Uses ssh2-sftp-client (a pure-JS SSH2 client, independent of and
 * unrelated to the C library `libssh2` used by curl/git) rather than shelling out to a system sftp
 * client, since Windows doesn't ship OpenSSH's client by default and scripting its interactive
 * prompts from a Task would be fragile.
 */
export interface SftpUploadOptions {
    host: string;
    port: number;
    username: string;
    remotePath: string;
    localDir: string;
    password?: string;
    privateKeyPath?: string;
    privateKeyPassphrase?: string;
    onProgress?: (message: string) => void;
}

export async function uploadDirectoryViaSftp(options: SftpUploadOptions): Promise<void> {
    if (!options.password && !options.privateKeyPath) {
        throw new Error('SFTP publish needs either a password or a private key.');
    }

    const client = new SftpClient();
    try {
        const connectConfig: {
            host: string;
            port: number;
            username: string;
            password?: string;
            privateKey?: Buffer;
            passphrase?: string;
        } = {
            host: options.host,
            port: options.port,
            username: options.username
        };

        if (options.privateKeyPath) {
            connectConfig.privateKey = await fs.promises.readFile(options.privateKeyPath);
            if (options.privateKeyPassphrase) { connectConfig.passphrase = options.privateKeyPassphrase; }
        } else {
            connectConfig.password = options.password;
        }

        options.onProgress?.(`Connecting to ${options.host}...`);
        await client.connect(connectConfig);

        options.onProgress?.(`Uploading to ${options.remotePath}...`);
        await client.uploadDir(options.localDir, options.remotePath);
    } finally {
        // Best-effort - a failed disconnect shouldn't mask the real upload result/error above.
        await client.end().catch(() => { /* ignore */ });
    }
}
