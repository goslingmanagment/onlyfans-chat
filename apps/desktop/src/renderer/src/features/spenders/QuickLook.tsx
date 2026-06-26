// Quick-look mini-chat (P1 overlay per the binding mockup): the conversation
// body is the SHARED <ConversationView> (PREVIEW_FEATURES — vault + ping/reply/
// hi/improve, compact dock + compact density, paged read-only thread). This
// shell owns ONLY the modal chrome (scrim, card, compact header with sub/online
// chips, footer) and the read-only lifecycle: the preview IS the active
// conversation while open (draft load/persist + visible per-chat AI dock), but it
// runs NO aggressive poll and NO mark-read (0 credits — the full chat owns those).

import { useEffect, useState } from 'react';
import type { FanPanelVM, SpenderRowVM } from '../../../../preload/contract';
import { useFan, useMessages, useRefreshConversation } from '../../bridge/queries';
import { useT } from '../../lib/i18n';
import { formatWholeDollars } from '../../lib/money';
import { formatLastSeen, isOnline } from '../../lib/time';
import { cx } from '../../lib/cx';
import { Avatar } from '../../design/Avatar';
import { Kbd } from '../../design/Kbd';
import { SkeletonThread } from '../../design/Skeleton';
import { ConversationView } from '../conversation/ConversationView';
import { PREVIEW_FEATURES } from '../conversation/conversationFeatures';
import { handleConversationChange } from '../ai/aiStore';
import { resetVaultForConversation } from '../vault/vaultStore';
import { presenceKey, useUiStore } from '../../state/uiStore';
import type { BoardStore } from './spendersStore';
import { dayCounter } from './SpenderRowItem';
import { hydratePreviewFan, ensureAndOpenPreviewChat } from './previewActions';
import {
  deriveHydrateStatus,
  derivePreviewAiBlockReason,
  type PreviewHydratePhase,
} from './previewHydrateStatus';

type HydrateState =
  | { key: string; phase: Extract<PreviewHydratePhase, 'loading'> }
  | {
      key: string;
      phase: Extract<PreviewHydratePhase, 'done'>;
      messageCount: number;
      skippedByTtl: boolean;
    }
  | { key: string; phase: Extract<PreviewHydratePhase, 'error'> };

interface HydrateClock {
  key: string;
  startedAt: number;
  now: number;
}

export function QuickLook({
  accountId,
  fanId,
  row,
  store,
}: {
  accountId: string;
  fanId: string;
  row: SpenderRowVM | null;
  /** The active board store (Spenders or Online) — injected so the overlay is
   *  not hard-bound to useSpendersStore. Zustand stores are hooks, so calling
   *  store((s)=>…) below obeys the rules of hooks (the prop is a stable singleton). */
  store: BoardStore;
}): React.JSX.Element {
  const t = useT();
  const closePreview = store((s) => s.closePreview);
  const setPreviewAiBlocked = store((s) => s.setPreviewAiBlocked);
  const clearPreviewAiBlocked = store((s) => s.clearPreviewAiBlocked);
  const pushToast = useUiStore((s) => s.pushToast);
  const refresh = useRefreshConversation();
  const [openingChat, setOpeningChat] = useState(false);
  const [openFailedFor, setOpenFailedFor] = useState<string | null>(null);
  const [hydrate, setHydrate] = useState<HydrateState | null>(null);
  const [refreshFailedFor, setRefreshFailedFor] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const previewKey = `${accountId}/${fanId}`;
  const hydrateRequestKey = `${previewKey}/${retryNonce}`;
  const [hydrateClock, setHydrateClock] = useState<HydrateClock | null>(null);
  const openFailed = openFailedFor === previewKey;
  const messagesQuery = useMessages(accountId, fanId);
  const hasLocalHistory = messagesQuery.data?.pages.some((page) => page.items.length > 0) ?? false;
  // Derived by key: switching fans clears stale banners/status instantly before
  // the next hydrate resolves.
  const liveHydrate = hydrate?.key === hydrateRequestKey ? hydrate : null;
  const hydratePhase = liveHydrate?.phase ?? 'loading';
  const hydrateStatus = deriveHydrateStatus(
    hydratePhase,
    liveHydrate?.phase === 'done' ? liveHydrate.messageCount : 0,
    liveHydrate?.phase === 'done' ? liveHydrate.skippedByTtl : false,
    hasLocalHistory,
    messagesQuery.isPending,
  );
  const hydrateError = hydratePhase === 'error';
  const jumpToLatestKey =
    liveHydrate?.phase === 'done' && liveHydrate.messageCount > 0 && hasLocalHistory
      ? hydrateRequestKey
      : null;
  const hydrateStatusText =
    hydrateStatus.logKey === 'sp.historyLoaded'
      ? t(hydrateStatus.logKey, { count: hydrateStatus.count ?? 0 })
      : t(hydrateStatus.logKey);
  const liveClock = hydrateClock?.key === hydrateRequestKey ? hydrateClock : null;
  const hydrateElapsedSeconds =
    liveClock === null ? 0 : Math.max(0, Math.floor((liveClock.now - liveClock.startedAt) / 1000));
  const hydrateTraceText = t(hydrateStatus.traceKey, hydrateStatus.traceParams);
  const hydrateSlowText =
    hydratePhase === 'loading' && !hasLocalHistory && hydrateElapsedSeconds >= 5
      ? t('sp.historyTraceSlow')
      : null;
  const hydrateElapsedText = t('sp.historyTraceElapsed', { seconds: hydrateElapsedSeconds });
  const refreshPending =
    refresh.isPending &&
    refresh.variables?.accountId === accountId &&
    refresh.variables?.chatId === fanId;
  const refreshFailed = refreshFailedFor === previewKey;
  const refreshBusy = refreshPending || hydratePhase === 'loading';
  const previewAiBlock = derivePreviewAiBlockReason(
    hydratePhase,
    hydrateStatus.traceKey,
    hydrateStatus.traceParams,
    refreshPending,
    refreshFailed,
  );
  const previewAiBlockedReason =
    previewAiBlock === null ? null : t(previewAiBlock.key, previewAiBlock.params);
  function handleRefresh(): void {
    if (refreshBusy) return;
    setRefreshFailedFor(null);
    if (hydrateError) {
      setRetryNonce((n) => n + 1);
      return;
    }
    refresh.mutate(
      { accountId, chatId: fanId },
      {
        onSuccess: () => {
          setRefreshFailedFor(null);
          return messagesQuery.refetch();
        },
        onError: () => {
          setRefreshFailedFor(previewKey);
          pushToast({ title: t('conv.refreshFailed'), body: row?.name ?? fanId });
        },
      },
    );
  }

  // The preview IS the active conversation while open: per-chat draft
  // load/persist + visible AI job selection ride the existing machinery.
  useEffect(() => {
    handleConversationChange(accountId, fanId);
    // The vault selection is a GLOBAL in-progress compose for ONE fan; J/K
    // retargets this still-mounted preview, so reset it on every fan change
    // (mirrors ConversationPane) — never send fan A's media/price to fan B.
    resetVaultForConversation();
  }, [accountId, fanId]);
  useEffect(
    () => () => {
      handleConversationChange(null, null);
      resetVaultForConversation();
    },
    [],
  );

  // EVERY open hydrates (PLAN item 13): one read-only tail GET — the same
  // fetch a full chat open does — so reactivation work self-refreshes the data
  // fan by fan. Main's per-fan stamp (5-min TTL) is the spend ceiling, so J/K
  // walking and reopening stay free. We observe the result instead of swallowing
  // it: a genuinely-empty fan falls through to sp.noHistory in the thread, while
  // a transient fetch error raises a quiet, retriable banner (no auto-retry).
  const username = row?.username ?? null;
  useEffect(() => {
    let active = true;
    const startedAt = Date.now();
    queueMicrotask(() => {
      if (active) setHydrateClock({ key: hydrateRequestKey, startedAt, now: startedAt });
    });
    hydratePreviewFan(accountId, fanId, username)
      .then((result) => {
        if (!active) return;
        if (result.error !== undefined) {
          setHydrate({ key: hydrateRequestKey, phase: 'error' });
          return;
        }
        setHydrate({
          key: hydrateRequestKey,
          phase: 'done',
          messageCount: result.messageCount,
          skippedByTtl: result.skippedByTtl,
        });
      })
      .catch(() => {
        if (active) setHydrate({ key: hydrateRequestKey, phase: 'error' });
      });
    return () => {
      active = false;
    };
  }, [accountId, fanId, username, hydrateRequestKey]);

  useEffect(() => {
    if (!hydrateStatus.showOverlay) return;
    const id = window.setInterval(() => {
      setHydrateClock((clock) =>
        clock?.key === hydrateRequestKey ? { ...clock, now: Date.now() } : clock,
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [hydrateRequestKey, hydrateStatus.showOverlay]);

  useEffect(() => {
    if (previewAiBlockedReason !== null) {
      setPreviewAiBlocked(fanId, previewAiBlockedReason);
    } else {
      clearPreviewAiBlocked(fanId);
    }
    return () => clearPreviewAiBlocked(fanId);
  }, [clearPreviewAiBlocked, fanId, previewAiBlockedReason, setPreviewAiBlocked]);

  const fan = useFan(accountId, fanId).data ?? null;
  const name = row?.name ?? '';

  return (
    <>
      <button
        type="button"
        aria-label="close"
        onClick={closePreview}
        className="absolute inset-0 z-30 cursor-default bg-scrim"
      />
      <div className="absolute top-1/2 left-1/2 z-40 flex h-[92%] w-[min(1180px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line-strong bg-bg1 shadow-pop">
        <div className="flex flex-none items-center gap-2.5 border-b border-line px-4 py-3">
          <Avatar name={name} url={row?.avatarUrl ?? null} size={28} radius={8} />
          <span className="font-serif text-[15.5px] font-semibold">{name}</span>
          {row?.lifetimeSpend != null && Math.round(row.lifetimeSpend) > 0 && (
            <span className="num text-[10.5px] text-ink-mid">
              {formatWholeDollars(row.lifetimeSpend)}
            </span>
          )}
          {row?.spend30d != null && Math.round(row.spend30d) > 0 && (
            <span className="num text-[10px] font-semibold text-green">
              +{formatWholeDollars(row.spend30d)}
            </span>
          )}
          <PreviewStatusChips accountId={accountId} fanId={fanId} fan={fan} />
          {/* no staleness dot in the preview header (owner decision V-a) */}
          <span className="num ml-auto text-[9.5px] tracking-[0.06em] text-ink-low">
            {t('sp.model')}{' '}
            <b className="font-semibold text-ink-mid">{dayCounter(t, row?.modelDays ?? null)}</b>
            {' · '}
            {t('sp.fan')}{' '}
            <b className="font-semibold text-ink-mid">{dayCounter(t, row?.fanDays ?? null)}</b>
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshBusy}
            title={t('conv.refreshTip')}
            aria-label={refreshBusy ? t('conv.refreshing') : t('conv.refresh')}
            aria-busy={refreshBusy}
            className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-bg2 text-ink-mid transition-colors duration-150 hover:border-clay-line hover:bg-clay-bg hover:text-clay-deep disabled:cursor-default disabled:opacity-50"
          >
            <span className={cx('text-[15px] leading-none', refreshBusy && 'inline-block animate-spin')}>
              ↻
            </span>
          </button>
        </div>
        <ConversationView
          accountId={accountId}
          chatId={fanId}
          features={PREVIEW_FEATURES}
          density="compact"
          scrollMode="paged"
          jumpToLatestKey={jumpToLatestKey}
          aiDisabledReason={previewAiBlockedReason}
          threadOverlay={
            hydrateStatus.showOverlay ? (
              <PreviewHydrateOverlay
                traceText={hydrateTraceText}
                slowText={hydrateSlowText}
                elapsedText={hydrateElapsedText}
              />
            ) : null
          }
        />
        <div className="flex flex-none items-center gap-2 border-t border-line bg-bg1 px-4 py-[9px]">
          <span className="num text-[9.5px] tracking-[0.06em] text-ink-low">{t('sp.previewHint')}</span>
          <span
            className={
              'num text-[9.5px] tracking-[0.06em] ' + (hydrateError ? 'text-warn' : 'text-ink-low')
            }
          >
            {hydrateStatusText}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            disabled={openingChat || row === null}
            onClick={() => {
              if (row === null) return;
              setOpeningChat(true);
              setOpenFailedFor(null);
              ensureAndOpenPreviewChat(row)
                .then((opened) => {
                  if (!opened) setOpenFailedFor(previewKey);
                })
                .catch(() => setOpenFailedFor(previewKey))
                .finally(() => setOpeningChat(false));
            }}
            className={`flex items-center gap-[7px] rounded-[7px] border border-line-strong bg-bg1 px-3 py-[6px] text-[12px] font-semibold text-ink-mid ${
              openingChat || row === null ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-bg2'
            }`}
          >
            {openingChat ? t('sp.syncingChat') : t('sp.openChat')} <Kbd>O</Kbd>
          </button>
        </div>
        {openFailed && (
          <div className="border-t border-line bg-bg1 px-4 pb-2 text-right text-[11px] text-warn">
            {t('sp.openChatFailed')}
          </div>
        )}
        {hydrateError && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-bg1 px-4 pb-2 text-[11px] text-warn">
            <span>{t('sp.historyFetchFailed')}</span>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="cursor-pointer font-semibold underline decoration-dotted underline-offset-2 hover:text-ink-mid"
            >
              {t('sp.retry')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function PreviewHydrateOverlay({
  traceText,
  slowText,
  elapsedText,
}: {
  traceText: string;
  slowText: string | null;
  elapsedText: string;
}): React.JSX.Element {
  const t = useT();
  return (
    <div data-density="compact" className="flex min-h-0 flex-1 flex-col bg-bg0">
      <div className="flex flex-none flex-col gap-1.5 border-b border-line bg-bg1/95 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-[7px] w-[7px] flex-none animate-pulse rounded-full bg-clay" />
          <span className="num flex-none text-micro font-semibold tracking-[0.08em] text-ink-mid">
            {t('sp.historyLoading')}
          </span>
          <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-bg3">
            <span className="block h-full w-full animate-pulse bg-clay" />
          </span>
          <span className="num flex-none text-micro tracking-[0.08em] text-ink-low">{elapsedText}</span>
        </div>
        <div className="num pl-[15px] text-[10px] tracking-[0.06em] text-ink-low">
          {slowText ?? traceText}
        </div>
      </div>
      <div className="min-h-0 flex-1 opacity-70">
        <SkeletonThread />
      </div>
    </div>
  );
}

/**
 * Compact subscription + online chips for the preview header (owner 2026-06-14):
 * same source fields the full ConversationHeader reads (fan.subscription /
 * fan.lastSeen, isOnline/formatLastSeen), shrunk to fit the slim preview bar.
 * Subscription wording reuses the FanPanel keys (fan.subActive/subPerMonth/
 * subFree/subExpired).
 */
function PreviewStatusChips({
  accountId,
  fanId,
  fan,
}: {
  accountId: string;
  fanId: string;
  fan: FanPanelVM | null;
}): React.JSX.Element | null {
  const t = useT();
  // Live hub-SSE presence wins while fresh; fan.lastSeen is the polling-only
  // fallback — same precedence as the full ConversationHeader, so a fan can't
  // read online in the chat and offline in the preview.
  const presence = useUiStore((s) => s.presence[presenceKey(accountId, fanId)]);
  if (fan === null) return null;
  const now = new Date();
  const presenceFresh = presence !== undefined && presence.expiresAt > now.getTime();
  const online = presenceFresh ? presence.online : isOnline(fan.lastSeen, now);
  const lastSeenLabel =
    presenceFresh && presence.online ? t('conv.onlineNow') : formatLastSeen(fan.lastSeen, now, t);
  const sub = fan.subscription;
  return (
    <>
      {sub !== null && sub.status === 'active' && (
        <span className="num rounded-full border border-green-line bg-green-bg px-1.5 py-0.5 text-[9px] font-semibold text-green">
          {t('fan.subActive')}
          {sub.priceUsd != null && sub.priceUsd > 0
            ? ` · ${t('fan.subPerMonth', { price: formatWholeDollars(sub.priceUsd) })}`
            : ` · ${t('fan.subFree')}`}
        </span>
      )}
      {sub !== null && sub.status === 'expired' && (
        <span className="num rounded-full border border-line bg-bg2 px-1.5 py-0.5 text-[9px] font-semibold text-ink-low">
          {t('fan.subExpired')}
        </span>
      )}
      <span
        className={
          'flex items-center gap-[4px] text-[9px] ' + (online ? 'text-green' : 'text-ink-low')
        }
      >
        {online && <span className="h-[6px] w-[6px] rounded-full bg-online" />}
        {lastSeenLabel}
      </span>
    </>
  );
}
