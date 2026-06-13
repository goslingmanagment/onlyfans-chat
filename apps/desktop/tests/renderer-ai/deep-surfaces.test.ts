// P4 deep-AI surfaces: chat-review card derivation, scan completion pointer,
// Ping/Hi pill gates (+ precedence), the hi-greeting client heuristic and the
// deep progress label. Pure logic only, mirroring dock-logic.test.ts patterns.

import { describe, expect, it } from 'vitest';
import {
  HI_LOCKED_REASON,
  PING_BLOCKED_REASON,
  copyablePartsOf,
  deriveDockView,
  deriveHiLocked,
  evaluateAiGate,
  evaluateHiGate,
  evaluatePingGate,
  insertPayload,
  progressLabel,
  splitRecommendationItems,
} from '../../src/renderer/src/features/ai/dockLogic';
import {
  isScanStale,
  splitSummaryParagraphs,
} from '../../src/renderer/src/features/fan-panel/scanLogic';

const OK_GATE = evaluateAiGate({ mapped: true, hasLlmKey: true });
const UNMAPPED_GATE = evaluateAiGate({ mapped: false, hasLlmKey: true });
const NO_KEY_GATE = evaluateAiGate({ mapped: true, hasLlmKey: false });

describe('deriveDockView · chat-review', () => {
  const validXml =
    '<rating>7</rating>\n<evaluation>Solid rapport, slow on upsells.</evaluation>\n' +
    '<recommendations>- Mirror his energy\n- Offer the gym set sooner</recommendations>';

  it('valid XML → structured read-only review card', () => {
    const view = deriveDockView('chat-review', { rawText: validXml });
    expect(view).toEqual({
      kind: 'review',
      rating: 7,
      evaluation: 'Solid rapport, slow on upsells.',
      recommendations: ['Mirror his energy', 'Offer the gym set sooner'],
    });
  });

  it('invalid XML → raw fallback', () => {
    const view = deriveDockView('chat-review', { rawText: 'no tags at all' });
    expect(view).toEqual({ kind: 'raw', text: 'no tags at all' });
  });

  it('out-of-range rating → raw fallback (parser rejects it)', () => {
    const view = deriveDockView('chat-review', {
      rawText: '<rating>11</rating><evaluation>e</evaluation><recommendations>r</recommendations>',
    });
    expect(view.kind).toBe('raw');
  });

  it('review cards are never insertable (SPEC: only true reply drafts insert)', () => {
    const view = deriveDockView('chat-review', { rawText: validXml });
    expect(copyablePartsOf(view)).toEqual([]);
  });
});

describe('splitRecommendationItems', () => {
  it('splits lines and strips bullet/number markers', () => {
    expect(splitRecommendationItems('- first\n• second\n3. third\n4) fourth')).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
  });

  it('an unstructured paragraph stays one item', () => {
    expect(splitRecommendationItems('just keep the tone playful')).toEqual([
      'just keep the tone playful',
    ]);
  });

  it('drops blank lines', () => {
    expect(splitRecommendationItems('- a\n\n- b\n   ')).toEqual(['a', 'b']);
  });
});

describe('deriveDockView · fan-summary (scan completion pointer)', () => {
  it('completion points to the panel, never the body', () => {
    const view = deriveDockView('fan-summary', {
      rawText: 'Очень длинное досье…',
      summaryMeta: { generatedAt: 1770000000000, cached: false },
    });
    expect(view).toEqual({ kind: 'scan-pointer', generatedAt: 1770000000000, cached: false });
    expect(copyablePartsOf(view)).toEqual([]);
  });

  it('cache hits are flagged', () => {
    const view = deriveDockView('fan-summary', {
      rawText: 'досье',
      summaryMeta: { generatedAt: 5, cached: true },
    });
    expect(view).toEqual({ kind: 'scan-pointer', generatedAt: 5, cached: true });
  });

  it('missing/garbled meta still yields a pointer (no raw body in the dock)', () => {
    expect(deriveDockView('fan-summary', { rawText: 'досье' })).toEqual({
      kind: 'scan-pointer',
      generatedAt: null,
      cached: false,
    });
    expect(
      deriveDockView('fan-summary', { rawText: 'досье', summaryMeta: { generatedAt: 'no' } }),
    ).toEqual({ kind: 'scan-pointer', generatedAt: null, cached: false });
  });
});

describe('deriveDockView · hi-greeting variants insert path', () => {
  it('[VARIANT] parts are draft bubbles and ⌘1..3 payloads resolve', () => {
    const view = deriveDockView('hi-greeting', {
      rawText: 'hey you![VARIANT]well hello[VARIANT]took you long enough',
    });
    expect(view.kind).toBe('drafts');
    const parts = copyablePartsOf(view);
    expect(parts).toHaveLength(3);
    expect(insertPayload(parts, 1)).toBe('hey you!');
    expect(insertPayload(parts, 3)).toBe('took you long enough');
  });
});

describe('Ping / Hi pill gates (precedence: unmapped → no-key → feature gate)', () => {
  it('ping blocked → dimmed with the fan-active reason', () => {
    expect(evaluatePingGate(OK_GATE, true)).toEqual({
      enabled: false,
      reason: PING_BLOCKED_REASON,
      code: 'ping-blocked',
    });
  });

  it('ping allowed when the gate says not blocked or is unknown', () => {
    expect(evaluatePingGate(OK_GATE, false)).toEqual({ enabled: true });
    // unknown = allowed; coordinator CG-FLOW-05 is authoritative
    expect(evaluatePingGate(OK_GATE, null)).toEqual({ enabled: true });
  });

  it('hi locked → dimmed with the message-cap reason', () => {
    expect(evaluateHiGate(OK_GATE, true)).toEqual({
      enabled: false,
      reason: HI_LOCKED_REASON,
      code: 'hi-locked',
    });
    expect(evaluateHiGate(OK_GATE, false)).toEqual({ enabled: true });
    // unknown = allowed; coordinator CG-FLOW-09 is authoritative
    expect(evaluateHiGate(OK_GATE, null)).toEqual({ enabled: true });
  });

  it('unmapped account outranks the feature gates', () => {
    expect(evaluatePingGate(UNMAPPED_GATE, true)).toEqual({
      enabled: false,
      reason: 'Map a personality in Settings',
      code: 'unmapped',
    });
    expect(evaluateHiGate(UNMAPPED_GATE, true)).toEqual({
      enabled: false,
      reason: 'Map a personality in Settings',
      code: 'unmapped',
    });
  });

  it('missing LLM key outranks the feature gates', () => {
    expect(evaluatePingGate(NO_KEY_GATE, false)).toEqual({
      enabled: false,
      reason: 'Add an Anthropic or OpenRouter key in Settings',
      code: 'no-key',
    });
    expect(evaluateHiGate(NO_KEY_GATE, true)).toEqual({
      enabled: false,
      reason: 'Add an Anthropic or OpenRouter key in Settings',
      code: 'no-key',
    });
  });

  it('account/settings still loading disables without a misleading reason', () => {
    expect(evaluatePingGate(null, true).enabled).toBe(false);
    expect(evaluateHiGate(null, null).enabled).toBe(false);
  });
});

describe('deriveHiLocked (client heuristic over loaded message pages)', () => {
  const msg = (deleted = false): { deleted: boolean } => ({ deleted });

  it('unknown while pages are not loaded', () => {
    expect(deriveHiLocked(undefined)).toBeNull();
    expect(deriveHiLocked([])).toBeNull();
  });

  it('≤10 non-deleted messages on a complete history → unlocked', () => {
    expect(deriveHiLocked([{ items: Array.from({ length: 10 }, () => msg()), hasMore: false }])).toBe(false);
    expect(deriveHiLocked([{ items: [], hasMore: false }])).toBe(false);
  });

  it('>10 non-deleted messages → locked', () => {
    expect(deriveHiLocked([{ items: Array.from({ length: 11 }, () => msg()), hasMore: false }])).toBe(true);
  });

  it('deleted messages do not count toward the cap', () => {
    const items = [...Array.from({ length: 10 }, () => msg()), msg(true), msg(true)];
    expect(deriveHiLocked([{ items, hasMore: false }])).toBe(false);
  });

  it('unloaded history (hasMore) → locked — a full page is already past the cap', () => {
    expect(deriveHiLocked([{ items: Array.from({ length: 5 }, () => msg()), hasMore: true }])).toBe(true);
  });

  it('counts across pages', () => {
    const page = (n: number, hasMore: boolean): { items: { deleted: boolean }[]; hasMore: boolean } => ({
      items: Array.from({ length: n }, () => msg()),
      hasMore,
    });
    expect(deriveHiLocked([page(6, false), page(6, false)])).toBe(true);
    expect(deriveHiLocked([page(5, false), page(5, false)])).toBe(false);
  });
});

describe('progressLabel (deep staged progress)', () => {
  it('loading-messages shows the page counter when present', () => {
    expect(progressLabel('loading-messages', { current: 3, target: 15 })).toBe(
      'LOADING MESSAGES · 3/15 PAGES',
    );
  });

  it('quick ops without counters show the bare phase', () => {
    expect(progressLabel('loading-messages', null)).toBe('LOADING MESSAGES');
    expect(progressLabel('generating', null)).toBe('GENERATING');
    expect(progressLabel('idle', null)).toBe('STARTING');
  });

  it('counter only applies to the loading-messages phase', () => {
    expect(progressLabel('generating', { current: 3, target: 15 })).toBe('GENERATING');
  });

  it('zero target pages suppresses the counter', () => {
    expect(progressLabel('loading-messages', { current: 0, target: 0 })).toBe('LOADING MESSAGES');
  });
});

describe('scan panel logic', () => {
  it('splits the Russian dossier into blank-line paragraphs', () => {
    expect(splitSummaryParagraphs('Досье.\nФакты.\n\nПсихология.\n\n\nСтратегия.')).toEqual([
      'Досье.\nФакты.',
      'Психология.',
      'Стратегия.',
    ]);
  });

  it('whitespace-only bodies yield no paragraphs', () => {
    expect(splitSummaryParagraphs('  \n\n  ')).toEqual([]);
  });

  it('stale when a message is newer than the scan', () => {
    expect(isScanStale('2026-06-10T10:00:00Z', '2026-06-11T09:00:00Z')).toBe(true);
    expect(isScanStale('2026-06-11T10:00:00Z', '2026-06-11T09:00:00Z')).toBe(false);
  });

  it('no newest message or unparseable dates → not stale', () => {
    expect(isScanStale('2026-06-10T10:00:00Z', null)).toBe(false);
    expect(isScanStale('garbage', '2026-06-11T09:00:00Z')).toBe(false);
    expect(isScanStale('2026-06-10T10:00:00Z', 'garbage')).toBe(false);
  });
});
