import type { DriftCheckResult } from './action-parser.js';

export type { DriftCheckResult };

const CONFIG_FILE_PATTERNS = [
  /^package\.json$/,
  /^tsconfig/,
  /^\.eslintrc/,
  /^\.prettierrc/,
  /^webpack\./,
  /^vite\.config/,
  /^\.env/,
  /^docker-compose/,
  /^Dockerfile$/,
];

export interface DriftContext {
  filesModified: string[];
  taskKeywords: string[];
}

export class DriftDetector {
  private originalTask: string;
  private initialFileCount: number | null = null;

  constructor(originalTask: string) {
    this.originalTask = originalTask;
  }

  setInitialFileCount(count: number): void {
    this.initialFileCount = count;
  }

  check(context: DriftContext): DriftCheckResult {
    const { filesModified, taskKeywords } = context;

    // Rule 1: File count explosion
    if (this.initialFileCount !== null && filesModified.length > this.initialFileCount * 3) {
      return {
        drifting: true,
        risk: 'high',
        reason: `File modifications exploded from ${this.initialFileCount} to ${filesModified.length} files`,
      };
    }
    if (this.initialFileCount === null && filesModified.length >= 10) {
      return {
        drifting: true,
        risk: 'high',
        reason: `Unexpectedly large number of files modified: ${filesModified.length}`,
      };
    }

    // Rule 3: Config file modification
    const configFiles = filesModified.filter((f) =>
      CONFIG_FILE_PATTERNS.some((p) => p.test(f.replace(/^.*[/\\]/, ''))),
    );
    if (configFiles.length > 0 && !this.isConfigRelated(taskKeywords)) {
      return {
        drifting: true,
        risk: 'medium',
        reason: `Config files modified but task does not involve config: ${configFiles.join(', ')}`,
      };
    }

    // Rule 2: Unrelated directory modification
    const unrelatedFiles = filesModified.filter((f) => !this.isRelated(f, taskKeywords));
    if (unrelatedFiles.length > 0 && unrelatedFiles.length === filesModified.length) {
      return {
        drifting: true,
        risk: 'low',
        reason: `Files modified appear unrelated to task: ${unrelatedFiles.join(', ')}`,
      };
    }

    return { drifting: false, risk: 'none' };
  }

  private isRelated(filePath: string, keywords: string[]): boolean {
    const lower = filePath.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  private isConfigRelated(keywords: string[]): boolean {
    const configKeywords = ['config', 'webpack', 'vite', 'eslint', 'prettier', 'env', 'docker'];
    return keywords.some((kw) => configKeywords.some((ck) => kw.toLowerCase().includes(ck)));
  }
}
