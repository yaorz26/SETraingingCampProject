import path from 'path';
import fs from 'fs/promises';
import { readTextFile, atomicWriteFile, fileExists } from '../utils/fileops.js';
import { executeCommand } from '../utils/shell.js';
import { isWithinWorkspace, resolveWorkspacePath } from '../utils/workspace.js';
import type { Action, ActionResult } from './action-parser.js';

const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  '.cache',
  'coverage',
  '.nyc_output',
];

export type { Action, ActionResult };

function validatePath(targetPath: string, workspaceRoot: string): string {
  const resolved = resolveWorkspacePath(targetPath, workspaceRoot);
  if (!isWithinWorkspace(resolved, workspaceRoot)) {
    throw new Error(`Path '${targetPath}' is outside workspace '${workspaceRoot}'`);
  }
  return resolved;
}

export async function dispatchAction(action: Action, workspaceRoot: string): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const result = await executeAction(action, workspaceRoot);
    return {
      action,
      success: true,
      output: result,
      duration: Date.now() - startTime,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return {
      action,
      success: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      error: err.message,
      duration: Date.now() - startTime,
    };
  }
}

async function executeAction(action: Action, workspaceRoot: string): Promise<string> {
  switch (action.type) {
    case 'read_file':
      return readFile(action, workspaceRoot);
    case 'write_file':
      return writeFile(action, workspaceRoot);
    case 'delete_file':
      return deleteFile(action, workspaceRoot);
    case 'list_dir':
      return listDir(action, workspaceRoot);
    case 'search_file':
      return searchFile(action, workspaceRoot);
    case 'grep':
      return grep(action, workspaceRoot);
    case 'run_command':
      return runCommand(action, workspaceRoot);
    case 'run_tests':
      return runTests(action);
    case 'run_lint':
      return runLint(action);
    case 'run_type_check':
      return runTypeCheck(action);
    case 'ask_user':
      return askUser(action);
    case 'finish':
      return finish(action);
  }
}

async function readFile(
  action: Action & { type: 'read_file' },
  workspaceRoot: string,
): Promise<string> {
  const filePath = validatePath(action.path, workspaceRoot);

  if (!(await fileExists(filePath))) {
    throw new Error(`File not found: ${action.path}`);
  }

  const stat = await fs.stat(filePath);
  if (stat.size > 1024 * 1024) {
    throw new Error(`File too large (>1MB): ${action.path}`);
  }

  const content = await readTextFile(filePath);
  const lines = content.split('\n');

  if (action.startLine || action.endLine) {
    const start = (action.startLine ?? 1) - 1;
    const end = action.endLine ?? lines.length;
    const sliced = lines.slice(start, end);
    return sliced.join('\n');
  }

  return content;
}

async function writeFile(
  action: Action & { type: 'write_file' },
  workspaceRoot: string,
): Promise<string> {
  const filePath = validatePath(action.path, workspaceRoot);
  await atomicWriteFile(filePath, action.content);
  return `File written: ${action.path} (${action.content.length} bytes)`;
}

async function deleteFile(
  action: Action & { type: 'delete_file' },
  workspaceRoot: string,
): Promise<string> {
  const filePath = validatePath(action.path, workspaceRoot);

  if (!(await fileExists(filePath))) {
    throw new Error(`File not found: ${action.path}`);
  }

  await fs.unlink(filePath);
  return `File deleted: ${action.path} (reason: ${action.reason})`;
}

async function listDir(
  action: Action & { type: 'list_dir' },
  workspaceRoot: string,
): Promise<string> {
  const dirPath = validatePath(action.path, workspaceRoot);

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const maxEntries = 500;
    const lines: string[] = [];

    for (let i = 0; i < Math.min(entries.length, maxEntries); i++) {
      const entry = entries[i];
      const type = entry.isDirectory() ? 'dir' : 'file';
      lines.push(`${entry.name} (${type})`);
    }

    if (entries.length > maxEntries) {
      lines.push(`... and ${entries.length - maxEntries} more entries (truncated)`);
    }

    return lines.join('\n');
  } catch {
    throw new Error(`Directory not found: ${action.path}`);
  }
}

async function searchFile(
  action: Action & { type: 'search_file' },
  workspaceRoot: string,
): Promise<string> {
  const maxResults = 200;
  const results: string[] = [];
  const excludeSet = new Set(DEFAULT_EXCLUDE_DIRS);

  await searchGlob(workspaceRoot, action.pattern, workspaceRoot, results, maxResults, excludeSet);

  if (results.length === 0) {
    return `No files found matching: ${action.pattern}`;
  }

  if (results.length >= maxResults) {
    results.push(`... and more results (truncated at ${maxResults})`);
  }

  return results.join('\n');
}

function matchGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i',
  );
  return regex.test(filename);
}

async function searchGlob(
  baseDir: string,
  pattern: string,
  workspaceRoot: string,
  results: string[],
  maxResults: number,
  excludeSet: Set<string>,
): Promise<void> {
  if (results.length >= maxResults) return;

  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (excludeSet.has(entry.name)) continue;

    const fullPath = path.join(baseDir, entry.name);
    const relative = path.relative(workspaceRoot, fullPath);

    if (entry.isDirectory()) {
      await searchGlob(fullPath, pattern, workspaceRoot, results, maxResults, excludeSet);
    } else if (matchGlob(entry.name, pattern)) {
      results.push(relative);
    }
  }
}

async function grep(action: Action & { type: 'grep' }, workspaceRoot: string): Promise<string> {
  const searchPath = action.path ? validatePath(action.path, workspaceRoot) : workspaceRoot;
  const maxLines = 500;
  const results: string[] = [];
  const excludeSet = new Set(DEFAULT_EXCLUDE_DIRS);

  try {
    const stat = await fs.stat(searchPath);
    if (stat.isFile()) {
      const content = await readTextFile(searchPath);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && results.length < maxLines; i++) {
        if (lines[i].includes(action.query)) {
          results.push(`${path.relative(workspaceRoot, searchPath)}:${i + 1}: ${lines[i]}`);
        }
      }
    } else {
      await grepDir(searchPath, action.query, workspaceRoot, results, maxLines, excludeSet);
    }

    if (results.length === 0) {
      return `No matches found for: ${action.query}`;
    }

    if (results.length >= maxLines) {
      results.push(`... truncated at ${maxLines} lines`);
    }

    return results.join('\n');
  } catch {
    throw new Error(`Grep failed: path not found or not readable: ${searchPath}`);
  }
}

async function grepDir(
  dirPath: string,
  query: string,
  workspaceRoot: string,
  results: string[],
  maxLines: number,
  excludeSet: Set<string>,
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxLines) return;
    if (excludeSet.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await grepDir(fullPath, query, workspaceRoot, results, maxLines, excludeSet);
    } else if (entry.isFile()) {
      try {
        const content = await readTextFile(fullPath);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && results.length < maxLines; i++) {
          if (lines[i].includes(query)) {
            results.push(`${path.relative(workspaceRoot, fullPath)}:${i + 1}: ${lines[i]}`);
          }
        }
      } catch {
        // Skip binary/unreadable files
      }
    }
  }
}

async function runCommand(
  action: Action & { type: 'run_command' },
  workspaceRoot: string,
): Promise<string> {
  const result = await executeCommand(action.command, [], {
    cwd: workspaceRoot,
    timeout: (action.timeout ?? 60) * 1000,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit code ${result.exitCode}):\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout || result.stderr || '(no output)';
}

async function runTests(action: Action & { type: 'run_tests' }): Promise<string> {
  return runCommand(
    { type: 'run_command', command: action.command ?? 'npm test', reason: 'run tests' },
    process.cwd(),
  );
}

async function runLint(action: Action & { type: 'run_lint' }): Promise<string> {
  return runCommand(
    { type: 'run_command', command: action.command ?? 'npm run lint', reason: 'run lint' },
    process.cwd(),
  );
}

async function runTypeCheck(action: Action & { type: 'run_type_check' }): Promise<string> {
  return runCommand(
    {
      type: 'run_command',
      command: action.command ?? 'npx tsc --noEmit',
      reason: 'run type check',
    },
    process.cwd(),
  );
}

function askUser(action: Action & { type: 'ask_user' }): string {
  let output = `Question: ${action.question}`;
  if (action.context) {
    output += `\nContext: ${action.context}`;
  }
  return output;
}

function finish(action: Action & { type: 'finish' }): string {
  if (!action.success) {
    throw new Error(action.summary);
  }
  return action.summary;
}
