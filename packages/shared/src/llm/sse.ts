// Pure incremental SSE parser for Anthropic Messages streams and OpenRouter's
// Messages-compatible endpoint. Bytes/strings in, semantic events out; no network.
// Per the SSE spec (and legacy behavior), an event block not followed by a blank
// line before end-of-stream is discarded.

import { z } from 'zod';

// Minimal ambient type for the WHATWG TextDecoder global (lib "ES2023" has no DOM types).
declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

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
}

export type LlmReasoningSignal =
  | 'thinking_block'
  | 'redacted_thinking_block'
  | 'thinking_delta'
  | 'signature_delta'
  | 'reasoning_delta';

// ─── Raw SSE block parsing ───────────────────────────────────────────────

export interface SseEvent {
  event: string;
  data: string;
}

/** Parses one blank-line-delimited SSE block. Returns null when it carries no data lines. */
export function parseSseEventBlock(block: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }
  return { event, data: dataLines.join('\n') };
}

// ─── Usage accumulation ──────────────────────────────────────────────────

export interface UsagePayload {
  input_tokens?: number | undefined;
  cache_creation_input_tokens?: number | undefined;
  cache_read_input_tokens?: number | undefined;
  output_tokens?: number | undefined;
  cache_creation?:
    | {
        ephemeral_5m_input_tokens?: number | undefined;
        ephemeral_1h_input_tokens?: number | undefined;
      }
    | undefined;
}

/** Merges a partial usage payload over the running totals; absent fields keep prior values. */
export function mergeUsage(
  current: LlmUsageMetrics | null,
  next?: UsagePayload,
): LlmUsageMetrics | null {
  if (!next) {
    return current;
  }

  const nextCacheCreation = next.cache_creation;
  const currentCacheCreation = current?.cache_creation;
  const cacheCreation =
    nextCacheCreation || currentCacheCreation
      ? {
          ephemeral_5m_input_tokens:
            typeof nextCacheCreation?.ephemeral_5m_input_tokens === 'number'
              ? nextCacheCreation.ephemeral_5m_input_tokens
              : currentCacheCreation?.ephemeral_5m_input_tokens ?? 0,
          ephemeral_1h_input_tokens:
            typeof nextCacheCreation?.ephemeral_1h_input_tokens === 'number'
              ? nextCacheCreation.ephemeral_1h_input_tokens
              : currentCacheCreation?.ephemeral_1h_input_tokens ?? 0,
        }
      : undefined;

  return {
    input_tokens:
      typeof next.input_tokens === 'number' ? next.input_tokens : current?.input_tokens ?? 0,
    cache_creation_input_tokens:
      typeof next.cache_creation_input_tokens === 'number'
        ? next.cache_creation_input_tokens
        : current?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens:
      typeof next.cache_read_input_tokens === 'number'
        ? next.cache_read_input_tokens
        : current?.cache_read_input_tokens ?? 0,
    output_tokens:
      typeof next.output_tokens === 'number' ? next.output_tokens : current?.output_tokens ?? 0,
    ...(cacheCreation ? { cache_creation: cacheCreation } : {}),
  };
}

export function usageEquals(
  left: LlmUsageMetrics | null,
  right: LlmUsageMetrics | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.input_tokens === right.input_tokens &&
    left.cache_creation_input_tokens === right.cache_creation_input_tokens &&
    left.cache_read_input_tokens === right.cache_read_input_tokens &&
    left.output_tokens === right.output_tokens &&
    (left.cache_creation?.ephemeral_5m_input_tokens ?? 0) ===
      (right.cache_creation?.ephemeral_5m_input_tokens ?? 0) &&
    (left.cache_creation?.ephemeral_1h_input_tokens ?? 0) ===
      (right.cache_creation?.ephemeral_1h_input_tokens ?? 0)
  );
}

// ─── Stream payload validation ───────────────────────────────────────────

// Non-numeric token counts are treated as absent (legacy used typeof checks).
const tokenCount = z.number().optional().catch(undefined);

const usagePayloadSchema = z.object({
  input_tokens: tokenCount,
  cache_creation_input_tokens: tokenCount,
  cache_read_input_tokens: tokenCount,
  output_tokens: tokenCount,
  cache_creation: z
    .object({
      ephemeral_5m_input_tokens: tokenCount,
      ephemeral_1h_input_tokens: tokenCount,
    })
    .optional()
    .catch(undefined),
  // OpenAI-shaped fields seen on OpenRouter streams.
  prompt_tokens: tokenCount,
  completion_tokens: tokenCount,
  prompt_tokens_details: z
    .object({
      cached_tokens: tokenCount,
      cache_write_tokens: tokenCount,
    })
    .optional()
    .catch(undefined),
});

type ParsedUsage = z.infer<typeof usagePayloadSchema>;

const streamPayloadSchema = z.object({
  type: z.string().optional(),
  object: z.string().optional(),
  choices: z.array(z.unknown()).optional(),
  message: z.object({ usage: usagePayloadSchema.optional().catch(undefined) }).optional(),
  content_block: z.object({ type: z.string().optional() }).optional(),
  usage: usagePayloadSchema.optional().catch(undefined),
  delta: z
    .object({
      type: z.string().optional(),
      thinking: z.unknown().optional(),
      text: z.string().optional(),
      stop_reason: z.string().nullable().optional(),
      reasoning: z.unknown().optional(),
    })
    .optional(),
  reasoning: z.unknown().optional(),
  error: z
    .object({
      type: z.string().optional(),
      message: z.string().optional(),
      code: z.union([z.number(), z.string()]).optional(),
    })
    .nullable()
    .optional(),
});

type StreamPayload = z.infer<typeof streamPayloadSchema>;

// ─── Semantic events ─────────────────────────────────────────────────────

export interface SseStreamError {
  type?: string | undefined;
  message?: string | undefined;
  code?: number | string | undefined;
}

export type LlmStreamEvent =
  | { kind: 'progress' }
  | { kind: 'text-delta'; text: string }
  | { kind: 'reasoning-observed'; signal: LlmReasoningSignal }
  | { kind: 'reasoning-delta'; text: string }
  | { kind: 'usage'; usage: LlmUsageMetrics }
  | { kind: 'stop-reason'; stopReason: string | null }
  | { kind: 'stream-error'; error: SseStreamError | null }
  | { kind: 'unsupported-chunk'; message: string };

export type SseDialect = 'anthropic' | 'openrouter';

// Events with Anthropic Messages streaming semantics; OpenRouter may forward
// provider metadata events outside this set, which are ignored.
const OPENROUTER_SUPPORTED_EVENTS = new Set([
  'message_start',
  'message_delta',
  'message_stop',
  'content_block_start',
  'content_block_delta',
  'content_block_stop',
  'ping',
  'error',
]);

export const UNSUPPORTED_CHUNK_MESSAGE = 'Unsupported OpenRouter chat completion stream chunk';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasReasoningProperty(value: unknown): boolean {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'reasoning');
}

function extractReasoningText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    return '';
  }
  for (const key of ['thinking', 'reasoning', 'text', 'content'] as const) {
    const text = value[key];
    if (typeof text === 'string') {
      return text;
    }
  }
  return '';
}

function detectReasoningSignal(
  payload: StreamPayload,
  scanChoices: boolean,
): LlmReasoningSignal | null {
  switch (payload.content_block?.type) {
    case 'thinking':
      return 'thinking_block';
    case 'redacted_thinking':
      return 'redacted_thinking_block';
  }

  switch (payload.delta?.type) {
    case 'thinking_delta':
      return 'thinking_delta';
    case 'signature_delta':
      return 'signature_delta';
  }

  if (hasReasoningProperty(payload.delta) || hasReasoningProperty(payload)) {
    return 'reasoning_delta';
  }

  if (scanChoices) {
    const hasChoiceReasoning = payload.choices?.some(
      (choice) =>
        isRecord(choice) &&
        (hasReasoningProperty(choice['delta']) || hasReasoningProperty(choice['message'])),
    );
    if (hasChoiceReasoning) {
      return 'reasoning_delta';
    }
  }

  return null;
}

function extractReasoningDeltaText(payload: StreamPayload): string {
  if (payload.delta?.type === 'thinking_delta') {
    return extractReasoningText(payload.delta.thinking);
  }

  const direct = extractReasoningText(payload.delta?.reasoning ?? payload.reasoning);
  if (direct) {
    return direct;
  }

  for (const choice of payload.choices ?? []) {
    if (!isRecord(choice)) {
      continue;
    }
    const delta = choice['delta'];
    const message = choice['message'];
    const text = extractReasoningText(
      (isRecord(delta) ? delta['reasoning'] : undefined) ??
        (isRecord(message) ? message['reasoning'] : undefined),
    );
    if (text) {
      return text;
    }
  }

  return '';
}

/**
 * OpenAI-shaped usage (prompt_tokens + details) maps to Anthropic-shaped fields
 * without double-counting: cached/cache-write tokens are subtracted from input.
 */
function normalizeOpenRouterUsage(usage: ParsedUsage | undefined): UsagePayload | undefined {
  if (!usage) {
    return undefined;
  }

  const normalized: UsagePayload = {};
  const outputTokens =
    typeof usage.output_tokens === 'number' ? usage.output_tokens : usage.completion_tokens;

  if (typeof usage.input_tokens !== 'number' && typeof usage.prompt_tokens === 'number') {
    const details = usage.prompt_tokens_details;
    const cacheReadTokens = typeof details?.cached_tokens === 'number' ? details.cached_tokens : 0;
    const cacheWriteTokens =
      typeof details?.cache_write_tokens === 'number' ? details.cache_write_tokens : 0;

    normalized.input_tokens = Math.max(0, usage.prompt_tokens - cacheReadTokens - cacheWriteTokens);
    normalized.cache_creation_input_tokens = Math.max(0, cacheWriteTokens);
    normalized.cache_read_input_tokens = Math.max(0, cacheReadTokens);
  } else {
    if (typeof usage.input_tokens === 'number') {
      normalized.input_tokens = usage.input_tokens;
    }
    if (typeof usage.cache_creation_input_tokens === 'number') {
      normalized.cache_creation_input_tokens = usage.cache_creation_input_tokens;
    }
    if (typeof usage.cache_read_input_tokens === 'number') {
      normalized.cache_read_input_tokens = usage.cache_read_input_tokens;
    }
    if (usage.cache_creation) {
      normalized.cache_creation = usage.cache_creation;
    }
  }

  if (typeof outputTokens === 'number') {
    normalized.output_tokens = outputTokens;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

// ─── Incremental parser ──────────────────────────────────────────────────

/**
 * Feed raw stream chunks; receive semantic events. After a fatal event
 * ('stream-error' / 'unsupported-chunk') the parser stops: it is the pure
 * equivalent of the legacy clients throwing mid-stream.
 */
export class MessagesSseParser {
  private readonly dialect: SseDialect;
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private usage: LlmUsageMetrics | null = null;
  private terminated = false;

  constructor(dialect: SseDialect) {
    this.dialect = dialect;
  }

  push(chunk: string | Uint8Array): LlmStreamEvent[] {
    if (this.terminated) {
      return [];
    }

    this.buffer +=
      typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });

    // Blank-line event boundaries, tolerating CRLF from intermediary proxies.
    const blocks = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = blocks.pop() ?? '';

    const events: LlmStreamEvent[] = [];
    for (const block of blocks) {
      const parsed = parseSseEventBlock(block);
      if (!parsed || parsed.data === '[DONE]') {
        continue;
      }
      this.interpret(parsed, events);
      if (this.terminated) {
        break;
      }
    }
    return events;
  }

  private interpret(event: SseEvent, out: LlmStreamEvent[]): void {
    let json: unknown;
    try {
      json = JSON.parse(event.data);
    } catch {
      return;
    }
    const result = streamPayloadSchema.safeParse(json);
    if (!result.success) {
      return;
    }
    const payload = result.data;

    out.push({ kind: 'progress' });

    const openRouter = this.dialect === 'openrouter';
    // A null error field is not an error (legacy truthiness check).
    const isErrorEvent =
      event.event === 'error' ||
      payload.type === 'error' ||
      (openRouter && payload.error !== undefined && payload.error !== null);
    if (isErrorEvent) {
      this.terminated = true;
      out.push({ kind: 'stream-error', error: payload.error ?? null });
      return;
    }

    let effectiveEvent = event.event;
    if (openRouter) {
      if (event.event === 'message' && typeof payload.type === 'string') {
        effectiveEvent = payload.type;
      }
      if (!OPENROUTER_SUPPORTED_EVENTS.has(effectiveEvent)) {
        if (payload.object === 'chat.completion.chunk' || payload.choices !== undefined) {
          this.terminated = true;
          out.push({ kind: 'unsupported-chunk', message: UNSUPPORTED_CHUNK_MESSAGE });
        }
        // Other metadata events are ignored — and must not emit reasoning first.
        return;
      }
    }

    const signal = detectReasoningSignal(payload, openRouter);
    if (signal) {
      out.push({ kind: 'reasoning-observed', signal });
    }
    const reasoningText = extractReasoningDeltaText(payload);
    if (reasoningText) {
      out.push({ kind: 'reasoning-delta', text: reasoningText });
    }

    if (effectiveEvent === 'message_start') {
      this.takeUsage(payload.message?.usage, out);
    }

    if (effectiveEvent === 'message_delta') {
      const delta = payload.delta;
      if (delta && 'stop_reason' in delta) {
        out.push({ kind: 'stop-reason', stopReason: delta.stop_reason ?? null });
      }
      this.takeUsage(payload.usage, out);
    }

    if (
      effectiveEvent === 'content_block_delta' &&
      payload.delta?.type === 'text_delta' &&
      payload.delta.text
    ) {
      out.push({ kind: 'text-delta', text: payload.delta.text });
    }
  }

  private takeUsage(raw: ParsedUsage | undefined, out: LlmStreamEvent[]): void {
    const next = this.dialect === 'openrouter' ? normalizeOpenRouterUsage(raw) : raw;
    const merged = mergeUsage(this.usage, next);
    if (!usageEquals(this.usage, merged) && merged) {
      out.push({ kind: 'usage', usage: merged });
    }
    this.usage = merged;
  }
}
