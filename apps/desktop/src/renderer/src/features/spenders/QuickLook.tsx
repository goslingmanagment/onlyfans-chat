// Quick-look mini-chat (P1 overlay per the binding mockup): the conversation
// body is the SHARED <ConversationView> (PREVIEW_FEATURES — vault + ping/reply/
// hi/improve, compact dock + compact density, paged read-only thread). This
// shell owns ONLY the modal chrome (scrim, card, compact header with sub/online
// chips, footer) and the read-only lifecycle: the preview IS the active
// conversation while open (draft load/persist + dock discard-on-switch), but it
// runs NO aggressive poll and NO mark-read (0 credits — the full chat owns those).

import { useEffect, useState } from 'react';
import type { FanPanelVM, SpenderRowVM } from '../../../../preload/contract';
import { useFan } from '../../bridge/queries';
import { useT } from '../../lib/i18n';
import { formatWholeDollars } from '../../lib/money';
import { formatLastSeen, isOnline } from '../../lib/time';
import { Avatar } from '../../design/Avatar';
import { Kbd } from '../../design/Kbd';
import { ConversationView } from '../conversation/ConversationView';
import { PREVIEW_FEATURES } from '../conversation/conversationFeatures';
import { handleConversationChange } from '../ai/aiStore';
import { resetVaultForConversation } from '../vault/vaultStore';
import { presenceKey, useUiStore } from '../../state/uiStore';
import { useSpendersStore } from './spendersStore';
import { dayCounter } from './SpenderRowItem';
import { hydratePreviewFan, ensureAndOpenPreviewChat } from './previewActions';

export function QuickLook({
  accountId,
  fanId,
  row,
}: {
  accountId: string;
  fanId: string;
  row: SpenderRowVM | null;
}): React.JSX.Element {
  const t = useT();
  const closePreview = useSpendersStore((s) => s.closePreview);
  const [openingChat, setOpeningChat] = useState(false);
  const [openFailedFor, setOpenFailedFor] = useState<string | null>(null);
  const [hydrateFailedFor, setHydrateFailedFor] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const previewKey = `${accountId}/${fanId}`;
  const openFailed = openFailedFor === previewKey;
  // Derived (not setState-in-effect): switching fans clears the banner instantly
  // because previewKey changes, before the next hydrate even resolves.
  const hydrateError = hydrateFailedFor === previewKey;

  // The preview IS the active conversation while open: per-chat draft
  // load/persist + dock discard-on-switch ride the existing machinery.
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
    hydratePreviewFan(accountId, fanId, username)
      .then((result) => {
        if (active) setHydrateFailedFor(result.error !== undefined ? previewKey : null);
      })
      .catch(() => {
        if (active) setHydrateFailedFor(previewKey);
      });
    return () => {
      active = false;
    };
  }, [accountId, fanId, username, previewKey, retryNonce]);

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
        </div>
        <ConversationView
          accountId={accountId}
          chatId={fanId}
          features={PREVIEW_FEATURES}
          density="compact"
          scrollMode="paged"
        />
        <div className="flex flex-none items-center gap-2 border-t border-line bg-bg1 px-4 py-[9px]">
          <span className="num text-[9.5px] tracking-[0.06em] text-ink-low">{t('sp.previewHint')}</span>
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
