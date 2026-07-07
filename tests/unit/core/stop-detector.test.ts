import { shouldStop, type StopContext } from '../../../src/core/stop-detector.js';

describe('shouldStop', () => {
  const baseContext: StopContext = {
    currentRound: 1,
    maxRounds: 10,
    lastAction: { type: 'read_file', path: 'test.ts' },
    consecutiveSameDiffs: 0,
    startTime: Date.now() - 1000,
    globalTimeout: 60000,
    blockedNoAlternative: false,
    userInterrupted: false,
    costLimitReached: false,
  };

  it('should stop when action is finish', () => {
    const result = shouldStop({
      ...baseContext,
      lastAction: { type: 'finish', success: true, summary: 'Done' },
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('finish_action');
  });

  it('should stop when max rounds reached', () => {
    const result = shouldStop({
      ...baseContext,
      currentRound: 10,
      maxRounds: 10,
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('max_rounds');
  });

  it('should stop when stalled (3 consecutive same diffs)', () => {
    const result = shouldStop({
      ...baseContext,
      consecutiveSameDiffs: 3,
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('stall_detected');
  });

  it('should stop on global timeout', () => {
    const result = shouldStop({
      ...baseContext,
      startTime: Date.now() - 70000,
      globalTimeout: 60000,
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('global_timeout');
  });

  it('should stop when blocked with no alternative', () => {
    const result = shouldStop({
      ...baseContext,
      blockedNoAlternative: true,
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('blocked_no_alternative');
  });

  it('should stop when user interrupts', () => {
    const result = shouldStop({
      ...baseContext,
      userInterrupted: true,
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('user_interrupt');
  });

  it('should stop when cost limit reached', () => {
    const result = shouldStop({
      ...baseContext,
      costLimitReached: true,
    });
    expect(result.should_stop).toBe(true);
    expect(result.reason).toBe('cost_limit_reached');
  });

  it('should not stop under normal conditions', () => {
    const result = shouldStop(baseContext);
    expect(result.should_stop).toBe(false);
  });

  it('should not stop when only 2 consecutive same diffs', () => {
    const result = shouldStop({
      ...baseContext,
      consecutiveSameDiffs: 2,
    });
    expect(result.should_stop).toBe(false);
  });
});
