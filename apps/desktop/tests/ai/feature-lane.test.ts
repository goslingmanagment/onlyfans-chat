// Stage 31 Task 1 — the kernel feature-service lane (transport 'feature').
// Contract: the coordinator sends REFS (no local context loads, no prompt
// assembly, no vendor-key checks), streams through the same lifecycle, and
// the gateway ledger is authoritative (no local usage_events row). The
// adapter maps the kernel's migrated product-gate 400s back to CG codes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STREAM_CHUNK_FLUSH_MS } from '@chatgoose/shared/constants';
import { HubError } from '@chatgoose/shared/hub/index';
import type { HubAiGatewayStreamCallbacks } from '@chatgoose/shared/hub/index';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import { createAiCoordinator } from '@main/ai/index';
import type { AiCoordinator } from '@main/ai/index';
import type {
  AiFeatureGateway,
  AiFeatureGatewayRequest,
  AiGatewayCallbacks,
} from '@main/ai/gateway';
import { createFeatureAiGateway } from '@main/hub/ai-feature-gateway';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  CHAT,
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

interface StubFeatureGateway {
  gateway: AiFeatureGateway;
  calls: AiFeatureGatewayRequest[];
  cb: AiGatewayCallbacks | null;
  cancelCount: number;
}

function makeStubFeatureGateway(): StubFeatureGateway {
  const state: StubFeatureGateway = {
    calls: [],
    cb: null,
    cancelCount: 0,
    gateway: {
      stream(req, cb) {
        state.calls.push(req);
        state.cb = cb;
        return () => {
          state.cancelCount += 1;
        };
      },
    },
  };
  return state;
}

describe('AI feature lane (Stage 31)', () => {
  let data: DataLayer;
  let stub: StubClient;
  let gateway: StubGateway;
  let featureGateway: StubFeatureGateway;
  let frames: OperationEvent[];
  let coordinator: AiCoordinator;

  function build(settings: SettingsVM = makeSettingsVM({ aiGatewayTransport: 'feature' })): void {
    coordinator = createAiCoordinator({
      data,
      client: stub.client,
      settingsStore: makeSettingsStore(settings),
      // No vendor keys on purpose: the feature lane must not need them.
      keychain: makeKeychain({}),
      gateway: gateway.gateway,
      featureGateway: featureGateway.gateway,
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
    featureGateway = makeStubFeatureGateway();
    frames = [];
  });

  afterEach(() => {
    coordinator.dispose();
    data.close();
    vi.useRealTimers();
  });

  it('sends refs only: no local context, no prompt, no vendor keys, right request', async () => {
    build();
    coordinator.start(startRequest({ params: { tone: 'flirty', mode: 'preferSplit' } }));
    await flushAsync();

    expect(featureGateway.calls).toHaveLength(1);
    expect(featureGateway.calls[0]).toEqual({
      feature: 'fast-reply',
      clientRequestId: 'op-1',
      accountId: ACCT,
      chatId: CHAT,
      tone: 'flirty',
      mode: 'preferSplit',
      draftText: undefined,
      personaKey: 'builtin:lora',
      isRegeneration: false,
    });
    // The direct/hub gateway and every local context source stay untouched.
    expect(gateway.calls).toHaveLength(0);
    expect(stub.listMessagesCalls).toHaveLength(0);
    expect(stub.getUsersByIdsCalls).toBe(0);
    expect(stub.listTransactionsCalls).toHaveLength(0);

    featureGateway.cb?.onText('kernel says hey');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    featureGateway.cb?.onComplete('kernel says hey');
    await flushAsync();

    const types = frames.map((frame) => frame.type);
    expect(types[types.length - 1]).toBe('operation:complete');
    // Single 'generating' progress phase — context loads happen kernel-side.
    const progress = framesOfType(frames, 'operation:progress');
    expect(progress.map((frame) => frame.phase)).toEqual(['generating']);

    // Gateway ledger is authoritative: no local usage_events row is written.
    const rows = data.db.prepare('SELECT COUNT(*) AS n FROM usage_events').get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it('keeps the client-side draft gate and default tone; custom personas fall back kernel-side', async () => {
    build(makeSettingsVM({
      aiGatewayTransport: 'feature',
      accountMappings: { [ACCT]: 'custom-1' },
    }));
    data.settings.set('personalities', [
      { id: 'custom-1', name: 'Custom', content: 'custom persona', updatedAt: 1 },
    ]);

    // improve-draft without a draft fails fast, before any kernel call.
    coordinator.start(startRequest({ operationId: 'op-d', feature: 'improve-draft' }));
    await flushAsync();
    expect(featureGateway.calls).toHaveLength(0);
    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-APP-01');

    frames = [];
    coordinator.start(startRequest({
      operationId: 'op-2',
      feature: 'improve-draft',
      params: { draftText: 'hey love' },
    }));
    await flushAsync();
    expect(featureGateway.calls).toHaveLength(1);
    const request = featureGateway.calls[0]!;
    expect(request.draftText).toBe('hey love');
    // improve-draft supports neither tone nor mode.
    expect(request.tone).toBeUndefined();
    expect(request.mode).toBeUndefined();
    // Local custom persona is not kernel-known yet (Task 3 syncs) → omitted.
    expect(request.personaKey).toBeUndefined();
  });

  it("emits 'shown' with the generation ref at first token (Stage 31 Task 2)", async () => {
    const acceptance: Array<Record<string, unknown>> = [];
    coordinator = createAiCoordinator({
      data,
      client: stub.client,
      settingsStore: makeSettingsStore(makeSettingsVM({ aiGatewayTransport: 'feature' })),
      keychain: makeKeychain({}),
      gateway: gateway.gateway,
      featureGateway: featureGateway.gateway,
      onAcceptanceEvent: (event) => acceptance.push(event as never),
    });
    coordinator.subscribe((event) => frames.push(event));
    coordinator.start(startRequest());
    await flushAsync();

    featureGateway.cb?.onGenerationRef?.('gen-abc');
    featureGateway.cb?.onText('hey');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    featureGateway.cb?.onComplete('hey');
    await flushAsync();

    expect(acceptance).toHaveLength(1);
    expect(acceptance[0]).toMatchObject({
      operationId: 'op-1',
      requestId: 'gen-abc',
      feature: 'fast-reply',
      action: 'shown',
      accountId: ACCT,
      conversationId: CHAT,
    });

    // The completed-op registry serves the acceptance IPC path after settle.
    const context = coordinator.getOperationContext('op-1');
    expect(context).toMatchObject({
      operationId: 'op-1',
      requestId: 'gen-abc',
      feature: 'fast-reply',
      accountId: ACCT,
      chatId: CHAT,
    });
    expect(context?.parts).toEqual(['hey']);
  });

  it('cancel reaches the feature stream', async () => {
    build();
    coordinator.start(startRequest());
    await flushAsync();
    expect(featureGateway.cb).not.toBeNull();

    coordinator.cancel('op-1');
    await flushAsync();
    expect(featureGateway.cancelCount).toBe(1);
  });

  it('errors with CG-HUB-02 when the lane is selected but not wired', async () => {
    coordinator = createAiCoordinator({
      data,
      client: stub.client,
      settingsStore: makeSettingsStore(makeSettingsVM({ aiGatewayTransport: 'feature' })),
      keychain: makeKeychain({}),
      gateway: gateway.gateway,
    });
    coordinator.subscribe((event) => frames.push(event));
    coordinator.start(startRequest());
    await flushAsync();
    const errors = framesOfType(frames, 'operation:error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-HUB-02');
  });
});

describe('feature gateway adapter (Stage 31)', () => {
  function run(
    streamAiFeature: (
      args: { feature: string; request: Record<string, unknown> },
      callbacks: HubAiGatewayStreamCallbacks,
    ) => Promise<string>,
    resolvePageLabel: (accountId: string) => Promise<string | null> = () => Promise.resolve('lora-of'),
  ) {
    const events: Array<{ kind: string; value?: unknown }> = [];
    const adapter = createFeatureAiGateway({
      client: { streamAiFeature: streamAiFeature as never },
      resolvePageLabel,
    });
    const cancel = adapter.stream(
      {
        feature: 'fast-reply',
        clientRequestId: 'op-9',
        accountId: ACCT,
        chatId: CHAT,
        tone: 'casual',
        mode: undefined,
        draftText: undefined,
        personaKey: 'builtin:lora',
        isRegeneration: true,
      },
      {
        onText: (text) => events.push({ kind: 'text', value: text }),
        onError: (error) => events.push({ kind: 'error', value: error }),
        onComplete: (rawText) => events.push({ kind: 'complete', value: rawText }),
      },
    );
    return { events, cancel };
  }

  it('builds the kernel request from refs (page label resolved)', async () => {
    const captured: Array<{ feature: string; request: Record<string, unknown> }> = [];
    const { events } = run((args, callbacks) => {
      captured.push(args);
      callbacks.onText('ok');
      return Promise.resolve('ok');
    });
    await flushAsync();

    expect(captured).toHaveLength(1);
    expect(captured[0]!.feature).toBe('fast-reply');
    expect(captured[0]!.request).toEqual({
      clientRequestId: 'op-9',
      pageLabel: 'lora-of',
      platform: 'onlyfans',
      conversationRef: CHAT,
      replyTone: 'casual',
      personaKey: 'builtin:lora',
      isRegeneration: true,
    });
    expect(events).toEqual([
      { kind: 'text', value: 'ok' },
      { kind: 'complete', value: 'ok' },
    ]);
  });

  it('maps the kernel product-gate messages back to the legacy CG codes', async () => {
    const cases: Array<[string, string]> = [
      ['fan-summary requires at least 30 messages in the conversation', 'CG-FLOW-03'],
      ['hi-greeting is only available for conversations with at most 10 messages', 'CG-FLOW-09'],
      ['ping is blocked while the conversation is active', 'CG-FLOW-05'],
      ['improve-draft requires draftText', 'CG-APP-01'],
      ['something else entirely', 'CG-HUB-02'],
    ];
    for (const [message, code] of cases) {
      const { events } = run(() =>
        Promise.reject(new HubError('http', { message })));
      await flushAsync();
      const error = events.find((event) => event.kind === 'error');
      expect((error?.value as { code: string }).code, message).toBe(code);
    }
  });

  it('errors when no page label maps to the account', async () => {
    const { events } = run(
      () => Promise.resolve('never'),
      () => Promise.resolve(null),
    );
    await flushAsync();
    const error = events.find((event) => event.kind === 'error');
    expect((error?.value as { code: string }).code).toBe('CG-HUB-02');
  });
});
