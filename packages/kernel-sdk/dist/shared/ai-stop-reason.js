/** Provider-native output-exhaustion stop reasons, normalized to one
 * predicate. Anthropic reports 'max_tokens'; OpenRouter (OpenAI-style)
 * reports 'length'. An exhausted generation is truncated mid-thought and
 * must never be committed as a usable coach answer or attached as a recap. */
const EXHAUSTED_STOP_REASONS = new Set(["max_tokens", "length"]);
export function isOutputExhausted(stopReason) {
    return stopReason != null && EXHAUSTED_STOP_REASONS.has(stopReason);
}
