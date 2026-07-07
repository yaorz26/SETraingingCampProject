import { assessRisk, RiskLevel } from '../../../src/guardrails/guardrail.js';
import { DangerCategory, type MatchResult } from '../../../src/guardrails/pattern-registry.js';
import type { PathCheckResult } from '../../../src/guardrails/boundary-check.js';

describe('assessRisk', () => {
  const safePathCheck: PathCheckResult = {
    passed: true,
    isWithinWorkspace: true,
    resolvedPath: '/home/user/project/src/file.ts',
    isSensitive: false,
  };

  const blockedPathCheck: PathCheckResult = {
    passed: false,
    isWithinWorkspace: false,
    resolvedPath: '/etc/passwd',
    isSensitive: true,
    reason: 'Outside workspace',
  };

  it('should return SAFE for npm test', () => {
    const result = assessRisk([], safePathCheck);
    expect(result.level).toBe(RiskLevel.SAFE);
    expect(result.requiresApproval).toBe(false);
  });

  it('should return CAUTION for workspace file deletion', () => {
    const matches: MatchResult[] = [
      {
        pattern: 'rm-workspace',
        category: DangerCategory.FILE_DESTRUCTION_WORKSPACE,
        description: 'File deletion within workspace',
        matched: 'rm ./src/old.ts',
      },
    ];
    const result = assessRisk(matches, safePathCheck);
    expect(result.level).toBe(RiskLevel.CAUTION);
    expect(result.requiresApproval).toBe(true);
  });

  it('should return DANGEROUS for rm -rf', () => {
    const matches: MatchResult[] = [
      {
        pattern: 'unix-rm-rf',
        category: DangerCategory.FILE_DESTRUCTION,
        description: 'Recursive file deletion',
        matched: 'rm -rf ./node_modules',
      },
    ];
    const result = assessRisk(matches, safePathCheck);
    expect(result.level).toBe(RiskLevel.DANGEROUS);
    expect(result.requiresApproval).toBe(true);
  });

  it('should return DANGEROUS for git push --force', () => {
    const matches: MatchResult[] = [
      {
        pattern: 'git-push-force',
        category: DangerCategory.GIT_DESTRUCTIVE,
        description: 'Force push',
        matched: 'git push --force',
      },
    ];
    const result = assessRisk(matches, safePathCheck);
    expect(result.level).toBe(RiskLevel.DANGEROUS);
  });

  it('should return FATAL for curl | bash', () => {
    const matches: MatchResult[] = [
      {
        pattern: 'curl-pipe-bash',
        category: DangerCategory.ARBITRARY_CODE,
        description: 'Download and execute script',
        matched: 'curl url | bash',
      },
    ];
    const result = assessRisk(matches, safePathCheck);
    expect(result.level).toBe(RiskLevel.FATAL);
    expect(result.requiresApproval).toBe(true);
  });

  it('should return FATAL for path outside workspace', () => {
    const result = assessRisk([], blockedPathCheck);
    expect(result.level).toBe(RiskLevel.FATAL);
    expect(result.requiresApproval).toBe(true);
  });

  it('should return FATAL for sensitive path', () => {
    const sensitivePathCheck: PathCheckResult = {
      passed: false,
      isWithinWorkspace: true,
      resolvedPath: '/home/user/project/.env',
      isSensitive: true,
      reason: 'Sensitive file',
    };
    const result = assessRisk([], sensitivePathCheck);
    expect(result.level).toBe(RiskLevel.FATAL);
  });
});
