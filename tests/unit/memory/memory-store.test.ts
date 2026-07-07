import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { MemoryManager } from '../../../src/memory/memory-store.js';

describe('MemoryManager', () => {
  let testDir: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codeharness-memory-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
    manager = new MemoryManager(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should load empty memory for new project', async () => {
    const memory = await manager.load();
    expect(memory.tasks).toHaveLength(0);
    expect(memory.preferences).toEqual({});
    expect(memory.conventions).toEqual({});
  });

  it('should save and load memory', async () => {
    await manager.updateTaskHistory('Task 1', 'success');
    await manager.updateUserPreferences({ preferredLanguage: 'TypeScript' });
    await manager.updateProjectConventions({ lintRule: 'strict' });

    const memory = await manager.load();
    expect(memory.tasks).toHaveLength(1);
    expect(memory.tasks[0].description).toBe('Task 1');
    expect(memory.preferences).toEqual({ preferredLanguage: 'TypeScript' });
    expect(memory.conventions).toEqual({ lintRule: 'strict' });
  });

  it('should keep only last 10 tasks', async () => {
    for (let i = 0; i < 15; i++) {
      await manager.updateTaskHistory(`Task ${i}`, 'success');
    }
    const memory = await manager.load();
    expect(memory.tasks).toHaveLength(10);
    expect(memory.tasks[0].description).toBe('Task 5');
    expect(memory.tasks[9].description).toBe('Task 14');
  });

  it('should generate correct summary', async () => {
    await manager.updateTaskHistory('Fixed login bug', 'success');
    await manager.updateTaskHistory('Added unit tests', 'success');
    await manager.updateUserPreferences({ preferredLanguage: 'TypeScript' });

    const summary = await manager.summarizeForContext();
    expect(summary).toContain('Fixed login bug');
    expect(summary).toContain('Added unit tests');
    expect(summary).toContain('TypeScript');
  });
});
