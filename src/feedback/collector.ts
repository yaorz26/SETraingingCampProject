import { executeCommand } from '../utils/shell.js';

export interface FeedbackConfig {
  testCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
  buildCommand?: string;
}

export interface FeedbackResult {
  source: 'test' | 'lint' | 'typecheck' | 'build' | 'diff';
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  details: string;
  summary: string;
  durationMs: number;
  exitCode?: number;
  errorCount?: number;
  warningCount?: number;
}

export async function collectFeedback(
  config: FeedbackConfig,
  cwd: string,
): Promise<FeedbackResult[]> {
  const results: FeedbackResult[] = [];

  // Diff (always check first)
  results.push(await runFeedbackStep('diff', 'echo "diff ok"', cwd));

  // Lint → Type Check → Build → Test (dependency chain)
  const lintResult = await runFeedbackStep('lint', config.lintCommand, cwd);
  results.push(lintResult);

  const typecheckResult = await runFeedbackStep('typecheck', config.typecheckCommand, cwd);
  results.push(typecheckResult);

  const buildResult = await runFeedbackStep('build', config.buildCommand, cwd);
  results.push(buildResult);

  // Build failure → skip test
  if (!buildResult.skipped && !buildResult.passed) {
    results.push({
      source: 'test',
      passed: false,
      skipped: true,
      skipReason: 'Build failed, skipping tests',
      details: 'Tests skipped due to build failure',
      summary: 'Skipped (build failed)',
      durationMs: 0,
    });
  } else {
    results.push(await runFeedbackStep('test', config.testCommand, cwd));
  }

  return results;
}

async function runFeedbackStep(
  source: FeedbackResult['source'],
  command: string | undefined,
  cwd: string,
): Promise<FeedbackResult> {
  if (!command) {
    return {
      source,
      passed: false,
      skipped: true,
      skipReason: 'Command not configured',
      details: 'No command configured',
      summary: 'Skipped',
      durationMs: 0,
    };
  }

  const startTime = Date.now();
  try {
    const result = await executeCommand(command, [], {
      cwd,
      timeout: 60000,
    });

    const durationMs = Date.now() - startTime;
    const output = result.stdout || result.stderr || '';

    return {
      source,
      passed: result.exitCode === 0,
      skipped: false,
      details: output,
      summary: result.exitCode === 0 ? 'Passed' : `Failed (exit ${result.exitCode})`,
      durationMs,
      exitCode: result.exitCode,
      errorCount: result.exitCode !== 0 ? 1 : 0,
      warningCount: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      source,
      passed: false,
      skipped: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      details: err.message,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      summary: `Error: ${err.message}`,
      durationMs,
      exitCode: -1,
      errorCount: 1,
    };
  }
}

export function formatFeedbackForLLM(results: FeedbackResult[], currentRound: number): string {
  if (results.length === 0) {
    return 'No feedback signals available.';
  }

  const lines: string[] = ['<feedback>', `Round ${currentRound} feedback:`, ''];

  for (const r of results) {
    const status = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';
    lines.push(`[${status}] ${r.source}: ${r.summary}`);
    if (r.details && r.details.length > 0 && r.details.length < 200) {
      lines.push(`  Details: ${r.details.slice(0, 200)}`);
    }
    if (r.errorCount && r.errorCount > 0) {
      lines.push(`  Errors: ${r.errorCount}`);
    }
  }

  lines.push('', '</feedback>');
  return lines.join('\n');
}
