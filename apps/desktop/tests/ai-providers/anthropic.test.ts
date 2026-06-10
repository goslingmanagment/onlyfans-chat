// Anthropic streaming client — request shape, callback wiring, error
// classification at the transport boundary, legacy auto-retry, abort.
// Pure SSE-parsing semantics live in packages/shared tests/sse.test.ts and are
// not re-tested here; these tests cover the client wiring around the parser.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTO_RETRY_SERVICE_UNAVAILABLE_MS, MAX_TOKENS } from '@chatgoose/shared/constants';
import { CgError } from '@chatgoose/shared/errors/index';
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  streamAnthropic,
} from '@main/ai/providers/index';
import {
  HAPPY_STREAM,
  MINIMAL_STREAM,
  OVERLOADED_STREAM,
  baseRequest,
  jsonResponse,
  parsedBody,
  recordingFetch,
  rejectionOf,
  sse,
  sseResponse,
} from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

const RATE_LIMIT_BODY = { error: { type: 'rate_limit_error', message: 'rate limited' } };

describe('streamAnthropic request shape', () => {
  it('maps cache TTL hints onto cache_control and pins headers (request snapshot)', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'sk-test', fetchImpl });

    const call = calls[0];
    expect(call?.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(call?.init.method).toBe('POST');
    // Exactly these three headers: no anthropic-beta (1h TTL is GA) and no
    // legacy browser-access header (desktop main process is not a browser).
    expect(call?.init.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'sk-test',
      'anthropic-version': ANTHROPIC_VERSION,
    });
    expect(parsedBody(call)).toEqual({
      model: 'claude-sonnet-4-5',
      stream: true,
      max_tokens: 800,
      system: [
        { type: 'text', text: 'system preamble' },
        { type: 'text', text: 'personality card', cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'static prefix', cache_control: { type: 'ephemeral', ttl: '1h' } },
            { type: 'text', text: 'transcript', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'task' },
          ],
        },
      ],
      temperature: 0.65,
    });
  });

  it('prefers an explicit request temperature over the feature table', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ temperature: 0.3 }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    expect(parsedBody(calls[0])).toMatchObject({ temperature: 0.3 });
  });

  it('sends adaptive summarized thinking without temperature on adaptive-capable models', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-sonnet-4-6' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).toMatchObject({
      max_tokens: 8000,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'medium' },
    });
    expect(body).not.toHaveProperty('temperature');
  });

  it.each(['low', 'high', 'max'] as const)(
    'passes %s effort through unchanged with thinking enabled',
    async (reasoningEffort) => {
      const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

      await streamAnthropic(
        baseRequest({ modelId: 'anthropic:claude-sonnet-4-6', reasoningEffort }),
        { onText: vi.fn() },
        { apiKey: 'k', fetchImpl },
      );

      const body = parsedBody(calls[0]);
      expect(body).toMatchObject({ output_config: { effort: reasoningEffort } });
      expect(body).not.toHaveProperty('temperature');
    },
  );

  it('keeps the raised cap but restores temperature when reasoning is off', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-sonnet-4-6', reasoningEffort: 'off' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).toMatchObject({ max_tokens: 8000, temperature: 0.65 });
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
  });

  it('never sends temperature for sampling-params-removed models even with reasoning off', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-opus-4-8', reasoningEffort: 'off' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
    expect(body).toMatchObject({ max_tokens: 8000 });
  });

  it('sends thinking without temperature on opus-4-8 when reasoning is on', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-opus-4-8' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).toMatchObject({ thinking: { type: 'adaptive', display: 'summarized' } });
    expect(body).not.toHaveProperty('temperature');
  });

  it('keeps thinking off and base caps for non-adaptive models', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-haiku-4-5' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    const body = parsedBody(calls[0]);
    expect(body).toMatchObject({ max_tokens: MAX_TOKENS['fast-reply'], temperature: 0.65 });
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
  });

  it('uses the raised 8192 cap for fan-summary on non-adaptive models', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-haiku-4-5', feature: 'fan-summary' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    expect(parsedBody(calls[0])).toMatchObject({ max_tokens: MAX_TOKENS['fan-summary'] });
  });

  it('uses the adaptive 24000 cap for fan-summary on adaptive models', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ modelId: 'anthropic:claude-opus-4-6', feature: 'fan-summary' }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    expect(parsedBody(calls[0])).toMatchObject({
      max_tokens: 24000,
      thinking: { type: 'adaptive', display: 'summarized' },
    });
  });

  it('honors an explicit maxTokens override', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await streamAnthropic(
      baseRequest({ maxTokens: 12345 }),
      { onText: vi.fn() },
      { apiKey: 'k', fetchImpl },
    );

    expect(parsedBody(calls[0])).toMatchObject({ max_tokens: 12345 });
  });
});

describe('streamAnthropic stream wiring', () => {
  it('streams text deltas and reports cumulative usage, stop reason, and progress', async () => {
    const { fetchImpl } = recordingFetch([() => sseResponse(HAPPY_STREAM)]);
    const onText = vi.fn();
    const onUsage = vi.fn();
    const onProgress = vi.fn();
    const onStopReason = vi.fn();

    const rawText = await streamAnthropic(
      baseRequest(),
      { onText, onUsage, onProgress, onStopReason },
      { apiKey: 'k', fetchImpl },
    );

    expect(rawText).toBe('Hello there');
    expect(onText).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onText).toHaveBeenNthCalledWith(2, ' there');
    expect(onProgress).toHaveBeenCalledTimes(5);
    expect(onStopReason).toHaveBeenCalledWith('end_turn');
    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(onUsage).toHaveBeenNthCalledWith(1, {
      input_tokens: 120,
      cache_creation_input_tokens: 40,
      cache_read_input_tokens: 0,
      output_tokens: 3,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20 },
    });
    expect(onUsage).toHaveBeenNthCalledWith(2, {
      input_tokens: 120,
      cache_creation_input_tokens: 40,
      cache_read_input_tokens: 55,
      output_tokens: 9,
      cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 20 },
    });
  });

  it('propagates a max_tokens stop reason', async () => {
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

    await streamAnthropic(baseRequest(), { onText: vi.fn(), onStopReason }, { apiKey: 'k', fetchImpl });

    expect(onStopReason).toHaveBeenCalledWith('max_tokens');
  });

  it('reports observed reasoning signals and reasoning text deltas', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        sseResponse(
          sse(
            'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"thinking"}}',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"checking context"}}',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"signature_delta","signature":"sig"}}',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
          ),
        ),
    ]);
    const onReasoningObserved = vi.fn();
    const onReasoningDelta = vi.fn();

    await expect(
      streamAnthropic(
        baseRequest({ modelId: 'anthropic:claude-sonnet-4-6' }),
        { onText: vi.fn(), onReasoningObserved, onReasoningDelta },
        { apiKey: 'k', fetchImpl },
      ),
    ).resolves.toBe('ok');

    expect(onReasoningObserved).toHaveBeenCalledWith('thinking_block');
    expect(onReasoningObserved).toHaveBeenCalledWith('thinking_delta');
    expect(onReasoningObserved).toHaveBeenCalledWith('signature_delta');
    expect(onReasoningDelta).toHaveBeenCalledWith('checking context');
  });
});

describe('streamAnthropic error classification', () => {
  it('classifies a 401 and fires onError exactly once with the same error', async () => {
    const { fetchImpl } = recordingFetch([
      () => jsonResponse(401, { error: { type: 'authentication_error', message: 'bad key' } }),
    ]);
    const onError = vi.fn();

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn(), onError }, { apiKey: 'bad', fetchImpl }),
    );

    expect(error).toBeInstanceOf(CgError);
    expect(error).toMatchObject({
      code: 'CG-AUTH-02',
      detail: { provider: 'anthropic', status: 401, providerMessage: 'bad key' },
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('maps a 400 with an unparseable body to CG-APP-01', async () => {
    const { fetchImpl } = recordingFetch([() => new Response('not json', { status: 400 })]);

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-APP-01' });
  });

  it('maps an unrecognized non-ok status with no body to CG-NET-01', async () => {
    const { fetchImpl } = recordingFetch([() => new Response(null, { status: 418 })]);

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-NET-01' });
  });

  it('maps an ok response without a body to CG-NET-01', async () => {
    const { fetchImpl } = recordingFetch([() => new Response(null, { status: 200 })]);

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-NET-01', detail: { provider: 'anthropic' } });
  });

  it('wraps transport-level fetch failures as CG-NET-01 with the provider message', async () => {
    const fetchImpl = (): Promise<Response> => Promise.reject(new TypeError('fetch failed'));

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({
      code: 'CG-NET-01',
      detail: { provider: 'anthropic', providerMessage: 'fetch failed' },
    });
  });
});

describe('streamAnthropic auto-retry (legacy rule: only before the first text chunk)', () => {
  it('retries once on 429 when Retry-After is within the 60s cap', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { 'retry-after': '0' }),
      () => sseResponse(HAPPY_STREAM),
    ]);
    const onError = vi.fn();

    await expect(
      streamAnthropic(baseRequest(), { onText: vi.fn(), onError }, { apiKey: 'k', fetchImpl }),
    ).resolves.toBe('Hello there');

    expect(calls).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('waits exactly Retry-After before the retry request', async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { 'retry-after': '1' }),
      () => sseResponse(HAPPY_STREAM),
    ]);

    const promise = streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl });
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('Hello there');
    expect(calls).toHaveLength(2);
  });

  it('does not retry a 429 whose Retry-After exceeds the 60s cap', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { 'retry-after': '61' }),
    ]);
    const onError = vi.fn();

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn(), onError }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-API-01', retryAfterMs: 61000 });
    expect(calls).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 429 without a Retry-After header', async () => {
    const { fetchImpl, calls } = recordingFetch([() => jsonResponse(429, RATE_LIMIT_BODY)]);

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-API-01' });
    expect(calls).toHaveLength(1);
  });

  it('retries a rate limit at most once', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { 'retry-after': '0' }),
      () => jsonResponse(429, RATE_LIMIT_BODY, { 'retry-after': '0' }),
    ]);
    const onError = vi.fn();

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText: vi.fn(), onError }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-API-01' });
    expect(calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('retries once on 503 after the fixed 5s delay', async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(503, { error: { type: 'overloaded_error', message: 'overloaded' } }),
      () => sseResponse(HAPPY_STREAM),
    ]);

    const promise = streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl });
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_SERVICE_UNAVAILABLE_MS - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('Hello there');
    expect(calls).toHaveLength(2);
  });

  it('retries a 503 at most once', async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(503, { error: { type: 'overloaded_error', message: 'overloaded' } }),
      () => jsonResponse(503, { error: { type: 'overloaded_error', message: 'overloaded' } }),
    ]);
    const onError = vi.fn();

    const promise = streamAnthropic(
      baseRequest(),
      { onText: vi.fn(), onError },
      { apiKey: 'k', fetchImpl },
    );
    const rejection = rejectionOf(promise);
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_SERVICE_UNAVAILABLE_MS);

    expect(await rejection).toMatchObject({ code: 'CG-API-05' });
    expect(calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('retries a mid-stream service-unavailable error event that precedes any text', async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = recordingFetch([
      () => sseResponse(OVERLOADED_STREAM),
      () => sseResponse(HAPPY_STREAM),
    ]);

    const promise = streamAnthropic(baseRequest(), { onText: vi.fn() }, { apiKey: 'k', fetchImpl });
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_SERVICE_UNAVAILABLE_MS);

    await expect(promise).resolves.toBe('Hello there');
    expect(calls).toHaveLength(2);
  });

  it('does not retry after the first text chunk and still releases the reader', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n' +
              'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n',
          ),
        );
        // Stream intentionally left open: the mid-stream error event must
        // tear the still-active body down via the finally reader.cancel().
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetchImpl, calls } = recordingFetch([() => new Response(stream, { status: 200 })]);
    const onText = vi.fn();
    const onError = vi.fn();

    const error = await rejectionOf(
      streamAnthropic(baseRequest(), { onText, onError }, { apiKey: 'k', fetchImpl }),
    );

    expect(error).toMatchObject({ code: 'CG-API-05' });
    expect(onText).toHaveBeenCalledWith('Hel');
    expect(calls).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(true);
  });
});

describe('streamAnthropic abort', () => {
  it('releases the reader on mid-stream abort and rejects without onError', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
          ),
        );
        // Never closed: only the abort path can end the stream.
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetchImpl } = recordingFetch([() => new Response(stream, { status: 200 })]);
    const controller = new AbortController();
    const onError = vi.fn();

    const error = await rejectionOf(
      streamAnthropic(
        baseRequest(),
        { onText: () => controller.abort(), onError },
        { apiKey: 'k', fetchImpl, signal: controller.signal },
      ),
    );

    expect(error).not.toBeInstanceOf(CgError);
    expect(cancelled).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const { fetchImpl, calls } = recordingFetch([]);
    const controller = new AbortController();
    controller.abort();

    const error = await rejectionOf(
      streamAnthropic(
        baseRequest(),
        { onText: vi.fn() },
        { apiKey: 'k', fetchImpl, signal: controller.signal },
      ),
    );

    expect(error).not.toBeInstanceOf(CgError);
    expect(calls).toHaveLength(0);
  });
});
