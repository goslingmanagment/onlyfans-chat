// D43: full-size photos on click. The opening click and «Загрузить» are the
// explicit action (`cmd:media.load`, trigger click — Core may spend credits,
// past the daily budget if needed); each press is one click on that visit of
// the frame only. A frame reached with ‹ › or the arrows — including one
// pressed on an earlier visit — asks only after it stayed on screen
// (lightboxLoader.ts) and as `auto`: budgeted, and for a full-size photo Core
// answers «load on click», so the thumbnail stays with «Загрузить» — unless
// the full photo is already in the local cache (then it shows, free).
// Video and GIF never load in full: the preview frame only.
// Locked files stay locked. A preview that cannot load is a quiet box, never
// a broken image; nothing here ever sees a URL other than media://.
// The lightbox takes focus while open and gives it back when it closes.

import { useEffect, useRef, useState } from 'react';
import type { MediaStateVM, MediaSurfaceVM, MediaTriggerVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { MEDIA_LOAD_TIP, formatMediaDuration } from './MediaCell';
import {
  createFullPhotoLoader,
  lightboxFullRequest,
  lightboxKeyAction,
  type FullPhotoLoader,
  type LightboxFrame,
} from './lightboxLoader';
import { useLightboxStore, type LightboxItem } from './lightboxStore';
import { mediaSrc, useMediaImage } from './useMediaImage';

type FullState =
  | { phase: 'none' }
  | { phase: 'loading' }
  | { phase: 'ready'; src: string }
  | { phase: 'blocked'; state: MediaStateVM };

let reloadSeq = 0;
let sharedLoader: FullPhotoLoader | null = null;

function fullPhotoLoader(): FullPhotoLoader {
  sharedLoader ??= createFullPhotoLoader({
    load: (url, trigger) => getBridge().invoke('cmd:media.load', { url, surface: 'lightbox', trigger }),
    cancel: (url) => {
      void getBridge().invoke('cmd:media.cancel', { url }).catch(() => undefined);
    },
    setTimer: (run, ms) => window.setTimeout(run, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number),
  });
  return sharedLoader;
}

function useFullPhoto(item: LightboxItem | null, frame: LightboxFrame): FullState {
  const fullUrl = item !== null && item.type === 'photo' && item.isReady && !item.locked ? item.fullUrl : null;
  // A quiet `wait` (Core busy or rate-limited) asks again by itself, same
  // trigger — on this visit only.
  const [waits, setWaits] = useState<{ visit: number; n: number }>({ visit: -1, n: 0 });
  const waited = waits.visit === frame.visit ? waits.n : 0;
  const request = lightboxFullRequest(frame, fullUrl, waited);
  const key = request?.key ?? null;
  const trigger: MediaTriggerVM = request?.trigger ?? 'auto';
  const [result, setResult] = useState<{ key: string | null; state: FullState }>({ key: null, state: { phase: 'none' } });

  useEffect(() => {
    if (key === null || fullUrl === null) return undefined;
    // Dropped on frame change or close: a dwell timer is cleared, an
    // unstarted automatic load is cancelled in main.
    return fullPhotoLoader().request(fullUrl, trigger, (answer) => {
      if (answer.state === 'ready') {
        reloadSeq += 1;
        setResult({ key, state: { phase: 'ready', src: mediaSrc(fullUrl, 'lightbox', reloadSeq) } });
      } else {
        setResult({ key, state: { phase: 'blocked', state: answer } });
      }
    });
  }, [key, fullUrl, trigger]);

  const state: FullState = key === null ? { phase: 'none' } : result.key === key ? result.state : { phase: 'loading' };
  const waitMs = state.phase === 'blocked' && state.state.state === 'wait' ? state.state.retryAfterMs : null;
  const visit = frame.visit;
  useEffect(() => {
    if (waitMs === null) return undefined;
    const timer = window.setTimeout(() => setWaits({ visit, n: waited + 1 }), Math.max(1_000, waitMs));
    return () => window.clearTimeout(timer);
  }, [waitMs, visit, waited]);
  return state;
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
  const { attach, src, phase, onLoad, onError, loadNow } = useMediaImage(item.thumbUrl, origin, { autoLoad: item.isReady });
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

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function MediaLightbox(): React.JSX.Element | null {
  const t = useT();
  const open = useLightboxStore((s) => s.open);
  const items = useLightboxStore((s) => s.items);
  const index = useLightboxStore((s) => s.index);
  const origin = useLightboxStore((s) => s.origin);
  const navigated = useLightboxStore((s) => s.navigated);
  const visit = useLightboxStore((s) => s.visit);
  const presses = useLightboxStore((s) => s.presses);
  const step = useLightboxStore((s) => s.step);
  const press = useLightboxStore((s) => s.press);
  const close = useLightboxStore((s) => s.close);
  const item = open ? items[index] ?? null : null;
  const fullState = useFullPhoto(item, { visit, navigated, presses });
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus moves into the lightbox while it is open and back where it was after.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture phase: the lightbox owns these keys while it is open.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        // Keep focus inside the dialog.
        const dialog = dialogRef.current;
        if (dialog === null) return;
        const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (focusable.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      const action = lightboxKeyAction(event);
      if (action === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'close') close();
      else if (action === 'prev') step(-1);
      else if (action === 'next') step(1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, step]);

  if (!open || item === null) return null;

  const many = items.length > 1;
  const isMotion = item.type === 'video' || item.type === 'gif';
  const blocked = fullState.phase === 'blocked' ? fullState.state : null;

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
  } else if (fullState.phase === 'ready') {
    stage = <img key={fullState.src} src={fullState.src} alt="" draggable={false} className={cx(IMAGE_BOUNDS, 'shadow-pop')} />;
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
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={t('media.counter', { i: index + 1, n: items.length })}
      className="absolute inset-0 z-50 flex flex-col bg-veil text-veil-ink outline-none"
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
            {fullState.phase === 'loading' && <span className="num opacity-80">{t('media.loading')}</span>}
            {blocked !== null && blocked.state === 'load' && (
              <button type="button" onClick={press} title={t(MEDIA_LOAD_TIP[blocked.reason])} className={LOAD_BUTTON}>
                {t('media.load')}
              </button>
            )}
            {blocked !== null && blocked.state === 'wait' && <span className="opacity-80">{t('media.loading')}</span>}
            {blocked !== null && blocked.state !== 'load' && blocked.state !== 'wait' && (
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
