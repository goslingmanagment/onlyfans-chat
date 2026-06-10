// OpenRouter streaming client — Messages-compatible request shape (legacy
// quirks: temperature always sent, cache_control stripped), usage payload
// mapping, reasoning_delta signals, unsupported-chunk rejection, auto-retry.
// Pure SSE-parsing semantics live in packages/shared tests/sse.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTO_RETRY_SERVICE_UNAVAILABLE_MS, MAX_TOKENS } from '@chatgoose/shared/constants';
import { CgError } from '@chatgoose/shared/errors/index';
import { UNSUPPORTED_CHUNK_MESSAGE } from '@chatgoose/shared/llm/sse';
import { OPENROUTER_MESSAGES_URL, streamOpenRouter } from '@main/ai/providers/index';
import {
  HAPPY_STREAM,
  MINIMAL_STREAM,
  baseRequest,
  jsonResponse,
  parsedBody,
  recordingFetch,
  rejectionOf,
  sse,
  sseResponse,
} from './helpers';
import type { LlmStreamRequest } from '@main/ai/providers/index';

afterEach(() => {
  vi.useRealTimers();
});

function grokRequest(overrides: Partial<LlmStreamRequest> = {}): LlmStreamRequest {
  return baseRequest({ modelId: 'openrouter:x-ai/grok-4.3', ...overrides });
}

function geminiRequest(overrides: Partial<LlmStreamRequest> = {}): LlmStreamRequest {
  return baseRequest({ modelId: 'openrouter:google/gemini-3.1-pro-preview', ...overrides });
}

describe('streamOpenRouter request shape', () => {
  it('posts to the Messages endpoint, strips cache_control, and always sends temperature', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamOpenRouter(grokRequest(), { onText: vi.fn() }, { apiKey: 'sk-or-test', fetchImpl });

    const call = calls[0];
    expect(call?.url).toBe(OPENROUTER_MESSAGES_URL);
    expect(call?.init.headers).toEqual({
      authorization: 'Bearer sk-or-test',
      'content-type': 'application/json',
      'x-openrouter-title': 'ChatGoose',
    });
    expect(parsedBody(call)).toEqual({
      model: 'x-ai/grok-4.3',
      temperature: 0.65,
      stream: true,
      max_tokens: MAX_TOKENS['fast-reply'],
      system: [
        { type: 'text', text: 'system preamble' },
        { type: 'text', text: 'personality card' },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'static prefix' },
            { type: 'text', text: 'transcript' },
            { type: 'text', text: 'task' },
          ],
        },
      ],
    });
  });

  it('sends Gemini omitted thinking with temperature still present (legacy quirk)', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamOpenRouter(geminiRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl });

    expect(parsedBody(calls[0])).toMatchObject({
      temperature: 0.65,
      max_tokens: 1600,
      thinking: { type: 'adaptive', display: 'omitted' },
      output_config: { effort: 'medium' },
    });
  });

  it('keeps the Gemini cap but omits thinking when reasoning is off', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamOpenRouter(
      geminiRequest({ reasoningEffort: 'off' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).toMatchObject({ max_tokens: 1600, temperature: 0.65 });
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
  });

  it('maps max Gemini reasoning to high', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamOpenRouter(
      geminiRequest({ reasoningEffort: 'max' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    expect(parsedBody(calls[0])).toMatchObject({
      thinking: { type: 'adaptive', display: 'omitted' },
      output_config: { effort: 'high' },
    });
  });

  it('keeps base caps and no thinking config for deep Gemini features', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamOpenRouter(
      geminiRequest({ feature: 'fan-summary' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).toMatchObject({ max_tokens: MAX_TOKENS['fan-summary'] });
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
  });

  it('honors an explicit maxTokens override', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamOpenRouter(
      grokRequest({ maxTokens: 4242 }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    expect(parsedBody(calls[0])).toMatchObject({ max_tokens: 4242 });
  });
});

describe('streamOpenRouter stream wiring', () => {
  it('streams text deltas and resolves the accumulated raw text', async () => {
    const { fetchImpl } = recordingFetch([() => sseResponse(HAPPY_STREAM)]);
    const onText = vi.fn();

    await expect(
      streamOpenRouter(grokRequest(), { onText }, { apiKey: 'k', fetchImpl }),
    ).resolves.toBe('Hello there');
    expect(onText).toHaveBeenCalledTimes(2);
  });

  it('maps OpenAI-shaped usage with prompt token details without double-counting', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        sseResponse(
          sse(
            'event: message_delta\ndata: {"type":"message_delta","usage":{"prompt_tokens":1000,"completion_tokens":100,"prompt_tokens_details":{"cached_tokens":300,"cache_write_tokens":200}}}',
            'event: message_stop\ndata: {"type":"message_stop"}',
          ),
        ),
    ]);
    const onUsage = vi.fn();

    await streamOpenRouter(grokRequest(), { onText: vi.fn(), onUsage }, { apiKey: 'k', fetchImpl });

    expect(onUsage).toHaveBeenLastCalledWith({
      input_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
      output_tokens: 100,
    });
  });

  it('maps OpenAI-shaped usage without details to uncached input', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        sseResponse(
          sse(
            'event: message_delta\ndata: {"type":"message_delta","usage":{"prompt_tokens":1000,"completion_tokens":100}}',
            'event: message_stop\ndata: {"type":"message_stop"}',
          ),
        ),
    ]);
    const onUsage = vi.fn();

    await streamOpenRouter(grokRequest(), { onText: vi.fn(), onUsage }, { apiKey: 'k', fetchImpl });

    expect(onUsage).toHaveBeenLastCalledWith({
      input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 100,
    });
  });

  it('preserves Anthropic-shaped cache read and write usage', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        sseResponse(
          sse(
            'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_creation_input_tokens":42,"cache_read_input_tokens":7,"output_tokens":1}}}',
            'event: message_delta\ndata: {"type":"message_delta","usage":{"cache_read_input_tokens":99,"output_tokens":3}}',
            'event: message_stop\ndata: {"type":"message_stop"}',
          ),
        ),
    ]);
    const onUsage = vi.fn();

    await streamOpenRouter(grokRequest(), { onText: vi.fn(), onUsage }, { apiKey: 'k', fetchImpl });

    expect(onUsage).toHaveBeenLastCalledWith({
      input_tokens: 10,
      cache_creation_input_tokens: 42,
      cache_read_input_tokens: 99,
      output_tokens: 3,
    });
  });

  it.each([
    ['delta', '{"type":"message_delta","choices":[{"delta":{"reasoning":""}}]}'],
    ['message', '{"type":"message_delta","choices":[{"message":{"reasoning":""}}]}'],
  ])('observes empty choices[].%s.reasoning as a reasoning_delta signal', async (_shape, data) => {
    const { fetchImpl } = recordingFetch([
      () => sseResponse(sse(`event: message_delta\ndata: ${data}`)),
    ]);
    const onReasoningObserved = vi.fn();

    await expect(
      streamOpenRouter(grokRequest(), { onText: vi.fn(), onReasoningObserved }, { apiKey: 'k', fetchImpl }),
    ).resolves.toBe('');

    expect(onReasoningObserved).toHaveBeenCalledWith('reasoning_delta');
  });

  it('forwards non-empty choices reasoning text to onReasoningDelta', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        sseResponse(
          sse(
            'event: message_delta\ndata: {"type":"message_delta","choices":[{"delta":{"reasoning":"checking context"}}]}',
          ),
        ),
    ]);
    const onReasoningObserved = vi.fn();
    const onReasoningDelta = vi.fn();

    await streamOpenRouter(
      geminiRequest(),
      { onText: vi.fn(), onReasoningObserved, onReasoningDelta },
      { apiKey: 'k', fetchImpl },
    );

    expect(onReasoningObserved).toHaveBeenCalledWith('reasoning_delta');
    expect(onReasoningDelta).toHaveBeenCalledWith('checking context');
  });

  it('reports Anthropic message stop reasons from the OpenRouter stream', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        sseResponse(
          sse(
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":800}}',
            'event: message_stop\ndata: {"type":"message_stop"}',
          ),
        ),
    ]);
    const onStopReason = vi.fn();

    await streamOpenRouter(grokRequest(), { onText: vi.fn(), onStopReason }, { apiKey: 'k', fetchImpl });

    expect(onStopReason).toHaveBeenCalledWith('max_tokens');
  });
});

describe('streamOpenRouter errors and retry', () => {
  it('rejects unsupported OpenAI chat completion chunks without retrying', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () =>
        sseResponse(
          sse('data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}', 'data: [DONE]'),
        ),
    ]);
    const onError = vi.fn();

    const error = await rejectionOf(
      streamOpenRouter(grokRequest(), { onText: vi.fn(), onError }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toBeInstanceOf(CgError);
    expect(error).toMatchObject({
      code: 'CG-APP-01',
      detail: { provider: 'openrouter', providerMessage: UNSUPPORTED_CHUNK_MESSAGE },
    });
    expect(calls).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('classifies data-only stream error payloads as rate limited without auto-retry', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => sseResponse(sse('data: {"error":{"code":429,"message":"rate limit exceeded"}}')),
    ]);

    const error = await rejectionOf(
      streamOpenRouter(grokRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    // Rate-limit retry requires a Retry-After duration; stream errors carry none.
    expect(error).toMatchObject({ code: 'CG-API-01', detail: { provider: 'openrouter' } });
    expect(calls).toHaveLength(1);
  });

  it('maps OpenRouter model errors without retrying another endpoint', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(404, { error: { code: 404, message: 'Invalid model specified' } }),
    ]);

    const error = await rejectionOf(
      streamOpenRouter(grokRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-API-03', detail: { provider: 'openrouter' } });
    expect(calls).toHaveLength(1);
  });

  it('retries once on 503 after the fixed 5s delay', async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(503, { error: { message: 'service unavailable' } }),
      () => sseResponse(HAPPY_STREAM),
    ]);

    const promise = streamOpenRouter(grokRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl });
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_SERVICE_UNAVAILABLE_MS - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe('Hello there');
    expect(calls).toHaveLength(2);
  });

  it('retries once on 429 with a short Retry-After', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(429, { error: { code: 429, message: 'rate limited' } }, { 'retry-after': '0' }),
      () => sseResponse(HAPPY_STREAM),
    ]);

    await expect(
      streamOpenRouter(grokRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    ).resolves.toBe('Hello there');
    expect(calls).toHaveLength(2);
  });
});
