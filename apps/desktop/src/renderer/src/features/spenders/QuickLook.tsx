// Quick-look mini-chat (P1 overlay per the binding mockup): thread from the
// LOCAL DB only (0 credits — «↑ раньше» pages local history), AI pills reusing
// the composer gates (Ping primary), own composer wired into the ONE send
// engine (SPEC §7 — cmd:send.message; never auto-retry an indeterminate send).
// AI runs only on explicit click/hotkey — no prefetch, no auto-drafts.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SpenderRowVM } from '../../../../preload/contract';
import { useAccounts, useFlatMessages, useMessages, useOutbox, useSettings } from '../../bridge/queries';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useT } from '../../lib/i18n';
import { modCombo } from '../../lib/modKey';
import { formatWholeDollars } from '../../lib/money';
import { Avatar } from '../../design/Avatar';
import { Kbd } from '../../design/Kbd';
import { buildThreadRows, type ThreadRow } from '../../lib/messages';
import { mergeOutboxRows, createTypingThrottle, CANNOT_SEND_FALLBACK } from '../conversation/sendLogic';
import { DayDivider, MessageRow, TipLedgerRow } from '../conversation/ThreadRows';
import { OutboxRow } from '../conversation/OutboxRows';
import { DraftTextarea } from '../conversation/DraftTextarea';
import { sendCurrentDraft } from '../conversation/sendController';
import { getBridge } from '../../bridge/bridge';
import {
  activateDockPart,
  handleConversationChange,
  regenerateActiveOperation,
  setDraftText,
  useAiStore,
} from '../ai/aiStore';
import {
  copyablePartsOf,
  deriveHiLocked,
  evaluateAiGate,
  evaluateHiGate,
  evaluatePingGate,
  errorHint,
  formatOpCost,
  progressLabel,
  DOCK_FEATURE_LABELS,
  type AiGate,
} from '../ai/dockLogic';
import { usePingGate } from '../ai/pingGate';
import { useSpendersStore } from './spendersStore';
import { dayCounter } from './SpenderRowItem';
import {
  focusPreviewComposer,
  hydratePreviewFan,
  ensureAndOpenPreviewChat,
  startAiFromPreview,
  PREVIEW_TEXTAREA_ID,
  type PreviewAiFeature,
} from './previewActions';

function estimateRow(row: ThreadRow | undefined): number {
  if (row === undefined) return 64;
  if (row.kind === 'day') return 40;
  if (row.kind === 'tip') return 44;
  if (row.kind === 'outbox') return 90;
  const m = row.message;
  let h = 54 + Math.ceil(m.text.length / 52) * 21;
  if (m.media.length > 0 || m.price > 0) h += 140;
  return h;
}

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
  const previewKey = `${accountId}/${fanId}`;
  const openFailed = openFailedFor === previewKey;

  // The preview IS the active conversation while open: per-chat draft
  // load/persist + dock discard-on-switch ride the existing machinery.
  useEffect(() => {
    handleConversationChange(accountId, fanId);
  }, [accountId, fanId]);
  useEffect(
    () => () => {
      handleConversationChange(null, null);
    },
    [],
  );

  // EVERY open hydrates (PLAN item 13): one read-only tail GET — the same
  // fetch a full chat open does — so reactivation work self-refreshes the data
  // fan by fan. Main's per-fan stamp (5-min TTL) is the spend ceiling, so J/K
  // walking and reopening stay free.
  useEffect(() => {
    hydratePreviewFan(accountId, fanId, row?.username ?? null);
  }, [accountId, fanId, row?.username]);

  const name = row?.name ?? '';
  const canSend = row?.canSendMessage ?? false;
  // Platform block tokens → human-readable (live-verified 2026-06-13:
  // expired fans arrive as canSendMessage=false + 'unsubscribed').
  const rawReason = row?.canNotSendReason ?? null;
  const cannotReason =
    row !== null && !row.hasChat
      ? t('sp.noChatSend')
      : rawReason === 'unsubscribed'
        ? t('sp.reason.unsubscribed')
        : rawReason === 'chat_unavailable'
          ? t('sp.reason.chat_unavailable')
          : (rawReason ?? CANNOT_SEND_FALLBACK);

  return (
    <>
      <button
        type="button"
        aria-label="close"
        onClick={closePreview}
        className="absolute inset-0 z-30 cursor-default bg-scrim"
      />
      <div className="absolute top-1/2 left-1/2 z-40 flex max-h-[88%] w-[620px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line-strong bg-bg1 shadow-pop">
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
          {/* no staleness dot in the preview header (owner decision V-a) */}
          <span className="num ml-auto text-[9.5px] tracking-[0.06em] text-ink-low">
            {t('sp.model')}{' '}
            <b className="font-semibold text-ink-mid">{dayCounter(t, row?.modelDays ?? null)}</b>
            {' · '}
            {t('sp.fan')}{' '}
            <b className="font-semibold text-ink-mid">{dayCounter(t, row?.fanDays ?? null)}</b>
          </span>
        </div>
        <PreviewThread accountId={accountId} fanId={fanId} fanName={name} />
        <PreviewDock accountId={accountId} fanId={fanId} canSend={canSend} />
        <PreviewComposer
          accountId={accountId}
          fanId={fanId}
          canSend={canSend}
          cannotReason={cannotReason}
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
      </div>
    </>
  );
}

function PreviewThread({
  accountId,
  fanId,
  fanName,
}: {
  accountId: string;
  fanId: string;
  fanName: string;
}): React.JSX.Element {
  const t = useT();
  const query = useMessages(accountId, fanId);
  const messages = useFlatMessages(query);
  const outbox = useOutbox(accountId, fanId);
  const rows = useMemo(
    () => mergeOutboxRows(buildThreadRows(messages, new Date()), outbox.data ?? []),
    [messages, outbox.data],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const initialFanRef = useRef<string | null>(null);
  const anchorKeyRef = useRef<string | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateRow(rows[i]),
    overscan: 8,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  useLayoutEffect(() => {
    if (rows.length === 0) return;
    if (initialFanRef.current !== fanId) {
      initialFanRef.current = fanId;
      anchorKeyRef.current = null;
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    }
  }, [fanId, rows.length, virtualizer]);

  // «↑ раньше» prepends an older local page; keep the previous top row anchored
  useLayoutEffect(() => {
    const anchor = anchorKeyRef.current;
    if (anchor === null) return;
    const index = rows.findIndex((r) => r.key === anchor);
    if (index > 0) {
      anchorKeyRef.current = null;
      virtualizer.scrollToIndex(index, { align: 'start' });
    }
  }, [rows, virtualizer]);

  function loadEarlier(): void {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    anchorKeyRef.current = rows[0]?.key ?? null;
    void query.fetchNextPage();
  }

  return (
    <div className="flex min-h-0 flex-col bg-bg0">
      <div ref={scrollRef} className="h-[340px] overflow-y-auto px-[18px] pt-3 pb-1.5">
        {query.hasNextPage === true && (
          <div className="pb-1.5 text-center">
            <button
              type="button"
              onClick={loadEarlier}
              className="cursor-pointer text-[10.5px] text-ink-low underline decoration-dotted underline-offset-3 hover:text-ink-mid"
            >
              {query.isFetchingNextPage ? t('sp.loading') : t('sp.earlier')}
            </button>
          </div>
        )}
        {rows.length === 0 && !query.isPending && (
          <div className="flex h-full items-center justify-center text-[12.5px] text-ink-low">
            {t('sp.noHistory')}
          </div>
        )}
        <div className="relative mx-auto w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (row === undefined) return null;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                {row.kind === 'day' ? (
                  <DayDivider label={row.label} />
                ) : row.kind === 'tip' ? (
                  <TipLedgerRow message={row.message} fanName={fanName} />
                ) : row.kind === 'outbox' ? (
                  <OutboxRow accountId={accountId} item={row.item} />
                ) : (
                  <MessageRow message={row.message} accountId={accountId} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact dock line (mockup .pvdock): while running — feature + phase; on
 * completion of an insertable draft it lands in the composer (the explicit
 * human action was the hotkey/click that started it; inserting never sends).
 * Hi-greeting variants and copy-degraded results render as chips instead.
 */
function PreviewDock({
  accountId,
  fanId,
  canSend,
}: {
  accountId: string;
  fanId: string;
  canSend: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const op = useAiStore((s) => s.op);
  const status = useAiStore((s) => s.status);
  const phase = useAiStore((s) => s.phase);
  const view = useAiStore((s) => s.view);
  const spend = useAiStore((s) => s.spend);
  const error = useAiStore((s) => s.error);
  const partFeedback = useAiStore((s) => s.partFeedback);
  const pingGate = usePingGate(accountId, fanId, null);
  const insertedOpRef = useRef<string | null>(null);

  const isOurs = op !== null && op.accountId === accountId && op.chatId === fanId;
  const parts = copyablePartsOf(view);
  const autoInsertable =
    isOurs &&
    status === 'completed' &&
    view?.kind === 'drafts' &&
    op.feature !== 'hi-greeting' &&
    canSend &&
    parts.length > 0;

  useEffect(() => {
    if (!autoInsertable || op === null) return;
    if (insertedOpRef.current === op.operationId) return;
    insertedOpRef.current = op.operationId;
    activateDockPart(0, { canSend: true });
    focusPreviewComposer();
  }, [autoInsertable, op]);

  if (!isOurs) return null;

  const featureLabel = DOCK_FEATURE_LABELS[op.feature];
  const segment =
    op.feature === 'ping' && pingGate.data !== undefined && pingGate.data.segment !== 'active'
      ? t('sp.segment', { s: pingGate.data.segment === 'segment-a' ? 'A' : 'B' })
      : null;

  return (
    <div className="flex flex-none items-center gap-2.5 border-t border-line bg-bg1 px-4 py-2">
      <span className="text-[12px] font-semibold text-ink-mid">
        <i className="mr-[5px] text-clay not-italic">✳</i>
        {featureLabel}
        {segment !== null && <span className="font-normal text-ink-low"> · {segment}</span>}
      </span>
      {status === 'running' && (
        <span className="num text-micro tracking-[0.08em] text-ink-low">{progressLabel(phase)}</span>
      )}
      {status === 'error' && error !== null && (
        <span className="min-w-0 truncate text-[11px] text-bad">
          {error.message}
          {errorHint(error) !== null ? ` — ${errorHint(error)}` : ''}
        </span>
      )}
      {status === 'completed' && autoInsertable && (
        <span className="text-[11px] text-ink-low">{t('sp.inserted')}</span>
      )}
      {status === 'completed' && !autoInsertable && parts.length > 0 && (
        <span className="flex items-center gap-1.5">
          {parts.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                activateDockPart(index + 1, { canSend });
                if (canSend) focusPreviewComposer();
              }}
              className="num cursor-pointer rounded-[5px] border border-clay-line bg-clay-bg px-1.5 py-0.5 text-micro font-semibold text-clay-deep hover:border-clay"
            >
              {partFeedback?.partIndex === index + 1
                ? partFeedback.kind === 'inserted'
                  ? 'INSERTED'
                  : 'COPIED'
                : t('sp.variant', { n: index + 1 })}
            </button>
          ))}
        </span>
      )}
      {(status === 'completed' || status === 'error') && (
        <button
          type="button"
          onClick={regenerateActiveOperation}
          className="cursor-pointer text-[11px] text-ink-low underline decoration-dotted underline-offset-3 hover:text-ink-mid"
        >
          {t('sp.anotherVariant')}
        </button>
      )}
      <span className="flex-1" />
      {spend !== null && (
        <span className="num text-[9.5px] text-ink-low">{formatOpCost(spend.totalUsd)}</span>
      )}
    </div>
  );
}

function PreviewComposer({
  accountId,
  fanId,
  canSend,
  cannotReason,
}: {
  accountId: string;
  fanId: string;
  canSend: boolean;
  cannotReason: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const draft = useAiStore((s) => s.draftText);
  const accounts = useAccounts();
  const settings = useSettings();

  // Same gates as the workspace pill row (PLAN item 12: reuse, same tooltips).
  const messages = useMessages(accountId, fanId);
  const pages = messages.data?.pages;
  const lastMessageId = pages?.[0]?.items.at(-1)?.id ?? null;
  const pingGate = usePingGate(accountId, fanId, lastMessageId);
  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const ready = account !== null && settings.data !== undefined;
  const gate: AiGate | null = ready
    ? evaluateAiGate({
        mapped: account.personalityId !== null,
        hasLlmKey: settings.data.hasAnthropicKey || settings.data.hasOpenRouterKey,
      })
    : null;
  const blockedMessage = gate !== null && !gate.ok ? gate.message : null;
  const sendBlockedMessage = canSend ? null : cannotReason;
  const rowDisabled = !ready || blockedMessage !== null || sendBlockedMessage !== null;
  const pingPill = evaluatePingGate(gate, pingGate.data?.blocked ?? null);
  const hiPill = evaluateHiGate(gate, deriveHiLocked(pages));
  const pingEnabled = pingPill.enabled && sendBlockedMessage === null;
  const hiEnabled = hiPill.enabled && sendBlockedMessage === null;

  const throttleRef = useRef(createTypingThrottle());
  useEffect(() => {
    throttleRef.current.reset();
  }, [accountId, fanId]);

  function onDraftChange(text: string): void {
    setDraftText(text);
    if (canSend && throttleRef.current.activity(Date.now())) {
      void getBridge().invoke('cmd:chat.typingActive', { accountId, chatId: fanId });
    }
  }

  function start(feature: PreviewAiFeature): void {
    startAiFromPreview(feature, queryClient);
  }

  const blank = draft.trim().length === 0;

  return (
    <div className="flex-none border-t border-line bg-bg1 px-4 pt-2.5 pb-[11px]">
      <DraftTextarea
        id={PREVIEW_TEXTAREA_ID}
        value={draft}
        onChange={onDraftChange}
        disabled={!canSend}
        placeholder={canSend ? `${modCombo('P')} ping · ${modCombo('↵')} send` : cannotReason}
      />
      <div className="mt-1.5 flex items-center gap-[9px]">
        <PreviewPill
          primary
          dimmed={!pingEnabled}
          disabled={!pingEnabled}
          title={
            sendBlockedMessage ?? (pingPill.enabled ? 'Reactivation message for a silent fan' : pingPill.reason)
          }
          onClick={() => {
            if (pingEnabled) start('ping');
          }}
        >
          <i className="text-clay not-italic">✳</i> Ping <Kbd>{modCombo('P')}</Kbd>
        </PreviewPill>
        <PreviewPill
          dimmed={rowDisabled}
          disabled={rowDisabled}
          title={sendBlockedMessage ?? blockedMessage ?? 'Generate a reply suggestion'}
          onClick={() => {
            if (!rowDisabled) start('fast-reply');
          }}
        >
          Reply
        </PreviewPill>
        <PreviewPill
          dimmed={!hiEnabled}
          disabled={!hiEnabled}
          title={sendBlockedMessage ?? (hiPill.enabled ? '3 opener variants for a fresh conversation' : hiPill.reason)}
          onClick={() => {
            if (hiEnabled) start('hi-greeting');
          }}
        >
          Hi
        </PreviewPill>
        <span className="flex-1" />
        <button
          type="button"
          disabled={!canSend || blank}
          title={canSend ? `Send (${modCombo('↵')})` : cannotReason}
          onClick={() => sendCurrentDraft({ accountId, chatId: fanId, canSend })}
          className="flex cursor-pointer items-center gap-2 rounded-[7px] border border-clay bg-clay px-[15px] py-[7px] text-[13px] font-bold text-white transition-colors hover:bg-clay-deep disabled:cursor-default disabled:opacity-45 disabled:hover:bg-clay"
        >
          Send <Kbd>{modCombo('↵')}</Kbd>
        </button>
      </div>
    </div>
  );
}

function PreviewPill({
  primary = false,
  dimmed,
  disabled,
  title,
  onClick,
  children,
}: {
  primary?: boolean;
  dimmed: boolean;
  disabled: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={
        'flex cursor-pointer items-center gap-1.5 rounded-full border px-[11px] py-[3px] text-[12px] font-semibold transition-colors disabled:cursor-default ' +
        (primary
          ? 'border-clay-line bg-clay-bg text-clay-deep hover:border-clay'
          : 'border-line bg-bg2 text-ink-mid hover:border-clay-line hover:text-clay-deep') +
        (dimmed ? ' opacity-45 hover:border-line hover:text-ink-mid' : '')
      }
    >
      {children}
    </button>
  );
}
