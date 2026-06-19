// C6a production compatibility probe: the desktop OfApiClient talks to core's
// chatter-scoped read gateway with a supplied Hub key. GET only; one chats page
// spends one OFAPI credit. No direct OFAPI key and no write route are involved.
//
//   HUB_READ_LIVE=1 CHATGOOSE_HUB_BASE_URL=https://... \
//   CHATGOOSE_HUB_API_KEY=... npx vitest run tests/live/hub-read-live.test.ts

import { describe, expect, it } from 'vitest';
import { createOfApiClient } from '@main/ofapi/client';
import { buildHubOfApiReadBaseUrl } from '@main/ofapi/transport';

const BASE_URL = process.env['CHATGOOSE_HUB_BASE_URL']?.trim() ?? '';
const API_KEY = process.env['CHATGOOSE_HUB_API_KEY']?.trim() ?? '';
const ENABLED = process.env['HUB_READ_LIVE'] === '1' && BASE_URL !== '' && API_KEY !== '';

describe.skipIf(!ENABLED)('LIVE core OFAPI read gateway (GET only)', () => {
  const client = createOfApiClient({
    apiKey: API_KEY,
    baseUrl: buildHubOfApiReadBaseUrl(BASE_URL),
    authErrorCode: 'CG-HUB-01',
  });

  it('lists assigned accounts, returns sanitized identity, and parses one chats page', async () => {
    const accounts = await client.listAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.every((account) => account.id.startsWith('acct_'))).toBe(true);

    const identity = await client.whoami();
    expect(identity.api_key?.name?.startsWith('Agency Hub chatter:')).toBe(true);
    expect((identity.team?.slug?.length ?? 0) > 0).toBe(true);

    const account = accounts[0];
    expect(account).toBeDefined();
    if (account === undefined) return;
    const chats = await client.listChats({
      purpose: 'chat-refresh',
      accountId: account.id,
      limit: 1,
      offset: 0,
      order: 'recent',
      skipUsers: 'all',
    });
    expect(chats.chats.length).toBeLessThanOrEqual(1);

    const meter = client.creditMeter.snapshot();
    expect(meter.usedTodayByPurpose['chat-refresh']).toEqual({
      requests: 1,
      credits: 1,
    });
  }, 30_000);
});
