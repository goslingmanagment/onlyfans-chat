// AI operation coordinator lifecycle (SPEC §8.3), Stage 31 shape: the kernel
// feature-service lane is the only generation lane. The legacy behaviors
// these tests pin survive the cutover unchanged: synchronous conversation
// reservation, operationId correlation, 50 ms chunk batching, staged
// timeouts, sanitizer/XML result pipeline, CG-coded errors.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AGENCY_HUB_BASE_URL,
  QUICK_OPERATION_TIMEOUT_MS,
  STREAM_CHUNK_FLUSH_MS,
} from '@chatgoose/shared/constants';
import { CgError } from '@chatgoose/shared/errors/index';
import { parseOperationEvent } from '@chatgoose/shared/protocol/index';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import type { LlmUsageMetrics } from '@chatgoose/shared/usage-metrics';
import { createAiCoordinator } from '@main/ai/index';
import type { AiCoordinator, AiCoordinatorDeps } from '@main/ai/index';
import type { DataLayer } from '@main/db/index';
import { personaCatalogKey, storePersonaCatalog } from '@main/personas/catalog';
import {
  personaStorageScopeForHub,
  personaSummaryCacheIdentity,
  storePersonaAccountMapping,
} from '@main/personas/pending';
import {
  ACCT,
  CHAT,
  flushAsync,
  framesOfType,
  makeSettingsStore,
  makeSettingsVM,
  makeStubFeatureGateway,
  memoryDataLayer,
  seedActivePersonaCatalog,
  startRequest,
  testPersonaDefinitionId,
} from './helpers';
import type { StubFeatureGateway } from './helpers';
import type { SettingsVM } from '../../src/preload/contract';

const USAGE: LlmUsageMetrics = {
  input_tokens: 1200,
  cache_creation_input_tokens: 300,
  cache_read_input_tokens: 800,
  output_tokens: 90,
  cost_micro_usd: 12_345,
};

describe('AiCoordinator', () => {
  let data: DataLayer;
  let gateway: StubFeatureGateway;
  let frames: OperationEvent[];
  let coordinator: AiCoordinator;

  function build(
    settings: SettingsVM = makeSettingsVM(),
    overrides: Partial<AiCoordinatorDeps> = {},
  ): void {
    seedActivePersonaCatalog(data, settings);
    coordinator = createAiCoordinator({
      data,
      settingsStore: makeSettingsStore(settings),
      featureGateway: gateway.gateway,
      ...overrides,
    });
    coordinator.subscribe((event) => frames.push(event));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    data = memoryDataLayer();
    gateway = makeStubFeatureGateway();
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

  it('happy path: generating → chunk* → complete, all frames wire-valid', async () => {
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

    // Context loads happen kernel-side — a single 'generating' phase.
    const progress = framesOfType(frames, 'operation:progress');
    expect(progress.map((frame) => frame.phase)).toEqual(['generating']);

    const chunks = framesOfType(frames, 'operation:chunk');
    expect(chunks.map((frame) => frame.text).join('')).toBe('hey you');

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.operationId).toBe('op-1');
    expect(complete?.result.rawText).toBe('hey you');
    expect(complete?.result.parts).toEqual(['hey you']);
  });

  it('publishes authoritative completed parts before the renderer receives completion', async () => {
    const order: string[] = [];
    const onCompletedOperation = vi.fn(() => order.push('persisted'));
    build(makeSettingsVM(), { onCompletedOperation });
    coordinator.subscribe((event) => {
      if (event.type === 'operation:complete') {
        order.push('renderer');
      }
    });
    await startAndReachStream();

    gateway.cb?.onText('durable answer');
    gateway.cb?.onComplete('durable answer');
    await flushAsync();

    expect(onCompletedOperation).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'op-1',
      feature: 'fast-reply',
      accountId: ACCT,
      chatId: CHAT,
      parts: ['durable answer'],
    }));
    expect(order).toEqual(['persisted', 'renderer']);
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
    expect(gateway.calls).toHaveLength(0);
    // the conversation slot stays free — a real feature can start immediately
    coordinator.start(startRequest({ operationId: 'op-after' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(1);
  });

  it('keeps an operation alive across conversation open/close events', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onText('partial');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);

    coordinator.conversationOpened(ACCT, '9999');
    coordinator.conversationClosed(ACCT, CHAT);
    expect(framesOfType(frames, 'operation:discarded')).toHaveLength(0);
    expect(gateway.cancelCount).toBe(0);

    gateway.cb?.onComplete('partial and more');
    await flushAsync();
    const complete = framesOfType(frames, 'operation:complete');
    expect(complete).toHaveLength(1);
    expect(complete[0]?.result.rawText).toBe('partial and more');
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
  });

  it('maps unusable sanitized output to CG-API-06', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onComplete('As an AI, I cannot do that.');
    await flushAsync();

    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-API-06');
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

  it.each([
    ['missing catalog metadata', null],
    ['an archived catalog entry', 'archived'],
  ] as const)('gates on %s with CG-FLOW-02 before the gateway', async (_label, state) => {
    const settings = makeSettingsVM();
    build(settings);
    const scope = personaStorageScopeForHub(settings.hubBaseUrl!);
    if (state === null) {
      data.settings.remove(personaCatalogKey(scope));
    } else {
      storePersonaCatalog(data.settings, scope, [{
        key: 'builtin:lora',
        displayName: 'Lora',
        version: 1,
        status: state,
        definitionId: testPersonaDefinitionId('builtin:lora'),
      }]);
    }

    coordinator.start(startRequest());
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')[0]?.error.code).toBe('CG-FLOW-02');
    expect(gateway.calls).toHaveLength(0);
  });

  it('passes the mapped persona key on the feature request (custom personas kernel-synced)', async () => {
    build(makeSettingsVM({ accountMappings: { [ACCT]: 'p-custom' } }));
    await startAndReachStream();
    expect(gateway.calls[0]?.personaKey).toBe('p-custom');
  });

  it('invalidates a fan-summary cache entry when the server persona definition changes', async () => {
    const settings = makeSettingsVM();
    const prefetchSummary = vi.fn(async () => ({
      body: 'hub body with unknown persona provenance',
      generatedAt: 456,
    }));
    build(settings, { summaryHub: { prefetchSummary } });
    const scope = personaStorageScopeForHub(settings.hubBaseUrl!);
    data.summaries.put(ACCT, CHAT, {
      body: 'cached v1',
      personalityId: personaSummaryCacheIdentity(
        scope,
        'builtin:lora',
        testPersonaDefinitionId('builtin:lora'),
      ),
      personalityUpdatedAt: 1,
      generatedAt: 123,
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: 'kernel',
    });

    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(0);
    expect(framesOfType(frames, 'operation:complete')[0]?.result).toMatchObject({
      rawText: 'cached v1',
      summaryMeta: { cached: true },
    });

    storePersonaCatalog(data.settings, scope, [{
      key: 'builtin:lora',
      displayName: 'Lora',
      version: 2,
      status: 'active',
      definitionId: testPersonaDefinitionId('builtin:lora', 2),
    }]);
    coordinator.start(startRequest({ operationId: 'op-v2', feature: 'fan-summary' }));
    await flushAsync();
    expect(gateway.calls).toHaveLength(1);
    expect(prefetchSummary).not.toHaveBeenCalled();
    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'cached v1',
      personalityUpdatedAt: 1,
    });

    gateway.cb?.onComplete('generated v2');
    await flushAsync();
    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'generated v2',
      personalityUpdatedAt: 0,
    });
  });

  it('keeps in-flight work and summary cache valid across numeric version restore', async () => {
    const settings = makeSettingsVM();
    const scope = personaStorageScopeForHub(settings.hubBaseUrl!);
    const definitionId = testPersonaDefinitionId('builtin:lora');
    build(settings);

    await startAndReachStream({ feature: 'fan-summary' });
    storePersonaCatalog(data.settings, scope, [{
      key: 'builtin:lora',
      displayName: 'Lora restored',
      version: 2,
      status: 'active',
      definitionId,
    }]);
    gateway.cb?.onComplete('same exact definition');
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')).toHaveLength(0);
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(1);
    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'same exact definition',
      personalityUpdatedAt: 0,
    });

    storePersonaCatalog(data.settings, scope, [{
      key: 'builtin:lora',
      displayName: 'Lora restored again',
      version: 1,
      status: 'active',
      definitionId,
    }]);
    coordinator.start(startRequest({ operationId: 'op-restored-cache', feature: 'fan-summary' }));
    await flushAsync();

    expect(gateway.calls).toHaveLength(1);
    expect(framesOfType(frames, 'operation:complete').at(-1)?.result).toMatchObject({
      rawText: 'same exact definition',
      summaryMeta: { cached: true },
    });
  });

  it('does not reuse a same-key/version fan-summary from another Hub origin', async () => {
    const settingsA = makeSettingsVM({ hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL });
    const settingsB = makeSettingsVM({ hubBaseUrl: 'http://localhost:3100' });
    const scopeA = personaStorageScopeForHub(settingsA.hubBaseUrl!);
    const scopeB = personaStorageScopeForHub(settingsB.hubBaseUrl!);
    data.summaries.put(ACCT, CHAT, {
      body: 'Hub A summary',
      personalityId: personaSummaryCacheIdentity(
        scopeA,
        'builtin:lora',
        testPersonaDefinitionId('builtin:lora'),
      ),
      personalityUpdatedAt: 1,
      generatedAt: 123,
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: 'kernel',
    });
    build(settingsB);

    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();

    expect(gateway.calls).toHaveLength(1);
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
    gateway.cb?.onComplete('Hub B summary');
    await flushAsync();
    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'Hub B summary',
      personalityId: personaSummaryCacheIdentity(
        scopeB,
        'builtin:lora',
        testPersonaDefinitionId('builtin:lora'),
      ),
      personalityUpdatedAt: 0,
    });
  });

  it('preserves the last valid summary when a forced refresh fails', async () => {
    const settings = makeSettingsVM();
    const scope = personaStorageScopeForHub(settings.hubBaseUrl!);
    data.summaries.put(ACCT, CHAT, {
      body: 'last good summary',
      personalityId: personaSummaryCacheIdentity(
        scope,
        'builtin:lora',
        testPersonaDefinitionId('builtin:lora'),
      ),
      personalityUpdatedAt: 1,
      generatedAt: 123,
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: 'kernel',
    });
    build(settings);

    await startAndReachStream({
      feature: 'fan-summary',
      params: { forceRegenerate: true },
    });
    expect(data.summaries.get(ACCT, CHAT)?.body).toBe('last good summary');
    gateway.cb?.onError?.(new CgError('CG-HUB-07'));
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')).toHaveLength(1);
    expect(data.summaries.get(ACCT, CHAT)).toMatchObject({
      body: 'last good summary',
      personalityId: personaSummaryCacheIdentity(
        scope,
        'builtin:lora',
        testPersonaDefinitionId('builtin:lora'),
      ),
      personalityUpdatedAt: 1,
    });
  });

  it('rejects a stale summary completion after a mid-stream persona remap', async () => {
    const settings = makeSettingsVM({ accountMappings: { [ACCT]: 'persona-p' } });
    const scope = personaStorageScopeForHub(settings.hubBaseUrl!);
    const pushSummary = vi.fn(async () => undefined);
    build(settings, { summaryHub: { pushSummary } });
    storePersonaCatalog(data.settings, scope, [
      {
        key: 'persona-p',
        displayName: 'P',
        version: 1,
        status: 'active',
        definitionId: testPersonaDefinitionId('persona-p'),
      },
      {
        key: 'persona-q',
        displayName: 'Q',
        version: 1,
        status: 'active',
        definitionId: testPersonaDefinitionId('persona-q'),
      },
    ]);
    data.summaries.put(ACCT, CHAT, {
      body: 'valid Q summary',
      personalityId: personaSummaryCacheIdentity(
        scope,
        'persona-q',
        testPersonaDefinitionId('persona-q'),
      ),
      personalityUpdatedAt: 1,
      generatedAt: 123,
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: 'kernel',
    });

    await startAndReachStream({ feature: 'fan-summary' });
    expect(gateway.calls[0]?.personaKey).toBe('persona-p');
    storePersonaAccountMapping(data.settings, scope, ACCT, 'persona-q');
    gateway.cb?.onComplete('stale P summary');
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')[0]?.error.code).toBe('CG-FLOW-02');
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
    expect(data.summaries.get(ACCT, CHAT)?.body).toBe('valid Q summary');
    expect(pushSummary).not.toHaveBeenCalled();
  });

  it('stops a reply stream when its persona mapping changes', async () => {
    const settings = makeSettingsVM({ accountMappings: { [ACCT]: 'persona-p' } });
    const scope = personaStorageScopeForHub(settings.hubBaseUrl!);
    build(settings);
    storePersonaCatalog(data.settings, scope, [
      {
        key: 'persona-p',
        displayName: 'P',
        version: 1,
        status: 'active',
        definitionId: testPersonaDefinitionId('persona-p'),
      },
      {
        key: 'persona-q',
        displayName: 'Q',
        version: 1,
        status: 'active',
        definitionId: testPersonaDefinitionId('persona-q'),
      },
    ]);

    await startAndReachStream();
    storePersonaAccountMapping(data.settings, scope, ACCT, 'persona-q');
    gateway.cb?.onText('stale P reply');
    gateway.cb?.onComplete('stale P reply');
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')[0]?.error.code).toBe('CG-FLOW-02');
    expect(framesOfType(frames, 'operation:chunk')).toHaveLength(0);
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
  });

  it('stops a reply stream when the persisted Hub origin changes', async () => {
    const settings = makeSettingsVM({ hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL });
    build(settings);

    await startAndReachStream();
    data.settings.set('hubBaseUrl', 'http://localhost:3100');
    gateway.cb?.onComplete('stale Hub A reply');
    await flushAsync();

    expect(framesOfType(frames, 'operation:error')[0]?.error.code).toBe('CG-FLOW-02');
    expect(framesOfType(frames, 'operation:complete')).toHaveLength(0);
  });

  it('does not adopt an unproven Hub profile when no local fan-summary exists', async () => {
    const prefetchSummary = vi.fn(async () => ({
      body: 'remote body with no persona revision',
      generatedAt: 456,
    }));
    build(makeSettingsVM(), { summaryHub: { prefetchSummary } });

    coordinator.start(startRequest({ feature: 'fan-summary' }));
    await flushAsync();

    expect(prefetchSummary).not.toHaveBeenCalled();
    expect(gateway.calls).toHaveLength(1);
    expect(data.summaries.get(ACCT, CHAT)).toBeNull();
  });

  it('reports the gateway-priced spend and records the local spend log', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onUsage?.(USAGE);
    gateway.cb?.onComplete('sounds good');
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.llmSpend).toMatchObject({
      totalTokens: 1200 + 300 + 800 + 90,
      inputTokens: 1200,
      cacheWriteTokens: 300,
      cacheReadTokens: 800,
      outputTokens: 90,
      totalUsd: 0.012345,
      approximate: true,
    });

    // The gateway ledger is authoritative: no local usage_events row, but the
    // Activity panel's spend log records the gateway-reported cost.
    const row = data.db
      .prepare('SELECT client_event_id FROM usage_events WHERE client_event_id = @id')
      .get({ id: 'op-1' });
    expect(row).toBeUndefined();
    const spendRow = data.db
      .prepare('SELECT cost_microusd AS cost FROM ai_spend_log').get() as { cost: number };
    expect(spendRow.cost).toBe(12_345);
  });

  it('omits spend entirely when the gateway reported no cost', async () => {
    build();
    await startAndReachStream();
    const { cost_micro_usd: _omitted, ...noCost } = USAGE;
    gateway.cb?.onUsage?.(noCost);
    gateway.cb?.onComplete('ok');
    await flushAsync();

    const complete = framesOfType(frames, 'operation:complete')[0];
    expect(complete?.llmSpend).toBeUndefined();
  });

  it('does not retry on top of the kernel lane (single stream call)', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onError?.(new CgError('CG-HUB-06', { retryAfterMs: 1000 }));
    await flushAsync();
    await vi.advanceTimersByTimeAsync(QUICK_OPERATION_TIMEOUT_MS * 2);

    expect(gateway.calls).toHaveLength(1);
    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-HUB-06');
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
    expect(gateway.calls[0]?.tone).toBe('casual');
    gateway.cb?.onComplete('ok');
    await flushAsync();

    coordinator.start(startRequest({ operationId: 'op-2', params: { tone: 'spicy' } }));
    await flushAsync();
    expect(gateway.calls[1]?.tone).toBe('spicy');
  });

  it('dispose discards everything in flight', async () => {
    build();
    await startAndReachStream();
    coordinator.dispose();

    const discarded = framesOfType(frames, 'operation:discarded');
    expect(discarded).toHaveLength(1);
    expect(gateway.cancelCount).toBe(1);
  });

  // C5: markOperationAccepted is the kernel-lane dedup for the ai_spend_log
  // inserted counter — kernel ops write no usage_events row, whose `accepted`
  // flag used to carry this.
  it('markOperationAccepted counts once per completed op, best-effort for evicted ops', async () => {
    build();
    await startAndReachStream();
    gateway.cb?.onComplete('hey you');
    await flushAsync();
    expect(coordinator.getOperationContext('op-1')).not.toBeNull();

    expect(coordinator.markOperationAccepted('op-1')).toBe(true);
    expect(coordinator.markOperationAccepted('op-1')).toBe(false);

    // Absent from the registry (cap-50 eviction / never completed): nothing
    // to dedup against — every call counts; the documented best-effort limit.
    expect(coordinator.markOperationAccepted('op-never')).toBe(true);
    expect(coordinator.markOperationAccepted('op-never')).toBe(true);
  });
});
