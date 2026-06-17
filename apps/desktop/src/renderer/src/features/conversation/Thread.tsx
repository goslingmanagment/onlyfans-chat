// Shared virtualized message thread — the ONE thread used by both the full
// chat (ConversationPane → MessageList) and the Spenders quick-look preview.
// Behaviour is parameterized, not forked:
//   • scrollMode 'stick'  — bottom-stick on new tail + scroll-driven older-page
//                           pagination (the workspace chat, DESIGN §3.2);
//   • scrollMode 'paged'  — a button-driven «↑ earlier» pager, no bottom-stick
//                           (the read-only preview).
//   • density drives BOTH the row-height estimate table (here) and the --cv-*
//     spacing tokens (a data-density subtree; styles/index.css).
// Row renderers (DayDivider/MessageRow/TipLedgerRow/OutboxRow) and the
// build/merge logic stay shared in ThreadRows/OutboxRows/lib.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFlatMessages, useMessages, useOutbox } from '../../bridge/queries';
import { buildThreadRows, type ThreadRow } from '../../lib/messages';
import { mergeOutboxRows } from './sendLogic';
import { SkeletonThread } from '../../design/Skeleton';
import { EmptyState } from '../../design/EmptyState';
import { DayDivider, MessageRow, TipLedgerRow } from './ThreadRows';
import { OutboxRow } from './OutboxRows';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';

export type ThreadDensity = 'comfortable' | 'compact';
export type ThreadScrollMode = 'stick' | 'paged';

type RowMetrics = {
  base: number;
  perLine: number;
  chars: number;
  day: number;
  tip: number;
  outbox: number;
  fallback: number;
};

// One estimate table per density (the virtualizer measures real DOM via
// measureElement; these are just first-paint guesses so scroll lands right).
const ROW_METRICS: Record<ThreadDensity, RowMetrics> = {
  comfortable: { base: 58, perLine: 22, chars: 60, day: 44, tip: 48, outbox: 96, fallback: 64 },
  compact: { base: 50, perLine: 20, chars: 58, day: 34, tip: 42, outbox: 84, fallback: 60 },
};

function estimateRow(row: ThreadRow | undefined, m: RowMetrics): number {
  if (row === undefined) return m.fallback;
  if (row.kind === 'day') return m.day;
  if (row.kind === 'tip') return m.tip;
  if (row.kind === 'outbox') return m.outbox;
  const msg = row.message;
  let h = m.base + Math.ceil(msg.text.length / m.chars) * m.perLine;
  if (msg.media.length > 0) h += 30;
  if (msg.price > 0) h += 32;
  return h;
}

/** Shared data path: the messages query + the rows (thread merged with outbox). */
export function useConversationThread(accountId: string, chatId: string): {
  query: ReturnType<typeof useMessages>;
  rows: readonly ThreadRow[];
} {
  const t = useT();
  const query = useMessages(accountId, chatId);
  const messages = useFlatMessages(query);
  const outbox = useOutbox(accountId, chatId);
  const outboxItems = outbox.data;
  const rows = useMemo(
    () => mergeOutboxRows(buildThreadRows(messages, new Date(), t), outboxItems ?? []),
    [messages, outboxItems, t],
  );
  return { query, rows };
}

export function Thread({
  accountId,
  chatId,
  fanName,
  density = 'comfortable',
  scrollMode = 'stick',
  jumpToLatestKey = null,
}: {
  accountId: string;
  chatId: string;
  fanName: string;
  density?: ThreadDensity;
  scrollMode?: ThreadScrollMode;
  jumpToLatestKey?: string | null;
}): React.JSX.Element {
  const t = useT();
  const { query, rows } = useConversationThread(accountId, chatId);
  const metrics = ROW_METRICS[density];
  const paged = scrollMode === 'paged';

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const initialChatRef = useRef<string | null>(null);
  const anchorKeyRef = useRef<string | null>(null);
  const jumpToLatestKeyRef = useRef<string | null>(null);
  const snapTokenRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateRow(rows[i], metrics),
    overscan: 10,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  const snapToLatest = useCallback(() => {
    if (rows.length === 0) return;
    snapTokenRef.current += 1;
    const token = snapTokenRef.current;

    const snap = (): void => {
      if (snapTokenRef.current !== token) return;
      const totalSize = virtualizer.getTotalSize();
      virtualizer.scrollToIndex(virtualizer.options.count - 1, { align: 'end' });
      virtualizer.scrollToOffset(totalSize);
      const el = scrollRef.current;
      if (el !== null) {
        el.scrollTop = el.scrollHeight;
      }
      bottomRef.current?.scrollIntoView({ block: 'end' });
    };

    snap();
    window.requestAnimationFrame(() => {
      snap();
      window.requestAnimationFrame(snap);
    });
    for (const delay of [50, 150, 300, 600]) {
      window.setTimeout(snap, delay);
    }
  }, [rows.length, virtualizer]);

  // initial paint of a chat: jump to the newest message
  useLayoutEffect(() => {
    if (rows.length === 0) return;
    if (initialChatRef.current !== chatId) {
      initialChatRef.current = chatId;
      stickToBottomRef.current = true;
      anchorKeyRef.current = null;
      snapToLatest();
    }
  }, [chatId, rows.length, snapToLatest]);

  // Preview hydrate can land rows after the thread has already mounted behind
  // an overlay. When the local rows are finally visible, snap to the freshest
  // message once so the user does not land in the middle of the newly loaded
  // page.
  useLayoutEffect(() => {
    if (jumpToLatestKey === null || rows.length === 0) return;
    if (jumpToLatestKeyRef.current === jumpToLatestKey) return;
    jumpToLatestKeyRef.current = jumpToLatestKey;
    anchorKeyRef.current = null;
    stickToBottomRef.current = true;
    snapToLatest();
  }, [jumpToLatestKey, rows.length, snapToLatest]);

  // scrollback: keep the previous top row anchored after older pages prepend
  useLayoutEffect(() => {
    const anchor = anchorKeyRef.current;
    if (anchor === null) return;
    const idx = rows.findIndex((r) => r.key === anchor);
    if (idx > 0) {
      anchorKeyRef.current = null;
      virtualizer.scrollToIndex(idx, { align: 'start' });
    }
  }, [rows, virtualizer]);

  // bottom-stick on new tail messages (stick mode only)
  const lastKey = rows[rows.length - 1]?.key;
  useEffect(() => {
    if (paged) return;
    if (lastKey !== undefined && stickToBottomRef.current && initialChatRef.current === chatId) {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);

  // Re-pin to bottom on VIEWPORT resize. The new-tail effect above only fires on
  // message changes, so it misses the case that bites users: opening/growing the
  // AI dock (also vault panel, composer auto-grow, window resize) shrinks this
  // flex-1 thread, and without a re-stick the newest messages slide under the
  // dock — ConversationView mounts the dock as a flex-none sibling below us, so a
  // taller footer eats the thread's height while scrollTop/content stay put.
  //   • Predicate is the REMEMBERED intent (stickToBottomRef), NOT a freshly
  //     computed distance: the instant the dock opens clientHeight drops, so a
  //     live distance-to-bottom would falsely read "not at bottom". A resize
  //     emits no scroll event, so the flag still reflects the user's intent here.
  //   • scrollToIndex(options.count - 1) matches the two effects above (its
  //     measure-retry lands precisely on dynamic row heights); options.count is
  //     the LIVE row count (setOptions runs each render) — the observer is
  //     attached once per viewport, never per message, so no stale rows.length.
  //   • Gated on hasViewport: the scroll div exists only after data loads (the
  //     early returns below render Skeleton/empty with no scrollRef), so an
  //     effect keyed on [paged] alone would run once with scrollRef.current null
  //     and never re-attach. hasViewport is a boolean → stable across new tail
  //     messages, re-running only when the viewport appears/disappears.
  const hasViewport = !paged && !query.isPending && rows.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null || !hasViewport) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        virtualizer.scrollToIndex(virtualizer.options.count - 1, { align: 'end' });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasViewport, virtualizer]);

  const onScroll = useCallback(() => {
    if (paged) return;
    const el = scrollRef.current;
    if (el === null) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (
      el.scrollTop < 300 &&
      query.hasNextPage &&
      !query.isFetchingNextPage &&
      anchorKeyRef.current === null
    ) {
      anchorKeyRef.current = rows[0]?.key ?? null;
      void query.fetchNextPage();
    }
  }, [paged, query, rows]);

  function loadEarlier(): void {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    anchorKeyRef.current = rows[0]?.key ?? null;
    void query.fetchNextPage();
  }

  if (query.isPending) return <SkeletonThread />;
  if (rows.length === 0) {
    return paged ? (
      <div
        data-density={density}
        className="flex min-h-0 flex-1 items-center justify-center bg-bg0 text-[12.5px] text-ink-low"
      >
        {t('sp.noHistory')}
      </div>
    ) : (
      <div className="flex-1">
        <EmptyState title={t('conv.emptyTitle')} hint={t('conv.emptyHint')} />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      data-density={density}
      className={cx('min-h-0 flex-1 overflow-y-auto bg-bg0', paged && 'pt-3 pb-1.5')}
    >
      {paged && query.hasNextPage === true && (
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
      {!paged && query.isFetchingNextPage && (
        <div className="num py-2 text-center text-micro tracking-[0.1em] text-ink-low">
          {t('conv.loadingOlder')}
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
              className="absolute top-0 left-0 w-full px-[var(--cv-pad-x)]"
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
        <div
          ref={bottomRef}
          aria-hidden="true"
          className="absolute left-0 h-px w-px"
          style={{ transform: `translateY(${Math.max(0, virtualizer.getTotalSize() - 1)}px)` }}
        />
      </div>
    </div>
  );
}
