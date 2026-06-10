// Virtualized message history: measured heights, day separators, scrollback
// pagination (older pages on near-top scroll, anchor-preserving), bottom-stick
// for incoming messages (DESIGN §3.2).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFlatMessages, useMessages } from '../../bridge/queries';
import { buildThreadRows, type ThreadRow } from '../../lib/messages';
import { SkeletonThread } from '../../design/Skeleton';
import { EmptyState } from '../../design/EmptyState';
import { DayDivider, MessageRow, TipLedgerRow } from './ThreadRows';

function estimateRow(row: ThreadRow | undefined): number {
  if (row === undefined) return 64;
  if (row.kind === 'day') return 44;
  if (row.kind === 'tip') return 48;
  const m = row.message;
  let h = 58 + Math.ceil(m.text.length / 60) * 22;
  if (m.media.length > 0 || m.price > 0) h += 140;
  return h;
}

export function MessageList({
  accountId,
  chatId,
  fanName,
}: {
  accountId: string;
  chatId: string;
  fanName: string;
}): React.JSX.Element {
  const query = useMessages(accountId, chatId);
  const messages = useFlatMessages(query);
  const rows = useMemo(() => buildThreadRows(messages, new Date()), [messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const initialChatRef = useRef<string | null>(null);
  const anchorKeyRef = useRef<string | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateRow(rows[i]),
    overscan: 10,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  // initial paint of a chat: jump to the newest message
  useLayoutEffect(() => {
    if (rows.length === 0) return;
    if (initialChatRef.current !== chatId) {
      initialChatRef.current = chatId;
      stickToBottomRef.current = true;
      anchorKeyRef.current = null;
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    }
  }, [chatId, rows.length, virtualizer]);

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

  // bottom-stick on new tail messages
  const lastKey = rows[rows.length - 1]?.key;
  useEffect(() => {
    if (lastKey !== undefined && stickToBottomRef.current && initialChatRef.current === chatId) {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);

  const onScroll = useCallback(() => {
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
  }, [query, rows]);

  if (query.isPending) return <SkeletonThread />;
  if (rows.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState title="No messages yet" hint="This conversation has no history." />
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      {query.isFetchingNextPage && (
        <div className="num py-2 text-center text-micro tracking-[0.1em] text-ink-low">
          LOADING OLDER…
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
              className="absolute top-0 left-0 w-full px-6"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              {row.kind === 'day' ? (
                <DayDivider label={row.label} />
              ) : row.kind === 'tip' ? (
                <TipLedgerRow message={row.message} fanName={fanName} />
              ) : (
                <MessageRow message={row.message} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
