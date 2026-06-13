import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  FAN_SILENCE_HOT_MIN_DAYS,
  FAN_SILENCE_WARM_MIN_DAYS,
  OFAPI_USD_PER_CREDIT,
  SHELF_COLLAPSED_MIN_COUNT,
  SHELF_PREVIEW_FIRST,
  SHELF_PREVIEW_REST,
  THREAD_FETCH_TTL_MS,
  assignSpenderTiers,
  compareBySilence,
  buildDailySeries,
  countPendingRefresh,
  daysSince,
  enumerateDays,
  isNewSpender,
  isWithinFetchTtl,
  periodDelta,
  fanSilenceBucket,
  refreshCostUsd,
  shelfPresentation,
  sortBySilence,
  splitTierLabel,
  splitUpdateStamp,
} from '../src/spenders/index';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

describe('spenders constants', () => {
  it('pins the owner-decided staleness thresholds (≤7 none · 8–21 warm · >21 hot)', () => {
    expect(FAN_SILENCE_WARM_MIN_DAYS).toBe(8);
    expect(FAN_SILENCE_HOT_MIN_DAYS).toBe(22);
  });
});

describe('daysSince', () => {
  it('floors to whole days', () => {
    expect(daysSince(NOW, NOW)).toBe(0);
    expect(daysSince(NOW - DAY_MS + 1, NOW)).toBe(0);
    expect(daysSince(NOW - DAY_MS, NOW)).toBe(1);
    expect(daysSince(NOW - 36 * DAY_MS - 1, NOW)).toBe(36);
  });

  it('clamps future timestamps (clock skew) to 0', () => {
    expect(daysSince(NOW + 5 * DAY_MS, NOW)).toBe(0);
  });

  it('degrades non-finite inputs to 0 instead of NaN', () => {
    expect(daysSince(Number.NaN, NOW)).toBe(0);
    expect(daysSince(NOW, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('fanSilenceBucket', () => {
  it('maps the exact bucket boundaries', () => {
    expect(fanSilenceBucket(0)).toBe('none');
    expect(fanSilenceBucket(7)).toBe('none');
    expect(fanSilenceBucket(8)).toBe('warm');
    expect(fanSilenceBucket(21)).toBe('warm');
    expect(fanSilenceBucket(22)).toBe('hot');
    expect(fanSilenceBucket(365)).toBe('hot');
  });

  it('unknown silence (no fan message in local history) shows no dot', () => {
    expect(fanSilenceBucket(null)).toBe('none');
  });
});

describe('splitTierLabel', () => {
  it('splits the trailing band token from the title', () => {
    expect(splitTierLabel('🐳 Кит 600+')).toEqual({ title: '🐳 Кит', band: '600+' });
    expect(splitTierLabel('⭐ Топ 350-600')).toEqual({ title: '⭐ Топ', band: '350-600' });
    expect(splitTierLabel('Низкий 25–50')).toEqual({ title: 'Низкий', band: '25–50' });
    expect(splitTierLabel('Прайм $150-$350')).toEqual({ title: 'Прайм', band: '$150-$350' });
  });

  it('strips the trailing OnlyMonster process marker (ОМ/OM, optional underscore)', () => {
    expect(splitTierLabel('Микро 1-25 _ОМ')).toEqual({ title: 'Микро', band: '1-25' });
    expect(splitTierLabel('Базовый 50-150 ОМ')).toEqual({ title: 'Базовый', band: '50-150' });
    expect(splitTierLabel('Микро_ОМ')).toEqual({ title: 'Микро', band: null });
    expect(splitTierLabel('Whales 600+ OM')).toEqual({ title: 'Whales', band: '600+' });
  });

  it('parses the LIVE pilot-account names verbatim (captured 2026-06-13)', () => {
    expect(splitTierLabel('🐳 Кит 600+_OM')).toEqual({ title: '🐳 Кит', band: '600+' });
    expect(splitTierLabel('⭐️ Топ (350-600)_OM')).toEqual({ title: '⭐️ Топ', band: '350-600' });
    expect(splitTierLabel('✅ Прайм (150-350)_OM')).toEqual({ title: '✅ Прайм', band: '150-350' });
    expect(splitTierLabel('3️⃣ Базовый (50-150)_OM')).toEqual({ title: '3️⃣ Базовый', band: '50-150' });
    expect(splitTierLabel('2️⃣ Низкий (25-50)_OM')).toEqual({ title: '2️⃣ Низкий', band: '25-50' });
    expect(splitTierLabel('1️⃣ Микро (1-25)_OM')).toEqual({ title: '1️⃣ Микро', band: '1-25' });
    expect(splitTierLabel('💩 Бомж')).toEqual({ title: '💩 Бомж', band: null });
    expect(splitTierLabel('💛 Потенциал')).toEqual({ title: '💛 Потенциал', band: null });
  });

  it('keeps names without a band intact', () => {
    expect(splitTierLabel('✅ Прайм')).toEqual({ title: '✅ Прайм', band: null });
    expect(splitTierLabel('VIP guests')).toEqual({ title: 'VIP guests', band: null });
  });

  it('never returns an empty title (band-only or marker-only names survive)', () => {
    expect(splitTierLabel('600+')).toEqual({ title: '600+', band: null });
    expect(splitTierLabel('ОМ')).toEqual({ title: 'ОМ', band: null });
  });

  it('does not mistake a name ending in digits for a band', () => {
    expect(splitTierLabel('Top 100')).toEqual({ title: 'Top 100', band: null });
  });
});

describe('assignSpenderTiers', () => {
  it('assigns each fan to the first mapped list containing it (shelf priority)', () => {
    const result = assignSpenderTiers({
      orderedListIds: ['whale', 'top'],
      rosterByList: new Map([
        ['whale', ['1', '2']],
        ['top', ['2', '3']],
      ]),
      spenderIds: ['1', '2', '3', '4'],
    });
    expect(result.byList.get('whale')).toEqual(['1', '2']);
    expect(result.byList.get('top')).toEqual(['3']);
    expect(result.untiered).toEqual(['4']);
  });

  it('keeps mapping order for shelves and roster order within a shelf', () => {
    const result = assignSpenderTiers({
      orderedListIds: ['b', 'a'],
      rosterByList: new Map([
        ['a', ['10', '11']],
        ['b', ['12', '10']],
      ]),
      spenderIds: [],
    });
    expect([...result.byList.keys()]).toEqual(['b', 'a']);
    expect(result.byList.get('b')).toEqual(['12', '10']);
    expect(result.byList.get('a')).toEqual(['11']);
  });

  it('skips mapped lists whose roster is not loaded', () => {
    const result = assignSpenderTiers({
      orderedListIds: ['loaded', 'missing'],
      rosterByList: new Map([['loaded', ['1']]]),
      spenderIds: ['1', '2'],
    });
    expect(result.byList.has('missing')).toBe(false);
    expect(result.untiered).toEqual(['2']);
  });

  it('dedupes spender ids and roster ids', () => {
    const result = assignSpenderTiers({
      orderedListIds: ['l'],
      rosterByList: new Map([['l', ['1', '1']]]),
      spenderIds: ['2', '2', '1'],
    });
    expect(result.byList.get('l')).toEqual(['1']);
    expect(result.untiered).toEqual(['2']);
  });

  it('handles empty mapping: every spender is untiered', () => {
    const result = assignSpenderTiers({
      orderedListIds: [],
      rosterByList: new Map(),
      spenderIds: ['5', '6'],
    });
    expect(result.byList.size).toBe(0);
    expect(result.untiered).toEqual(['5', '6']);
  });
});

describe('compareBySilence / sortBySilence', () => {
  const row = (fanId: string, fanSilenceDays: number | null, lifetimeSpend: number | null) => ({
    fanId,
    fanSilenceDays,
    lifetimeSpend,
  });

  it('orders by fan silence descending (most neglected first)', () => {
    const sorted = sortBySilence([row('a', 9, 100), row('b', 36, 100), row('c', 21, 100)]);
    expect(sorted.map((r) => r.fanId)).toEqual(['b', 'c', 'a']);
  });

  it('sinks unknown silence to the end', () => {
    const sorted = sortBySilence([row('a', null, 9000), row('b', 1, 5)]);
    expect(sorted.map((r) => r.fanId)).toEqual(['b', 'a']);
  });

  it('breaks silence ties by lifetime spend, then by id', () => {
    const sorted = sortBySilence([row('z', 10, 50), row('a', 10, 900), row('m', 10, 50)]);
    expect(sorted.map((r) => r.fanId)).toEqual(['a', 'm', 'z']);
  });

  it('treats null lifetime as 0 in tiebreaks', () => {
    expect(compareBySilence(row('a', 5, null), row('b', 5, 1))).toBeGreaterThan(0);
  });
});

describe('shelfPresentation', () => {
  it('collapses shelves above the threshold (mockup: Базовый 62 / Низкий 73 / Микро 203)', () => {
    expect(shelfPresentation(3, 62)).toEqual({ kind: 'collapsed' });
    expect(shelfPresentation(0, SHELF_COLLAPSED_MIN_COUNT + 1)).toEqual({ kind: 'collapsed' });
  });

  it('previews 4 rows on the first shelf and 2 on later shelves (mockup: Кит 4 · Топ 2 · Прайм 2)', () => {
    expect(shelfPresentation(0, 8)).toEqual({ kind: 'preview', previewCount: SHELF_PREVIEW_FIRST });
    expect(shelfPresentation(1, 11)).toEqual({ kind: 'preview', previewCount: SHELF_PREVIEW_REST });
    expect(shelfPresentation(2, 24)).toEqual({ kind: 'preview', previewCount: SHELF_PREVIEW_REST });
    expect(shelfPresentation(2, SHELF_COLLAPSED_MIN_COUNT)).toEqual({
      kind: 'preview',
      previewCount: SHELF_PREVIEW_REST,
    });
  });
});

describe('stats: enumerateDays', () => {
  it('returns ascending consecutive days ending at endDay', () => {
    expect(enumerateDays('2026-06-13', 3)).toEqual(['2026-06-11', '2026-06-12', '2026-06-13']);
  });

  it('crosses month boundaries', () => {
    expect(enumerateDays('2026-06-01', 2)).toEqual(['2026-05-31', '2026-06-01']);
  });

  it('crosses year boundaries', () => {
    expect(enumerateDays('2026-01-01', 2)).toEqual(['2025-12-31', '2026-01-01']);
  });

  it('handles leap days', () => {
    expect(enumerateDays('2028-03-01', 2)).toEqual(['2028-02-29', '2028-03-01']);
  });

  it('single day window is just endDay', () => {
    expect(enumerateDays('2026-06-13', 1)).toEqual(['2026-06-13']);
  });

  it('rejects non-day strings', () => {
    expect(() => enumerateDays('13.06.2026', 3)).toThrow(/YYYY-MM-DD/);
    expect(() => enumerateDays('2026-06-13T00:00:00Z', 3)).toThrow(/YYYY-MM-DD/);
  });
});

describe('stats: buildDailySeries', () => {
  it('fills missing days with zero, keeps order dense and ascending', () => {
    const series = buildDailySeries(
      [
        { day: '2026-06-13', amount: 49 },
        { day: '2026-06-11', amount: 12 },
      ],
      '2026-06-13',
      4,
    );
    expect(series).toEqual([
      { day: '2026-06-10', amount: 0 },
      { day: '2026-06-11', amount: 12 },
      { day: '2026-06-12', amount: 0 },
      { day: '2026-06-13', amount: 49 },
    ]);
  });

  it('drops rows outside the window (retention overlap)', () => {
    const series = buildDailySeries(
      [
        { day: '2026-05-01', amount: 999 },
        { day: '2026-06-13', amount: 5 },
      ],
      '2026-06-13',
      2,
    );
    expect(series).toEqual([
      { day: '2026-06-12', amount: 0 },
      { day: '2026-06-13', amount: 5 },
    ]);
  });

  it('sums duplicate day rows', () => {
    const series = buildDailySeries(
      [
        { day: '2026-06-13', amount: 5 },
        { day: '2026-06-13', amount: 7 },
      ],
      '2026-06-13',
      1,
    );
    expect(series).toEqual([{ day: '2026-06-13', amount: 12 }]);
  });

  it('empty input yields an all-zero window', () => {
    const series = buildDailySeries([], '2026-06-13', 3);
    expect(series.every((point) => point.amount === 0)).toBe(true);
    expect(series).toHaveLength(3);
  });
});

describe('stats: periodDelta', () => {
  const day = (i: number, amount: number): { day: string; amount: number } => ({
    day: enumerateDays('2026-06-13', 14)[i] ?? '2026-06-13',
    amount,
  });

  it('compares the last window to the one before it', () => {
    const series = Array.from({ length: 14 }, (_, i) => day(i, i < 7 ? 10 : 20));
    expect(periodDelta(series, 7)).toEqual({ current: 140, previous: 70, pct: 100 });
  });

  it('pct is null when the prior window is zero', () => {
    const series = Array.from({ length: 14 }, (_, i) => day(i, i < 7 ? 0 : 20));
    expect(periodDelta(series, 7)).toEqual({ current: 140, previous: 0, pct: null });
  });

  it('rounds pct to whole percent and supports drops', () => {
    const series = Array.from({ length: 14 }, (_, i) => day(i, i < 7 ? 30 : 20));
    expect(periodDelta(series, 7)).toEqual({ current: 140, previous: 210, pct: -33 });
  });

  it('short series treats missing prior days as empty', () => {
    const series = Array.from({ length: 7 }, (_, i) => day(i, 10));
    expect(periodDelta(series, 7)).toEqual({ current: 70, previous: 0, pct: null });
  });
});

describe('stats: isNewSpender', () => {
  it('true when lifetime equals the window spend (first purchases in window)', () => {
    expect(isNewSpender(120, 120)).toBe(true);
  });

  it('true within the epsilon dollar (rounding between sources)', () => {
    expect(isNewSpender(120.9, 120)).toBe(true);
  });

  it('false when lifetime exceeds the window by a dollar or more', () => {
    expect(isNewSpender(121, 120)).toBe(false);
    expect(isNewSpender(2756, 79)).toBe(false);
  });

  it('false with no window spend or unknown lifetime', () => {
    expect(isNewSpender(0, 0)).toBe(false);
    expect(isNewSpender(null, 50)).toBe(false);
  });
});

// ─── Data freshness (PLAN item 13) ─────────────────────────────────────────

describe('freshness: constants', () => {
  it('pins the 5-min per-fan fetch TTL (the spend ceiling of hydrate + refresh)', () => {
    expect(THREAD_FETCH_TTL_MS).toBe(5 * 60_000);
  });

  it('pins the Basic-plan credit price ($69 / 20k — «Все 104 ≈ $0.35»)', () => {
    expect(OFAPI_USD_PER_CREDIT).toBeCloseTo(0.00345, 5);
    expect(refreshCostUsd(104)).toBeCloseTo(0.3588, 3);
  });
});

describe('freshness: refreshCostUsd', () => {
  it('zero and negative and non-finite credits cost nothing', () => {
    expect(refreshCostUsd(0)).toBe(0);
    expect(refreshCostUsd(-5)).toBe(0);
    expect(refreshCostUsd(Number.NaN)).toBe(0);
  });

  it('scales linearly (1 credit = 1 fan)', () => {
    expect(refreshCostUsd(3)).toBeCloseTo(3 * OFAPI_USD_PER_CREDIT, 10);
  });
});

describe('freshness: countPendingRefresh / isWithinFetchTtl', () => {
  const now = NOW;

  it('null stamps (never fetched) are pending', () => {
    expect(countPendingRefresh([null, null], now)).toBe(2);
  });

  it('a stamp inside the TTL is skipped, at/over the boundary is pending', () => {
    const fresh = now - THREAD_FETCH_TTL_MS + 1;
    const boundary = now - THREAD_FETCH_TTL_MS;
    const stale = now - THREAD_FETCH_TTL_MS - 1;
    expect(countPendingRefresh([fresh], now)).toBe(0);
    expect(countPendingRefresh([boundary], now)).toBe(1);
    expect(countPendingRefresh([stale], now)).toBe(1);
    expect(isWithinFetchTtl(fresh, now)).toBe(true);
    expect(isWithinFetchTtl(boundary, now)).toBe(false);
    expect(isWithinFetchTtl(null, now)).toBe(false);
  });

  it('mixed list counts only the stale + missing', () => {
    expect(countPendingRefresh([now - 1, null, now - THREAD_FETCH_TTL_MS * 2], now)).toBe(2);
  });

  it('empty scope has nothing pending', () => {
    expect(countPendingRefresh([], now)).toBe(0);
  });

  it('non-finite stamps are treated as never fetched (defensive)', () => {
    expect(countPendingRefresh([Number.NaN], now)).toBe(1);
    expect(isWithinFetchTtl(Number.NaN, now)).toBe(false);
  });

  it('respects a custom TTL', () => {
    expect(countPendingRefresh([now - 2_000], now, 1_000)).toBe(1);
    expect(countPendingRefresh([now - 500], now, 1_000)).toBe(0);
  });
});

describe('freshness: splitUpdateStamp (local calendar days)', () => {
  // Construct times from LOCAL components so assertions hold in any timezone
  // (the function deliberately works in the user's local calendar, matching
  // the stats panel's local-day convention).
  const local = (y: number, mo: number, d: number, h: number, mi: number): number =>
    new Date(y, mo - 1, d, h, mi).getTime();

  it('same local day → today + HH:MM', () => {
    expect(splitUpdateStamp(local(2026, 6, 13, 9, 5), local(2026, 6, 13, 23, 59))).toEqual({
      kind: 'today',
      time: '09:05',
    });
  });

  it('previous local day → yesterday, even across a few minutes after midnight', () => {
    expect(splitUpdateStamp(local(2026, 6, 12, 18, 40), local(2026, 6, 13, 0, 5))).toEqual({
      kind: 'yesterday',
      time: '18:40',
    });
  });

  it('two days back and older → DD.MM date', () => {
    expect(splitUpdateStamp(local(2026, 6, 11, 7, 0), local(2026, 6, 13, 12, 0))).toEqual({
      kind: 'date',
      date: '11.06',
      time: '07:00',
    });
    expect(splitUpdateStamp(local(2025, 12, 31, 23, 59), local(2026, 6, 13, 12, 0))).toEqual({
      kind: 'date',
      date: '31.12',
      time: '23:59',
    });
  });

  it('month boundary: last day of May vs June 1 is yesterday', () => {
    expect(splitUpdateStamp(local(2026, 5, 31, 22, 0), local(2026, 6, 1, 8, 0))).toEqual({
      kind: 'yesterday',
      time: '22:00',
    });
  });

  it('pads hours and minutes to two digits', () => {
    expect(splitUpdateStamp(local(2026, 6, 13, 0, 0), local(2026, 6, 13, 1, 0))).toEqual({
      kind: 'today',
      time: '00:00',
    });
  });
});
