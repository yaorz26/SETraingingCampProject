import { estimateCost } from './pricing.js';

export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private lastModel = '';

  recordUsage(model: string, inputTokens: number, outputTokens: number): void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.lastModel = model;
  }

  getCurrentCost(): number {
    return estimateCost(this.lastModel, this.totalInputTokens, this.totalOutputTokens);
  }

  getTotalInputTokens(): number {
    return this.totalInputTokens;
  }

  getTotalOutputTokens(): number {
    return this.totalOutputTokens;
  }

  isOverBudget(maxCost: number): boolean {
    return this.getCurrentCost() > maxCost;
  }

  getSummary(): string {
    const total = this.totalInputTokens + this.totalOutputTokens;
    const cost = this.getCurrentCost();
    return `Token usage: ${total.toLocaleString()} tokens (input: ${this.totalInputTokens.toLocaleString()} + output: ${this.totalOutputTokens.toLocaleString()}) · Estimated cost: ~$${cost.toFixed(4)} (${this.lastModel || 'unknown'})`;
  }
}
