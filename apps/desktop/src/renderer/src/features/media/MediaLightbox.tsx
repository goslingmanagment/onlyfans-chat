// D42: full-size photos on click. Opening (or stepping to) a photo is the
// explicit action, so the full file is requested with `cmd:media.load`
// (trigger click — Core may spend credits on it, over the daily budget if
// needed). Video and GIF never load in full: the lightbox shows their
// preview frame only (a blocked preview offers «Загрузить»). Locked files
// stay locked. The thumbnail stands in while the full photo loads; a preview
// that cannot load is a quiet box, never a broken image; nothing here ever
// sees a URL other than media://.

import { useEffect, useState } from 'react';
import type { MediaStateVM, MediaSurfaceVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { MEDIA_LOAD_TIP, formatMediaDuration } from './MediaCell';
import { useLightboxStore, type LightboxItem } from './lightboxStore';
import { mediaSrc, useMediaImage } from './useMediaImage';

type FullState =
  | { phase: 'none' }
  | { phase: 'loading' }
  | { phase: 'ready'; src: string }
  | { phase: 'blocked'; state: MediaStateVM };

let reloadSeq = 0;

function useFullPhoto(item: LightboxItem | null): { state: FullState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const fullUrl = item !== null && item.type === 'photo' && item.isReady && !item.locked ? item.fullUrl : null;
  const key = fullUrl === null ? null : `${fullUrl}#${attempt}`;
  const [result, setResult] = useState<{ key: string | null; state: FullState }>({ key: null, state: { phase: 'none' } });

  useEffect(() => {
    if (key === null || fullUrl === null) return undefined;
    let live = true;
    void getBridge()
      .invoke('cmd:media.load', { url: fullUrl, surface: 'lightbox' })
      .then((answer) => {
        if (!live) return;
        if (answer.state === 'ready') {
          reloadSeq += 1;
          setResult({ key, state: { phase: 'ready', src: mediaSrc(fullUrl, 'lightbox', reloadSeq) } });
        } else {
          setResult({ key, state: { phase: 'blocked', state: answer } });
        }
      })
      .catch(() => {
        if (live) setResult({ key, state: { phase: 'blocked', state: { state: 'load', reason: 'failed' } } });
      });
    return () => {
      live = false;
    };
  }, [key, fullUrl]);

  const state: FullState = key === null ? { phase: 'none' } : result.key === key ? result.state : { phase: 'loading' };
  return { state, retry: () => setAttempt((n) => n + 1) };
}

const STAGE_BOX = 'flex h-[240px] w-[320px] flex-col items-center justify-center gap-2 rounded-[12px] border border-veil-ink/15';
const IMAGE_BOUNDS = 'max-h-[calc(100vh-150px)] max-w-[calc(100vw-160px)] rounded-[6px] object-contain';
const LOAD_BUTTON =
  'cursor-pointer rounded-[7px] border border-veil-ink/25 px-2.5 py-1 text-[12.5px] font-semibold hover:border-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay';

function MotionBadge({ item }: { item: LightboxItem }): React.JSX.Element {
  return (
    <span className="num absolute right-2 bottom-2 rounded-[5px] bg-veil px-1.5 py-0.5 text-[11px] text-veil-ink">
      {item.type === 'gif' ? 'GIF' : `▶ ${item.durationSeconds !== null ? formatMediaDuration(item.durationSeconds) : ''}`}
    </span>
  );
}

/**
 * The thumbnail: a stand-in while a full photo loads, or the content itself
 * for video/GIF (and a photo without a full file). Same gate, states and
 * explicit load as a grid cell.
 */
function LightboxPreview({
  item,
  origin,
  standIn,
}: {
  item: LightboxItem;
  origin: MediaSurfaceVM;
  standIn: boolean;
}): React.JSX.Element {
  const t = useT();
  const { attach, src, phase, onLoad, onError, loadNow } = useMediaImage(item.thumbUrl, origin);
  const isMotion = item.type === 'video' || item.type === 'gif';

  if (item.thumbUrl === null) {
    return (
      <div className={STAGE_BOX}>
        <span className="text-[13px] opacity-80">{t(item.type === 'audio' ? 'media.audio' : 'media.unavailable')}</span>
      </div>
    );
  }
  if (phase.phase === 'blocked') {
    const state = phase.state;
    // A stand-in that cannot load is just an empty stage: the caption speaks
    // for the full photo, which is what the click asked for.
    if (standIn) return <div className={STAGE_BOX} />;
    return (
      <div className={STAGE_BOX}>
        {state.state === 'load' ? (
          <button type="button" onClick={loadNow} title={t(MEDIA_LOAD_TIP[state.reason])} className={LOAD_BUTTON}>
            {t('media.load')}
          </button>
        ) : (
          <span className="text-[13px] opacity-80">
            {t(state.state === 'processing' ? 'media.processing' : 'media.unavailable')}
          </span>
        )}
      </div>
    );
  }
  const ready = phase.phase === 'ready';
  return (
    <div ref={attach} className={cx('relative', !ready && STAGE_BOX)}>
      {!ready && <span className="text-[12.5px] opacity-70">{t('media.loading')}</span>}
      {src !== null && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          className={cx(
            IMAGE_BOUNDS,
            // A thumb stretched to photo size is a placeholder, not the photo.
            standIn && 'min-h-[260px] min-w-[260px] blur-[1px]',
            !ready && 'absolute inset-0 h-full w-full opacity-0',
          )}
        />
      )}
      {ready && isMotion && <MotionBadge item={item} />}
    </div>
  );
}

export function MediaLightbox(): React.JSX.Element | null {
  const t = useT();
  const open = useLightboxStore((s) => s.open);
  const items = useLightboxStore((s) => s.items);
  const index = useLightboxStore((s) => s.index);
  const origin = useLightboxStore((s) => s.origin);
  const step = useLightboxStore((s) => s.step);
  const close = useLightboxStore((s) => s.close);
  const item = open ? items[index] ?? null : null;
  const full = useFullPhoto(item);

  useEffect(() => {
    if (!open) return undefined;
    // Capture phase: the lightbox owns these keys while it is open.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, step]);

  if (!open || item === null) return null;

  const many = items.length > 1;
  const isMotion = item.type === 'video' || item.type === 'gif';
  const blocked = full.state.phase === 'blocked' ? full.state.state : null;

  let stage: React.JSX.Element;
  if (item.locked) {
    stage = (
      <div className={STAGE_BOX}>
        <span className="text-[28px]">🔒</span>
        <span className="text-[13px] opacity-80">{t('media.locked')}</span>
      </div>
    );
  } else if (!item.isReady) {
    stage = (
      <div className={STAGE_BOX}>
        <span className="text-[24px]">⏳</span>
        <span className="text-[13px] opacity-80">{t('media.processing')}</span>
      </div>
    );
  } else if (full.state.phase === 'ready') {
    stage = <img key={full.state.src} src={full.state.src} alt="" draggable={false} className={cx(IMAGE_BOUNDS, 'shadow-pop')} />;
  } else {
    stage = (
      <LightboxPreview
        key={`${item.id}:${item.thumbUrl ?? ''}`}
        item={item}
        origin={origin}
        standIn={item.type === 'photo' && item.fullUrl !== null}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('media.counter', { i: index + 1, n: items.length })}
      className="absolute inset-0 z-50 flex flex-col bg-veil text-veil-ink"
      onMouseDown={close}
    >
      <div className="flex flex-none items-center justify-between px-4 pt-3" onMouseDown={(e) => e.stopPropagation()}>
        <span className="num text-[12px] tracking-[0.04em] opacity-80">
          {many ? t('media.counter', { i: index + 1, n: items.length }) : ''}
        </span>
        <button
          type="button"
          onClick={close}
          title={t('media.close')}
          aria-label={t('media.close')}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[18px] opacity-80 hover:bg-veil-ink/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay"
        >
          ✕
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6">
        {many && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => step(-1)}
            title={t('media.prev')}
            aria-label={t('media.prev')}
            className="absolute top-1/2 left-3 flex h-12 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[10px] text-[22px] opacity-70 hover:bg-veil-ink/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay"
          >
            ‹
          </button>
        )}

        <figure className="flex max-h-full max-w-full flex-col items-center gap-3" onMouseDown={(e) => e.stopPropagation()}>
          {stage}
          <figcaption className="flex min-h-[28px] items-center gap-3 text-[12.5px] opacity-85">
            {isMotion && item.isReady && !item.locked && (
              <span>{t(item.type === 'gif' ? 'media.gifPreview' : 'media.videoPreview')}</span>
            )}
            {full.state.phase === 'loading' && <span className="num opacity-80">{t('media.loading')}</span>}
            {blocked !== null && blocked.state === 'load' && (
              <button type="button" onClick={full.retry} title={t(MEDIA_LOAD_TIP[blocked.reason])} className={LOAD_BUTTON}>
                {t('media.load')}
              </button>
            )}
            {blocked !== null && blocked.state !== 'load' && (
              <span>{t(blocked.state === 'processing' ? 'media.processing' : 'media.unavailable')}</span>
            )}
          </figcaption>
        </figure>

        {many && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => step(1)}
            title={t('media.next')}
            aria-label={t('media.next')}
            className="absolute top-1/2 right-3 flex h-12 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[10px] text-[22px] opacity-70 hover:bg-veil-ink/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
