import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@chatgoose/shared/i18n/index';
import type { OutboxItemVM } from '../../src/preload/contract';
import { buildThreadRows } from '../../src/renderer/src/lib/messages';
import {
  activeSequence,
  createTypingThrottle,
  deriveOutboxRow,
  mergeOutboxRows,
  restrictedSegments,
  splitDraftParts,
  visibleOutboxItems,
} from '../../src/renderer/src/features/conversation/sendLogic';

// deriveOutboxRow is locale-free: it emits reason CODES/flags
// (restrictedWords / explainerCode / explainerMessage). The byte-exact English
// copy now lives in the catalog and is asserted in the conversation component
// tests; here we pin the structured descriptor. buildThreadRows takes the
// translator last (seam refactor) — an EN translator keeps day labels stable.
const t = makeTranslator('en');

let seq = 0;
function outboxItem(overrides: Partial<OutboxItemVM>): OutboxItemVM {
  seq += 1;
  const at = new Date(2026, 5, 11, 12, 0, seq).toISOString();
  return {
    localId: `local_${seq}`,
    chatId: 'c1',
    text: 'hello there',
    transport: 'direct',
    state: 'queued',
    messageId: null,
    sequenceId: null,
    partIndex: 0,
    errorCode: null,
    errorMessage: null,
    textHighlights: [],
    price: 0,
    mediaCount: 0,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe('splitDraftParts ([NEXT] rule)', () => {
  it('no marker → single trimmed part', () => {
    expect(splitDraftParts('  hey you  ')).toEqual(['hey you']);
  });

  it('splits on [NEXT], trims parts', () => {
    expect(splitDraftParts('first part \n[NEXT]\n second part')).toEqual([
      'first part',
      'second part',
    ]);
  });

  it('drops empty parts (leading/trailing/consecutive markers)', () => {
    expect(splitDraftParts('[NEXT]a[NEXT][NEXT]b[NEXT]')).toEqual(['a', 'b']);
    expect(splitDraftParts('a[NEXT]   [NEXT]b')).toEqual(['a', 'b']);
  });

  it('blank and marker-only drafts produce no parts', () => {
    expect(splitDraftParts('')).toEqual([]);
    expect(splitDraftParts('   ')).toEqual([]);
    expect(splitDraftParts('[NEXT][NEXT]')).toEqual([]);
  });

  it('keeps interior newlines inside a part', () => {
    expect(splitDraftParts('line one\nline two[NEXT]part two')).toEqual([
      'line one\nline two',
      'part two',
    ]);
  });
});

describe('createTypingThrottle (SPEC §7.8: ≤1 fire / 3 s, 4 s idle ends a session)', () => {
  it('fires on the first keystroke', () => {
    const throttle = createTypingThrottle();
    expect(throttle.activity(0)).toBe(true);
  });

  it('suppresses keystrokes within the 3 s interval', () => {
    const throttle = createTypingThrottle();
    expect(throttle.activity(0)).toBe(true);
    expect(throttle.activity(500)).toBe(false);
    expect(throttle.activity(2_999)).toBe(false);
  });

  it('fires again once the interval elapses during continuous typing', () => {
    const throttle = createTypingThrottle();
    expect(throttle.activity(0)).toBe(true);
    expect(throttle.activity(1_000)).toBe(false);
    expect(throttle.activity(3_000)).toBe(true);
    expect(throttle.activity(5_900)).toBe(false);
    expect(throttle.activity(6_000)).toBe(true);
  });

  it('a pause ≥ idleMs ends the session — the next keystroke fires immediately', () => {
    // interval > idle makes the session-reset branch observable
    const throttle = createTypingThrottle(3_000, 1_000);
    expect(throttle.activity(0)).toBe(true);
    expect(throttle.activity(500)).toBe(false);
    // 1.5 s of silence ≥ idleMs → fresh session, fires despite < intervalMs since last fire
    expect(throttle.activity(2_000)).toBe(true);
  });

  it('with the default idle (4 s) > interval (3 s) the ≤1/3 s bound holds', () => {
    const throttle = createTypingThrottle();
    expect(throttle.activity(0)).toBe(true);
    // longest possible in-session gap that is not idle is still ≥ a full interval
    expect(throttle.activity(3_999)).toBe(true);
  });

  it('reset() starts a fresh session', () => {
    const throttle = createTypingThrottle();
    expect(throttle.activity(0)).toBe(true);
    throttle.reset();
    expect(throttle.activity(100)).toBe(true);
  });
});

describe('restrictedSegments (CG-OF-05 proper-substring rule)', () => {
  it('marks a proper-substring entry inline', () => {
    expect(restrictedSegments('pay me via cashapp tonight', ['cashapp'])).toEqual([
      { text: 'pay me via ', restricted: false },
      { text: 'cashapp', restricted: true },
      { text: ' tonight', restricted: false },
    ]);
  });

  it('full-text entry → no word-level highlight (live capture returns the whole text)', () => {
    const text = 'pay me via cashapp tonight';
    expect(restrictedSegments(text, [text])).toEqual([{ text, restricted: false }]);
  });

  it('no highlights / absent entries → single plain segment', () => {
    expect(restrictedSegments('hello', [])).toEqual([{ text: 'hello', restricted: false }]);
    expect(restrictedSegments('hello', ['venmo'])).toEqual([{ text: 'hello', restricted: false }]);
    expect(restrictedSegments('hello', [''])).toEqual([{ text: 'hello', restricted: false }]);
  });

  it('marks every occurrence and multiple entries', () => {
    expect(restrictedSegments('cashapp or venmo or cashapp', ['cashapp', 'venmo'])).toEqual([
      { text: 'cashapp', restricted: true },
      { text: ' or ', restricted: false },
      { text: 'venmo', restricted: true },
      { text: ' or ', restricted: false },
      { text: 'cashapp', restricted: true },
    ]);
  });

  it('round-trips: concatenated segments reproduce the text', () => {
    const text = 'a cashapp b venmo c';
    const joined = restrictedSegments(text, ['cashapp', 'venmo'])
      .map((s) => s.text)
      .join('');
    expect(joined).toBe(text);
  });
});

describe('deriveOutboxRow (state → label/actions)', () => {
  it('queued → QUEUED, no actions', () => {
    expect(deriveOutboxRow(outboxItem({ state: 'queued' }))).toEqual({
      label: 'QUEUED',
      tone: 'low',
      pulse: false,
      restrictedWords: false,
      explainerCode: null,
      explainerMessage: null,
      actions: [],
    });
  });

  it('sending → SENDING with pulse', () => {
    expect(deriveOutboxRow(outboxItem({ state: 'sending' }))).toEqual({
      label: 'SENDING',
      tone: 'low',
      pulse: true,
      restrictedWords: false,
      explainerCode: null,
      explainerMessage: null,
      actions: [],
    });
  });

  it('failed → FAILED with edit/retry/dismiss, passes the raw wire message through verbatim', () => {
    const view = deriveOutboxRow(
      outboxItem({ state: 'failed', errorCode: 'CG-NET-02', errorMessage: 'Connection refused.' }),
    );
    expect(view).toEqual({
      label: 'FAILED',
      tone: 'bad',
      pulse: false,
      restrictedWords: false,
      explainerCode: null,
      // uncoded FAILED: the verbatim wire message, not authored/localized copy
      explainerMessage: 'Connection refused.',
      actions: ['edit', 'retry', 'dismiss'],
    });
  });

  it('failed with CG-OF-05 → restrictedWords flag, no authored explainer (banner resolved in the component)', () => {
    const view = deriveOutboxRow(outboxItem({ state: 'failed', errorCode: 'CG-OF-05' }));
    expect(view?.restrictedWords).toBe(true);
    expect(view?.explainerCode).toBeNull();
    expect(view?.explainerMessage).toBeNull();
  });

  it('unconfirmed → UNCONF with verify/dismiss and NEVER a retry (SPEC §7.5)', () => {
    const view = deriveOutboxRow(outboxItem({ state: 'unconfirmed' }));
    expect(view).toEqual({
      label: 'UNCONF',
      tone: 'warn',
      pulse: false,
      restrictedWords: false,
      explainerCode: 'unconfirmed',
      explainerMessage: null,
      actions: ['verify', 'dismiss'],
    });
    expect(view?.actions).not.toContain('retry');
  });

  it('sent and cancelled rows render no bubble', () => {
    expect(deriveOutboxRow(outboxItem({ state: 'sent' }))).toBeNull();
    expect(deriveOutboxRow(outboxItem({ state: 'cancelled' }))).toBeNull();
  });
});

describe('visibleOutboxItems / mergeOutboxRows (thread ordering)', () => {
  const NOW = new Date(2026, 5, 11, 19, 0);

  it('filters reconciled states and sorts chronologically with partIndex tiebreak', () => {
    const t = new Date(2026, 5, 11, 12, 0, 0).toISOString();
    const items = [
      outboxItem({ localId: 'b', createdAt: t, partIndex: 1, state: 'queued' }),
      outboxItem({ localId: 'a', createdAt: t, partIndex: 0, state: 'sending' }),
      outboxItem({ localId: 'sent', state: 'sent' }),
      outboxItem({ localId: 'gone', state: 'cancelled' }),
      outboxItem({
        localId: 'old',
        createdAt: new Date(2026, 5, 11, 11, 0).toISOString(),
        state: 'failed',
      }),
    ];
    expect(visibleOutboxItems(items).map((i) => i.localId)).toEqual(['old', 'a', 'b']);
  });

  it('outbox rows always come after every message row', () => {
    const messages = buildThreadRows(
      [
        {
          id: '1',
          chatId: 'c1',
          createdAt: new Date(2026, 5, 11, 18, 0).toISOString(),
          isSentByMe: false,
          text: 'hi',
          media: [],
          price: 0,
          ppvState: null,
          isTip: false,
          tipAmount: null,
          tipText: null,
          isNew: false,
          replyTo: null,
          deleted: false,
        },
      ],
      NOW,
      t,
    );
    // outbox row created BEFORE the last message still renders below it
    const items = [
      outboxItem({ localId: 'x', createdAt: new Date(2026, 5, 11, 17, 0).toISOString() }),
    ];
    const rows = mergeOutboxRows(messages, items);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'message', 'outbox']);
    expect(rows[rows.length - 1]?.key).toBe('outbox:x');
  });

  it('returns the same rows reference when nothing is visible (memo stability)', () => {
    const messages = buildThreadRows([], NOW, t);
    expect(mergeOutboxRows(messages, [outboxItem({ state: 'sent' })])).toBe(messages);
  });
});

describe('activeSequence (multi-part cancel chip)', () => {
  it('null without a pending sequence', () => {
    expect(activeSequence([])).toBeNull();
    expect(activeSequence([outboxItem({ sequenceId: null, state: 'queued' })])).toBeNull();
    expect(
      activeSequence([
        outboxItem({ sequenceId: 's1', state: 'sent' }),
        outboxItem({ sequenceId: 's1', state: 'cancelled' }),
      ]),
    ).toBeNull();
  });

  it('reports total and remaining parts while queued/sending', () => {
    expect(
      activeSequence([
        outboxItem({ sequenceId: 's1', partIndex: 0, state: 'sent' }),
        outboxItem({ sequenceId: 's1', partIndex: 1, state: 'sending' }),
        outboxItem({ sequenceId: 's1', partIndex: 2, state: 'queued' }),
      ]),
    ).toEqual({ sequenceId: 's1', totalParts: 3, remainingParts: 2 });
  });

  it('picks the most recent pending sequence when several exist', () => {
    const older = new Date(2026, 5, 11, 10, 0).toISOString();
    const newer = new Date(2026, 5, 11, 11, 0).toISOString();
    expect(
      activeSequence([
        outboxItem({ sequenceId: 'old', createdAt: older, state: 'queued' }),
        outboxItem({ sequenceId: 'new', createdAt: newer, state: 'queued' }),
      ])?.sequenceId,
    ).toBe('new');
  });
});
