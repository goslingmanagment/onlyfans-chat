// P4 deep/gated feature behavior (SPEC §8.4/§8.5, research §1.3–1.5):
// fan-summary cache consultation + persistence + hub seam, chat-review
// XML-never-cached, ping segment gating, hi-greeting lock + bio + [VARIANT]
// variants, deep staged timeouts, and the deferred compare rejection.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS,
  DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS,
  DEEP_OPERATION_PREP_TIMEOUT_MS,
  DEFAULT_FAN_SUMMARY_MODEL_ID,
  STREAM_CHUNK_FLUSH_MS,
} from '@chatgoose/shared/constants';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import { z } from 'zod';
import { createAiCoordinator } from '@main/ai/index';
import type { AiCoordinator, SummaryHubHooks } from '@main/ai/index';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  CHAT,
  SEED_BASE_MS,
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Matches the default settings/bundled-personality identity resolved by the coordinator. */
function validSummaryEntry(overrides: Partial<SummaryCacheEntry> = {}): SummaryCacheEntry {
  return {
    body: 'cached: фан любит спортзал',
    personalityId: 'builtin:lora',
    personalityUpdatedAt: 0,
    generatedAt: SEED_BASE_MS,
    spendingVerified: true,
    subscriptionVerified: true,
    modelId: DEFAULT_FAN_SUMMARY_MODEL_ID,
    ...overrides,
  };
}

const usageRowSchema = z.object({ payload: z.string() });

function usagePayload(data: DataLayer, operationId: string): unknown {
  const row: unknown = data.db
    .prepare('SELECT payload FROM usage_events WHERE client_event_id = @id')
    .get({ id: operationId });
  return JSON.parse(usageRowSchema.parse(row).payload);
}

describe('AiCoordinator P4 features', () => {
  let data: DataLayer;
  let stub: StubClient;
  let gateway: StubGateway;
  let frames: OperationEvent[];
  let coordinator: AiCoordinator;

  function build(settings: SettingsVM = makeSettingsVM(), summaryHub?: SummaryHubHooks): void {
    coordinator = createAiCoordinator({
      data,
      client: stub.client,
      settingsStore: makeSettingsStore(settings),
      keychain: makeKeychain({ anthropicKey: 'sk-ant', openRouterKey: 'sk-or' }),
      gateway: gateway.gateway,
      ...(summaryHub !== undefined ? { summaryHub } : {}),
    });
    coordinator.subscribe((event) => frames.push(event));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    data = memoryDataLayer();
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

  function errorCodes(): string[] {
    return framesOfType(frames, 'operation:error').map((frame) => frame.error.code);
  }

  // ── min-30 deep gate (CG-FLOW-03) ─────────────────────────────────────────

  it.each(['fan-summary', 'chat-review'] as const)(
    '%s below the 30-message floor fails with CG-FLOW-03 before any LLM call',
    async (feature) => {
      seedMessages(data, 5);
      build();
      coordinator.start(startRequest({ feature }));
      await flushAsync();

      expect(errorCodes()).toEqual(['CG-FLOW-03']);
      expect(gateway.calls).toHaveLength(0);
    },
  );

  it('deep loading emits paged progress frames with the legacy message wording', async () => {
    seedMessages(data, 5);
    build();
    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();

    const paged = framesOfType(frames, 'operation:progress').filter(
      (frame) => frame.currentPage !== undefined,
    );
    // gap = 1500 - 5 cached → 15 estimated pages; the stub's empty page stops the scroll
    expect(paged[0]).toMatchObject({
      phase: 'loading-messages',
      currentPage: 1,
      targetPages: 15,
      message: 'Loading messages… 1/15 pages',
    });
  });

  // ── fan-summary generation + cache persistence ───────────────────────────

  async function startSummaryAndReachStream(
    overrides: Parameters<typeof startRequest>[0] = {},
  ): Promise<void> {
    coordinator.start(startRequest({ feature: 'fan-summary', ...overrides }));
    await flushAsync();
    expect(gateway.cb).not.toBeNull();
  }

  it('persists a verified summary to db.summaries and publishes the bus event', async () => {
    seedMessages(data, 40);
    build(makeSettingsVM({ deepMessageCount: 40 }));
    const scopes: string[] = [];
    data.bus.subscribe((events) => scopes.push(...events.map((event) => event.scope)));

    await startSummaryAndReachStream();
    gateway.cb?.onComplete('Фан любит спортзал и собак.');
    await flushAsync();
    data.bus.flushNow();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.feature).toBe('fan-summary');
    expect(complete?.result.rawText).toBe('Фан любит спортзал и собак.');
    expect(complete?.result['summaryMeta']).toMatchObject({ cached: false });

    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'Фан любит спортзал и собак.',
      personalityId: 'builtin:lora',
      personalityUpdatedAt: 0,
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: DEFAULT_FAN_SUMMARY_MODEL_ID,
    });
    expect(scopes).toContain('summaries');

    // P2 usage instrumentation continues unchanged for deep features
    expect(usagePayload(data, 'op-1')).toMatchObject({
      feature: 'fan-summary',
      model: DEFAULT_FAN_SUMMARY_MODEL_ID,
      isCacheHit: false,
      isRegeneration: false,
    });
  });

  it('does not cache a summary built on degraded (unverified) fan context', async () => {
    seedMessages(data, 40);
    stub.setUserError(new Error('ofapi down'));
    build(makeSettingsVM({ deepMessageCount: 40 }));

    await startSummaryAndReachStream();
    gateway.cb?.onComplete('сводка по деградированному контексту');
    await flushAsync();

    expect(framesOfType(frames, 'operation:complete')).toHaveLength(1);
    expect(data.summaries.get(ACCT, CHAT)).toBeNull();
  });

  // ── summary cache consultation ───────────────────────────────────────────

  it('serves a valid cached summary with zero LLM/OFAPI traffic (even below the deep floor)', async () => {
    seedMessages(data, 5); // cache check precedes the min-30 gate (legacy order)
    data.summaries.put(ACCT, CHAT, validSummaryEntry());
    build();

    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.result.rawText).toBe('cached: фан любит спортзал');
    expect(complete?.result['summaryMeta']).toMatchObject({
      cached: true,
      generatedAt: SEED_BASE_MS,
    });
    expect(gateway.calls).toHaveLength(0);
    expect(stub.listMessagesCalls).toHaveLength(0);
    expect(usagePayload(data, 'op-1')).toMatchObject({
      feature: 'fan-summary',
      isCacheHit: true,
      totalTokens: 0,
    });

    // the conversation slot is freed by the cache-hit settle
    coordinator.start(startRequest({ operationId: 'op-2', feature: 'fast-reply' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(1);
  });

  /** Legacy tolerance: an entry MISSING a verification flag is stale, not corrupt. */
  function entryWithoutSubscriptionFlag(): SummaryCacheEntry {
    const { subscriptionVerified: _dropped, ...rest } = validSummaryEntry();
    return rest;
  }

  it.each([
    ['edited personality', validSummaryEntry({ personalityUpdatedAt: 999 })],
    ['different model', validSummaryEntry({ modelId: 'anthropic:claude-sonnet-4-6' })],
    ['unverified spending', validSummaryEntry({ spendingVerified: false })],
    ['missing subscription flag', entryWithoutSubscriptionFlag()],
  ] as const)('a stale cache entry (%s) regenerates instead of serving', async (_label, entry) => {
    seedMessages(data, 40);
    data.summaries.put(ACCT, CHAT, entry);
    build(makeSettingsVM({ deepMessageCount: 40 }));

    await startSummaryAndReachStream();
    gateway.cb?.onComplete('свежая сводка');
    await flushAsync();

    expect(framesOfType(frames, 'operation:complete')[0]?.result.rawText).toBe('свежая сводка');
    expect(data.summaries.get(ACCT, CHAT)?.body).toBe('свежая сводка');
  });

  it('forceRegenerate deletes the cached entry first and bypasses the cache', async () => {
    seedMessages(data, 40);
    data.summaries.put(ACCT, CHAT, validSummaryEntry());
    build(makeSettingsVM({ deepMessageCount: 40 }));

    await startSummaryAndReachStream({ params: { forceRegenerate: true } });
    // refresh = delete + regenerate: the stale entry is gone while streaming
    expect(data.summaries.get(ACCT, CHAT)).toBeNull();

    gateway.cb?.onComplete('обновлённая сводка');
    await flushAsync();
    expect(data.summaries.get(ACCT, CHAT)?.body).toBe('обновлённая сводка');
    expect(usagePayload(data, 'op-1')).toMatchObject({ isRegeneration: true });
  });

  // ── hub seam (P4 wiring attaches here; no-ops today) ─────────────────────

  it('adopts a hub-prefetched profile as the cached summary with zero LLM calls', async () => {
    seedMessages(data, 40);
    const prefetchSummary = vi
      .fn<NonNullable<SummaryHubHooks['prefetchSummary']>>()
      .mockResolvedValue({ body: 'профиль из хаба', generatedAt: 4242 });
    build(makeSettingsVM({ deepMessageCount: 40 }), { prefetchSummary });

    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();

    expect(prefetchSummary).toHaveBeenCalledWith({ accountId: ACCT, fanId: CHAT });
    expect(framesOfType(frames, 'operation:complete')[0]?.result.rawText).toBe('профиль из хаба');
    expect(gateway.calls).toHaveLength(0);
    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'профиль из хаба',
      generatedAt: 4242,
      spendingVerified: true,
      subscriptionVerified: true,
    });
  });

  it('a rejecting prefetch hook degrades to generation; forceRegenerate skips it entirely', async () => {
    seedMessages(data, 40);
    const prefetchSummary = vi
      .fn<NonNullable<SummaryHubHooks['prefetchSummary']>>()
      .mockRejectedValue(new Error('hub down'));
    build(makeSettingsVM({ deepMessageCount: 40 }), { prefetchSummary });

    // non-forced path: the failed prefetch is best-effort — generation proceeds
    await startSummaryAndReachStream();
    expect(prefetchSummary).toHaveBeenCalledTimes(1);
    gateway.cb?.onComplete('сводка');
    await flushAsync();
    expect(framesOfType(frames, 'operation:error')).toHaveLength(0);

    // forced refresh never consults the hub
    await startSummaryAndReachStream({
      operationId: 'op-2',
      params: { forceRegenerate: true },
    });
    expect(prefetchSummary).toHaveBeenCalledTimes(1);
    expect(gateway.calls).toHaveLength(2);
  });

  it('pushes the generated summary through the fire-and-forget hub hook', async () => {
    seedMessages(data, 40);
    const pushSummary = vi
      .fn<NonNullable<SummaryHubHooks['pushSummary']>>()
      .mockResolvedValue(undefined);
    build(makeSettingsVM({ deepMessageCount: 40 }), { pushSummary });

    await startSummaryAndReachStream();
    gateway.cb?.onComplete('сводка для пуша');
    await flushAsync();

    expect(pushSummary).toHaveBeenCalledTimes(1);
    expect(pushSummary).toHaveBeenCalledWith({
      accountId: ACCT,
      fanId: CHAT,
      body: 'сводка для пуша',
      generatedAt: expect.any(Number) as number,
    });
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(1);
  });

  // ── chat-review ───────────────────────────────────────────────────────────

  it('chat-review parses the rating XML and is never cached', async () => {
    seedMessages(data, 40);
    build(makeSettingsVM({ deepMessageCount: 40 }));

    coordinator.start(startRequest({ feature: 'chat-review' }));
    await flushAsync();
    gateway.cb?.onComplete(
      '<rating>7</rating><evaluation>solid pacing</evaluation><recommendations>tease more</recommendations>',
    );
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.result['xml']).toMatchObject({
      valid: true,
      rating: 7,
      evaluation: 'solid pacing',
      recommendations: 'tease more',
    });
    expect(data.summaries.get(ACCT, CHAT)).toBeNull();

    // always fresh: the second run streams again instead of serving anything cached
    coordinator.start(startRequest({ operationId: 'op-2', feature: 'chat-review' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(2);
  });

  it('chat-review XML parse failure falls back to raw text like help-me', async () => {
    seedMessages(data, 40);
    build(makeSettingsVM({ deepMessageCount: 40 }));

    coordinator.start(startRequest({ feature: 'chat-review' }));
    await flushAsync();
    gateway.cb?.onComplete('rating 8 out of 10, надо чаще флиртовать');
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.result.rawText).toBe('rating 8 out of 10, надо чаще флиртовать');
    expect(complete?.result['xml']).toMatchObject({ valid: false });
    expect(framesOfType(frames, 'operation:error')).toHaveLength(0);
  });

  // ── ping ──────────────────────────────────────────────────────────────────

  it('ping is blocked with CG-FLOW-05 while the fan is active (≤5 days)', async () => {
    seedMessages(data, 7); // fan texts at ids 1/3/5/7
    vi.setSystemTime(SEED_BASE_MS + 1 * DAY_MS);
    build();

    coordinator.start(startRequest({ feature: 'ping' }));
    await flushAsync();

    expect(errorCodes()).toEqual(['CG-FLOW-05']);
    expect(gateway.calls).toHaveLength(0);
  });

  it('ping segment-a (history, silent >5 days) instructions reach the prompt', async () => {
    seedMessages(data, 7); // 4 fan texts ≥ PING_MIN_FAN_MESSAGES
    vi.setSystemTime(SEED_BASE_MS + 10 * DAY_MS);
    build();

    coordinator.start(startRequest({ feature: 'ping' }));
    await flushAsync();

    const userText = gateway.calls[0]?.userBlocks.map((block) => block.text).join('') ?? '';
    expect(userText).toContain('Segment A — Was active, went silent');
    expect(userText).not.toContain('Segment B — Never really chatted');
  });

  it('ping segment-b (thin history) instructions reach the prompt', async () => {
    seedMessages(data, 2); // a single fan text — below the 3-message floor
    vi.setSystemTime(SEED_BASE_MS + 10 * DAY_MS);
    build();

    coordinator.start(startRequest({ feature: 'ping' }));
    await flushAsync();

    const userText = gateway.calls[0]?.userBlocks.map((block) => block.text).join('') ?? '';
    expect(userText).toContain('Segment B — Never really chatted');
    expect(userText).not.toContain('Segment A — Was active, went silent');
  });

  // ── hi-greeting ───────────────────────────────────────────────────────────

  function seedFanRow(): void {
    data.fans.upsert({
      accountId: ACCT,
      fanId: CHAT,
      username: 'brad99',
      name: 'Brad',
      customName: null,
      avatar: null,
      about: null,
      lastSeen: null,
      spending: null,
      subscription: null,
      fetchedAt: '2026-06-10T00:00:00.000Z',
    });
  }

  it('hi-greeting is locked above 10 transcript messages (CG-FLOW-09)', async () => {
    seedMessages(data, 11);
    build();

    coordinator.start(startRequest({ feature: 'hi-greeting' }));
    await flushAsync();

    expect(errorCodes()).toEqual(['CG-FLOW-09']);
    expect(gateway.calls).toHaveLength(0);
  });

  it('hi-greeting fetches the fan bio by username and splits [VARIANT] parts', async () => {
    seedMessages(data, 4);
    seedFanRow();
    stub.setUserByUsername(sampleUser({ about: 'gym rat from Texas' }));
    build();

    coordinator.start(startRequest({ feature: 'hi-greeting' }));
    await flushAsync();

    expect(stub.getUserByUsernameCalls).toEqual(['brad99']);
    const userText = gateway.calls[0]?.userBlocks.map((block) => block.text).join('') ?? '';
    expect(userText).toContain('Fan bio: gym rat from Texas');

    gateway.cb?.onComplete('hey you[VARIANT]omg hi[VARIANT]well well well');
    await flushAsync();
    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.result.parts).toEqual(['hey you', 'omg hi', 'well well well']);
  });

  it('hi-greeting degrades gracefully when no fan/bio exists', async () => {
    seedMessages(data, 4);
    build();

    coordinator.start(startRequest({ feature: 'hi-greeting' }));
    await flushAsync();

    expect(stub.getUserByUsernameCalls).toEqual([]);
    const userText = gateway.calls[0]?.userBlocks.map((block) => block.text).join('') ?? '';
    expect(userText).not.toContain('Fan bio:');

    gateway.cb?.onComplete('hi[VARIANT]hey[VARIANT]yo');
    await flushAsync();
    expect(framesOfType(frames, 'operation:complete')[0]?.result.parts).toEqual([
      'hi',
      'hey',
      'yo',
    ]);
  });

  // ── deep staged timeouts (prep 180 s / TTFB 45 s / idle 45 s) ─────────────

  it('deep-prep timeout fires CG-NET-02 when context loading stalls', async () => {
    seedMessages(data, 5);
    stub.setMessagesHang();
    build();

    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(DEEP_OPERATION_PREP_TIMEOUT_MS);
    expect(errorCodes()).toEqual(['CG-NET-02']);
  });

  it('deep TTFB timeout fires CG-NET-02 when the provider stays silent', async () => {
    seedMessages(data, 40);
    build(makeSettingsVM({ deepMessageCount: 40 }));
    await startSummaryAndReachStream();

    await vi.advanceTimersByTimeAsync(DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS);
    expect(errorCodes()).toEqual(['CG-NET-02']);
    expect(gateway.cancelCount).toBe(1);
  });

  it('deep idle timeout resets on chunks and fires after a 45 s gap', async () => {
    seedMessages(data, 40);
    build(makeSettingsVM({ deepMessageCount: 40 }));
    await startSummaryAndReachStream();

    gateway.cb?.onText('первая часть');
    await vi.advanceTimersByTimeAsync(30_000);
    gateway.cb?.onText('ещё часть'); // resets llm-idle
    await vi.advanceTimersByTimeAsync(30_000);
    expect(errorCodes()).toEqual([]);

    await vi.advanceTimersByTimeAsync(DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS - 30_000);
    expect(errorCodes()).toEqual(['CG-NET-02']);
  });

  it('a completed deep stream beats the idle timer (no late CG-NET-02)', async () => {
    seedMessages(data, 40);
    build(makeSettingsVM({ deepMessageCount: 40 }));
    await startSummaryAndReachStream();

    gateway.cb?.onText('Фан ');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    gateway.cb?.onComplete('Фан любит спортзал.');
    await flushAsync();
    await vi.advanceTimersByTimeAsync(DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS * 2);

    expect(framesOfType(frames, 'operation:complete')).toHaveLength(1);
    expect(errorCodes()).toEqual([]);
  });
});
