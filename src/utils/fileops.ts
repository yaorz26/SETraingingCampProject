import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * Read the content of a text file.
 */
export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Write content to a text file, creating parent directories if needed.
 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if a file or directory exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Atomically write content to a file using a temp file + rename strategy.
 * Ensures that the target file never contains partial or corrupted content.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpName = `.${base}.${randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    // On Windows, rename may fail if the target exists, so we need to handle cross-device scenarios
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}
