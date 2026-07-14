import { describe, expect, it } from 'vitest';
import { createHubClient } from '../src/hub/client';
import type { HubFetch, HubRequestInit, HubResponseLike } from '../src/hub/client';
import type { HubError } from '../src/hub/client';

function aiFrame(data: unknown): string {
  return `event: ai\ndata: ${JSON.stringify(data)}\n\n`;
}

const TEST_PERSONA_DEFINITION_ID = 'v1:test-persona-definition:lora';

function streamResponse(body: string, status = 200): HubResponseLike {
  const bytes = new Uint8Array([...body].map((char) => char.charCodeAt(0)));
  let consumed = false;
  return {
    status,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: () => {
          if (consumed) {
            return Promise.resolve({ done: true });
          }
          consumed = true;
          return Promise.resolve({ done: false, value: bytes });
        },
        cancel: () => Promise.resolve(),
      }),
    },
    text: () => Promise.resolve(body),
  };
}

function makeRequest() {
  return {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    feature: 'fast-reply' as const,
    pageLabel: 'Lora',
    platform: 'onlyfans' as const,
    platformUserId: '4242',
    conversationId: '4242',
    model: 'anthropic:claude-sonnet-4-6',
    reasoningEffort: 'low' as const,
    isRegeneration: false,
    prompt: {
      systemBlocks: [{ text: 'system', cache: 'none' as const }],
      userBlocks: [{ text: 'user', cache: '5m' as const }],
    },
  };
}

describe('HubClient AI gateway stream', () => {
  it('posts the core gateway request and streams text/usage/done frames', async () => {
    const calls: Array<{ url: string; init: HubRequestInit }> = [];
    const fetchImpl: HubFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        streamResponse(
          aiFrame({
            type: 'meta',
            requestId: '22222222-2222-4222-8222-222222222222',
            clientRequestId: '11111111-1111-4111-8111-111111111111',
            feature: 'fast-reply',
            pageLabel: 'Lora',
            model: 'anthropic:claude-sonnet-4-6',
            provider: 'anthropic',
            providerResponseId: null,
            quota: { accepted: true, remainingRequestsToday: 199, remainingMicroUsdToday: 4_990_000 },
          }) +
            aiFrame({ type: 'content_delta', text: 'hi ' }) +
            aiFrame({
              type: 'usage',
              usage: {
                inputTokens: 10,
                outputTokens: 4,
                cacheWriteTokens: 2,
                cacheReadTokens: 3,
                costMicroUsd: 50,
                costApproximate: false,
              },
              providerResponseId: 'msg_1',
              cacheHit: true,
            }) +
            aiFrame({ type: 'reasoning_delta', text: 'thinking' }) +
            aiFrame({ type: 'content_delta', text: 'there' }) +
            aiFrame({ type: 'done', stopReason: 'end_turn' }),
        ),
      );
    };
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });
    const texts: string[] = [];
    const usages: unknown[] = [];
    const reasoning: string[] = [];
    const stops: Array<string | null> = [];

    const raw = await client.streamAiGateway(
      { request: makeRequest() },
      {
        onText: (text) => texts.push(text),
        onUsage: (usage) => usages.push(usage),
        onReasoningDelta: (text) => reasoning.push(text),
        onStopReason: (stop) => stops.push(stop),
      },
    );

    expect(raw).toBe('hi there');
    expect(texts).toEqual(['hi ', 'there']);
    expect(usages).toEqual([
      {
        input_tokens: 10,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 3,
        output_tokens: 4,
        // Stage 31: the gateway price is the only spend source post-cutover.
        cost_micro_usd: 50,
      },
    ]);
    expect(reasoning).toEqual(['thinking']);
    expect(stops).toEqual(['end_turn']);
    expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/ai/gateway/stream');
    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toMatchObject({
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      pageLabel: 'Lora',
      platformUserId: '4242',
    });
  });

  it('fails closed on malformed frames and missing done', async () => {
    const malformed = createHubClient({
      baseUrl: 'https://hub.example.com',
      apiKey: 'k',
      fetchImpl: () => Promise.resolve(streamResponse('event: ai\ndata: {"type":"wat"}\n\n')),
    });
    await expect(malformed.streamAiGateway({ request: makeRequest() }, { onText: () => {} })).rejects.toMatchObject({
      code: 'CG-HUB-02',
      reason: 'invalid-response',
    } satisfies Partial<HubError>);

    const noDone = createHubClient({
      baseUrl: 'https://hub.example.com',
      apiKey: 'k',
      fetchImpl: () => Promise.resolve(streamResponse(aiFrame({ type: 'content_delta', text: 'x' }))),
    });
    await expect(noDone.streamAiGateway({ request: makeRequest() }, { onText: () => {} })).rejects.toMatchObject({
      code: 'CG-HUB-02',
      reason: 'invalid-response',
    } satisfies Partial<HubError>);
  });
});

describe('HubClient AI feature stream', () => {
  function makeFeatureRequest() {
    return {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      pageLabel: 'Lora',
      platform: 'onlyfans' as const,
      conversationRef: '4242',
      personaKey: 'builtin:lora',
      expectedPersonaDefinitionId: TEST_PERSONA_DEFINITION_ID,
      isRegeneration: false,
    };
  }

  /** A pre-stream 400 has no SSE body — the SDK reads response.text() once
   * and never touches response.body, so a null body is enough here. */
  function jsonErrorResponse(status: number, payload: unknown): HubResponseLike {
    return {
      status,
      headers: { get: () => null },
      body: null,
      text: () => Promise.resolve(JSON.stringify(payload)),
    };
  }

  // C4: core's pre-stream gate rejection carries an actionable message
  // ({error:'bad_request', message:'<gate text>'}); toHubError's 'validation'
  // case used to drop it, so the dock only ever saw the generic CG-HUB-02
  // copy instead of e.g. "fan-summary requires at least 30 messages".
  it('surfaces the kernel gate message from a 400 JSON error as HubError bad-request', async () => {
    const client = createHubClient({
      baseUrl: 'https://hub.example.com',
      apiKey: 'k',
      fetchImpl: () =>
        Promise.resolve(
          jsonErrorResponse(400, {
            error: 'bad_request',
            message: 'fan-summary requires at least 30 messages in the conversation',
          }),
        ),
    });

    let caught: unknown;
    try {
      await client.streamAiFeature({ feature: 'fan-summary', request: makeFeatureRequest() }, { onText: () => {} });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const hubError = caught as HubError;
    expect(hubError.reason).toBe('bad-request');
    expect(hubError.message).toContain('fan-summary requires at least 30 messages in the conversation');
  });

  // #140: the prompt echo. The capability rides a HEADER — an old kernel ignores
  // it, so a kernel rollback after a desktop release cannot break generations.
  it('advertises the echo capability only when asked and surfaces the debug frame', async () => {
    const calls: Array<{ url: string; init: HubRequestInit }> = [];
    const debugFrame = {
      type: 'debug_input_v1',
      systemBlocks: [{ text: 'safety + persona', cache: '1h' }],
      userBlocks: [{ text: '## Fan Dossier\nred Ducati', cache: '5m' }],
      contextManifest: { fanProfile: { version: 2, ageDays: 1 }, source: 'union' },
    };
    const fetchImpl: HubFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        streamResponse(
          aiFrame({
            type: 'meta',
            requestId: '22222222-2222-4222-8222-222222222222',
            clientRequestId: '11111111-1111-4111-8111-111111111111',
            feature: 'fast-reply',
            pageLabel: 'Lora',
            model: 'anthropic:claude-sonnet-4-6',
            provider: 'anthropic',
            providerResponseId: null,
            personaDefinitionId: TEST_PERSONA_DEFINITION_ID,
            quota: { accepted: true, remainingRequestsToday: 10, remainingMicroUsdToday: 1_000 },
          }) +
            aiFrame(debugFrame) +
            aiFrame({ type: 'content_delta', text: 'hi' }) +
            aiFrame({ type: 'done', stopReason: 'end_turn' }),
        ),
      );
    };
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });

    const echoes: unknown[] = [];
    const metas: unknown[] = [];
    await client.streamAiFeature(
      { feature: 'fast-reply', request: makeFeatureRequest(), debugPromptEcho: true },
      {
        onText: () => {},
        onDebugInput: (input) => echoes.push(input),
        onMeta: (meta) => metas.push(meta),
      },
    );

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-kernel-ai-capabilities']).toBe('debug-input-v1');
    expect(echoes).toEqual([
      {
        systemBlocks: debugFrame.systemBlocks,
        userBlocks: debugFrame.userBlocks,
        contextManifest: debugFrame.contextManifest,
      },
    ]);
    expect(metas).toEqual([expect.objectContaining({
      personaDefinitionId: TEST_PERSONA_DEFINITION_ID,
    })]);
    expect(JSON.parse(calls[0]!.init.body ?? '{}')).toMatchObject({
      personaKey: 'builtin:lora',
      expectedPersonaDefinitionId: TEST_PERSONA_DEFINITION_ID,
    });

    const quiet: Array<{ url: string; init: HubRequestInit }> = [];
    const quietClient = createHubClient({
      baseUrl: 'https://hub.example.com',
      apiKey: 'k',
      fetchImpl: (url, init) => {
        quiet.push({ url, init });
        return Promise.resolve(
          streamResponse(
            aiFrame({ type: 'content_delta', text: 'hi' }) + aiFrame({ type: 'done', stopReason: 'end_turn' }),
          ),
        );
      },
    });
    await quietClient.streamAiFeature(
      { feature: 'fast-reply', request: makeFeatureRequest() },
      { onText: () => {} },
    );
    const quietHeaders = quiet[0]!.init.headers as Record<string, string>;
    expect(quietHeaders['x-kernel-ai-capabilities']).toBeUndefined();
  });
});
