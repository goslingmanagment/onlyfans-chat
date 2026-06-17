import { describe, expect, it } from 'vitest';
import { UI_MESSAGES } from '@chatgoose/shared/i18n/index';
import { deriveHydrateStatus } from '../../src/renderer/src/features/spenders/previewHydrateStatus';

describe('deriveHydrateStatus', () => {
  it('covers the quick-look hydrate lifecycle mapping', () => {
    expect(deriveHydrateStatus('loading', 0, false, false)).toEqual({
      showOverlay: true,
      logKey: 'sp.historyLoading',
      traceKey: 'sp.historyTraceRequest',
    });
    expect(deriveHydrateStatus('loading', 0, false, false, true)).toEqual({
      showOverlay: true,
      logKey: 'sp.historyLoading',
      traceKey: 'sp.historyTraceLocal',
    });
    expect(deriveHydrateStatus('loading', 12, false, true)).toEqual({
      showOverlay: false,
      logKey: 'sp.historyLoading',
      traceKey: 'sp.historyTraceRequest',
    });
    expect(deriveHydrateStatus('done', 12, false, true)).toEqual({
      showOverlay: false,
      logKey: 'sp.historyLoaded',
      count: 12,
      traceKey: 'sp.historyTraceDone',
    });
    expect(deriveHydrateStatus('done', 12, false, false)).toEqual({
      showOverlay: true,
      logKey: 'sp.historyLoaded',
      count: 12,
      traceKey: 'sp.historyTraceWaitingRows',
      traceParams: { count: 12 },
    });
    expect(deriveHydrateStatus('done', 0, false, false)).toEqual({
      showOverlay: false,
      logKey: 'sp.historyLogEmpty',
      traceKey: 'sp.historyTraceEmpty',
    });
    expect(deriveHydrateStatus('done', 12, true, true)).toEqual({
      showOverlay: false,
      logKey: 'sp.historyLogFresh',
      traceKey: 'sp.historyTraceTtl',
    });
    expect(deriveHydrateStatus('error', 0, false, false)).toEqual({
      showOverlay: false,
      logKey: 'sp.historyLogError',
      traceKey: 'sp.historyTraceError',
    });
  });
});

describe('quick-look hydrate i18n keys', () => {
  const keys = [
    'sp.historyLoading',
    'sp.historyLoaded',
    'sp.historyLogEmpty',
    'sp.historyLogFresh',
    'sp.historyLogError',
    'sp.historyTraceLocal',
    'sp.historyTraceRequest',
    'sp.historyTraceSlow',
    'sp.historyTraceWaitingRows',
    'sp.historyTraceDone',
    'sp.historyTraceTtl',
    'sp.historyTraceEmpty',
    'sp.historyTraceError',
    'sp.historyTraceElapsed',
  ] as const;

  it('has en/ru text and matching placeholders', () => {
    const names = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const key of keys) {
      const entry = UI_MESSAGES[key];
      expect(entry.en.length, `${key}.en`).toBeGreaterThan(0);
      expect(entry.ru.length, `${key}.ru`).toBeGreaterThan(0);
      expect(names(entry.ru), `${key}: placeholder mismatch`).toEqual(names(entry.en));
    }
    expect(UI_MESSAGES['sp.historyLoaded'].en).toContain('{count}');
    expect(UI_MESSAGES['sp.historyLoaded'].ru).toContain('{count}');
  });
});
