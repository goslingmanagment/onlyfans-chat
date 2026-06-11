// Send-path contract tests against the live-captured 2026-06-11 fixtures
// (SPEC §7): wire shapes, exactly-one-attempt on every failure mode, restricted
// words via the nested ONLYFANS_COM_ERROR wrapper, credit telemetry on writes.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createOfApiClient } from '@main/ofapi/client';
import type { OfApiClientOptions } from '@main/ofapi/client';
import { OfApiError } from '@main/ofapi/errors';
import { instantSleep, jsonResponse, loadFixture, stubFetch } from './helpers';

const ACCOUNT_ID = 'acct_01000000000000000000000000000000';
const CHAT_ID = '1000039';
const MESSAGE_ID = '9000000001';

const sendFixtureSchema = z.looseObject({ data: z.unknown() });

function makeClient(
  responses: Array<() => Response>,
  options: Partial<OfApiClientOptions> = {},
): { client: ReturnType<typeof createOfApiClient>; requests: ReturnType<typeof stubFetch>['requests'] } {
  const { fetchImpl, requests } = stubFetch(responses);
  const client = createOfApiClient({
    apiKey: 'test-key',
    fetchImpl,
    sleep: instantSleep,
    ...options,
  });
  return { client, requests };
}

describe('sendMessage (recorded fixture)', () => {
  it('POSTs JSON to …/chats/{chat_id}/messages and parses the created message byte-for-byte', async () => {
    const fixture = loadFixture('send-message-success.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const message = await client.sendMessage({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID, text: 'hey! just checking in 💬 (sample-marker-0001)' });

    const request = requests[0];
    expect(request?.method).toBe('POST');
    expect(new URL(request?.url ?? '').pathname).toBe(`/api/${ACCOUNT_ID}/chats/${CHAT_ID}/messages`);
    expect(request?.headers['authorization']).toBe('Bearer test-key');
    expect(request?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request?.body ?? '')).toEqual({
      text: 'hey! just checking in 💬 (sample-marker-0001)',
    });

    // Loose schemas pass every captured field through — the parsed message must
    // equal the fixture's data object exactly (incl. cancelSeconds, queueId).
    expect(message).toEqual(sendFixtureSchema.parse(fixture).data);
    expect(message.id).toBe(9000000001);
    expect(message.cancelSeconds).toBe(86399);
    expect(message.isNew).toBe(true);
    expect(message.isOpened).toBe(false);
  });

  it('includes only the provided optional fields in the JSON body', async () => {
    const fixture = loadFixture('send-message-success.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.sendMessage({ purpose: 'send',
      accountId: ACCOUNT_ID,
      chatId: CHAT_ID,
      text: 'ppv for you',
      replyToMessageId: 123,
      lockedText: true,
      price: 10,
      mediaFiles: ['ofapi_media_abc123', 456],
      previews: [0],
    });
    expect(JSON.parse(requests[0]?.body ?? '')).toEqual({
      text: 'ppv for you',
      replyToMessageId: 123,
      lockedText: true,
      price: 10,
      mediaFiles: ['ofapi_media_abc123', 456],
      previews: [0],
    });
  });

  it('records credit telemetry from the success _meta', async () => {
    const fixture = loadFixture('send-message-success.json');
    const { client } = makeClient([() => jsonResponse(fixture)]);
    await client.sendMessage({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID, text: 'hi' });
    expect(client.creditMeter.snapshot()).toMatchObject({ usedToday: 1, balance: 90000 });
  });

  it('restricted words (live 400 fixture) → CG-OF-05 with textHighLights, one attempt', async () => {
    const fixture = loadFixture('send-message-restricted-400.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture, { status: 400 })]);
    const failure = await client
      .sendMessage({ accountId: ACCOUNT_ID, chatId: CHAT_ID, text: 'haha no I do not even have a cashapp', purpose: 'send' })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(OfApiError);
    if (!(failure instanceof OfApiError)) throw new Error('expected OfApiError');
    expect(failure.code).toBe('CG-OF-05');
    // Live capture: entries are the FULL message text, no per-word markers.
    expect(failure.textHighLights).toEqual(['haha no I do not even have a cashapp']);
    expect(failure.textHighLight).toBe('haha no I do not even have a cashapp');
    expect(failure.upstreamStatus).toBe(400);
    expect(requests).toHaveLength(1);
  });

  it('timeout rejection → CG-NET-02 after exactly one fetch attempt', async () => {
    let calls = 0;
    const client = createOfApiClient({
      apiKey: 'k',
      fetchImpl: () => {
        calls += 1;
        const timeout = new Error('The operation was aborted due to timeout');
        timeout.name = 'TimeoutError';
        return Promise.reject(timeout);
      },
      sleep: instantSleep,
    });
    await expect(
      client.sendMessage({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID, text: 'hi' }),
    ).rejects.toMatchObject({ code: 'CG-NET-02' });
    expect(calls).toBe(1);
  });

  it('500 → exactly one attempt, no backoff sleep, CG-NET-01', async () => {
    const sleeps: number[] = [];
    const { client, requests } = makeClient(
      [() => jsonResponse({ message: 'Server Error' }, { status: 500 })],
      {
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      },
    );
    await expect(
      client.sendMessage({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID, text: 'hi' }),
    ).rejects.toMatchObject({ code: 'CG-NET-01' });
    expect(requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });
});

describe('deleteMessage (recorded fixture)', () => {
  it('DELETEs …/messages/{id} and unwraps {success:true}', async () => {
    const fixture = loadFixture('delete-message-success.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.deleteMessage({ purpose: 'send',
      accountId: ACCOUNT_ID,
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
    });
    expect(result).toEqual({ success: true });
    const request = requests[0];
    expect(request?.method).toBe('DELETE');
    expect(new URL(request?.url ?? '').pathname).toBe(
      `/api/${ACCOUNT_ID}/chats/${CHAT_ID}/messages/${MESSAGE_ID}`,
    );
    expect(request?.body).toBeUndefined();
    expect(client.creditMeter.snapshot()).toMatchObject({ usedToday: 1, balance: 90000 });
  });
});

describe('likeMessage / unlikeMessage (openapi.json shape)', () => {
  const likeBody = { data: { success: true, isLiked: true }, _meta: {} };
  const unlikeBody = { data: { success: true, isLiked: false }, _meta: {} };

  it('likeMessage POSTs …/like and parses {success,isLiked}', async () => {
    const { client, requests } = makeClient([() => jsonResponse(likeBody)]);
    const result = await client.likeMessage({ purpose: 'send',
      accountId: ACCOUNT_ID,
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
    });
    expect(result).toMatchObject({ success: true, isLiked: true });
    expect(requests[0]?.method).toBe('POST');
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/api/${ACCOUNT_ID}/chats/${CHAT_ID}/messages/${MESSAGE_ID}/like`,
    );
  });

  it('unlikeMessage DELETEs …/unlike (openapi-verified method)', async () => {
    const { client, requests } = makeClient([() => jsonResponse(unlikeBody)]);
    const result = await client.unlikeMessage({ purpose: 'send',
      accountId: ACCOUNT_ID,
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
    });
    expect(result).toMatchObject({ success: true, isLiked: false });
    expect(requests[0]?.method).toBe('DELETE');
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/api/${ACCOUNT_ID}/chats/${CHAT_ID}/messages/${MESSAGE_ID}/unlike`,
    );
  });
});

describe('startTyping / markChatRead', () => {
  const successBody = { data: { success: true }, _meta: { _credits: { used: 0, balance: 90000 } } };

  it('startTyping POSTs …/typing with no body and resolves void', async () => {
    const { client, requests } = makeClient([() => jsonResponse(successBody)]);
    await expect(
      client.startTyping({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID }),
    ).resolves.toBeUndefined();
    const request = requests[0];
    expect(request?.method).toBe('POST');
    expect(new URL(request?.url ?? '').pathname).toBe(`/api/${ACCOUNT_ID}/chats/${CHAT_ID}/typing`);
    expect(request?.body).toBeUndefined();
  });

  it('markChatRead POSTs …/mark-as-read and unwraps {success}', async () => {
    const { client, requests } = makeClient([
      () => jsonResponse({ data: { success: true }, _meta: {} }),
    ]);
    const result = await client.markChatRead({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID });
    expect(result).toEqual({ success: true });
    expect(requests[0]?.method).toBe('POST');
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/api/${ACCOUNT_ID}/chats/${CHAT_ID}/mark-as-read`,
    );
  });
});

describe('non-JSON error bodies (live: 405 returns an HTML page)', () => {
  it('maps an HTML 405 without crashing, one attempt', async () => {
    const { client, requests } = makeClient([
      () =>
        new Response('<html><body><h1>405 Method Not Allowed</h1></body></html>', {
          status: 405,
          headers: { 'content-type': 'text/html' },
        }),
    ]);
    await expect(
      client.sendMessage({ purpose: 'send', accountId: ACCOUNT_ID, chatId: CHAT_ID, text: 'hi' }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    expect(requests).toHaveLength(1);
  });
});
