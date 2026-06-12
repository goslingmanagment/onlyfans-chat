// Supporters board live READ-ONLY verification (PLAN item 12). Probes the real
// account's OM user-lists + one roster page and surveys expired/blocked chats
// for their canNotSendReason shapes — GET requests only, a handful of credits,
// no mutations of any kind (the lists are OnlyMonster's process).
//
//   SUPPORTERS_LIVE=1 npx vitest run tests/live/supporters-live.test.ts --testTimeout=120000

import { describe, expect, it } from 'vitest';
import { createOfApiClient } from '@main/ofapi/client';

const ENABLED =
  process.env['SUPPORTERS_LIVE'] === '1' &&
  typeof process.env['ONLYFANSAPI_API_KEY'] === 'string' &&
  process.env['ONLYFANSAPI_API_KEY'] !== '';

const ACCOUNT_ID = process.env['P3_LIVE_ACCOUNT_ID'] ?? 'acct_fbaf2216a7c84147a599f349e0a6fb87';

describe.skipIf(!ENABLED)('LIVE supporters read-only probes', () => {
  const client = createOfApiClient({ apiKey: process.env['ONLYFANSAPI_API_KEY'] ?? '' });

  it('user-lists: real lists parse, mixed id namespace, OM tier lists present', async () => {
    const { lists } = await client.listUserLists({
      purpose: 'supporters',
      accountId: ACCOUNT_ID,
      limit: 50,
    });
    expect(lists.length).toBeGreaterThan(0);
    console.log(
      'LIVE user-lists:',
      lists.map((l) => ({ id: l.id, type: l.type, name: l.name, usersCount: l.usersCount })),
    );
    const custom = lists.filter((l) => l.type === 'custom');
    console.log(`custom lists: ${custom.length}`);
  }, 60_000);

  it('roster page: numeric raw OF ids, offset cursor', async () => {
    const { lists } = await client.listUserLists({
      purpose: 'supporters',
      accountId: ACCOUNT_ID,
      limit: 50,
    });
    const target =
      lists.find((l) => l.type === 'custom' && (l.usersCount ?? 0) > 0) ??
      lists.find((l) => (l.usersCount ?? 0) > 0);
    expect(target).toBeDefined();
    if (target === undefined) return;
    const page = await client.listUserListUsers({
      purpose: 'supporters',
      accountId: ACCOUNT_ID,
      userListId: String(target.id),
      limit: 100,
    });
    expect(page.users.length).toBeGreaterThan(0);
    for (const user of page.users) {
      expect(typeof user.id).toBe('number');
    }
    console.log(
      `LIVE roster of "${target.name}": ${page.users.length} users, hasMore=${page.hasMore}, nextOffset=${page.nextOffset}`,
      page.users.slice(0, 3).map((u) => ({ id: u.id, total: u.subscribedOnData?.totalSumm })),
    );
  }, 60_000);

  it('expired/blocked chats: survey canSendMessage=false reasons (read-only)', async () => {
    const reasons = new Map<string, number>();
    let offset = 0;
    for (let page = 0; page < 5; page += 1) {
      const result = await client.listChats({
        purpose: 'supporters',
        accountId: ACCOUNT_ID,
        limit: 10,
        offset,
        order: 'old',
        skipUsers: 'all',
      });
      for (const chat of result.chats) {
        if (chat.canSendMessage === false) {
          const reason = JSON.stringify(chat.canNotSendReason ?? null);
          reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        }
      }
      if (result.chats.length === 0) break;
      offset += result.chats.length;
    }
    console.log('LIVE canNotSendReason survey (50 oldest chats):', Object.fromEntries(reasons));
    expect(true).toBe(true); // informational probe — findings go to the research doc
  }, 120_000);
});
