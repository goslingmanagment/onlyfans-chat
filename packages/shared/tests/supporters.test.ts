import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  FAN_SILENCE_HOT_MIN_DAYS,
  FAN_SILENCE_WARM_MIN_DAYS,
  SHELF_COLLAPSED_MIN_COUNT,
  SHELF_PREVIEW_FIRST,
  SHELF_PREVIEW_REST,
  assignSupporterTiers,
  compareBySilence,
  daysSince,
  fanSilenceBucket,
  shelfPresentation,
  sortBySilence,
  splitTierLabel,
} from '../src/supporters/index';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

describe('supporters constants', () => {
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

describe('assignSupporterTiers', () => {
  it('assigns each fan to the first mapped list containing it (shelf priority)', () => {
    const result = assignSupporterTiers({
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
    const result = assignSupporterTiers({
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
    const result = assignSupporterTiers({
      orderedListIds: ['loaded', 'missing'],
      rosterByList: new Map([['loaded', ['1']]]),
      spenderIds: ['1', '2'],
    });
    expect(result.byList.has('missing')).toBe(false);
    expect(result.untiered).toEqual(['2']);
  });

  it('dedupes spender ids and roster ids', () => {
    const result = assignSupporterTiers({
      orderedListIds: ['l'],
      rosterByList: new Map([['l', ['1', '1']]]),
      spenderIds: ['2', '2', '1'],
    });
    expect(result.byList.get('l')).toEqual(['1']);
    expect(result.untiered).toEqual(['2']);
  });

  it('handles empty mapping: every spender is untiered', () => {
    const result = assignSupporterTiers({
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
