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

describe('parsePpvPrice (send v2 exact cents $3–$200)', () => {
  it('treats empty / 0 / free as a free media message', () => {
    expect(parsePpvPrice('')).toEqual({ kind: 'free' });
    expect(parsePpvPrice('  ')).toEqual({ kind: 'free' });
    expect(parsePpvPrice('0')).toEqual({ kind: 'free' });
    expect(parsePpvPrice('FREE')).toEqual({ kind: 'free' });
  });

  it('accepts whole dollars in range (with an optional $ prefix)', () => {
    expect(parsePpvPrice('25')).toEqual({ kind: 'paid', dollars: 25 });
    expect(parsePpvPrice('$25')).toEqual({ kind: 'paid', dollars: 25 });
    expect(parsePpvPrice('6.97')).toEqual({kind:'paid',dollars:6.97});
    expect(parsePpvPrice('0.00')).toEqual({kind:'free'});
    expect(parsePpvPrice(String(PPV_PRICE_MIN))).toEqual({ kind: 'paid', dollars: 3 });
    expect(parsePpvPrice(String(PPV_PRICE_MAX))).toEqual({ kind: 'paid', dollars: 200 });
  });

  it('rejects below-min, above-max, excess decimal places, and junk — with reason descriptors', () => {
    // Reasons are now locale-free descriptors { key, params? } resolved to text
    // at the render site (i18n stage 2) — the $bound stays a NUMBER param.
    expect(parsePpvPrice('2')).toEqual({
      kind: 'invalid',
      reason: { key: 'vault.priceErrMin', params: { min: 3 } },
    });
    expect(parsePpvPrice('201')).toEqual({
      kind: 'invalid',
      reason: { key: 'vault.priceErrMax', params: { max: 200 } },
    });
    expect(parsePpvPrice('9.999')).toEqual({
      kind: 'invalid',
      reason: { key: 'vault.priceErrInteger' },
    });
    expect(parsePpvPrice('-5')).toEqual({
      kind: 'invalid',
      reason: { key: 'vault.priceErrWhole' },
    });
    expect(parsePpvPrice('abc')).toEqual({
      kind: 'invalid',
      reason: { key: 'vault.priceErrWhole' },
    });
    const below = parsePpvPrice('1');
    // below-min carries the $3 bound as the {min} NUMBER param (misprice guard)
    expect(below).toEqual({
      kind: 'invalid',
      reason: { key: 'vault.priceErrMin', params: { min: PPV_PRICE_MIN } },
    });
  });
});

describe('deriveComposeSummary (mandatory misprice guard)', () => {
  const twoItems: VaultSelection = { ids: ['a', 'b'], previews: ['a'] };

  it('is null with no selection or an invalid price — confirm button cannot render', () => {
    expect(deriveComposeSummary(EMPTY_SELECTION, { kind: 'paid', dollars: 25 }, 'hi')).toBeNull();
    expect(deriveComposeSummary(twoItems, parsePpvPrice('2'), 'hi')).toBeNull();
  });

  it('restates the price as a locale-free confirm descriptor', () => {
    // confirmLabel is now { key, itemCount, dollars } — the render site builds
    // the plural {items} fragment + keeps the $dollars NUMBER verbatim.
    const paid = deriveComposeSummary(twoItems, { kind: 'paid', dollars: 25 }, 'caption');
    expect(paid).toEqual({
      itemCount: 2,
      previewCount: 1,
      price: 25,
      caption: 'locked',
      confirmLabel: { key: 'vault.confirmLabelPaid', itemCount: 2, dollars: 25 },
    });

    const single = deriveComposeSummary({ ids: ['a'], previews: [] }, { kind: 'paid', dollars: 3 }, '');
    // itemCount: 1 drives the singular noun at render
    expect(single?.confirmLabel).toEqual({ key: 'vault.confirmLabelPaid', itemCount: 1, dollars: 3 });
    expect(single?.caption).toBe('none');

    const free = deriveComposeSummary(twoItems, { kind: 'free' }, 'caption');
    expect(free?.confirmLabel).toEqual({ key: 'vault.confirmLabelFree', itemCount: 2, dollars: 0 });
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
    // Badge is now a locale-free descriptor { key, tone, price } — the $price
    // NUMBER stays a param, only PURCHASED/UNOPENED localizes at render.
    expect(galleryBadge(gallery({ price: 25, isOpened: true }))).toEqual({
      key: 'vault.badgePurchased',
      tone: 'green',
      price: 25,
    });
    expect(galleryBadge(gallery({ price: 25, isOpened: false }))).toEqual({
      key: 'vault.badgeUnopened',
      tone: 'amber',
      price: 25,
    });
    expect(galleryBadge(gallery({ price: 25, isOpened: null }))).toEqual({
      key: 'vault.badgeUnopened',
      tone: 'amber',
      price: 25,
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
