import { describe, expect, it } from 'vitest';
import { createHubClient } from '../src/hub/client';
import type { HubFetch, HubRequestInit, HubResponseLike } from '../src/hub/client';
import type { HubError } from '../src/hub/client';

function aiFrame(data: unknown): string {
  return `event: ai\ndata: ${JSON.stringify(data)}\n\n`;
}

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
