import {
  ApprovalStateMachine,
  SessionApprovalCache,
  type ApprovalCallback,
} from '../../../src/guardrails/hitl.js';
import { DangerCategory } from '../../../src/guardrails/pattern-registry.js';
import { RiskLevel } from '../../../src/guardrails/guardrail.js';

describe('ApprovalStateMachine', () => {
  let callbacks: ApprovalCallback[];
  let machine: ApprovalStateMachine;

  beforeEach(() => {
    callbacks = [];
    machine = new ApprovalStateMachine(callbacks);
  });

  it('should approve when user responds Y', async () => {
    const resultPromise = machine.requestApproval('rm -rf ./node_modules', RiskLevel.DANGEROUS);
    const callback = callbacks[0];
    if (callback) {
      const result = await callback('Y');
      expect(result.decision).toBe('approved');
    }
    const result = await resultPromise;
    expect(result.decision).toBe('approved');
  });

  it('should deny when user responds N', async () => {
    const resultPromise = machine.requestApproval('rm -rf ./node_modules', RiskLevel.DANGEROUS);
    const callback = callbacks[0];
    if (callback) {
      await callback('N');
    }
    const result = await resultPromise;
    expect(result.decision).toBe('denied');
  });

  it('should time out after specified duration', async () => {
    const shortMachine = new ApprovalStateMachine(callbacks, 100);
    const result = await shortMachine.requestApproval('test', RiskLevel.DANGEROUS);
    expect(result.decision).toBe('timed_out');
  });
});

describe('SessionApprovalCache', () => {
  let cache: SessionApprovalCache;

  beforeEach(() => {
    cache = new SessionApprovalCache();
  });

  it('should approve category after adding to whitelist', () => {
    cache.approve(DangerCategory.FILE_DESTRUCTION);
    expect(cache.isApproved(DangerCategory.FILE_DESTRUCTION)).toBe(true);
  });

  it('should not approve different category', () => {
    cache.approve(DangerCategory.FILE_DESTRUCTION);
    expect(cache.isApproved(DangerCategory.GIT_DESTRUCTIVE)).toBe(false);
  });

  it('should clear all approvals', () => {
    cache.approve(DangerCategory.FILE_DESTRUCTION);
    cache.clear();
    expect(cache.isApproved(DangerCategory.FILE_DESTRUCTION)).toBe(false);
  });

  it('should be empty initially', () => {
    expect(cache.isApproved(DangerCategory.FILE_DESTRUCTION)).toBe(false);
  });
});
