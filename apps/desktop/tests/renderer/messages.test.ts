import { describe, expect, it } from 'vitest';
import type { MessageVM } from '../../src/preload/contract';
import {
  buildThreadRows,
  initialsOf,
  mediaCountLabel,
  ppvChip,
  sendState,
} from '../../src/renderer/src/lib/messages';
import { formatDollars, formatLedgerAmount } from '../../src/renderer/src/lib/money';

const NOW = new Date(2026, 5, 10, 19, 30);

let seq = 0;
function msg(overrides: Partial<MessageVM>): MessageVM {
  seq += 1;
  return {
    id: String(seq),
    chatId: 'c1',
    createdAt: new Date(2026, 5, 10, 12, 0).toISOString(),
    isSentByMe: false,
    text: 'hello',
    media: [],
    price: 0,
    ppvState: null,
    isTip: false,
    tipAmount: null,
    tipText: null,
    isNew: false,
    replyTo: null,
    deleted: false,
    ...overrides,
  };
}

describe('buildThreadRows', () => {
  it('inserts a day separator before the first message of each day', () => {
    const rows = buildThreadRows(
      [
        msg({ createdAt: new Date(2026, 5, 9, 10, 0).toISOString() }),
        msg({ createdAt: new Date(2026, 5, 9, 11, 0).toISOString() }),
        msg({ createdAt: new Date(2026, 5, 10, 9, 0).toISOString() }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual(['day', 'message', 'message', 'day', 'message']);
    const firstDay = rows[0];
    expect(firstDay?.kind === 'day' && firstDay.label).toBe('YESTERDAY');
    const secondDay = rows[3];
    expect(secondDay?.kind === 'day' && secondDay.label).toBe('TODAY');
  });

  it('marks tips as ledger rows', () => {
    const rows = buildThreadRows([msg({ isTip: true, tipAmount: 25 })], NOW);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'tip']);
  });

  it('produces stable unique keys', () => {
    const rows = buildThreadRows(
      [msg({}), msg({ isTip: true, tipAmount: 5 }), msg({})],
      NOW,
    );
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('handles empty input', () => {
    expect(buildThreadRows([], NOW)).toEqual([]);
  });
});

describe('ppvChip', () => {
  it('is null for non-PPV messages', () => {
    expect(ppvChip(msg({ price: 0 }))).toBeNull();
    expect(ppvChip(msg({ price: 45, ppvState: null }))).toBeNull();
  });

  it('renders purchased as filled green with a check', () => {
    expect(ppvChip(msg({ price: 45, ppvState: 'purchased' }))).toEqual({
      tone: 'green',
      label: '$45 PPV ✓',
      state: 'purchased',
    });
  });

  it('renders not purchased as amber with the explicit words', () => {
    expect(ppvChip(msg({ price: 45, ppvState: 'not_purchased' }))).toEqual({
      tone: 'amber',
      label: '$45 PPV — not purchased',
      state: 'not_purchased',
    });
  });

  it('renders unknown as neutral', () => {
    expect(ppvChip(msg({ price: 6, ppvState: 'unknown' }))).toEqual({
      tone: 'neutral',
      label: '$6 PPV',
      state: 'unknown',
    });
  });

  it('keeps cents when present', () => {
    expect(ppvChip(msg({ price: 9.99, ppvState: 'unknown' }))?.label).toBe('$9.99 PPV');
  });
});

describe('sendState', () => {
  it('is null for fan messages', () => {
    expect(sendState(msg({ isSentByMe: false }))).toBeNull();
  });

  it('maps isNew=false to SEEN', () => {
    expect(sendState(msg({ isSentByMe: true, isNew: false }))).toEqual({
      label: 'SEEN',
      tone: 'seen',
    });
  });

  it('maps isNew=true to SENT', () => {
    expect(sendState(msg({ isSentByMe: true, isNew: true }))).toEqual({
      label: 'SENT',
      tone: 'low',
    });
  });
});

describe('mediaCountLabel', () => {
  function media(type: 'photo' | 'video'): MessageVM['media'][number] {
    return {
      id: `m${++seq}`,
      type,
      thumbUrl: null,
      fullUrl: null,
      isReady: true,
      locked: false,
      durationSeconds: null,
    };
  }

  it('pluralizes and joins counts', () => {
    expect(mediaCountLabel([media('photo'), media('photo'), media('photo'), media('video')])).toBe(
      '3 photos · 1 video',
    );
  });

  it('handles a single item', () => {
    expect(mediaCountLabel([media('photo')])).toBe('1 photo');
  });
});

describe('initialsOf', () => {
  it('uses first letters of two words', () => {
    expect(initialsOf('Marcus K.')).toBe('MK');
  });

  it('uses first+last char of a single word', () => {
    expect(initialsOf('jake_777')).toBe('J7');
    expect(initialsOf('Daniel')).toBe('DL');
  });

  it('falls back for empty names', () => {
    expect(initialsOf('')).toBe('?');
  });
});

describe('money formatting', () => {
  it('formats whole dollars without cents', () => {
    expect(formatDollars(1284)).toBe('$1,284');
  });

  it('keeps cents when fractional', () => {
    expect(formatDollars(9.99)).toBe('$9.99');
  });

  it('formats ledger amounts with sign and cents', () => {
    expect(formatLedgerAmount(25)).toBe('+$25.00');
  });
});
