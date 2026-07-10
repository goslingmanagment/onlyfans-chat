// Stage 31 Task 1 — the kernel feature-service lane (transport 'feature').
// Contract: the coordinator sends REFS (no local context loads, no prompt
// assembly, no vendor-key checks), streams through the same lifecycle, and
// the gateway ledger is authoritative (no local usage_events row). The
// adapter maps the kernel's migrated product-gate 400s back to CG codes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STREAM_CHUNK_FLUSH_MS } from '@chatgoose/shared/constants';
import { HubError, createHubClient } from '@chatgoose/shared/hub/index';
import type { HubAiGatewayStreamCallbacks, HubResponseLike } from '@chatgoose/shared/hub/index';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import { createAiCoordinator } from '@main/ai/index';
import type { AiCoordinator } from '@main/ai/index';

import { createFeatureAiGateway } from '@main/hub/ai-feature-gateway';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  CHAT,
  flushAsync,
  framesOfType,
  makeSettingsStore,
  makeSettingsVM,
  memoryDataLayer,
  startRequest,
  makeStubFeatureGateway,
} from './helpers';
import type { StubFeatureGateway } from './helpers';
import type { SettingsVM } from '../../src/preload/contract';

describe('AI feature lane (Stage 31)', () => {
  let data: DataLayer;
  let featureGateway: StubFeatureGateway;
  let frames: OperationEvent[];
  let coordinator: AiCoordinator;

  function build(settings: SettingsVM = makeSettingsVM()): void {
    coordinator = createAiCoordinator({
      data,
      settingsStore: makeSettingsStore(settings),
      featureGateway: featureGateway.gateway,
    });
    coordinator.subscribe((event) => frames.push(event));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    data = memoryDataLayer();
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

  it('keeps the client-side draft gate and default tone; custom personas ride their key', async () => {
    build(makeSettingsVM({
      accountMappings: { [ACCT]: 'custom-1' },
    }));

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
    // Custom personas are kernel-synced (Task 3) — the key rides the call.
    expect(request.personaKey).toBe('custom-1');
  });

  it("emits 'shown' with the generation ref at first token (Stage 31 Task 2)", async () => {
    const acceptance: Array<Record<string, unknown>> = [];
    coordinator = createAiCoordinator({
      data,
      settingsStore: makeSettingsStore(makeSettingsVM()),
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
      settingsStore: makeSettingsStore(makeSettingsVM()),
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
      // reason: 'bad-request' (not 'http') — this is the shape a real 400
      // gate rejection takes once it survives toHubError (see the wire-level
      // test below); a mismatched reason here would let this loop pass while
      // still exercising a shape the wire never produces.
      const { events } = run(() =>
        Promise.reject(new HubError('bad-request', { message })));
      await flushAsync();
      const error = events.find((event) => event.kind === 'error');
      expect((error?.value as { code: string }).code, message).toBe(code);
    }
  });

  // C4 regression guard: the case above rejects with an already-correct
  // HubError built by hand, so it can never catch toHubError dropping the
  // gate message — it only proves mapKernelGateError's own string matching.
  // This test drives the REAL wire path (createHubClient over a stubbed
  // 400 JSON response) so a regression in toHubError's 'validation' case
  // fails here even though the loop above stays green.
  it('a real 400 gate rejection survives toHubError to CG-FLOW-03 (not CG-HUB-02)', async () => {
    const fetchImpl = (): Promise<HubResponseLike> =>
      Promise.resolve({
        status: 400,
        headers: { get: () => null },
        body: null,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: 'bad_request',
              message: 'fan-summary requires at least 30 messages in the conversation',
            }),
          ),
      });
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });
    const adapter = createFeatureAiGateway({
      client,
      resolvePageLabel: () => Promise.resolve('lora-of'),
    });
    const events: Array<{ kind: string; value?: unknown }> = [];
    adapter.stream(
      {
        feature: 'fan-summary',
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        accountId: ACCT,
        chatId: CHAT,
        tone: undefined,
        mode: undefined,
        draftText: undefined,
        personaKey: 'builtin:lora',
        isRegeneration: false,
      },
      {
        onText: (text) => events.push({ kind: 'text', value: text }),
        onError: (error) => events.push({ kind: 'error', value: error }),
        onComplete: (rawText) => events.push({ kind: 'complete', value: rawText }),
      },
    );
    await flushAsync();

    const error = events.find((event) => event.kind === 'error');
    expect((error?.value as { code: string }).code).toBe('CG-FLOW-03');
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

  it('maps hub timeouts and connection drops to the CG-NET codes, not CG-HUB-02', async () => {
    const cases: Array<['timeout' | 'network', string]> = [
      ['timeout', 'CG-NET-02'],
      ['network', 'CG-NET-01'],
    ];
    for (const [reason, code] of cases) {
      const { events } = run(() => Promise.reject(new HubError(reason, { message: `hub ${reason}` })));
      await flushAsync();
      const error = events.find((event) => event.kind === 'error');
      expect((error?.value as { code: string }).code, reason).toBe(code);
    }
  });

  // Wire-level like the 400-gate test above: a real 429 quota_denied JSON
  // response must survive the vendored SDK (rate_limit category) and
  // toHubError ('quota' reason) all the way to CG-HUB-03 in the dock.
  it('a real 429 quota denial surfaces as CG-HUB-03 (not CG-HUB-02)', async () => {
    const fetchImpl = (): Promise<HubResponseLike> =>
      Promise.resolve({
        status: 429,
        headers: { get: () => null },
        body: null,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: 'quota_denied',
              message: 'ChatMuse AI gateway daily quota exceeded',
              statusCode: 429,
            }),
          ),
      });
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });
    const adapter = createFeatureAiGateway({
      client,
      resolvePageLabel: () => Promise.resolve('lora-of'),
    });
    const events: Array<{ kind: string; value?: unknown }> = [];
    adapter.stream(
      {
        feature: 'fast-reply',
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        accountId: ACCT,
        chatId: CHAT,
        tone: 'casual',
        mode: undefined,
        draftText: undefined,
        personaKey: 'builtin:lora',
        isRegeneration: false,
      },
      {
        onText: (text) => events.push({ kind: 'text', value: text }),
        onError: (error) => events.push({ kind: 'error', value: error }),
        onComplete: (rawText) => events.push({ kind: 'complete', value: rawText }),
      },
    );
    await flushAsync();

    const error = events.find((event) => event.kind === 'error');
    expect((error?.value as { code: string }).code).toBe('CG-HUB-03');
  });
});
