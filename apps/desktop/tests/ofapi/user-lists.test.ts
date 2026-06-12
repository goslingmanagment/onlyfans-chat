// Contract tests for the user-lists endpoints (Supporters board, PLAN item 12).
// Fixtures are SYNTHETIC (hand-built from the vendored openapi examples, marked
// in their _fixture headers). The lists are OnlyMonster's — the client must
// stay strictly read-only toward them.

import { describe, expect, it } from 'vitest';
import { createOfApiClient, USER_LIST_USERS_MAX_LIMIT } from '@main/ofapi/client';
import type { OfApiClientOptions } from '@main/ofapi/client';
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

describe('listUserLists', () => {
  it('unwraps the LIVE {list, hasMore} data shape (NOT the openapi example array)', async () => {
    const fixture = loadFixture('user-lists.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listUserLists({ purpose: 'supporters', accountId: ACCOUNT_ID });
    expect(result.lists).toHaveLength(6);
    expect(result.hasMore).toBe(false);
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/user-lists`);
    expect(requests[0]?.method).toBe('GET');
  });

  it('tolerates the live id namespace: custom STRING ids, built-in word ids', async () => {
    const fixture = loadFixture('user-lists.json');
    const { client } = makeClient([() => jsonResponse(fixture)]);
    const { lists } = await client.listUserLists({ purpose: 'supporters', accountId: ACCOUNT_ID });
    expect(lists[0]?.id).toBe('1247248934');
    expect(lists[0]?.type).toBe('custom');
    expect(lists[0]?.name).toBe('🐳 Кит 600+_OM');
    expect(lists[0]?.usersCount).toBe(3);
    expect(lists[4]?.id).toBe('recent');
    expect(lists[5]?.id).toBe('fans');
  });

  it('passes limit/offset through as query params', async () => {
    const fixture = loadFixture('user-lists.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listUserLists({ purpose: 'supporters', accountId: ACCOUNT_ID, limit: 50, offset: 50 });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('offset')).toBe('50');
  });

  it('records credit telemetry under the supporters purpose', async () => {
    const fixture = loadFixture('user-lists.json');
    const { client } = makeClient([() => jsonResponse(fixture)]);
    await client.listUserLists({ purpose: 'supporters', accountId: ACCOUNT_ID });
    const snapshot = client.creditMeter.snapshot();
    expect(snapshot.usedTodayByPurpose['supporters']?.credits).toBe(1);
    expect(snapshot.usedTodayByPurpose['supporters']?.requests).toBe(1);
  });
});

describe('listUserListUsers', () => {
  it('unwraps {list, hasMore, nextOffset} and exposes the offset cursor', async () => {
    const fixture = loadFixture('user-list-users.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listUserListUsers({
      purpose: 'supporters',
      accountId: ACCOUNT_ID,
      userListId: '1139401260',
      limit: 100,
    });
    expect(result.users).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(2);
    // Roster ids are raw OF numeric ids (=== chat ids).
    expect(result.users[0]?.id).toBe(90986491);
    expect(result.users[0]?.username).toBe('fixture_fan_1');
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/user-lists/1139401260/users`);
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('rejects limits above the documented 100 cap before any request', async () => {
    const { client, requests } = makeClient([]);
    await expect(
      client.listUserListUsers({
        purpose: 'supporters',
        accountId: ACCOUNT_ID,
        userListId: '1',
        limit: USER_LIST_USERS_MAX_LIMIT + 1,
      }),
    ).rejects.toThrow(/limit max/);
    expect(requests).toHaveLength(0);
  });

  it('URL-encodes the list id path segment', async () => {
    const fixture = loadFixture('user-list-users.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listUserListUsers({
      purpose: 'supporters',
      accountId: ACCOUNT_ID,
      userListId: 'rebill_on/x',
    });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/user-lists/rebill_on%2Fx/users`);
  });
});

describe('read-only guarantee (PLAN item 12: lists are OnlyMonster process)', () => {
  it('the client exposes no user-list write method', () => {
    const { client } = makeClient([]);
    const writeLike = Object.keys(client).filter((name) =>
      /userList/i.test(name) && /add|remove|clear|create|delete|update|pin/i.test(name),
    );
    expect(writeLike).toEqual([]);
  });
});
