import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { dispatchAction, type Action } from '../../../src/core/action-dispatcher.js';

describe('dispatchAction', () => {
  let workspaceRoot: string;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codeharness-test-${randomUUID()}`);
    workspaceRoot = testDir;
    await fs.mkdir(testDir, { recursive: true });
    // Create a test file
    await fs.writeFile(path.join(testDir, 'test.txt'), 'line 1\nline 2\nline 3\nline 4\nline 5\n');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('read_file', () => {
    it('should read full file content', async () => {
      const action: Action = { type: 'read_file', path: 'test.txt' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('line 1');
      expect(result.output).toContain('line 5');
    });

    it('should read file with line range', async () => {
      const action: Action = { type: 'read_file', path: 'test.txt', startLine: 2, endLine: 4 };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('line 2');
      expect(result.output).not.toContain('line 1');
      expect(result.output).not.toContain('line 5');
    });

    it('should return error for non-existent file', async () => {
      const action: Action = { type: 'read_file', path: 'nonexistent.txt' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('write_file', () => {
    it('should write content to a new file', async () => {
      const action: Action = { type: 'write_file', path: 'output.txt', content: 'Hello World' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'output.txt'), 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should overwrite existing file', async () => {
      const action: Action = { type: 'write_file', path: 'test.txt', content: 'overwritten' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'test.txt'), 'utf-8');
      expect(content).toBe('overwritten');
    });

    it('should create parent directories automatically', async () => {
      const action: Action = {
        type: 'write_file',
        path: 'deep/nested/file.ts',
        content: 'content',
      };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'deep/nested/file.ts'), 'utf-8');
      expect(content).toBe('content');
    });
  });

  describe('delete_file', () => {
    it('should delete an existing file', async () => {
      const action: Action = { type: 'delete_file', path: 'test.txt', reason: 'test' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      await expect(fs.access(path.join(workspaceRoot, 'test.txt'))).rejects.toThrow();
    });

    it('should return error for non-existent file', async () => {
      const action: Action = { type: 'delete_file', path: 'nonexistent.txt', reason: 'test' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(false);
    });
  });

  describe('list_dir', () => {
    it('should list directory contents', async () => {
      const action: Action = { type: 'list_dir', path: '.' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('test.txt');
    });

    it('should handle non-existent directory', async () => {
      const action: Action = { type: 'list_dir', path: 'nonexistent' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(false);
    });
  });

  describe('search_file', () => {
    it('should find files matching glob pattern', async () => {
      const action: Action = { type: 'search_file', pattern: '*.txt' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('test.txt');
    });
  });

  describe('grep', () => {
    it('should find matching text in files', async () => {
      const action: Action = { type: 'grep', query: 'line 3', path: '.' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('line 3');
    });
  });

  describe('run_command', () => {
    it('should execute a shell command', async () => {
      const action: Action = { type: 'run_command', command: 'echo hello', reason: 'test' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('hello');
    });

    it('should return error for failed command', async () => {
      const action: Action = { type: 'run_command', command: 'exit 1', reason: 'test' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(false);
    });
  });

  describe('run_tests', () => {
    it('should execute default test command', async () => {
      const action: Action = { type: 'run_tests', command: 'echo "test passed"' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result).toBeDefined();
    }, 10000);
  });

  describe('run_lint', () => {
    it('should execute default lint command', async () => {
      const action: Action = { type: 'run_lint', command: 'echo "lint passed"' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result).toBeDefined();
    }, 10000);
  });

  describe('run_type_check', () => {
    it('should execute default type check command', async () => {
      const action: Action = { type: 'run_type_check', command: 'echo "types ok"' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result).toBeDefined();
    }, 10000);
  });

  describe('ask_user', () => {
    it('should return the question as output', async () => {
      const action: Action = { type: 'ask_user', question: 'What now?' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('What now?');
    });
  });

  describe('finish', () => {
    it('should return success with summary', async () => {
      const action: Action = { type: 'finish', success: true, summary: 'All done' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(true);
      expect(result.output).toContain('All done');
    });

    it('should return failure with summary', async () => {
      const action: Action = { type: 'finish', success: false, summary: 'Cannot complete' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot complete');
    });
  });

  describe('path validation', () => {
    it('should reject paths outside workspace', async () => {
      const action: Action = { type: 'read_file', path: '/etc/passwd' };
      const result = await dispatchAction(action, workspaceRoot);
      expect(result.success).toBe(false);
      expect(result.error).toContain('outside');
    });
  });
});
