// Vault / chat-gallery / upload client contract (PRD F7, SPEC §5). Fixtures
// are SYNTHETIC — hand-built against docs/vendor/onlyfansapi/openapi.json
// shapes (provenance in each file's _fixture block); there is no live capture
// for these endpoints yet.

import { describe, expect, it } from 'vitest';
import {
  createOfApiClient,
  estimateUploadCredits,
  VAULT_LIST_MAX_LIMIT,
  VAULT_UPLOAD_MAX_BYTES,
} from '@main/ofapi/client';
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

describe('listVaultMedia (synthetic openapi fixture)', () => {
  it('unwraps {data:{list,hasMore}} and surfaces isReady/files', async () => {
    const fixture = loadFixture('vault-list-media.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listVaultMedia({ purpose: 'vault', accountId: ACCOUNT_ID });
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.items[0]).toMatchObject({ id: 3866342509, type: 'photo', isReady: true });
    expect(result.items[0]?.files?.thumb?.url).toContain('cdn2.onlyfans.com');
    expect(result.items[0]?.counters?.tipsSumm).toBe(85);
    // audio: thumb null + still transcoding
    expect(result.items[2]).toMatchObject({ type: 'audio', isReady: false });
    expect(result.items[2]?.files?.thumb).toBeNull();
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/media/vault`);
    expect(requests[0]?.method).toBe('GET');
  });

  it('maps query/field/type/list/sort/limit/offset query params', async () => {
    const fixture = loadFixture('vault-list-media.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    await client.listVaultMedia({ purpose: 'vault',
      accountId: ACCOUNT_ID,
      query: 'gym',
      field: 'highest-tips',
      type: 'video',
      listId: '703',
      sort: 'asc',
      limit: 24,
      offset: 48,
    });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.searchParams.get('query')).toBe('gym');
    expect(url.searchParams.get('field')).toBe('highest-tips');
    expect(url.searchParams.get('type')).toBe('video');
    expect(url.searchParams.get('list')).toBe('703');
    expect(url.searchParams.get('sort')).toBe('asc');
    expect(url.searchParams.get('limit')).toBe('24');
    expect(url.searchParams.get('offset')).toBe('48');
  });

  it('rejects limits above the documented 100 cap without a request', async () => {
    const { client, requests } = makeClient([() => jsonResponse({})]);
    await expect(
      client.listVaultMedia({ purpose: 'vault', accountId: ACCOUNT_ID, limit: VAULT_LIST_MAX_LIMIT + 1 }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    expect(requests).toHaveLength(0);
  });

  it('retries a GET on 5xx (idempotent policy)', async () => {
    const fixture = loadFixture('vault-list-media.json');
    const { client, requests } = makeClient([
      () => jsonResponse({ message: 'upstream hiccup' }, { status: 502 }),
      () => jsonResponse(fixture),
    ]);
    const result = await client.listVaultMedia({ purpose: 'vault', accountId: ACCOUNT_ID });
    expect(result.items).toHaveLength(3);
    expect(requests).toHaveLength(2);
  });
});

describe('listVaultLists (synthetic openapi fixture)', () => {
  it('returns albums incl. the custom/system distinction', async () => {
    const fixture = loadFixture('vault-lists.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listVaultLists({ purpose: 'vault', accountId: ACCOUNT_ID, limit: 100 });
    expect(result.lists).toHaveLength(3);
    expect(result.hasMore).toBe(false);
    expect(result.lists[2]).toMatchObject({ id: 703, type: 'custom', name: 'Gym set' });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/media/vault/lists`);
    expect(url.searchParams.get('limit')).toBe('100');
  });
});

describe('listChatMedia / gallery (synthetic openapi fixture)', () => {
  it('unwraps message objects with media, price, isOpened, nextLastId', async () => {
    const fixture = loadFixture('chat-media-gallery.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const result = await client.listChatMedia({ purpose: 'media', accountId: ACCOUNT_ID, chatId: '1000039' });
    expect(result.messages).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextLastId).toBe('9100000002');
    const ppv = result.messages[0];
    expect(ppv).toMatchObject({ id: 9100000001, price: 25, isOpened: true, mediaCount: 2 });
    expect(ppv?.media).toHaveLength(2);
    expect(ppv?.fromUser?.id).toBe(169000001);
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(`/api/${ACCOUNT_ID}/chats/1000039/media`);
    expect(url.searchParams.get('skip_users')).toBe('all');
  });
});

describe('getUploadStatus (bare object, free)', () => {
  it('parses the processing branch and hits the documented path', async () => {
    const fixture = loadFixture('upload-status-processing.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const status = await client.getUploadStatus({ purpose: 'vault',
      accountId: ACCOUNT_ID,
      uploadId: 'ofapi_media_fixture0123456789abcdef01234567',
    });
    expect(status.status).toBe('processing');
    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe(
      `/api/${ACCOUNT_ID}/media/uploads/ofapi_media_fixture0123456789abcdef01234567/status`,
    );
  });

  it('parses the completed branch with the reusable vault media id', async () => {
    const fixture = loadFixture('upload-status-completed.json');
    const { client } = makeClient([() => jsonResponse(fixture)]);
    const status = await client.getUploadStatus({ purpose: 'vault', accountId: ACCOUNT_ID, uploadId: 'x' });
    expect(status.status).toBe('completed');
    expect(status.media?.id).toBe(3866999002);
    expect(status.credits_used).toBe(38);
  });
});

describe('uploadVaultMedia', () => {
  const bytes = new TextEncoder().encode('fake-image-bytes');

  it('sync 200: multipart file field, envelope unwrap to the vault item', async () => {
    const fixture = loadFixture('vault-upload-sync-200.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture)]);
    const outcome = await client.uploadVaultMedia({ purpose: 'vault',
      accountId: ACCOUNT_ID,
      fileName: 'shoot.jpg',
      data: bytes,
    });
    expect(outcome).toMatchObject({ kind: 'completed' });
    if (outcome.kind === 'completed') {
      expect(outcome.media.id).toBe(3866999001);
      expect(outcome.media.isReady).toBe(false); // transcoding right after upload
    }
    const request = requests[0];
    expect(request?.method).toBe('POST');
    expect(new URL(request?.url ?? '').pathname).toBe(`/api/${ACCOUNT_ID}/media/vault`);
    expect(request?.form?.['file']).toMatchObject({ fileName: 'shoot.jpg', bytes: bytes.byteLength });
    expect(request?.form?.['async']).toBeUndefined(); // exactly one of file|file_url, no async
    expect(request?.form?.['file_url']).toBeUndefined();
    expect(request?.headers['authorization']).toBe('Bearer test-key');
  });

  it('async=true 202: bare {status,prefixed_id,polling_url} → started outcome', async () => {
    const fixture = loadFixture('vault-upload-async-202.json');
    const { client, requests } = makeClient([() => jsonResponse(fixture, { status: 202 })]);
    const outcome = await client.uploadVaultMedia({ purpose: 'vault',
      accountId: ACCOUNT_ID,
      fileName: 'big.mp4',
      data: bytes,
      useAsync: true,
    });
    expect(outcome).toEqual({
      kind: 'started',
      prefixedId: 'ofapi_media_fixture0123456789abcdef01234567',
      pollingUrl: `https://app.onlyfansapi.com/api/${ACCOUNT_ID}/media/uploads/ofapi_media_fixture0123456789abcdef01234567/status`,
    });
    expect(requests[0]?.form?.['async']).toMatchObject({ value: 'true' });
  });

  it('never auto-retries (write path, retry none): one request, then the error', async () => {
    const { client, requests } = makeClient([
      () => jsonResponse({ message: 'gateway exploded' }, { status: 502 }),
      () => jsonResponse(loadFixture('vault-upload-sync-200.json')),
    ]);
    await expect(
      client.uploadVaultMedia({ purpose: 'vault', accountId: ACCOUNT_ID, fileName: 'a.jpg', data: bytes }),
    ).rejects.toMatchObject({ code: 'CG-NET-01' });
    expect(requests).toHaveLength(1); // a retried upload double-bills credits
  });

  it('preflights size and emptiness before any request', async () => {
    const { client, requests } = makeClient([() => jsonResponse({})]);
    await expect(
      client.uploadVaultMedia({ purpose: 'vault', accountId: ACCOUNT_ID, fileName: 'a.jpg', data: new Uint8Array(0) }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    const tooBig = new Uint8Array(1);
    Object.defineProperty(tooBig, 'byteLength', { value: VAULT_UPLOAD_MAX_BYTES + 1 });
    await expect(
      client.uploadVaultMedia({ purpose: 'vault', accountId: ACCOUNT_ID, fileName: 'a.jpg', data: tooBig }),
    ).rejects.toMatchObject({ code: 'CG-APP-01' });
    expect(requests).toHaveLength(0);
  });
});

describe('estimateUploadCredits (3 credits per decimal MB)', () => {
  it('matches the vendored pricing table', () => {
    expect(estimateUploadCredits(0)).toBe(0);
    expect(estimateUploadCredits(-5)).toBe(0);
    expect(estimateUploadCredits(1)).toBe(1); // ceil to whole credits
    expect(estimateUploadCredits(1_000_000)).toBe(3); // 1 MB (decimal) = 3 credits
    expect(estimateUploadCredits(12_400_000)).toBe(38); // 12.4 MB → 37.2 → 38
    expect(estimateUploadCredits(100_000_000)).toBe(300);
  });
});
