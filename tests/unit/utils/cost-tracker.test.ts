import { CostTracker } from '../../../src/utils/cost-tracker.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('should start with zero usage', () => {
    expect(tracker.getCurrentCost()).toBe(0);
    expect(tracker.getTotalInputTokens()).toBe(0);
    expect(tracker.getTotalOutputTokens()).toBe(0);
  });

  it('should record usage and accumulate', () => {
    tracker.recordUsage('gpt-4o', 1000, 500);
    expect(tracker.getTotalInputTokens()).toBe(1000);
    expect(tracker.getTotalOutputTokens()).toBe(500);
  });

  it('should calculate cost correctly for GPT-4o', () => {
    tracker.recordUsage('gpt-4o', 1000000, 1000000);
    const cost = tracker.getCurrentCost();
    expect(cost).toBeCloseTo(12.5, 2); // $2.50 + $10.00
  });

  it('should calculate zero cost for Ollama', () => {
    tracker.recordUsage('qwen2.5-coder:14b', 1000000, 1000000);
    expect(tracker.getCurrentCost()).toBe(0);
  });

  it('should detect over budget', () => {
    tracker.recordUsage('gpt-4o', 5000000, 5000000);
    expect(tracker.isOverBudget(0.01)).toBe(true);
  });

  it('should not be over budget with small usage', () => {
    tracker.recordUsage('gpt-4o', 100, 100);
    expect(tracker.isOverBudget(10)).toBe(false);
  });

  it('should generate correct summary', () => {
    tracker.recordUsage('gpt-4o', 10200, 2145);
    const summary = tracker.getSummary();
    expect(summary).toContain('12,345');
    expect(summary).toContain('10,200');
    expect(summary).toContain('2,145');
    expect(summary).toContain('gpt-4o');
  });
});
