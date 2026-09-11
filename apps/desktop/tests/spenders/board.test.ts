import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@chatgoose/shared/i18n/index';
import type { SpenderRowVM } from '../../src/preload/contract';
import { buildAllView, buildFlatView, type ShelfData } from '../../src/renderer/src/features/spenders/boardModel';
import { formatContactAge, sortRowsByContact } from '../../src/renderer/src/features/spenders/contactAge';
import { createBoardStore, previewRow } from '../../src/renderer/src/features/spenders/spendersStore';

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
