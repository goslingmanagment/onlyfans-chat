// D42: the one media cell — thread tiles, the chat gallery and the vault grid.
// It never decides cost: it shows what main answers for the token. States:
//   ready image · skeleton while waiting/loading · «загрузить» (budget
//   reached, size unknown, link expired, failed — the click is the explicit
//   action) · «недоступно» (quiet) · «обрабатывается» · 🔒 locked.
// Video and GIF show the preview frame only (plus duration / GIF mark).

import { memo } from 'react';
import type { UiMessageKey } from '@chatgoose/shared/i18n/index';
import type { MediaStateVM, MediaSurfaceVM, MessageMediaVM } from '../../../../preload/contract';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { useMediaImage } from './useMediaImage';

export type MediaCellItem = Pick<MessageMediaVM, 'id' | 'type' | 'thumbUrl' | 'isReady' | 'locked' | 'durationSeconds'>;

export function formatMediaDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

type LoadReason = Extract<MediaStateVM, { state: 'load' }>['reason'];

/** Tooltip for «Загрузить»: why an explicit click is needed. */
export const MEDIA_LOAD_TIP: Record<LoadReason, UiMessageKey> = {
  budget: 'media.loadTip.budget',
  size: 'media.loadTip.size',
  expired: 'media.loadTip.expired',
  failed: 'media.loadTip.failed',
  click: 'media.loadTip.click',
};

function Placeholder({
  glyph,
  label,
  title,
  compact,
}: {
  glyph: string;
  label: string | null;
  title?: string;
  compact: boolean;
}): React.JSX.Element {
  return (
    <span
      title={title}
      className="media-stripes flex h-full w-full flex-col items-center justify-center gap-1 text-center"
    >
      <span className={cx('opacity-60', compact ? 'text-[13px]' : 'text-[15px]')}>{glyph}</span>
      {label !== null && (
        <span className={cx('px-1 leading-tight text-ink-mid', compact ? 'text-[10.5px]' : 'text-[11px]')}>{label}</span>
      )}
    </span>
  );
}

export const MediaCell = memo(function MediaCell({
  item,
  surface,
  compact = false,
  className,
}: {
  item: MediaCellItem;
  surface: MediaSurfaceVM;
  /** Small cells (vault grid): glyph-first, shorter labels. */
  compact?: boolean;
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const viewable = item.isReady && !item.locked && item.thumbUrl !== null;
  const { attach, src, phase, onLoad, onError, loadNow } = useMediaImage(viewable ? item.thumbUrl : null, surface);

  let body: React.JSX.Element;
  if (item.locked) {
    body = <Placeholder glyph="🔒" label={null} title={t('media.locked')} compact={compact} />;
  } else if (!item.isReady) {
    body = <Placeholder glyph="⏳" label={t('media.processing')} compact={compact} />;
  } else if (item.thumbUrl === null) {
    body = (
      <Placeholder
        glyph={item.type === 'audio' ? '♪' : '∅'}
        label={item.type === 'audio' ? t('media.audio') : null}
        compact={compact}
      />
    );
  } else if (phase.phase === 'blocked') {
    const state = phase.state;
    if (state.state === 'load') {
      body = (
        <span className="media-stripes flex h-full w-full items-center justify-center">
          {/* A span-button: the cell may itself be a button (the vault attaches
              on click) and a nested <button> is invalid. Its click is never the
              cell's own action. */}
          <span
            role="button"
            tabIndex={0}
            title={t(MEDIA_LOAD_TIP[state.reason])}
            onClick={(event) => {
              event.stopPropagation();
              loadNow();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                loadNow();
              }
            }}
            className="cursor-pointer rounded-[6px] border border-line-strong bg-bg1 px-2 py-[3px] text-[11px] font-semibold text-ink-mid hover:border-clay-line hover:text-clay-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay"
          >
            {t('media.load')}
          </span>
        </span>
      );
    } else if (state.state === 'processing') {
      body = <Placeholder glyph="⏳" label={t('media.processing')} compact={compact} />;
    } else {
      body = <Placeholder glyph="∅" label={t('media.unavailable')} compact={compact} />;
    }
  } else {
    const loading = phase.phase !== 'ready';
    body = (
      <>
        {loading && <span className="absolute inset-0 animate-pulse bg-bg3" />}
        {src !== null && (
          <img
            src={src}
            alt=""
            decoding="async"
            draggable={false}
            onLoad={onLoad}
            onError={onError}
            className={cx('h-full w-full object-cover', loading && 'opacity-0')}
          />
        )}
      </>
    );
  }

  return (
    <span
      ref={attach}
      data-media-id={item.id}
      className={cx('relative block h-full w-full overflow-hidden bg-bg2', className)}
    >
      {body}
      {!item.locked && item.isReady && (item.type === 'video' || item.type === 'gif') && (
        <span
          title={t(item.type === 'video' ? 'media.videoPreview' : 'media.gifPreview')}
          className="num pointer-events-none absolute right-1 bottom-1 rounded-[4px] border border-line bg-bg1/90 px-1 text-micro text-ink-mid"
        >
          {item.type === 'gif' ? 'GIF' : `▶ ${item.durationSeconds !== null ? formatMediaDuration(item.durationSeconds) : ''}`}
        </span>
      )}
    </span>
  );
});
