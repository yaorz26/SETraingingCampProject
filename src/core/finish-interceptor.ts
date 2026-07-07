import type { FinishResult, DriftCheckResult } from './action-parser.js';

export type { FinishResult };

export interface FinishContext {
  agentSuccess: boolean;
  testsPassed: boolean;
  lintPassed: boolean;
  typeCheckPassed: boolean;
  unexpectedFiles: string[];
  driftResult: DriftCheckResult;
  testFailures?: number;
}

export function interceptFinish(context: FinishContext): FinishResult {
  if (!context.agentSuccess) {
    return { intercepted: false };
  }

  const issues: string[] = [];

  if (!context.testsPassed) {
    const count = context.testFailures ?? 1;
    issues.push(`Tests not passing (${count} failure${count !== 1 ? 's' : ''})`);
  }

  if (context.unexpectedFiles.length > 0) {
    issues.push(`Unexpected files modified: ${context.unexpectedFiles.join(', ')}`);
  }

  if (context.driftResult.risk === 'high') {
    issues.push(`Drift detected: ${context.driftResult.reason ?? 'High risk deviation'}`);
  }

  if (issues.length > 0) {
    return {
      intercepted: true,
      message: `Finish intercepted. Issues found:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
      suggestion: `Please fix the above issues and try again.`,
    };
  }

  if (context.driftResult.risk === 'low' || context.driftResult.risk === 'medium') {
    return {
      intercepted: false,
      suggestion: `Warning: ${context.driftResult.reason ?? 'Minor drift detected'}. Consider reviewing.`,
    };
  }

  return { intercepted: false };
}
