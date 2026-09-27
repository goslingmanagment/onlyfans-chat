// Chat media gallery (PRD F7): every media message of the conversation as a
// virtualized grid with PPV badges (money green = purchased, amber = unopened
// — DESIGN §4). Replaces the thread pane while the Gallery tab is active.
// D42: the cover is the shared MediaCell (loads only while visible, Core
// decides the cost); a click opens the lightbox over ALL of the message's
// attachments, not only the cover.

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { GalleryItemVM, MessageMediaVM } from '../../../../preload/contract';
import { useChatGallery } from '../../bridge/queries';
import { EmptyState } from '../../design/EmptyState';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { formatClock } from '../../lib/time';
import { MediaCell } from '../media/MediaCell';
import { useLightboxStore } from '../media/lightboxStore';
import { chunkRows, galleryBadge, mergeGalleryPages } from './vaultLogic';

const GRID_COLUMNS = 4;
const CELL_HEIGHT = 168;

interface GalleryCellData {
  item: GalleryItemVM;
  media: MessageMediaVM | null; // first attachment is the cover
}

function GalleryCell({ cell }: { cell: GalleryCellData }): React.JSX.Element {
  const t = useT();
  const show = useLightboxStore((s) => s.show);
  const { item, media } = cell;
  const badge = galleryBadge(item);
  const open = (): void => {
    if (item.media.length > 0) show(item.media, 0, 'gallery');
  };
  return (
    <div className="flex h-[160px] flex-col overflow-hidden rounded-[10px] border border-line bg-bg1">
      <div
        role="button"
        tabIndex={media === null ? -1 : 0}
        title={item.media.length > 1 ? t('media.moreTip', { n: item.media.length }) : t('media.openTip')}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        }}
        className="relative min-h-0 flex-1 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay"
      >
        {media !== null ? (
          <MediaCell item={media} surface="gallery" />
        ) : (
          <div className="media-stripes flex h-full w-full flex-col items-center justify-center gap-1">
            <span className="text-[15px] opacity-50">∅</span>
          </div>
        )}
        {item.mediaCount > 1 && (
          <span className="num pointer-events-none absolute top-1.5 left-1.5 rounded-[4px] bg-bg1/90 px-1.5 text-micro font-semibold text-ink-mid">
            ×{item.mediaCount}
          </span>
        )}
      </div>
      <div className="num flex flex-none items-center gap-2 px-2 py-1 text-micro tracking-[0.05em] text-ink-low">
        <span>{item.createdAt !== null ? formatClock(new Date(item.createdAt)) : ''}</span>
        <span>{item.isSentByMe ? 'SENT' : t('vault.galFromFan')}</span>
        {badge !== null && (
          <span
            className={cx(
              'ml-auto rounded-[4px] border px-1 font-bold',
              badge.tone === 'green'
                ? 'border-green-line bg-green-bg text-green'
                : 'border-amber-line bg-amber-bg text-amber',
            )}
          >
            {t(badge.key, { price: badge.price })}
          </span>
        )}
      </div>
    </div>
  );
}

export function GalleryTab({
  accountId,
  chatId,
}: {
  accountId: string;
  chatId: string;
}): React.JSX.Element {
  const t = useT();
  const query = useChatGallery(accountId, chatId, true);
  const cells = useMemo<GalleryCellData[]>(() => {
    const items = mergeGalleryPages(query.data?.pages ?? []);
    return items.map((item) => ({ item, media: item.media[0] ?? null }));
  }, [query.data]);
  const rows = useMemo(() => chunkRows(cells, GRID_COLUMNS), [cells]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CELL_HEIGHT,
    overscan: 4,
  });

  function onScroll(): void {
    const el = scrollRef.current;
    if (el === null) return;
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 300 &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      void query.fetchNextPage();
    }
  }

  if (query.isPending) {
    return (
      <div className="num flex-1 py-10 text-center text-micro tracking-[0.1em] text-ink-low">
        {t('vault.loadingGallery')}
      </div>
    );
  }
  if (cells.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState glyph="▦" title={t('vault.galEmptyTitle')} hint={t('vault.galEmptyHint')} />
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          if (row === undefined) return null;
          return (
            <div
              key={vi.key}
              className="absolute top-0 left-0 grid w-full gap-2"
              style={{
                transform: `translateY(${vi.start}px)`,
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
              }}
            >
              {row.map((cell) => (
                <GalleryCell key={cell.item.messageId} cell={cell} />
              ))}
            </div>
          );
        })}
      </div>
      {query.isFetchingNextPage && (
        <div className="num py-2 text-center text-micro tracking-[0.1em] text-ink-low">{t('vault.loadingMore')}</div>
      )}
    </div>
  );
}
