export interface PricingEntry {
  model: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
}

const PRICING: PricingEntry[] = [
  { model: 'gpt-4o', inputPricePer1M: 2.5, outputPricePer1M: 10.0 },
  { model: 'gpt-4o-mini', inputPricePer1M: 0.15, outputPricePer1M: 0.6 },
  { model: 'gpt-4-turbo', inputPricePer1M: 10.0, outputPricePer1M: 30.0 },
  { model: 'claude-sonnet-4-20250514', inputPricePer1M: 3.0, outputPricePer1M: 15.0 },
  { model: 'claude-3-5-sonnet', inputPricePer1M: 3.0, outputPricePer1M: 15.0 },
  { model: 'claude-3-5-haiku', inputPricePer1M: 0.25, outputPricePer1M: 1.25 },
  { model: 'qwen2.5-coder:14b', inputPricePer1M: 0, outputPricePer1M: 0 },
];

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const entry = PRICING.find((p) => model.toLowerCase().includes(p.model.toLowerCase()));

  if (!entry) return 0;

  const inputCost = (inputTokens / 1_000_000) * entry.inputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * entry.outputPricePer1M;

  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
