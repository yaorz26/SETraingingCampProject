import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  collectFeedback,
  formatFeedbackForLLM,
  type FeedbackConfig,
  type FeedbackResult,
} from '../../../src/feedback/collector.js';

describe('collectFeedback', () => {
  let testDir: string;

  const defaultConfig: FeedbackConfig = {
    testCommand: 'echo "test passed"',
    lintCommand: 'echo "lint passed"',
    typecheckCommand: 'echo "types ok"',
    buildCommand: 'echo "build ok"',
  };

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codeharness-feedback-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should return all passed when commands succeed', async () => {
    const results = await collectFeedback(defaultConfig, testDir);
    expect(results).toHaveLength(5);
    expect(results.filter((r) => !r.skipped).every((r) => r.passed)).toBe(true);
  });

  it('should detect failed commands', async () => {
    const config: FeedbackConfig = {
      ...defaultConfig,
      testCommand: 'exit 1',
    };
    const results = await collectFeedback(config, testDir);
    const testResult = results.find((r) => r.source === 'test');
    expect(testResult).toBeDefined();
    expect(testResult!.passed).toBe(false);
  });

  it('should skip missing commands', async () => {
    const config: FeedbackConfig = {};
    const results = await collectFeedback(config, testDir);
    const skipped = results.filter((r) => r.skipped);
    expect(skipped.length).toBe(4);
  });

  it('should handle command not found', async () => {
    const config: FeedbackConfig = {
      testCommand: 'nonexistent_command_xyz',
    };
    const results = await collectFeedback(config, testDir);
    const testResult = results.find((r) => r.source === 'test');
    expect(testResult!.passed).toBe(false);
  });
});

describe('formatFeedbackForLLM', () => {
  it('should format results correctly', () => {
    const results: FeedbackResult[] = [
      {
        source: 'test',
        passed: true,
        skipped: false,
        details: 'All tests passed',
        summary: 'Tests: 10 passed',
        durationMs: 100,
        exitCode: 0,
      },
      {
        source: 'lint',
        passed: false,
        skipped: false,
        details: 'Lint errors found',
        summary: '3 errors, 1 warning',
        durationMs: 50,
        exitCode: 1,
        errorCount: 3,
        warningCount: 1,
      },
    ];

    const formatted = formatFeedbackForLLM(results, 2);
    expect(formatted).toContain('<feedback>');
    expect(formatted).toContain('</feedback>');
    expect(formatted).toContain('test');
    expect(formatted).toContain('lint');
    expect(formatted).toContain('PASS');
    expect(formatted).toContain('FAIL');
    expect(formatted).toContain('Round 2');
  });

  it('should handle empty results', () => {
    const formatted = formatFeedbackForLLM([], 1);
    expect(formatted).toContain('No feedback signals');
  });
});
