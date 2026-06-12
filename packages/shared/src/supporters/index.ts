// Supporters board domain logic (PLAN item 12; binding mockup
// docs/mockups/supporters.html). Pure functions only — the board's day
// counters, staleness bucketing, tier (OnlyMonster user-list) mapping and
// in-shelf ordering are all decided here so they can be densely unit-tested.
//
// Metric definitions (owner decisions 2026-06-13):
// - Day counters «МОДЕЛЬ N Д · ФАН M Д» come from the LOCAL message DB
//   (vendor lastReplyAt is null — never used). Any non-deleted message counts
//   as activity for its sender (tips included: a tip message is fan contact).
// - The staleness dot is keyed to FAN silence and burns until the fan replies,
//   even after a ping: an unanswered ping reads as a warm/hot dot next to a
//   fresh МОДЕЛЬ counter.

export const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Staleness buckets (fan silence) ──────────────────────────────────────
// ≤7 d — nothing · 8–21 d amber «остывает» · >21 d clay-deep «запущен».

export const FAN_SILENCE_WARM_MIN_DAYS = 8;
export const FAN_SILENCE_HOT_MIN_DAYS = 22;

export type FanSilenceBucket = 'none' | 'warm' | 'hot';

/** Whole days elapsed (floor); never negative (clock skew clamps to 0). */
export function daysSince(tsMs: number, nowMs: number): number {
  if (!Number.isFinite(tsMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - tsMs) / DAY_MS));
}

/**
 * null = no fan message in local history (unknown silence) → no dot: an
 * unhydrated thread must not read as «запущен».
 */
export function fanSilenceBucket(fanSilenceDays: number | null): FanSilenceBucket {
  if (fanSilenceDays === null) return 'none';
  if (fanSilenceDays >= FAN_SILENCE_HOT_MIN_DAYS) return 'hot';
  if (fanSilenceDays >= FAN_SILENCE_WARM_MIN_DAYS) return 'warm';
  return 'none';
}

// ─── Tier label split ─────────────────────────────────────────────────────
// OnlyMonster tier-list names, live-verified 2026-06-13 on the pilot account:
// «🐳 Кит 600+_OM», «⭐️ Топ (350-600)_OM», «✅ Прайм (150-350)_OM»,
// «1️⃣ Микро (1-25)_OM» — band bare or parenthesized, latin or cyrillic
// OM/ОМ marker glued with an underscore. The board renders title and spend
// band separately (mockup .tname/.tband); the marker is process noise.

export interface TierLabel {
  title: string;
  /** Spend band token («600+», «350–600») when the list name carries one. */
  band: string | null;
}

const OM_MARKER_RE = /[\s_·-]*(?:_)?(?:ОМ|OM)$/iu;
// "600+" | "$600+" | "350-600" (-, –, —) | "$350-$600"
const BAND_CORE = String.raw`\$?\d[\d\s,.]*(?:\+|\s*[-–—]\s*\$?\d[\d\s,.]*)`;
const BAND_RE = new RegExp(`(?:^|\\s)(${BAND_CORE})$`, 'u');
// "(350-600)" — the live OM convention parenthesizes ranged bands.
const BAND_PARENS_RE = new RegExp(`(?:^|\\s)\\((${BAND_CORE})\\)$`, 'u');

export function splitTierLabel(rawName: string): TierLabel {
  const withoutMarker = rawName.replace(OM_MARKER_RE, '').trim();
  const name = withoutMarker.length > 0 ? withoutMarker : rawName.trim();
  for (const re of [BAND_PARENS_RE, BAND_RE]) {
    const match = re.exec(name);
    if (match?.[1] !== undefined) {
      const title = name.slice(0, match.index).trim();
      if (title.length > 0) {
        return { title, band: match[1].trim() };
      }
    }
  }
  return { title: name, band: null };
}

// ─── Tier assignment ──────────────────────────────────────────────────────
// Mapping is an OWNER-ordered array of OM list ids (one-time manual setting
// per account). A fan in several mapped lists lands on the first (highest)
// shelf; spenders outside every mapped roster form the «Без тира» section.

export interface TierAssignment {
  /** listId → fan ids on that shelf (mapping order preserved, dupes resolved). */
  byList: Map<string, string[]>;
  /** Spenders present in no mapped roster («Без тира»). */
  untiered: string[];
}

export function assignSupporterTiers(args: {
  /** Owner-ordered mapped list ids (shelf order). */
  orderedListIds: readonly string[];
  /** Loaded rosters: listId → fan ids (raw OF numeric ids as strings). */
  rosterByList: ReadonlyMap<string, readonly string[]>;
  /** All spenders on the account (lifetime > 0), any order. */
  spenderIds: readonly string[];
}): TierAssignment {
  const byList = new Map<string, string[]>();
  const claimed = new Set<string>();
  for (const listId of args.orderedListIds) {
    const roster = args.rosterByList.get(listId);
    if (roster === undefined) continue;
    const shelf: string[] = [];
    for (const fanId of roster) {
      if (claimed.has(fanId)) continue;
      claimed.add(fanId);
      shelf.push(fanId);
    }
    byList.set(listId, shelf);
  }
  const untiered: string[] = [];
  const seenSpenders = new Set<string>();
  for (const fanId of args.spenderIds) {
    if (claimed.has(fanId) || seenSpenders.has(fanId)) continue;
    seenSpenders.add(fanId);
    untiered.push(fanId);
  }
  return { byList, untiered };
}

// ─── In-shelf ordering ────────────────────────────────────────────────────
// «Внутри полки — по молчанию фана ↓»: longest fan silence first. Fans with
// no fan message in local history (unknown silence) sink to the end; ties
// break by lifetime spend (highest first), then by id for determinism.

export interface SilenceSortable {
  fanId: string;
  fanSilenceDays: number | null;
  lifetimeSpend: number | null;
}

export function compareBySilence(a: SilenceSortable, b: SilenceSortable): number {
  if (a.fanSilenceDays !== b.fanSilenceDays) {
    if (a.fanSilenceDays === null) return 1;
    if (b.fanSilenceDays === null) return -1;
    return b.fanSilenceDays - a.fanSilenceDays;
  }
  const aSpend = a.lifetimeSpend ?? 0;
  const bSpend = b.lifetimeSpend ?? 0;
  if (aSpend !== bSpend) return bSpend - aSpend;
  return a.fanId < b.fanId ? -1 : a.fanId > b.fanId ? 1 : 0;
}

export function sortBySilence<T extends SilenceSortable>(rows: readonly T[]): T[] {
  return [...rows].sort(compareBySilence);
}

// ─── «Все» view shelf presentation ────────────────────────────────────────
// Mockup: the top shelf previews its 4 most-silent fans, later shelves 2;
// shelves above the collapse threshold start as one-line collapsed rows.

export const SHELF_COLLAPSED_MIN_COUNT = 50;
export const SHELF_PREVIEW_FIRST = 4;
export const SHELF_PREVIEW_REST = 2;

export type ShelfPresentation =
  | { kind: 'preview'; previewCount: number }
  | { kind: 'collapsed' };

export function shelfPresentation(shelfIndex: number, usersCount: number): ShelfPresentation {
  if (usersCount > SHELF_COLLAPSED_MIN_COUNT) return { kind: 'collapsed' };
  return {
    kind: 'preview',
    previewCount: shelfIndex === 0 ? SHELF_PREVIEW_FIRST : SHELF_PREVIEW_REST,
  };
}
