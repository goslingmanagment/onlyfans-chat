// D42: a message's attachments as tiles inside its bubble (they replaced the
// "{n} media" count badge). Up to four tiles; when there are more, the fourth
// carries «+N» and, like every tile, opens the lightbox over ALL attachments
// of the message. Fixed tile sizes keep the virtualized thread's row heights
// stable while images load. Images load only while visible (MediaCell gate).

import { memo } from 'react';
import type { MessageMediaVM } from '../../../../preload/contract';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { MediaCell } from '../media/MediaCell';
import { useLightboxStore } from '../media/lightboxStore';

export const MEDIA_TILES_MAX = 4;

/** Tile block height (px) for the thread's row estimate. */
export function mediaTilesHeight(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 180;
  if (count === 2) return 150;
  return 118 * 2 + 4;
}

export const MediaThumb = memo(function MediaThumb({
  media,
}: {
  media: readonly MessageMediaVM[];
}): React.JSX.Element | null {
  const t = useT();
  const show = useLightboxStore((s) => s.show);
  if (media.length === 0) return null;
  const tiles = media.slice(0, MEDIA_TILES_MAX);
  const hidden = media.length - tiles.length;
  const single = tiles.length === 1;
  const pair = tiles.length === 2;

  const open = (index: number): void => show([...media], index, 'thread');

  return (
    <div
      className={cx(
        'grid gap-1',
        single ? 'w-[240px] max-w-full grid-cols-1' : pair ? 'w-[304px] max-w-full grid-cols-2' : 'w-[240px] max-w-full grid-cols-2',
      )}
    >
      {tiles.map((item, index) => {
        const last = index === tiles.length - 1 && hidden > 0;
        const more = last ? hidden + 1 : 0;
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            title={more > 0 ? t('media.moreTip', { n: media.length }) : t('media.openTip')}
            onClick={() => open(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open(index);
              }
            }}
            className={cx(
              'relative cursor-pointer overflow-hidden rounded-[8px] border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay',
              single ? 'h-[180px]' : pair ? 'h-[150px]' : 'h-[118px]',
            )}
          >
            <MediaCell item={item} surface="thread" />
            {more > 0 && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-veil/60 text-[20px] font-semibold text-veil-ink">
                {t('media.more', { n: more })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
