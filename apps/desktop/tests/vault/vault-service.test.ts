// Main-process vault service (PRD F7, SPEC §4/§15.1): VM mapping with thumbs
// minted through the registering toMediaUrl seam (the renderer must never see
// raw OF CDN URLs), the one-shot pick-file token pattern (the renderer never
// sees filesystem paths), and the upload flow incl. async polling.

import { describe, expect, it, vi } from 'vitest';
import { createVaultService, mapVaultItem } from '@main/media/vault';
import type { VaultClient, VaultServiceOptions } from '@main/media/vault';
import type { OfApiUploadStatus, OfApiVaultMedia } from '@main/ofapi/schemas';

const ACCT = 'acct_test';

const mintedUrls: string[] = [];
function toMediaUrl(remoteUrl: string): string | null {
  mintedUrls.push(remoteUrl);
  return `media://${Buffer.from(remoteUrl).toString('base64url')}`;
}

function vaultMedia(overrides: Partial<OfApiVaultMedia> = {}): OfApiVaultMedia {
  return {
    id: 3866342509,
    type: 'photo',
    isReady: true,
    createdAt: '2026-05-01T10:00:00+00:00',
    counters: { likesCount: 12, tipsSumm: 85 },
    duration: 0,
    files: {
      full: { url: 'https://cdn2.onlyfans.com/files/v1/full.jpg' },
      thumb: { url: 'https://cdn2.onlyfans.com/files/v1/300.jpg' },
      preview: null,
      squarePreview: null,
    },
    ...overrides,
  };
}

interface StubbedClient {
  client: VaultClient;
  statuses: OfApiUploadStatus[];
}

function makeClient(overrides: Partial<Record<keyof VaultClient, unknown>> = {}): StubbedClient {
  const statuses: OfApiUploadStatus[] = [];
  const client = {
    listVaultMedia: vi.fn(async () => ({ items: [vaultMedia()], hasMore: false })),
    listVaultLists: vi.fn(async () => ({
      lists: [
        { id: 701, type: 'messages', name: 'Messages', videosCount: 9, photosCount: 120, gifsCount: 1, audiosCount: 2 },
        { id: 703, type: 'custom', name: 'Gym set', videosCount: 3, photosCount: 11, gifsCount: 0, audiosCount: 0 },
      ],
      hasMore: false,
    })),
    getVaultMedia: vi.fn(async () => vaultMedia()),
    listChatMedia: vi.fn(async () => ({ messages: [], hasMore: false, nextLastId: null })),
    uploadVaultMedia: vi.fn(async () => ({ kind: 'completed' as const, media: vaultMedia() })),
    getUploadStatus: vi.fn(async () => {
      const next = statuses.shift();
      if (next === undefined) throw new Error('no scripted status left');
      return next;
    }),
    ...overrides,
  } as unknown as VaultClient;
  return { client, statuses };
}

function makeService(
  stub: StubbedClient,
  overrides: Partial<VaultServiceOptions> = {},
): ReturnType<typeof createVaultService> {
  return createVaultService({
    client: stub.client,
    toMediaUrl,
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: ['/private/home/x/clip.mp4'] }),
    },
    statFile: async () => ({ size: 12_400_000 }),
    readFileBytes: async () => new TextEncoder().encode('bytes'),
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

describe('mapVaultItem', () => {
  it('mints the thumb through toMediaUrl — never a raw OF URL in the VM', () => {
    const vm = mapVaultItem(vaultMedia(), toMediaUrl);
    expect(vm.thumbUrl).toMatch(/^media:\/\//);
    expect(vm).toMatchObject({ id: '3866342509', type: 'photo', isReady: true, tipsTotal: 85 });
  });

  it('audio falls back to the full url; processing items report isReady false', () => {
    const audio = mapVaultItem(
      vaultMedia({
        type: 'audio',
        isReady: false,
        duration: 3,
        files: { full: { url: 'https://cdn2.onlyfans.com/files/v3/full.mp3' }, thumb: null, preview: null, squarePreview: null },
      }),
      toMediaUrl,
    );
    expect(audio.isReady).toBe(false);
    expect(audio.thumbUrl).toMatch(/^media:\/\//);
    expect(audio.durationSeconds).toBe(3);
    expect(mintedUrls).toContain('https://cdn2.onlyfans.com/files/v3/full.mp3');
  });
});

describe('listVault / listAlbums / chatGallery', () => {
  it('passes albumId + query through and computes nextOffset from hasMore', async () => {
    const stub = makeClient({
      listVaultMedia: vi.fn(async () => ({ items: [vaultMedia()], hasMore: true })),
    });
    const service = makeService(stub);
    const page = await service.listVault({ accountId: ACCT, albumId: '703', query: 'gym', offset: 60 });
    expect(stub.client.listVaultMedia).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCT, listId: '703', query: 'gym', offset: 60 }),
    );
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(61);
    expect(page.items[0]?.thumbUrl).toMatch(/^media:\/\//);

    const last = await makeService(makeClient()).listVault({ accountId: ACCT });
    expect(last.nextOffset).toBeNull();
  });

  it('maps albums with the custom/system distinction and summed counts', async () => {
    const service = makeService(makeClient());
    const albums = await service.listAlbums({ accountId: ACCT });
    expect(albums).toEqual([
      { id: '701', name: 'Messages', custom: false, mediaCount: 132 },
      { id: '703', name: 'Gym set', custom: true, mediaCount: 14 },
    ]);
  });

  it('gallery: isSentByMe from fromUser vs the fan id (chat_id === fan.id), media minted', async () => {
    const stub = makeClient({
      listChatMedia: vi.fn(async () => ({
        messages: [
          {
            id: 9100000001,
            createdAt: '2026-06-01T18:00:00+00:00',
            price: 25,
            isOpened: true,
            mediaCount: 2,
            media: [
              { id: 51, type: 'photo', isReady: true, files: { thumb: { url: 'https://cdn2.onlyfans.com/files/g1/300.jpg' } } },
              { id: 52, type: 'video', isReady: true, duration: 58, files: { thumb: { url: 'https://cdn2.onlyfans.com/files/g2/300.jpg' } } },
            ],
            fromUser: { id: 169000001 }, // the creator — not the fan
          },
          {
            id: 9100000002,
            createdAt: '2026-06-02T09:30:00+00:00',
            price: 0,
            isOpened: true,
            mediaCount: 1,
            media: [],
            fromUser: { id: 1000039 }, // === chatId ⇒ from the fan
          },
        ],
        hasMore: true,
        nextLastId: '9100000002',
      })),
    });
    const service = makeService(stub);
    const page = await service.chatGallery({ accountId: ACCT, chatId: '1000039' });
    expect(page.items[0]).toMatchObject({
      messageId: '9100000001',
      isSentByMe: true,
      price: 25,
      isOpened: true,
      mediaCount: 2,
    });
    expect(page.items[0]?.media[0]?.thumbUrl).toMatch(/^media:\/\//);
    expect(page.items[1]?.isSentByMe).toBe(false);
    expect(page.nextOffset).toBe(2);
  });
});

describe('pickFile (one-shot token — the renderer never sees paths)', () => {
  it('returns name/bytes/credit preflight + an opaque token, no path', async () => {
    const service = makeService(makeClient());
    const picked = await service.pickFile();
    expect(picked).not.toBeNull();
    expect(picked).toMatchObject({ name: 'clip.mp4', bytes: 12_400_000, creditEstimate: 38 });
    expect(JSON.stringify(picked)).not.toContain('/private/home'); // no path leak
  });

  it('returns null on cancel and rejects oversize files at preflight', async () => {
    const cancelled = makeService(makeClient(), {
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    });
    await expect(cancelled.pickFile()).resolves.toBeNull();

    const oversize = makeService(makeClient(), {
      statFile: async () => ({ size: 100 * 1_000_000 + 1 }),
    });
    await expect(oversize.pickFile()).rejects.toMatchObject({ code: 'CG-OF-08' });
  });
});

describe('upload', () => {
  it('sync path: resolves the token, uploads, returns the reusable vault id; token is one-shot', async () => {
    const stub = makeClient();
    const service = makeService(stub);
    const picked = await service.pickFile();
    const result = await service.upload({ accountId: ACCT, fileToken: picked?.token ?? '' });
    expect(result).toEqual({ vaultId: '3866342509', isReady: true, creditsUsed: null });
    expect(stub.client.uploadVaultMedia).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCT, fileName: 'clip.mp4' }),
    );
    // one-shot: a second use must re-pick (re-preflight)
    await expect(service.upload({ accountId: ACCT, fileToken: picked?.token ?? '' })).rejects.toThrow(
      /token/,
    );
  });

  it('async path: polls until completed and returns media.id + credits_used', async () => {
    const stub = makeClient({
      uploadVaultMedia: vi.fn(async () => ({
        kind: 'started' as const,
        prefixedId: 'ofapi_media_x',
        pollingUrl: 'https://app.onlyfansapi.com/api/acct_test/media/uploads/ofapi_media_x/status',
      })),
    });
    stub.statuses.push(
      { status: 'processing', prefixed_id: 'ofapi_media_x' },
      { status: 'completed', prefixed_id: 'ofapi_media_x', media: { id: 3866999002, isReady: false }, credits_used: 38 },
    );
    const service = makeService(stub);
    const picked = await service.pickFile();
    const result = await service.upload({ accountId: ACCT, fileToken: picked?.token ?? '', useAsync: true });
    expect(result).toEqual({ vaultId: '3866999002', isReady: false, creditsUsed: 38 });
    expect(stub.client.getUploadStatus).toHaveBeenCalledTimes(2);
    expect(stub.client.getUploadStatus).toHaveBeenCalledWith({ accountId: ACCT, uploadId: 'ofapi_media_x' });
  });

  it('async path: failed status surfaces as CG-OF-08 with the upstream error', async () => {
    const stub = makeClient({
      uploadVaultMedia: vi.fn(async () => ({
        kind: 'started' as const,
        prefixedId: 'ofapi_media_x',
        pollingUrl: 'https://example/poll',
      })),
    });
    stub.statuses.push({ status: 'failed', prefixed_id: 'ofapi_media_x', error: 'transcode exploded' });
    const service = makeService(stub);
    const picked = await service.pickFile();
    await expect(
      service.upload({ accountId: ACCT, fileToken: picked?.token ?? '', useAsync: true }),
    ).rejects.toMatchObject({ code: 'CG-OF-08', message: 'transcode exploded' });
  });
});
