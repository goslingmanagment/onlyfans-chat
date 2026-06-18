import { describe, expect, it } from 'vitest';
import { UI_MESSAGES } from '@chatgoose/shared/i18n/index';
import {
  deriveHydrateStatus,
  derivePreviewAiBlockReason,
} from '../../src/renderer/src/features/spenders/previewHydrateStatus';

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

describe('derivePreviewAiBlockReason', () => {
  it('blocks preview AI while hydrate or manual refresh freshness is unresolved', () => {
    expect(
      derivePreviewAiBlockReason('loading', 'sp.historyTraceRequest', undefined, false, false),
    ).toEqual({ key: 'sp.historyTraceRequest' });
    expect(
      derivePreviewAiBlockReason(
        'loading',
        'sp.historyTraceWaitingRows',
        { count: 12 },
        false,
        false,
      ),
    ).toEqual({ key: 'sp.historyTraceWaitingRows', params: { count: 12 } });
    expect(
      derivePreviewAiBlockReason('error', 'sp.historyTraceError', undefined, false, false),
    ).toEqual({ key: 'sp.historyFetchFailed' });
    expect(
      derivePreviewAiBlockReason('done', 'sp.historyTraceDone', undefined, true, false),
    ).toEqual({ key: 'conv.refreshing' });
    expect(
      derivePreviewAiBlockReason('done', 'sp.historyTraceDone', undefined, false, true),
    ).toEqual({ key: 'conv.refreshFailed' });
    expect(
      derivePreviewAiBlockReason('done', 'sp.historyTraceDone', undefined, false, false),
    ).toBeNull();
  });
});

describe('quick-look hydrate i18n keys', () => {
  const keys = [
    'conv.refreshFailed',
    'conv.refreshing',
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
