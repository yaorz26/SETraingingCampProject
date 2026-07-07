import { spawn, execSync } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

export interface CommandOptions {
  timeout?: number;
  maxOutputBytes?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Kill a process and all its children (cross-platform).
 */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      // Process may already be dead
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Process may already be dead
    }
  }
}

/**
 * Execute a shell command with timeout and output truncation support.
 * Returns a CommandResult with stdout, stderr, exit code, and metadata.
 */
export function executeCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const {
    timeout = 60000,
    maxOutputBytes = 1048576, // 1MB default
    cwd,
    env,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (!settled) {
        if (child.pid) {
          killProcessTree(child.pid);
        }
      }
    }, timeout);

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      const cleanStdout = stripAnsi(stdout);
      const cleanStderr = stripAnsi(stderr);

      resolve({
        stdout: cleanStdout,
        stderr: cleanStderr,
        exitCode: timedOut ? -1 : exitCode,
        timedOut,
        truncated,
        durationMs,
      });
    };

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length > maxOutputBytes) {
        if (!truncated) {
          truncated = true;
        }
        const remaining = maxOutputBytes - stdout.length;
        if (remaining > 0) {
          stdout += chunk.slice(0, remaining);
        }
      } else {
        stdout += chunk;
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length > maxOutputBytes) {
        if (!truncated) {
          truncated = true;
        }
        const remaining = maxOutputBytes - stderr.length;
        if (remaining > 0) {
          stderr += chunk.slice(0, remaining);
        }
      } else {
        stderr += chunk;
      }
    });

    child.on('error', (err) => {
      stderr = err.message;
      finish(-1);
    });

    child.on('close', (code) => {
      finish(code ?? -1);
    });
  });
}
