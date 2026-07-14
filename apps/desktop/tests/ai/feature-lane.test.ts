// Stage 31 Task 1 — the kernel feature-service lane (transport 'feature').
// Contract: the coordinator sends REFS (no local context loads, no prompt
// assembly, no vendor-key checks), streams through the same lifecycle, and
// the gateway ledger is authoritative (no local usage_events row). The
// adapter maps the kernel's migrated product-gate 400s back to CG codes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STREAM_CHUNK_FLUSH_MS } from '@chatgoose/shared/constants';
import { toUserFacing } from '@chatgoose/shared/errors/index';
import { HubError, createHubClient } from '@chatgoose/shared/hub/index';
import type { HubAiGatewayStreamCallbacks, HubResponseLike } from '@chatgoose/shared/hub/index';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import {
  DEBUG_PROMPT_BLOCK_CHAR_BUDGET,
  DEBUG_PROMPT_MANIFEST_CHAR_BUDGET,
  boundDebugPromptInput,
  createAiCoordinator,
} from '@main/ai/index';
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
  seedActivePersonaCatalog,
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
    seedActivePersonaCatalog(data, settings);
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
      // #140: still refs only. The echo is a DEBUG-mode ask (default off), and
      // even when asked it rides a capability header — never the request body.
      debugPromptEcho: false,
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

  // #140: in debug mode the coordinator ASKS for the kernel's prompt echo and
  // republishes it as the debug snapshot the inspector has been missing since
  // the cutover. No echo (window shut) is reported, not silently swallowed.
  it('requests the prompt echo in debug mode and emits it — or says the window is shut', async () => {
    build(makeSettingsVM({ debugMode: true }));
    coordinator.start(startRequest());
    await flushAsync();

    expect(featureGateway.calls[0]).toMatchObject({ debugPromptEcho: true });

    featureGateway.cb?.onDebugInput?.({
      systemBlocks: [{ text: 'safety + persona', cache: '1h' }],
      userBlocks: [{ text: '## Fan Dossier\nred Ducati', cache: '5m' }],
      contextManifest: { fanProfile: { version: 2, ageDays: 1 } },
    });
    featureGateway.cb?.onText('hey');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    featureGateway.cb?.onComplete('hey');
    await flushAsync();

    const snapshots = framesOfType(frames, 'operation:debugPrompt');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      snapshot: {
        userBlocks: [{ text: '## Fan Dossier\nred Ducati', cache: '5m' }],
        contextManifest: { fanProfile: { version: 2, ageDays: 1 } },
      },
    });
  });

  it('reports an unanswered echo instead of leaving the inspector blank', async () => {
    build(makeSettingsVM({ debugMode: true }));
    coordinator.start(startRequest());
    await flushAsync();

    featureGateway.cb?.onText('hey');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    featureGateway.cb?.onComplete('hey');
    await flushAsync();

    const snapshots = framesOfType(frames, 'operation:debugPrompt');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ snapshot: { echo: 'unavailable' } });
  });

  it('reports an unanswered echo before a failed debug generation settles', async () => {
    build(makeSettingsVM({ debugMode: true }));
    coordinator.start(startRequest());
    await flushAsync();

    featureGateway.cb?.onError?.(new HubError('http', { message: 'kernel failed' }));
    await flushAsync();

    expect(frames.map((frame) => frame.type).slice(-2)).toEqual([
      'operation:debugPrompt',
      'operation:error',
    ]);
    expect(framesOfType(frames, 'operation:debugPrompt')[0]).toMatchObject({
      snapshot: { echo: 'unavailable' },
    });
  });

  it('bounds a valid multi-megabyte echo and records explicit truncation metadata', () => {
    const bounded = boundDebugPromptInput({
      systemBlocks: [{ text: 's'.repeat(DEBUG_PROMPT_BLOCK_CHAR_BUDGET + 50), cache: '1h' }],
      userBlocks: [{ text: 'never retained in full', cache: '5m' }],
      contextManifest: { giant: 'm'.repeat(DEBUG_PROMPT_MANIFEST_CHAR_BUDGET + 50) },
    });
    const systemBlocks = bounded['systemBlocks'] as Array<{ text: string }>;

    expect(systemBlocks[0]?.text.length).toBeLessThanOrEqual(DEBUG_PROMPT_BLOCK_CHAR_BUDGET);
    expect(bounded['userBlocks']).toEqual([]);
    expect(bounded['contextManifest']).toMatchObject({ desktopTruncated: true });
    expect(bounded['desktopTruncation']).toMatchObject({
      blockTextTruncated: true,
      manifestTruncated: true,
    });
  });

  it('carries the meta quota frame into the complete event (#120 pre-warn)', async () => {
    build();
    coordinator.start(startRequest({ operationId: 'op-q' }));
    await flushAsync();

    featureGateway.cb?.onQuotaRemaining?.(12);
    featureGateway.cb?.onText('hey');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    featureGateway.cb?.onComplete('hey');
    await flushAsync();

    const completes = framesOfType(frames, 'operation:complete');
    expect(completes).toHaveLength(1);
    expect(completes[0]?.quotaRemainingRequests).toBe(12);
  });

  it('omits quotaRemainingRequests when no meta quota arrived', async () => {
    build();
    coordinator.start(startRequest({ operationId: 'op-nq' }));
    await flushAsync();

    featureGateway.cb?.onText('hey');
    await vi.advanceTimersByTimeAsync(STREAM_CHUNK_FLUSH_MS);
    featureGateway.cb?.onComplete('hey');
    await flushAsync();

    const completes = framesOfType(frames, 'operation:complete');
    expect(completes).toHaveLength(1);
    expect(completes[0]?.quotaRemainingRequests).toBeUndefined();
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
    const settings = makeSettingsVM();
    seedActivePersonaCatalog(data, settings);
    coordinator = createAiCoordinator({
      data,
      settingsStore: makeSettingsStore(settings),
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
    const settings = makeSettingsVM();
    seedActivePersonaCatalog(data, settings);
    coordinator = createAiCoordinator({
      data,
      settingsStore: makeSettingsStore(settings),
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
    isPageLabelCurrent: (accountId: string, pageLabel: string) => boolean = () => true,
  ) {
    const events: Array<{ kind: string; value?: unknown }> = [];
    const adapter = createFeatureAiGateway({
      client: { streamAiFeature: streamAiFeature as never },
      resolvePageLabel,
      isPageLabelCurrent,
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

  it('does not start a kernel stream with a page label resolved before an override change', async () => {
    let release!: (label: string | null) => void;
    let destination = 'old-coordinate';
    const streamAiFeature = vi.fn(() => Promise.resolve('wrong-page result'));
    const { events } = run(
      streamAiFeature,
      () => new Promise<string | null>((resolve) => {
        release = resolve;
      }),
      (_accountId, pageLabel) => pageLabel === destination,
    );
    destination = 'new-coordinate';
    release('old-page');
    await flushAsync();

    expect(streamAiFeature).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect((events[0]?.value as { code: string }).code).toBe('CG-FLOW-02');
  });

  it('aborts and errors when the page route changes after the kernel stream starts', async () => {
    let callbacks!: HubAiGatewayStreamCallbacks;
    let finish!: (value: string) => void;
    let currentPage = 'page-a';
    const { events } = run(
      (_args, streamCallbacks) => {
        callbacks = streamCallbacks;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
      async () => 'page-a',
      (_accountId, pageLabel) => pageLabel === currentPage,
    );
    await flushAsync();
    callbacks.onText('valid prefix');
    currentPage = 'page-b';
    callbacks.onText('stale suffix');
    finish('stale completion');
    await flushAsync();

    expect(events.filter((event) => event.kind === 'complete')).toHaveLength(0);
    expect(events.filter((event) => event.kind === 'text')).toEqual([
      { kind: 'text', value: 'valid prefix' },
    ]);
    expect((events.find((event) => event.kind === 'error')?.value as { code: string }).code)
      .toBe('CG-FLOW-02');
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

  it('maps kernel gate codes structurally, independent of the message wording (#120)', async () => {
    const cases: Array<[string, string]> = [
      ['gate_min_messages', 'CG-FLOW-03'],
      ['gate_hi_greeting_limit', 'CG-FLOW-09'],
      ['gate_ping_active', 'CG-FLOW-05'],
      ['gate_draft_required', 'CG-APP-01'],
    ];
    for (const [kernelCode, code] of cases) {
      // Deliberately unmatchable message: only the structured code can map it.
      const { events } = run(() =>
        Promise.reject(new HubError('bad-request', { message: 'reworded upstream', detail: { kernelCode } })));
      await flushAsync();
      const error = events.find((event) => event.kind === 'error');
      expect((error?.value as { code: string }).code, kernelCode).toBe(code);
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
      isPageLabelCurrent: () => true,
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
      isPageLabelCurrent: () => true,
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

  // A6/A17 (W4.4): a deterministic kernel 400 ("Unknown persona: …") used to
  // flatten into the generic CG-HUB-02 registry text — toUserFacing now
  // carries the kernel's own words as detailText for the dock card.
  it('a deterministic kernel 400 keeps its own text as detailText on the card', async () => {
    const fetchImpl = (): Promise<HubResponseLike> =>
      Promise.resolve({
        status: 400,
        headers: { get: () => null },
        body: null,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: 'bad_request',
              message: 'Unknown persona: builtin:ghost',
              statusCode: 400,
            }),
          ),
      });
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });
    const adapter = createFeatureAiGateway({
      client,
      resolvePageLabel: () => Promise.resolve('lora-of'),
      isPageLabelCurrent: () => true,
    });
    const events: Array<{ kind: string; value?: unknown }> = [];
    adapter.stream(
      {
        feature: 'fast-reply',
        clientRequestId: '33333333-3333-4333-8333-333333333333',
        accountId: ACCT,
        chatId: CHAT,
        tone: 'casual',
        mode: undefined,
        draftText: undefined,
        personaKey: 'builtin:ghost',
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
    const facing = toUserFacing(error?.value);
    expect(facing.code).toBe('CG-HUB-02');
    expect(facing.detailText).toContain('Unknown persona: builtin:ghost');
  });

  // A6/A17 (W4.4): a generic kernel 429 (no quota_denied code) is throttling
  // — the card must not read like an outage.
  it('a real generic 429 gets retry-later wording, not the outage card', async () => {
    const fetchImpl = (): Promise<HubResponseLike> =>
      Promise.resolve({
        status: 429,
        headers: { get: () => null },
        body: null,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: 'rate_limit',
              message: 'Too many requests, slow down',
              statusCode: 429,
            }),
          ),
      });
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });
    const adapter = createFeatureAiGateway({
      client,
      resolvePageLabel: () => Promise.resolve('lora-of'),
      isPageLabelCurrent: () => true,
    });
    const events: Array<{ kind: string; value?: unknown }> = [];
    adapter.stream(
      {
        feature: 'fast-reply',
        clientRequestId: '44444444-4444-4444-8444-444444444444',
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
    const facing = toUserFacing(error?.value);
    expect(facing.code).toBe('CG-HUB-02');
    expect(facing.message).toContain('rate-limiting');
    expect(facing.recovery).toContain('not an outage');
  });
});
