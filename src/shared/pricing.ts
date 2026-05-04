interface ModelPricing {
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { input: 15 / 1e6, output: 75 / 1e6, cache_read: 1.5 / 1e6, cache_create: 18.75 / 1e6 },
  "claude-opus-4-5-20250620": { input: 15 / 1e6, output: 75 / 1e6, cache_read: 1.5 / 1e6, cache_create: 18.75 / 1e6 },
  "claude-sonnet-4-6": { input: 3 / 1e6, output: 15 / 1e6, cache_read: 0.3 / 1e6, cache_create: 3.75 / 1e6 },
  "claude-sonnet-4-5-20250514": { input: 3 / 1e6, output: 15 / 1e6, cache_read: 0.3 / 1e6, cache_create: 3.75 / 1e6 },
  "claude-haiku-4-5-20251001": { input: 0.8 / 1e6, output: 4 / 1e6, cache_read: 0.08 / 1e6, cache_create: 1 / 1e6 },
};

export interface CostEstimate {
  model: string;
  cost_usd: number | null;
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreateTokens: number,
): number | null {
  const pricing = PRICING[model];
  if (!pricing) return null;
  return (
    inputTokens * pricing.input +
    outputTokens * pricing.output +
    cacheReadTokens * pricing.cache_read +
    cacheCreateTokens * pricing.cache_create
  );
}

export function getPricing(model: string): ModelPricing | null {
  return PRICING[model] ?? null;
}

export function hasPricing(model: string): boolean {
  return model in PRICING;
}
