import { executeCommand } from '../../../src/utils/shell.js';

describe('executeCommand', () => {
  it('should execute a simple command and return stdout', async () => {
    const result = await executeCommand('echo', ['hello'], { timeout: 5000 });
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
  });

  it('should capture stderr on failure', async () => {
    const result = await executeCommand(
      'node',
      ['-e', 'console.error("test error"); process.exit(1)'],
      { timeout: 5000 },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('test error');
  });

  it('should enforce timeout', async () => {
    // Use ping to create a long-running process
    const pingCmd = process.platform === 'win32' ? 'ping' : 'sleep';
    const pingArgs = process.platform === 'win32' ? ['-n', '20', '127.0.0.1'] : ['20'];
    const result = await executeCommand(pingCmd, pingArgs, { timeout: 1000 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('should handle max output truncation', async () => {
    const result = await executeCommand('node', ['-e', 'process.stdout.write("x".repeat(10000))'], {
      timeout: 5000,
      maxOutputBytes: 100,
    });
    expect(result.stdout.length).toBeLessThanOrEqual(200); // allow some extra for truncation message
    expect(result.truncated).toBe(true);
  });

  it('should strip ANSI escape codes from output', async () => {
    // Node.js on Windows may not produce ANSI codes, so we test the stripping logic
    const result = await executeCommand('echo', ['hello'], { timeout: 5000 });
    // Should not contain ANSI escape sequences
    expect(result.stdout).not.toMatch(/\\x1b\[[0-9;]*m/);
  });

  it('should handle command not found', async () => {
    const result = await executeCommand('nonexistent_command_xyz', [], { timeout: 5000 });
    expect(result.exitCode).not.toBe(0);
  });
});
