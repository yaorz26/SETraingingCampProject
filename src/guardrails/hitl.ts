import type { DangerCategory } from './pattern-registry.js';
import type { RiskLevel } from './guardrail.js';

export type ApprovalDecision =
  'approved' | 'denied' | 'auto_approved' | 'timed_out' | 'hard_blocked';

export interface ApprovalResult {
  decision: ApprovalDecision;
  userResponse?: 'Y' | 'N' | 'A' | 'S';
  autoApproved?: boolean;
  autoApprovedCategory?: string;
  timeoutSeconds: number;
  durationMs: number;
}

export type ApprovalCallback = (response: 'Y' | 'N' | 'A' | 'S') => Promise<ApprovalResult>;

export class ApprovalStateMachine {
  private callbacks: ApprovalCallback[];
  private timeoutMs: number;

  constructor(callbacks: ApprovalCallback[] = [], timeoutMs = 120000) {
    this.callbacks = callbacks;
    this.timeoutMs = timeoutMs;
  }

  requestApproval(
    _action: string,
    _riskLevel: RiskLevel,
    _category?: DangerCategory,
  ): Promise<ApprovalResult> {
    const startTime = Date.now();

    return new Promise<ApprovalResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          decision: 'timed_out',
          timeoutSeconds: this.timeoutMs / 1000,
          durationMs: Date.now() - startTime,
        });
      }, this.timeoutMs);

      this.callbacks.push((response) => {
        clearTimeout(timeoutId);
        const result: ApprovalResult = {
          decision: response === 'Y' || response === 'A' ? 'approved' : 'denied',
          userResponse: response,
          timeoutSeconds: this.timeoutMs / 1000,
          durationMs: Date.now() - startTime,
        };
        resolve(result);
        return result;
      });
    });
  }
}

export class SessionApprovalCache {
  private approvedCategories: Set<DangerCategory> = new Set();

  approve(category: DangerCategory): void {
    this.approvedCategories.add(category);
  }

  isApproved(category: DangerCategory): boolean {
    return this.approvedCategories.has(category);
  }

  clear(): void {
    this.approvedCategories.clear();
  }
}
