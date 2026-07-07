import crypto from 'crypto';
import fs from 'fs/promises';

export interface DiffResult {
  changed: boolean;
  isExpected: boolean;
  details: string;
}

export class DiffTracker {
  private snapshots: Map<string, string> = new Map();

  async takeSnapshot(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const hash = this.hashContent(content);
      this.snapshots.set(filePath, hash);
    } catch {
      this.snapshots.set(filePath, '');
    }
  }

  async checkDiff(filePath: string, expectedFiles?: string[]): Promise<DiffResult> {
    const snapshot = this.snapshots.get(filePath);

    if (snapshot === undefined) {
      return {
        changed: false,
        isExpected: true,
        details: 'No snapshot available for this file',
      };
    }

    let currentHash: string;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      currentHash = this.hashContent(content);
    } catch {
      currentHash = '';
    }

    const changed = snapshot !== currentHash;
    const isExpected = expectedFiles
      ? expectedFiles.some((f) => filePath.endsWith(f) || filePath.includes(f))
      : true;

    return {
      changed,
      isExpected,
      details: changed ? `File ${filePath} was modified` : `File ${filePath} unchanged`,
    };
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
