// Spenders board domain logic (PLAN item 12; binding mockup
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

export function assignSpenderTiers(args: {
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

// ─── Stats panel series math (page follow-up, owner direction 2026-06-13) ──
// Pure day-string arithmetic: the caller (Electron main) resolves "today" in
// the user's local timezone and passes YYYY-MM-DD strings; nothing here reads
// the clock. The local transaction store retains 31 days (SPEND_RETENTION_MS),
// so 30 days is the longest honest window and periods compare 7-to-7.

export interface DailyRevenuePoint {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  amount: number;
}

/** The `count` consecutive local days ending at `endDay` inclusive, ascending. */
export function enumerateDays(endDay: string, count: number): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDay);
  if (match === null) throw new Error(`enumerateDays: not a YYYY-MM-DD day: ${endDay}`);
  const endUtcMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const days: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(endUtcMs - back * DAY_MS);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

/** Dense ascending series over the window; missing days fill with 0, rows
 *  outside the window are dropped (retention overlap), duplicates sum. */
export function buildDailySeries(
  rows: ReadonlyArray<DailyRevenuePoint>,
  endDay: string,
  count: number,
): DailyRevenuePoint[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.amount);
  }
  return enumerateDays(endDay, count).map((day) => ({ day, amount: byDay.get(day) ?? 0 }));
}

export interface PeriodDelta {
  current: number;
  previous: number;
  /** Percent change vs the prior window; null when the prior window is 0
   *  (a percentage of nothing reads as noise, the UI hides it). */
  pct: number | null;
}

/** Last `window` days vs the `window` before them (series is ascending). */
export function periodDelta(series: readonly DailyRevenuePoint[], window: number): PeriodDelta {
  const current = series.slice(-window).reduce((sum, point) => sum + point.amount, 0);
  const previous = series.slice(-window * 2, -window).reduce((sum, point) => sum + point.amount, 0);
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return { current, previous, pct };
}

/** A fan whose lifetime total is (within a dollar of) their 30-day spend made
 *  their first purchase inside the window — lifetime older than the local
 *  transaction retention is exactly what the OFAPI fans payload carries, so
 *  the comparison is honest. Unknown lifetime can't prove "new" → false. */
export const NEW_SPENDER_EPSILON_USD = 1;

export function isNewSpender(lifetimeSpend: number | null, windowSpend: number): boolean {
  if (windowSpend <= 0) return false;
  if (lifetimeSpend === null) return false;
  return lifetimeSpend - windowSpend < NEW_SPENDER_EPSILON_USD;
}

// ─── Data freshness (PLAN item 13; binding experiment page ────────────────
// mockups/experiments/spenders-freshness.html). The board's counters/previews
// drift while the app is closed; freshness is owner-controlled: a scoped
// refresh button (cost visible BEFORE the click) + one per-scope «последний
// апдейт» line. Internally every thread-fetch path stamps a per-fan
// fetched-at; the TTL below is the spend ceiling shared by the quick-look
// hydrate and the refresh queue (per-fan stamps are never rendered).

/** One per-fan tail fetch at most this often — quick-look hydrate AND the
 *  scoped refresh queue both skip fans fetched within the window. */
export const THREAD_FETCH_TTL_MS = 5 * 60_000;

/** OFAPI Basic plan: $69 / 20,000 credits (research doc §credits). The board
 *  prices a refresh at 1 credit = 1 fan; this turns credits into the ≈$ hint. */
export const OFAPI_USD_PER_CREDIT = 69 / 20_000;

export function refreshCostUsd(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return credits * OFAPI_USD_PER_CREDIT;
}

/** Fans whose thread would actually be fetched by a refresh right now: stamp
 *  missing or older than the TTL (the button's «~» honesty — the printed scope
 *  count is the ceiling, TTL skips only make it cheaper). */
export function countPendingRefresh(
  stampsMs: ReadonlyArray<number | null>,
  nowMs: number,
  ttlMs: number = THREAD_FETCH_TTL_MS,
): number {
  let pending = 0;
  for (const stamp of stampsMs) {
    if (stamp === null || !Number.isFinite(stamp) || nowMs - stamp >= ttlMs) pending += 1;
  }
  return pending;
}

export function isWithinFetchTtl(
  stampMs: number | null,
  nowMs: number,
  ttlMs: number = THREAD_FETCH_TTL_MS,
): boolean {
  return stampMs !== null && Number.isFinite(stampMs) && nowMs - stampMs < ttlMs;
}

/** «последний апдейт — вчера 18:40»: day word vs explicit date, decided in the
 *  user's LOCAL calendar (same convention as the stats panel's local days).
 *  The renderer supplies the localized «сегодня»/«вчера» words. */
export type UpdateStampParts =
  | { kind: 'today'; time: string }
  | { kind: 'yesterday'; time: string }
  | { kind: 'date'; date: string; time: string };

function two(n: number): string {
  return String(n).padStart(2, '0');
}

export function splitUpdateStamp(stampMs: number, nowMs: number): UpdateStampParts {
  const stamp = new Date(stampMs);
  const now = new Date(nowMs);
  const time = `${two(stamp.getHours())}:${two(stamp.getMinutes())}`;
  const stampDay = new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysApart = Math.round((nowDay.getTime() - stampDay.getTime()) / DAY_MS);
  if (daysApart === 0) return { kind: 'today', time };
  if (daysApart === 1) return { kind: 'yesterday', time };
  return { kind: 'date', date: `${two(stamp.getDate())}.${two(stamp.getMonth() + 1)}`, time };
}
