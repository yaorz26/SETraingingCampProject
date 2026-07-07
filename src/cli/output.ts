import chalk from 'chalk';
import type { Action, ActionResult } from '../core/action-parser.js';
import type { TaskResult } from '../core/agent-loop.js';

export enum LogLevel {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  DANGER = 'danger',
}

let isVerbose = false;
let isNonInteractive = false;

export function setVerbose(v: boolean): void {
  isVerbose = v;
}

export function setNonInteractive(v: boolean): void {
  isNonInteractive = v;
}

export function log(msg: string, level: LogLevel = LogLevel.INFO): void {
  if (isNonInteractive) return;

  const prefix = getPrefix(level);
  const colored = getColorFn(level)(`${prefix} ${msg}`);
  process.stderr.write(colored + '\n');
}

export function logProgress(
  round: number,
  totalRounds: number,
  actionType: string,
  detail?: string,
): void {
  if (isNonInteractive) return;

  const actionInfo = detail ? `${actionType} ${detail}` : actionType;
  const msg = chalk.blue(`→ 第${round}轮/${totalRounds}: ${actionInfo}`);
  process.stderr.write(msg + '\n');
}

export function logActionResult(action: Action, result: ActionResult): void {
  if (isNonInteractive) return;

  const icon = result.success ? chalk.green('✓') : chalk.red('✗');
  const actionInfo = getActionInfo(action);
  const duration = result.duration ? ` (${result.duration}ms)` : '';

  if (result.success) {
    process.stderr.write(`${icon} ${actionInfo}${duration}\n`);
  } else {
    process.stderr.write(
      `${icon} ${actionInfo}${duration} - ${chalk.red(result.error ?? 'failed')}\n`,
    );
  }

  if (isVerbose && result.output) {
    const truncated =
      result.output.length > 2000 ? result.output.slice(0, 2000) + '...' : result.output;
    process.stderr.write(chalk.gray(`  ${truncated}\n`));
  }
}

export function logTaskResult(result: TaskResult): string {
  const json = JSON.stringify(result, null, 2);
  if (!isNonInteractive) {
    const status = result.success ? chalk.green('SUCCESS') : chalk.red('FAILED');
    process.stderr.write(`\n${status} ${result.summary}\n`);
    process.stderr.write(`Rounds: ${result.rounds}, Exit code: ${result.exitCode}\n`);
  }
  process.stdout.write(json + '\n');
  return json;
}

function getPrefix(level: LogLevel): string {
  switch (level) {
    case LogLevel.INFO:
      return '[INFO]';
    case LogLevel.SUCCESS:
      return '[OK]';
    case LogLevel.WARNING:
      return '[WARN]';
    case LogLevel.ERROR:
      return '[ERROR]';
    case LogLevel.DANGER:
      return '[DANGER]';
  }
}

function getColorFn(level: LogLevel): (s: string) => string {
  switch (level) {
    case LogLevel.INFO:
      return chalk.blue;
    case LogLevel.SUCCESS:
      return chalk.green;
    case LogLevel.WARNING:
      return chalk.yellow;
    case LogLevel.ERROR:
      return chalk.red;
    case LogLevel.DANGER:
      return chalk.red.bold;
  }
}

function getActionInfo(action: Action): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const detail = 'path' in action ? ` ${(action as any).path}` : '';
  return `${action.type}${detail}`;
}
