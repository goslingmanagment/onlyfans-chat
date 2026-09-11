import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@chatgoose/shared/i18n/index';
import type { SpenderRowVM } from '../../src/preload/contract';
import { buildAllView, buildFlatView, type ShelfData } from '../../src/renderer/src/features/spenders/boardModel';
import { formatContactAge, sortRowsByContact } from '../../src/renderer/src/features/spenders/contactAge';
import { createBoardStore, previewRow } from '../../src/renderer/src/features/spenders/spendersStore';
import { EMPTY_BOARD_FILTERS, filterBoardRows, validBoardChip } from '../../src/renderer/src/features/spenders/boardFilters';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const HOUR = 3_600_000;
const ago = (hours: number): string => new Date(NOW - hours * HOUR).toISOString();
const ru = makeTranslator('ru');
const en = makeTranslator('en');

function row(id: string, modelHours: number | null, fanHours: number | null, spend = 100): SpenderRowVM {
  return {
    fanId: id, name: id, username: null, avatarUrl: null,
    lifetimeSpend: spend, spend30d: null, lastMessagePreview: 'hello',
    lastMessageIsSentByMe: modelHours !== null && (fanHours === null || modelHours < fanHours),
    fanWaiting: false, silence: 'none', hasChat: true,
    canSendMessage: true, canNotSendReason: null,
    lastModelMessageAt: modelHours === null ? null : ago(modelHours),
    lastFanMessageAt: fanHours === null ? null : ago(fanHours),
    modelDays: modelHours === null ? null : Math.floor(modelHours / 24),
    fanDays: fanHours === null ? null : Math.floor(fanHours / 24),
  };
}

describe('contact age', () => {
  it('keeps unknown and invalid dates distinct from a recent message', () => {
    expect(formatContactAge(null, NOW, ru)).toBe('—');
    expect(formatContactAge('not-a-date', NOW, ru)).toBe('—');
    expect(formatContactAge(ago(1), Number.NaN, ru)).toBe('—');
  });

  it('uses elapsed minutes, hours and days at their exact boundaries', () => {
    expect(formatContactAge(ago(0), NOW, ru)).toBe('сейчас');
    expect(formatContactAge(new Date(NOW - 59_999).toISOString(), NOW, ru)).toBe('сейчас');
    expect(formatContactAge(ago(1 / 60), NOW, ru)).toBe('1 мин');
    expect(formatContactAge(ago(59 / 60), NOW, ru)).toBe('59 мин');
    expect(formatContactAge(ago(1), NOW, ru)).toBe('1 ч');
    expect(formatContactAge(ago(23.99), NOW, ru)).toBe('23 ч');
    expect(formatContactAge(ago(24), NOW, ru)).toBe('1 д');
    expect(formatContactAge(ago(36 * 24), NOW, ru)).toBe('36 д');
  });

  it('localizes units and clamps a future timestamp caused by clock skew', () => {
    expect(formatContactAge(ago(5), NOW, en)).toBe('5 h');
    expect(formatContactAge(ago(72), NOW, en)).toBe('3 d');
    expect(formatContactAge(ago(-1), NOW, en)).toBe('now');
  });

  it('does not turn a message just before midnight into a whole day', () => {
    expect(formatContactAge('2026-09-10T23:59:00Z', Date.parse('2026-09-11T00:01:00Z'), en)).toBe('2 min');
  });
});

describe('local spender search and filters', () => {
  const noHistory = { ...row('900', null, null), lastMessagePreview: '' };
  const shelf = (id: string, rows: SpenderRowVM[] | undefined, count = rows?.length ?? 5): ShelfData => ({
    list: { id, name: id, usersCount: count, custom: true }, rows, truncated: false,
  });

  it('searches name, username and numeric id without changing cached rows', () => {
    const input = [{ ...row('11223', 1, 2), name: 'Марк', username: 'marcus_k' }, row('other', 2, 3)];
    for (const query of [' МАРК ', 'MARCUS', '122']) {
      expect(filterBoardRows(input, { ...EMPTY_BOARD_FILTERS, query }).map(r => r.fanId)).toEqual(['11223']);
    }
    expect(filterBoardRows(input, { ...EMPTY_BOARD_FILTERS, query: '   ' })).toEqual(input);
    expect(input).toHaveLength(2);
  });

  it('does not classify an unknown history as a fan message from the default false flag', () => {
    const input = [row('us', 1, 2), row('fan', 2, 1), noHistory];
    expect(filterBoardRows(input, { ...EMPTY_BOARD_FILTERS, author: 'fan' }).map(r => r.fanId)).toEqual(['fan']);
    expect(filterBoardRows(input, { ...EMPTY_BOARD_FILTERS, author: 'model' }).map(r => r.fanId)).toEqual(['us']);
    expect(filterBoardRows(input, { ...EMPTY_BOARD_FILTERS, history: 'unknown' }).map(r => r.fanId)).toEqual(['900']);
    expect(filterBoardRows(input, { ...EMPTY_BOARD_FILTERS, author: 'fan', history: 'unknown' })).toEqual([]);
  });

  it('accepts one-sided and textless message evidence; invalid timestamps stay unknown', () => {
    const media = { ...row('media', null, 1), lastMessagePreview: '' };
    const head = { ...noHistory, fanId: 'head', lastMessagePreview: '[Photo]' };
    const invalid = { ...noHistory, fanId: 'invalid', lastFanMessageAt: 'bad' };
    expect(filterBoardRows([media, head, invalid], { ...EMPTY_BOARD_FILTERS, history: 'known' }).map(r => r.fanId)).toEqual(['media', 'head']);
  });

  it('finds matches beyond shelf previews and in already loaded collapsed tiers', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`fan-${i}`, i + 1, i + 1));
    const model = buildAllView({
      shelves: [shelf('one', rows), shelf('two', []), shelf('large', [row('fan-hidden', 1, 1)], 500)],
      expanded: {}, untiered: { open: false, rows: undefined, loading: false },
      filters: { ...EMPTY_BOARD_FILTERS, query: 'fan-' },
    });
    expect(model.fanRows).toHaveLength(9);
    expect(model.items.filter(i => i.kind === 'more')).toEqual([]);
    expect(model.items.filter(i => i.kind === 'tier').map(i => i.listId)).toEqual(['one', 'large']);
  });

  it('keeps unopened unloaded tiers explicit during search, with no fake matches', () => {
    const model = buildAllView({
      shelves: [shelf('one', []), shelf('two', []), shelf('unloaded', undefined, 500)],
      expanded: {}, untiered: { open: false, rows: undefined, loading: false },
      filters: { ...EMPTY_BOARD_FILTERS, query: 'nobody' },
    });
    expect(model.fanRows).toEqual([]);
    expect(model.items.filter(i => i.kind === 'collapsed').map(i => i.listId)).toEqual(['unloaded', '__untiered__']);
    expect(model.items.some(i => i.kind === 'loading')).toBe(false);
  });

  it('keeps an open fan resolvable after filters exclude it, and J/K uses matching rows', () => {
    const store = createBoardStore();
    const rows = [row('a', 30, 30), row('b', 20, 10), row('c', 10, 20)];
    const model = buildFlatView(shelf('one', rows), { side: 'model', direction: 'desc' }, { ...EMPTY_BOARD_FILTERS, author: 'model' });
    store.getState().openPreview('b');
    store.getState().setVisibleRows(model.fanRows, model.loadedRows);
    expect(previewRow(store.getState())?.fanId).toBe('b');
    store.getState().moveCursor(1);
    expect(store.getState().previewFanId).toBe('c');
  });

  it('resets account-specific chip/filter/preview state but preserves it on reopening the same account', () => {
    const store = createBoardStore();
    store.getState().enterAccount('A');
    store.getState().setChip('A-tier');
    store.getState().setFilters({ query: 'marcus', author: 'fan' });
    store.getState().openPreview('11223');
    store.getState().enterAccount('A');
    expect(store.getState().chip).toBe('A-tier');
    expect(store.getState().filters.query).toBe('marcus');
    store.getState().enterAccount('B');
    expect(store.getState().chip).toBe('all');
    expect(store.getState().filters).toEqual(EMPTY_BOARD_FILTERS);
    expect(previewRow(store.getState())).toBeNull();
    expect(validBoardChip('removed-tier', ['live-tier'])).toBe('all');
    expect(validBoardChip('live-tier', ['live-tier'])).toBe('live-tier');
  });

  it('shows a failed initial roster as an error instead of permanent loading', () => {
    const failed = { ...shelf('one', undefined), error: true };
    expect(buildFlatView(failed).items.map(i => i.kind)).toEqual(['error']);
    const all = buildAllView({ shelves: [failed], expanded: {}, untiered: { open: true, rows: undefined, loading: false, error: true } });
    expect(all.items.filter(i => i.kind === 'error')).toHaveLength(2);
    expect(all.items.some(i => i.kind === 'loading')).toBe(false);
  });

  it('preserves stale roster rows during a failed refresh and manual retry', () => {
    const failed = { ...shelf('one', [row('cached', 1, 2)]), error: true, fetching: true };
    const model = buildFlatView(failed);
    expect(model.items[0]).toMatchObject({ kind: 'error', stale: true, fetching: true });
    expect(model.fanRows.map(r => r.fanId)).toEqual(['cached']);
    const untiered = buildAllView({ shelves: [], expanded: {}, untiered: { open: true, rows: failed.rows, loading: true, fetching: true } });
    expect(untiered.fanRows.map(r => r.fanId)).toEqual(['cached']);
  });
});

describe('contact sorting', () => {
  it('sorts each side independently, preserving the input cache', () => {
    const input = [row('ryan', 816, 864), row('marcus', 72, 360), row('sam', 216, 288)];
    expect(sortRowsByContact(input, { side: 'model', direction: 'desc' }).map(r => r.fanId)).toEqual(['ryan', 'sam', 'marcus']);
    expect(sortRowsByContact(input, { side: 'fan', direction: 'asc' }).map(r => r.fanId)).toEqual(['sam', 'marcus', 'ryan']);
    expect(input.map(r => r.fanId)).toEqual(['ryan', 'marcus', 'sam']);
  });

  it('compares exact timestamps even when the displayed days are equal', () => {
    const input = [row('newer', 1, 25, 9000), row('older', 2, 47, 10)];
    expect(input.map(r => r.fanDays)).toEqual([1, 1]);
    expect(sortRowsByContact(input, { side: 'fan', direction: 'desc' }).map(r => r.fanId)).toEqual(['older', 'newer']);
  });

  it.each(['asc', 'desc'] as const)('keeps missing/invalid dates last for %s age', direction => {
    const input = [row('unknown', null, null, 10000), row('known', 2, 3), { ...row('invalid', 5, 6), lastFanMessageAt: 'bad' }];
    expect(sortRowsByContact(input, { side: 'fan', direction }).map(r => r.fanId)).toEqual(['known', 'unknown', 'invalid']);
  });

  it('keeps a known side sortable when the other side is missing', () => {
    const input = [row('fan-only', null, 800), row('model-only', 900, null)];
    expect(sortRowsByContact(input, { side: 'fan', direction: 'desc' })[0]?.fanId).toBe('fan-only');
    expect(sortRowsByContact(input, { side: 'model', direction: 'desc' })[0]?.fanId).toBe('model-only');
  });

  it('has a stable spend/id tiebreak for identical timestamps', () => {
    const input = [row('z', 2, 3, 100), row('b', 2, 3, 500), row('a', 2, 3, 100)];
    expect(sortRowsByContact(input, { side: 'fan', direction: 'desc' }).map(r => r.fanId)).toEqual(['b', 'a', 'z']);
  });
});

describe('board sorting and keyboard identity', () => {
  const shelf = (id: string, rows: SpenderRowVM[]): ShelfData => ({
    list: { id, name: id === 'whale' ? '🐳 Кит 600+' : '⭐ Топ 350-600', usersCount: rows.length, custom: true },
    rows, truncated: false,
  });

  it('sorts before clipping shelf previews, without mixing tiers or losing emojis', () => {
    const model = buildAllView({
      shelves: [
        shelf('whale', [row('a', 1, 1), row('b', 2, 2), row('c', 3, 3), row('d', 4, 4), row('e', 5, 5)]),
        shelf('top', [row('f', 1, 100), row('g', 2, 300), row('h', 3, 200)]),
      ],
      expanded: {}, untiered: { open: false, rows: undefined, loading: false },
    });
    expect(model.fanRows.map(r => r.fanId)).toEqual(['e', 'd', 'c', 'b', 'g', 'h']);
    expect(model.items.filter(i => i.kind === 'tier').map(i => i.title)).toEqual(['🐳 Кит', '⭐ Топ']);
    expect(model.items.filter(i => i.kind === 'more').map(i => i.hidden)).toEqual([1, 1]);
  });

  it('uses the same sort in single-tier and untiered views', () => {
    const rows = [row('a', 5, 3), row('b', 1, 8)];
    const sort = { side: 'model', direction: 'asc' } as const;
    const flat = buildFlatView(shelf('whale', rows), sort);
    const all = buildAllView({ shelves: [], expanded: {}, untiered: { open: true, rows, loading: false }, sort });
    expect(flat.fanRows.map(r => r.fanId)).toEqual(['b', 'a']);
    expect(all.fanRows.map(r => r.fanId)).toEqual(['b', 'a']);
  });

  it('keeps the open fan/cursor by id when the order changes; J/K follows the new order', () => {
    const store = createBoardStore();
    const rows = [row('a', 8, 1), row('b', 1, 8), row('c', 2, 2)];
    store.getState().setVisibleRows(rows);
    store.getState().openPreview('c');
    store.getState().sortContact('model');
    store.getState().setVisibleRows(sortRowsByContact(rows, store.getState().contactSort));
    expect(store.getState().cursorFanId).toBe('c');
    expect(store.getState().previewFanId).toBe('c');
    store.getState().moveCursor(1);
    expect(store.getState().previewFanId).toBe('b');
    store.getState().sortContact('model');
    expect(store.getState().contactSort).toEqual({ side: 'model', direction: 'asc' });
  });

  it('keeps a fan open after a confirmed message moves it out of the tier preview', () => {
    const store = createBoardStore();
    const rows = [row('a', 50, 1), row('b', 40, 2), row('c', 30, 3), row('d', 20, 4), row('e', 10, 5)];
    const model = (firstTier: SpenderRowVM[]) => buildAllView({
      shelves: [shelf('whale', firstTier), shelf('top', [row('f', 5, 6)])],
      expanded: {}, untiered: { open: false, rows: undefined, loading: false },
      sort: { side: 'model', direction: 'desc' },
    });
    const initial = model(rows);
    store.getState().setVisibleRows(initial.fanRows, initial.loadedRows);
    store.getState().openPreview('d');
    const sent = { ...rows[3]!, lastModelMessageAt: ago(0), lastMessagePreview: 'confirmed new message' };
    const refreshed = model(rows.map(r => r.fanId === 'd' ? sent : r));
    expect(refreshed.fanRows.map(r => r.fanId)).toEqual(['a', 'b', 'c', 'e', 'f']);
    store.getState().setVisibleRows(refreshed.fanRows, refreshed.loadedRows);
    expect(store.getState().cursorFanId).toBe('d');
    expect(previewRow(store.getState())).toEqual(sent);
    store.getState().moveCursor(1);
    expect(store.getState().previewFanId).toBe('f');
    store.getState().openPreview('d');
    store.getState().moveCursor(-1);
    expect(store.getState().previewFanId).toBe('e');
  });

  it('clamps navigation at the end and clears a hidden cursor when closing the preview', () => {
    const store = createBoardStore();
    const visible = [row('a', 3, 3), row('b', 2, 2)];
    const hidden = row('c', 1, 1);
    store.getState().setVisibleRows(visible, [...visible, hidden]);
    store.getState().openPreview('c');
    store.getState().moveCursor(1);
    expect(store.getState().previewFanId).toBe('c');
    expect(previewRow(store.getState())).toEqual(hidden);
    store.getState().closePreview();
    expect(store.getState().cursorFanId).toBeNull();
    expect(previewRow(store.getState())).toBeNull();
    store.getState().moveCursor(1);
    expect(store.getState().cursorFanId).toBe('a');
  });
});
