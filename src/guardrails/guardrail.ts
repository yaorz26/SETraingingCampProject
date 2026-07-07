import type { MatchResult, DangerCategory } from './pattern-registry.js';
import type { PathCheckResult } from './boundary-check.js';

export enum RiskLevel {
  SAFE = 'safe',
  CAUTION = 'caution',
  DANGEROUS = 'dangerous',
  FATAL = 'fatal',
}

export interface RiskAssessment {
  level: RiskLevel;
  requiresApproval: boolean;
  blocked: boolean;
  reason?: string;
}

export function assessRisk(
  patternMatches: MatchResult[],
  pathCheck: PathCheckResult,
): RiskAssessment {
  if (!pathCheck.passed) {
    return {
      level: RiskLevel.FATAL,
      requiresApproval: true,
      blocked: true,
      reason: pathCheck.reason ?? 'Path check failed',
    };
  }

  const categories = new Set(patternMatches.map((m) => m.category));

  if (
    categories.has('arbitrary_code' as DangerCategory) ||
    categories.has('database_destructive' as DangerCategory) ||
    categories.has('privilege_escalation' as DangerCategory)
  ) {
    return {
      level: RiskLevel.FATAL,
      requiresApproval: true,
      blocked: false,
      reason: 'Fatal risk pattern detected',
    };
  }

  if (
    categories.has('git_destructive' as DangerCategory) ||
    categories.has('file_destruction' as DangerCategory) ||
    categories.has('publish' as DangerCategory)
  ) {
    return {
      level: RiskLevel.DANGEROUS,
      requiresApproval: true,
      blocked: false,
      reason: 'Dangerous operation detected',
    };
  }

  if (
    categories.has('git_rewrite_history' as DangerCategory) ||
    categories.has('file_destruction_workspace' as DangerCategory)
  ) {
    return {
      level: RiskLevel.CAUTION,
      requiresApproval: true,
      blocked: false,
      reason: 'Potentially risky operation detected',
    };
  }

  return {
    level: RiskLevel.SAFE,
    requiresApproval: false,
    blocked: false,
  };
}
