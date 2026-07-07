import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { DiffTracker } from '../../../src/feedback/diff-tracker.js';

describe('DiffTracker', () => {
  let testDir: string;
  let tracker: DiffTracker;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codeharness-diff-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
    tracker = new DiffTracker();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should detect no changes for unchanged file', async () => {
    const filePath = path.join(testDir, 'test.txt');
    await fs.writeFile(filePath, 'original content');
    await tracker.takeSnapshot(filePath);

    const result = await tracker.checkDiff(filePath);
    expect(result.changed).toBe(false);
  });

  it('should detect changes for modified file', async () => {
    const filePath = path.join(testDir, 'test.txt');
    await fs.writeFile(filePath, 'original content');
    await tracker.takeSnapshot(filePath);
    await fs.writeFile(filePath, 'modified content');

    const result = await tracker.checkDiff(filePath);
    expect(result.changed).toBe(true);
    expect(result.details).toContain('modified');
  });

  it('should report expected file as intentional', async () => {
    const filePath = path.join(testDir, 'test.txt');
    await fs.writeFile(filePath, 'original');
    await tracker.takeSnapshot(filePath);
    await fs.writeFile(filePath, 'modified');

    const result = await tracker.checkDiff(filePath, ['test.txt']);
    expect(result.changed).toBe(true);
    expect(result.isExpected).toBe(true);
  });

  it('should warn about unexpected file modifications', async () => {
    const filePath = path.join(testDir, 'unexpected.txt');
    await fs.writeFile(filePath, 'original');
    await tracker.takeSnapshot(filePath);
    await fs.writeFile(filePath, 'modified');

    const result = await tracker.checkDiff(filePath, ['other.txt']);
    expect(result.changed).toBe(true);
    expect(result.isExpected).toBe(false);
  });
});
