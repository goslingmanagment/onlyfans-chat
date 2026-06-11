// Contract tests for the OFAPI client against recorded (sanitized) live fixtures
// (SPEC §5, §14): per-operation envelope unwrap, explicit skip_users, error
// mapping through the request path, credit telemetry wiring, and the SPEC §7
// guard that write methods are never auto-retried (send paths live in send.test.ts).

import { describe, expect, it } from 'vitest';
import { createOfApiClient } from '@main/ofapi/client';
import type { OfApiClientOptions } from '@main/ofapi/client';
import { OfApiError } from '@main/ofapi/errors';
import type { CreditMeterSnapshot } from '@main/ofapi/credit-meter';
import { instantSleep, jsonResponse, loadFixture, stubFetch } from './helpers';

const ACCOUNT_ID = 'acct_01000000000000000000000000000000';

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

describe('listChats (recorded fixture)', () => {
  it('unwraps the {data,_meta,_pagination} envelope', async () => {
    const fixture = loadFixture('list-chats.json');
    const { client } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listChats({ accountId: ACCOUNT_ID });
    expect(result.chats).toHaveLength(10);
    expect(result.nextPageUrl).toContain('/chats?limit=50&order=recent&offset=10');
    const first = result.chats[0];
    expect(first?.unreadMessagesCount).toBe(1);
    expect(first?.hasUnreadTips).toBe(false);
    expect(first?.canSendMessage).toBe(true);
    expect(first?.lastMessage?.id).toBeTypeOf('number');
    expect(first?.fan?.id).toBeTypeOf('number');
    expect(first?.fan?.subscribedOnData?.totalSumm).toBe(0);
  });

  it('always passes skip_users explicitly plus order/limit defaults', async () => {
    const fixture = loadFixture('list-chats.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listChats({ accountId: ACCOUNT_ID });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/chats`);
    expect(url.searchParams.get('skip_users')).toBe('none');
    expect(url.searchParams.get('order')).toBe('recent');
    expect(url.searchParams.get('limit')).toBe('50');
  });

  it('passes filter/query/offset and authorization header', async () => {
    const fixture = loadFixture('list-chats.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listChats({
      accountId: ACCOUNT_ID,
      filter: 'with_tips',
      query: 'sam',
      offset: 20,
      order: 'old',
      skipUsers: 'all',
    });
    const request = requests[0];
    const url = new URL(request?.url ?? '');
    expect(url.searchParams.get('filter')).toBe('with_tips');
    expect(url.searchParams.get('query')).toBe('sam');
    expect(url.searchParams.get('offset')).toBe('20');
    expect(url.searchParams.get('order')).toBe('old');
    expect(url.searchParams.get('skip_users')).toBe('all');
    expect(request?.headers['authorization']).toBe('Bearer test-key');
    expect(request?.method).toBe('GET');
  });
});

describe('listMessages (recorded fixture)', () => {
  it('unwraps messages and the backward first_id cursor', async () => {
    const fixture = loadFixture('list-messages.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listMessages({ accountId: ACCOUNT_ID, chatId: '1000039' });
    expect(result.messages).toHaveLength(12);
    expect(result.nextPageUrl).toContain('first_id=');
    const first = result.messages[0];
    expect(first?.isSentByMe).toBe(true);
    expect(first?.text).toContain('<p>');
    expect(first?.media).toEqual([]);
    const withMedia = result.messages[11];
    expect(withMedia?.mediaCount).toBe(5);
    expect(withMedia?.media?.[0]?.type).toBe('photo');
    const url = new URL(requests[0]?.url ?? '');
    expect(url.searchParams.get('skip_users')).toBe('all');
    expect(url.searchParams.get('order')).toBe('desc');
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('lastId implies order=asc; explicit mismatches throw', async () => {
    const fixture = loadFixture('list-messages.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listMessages({ accountId: ACCOUNT_ID, chatId: '1000039', lastId: '1000037' });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.searchParams.get('last_id')).toBe('1000037');
    expect(url.searchParams.get('order')).toBe('asc');

    await expect(
      client.listMessages({ accountId: ACCOUNT_ID, chatId: '1', firstId: '2', lastId: '3' }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    await expect(
      client.listMessages({ accountId: ACCOUNT_ID, chatId: '1', firstId: '2', order: 'asc' }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    await expect(
      client.listMessages({ accountId: ACCOUNT_ID, chatId: '1', lastId: '2', order: 'desc' }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    expect(requests).toHaveLength(1);
  });
});

describe('getUserByUsername (recorded fixture)', () => {
  it('unwraps an envelope without _pagination', async () => {
    const fixture = loadFixture('user-details.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const user = await client.getUserByUsername({ accountId: ACCOUNT_ID, username: 'fan032' });
    expect(user.id).toBeTypeOf('number');
    expect(user.username).toBe('fan032');
    expect(user.lastSeen).toBe('2026-06-10T14:31:13+00:00');
    expect(user.subscribedOnData?.hasActivePaidSubscriptions).toBe(false);
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(`/api/${ACCOUNT_ID}/users/fan032`);
  });
});

describe('team-level bare shapes (envelope is NOT universal)', () => {
  it('listAccounts parses a bare top-level array', async () => {
    const { client, requests } = makeClient([
      () =>
        jsonResponse([
          {
            id: 'acct_99000000000000000000000000000000',
            is_authenticated: true,
            authentication_progress: 'signed_in',
            display_name: 'Model A',
            onlyfans_username: 'modela',
          },
        ]),
    ]);
    const accounts = await client.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.id).toBe('acct_99000000000000000000000000000000');
    expect(accounts[0]?.is_authenticated).toBe(true);
    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/accounts');
  });

  it('whoami parses a bare object', async () => {
    const { client } = makeClient([
      () => jsonResponse({ api_key: { name: 'Onboarding' }, team: { slug: 'team-1' } }),
    ]);
    const whoami = await client.whoami();
    expect(whoami.api_key?.name).toBe('Onboarding');
    expect(whoami.team?.slug).toBe('team-1');
  });

  it('rejects a shape drift (enveloped accounts) with CG-APP-01', async () => {
    const { client } = makeClient([() => jsonResponse({ data: [] })]);
    await expect(client.listAccounts()).rejects.toMatchObject({ code: 'CG-APP-01' });
  });
});

describe('getUsersByIds', () => {
  it('mass-lists ≤10 ids as a comma param and parses the id-keyed record', async () => {
    const { client, requests } = makeClient([
      () =>
        jsonResponse({
          data: { '11': { id: 11, username: 'fan011' }, '12': { id: 12, username: 'fan012' } },
          _meta: {},
        }),
    ]);
    const users = await client.getUsersByIds({ accountId: ACCOUNT_ID, ids: [11, 12] });
    expect(users['11']?.username).toBe('fan011');
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/users/list`);
    expect(url.searchParams.get('ids')).toBe('11,12');
  });

  it('throws before fetching on >10 ids or empty ids', async () => {
    const { client, requests } = makeClient([() => jsonResponse({ data: {} })]);
    await expect(
      client.getUsersByIds({ accountId: ACCOUNT_ID, ids: Array.from({ length: 11 }, (_, i) => i) }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    await expect(client.getUsersByIds({ accountId: ACCOUNT_ID, ids: [] })).rejects.toMatchObject({
      code: 'CG-APP-01',
    });
    expect(requests).toHaveLength(0);
  });
});

describe('listTransactions', () => {
  it('unwraps the {list,hasMore,nextMarker} data object and passes marker params', async () => {
    const { client, requests } = makeClient([
      () =>
        jsonResponse({
          data: {
            list: [{ id: 'tx1', amount: 19.99, type: 'message', user: { id: 11 } }],
            hasMore: true,
            marker: 1739156703,
            nextMarker: 1739155047,
          },
          _meta: {},
          _pagination: { next_page: 'https://app.onlyfansapi.com/api/x/transactions?marker=1739155047' },
        }),
    ]);
    const result = await client.listTransactions({
      accountId: ACCOUNT_ID,
      type: 'tips',
      marker: 1739156703,
      startDate: '-30days',
    });
    expect(result.transactions[0]?.amount).toBe(19.99);
    expect(result.hasMore).toBe(true);
    expect(result.nextMarker).toBe(1739155047);
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/transactions`);
    expect(url.searchParams.get('type')).toBe('tips');
    expect(url.searchParams.get('marker')).toBe('1739156703');
    expect(url.searchParams.get('startDate')).toBe('-30days');
  });
});

describe('listFansAll / listFansActive', () => {
  const fansBody = { data: { list: [{ id: 21, username: 'fan021' }], hasMore: false }, _meta: {} };

  it('hits the right endpoints and unwraps {list,hasMore}', async () => {
    const { client, requests } = makeClient([() => jsonResponse(fansBody)]);
    const all = await client.listFansAll({ accountId: ACCOUNT_ID, limit: 20 });
    expect(all.fans[0]?.id).toBe(21);
    expect(all.hasMore).toBe(false);
    const active = await client.listFansActive({ accountId: ACCOUNT_ID });
    expect(active.fans).toHaveLength(1);
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(`/api/${ACCOUNT_ID}/fans/all`);
    expect(new URL(requests[1]?.url ?? '').pathname).toBe(`/api/${ACCOUNT_ID}/fans/active`);
  });

  it('rejects limit > 20 (upstream max) before fetching', async () => {
    const { client, requests } = makeClient([() => jsonResponse(fansBody)]);
    await expect(client.listFansAll({ accountId: ACCOUNT_ID, limit: 21 })).rejects.toMatchObject({
      code: 'CG-APP-01',
    });
    expect(requests).toHaveLength(0);
  });
});

describe('credit telemetry wiring', () => {
  it('publishes balance/usedToday/rpmRemaining from fixture _meta via onMeta', async () => {
    const fixture = loadFixture('list-chats.json');
    const events: CreditMeterSnapshot[] = [];
    const { client } = makeClient([() => jsonResponse(fixture)], {
      onMeta: (snapshot) => events.push(snapshot),
    });
    await client.listChats({ accountId: ACCOUNT_ID });
    expect(events).toHaveLength(1);
    expect(events[0]?.balance).toBe(99193);
    expect(events[0]?.usedToday).toBe(1);
    expect(events[0]?.rpmRemaining).toBe(4999);
    expect(client.creditMeter.snapshot().usedToday).toBe(1);
  });

  it('records telemetry from headers even on error responses', async () => {
    const { client } = makeClient([
      () =>
        jsonResponse(
          { message: 'whatever' },
          { status: 404, headers: { 'x-ofapi-credits-used': '1', 'x-ofapi-credits-balance': '5' } },
        ),
    ]);
    await expect(client.whoami()).rejects.toBeInstanceOf(OfApiError);
    expect(client.creditMeter.snapshot()).toMatchObject({ usedToday: 1, balance: 5 });
  });
});

describe('error mapping through the request path', () => {
  it('401 → CG-OF-01 without retrying', async () => {
    const { client, requests } = makeClient([
      () => jsonResponse({ message: 'Unauthenticated.' }, { status: 401 }),
    ]);
    await expect(client.listChats({ accountId: ACCOUNT_ID })).rejects.toMatchObject({
      code: 'CG-OF-01',
    });
    expect(requests).toHaveLength(1);
  });

  it('persistent 429 → retried with backoff then CG-OF-03', async () => {
    const { client, requests } = makeClient([
      () => jsonResponse({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'retry-after': '1' } }),
    ]);
    await expect(client.listChats({ accountId: ACCOUNT_ID })).rejects.toMatchObject({
      code: 'CG-OF-03',
    });
    // initial + 4 backoff retries (1/2/4/8 s policy)
    expect(requests).toHaveLength(5);
  });

  it('network failure → CG-NET-01', async () => {
    const client = createOfApiClient({
      apiKey: 'k',
      fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
      sleep: instantSleep,
    });
    await expect(client.whoami()).rejects.toMatchObject({ code: 'CG-NET-01' });
  });
});

describe('write methods never auto-retry (SPEC §7 / §15.5)', () => {
  const WRITE_CALLS: ReadonlyArray<{
    name: string;
    invoke: (client: ReturnType<typeof createOfApiClient>) => Promise<unknown>;
  }> = [
    {
      name: 'sendMessage',
      invoke: (c) => c.sendMessage({ accountId: ACCOUNT_ID, chatId: '1000039', text: 'hi' }),
    },
    {
      name: 'deleteMessage',
      invoke: (c) =>
        c.deleteMessage({ accountId: ACCOUNT_ID, chatId: '1000039', messageId: '9000000001' }),
    },
    {
      name: 'likeMessage',
      invoke: (c) =>
        c.likeMessage({ accountId: ACCOUNT_ID, chatId: '1000039', messageId: '9000000001' }),
    },
    {
      name: 'unlikeMessage',
      invoke: (c) =>
        c.unlikeMessage({ accountId: ACCOUNT_ID, chatId: '1000039', messageId: '9000000001' }),
    },
    { name: 'startTyping', invoke: (c) => c.startTyping({ accountId: ACCOUNT_ID, chatId: '1000039' }) },
    { name: 'markChatRead', invoke: (c) => c.markChatRead({ accountId: ACCOUNT_ID, chatId: '1000039' }) },
  ];

  it('every write method makes exactly ONE attempt on 500 (no sleep, no retry)', async () => {
    for (const { name, invoke } of WRITE_CALLS) {
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
      await expect(invoke(client), name).rejects.toMatchObject({ code: 'CG-NET-01' });
      expect(requests, name).toHaveLength(1);
      expect(sleeps, name).toEqual([]);
    }
  });

  it('every write method makes exactly ONE attempt on 429 (rate-limit surfaces)', async () => {
    for (const { name, invoke } of WRITE_CALLS) {
      const { client, requests } = makeClient([
        () =>
          jsonResponse({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'retry-after': '1' } }),
      ]);
      await expect(invoke(client), name).rejects.toMatchObject({ code: 'CG-OF-03' });
      expect(requests, name).toHaveLength(1);
    }
  });

  it('reads keep issuing GETs only; writes use the verified upstream methods', async () => {
    const fixture = loadFixture('list-chats.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listChats({ accountId: ACCOUNT_ID });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });
});
