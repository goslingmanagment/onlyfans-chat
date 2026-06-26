import { describe, expect, it } from 'vitest';
import { createOfApiClient } from '@main/ofapi/client';
import type { OfApiClientOptions } from '@main/ofapi/client';
import { instantSleep, jsonResponse, stubFetch } from './helpers';

const ACCOUNT_ID = 'acct_01000000000000000000000000000000';
// Minimal fans envelope: ofapiEnvelopeSchema requires only `data`; ofapiFansDataSchema = { list, hasMore? }.
const FANS_BODY = { data: { list: [], hasMore: false } };

function makeClient(responses: Array<() => Response>, options: Partial<OfApiClientOptions> = {}) {
  const { fetchImpl, requests } = stubFetch(responses);
  const client = createOfApiClient({ apiKey: 'test-key', fetchImpl, sleep: instantSleep, ...options });
  return { client, requests };
}

describe('listFansActive — /fans/active filter wire format', () => {
  it('emits BRACKET notation filter[online]=1 & filter[total_spent]=1 (percent-encoded)', async () => {
    const { client, requests } = makeClient([() => jsonResponse(FANS_BODY)]);
    await client.listFansActive({
      purpose: 'online', accountId: ACCOUNT_ID, limit: 20, offset: 0, online: true, minTotalSpent: 1,
    });
    const raw = requests[0]?.url ?? '';
    // Laravel/Spatie reads filter[]; PHP parse_str would mangle dotted filter.online → filter_online.
    expect(raw).toContain('filter%5Bonline%5D=1');
    expect(raw).toContain('filter%5Btotal_spent%5D=1');
    const url = new URL(raw);
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/fans/active`);
    expect(url.searchParams.get('filter[online]')).toBe('1');     // decoded round-trip
    expect(url.searchParams.get('filter[total_spent]')).toBe('1');
  });

  it('omits both filter keys when online=false / minTotalSpent absent', async () => {
    const { client, requests } = makeClient([() => jsonResponse(FANS_BODY)]);
    await client.listFansActive({ purpose: 'online', accountId: ACCOUNT_ID, online: false });
    expect(requests[0]?.url ?? '').not.toContain('filter%5B');
  });

  it('listFansAll never emits filter keys (shared params default undefined — no regression)', async () => {
    const { client, requests } = makeClient([() => jsonResponse(FANS_BODY)]);
    await client.listFansAll({ purpose: 'hydration', accountId: ACCOUNT_ID });
    expect(requests[0]?.url ?? '').not.toContain('filter%5B');
  });
});
