// Pure vault/PPV compose logic (PRD F7) — no DOM, no store, no IPC (tested in
// tests/vault/vault-logic.test.ts). Owns the multi-select ordering, the
// previews ⊆ selection invariant, price parsing/validation (mirrors the main
// engine's pre-enqueue bounds — the renderer guard is UX, main is the law),
// the mandatory PPV compose summary, and the gallery page merge.

import type { GalleryItemVM } from '../../../../preload/contract';

// openapi send-message: price is 0 or an integer between 3–200 (whole dollars).
export const PPV_PRICE_MIN = 3;
export const PPV_PRICE_MAX = 200;

// ─── Selection (ordered multi-select + preview subset) ───────────────────

export interface VaultSelection {
  /** Attach order — badge numbers 1..N follow this array. */
  ids: readonly string[];
  /** Free-preview subset; INVARIANT: every entry is also in ids. */
  previews: readonly string[];
}

export const EMPTY_SELECTION: VaultSelection = { ids: [], previews: [] };

/** Click on a thumb: append to the order, or remove (and drop its preview flag). */
export function toggleSelect(selection: VaultSelection, id: string): VaultSelection {
  if (selection.ids.includes(id)) {
    return {
      ids: selection.ids.filter((existing) => existing !== id),
      previews: selection.previews.filter((existing) => existing !== id),
    };
  }
  return { ids: [...selection.ids, id], previews: selection.previews };
}

/** Preview toggle is only meaningful on selected items (subset invariant). */
export function togglePreview(selection: VaultSelection, id: string): VaultSelection {
  if (!selection.ids.includes(id)) {
    return selection;
  }
  return {
    ids: selection.ids,
    previews: selection.previews.includes(id)
      ? selection.previews.filter((existing) => existing !== id)
      : [...selection.previews, id],
  };
}

/** 1-based order badge for a selected id; null when not selected. */
export function selectionOrder(selection: VaultSelection, id: string): number | null {
  const index = selection.ids.indexOf(id);
  return index === -1 ? null : index + 1;
}

// ─── Price input ──────────────────────────────────────────────────────────

/**
 * Locale-free reason descriptor: a catalog key + its interpolation params.
 * The $dollar bound stays a NUMBER param (misprice guard) — only the
 * surrounding words localize, at the render site via t(key, params).
 */
export interface PriceReason {
  key: 'vault.priceErrWhole' | 'vault.priceErrInteger' | 'vault.priceErrMin' | 'vault.priceErrMax';
  params?: { min?: number; max?: number };
}

export type PpvPrice =
  | { kind: 'free' }
  | { kind: 'paid'; dollars: number }
  | { kind: 'invalid'; reason: PriceReason };

/**
 * '' / '0' / 'free' ⇒ free media message; otherwise whole dollars 3–200.
 * Mirrors the engine's isValidPpvPrice — anything invalid never reaches IPC.
 */
export function parsePpvPrice(input: string): PpvPrice {
  const trimmed = input.trim().replace(/^\$/, '');
  if (trimmed === '' || trimmed === '0' || trimmed.toLowerCase() === 'free') {
    return { kind: 'free' };
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { kind: 'invalid', reason: { key: 'vault.priceErrWhole' } };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value)) {
    return { kind: 'invalid', reason: { key: 'vault.priceErrInteger' } };
  }
  if (value < PPV_PRICE_MIN) {
    return { kind: 'invalid', reason: { key: 'vault.priceErrMin', params: { min: PPV_PRICE_MIN } } };
  }
  if (value > PPV_PRICE_MAX) {
    return { kind: 'invalid', reason: { key: 'vault.priceErrMax', params: { max: PPV_PRICE_MAX } } };
  }
  return { kind: 'paid', dollars: value };
}

// ─── Compose summary (mandatory misprice guard, PRD F7) ──────────────────

/**
 * Locale-free confirm descriptor — a catalog key + the values the render site
 * interpolates. itemCount drives the plural noun ({items} fragment) and the
 * $dollars NUMBER stays verbatim (misprice guard); only the words localize.
 */
export interface ConfirmLabel {
  key: 'vault.confirmLabelPaid' | 'vault.confirmLabelFree';
  itemCount: number;
  dollars: number;
}

export interface ComposeSummary {
  itemCount: number;
  previewCount: number;
  /** Dollars; 0 = free. */
  price: number;
  /** Caption state: 'locked' (priced), 'visible' (free send), 'none' (empty draft). */
  caption: 'locked' | 'visible' | 'none';
  /** The explicit-confirm button descriptor — price restated in words at render. */
  confirmLabel: ConfirmLabel;
}

/**
 * Null ⇒ nothing sendable yet (no selection, or the price input is invalid) —
 * the confirm button must not render without a complete, truthful summary.
 */
export function deriveComposeSummary(
  selection: VaultSelection,
  price: PpvPrice,
  draft: string,
): ComposeSummary | null {
  if (selection.ids.length === 0 || price.kind === 'invalid') {
    return null;
  }
  const itemCount = selection.ids.length;
  const dollars = price.kind === 'paid' ? price.dollars : 0;
  return {
    itemCount,
    previewCount: selection.previews.length,
    price: dollars,
    caption: draft.trim() === '' ? 'none' : dollars > 0 ? 'locked' : 'visible',
    confirmLabel:
      dollars > 0
        ? { key: 'vault.confirmLabelPaid', itemCount, dollars }
        : { key: 'vault.confirmLabelFree', itemCount, dollars: 0 },
  };
}

// ─── Gallery merge ────────────────────────────────────────────────────────

/** Flatten offset pages into one list, deduped by messageId (first wins —
 *  offset paging can overlap when new media arrives between fetches). */
export function mergeGalleryPages(
  pages: readonly { items: readonly GalleryItemVM[] }[],
): GalleryItemVM[] {
  const seen = new Set<string>();
  const out: GalleryItemVM[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.messageId)) continue;
      seen.add(item.messageId);
      out.push(item);
    }
  }
  return out;
}

/** PPV badge for a gallery cell (DESIGN §4: money green = purchased, pending
 *  money amber = unopened). Null for free media. Locale-free descriptor: the
 *  $price NUMBER is a param, only the word localizes — rendered via t(key, …). */
export interface GalleryBadge {
  key: 'vault.badgePurchased' | 'vault.badgeUnopened';
  tone: 'green' | 'amber';
  price: number;
}

export function galleryBadge(
  item: Pick<GalleryItemVM, 'price' | 'isOpened'>,
): GalleryBadge | null {
  if (item.price <= 0) return null;
  return item.isOpened === true
    ? { key: 'vault.badgePurchased', tone: 'green', price: item.price }
    : { key: 'vault.badgeUnopened', tone: 'amber', price: item.price };
}

/** Rows of `columns` cells for the virtualized grids. */
export function chunkRows<T>(items: readonly T[], columns: number): T[][] {
  if (columns < 1) throw new Error('chunkRows: columns must be >= 1');
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}
