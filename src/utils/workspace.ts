import fs from 'node:fs';
import path from 'node:path';

/**
 * Walk up the directory tree to find the nearest ancestor directory
 * that contains a .git subdirectory.
 *
 * @param startDir - The directory to start searching from
 * @returns The absolute path to the workspace root, or null if not found
 */
export function findWorkspaceRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = path.join(current, '.git');
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // .git does not exist at this level, continue upward
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return null;
    }
    current = parent;
  }
}

/**
 * Check if a given path is within the workspace root.
 * Uses path.resolve to handle relative paths and normalize separators.
 *
 * @param targetPath - The path to check
 * @param workspaceRoot - The workspace root directory
 * @returns true if the resolved path starts with the resolved workspace root
 */
export function isWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const resolvedTarget = path.resolve(workspaceRoot, targetPath);
  const resolvedRoot = path.resolve(workspaceRoot);

  // Ensure trailing separator for accurate prefix matching
  const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  const normalizedTarget = resolvedTarget.endsWith(path.sep) ? resolvedTarget : resolvedTarget;

  return normalizedTarget === resolvedRoot || normalizedTarget.startsWith(normalizedRoot);
}

/**
 * Resolve a path relative to the workspace root.
 * If the path is already absolute, return it as-is.
 *
 * @param filePath - A relative or absolute path
 * @param workspaceRoot - The workspace root directory
 * @returns The resolved absolute path
 */
export function resolveWorkspacePath(filePath: string, workspaceRoot: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(workspaceRoot, filePath);
}
