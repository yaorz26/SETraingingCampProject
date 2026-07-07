import {
  log,
  logProgress,
  logActionResult,
  logTaskResult,
  LogLevel,
  setVerbose,
  setNonInteractive,
} from '../../../src/cli/output.js';
import type { TaskResult } from '../../../src/core/agent-loop.js';

describe('log', () => {
  it('should not throw for different levels', () => {
    expect(() => log('info message', LogLevel.INFO)).not.toThrow();
    expect(() => log('success message', LogLevel.SUCCESS)).not.toThrow();
    expect(() => log('warning message', LogLevel.WARNING)).not.toThrow();
    expect(() => log('error message', LogLevel.ERROR)).not.toThrow();
    expect(() => log('danger message', LogLevel.DANGER)).not.toThrow();
  });
});

describe('logProgress', () => {
  it('should not throw', () => {
    expect(() => logProgress(2, 5, 'read_file', 'src/user.ts')).not.toThrow();
  });
});

describe('logActionResult', () => {
  it('should log success action', () => {
    expect(() =>
      logActionResult(
        { type: 'read_file', path: 'test.ts' },
        {
          action: { type: 'read_file', path: 'test.ts' },
          success: true,
          output: 'content',
          duration: 100,
        },
      ),
    ).not.toThrow();
  });

  it('should log failed action', () => {
    expect(() =>
      logActionResult(
        { type: 'read_file', path: 'test.ts' },
        {
          action: { type: 'read_file', path: 'test.ts' },
          success: false,
          error: 'File not found',
          duration: 50,
        },
      ),
    ).not.toThrow();
  });
});

describe('logTaskResult', () => {
  it('should output valid JSON to stdout', () => {
    const result: TaskResult = {
      success: true,
      summary: 'Task completed',
      exitCode: 0,
      rounds: 3,
    };
    const output = logTaskResult(result);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(output);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.summary).toBe('Task completed');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.exitCode).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.rounds).toBe(3);
  });
});

describe('setNonInteractive', () => {
  it('should not throw', () => {
    expect(() => setNonInteractive(true)).not.toThrow();
  });
});

describe('setVerbose', () => {
  it('should not throw', () => {
    expect(() => setVerbose(true)).not.toThrow();
  });
});
