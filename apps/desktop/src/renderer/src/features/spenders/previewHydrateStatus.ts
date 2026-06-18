import type { UiMessageKey, UiMessageParams } from '@chatgoose/shared/i18n/index';

export type PreviewHydratePhase = 'loading' | 'done' | 'error';

export interface PreviewHydrateStatus {
  showOverlay: boolean;
  logKey: UiMessageKey;
  count?: number;
  traceKey: UiMessageKey;
  traceParams?: UiMessageParams;
}

export interface PreviewAiBlockReason {
  key: UiMessageKey;
  params?: UiMessageParams;
}

export function derivePreviewAiBlockReason(
  phase: PreviewHydratePhase,
  hydrateTraceKey: UiMessageKey,
  hydrateTraceParams: UiMessageParams | undefined,
  refreshPending: boolean,
  refreshFailed: boolean,
): PreviewAiBlockReason | null {
  if (phase === 'loading') {
    return hydrateTraceParams === undefined
      ? { key: hydrateTraceKey }
      : { key: hydrateTraceKey, params: hydrateTraceParams };
  }
  if (phase === 'error') {
    return { key: 'sp.historyFetchFailed' };
  }
  if (refreshPending) {
    return { key: 'conv.refreshing' };
  }
  if (refreshFailed) {
    return { key: 'conv.refreshFailed' };
  }
  return null;
}

export function deriveHydrateStatus(
  phase: PreviewHydratePhase,
  messageCount: number,
  skippedByTtl: boolean,
  hasLocalHistory: boolean,
  localQueryPending = false,
): PreviewHydrateStatus {
  if (phase === 'loading') {
    return {
      showOverlay: !hasLocalHistory,
      logKey: 'sp.historyLoading',
      traceKey: localQueryPending ? 'sp.historyTraceLocal' : 'sp.historyTraceRequest',
    };
  }

  if (phase === 'error') {
    return { showOverlay: false, logKey: 'sp.historyLogError', traceKey: 'sp.historyTraceError' };
  }

  if (messageCount > 0) {
    return {
      showOverlay: !hasLocalHistory,
      logKey: skippedByTtl ? 'sp.historyLogFresh' : 'sp.historyLoaded',
      ...(skippedByTtl ? {} : { count: messageCount }),
      traceKey: skippedByTtl
        ? 'sp.historyTraceTtl'
        : hasLocalHistory
          ? 'sp.historyTraceDone'
          : 'sp.historyTraceWaitingRows',
      ...(skippedByTtl || hasLocalHistory ? {} : { traceParams: { count: messageCount } }),
    };
  }

  return {
    showOverlay: false,
    logKey: skippedByTtl ? 'sp.historyLogFresh' : 'sp.historyLogEmpty',
    traceKey: skippedByTtl ? 'sp.historyTraceTtl' : 'sp.historyTraceEmpty',
  };
}
