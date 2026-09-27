// D42: message, gallery and vault files are id tokens — sha256('ofapi|acct|
// mediaId|variant') — and Core decides how each is fetched. Pins: the hash is
// independent of any URL, minting registers, `full` exists only for photos,
// no automatic thumbnail falls back to the full file, message VMs re-mint
// from ids (ignoring whatever pre-release rows stored) and no remote URL ever
// reaches the renderer. Synthetic ids and URLs only.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashOfapiMediaKey, hashRemoteUrl } from '@main/media/cache';
import { createOfapiMediaMinter, createToMediaUrl, MEDIA_SCHEME, parseMediaToken } from '@main/media/protocol';
import { mapHubMessage, mapMediaItem, mintOfapiMediaTokens } from '@main/sync/mappers';
import { mapVaultItem } from '@main/media/vault';
import { messageToVM } from '@main/ipc/viewmodels';
import type { MessageRow } from '@main/db/index';
import type { OfApiVaultMedia } from '@main/ofapi/schemas';
import { createInMemoryMediaUrlRegistry } from './helpers';

const ACCT = 'acct_05000000000000000000000000000000';
const SIGNED = 'https://cdn2.onlyfans.com/files/a/aa/syn1/300x300_syn1.jpg?Tag=2&Policy=SYNTHETIC&Signature=SYNTHETIC&Key-Pair-Id=K';

describe('id tokens', () => {
  it('hash the (account, media, variant) key, not a URL', () => {
    expect(hashOfapiMediaKey(ACCT, '3000001', 'thumb')).toBe(
      createHash('sha256').update(`ofapi|${ACCT}|3000001|thumb`, 'utf8').digest('hex'),
    );
    expect(hashOfapiMediaKey(ACCT, '3000001', 'thumb')).not.toBe(hashOfapiMediaKey(ACCT, '3000001', 'full'));
    expect(hashOfapiMediaKey(ACCT, '3000001', 'thumb')).not.toBe(hashRemoteUrl(SIGNED));
  });

  it('mint registers the entry and refuses malformed refs', () => {
    const registry = createInMemoryMediaUrlRegistry();
    const mint = createOfapiMediaMinter(registry);
    const url = mint(ACCT, '3000001', 'thumb');
    expect(url).toBe(`${MEDIA_SCHEME}://${hashOfapiMediaKey(ACCT, '3000001', 'thumb')}`);
    const token = parseMediaToken(url ?? '');
    expect(registry.lookupEntry(token ?? '')).toEqual({ kind: 'ofapi', accountId: ACCT, mediaId: '3000001', variant: 'thumb' });
    // An id token is not a URL token.
    expect(registry.lookup(token ?? '')).toBeUndefined();
    expect(mint('not-an-account', '1', 'thumb')).toBeNull();
    expect(mint(ACCT, '12a', 'thumb')).toBeNull();
    expect(mint(ACCT, '', 'full')).toBeNull();
  });

  it('the toMediaUrl seam carries the minter (avatars stay URL tokens)', () => {
    const registry = createInMemoryMediaUrlRegistry();
    const toMediaUrl = createToMediaUrl(registry);
    expect(toMediaUrl('https://public.onlyfans.com/files/avatar.jpg')).toMatch(/^media:\/\/[0-9a-f]{64}$/);
    expect(toMediaUrl.ofapiMedia?.(ACCT, '42', 'thumb')).toMatch(/^media:\/\/[0-9a-f]{64}$/);
  });
});

describe('media rule (shared with Core)', () => {
  const registry = createInMemoryMediaUrlRegistry();
  const mint = createOfapiMediaMinter(registry);

  it.each([
    ['photo', true, false, true, true],
    ['video', true, false, true, false],
    ['gif', true, false, true, false],
    ['audio', true, false, false, false],
    // Still processing: the thumb token exists (refresh on an explicit click only), never full.
    ['photo', false, false, true, false],
    ['video', false, false, true, false],
    ['photo', true, true, false, false],
  ] as const)('%s ready=%s locked=%s → thumb=%s full=%s', (type, isReady, locked, thumb, full) => {
    const tokens = mintOfapiMediaTokens(mint, ACCT, { id: '7', type, isReady, locked });
    expect(tokens.thumbUrl !== null).toBe(thumb);
    expect(tokens.fullUrl !== null).toBe(full);
  });

  it('mapMediaItem names files by id when an account is given, full only for photos', () => {
    const toMediaUrl = createToMediaUrl(createInMemoryMediaUrlRegistry());
    const photo = mapMediaItem({ id: 51, type: 'photo', isReady: true, files: { thumb: { url: SIGNED }, full: { url: SIGNED } } }, toMediaUrl, ACCT);
    expect(photo?.thumbUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '51', 'thumb')}`);
    expect(photo?.fullUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '51', 'full')}`);
    const video = mapMediaItem({ id: 52, type: 'video', isReady: true, files: { preview: { url: SIGNED } } }, toMediaUrl, ACCT);
    expect(video?.fullUrl).toBeNull();
    // Without an account the legacy path still never mints full for a video.
    const legacy = mapMediaItem({ id: 53, type: 'video', isReady: true, files: { preview: { url: SIGNED }, full: { url: SIGNED } } }, toMediaUrl);
    expect(legacy?.fullUrl).toBeNull();
  });

  it('mapHubMessage mints id tokens instead of null', () => {
    const toMediaUrl = createToMediaUrl(createInMemoryMediaUrlRegistry());
    const row = mapHubMessage(ACCT, '1000005', {
      id: '2000001', text: 'hi', createdAt: '2026-09-27T03:49:02+00:00', isSentByMe: false, price: 0,
      media: [{ id: '3000001', type: 'photo', isReady: true, locked: false }, { id: '3000003', type: 'photo', isReady: true, locked: true }],
    }, toMediaUrl.ofapiMedia);
    expect(row?.media[0]?.thumbUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '3000001', 'thumb')}`);
    expect(row?.media[1]).toMatchObject({ thumbUrl: null, fullUrl: null, locked: true });
  });

  it('mapVaultItem never falls back to the full file for an automatic thumbnail', () => {
    const toMediaUrl = createToMediaUrl(createInMemoryMediaUrlRegistry());
    const base: OfApiVaultMedia = {
      id: 3866342509, type: 'video', isReady: true, duration: 30,
      files: { full: { url: SIGNED }, thumb: null, preview: null, squarePreview: null },
    } as OfApiVaultMedia;
    // Legacy path (no account): a video without a preview gets no thumbnail at all.
    expect(mapVaultItem(base, toMediaUrl).thumbUrl).toBeNull();
    // Id path: the thumb token; Core picks thumb → squarePreview → preview, never full.
    expect(mapVaultItem(base, toMediaUrl, ACCT).thumbUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '3866342509', 'thumb')}`);
    expect(mapVaultItem({ ...base, type: 'audio' } as OfApiVaultMedia, toMediaUrl, ACCT).thumbUrl).toBeNull();
    // A processing vault item keeps its thumb token: its cell offers «Проверить», never an automatic load.
    const processing = mapVaultItem({ ...base, isReady: false } as OfApiVaultMedia, toMediaUrl, ACCT);
    expect(processing).toMatchObject({ isReady: false, thumbUrl: `media://${hashOfapiMediaKey(ACCT, '3866342509', 'thumb')}` });
  });
});

describe('message view models re-mint from ids', () => {
  function row(media: MessageRow['media']): MessageRow {
    return {
      accountId: ACCT, chatId: '1000005', messageId: '2000001', createdAt: '2026-09-27T03:49:02.000Z', isSentByMe: false,
      textHtml: '', textPlain: '', price: 0, isOpened: null, isNew: false, isTip: false, tipAmount: null, tipText: null,
      replyTo: null, media, deleted: false,
    };
  }

  it('ignores a pre-release URL token and a null, and re-registers after a registry wipe', () => {
    const registry = createInMemoryMediaUrlRegistry();
    const mint = createOfapiMediaMinter(registry);
    const stale = row([
      { id: '3000001', type: 'photo', thumbUrl: `media://${hashRemoteUrl(SIGNED)}`, fullUrl: null, isReady: true, locked: false, durationSeconds: null },
      { id: '3000002', type: 'video', thumbUrl: null, fullUrl: null, isReady: true, locked: false, durationSeconds: 9 },
    ]);
    const vm = messageToVM(stale, mint);
    expect(vm.media[0]?.thumbUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '3000001', 'thumb')}`);
    expect(vm.media[0]?.fullUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '3000001', 'full')}`);
    expect(vm.media[1]?.thumbUrl).toBe(`media://${hashOfapiMediaKey(ACCT, '3000002', 'thumb')}`);
    expect(vm.media[1]?.fullUrl).toBeNull();

    registry.clear(); // what media-cache clear does to the registry
    const again = messageToVM(stale, mint);
    const token = parseMediaToken(again.media[0]?.thumbUrl ?? '');
    expect(registry.lookupEntry(token ?? '')).toMatchObject({ kind: 'ofapi', mediaId: '3000001' });
  });

  it('a processing file keeps its thumb token in the VM, never a full one', () => {
    const vm = messageToVM(row([
      { id: '3000011', type: 'photo', thumbUrl: null, fullUrl: null, isReady: false, locked: false, durationSeconds: null },
      { id: '3000012', type: 'photo', thumbUrl: null, fullUrl: null, isReady: false, locked: true, durationSeconds: null },
    ]), createOfapiMediaMinter(createInMemoryMediaUrlRegistry()));
    expect(vm.media[0]).toMatchObject({ isReady: false, thumbUrl: `media://${hashOfapiMediaKey(ACCT, '3000011', 'thumb')}`, fullUrl: null });
    expect(vm.media[1]).toMatchObject({ thumbUrl: null, fullUrl: null });
  });

  it('never hands the renderer a remote URL', () => {
    const vm = messageToVM(row([
      { id: '3000009', type: 'photo', thumbUrl: SIGNED, fullUrl: SIGNED, isReady: true, locked: false, durationSeconds: null },
    ]), createOfapiMediaMinter(createInMemoryMediaUrlRegistry()));
    const serialized = JSON.stringify(vm);
    expect(serialized).not.toContain('onlyfans.com');
    expect(serialized).not.toContain('Signature');
    expect(vm.media[0]?.thumbUrl).toMatch(/^media:\/\/[0-9a-f]{64}$/);
  });
});
