import type { Action } from '../core/action-parser.js';
import { detectDangerousPatterns, type PatternDefinition } from './pattern-registry.js';
import { checkPath, type PathCheckResult } from './boundary-check.js';
import { assessRisk, RiskLevel } from './guardrail.js';
import type { SessionApprovalCache } from './hitl.js';

export { RiskLevel } from './guardrail.js';

export interface GuardrailResult {
  passed: boolean;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  matchedPatterns: string[];
  pathCheck: PathCheckResult;
  blocked: boolean;
  blockReason?: string;
}

export function runGuardrail(
  action: Action,
  workspaceRoot: string,
  approvalCache?: SessionApprovalCache,
  customPatterns?: PatternDefinition[],
): GuardrailResult {
  // L1: Pattern matching
  let command = '';
  if (action.type === 'run_command') {
    command = action.command;
  }

  const patternMatches = detectDangerousPatterns(command, customPatterns);

  // L2: Path boundary check
  let pathCheck: PathCheckResult = {
    passed: true,
    isWithinWorkspace: true,
    resolvedPath: workspaceRoot,
    isSensitive: false,
  };

  if ('path' in action) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    pathCheck = checkPath((action as any).path as string, workspaceRoot);
  }

  // L3: Risk assessment
  const riskResult = assessRisk(patternMatches, pathCheck);

  // Fatal = hard block
  if (riskResult.blocked || riskResult.level === RiskLevel.FATAL) {
    return {
      passed: false,
      requiresApproval: false,
      riskLevel: riskResult.level,
      matchedPatterns: patternMatches.map((m) => m.pattern),
      pathCheck,
      blocked: true,
      blockReason: riskResult.reason ?? 'Fatal risk detected',
    };
  }

  // L4: Approval (conditionally triggered)
  if (riskResult.requiresApproval) {
    // Check session whitelist
    if (approvalCache) {
      const categories = new Set(patternMatches.map((m) => m.category));
      const allApproved = [...categories].every((c) => approvalCache.isApproved(c));
      if (allApproved) {
        return {
          passed: true,
          requiresApproval: false,
          riskLevel: riskResult.level,
          matchedPatterns: patternMatches.map((m) => m.pattern),
          pathCheck,
          blocked: false,
        };
      }
    }

    // Requires approval - caller should handle HITL
    return {
      passed: true,
      requiresApproval: true,
      riskLevel: riskResult.level,
      matchedPatterns: patternMatches.map((m) => m.pattern),
      pathCheck,
      blocked: false,
    };
  }

  // L5: Audit log (always) - handled by caller
  return {
    passed: true,
    requiresApproval: false,
    riskLevel: RiskLevel.SAFE,
    matchedPatterns: [],
    pathCheck,
    blocked: false,
  };
}
