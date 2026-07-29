const WINDOWS_RESERVED_CHARS = /[<>:"|?*]/;

/**
 * Returns an error message if invalid, or null if the name is safe to use as a
 * project/solution name and directory segment.
 */
export function isValidProjectName(name: string): string | null {
    const trimmed = name.trim();

    if (!trimmed) {
        return 'Name cannot be empty.';
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
        return 'Name cannot contain path separators.';
    }
    if (trimmed === '..' || trimmed === '.') {
        return 'Name cannot be "." or "..".';
    }
    if (WINDOWS_RESERVED_CHARS.test(trimmed)) {
        return 'Name cannot contain any of: < > : " | ? *';
    }

    return null;
}

/**
 * Returns an error message if invalid, or null if the string is a well-formed
 * NuGet package ID (alphanumeric plus . _ -).
 */
export function isValidPackageId(id: string): string | null {
    const trimmed = id.trim();

    if (!trimmed) {
        return 'Package ID cannot be empty.';
    }
    if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
        return 'Package ID can only contain letters, numbers, "." "_" and "-".';
    }

    return null;
}
