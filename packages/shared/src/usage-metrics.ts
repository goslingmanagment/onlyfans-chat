// Provider-agnostic LLM usage metrics (legacy Anthropic field names — the
// persisted usage_events payloads and the hub wire mapping both key on
// them). Relocated from llm/sse.ts in Stage 31 Task 3: the llm/ package
// (providers, cost tables, model registry) died with the kernel cutover;
// this type is the surviving shared vocabulary.

export interface LlmCacheCreationUsage {
  ephemeral_5m_input_tokens: number;
  ephemeral_1h_input_tokens: number;
}

export interface LlmUsageMetrics {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  cache_creation?: LlmCacheCreationUsage;
  /** Stage 31: gateway-reported cost (micro-USD) — replaces local price
   * tables; absent on legacy persisted payloads. */
  cost_micro_usd?: number;
}

export type LlmReasoningSignal =
  | 'thinking_block'
  | 'redacted_thinking_block'
  | 'thinking_delta'
  | 'signature_delta'
  | 'reasoning_delta';

/** Compact token display (relocated from llm/cost.ts — presentation util). */
export function formatCompactTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) {
    const v = n / 1000;
    return v % 1 === 0 ? `${v}k` : `${v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  const v = n / 1_000_000;
  return v % 1 === 0 ? `${v}M` : `${v.toFixed(1).replace(/\.0$/, '')}M`;
}
