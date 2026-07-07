import path from 'path';
import fs from 'fs/promises';
import { fileExists } from '../utils/fileops.js';

export interface TaskRecord {
  description: string;
  result: string;
  timestamp: string;
}

export interface ProjectMemory {
  tasks: TaskRecord[];
  preferences: Record<string, string>;
  conventions: Record<string, string>;
}

export class MemoryManager {
  private storePath: string;

  constructor(workspaceRoot: string) {
    this.storePath = path.join(workspaceRoot, '.codeharness', 'memory.json');
  }

  async load(): Promise<ProjectMemory> {
    if (!(await fileExists(this.storePath))) {
      return {
        tasks: [],
        preferences: {},
        conventions: {},
      };
    }

    try {
      const content = await fs.readFile(this.storePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(content);
    } catch {
      return {
        tasks: [],
        preferences: {},
        conventions: {},
      };
    }
  }

  async save(memory: ProjectMemory): Promise<void> {
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(memory, null, 2), 'utf-8');
  }

  async updateTaskHistory(description: string, result: string): Promise<void> {
    const memory = await this.load();
    memory.tasks.push({
      description,
      result,
      timestamp: new Date().toISOString(),
    });

    if (memory.tasks.length > 10) {
      memory.tasks = memory.tasks.slice(-10);
    }

    await this.save(memory);
  }

  async updateUserPreferences(preferences: Record<string, string>): Promise<void> {
    const memory = await this.load();
    memory.preferences = { ...memory.preferences, ...preferences };
    await this.save(memory);
  }

  async updateProjectConventions(conventions: Record<string, string>): Promise<void> {
    const memory = await this.load();
    memory.conventions = { ...memory.conventions, ...conventions };
    await this.save(memory);
  }

  async summarizeForContext(): Promise<string> {
    const memory = await this.load();
    const lines: string[] = [];

    if (memory.tasks.length > 0) {
      lines.push('## Recent Tasks');
      for (const task of memory.tasks.slice(-5)) {
        lines.push(`- ${task.description} (${task.result})`);
      }
    }

    if (Object.keys(memory.preferences).length > 0) {
      lines.push('\n## User Preferences');
      for (const [key, value] of Object.entries(memory.preferences)) {
        lines.push(`- ${key}: ${value}`);
      }
    }

    if (Object.keys(memory.conventions).length > 0) {
      lines.push('\n## Project Conventions');
      for (const [key, value] of Object.entries(memory.conventions)) {
        lines.push(`- ${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }
}
