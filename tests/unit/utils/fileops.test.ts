import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  readTextFile,
  writeTextFile,
  fileExists,
  ensureDir,
  atomicWriteFile,
} from '../../../src/utils/fileops.js';

describe('readTextFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should read the content of a file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(filePath, 'hello world', 'utf-8');
    const content = await readTextFile(filePath);
    expect(content).toBe('hello world');
  });

  it('should throw when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.txt');
    await expect(readTextFile(filePath)).rejects.toThrow();
  });
});

describe('writeTextFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should write content to a file', async () => {
    const filePath = path.join(tmpDir, 'output.txt');
    await writeTextFile(filePath, 'test content');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('test content');
  });

  it('should create parent directories if needed', async () => {
    const filePath = path.join(tmpDir, 'a', 'b', 'c', 'output.txt');
    await writeTextFile(filePath, 'nested');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('nested');
  });

  it('should overwrite existing files', async () => {
    const filePath = path.join(tmpDir, 'overwrite.txt');
    await writeTextFile(filePath, 'original');
    await writeTextFile(filePath, 'updated');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('updated');
  });
});

describe('fileExists', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return true for existing file', async () => {
    const filePath = path.join(tmpDir, 'exists.txt');
    await fs.writeFile(filePath, 'data');
    const exists = await fileExists(filePath);
    expect(exists).toBe(true);
  });

  it('should return false for missing file', async () => {
    const filePath = path.join(tmpDir, 'missing.txt');
    const exists = await fileExists(filePath);
    expect(exists).toBe(false);
  });
});

describe('ensureDir', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create directory if not exists', async () => {
    const dirPath = path.join(tmpDir, 'newdir');
    await ensureDir(dirPath);
    const stat = await fs.stat(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should not throw if directory already exists', async () => {
    const dirPath = path.join(tmpDir, 'existing');
    await fs.mkdir(dirPath);
    await expect(ensureDir(dirPath)).resolves.not.toThrow();
  });
});

describe('atomicWriteFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should write file atomically', async () => {
    const filePath = path.join(tmpDir, 'atomic.txt');
    await atomicWriteFile(filePath, 'atomic content');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('atomic content');

    // Verify no temp file left behind
    const files = await fs.readdir(tmpDir);
    const tempFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tempFiles).toHaveLength(0);
  });

  it('should not leave partial content on failure', async () => {
    // Create a file where a directory is expected to simulate write failure
    const blocker = path.join(tmpDir, 'blocker');
    await fs.writeFile(blocker, 'block');
    const filePath = path.join(tmpDir, 'blocker', 'should-fail.txt');

    await expect(atomicWriteFile(filePath, 'content')).rejects.toThrow();

    // Verify the target file does not exist
    const exists = await fileExists(filePath);
    expect(exists).toBe(false);
  });
});
