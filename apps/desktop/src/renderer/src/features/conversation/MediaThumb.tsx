import { memo, useState } from 'react';
import type { MessageMediaVM } from '../../../../preload/contract';
import { cx } from '../../lib/cx';

/** Lazy media thumb with skeleton while decoding and honest not-ready state. */
export const MediaThumb = memo(function MediaThumb({
  media,
}: {
  media: MessageMediaVM;
}): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);

  if (!media.isReady || media.thumbUrl === null) {
    return (
      <div className="flex h-[124px] w-[280px] max-w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-line bg-[repeating-linear-gradient(135deg,#eae4d6_0_12px,#e3dccb_12px_24px)]">
        <span className="text-[15px] opacity-50">{media.locked ? '🔒' : '⏳'}</span>
        <span className="num text-micro tracking-[0.08em] text-ink-mid">
          {media.locked ? 'LOCKED' : 'PROCESSING'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-[124px] w-[280px] max-w-full overflow-hidden rounded-[10px] border border-line">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-bg3" />}
      <img
        src={media.thumbUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cx('h-full w-full object-cover', !loaded && 'opacity-0')}
      />
      {media.type === 'video' && (
        <span className="num absolute right-2 bottom-2 rounded-[5px] border border-line bg-bg1/90 px-[7px] py-[2px] text-micro text-ink-mid">
          ▶ {media.durationSeconds !== null ? formatDuration(media.durationSeconds) : 'video'}
        </span>
      )}
    </div>
  );
});

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
