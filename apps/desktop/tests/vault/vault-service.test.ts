// Main-process vault service (PRD F7, SPEC §4/§15.1): VM mapping with thumbs
// minted through the registering toMediaUrl seam (the renderer must never see
// raw OF CDN URLs). Local file-byte upload is intentionally outside this app
// service.

import { describe, expect, it, vi } from 'vitest';
import { createVaultService, mapVaultItem } from '@main/media/vault';
import type { VaultClient, VaultServiceOptions } from '@main/media/vault';
import type { OfApiVaultMedia } from '@main/ofapi/schemas';

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

function makeClient(overrides: Partial<Record<keyof VaultClient, unknown>> = {}): VaultClient {
  const client = {
    listVaultMedia: vi.fn(async () => ({ items: [vaultMedia()], hasMore: false })),
    listVaultLists: vi.fn(async () => ({
      lists: [
        { id: 701, type: 'messages', name: 'Messages', videosCount: 9, photosCount: 120, gifsCount: 1, audiosCount: 2 },
        { id: 703, type: 'custom', name: 'Gym set', videosCount: 3, photosCount: 11, gifsCount: 0, audiosCount: 0 },
      ],
      hasMore: false,
    })),
    listChatMedia: vi.fn(async () => ({ messages: [], hasMore: false, nextLastId: null })),
    ...overrides,
  } as unknown as VaultClient;
  return client;
}

function makeService(
  client: VaultClient,
  overrides: Partial<VaultServiceOptions> = {},
): ReturnType<typeof createVaultService> {
  return createVaultService({
    client,
    toMediaUrl,
    ...overrides,
  });
}

describe('mapVaultItem', () => {
  it('mints the thumb through toMediaUrl — never a raw OF URL in the VM', () => {
    const vm = mapVaultItem(vaultMedia(), toMediaUrl);
    expect(vm.thumbUrl).toMatch(/^media:\/\//);
    expect(vm).toMatchObject({ id: '3866342509', type: 'photo', isReady: true, tipsTotal: 85 });
  });

  it('never mints a full-only audio file as an image thumbnail', () => {
    const callsBefore = mintedUrls.length;
    const audio = mapVaultItem(
      vaultMedia({
        type: 'audio',
        isReady: true,
        duration: 3,
        files: { full: { url: 'https://cdn2.onlyfans.com/files/v3/full.mp3' }, thumb: null, preview: null, squarePreview: null },
      }),
      toMediaUrl,
    );
    expect(audio.isReady).toBe(true);
    expect(audio.thumbUrl).toBeNull();
    expect(audio.durationSeconds).toBe(3);
    expect(mintedUrls.slice(callsBefore)).not.toContain('https://cdn2.onlyfans.com/files/v3/full.mp3');
  });
});

describe('listVault / listAlbums / chatGallery', () => {
  it('passes albumId + query through and computes nextOffset from hasMore', async () => {
    const client = makeClient({
      listVaultMedia: vi.fn(async () => ({ items: [vaultMedia()], hasMore: true })),
    });
    const service = makeService(client);
    const page = await service.listVault({ accountId: ACCT, albumId: '703', query: 'gym', offset: 60 });
    expect(client.listVaultMedia).toHaveBeenCalledWith(
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
    const client = makeClient({
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
    const service = makeService(client);
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
