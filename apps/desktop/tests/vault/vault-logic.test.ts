// Pure vault/PPV compose logic (PRD F7): selection ordering, the previews ⊆
// selection invariant, price parsing against the openapi bounds, the compose
// summary the misprice guard renders, and the gallery merge/badges.

import { describe, expect, it } from 'vitest';
import type { GalleryItemVM } from '../../src/preload/contract';
import {
  EMPTY_SELECTION,
  PPV_PRICE_MAX,
  PPV_PRICE_MIN,
  chunkRows,
  deriveComposeSummary,
  galleryBadge,
  mergeGalleryPages,
  parsePpvPrice,
  selectionOrder,
  togglePreview,
  toggleSelect,
  type VaultSelection,
} from '../../src/renderer/src/features/vault/vaultLogic';

function gallery(overrides: Partial<GalleryItemVM>): GalleryItemVM {
  return {
    messageId: 'm1',
    createdAt: '2026-06-11T12:00:00.000Z',
    isSentByMe: true,
    price: 0,
    isOpened: null,
    mediaCount: 1,
    media: [],
    ...overrides,
  };
}

describe('selection (ordered multi-select)', () => {
  it('appends in click order and removes on re-click', () => {
    let sel = EMPTY_SELECTION;
    sel = toggleSelect(sel, 'a');
    sel = toggleSelect(sel, 'b');
    sel = toggleSelect(sel, 'c');
    expect(sel.ids).toEqual(['a', 'b', 'c']);
    expect(selectionOrder(sel, 'b')).toBe(2);
    expect(selectionOrder(sel, 'zzz')).toBeNull();

    sel = toggleSelect(sel, 'b'); // detach the middle item
    expect(sel.ids).toEqual(['a', 'c']);
    expect(selectionOrder(sel, 'c')).toBe(2); // order badges re-pack
  });

  it('deselecting an item drops its preview flag (subset invariant)', () => {
    let sel: VaultSelection = { ids: ['a', 'b'], previews: ['a'] };
    sel = toggleSelect(sel, 'a');
    expect(sel.ids).toEqual(['b']);
    expect(sel.previews).toEqual([]);
  });

  it('togglePreview only works on selected items and toggles both ways', () => {
    let sel: VaultSelection = { ids: ['a'], previews: [] };
    expect(togglePreview(sel, 'unselected')).toBe(sel); // no-op
    sel = togglePreview(sel, 'a');
    expect(sel.previews).toEqual(['a']);
    sel = togglePreview(sel, 'a');
    expect(sel.previews).toEqual([]);
  });
});

describe('parsePpvPrice (openapi: 0 or integer 3–200)', () => {
  it('treats empty / 0 / free as a free media message', () => {
    expect(parsePpvPrice('')).toEqual({ kind: 'free' });
    expect(parsePpvPrice('  ')).toEqual({ kind: 'free' });
    expect(parsePpvPrice('0')).toEqual({ kind: 'free' });
    expect(parsePpvPrice('FREE')).toEqual({ kind: 'free' });
  });

  it('accepts whole dollars in range (with an optional $ prefix)', () => {
    expect(parsePpvPrice('25')).toEqual({ kind: 'paid', dollars: 25 });
    expect(parsePpvPrice('$25')).toEqual({ kind: 'paid', dollars: 25 });
    expect(parsePpvPrice(String(PPV_PRICE_MIN))).toEqual({ kind: 'paid', dollars: 3 });
    expect(parsePpvPrice(String(PPV_PRICE_MAX))).toEqual({ kind: 'paid', dollars: 200 });
  });

  it('rejects below-min, above-max, cents, and junk — with reasons', () => {
    expect(parsePpvPrice('2')).toMatchObject({ kind: 'invalid' });
    expect(parsePpvPrice('201')).toMatchObject({ kind: 'invalid' });
    expect(parsePpvPrice('9.99')).toMatchObject({ kind: 'invalid' });
    expect(parsePpvPrice('-5')).toMatchObject({ kind: 'invalid' });
    expect(parsePpvPrice('abc')).toMatchObject({ kind: 'invalid' });
    const below = parsePpvPrice('1');
    expect(below.kind === 'invalid' && below.reason.includes('$3')).toBe(true);
  });
});

describe('deriveComposeSummary (mandatory misprice guard)', () => {
  const twoItems: VaultSelection = { ids: ['a', 'b'], previews: ['a'] };

  it('is null with no selection or an invalid price — confirm button cannot render', () => {
    expect(deriveComposeSummary(EMPTY_SELECTION, { kind: 'paid', dollars: 25 }, 'hi')).toBeNull();
    expect(deriveComposeSummary(twoItems, parsePpvPrice('2'), 'hi')).toBeNull();
  });

  it('restates the price in words on the confirm label', () => {
    const paid = deriveComposeSummary(twoItems, { kind: 'paid', dollars: 25 }, 'caption');
    expect(paid).toEqual({
      itemCount: 2,
      previewCount: 1,
      price: 25,
      caption: 'locked',
      confirmLabel: 'Send 2 items for $25',
    });

    const single = deriveComposeSummary({ ids: ['a'], previews: [] }, { kind: 'paid', dollars: 3 }, '');
    expect(single?.confirmLabel).toBe('Send 1 item for $3'); // singular noun
    expect(single?.caption).toBe('none');

    const free = deriveComposeSummary(twoItems, { kind: 'free' }, 'caption');
    expect(free?.confirmLabel).toBe('Send 2 items free');
    expect(free?.caption).toBe('visible'); // free send: the caption shows
  });
});

describe('gallery merge + badges', () => {
  it('flattens pages and dedupes overlapping offset pages by messageId', () => {
    const merged = mergeGalleryPages([
      { items: [gallery({ messageId: 'm1' }), gallery({ messageId: 'm2' })] },
      { items: [gallery({ messageId: 'm2', price: 99 }), gallery({ messageId: 'm3' })] },
    ]);
    expect(merged.map((m) => m.messageId)).toEqual(['m1', 'm2', 'm3']);
    expect(merged[1]?.price).toBe(0); // first occurrence wins
  });

  it('badges PPV cells: green once purchased, amber while pending, none when free', () => {
    expect(galleryBadge(gallery({ price: 25, isOpened: true }))).toEqual({
      label: '$25 PURCHASED',
      tone: 'green',
    });
    expect(galleryBadge(gallery({ price: 25, isOpened: false }))).toEqual({
      label: '$25 UNOPENED',
      tone: 'amber',
    });
    expect(galleryBadge(gallery({ price: 25, isOpened: null }))).toEqual({
      label: '$25 UNOPENED',
      tone: 'amber',
    });
    expect(galleryBadge(gallery({ price: 0 }))).toBeNull();
  });
});

describe('chunkRows (virtualized grid rows)', () => {
  it('chunks into fixed-width rows with a ragged tail', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 4)).toEqual([]);
    expect(() => chunkRows([1], 0)).toThrow();
  });
});
