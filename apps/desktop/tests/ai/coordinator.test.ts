// Coordinator lifecycle behavior (SPEC §8.3, research §8): frame ordering,
// concurrency gates, discard-on-switch, staged timeouts, result sanitation,
// spend summaries, usage_events bookkeeping, debug prompt inspection and the
// no-double-retry contract with the providers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QUICK_OPERATION_TIMEOUT_MS,
  STREAM_CHUNK_FLUSH_MS,
} from '@chatgoose/shared/constants';
import { CgError } from '@chatgoose/shared/errors/index';
import { buildLlmSpendSummary } from '@chatgoose/shared/llm/cost';
import type { LlmUsageMetrics } from '@chatgoose/shared/llm/sse';
import { parseOperationEvent } from '@chatgoose/shared/protocol/index';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import { z } from 'zod';
import { createAiCoordinator, PERSONALITIES_SETTINGS_KEY } from '@main/ai/index';
import type { AiCoordinator } from '@main/ai/index';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  flushAsync,
  framesOfType,
  makeKeychain,
  makeSettingsStore,
  makeSettingsVM,
  makeStubClient,
  makeStubGateway,
  memoryDataLayer,
  sampleUser,
  seedMessages,
  startRequest,
} from './helpers';
import type { StubClient, StubGateway } from './helpers';
import type { SettingsVM } from '../../src/preload/contract';

const USAGE: LlmUsageMetrics = {
  input_tokens: 1200,
  cache_creation_input_tokens: 300,
  cache_read_input_tokens: 800,
  output_tokens: 90,
};

describe('AiCoordinator', () => {
  let data: DataLayer;
  let stub: StubClient;
  let gateway: StubGateway;
  let frames: OperationEvent[];
  let coordinator: AiCoordinator;

  function build(settings: SettingsVM = makeSettingsVM(), keys: Record<string, string> = { anthropicKey: 'sk-ant' }): void {
    coordinator = createAiCoordinator({
      data,
      client: stub.client,
      settingsStore: makeSettingsStore(settings),
      keychain: makeKeychain(keys),
      gateway: gateway.gateway,
    });
    coordinator.subscribe((event) => frames.push(event));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    data = memoryDataLayer();
    seedMessages(data, 5);
    stub = makeStubClient();
    stub.setUser(sampleUser());
    gateway = makeStubGateway();
    frames = [];
  });

  afterEach(() => {
    coordinator.dispose();
    data.close();
    vi.useRealTimers();
  });

  async function startAndReachStream(
    overrides: Parameters<typeof startRequest>[0] = {},
  ): Promise<void> {
    coordinator.start(startRequest(overrides));
    await flushAsync();
    expect(gateway.cb).not.toBeNull();
  }

  it('happy path: progress → chunk* → complete, all frames wire-valid', async () => {
    build();
    await startAndReachStream();

    gateway.cb?.onUsage?.(USAGE);
    gateway.cb?.onText('hey');
    gateway.cb?.onText(' you');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    gateway.cb?.onComplete('hey you');
    await flushAsync();

    for (const frame of frames) {
      expect(parseOperationEvent(frame)).not.toBeNull();
    }

    const types = frames.map((frame) => frame.type);
    expect(types[types.length - 1]).toBe('operation:complete');
    const firstChunk = types.indexOf('operation:chunk');
    const lastProgress = types.lastIndexOf('operation:progress');
    expect(firstChunk).toBeGreaterThan(lastProgress);

    const progress = framesOfType(frames, 'operation:progress');
    expect(progress.map((frame) => frame.phase)).toEqual([
      'loading-messages',
      'loading-earnings',
      'generating',
    ]);

    const chunks = framesOfType(frames, 'operation:chunk');
    expect(chunks.map((frame) => frame.text).join('')).toBe('hey you');

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.operationId).toBe('op-1');
    expect(complete?.result.rawText).toBe('hey you');
    expect(complete?.result.parts).toEqual(['hey you']);
  });

  it('batches stream chunks on the 50 ms relay timer', async () => {
    build();
    await startAndReachStream();

    gateway.cb?.onText('a');
    gateway.cb?.onText('b');
    expect(framesOfType(frames, 'operation:chunk')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    const chunks = framesOfType(frames, 'operation:chunk');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('ab');
  });

  it('rejects a concurrent start for the same conversation with CG-FLOW-04', async () => {
    build();
    coordinator.start(startRequest({ operationId: 'op-a' }));
    coordinator.start(startRequest({ operationId: 'op-b' }));
    await flushAsync();

    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.operationId).toBe('op-b');
    expect(errors[0]?.error.code).toBe('CG-FLOW-04');
    // the reserved operation keeps running
    expect(gateway.calls).toHaveLength(1);
  });

  it('rejects compare with its clean deferred CG-FLOW frame (no pipeline started)', async () => {
    build();
    coordinator.start(startRequest({ operationId: 'op-compare', feature: 'compare' }));
    await flushAsync();

    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.operationId).toBe('op-compare');
    expect(errors[0]?.error.code).toBe('CG-FLOW-P4');
    expect(errors[0]?.error.message).toContain('arrives in P4');
    expect(gateway.calls).toHaveLength(0);
    // the conversation slot stays free — a real feature can start immediately
    coordinator.start(startRequest({ operationId: 'op-after' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(1);
  });

  it('discards on conversation switch mid-stream and ignores the stale completion', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onText('partial');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);

    coordinator.conversationOpened(ACCT, '9999');
    const discarded = framesOfType(frames, 'operation:discarded');
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.reason).toBe('chat_changed');
    expect(gateway.cancelCount).toBe(1);

    gateway.cb?.onComplete('partial and more');
    await flushAsync();
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
    expect(framesOfType(frames, 'operation:error')).toHaveLength(0);
  });

  it('ai:cancel discards with reason cancelled and cancels the stream', async () => {
    build();
    await startAndReachStream();
    coordinator.cancel('op-1');

    const discarded = framesOfType(frames, 'operation:discarded');
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.reason).toBe('cancelled');
    expect(gateway.cancelCount).toBe(1);
  });

  it('fires the quick-total staged timeout as CG-NET-02', async () => {
    build();
    await startAndReachStream();
    await vi.advanceTimersByTimeAsync(QUICK_OPERATION_TIMEOUT_MS);

    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-NET-02');
    expect(gateway.cancelCount).toBe(1);
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
  });

  it('maps unusable sanitized output to CG-API-06', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onComplete('As an AI, I cannot do that.');
    await flushAsync();

    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-API-06');
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
  });

  it('splits multi-part replies on [NEXT] and flags split mode', async () => {
    build();
    await startAndReachStream({ params: { mode: 'preferSplit' } });
    gateway.cb?.onComplete('first bit[NEXT]second bit');
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.result.parts).toEqual(['first bit', 'second bit']);
    expect(complete?.result.splitModeRequested).toBe(true);
  });

  it('help-me XML parse failure falls back to raw instead of erroring', async () => {
    build();
    await startAndReachStream({ feature: 'help-me' });
    gateway.cb?.onComplete('no xml tags at all');
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete).toBeDefined();
    expect(complete?.result.rawText).toBe('no xml tags at all');
    expect(complete?.result['xml']).toMatchObject({ valid: false });
    expect(framesOfType(frames, 'operation:error')).toHaveLength(0);
  });

  it('help-me valid XML carries the parsed sections', async () => {
    build();
    await startAndReachStream({ feature: 'help-me' });
    gateway.cb?.onComplete(
      '<coaching>do this</coaching><engaging>hey</engaging><flirty>hi cutie</flirty>',
    );
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.result['xml']).toMatchObject({
      valid: true,
      coaching: 'do this',
      engaging: 'hey',
      flirty: 'hi cutie',
    });
  });

  it('gates on missing account mapping with CG-FLOW-02', async () => {
    build(makeSettingsVM({ accountMappings: {} }));
    coordinator.start(startRequest());
    await flushAsync();

    const errors = framesOfType(frames, 'operation:error');
    expect(errors[0]?.error.code).toBe('CG-FLOW-02');
    expect(gateway.calls).toHaveLength(0);
  });

  it('gates on an explicitly empty personality list with CG-FLOW-01', async () => {
    data.settings.set(PERSONALITIES_SETTINGS_KEY, []);
    build();
    coordinator.start(startRequest());
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')[0]?.error.code).toBe('CG-FLOW-01');
  });

  it('resolves the personality from the stored list', async () => {
    data.settings.set(PERSONALITIES_SETTINGS_KEY, [
      { id: 'p-custom', name: 'Custom', content: 'You are Custom.', updatedAt: 1 },
    ]);
    build(makeSettingsVM({ accountMappings: { [ACCT]: 'p-custom' } }));
    await startAndReachStream();
    const system = gateway.calls[0]?.systemBlocks.map((block) => block.text).join('');
    expect(system).toContain('You are Custom.');
  });

  it('gates on a missing provider key with CG-AUTH-01', async () => {
    build(makeSettingsVM(), {});
    coordinator.start(startRequest());
    await flushAsync();

    const errors = framesOfType(frames, 'operation:error');
    expect(errors[0]?.error.code).toBe('CG-AUTH-01');
    expect(gateway.calls).toHaveLength(0);
  });

  it('hub AI mode skips local provider-key gating and does not enqueue legacy usage reporting', async () => {
    build(makeSettingsVM({ aiGatewayTransport: 'hub' }), {});
    await startAndReachStream({ params: { forceRegenerate: true } });

    expect(gateway.calls[0]).toMatchObject({
      clientRequestId: 'op-1',
      accountId: ACCT,
      chatId: '4242',
      isRegeneration: true,
      transport: 'hub',
    });

    gateway.cb?.onUsage?.(USAGE);
    gateway.cb?.onComplete('hub answer');
    await flushAsync();

    const row = data.db
      .prepare('SELECT client_event_id FROM usage_events WHERE client_event_id = @id')
      .get({ id: 'op-1' });
    expect(row).toBeUndefined();
  });

  it('reports the spend summary computed from the streamed usage', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onUsage?.(USAGE);
    gateway.cb?.onComplete('sounds good');
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    const modelId = gateway.calls[0]?.modelId ?? '';
    const expected = buildLlmSpendSummary(modelId, USAGE);
    expect(complete?.llmSpend).toMatchObject({
      totalTokens: expected.totalTokens,
      inputTokens: 1200,
      cacheWriteTokens: 300,
      cacheReadTokens: 800,
      outputTokens: 90,
      totalUsd: expected.totalUsd,
      cacheEffectKind: expected.cacheEffectKind,
    });
  });

  it('writes a usage_events row keyed by operationId on completion', async () => {
    build();
    await startAndReachStream({ params: { forceRegenerate: true } });
    gateway.cb?.onUsage?.(USAGE);
    gateway.cb?.onComplete('done');
    await flushAsync();

    const row: unknown = data.db
      .prepare('SELECT client_event_id, payload FROM usage_events WHERE client_event_id = @id')
      .get({ id: 'op-1' });
    const parsed = z
      .object({ client_event_id: z.string(), payload: z.string() })
      .parse(row);
    const payload: unknown = JSON.parse(parsed.payload);
    expect(payload).toMatchObject({
      clientEventId: 'op-1',
      feature: 'fast-reply',
      inputTokens: 1200,
      outputTokens: 90,
      isRegeneration: true,
    });
    const modelSchema = z.object({ model: z.string().min(1), durationMs: z.number() });
    expect(modelSchema.safeParse(payload).success).toBe(true);
  });

  it('emits a debugPrompt frame with blocks + cache flags before the stream in debug mode', async () => {
    build(makeSettingsVM({ debugMode: true }));
    await startAndReachStream();
    gateway.cb?.onText('x');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    gateway.cb?.onComplete('x');
    await flushAsync();

    const debugFrames = framesOfType(frames, 'operation:debugPrompt');
    expect(debugFrames).toHaveLength(1);
    const types = frames.map((frame) => frame.type);
    expect(types.indexOf('operation:debugPrompt')).toBeLessThan(types.indexOf('operation:chunk'));

    const snapshot = z
      .object({
        modelId: z.string(),
        promptCachingEnabled: z.boolean(),
        transcript: z.object({
          messageCount: z.number(),
          charCount: z.number(),
          preview: z.string(),
        }),
        systemBlocks: z.array(z.object({ text: z.string(), cache: z.enum(['1h', '5m', 'none']) })),
        userBlocks: z.array(z.object({ text: z.string(), cache: z.enum(['1h', '5m', 'none']) })),
      })
      .parse(debugFrames[0]?.snapshot);
    expect(snapshot.transcript.messageCount).toBe(5);
    expect(snapshot.transcript.charCount).toBeGreaterThan(0);
    expect(snapshot.transcript.preview).toContain('message 5');
    expect(snapshot.userBlocks.some((block) => block.cache === '5m')).toBe(true);

    // debug mode also attaches profiling to the terminal frame
    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.profiling).toBeDefined();
    const stageKeys = complete?.profiling?.stages.map((stage) => stage.key) ?? [];
    expect(stageKeys).toContain('resolve-identity');
    expect(stageKeys).toContain('load-messages');
    expect(stageKeys).toContain('prompt-build');
    expect(stageKeys).toContain('llm-ttfb');
    expect(stageKeys).toContain('llm-stream');
  });

  it('does not retry on top of the provider retry layer (single stream call)', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onError?.(new CgError('CG-API-01', { retryAfterMs: 1000 }));
    await flushAsync();
    await vi.advanceTimersByTimeAsync(QUICK_OPERATION_TIMEOUT_MS * 2);

    expect(gateway.calls).toHaveLength(1);
    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-API-01');
    expect(errors[0]?.error.retryAfterMs).toBe(1000);
  });

  it('frees the conversation slot after completion', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onComplete('all good');
    await flushAsync();

    coordinator.start(startRequest({ operationId: 'op-2' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(2);
    expect(framesOfType(frames, 'operation:error')).toHaveLength(0);
  });

  it('applies the default tone from settings and the explicit tone override', async () => {
    build();
    await startAndReachStream();
    const userTextDefault = gateway.calls[0]?.userBlocks.map((block) => block.text).join('');
    expect(userTextDefault).toContain('Tone override: CASUAL');
    gateway.cb?.onComplete('ok');
    await flushAsync();

    coordinator.start(startRequest({ operationId: 'op-2', params: { tone: 'spicy' } }));
    await flushAsync();
    const userTextSpicy = gateway.calls[1]?.userBlocks.map((block) => block.text).join('');
    expect(userTextSpicy).toContain('Tone override: HORNY');
  });

  it('dispose discards everything in flight', async () => {
    build();
    await startAndReachStream();
    coordinator.dispose();

    const discarded = framesOfType(frames, 'operation:discarded');
    expect(discarded).toHaveLength(1);
    expect(gateway.cancelCount).toBe(1);
  });
});
