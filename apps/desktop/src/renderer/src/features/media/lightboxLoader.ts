// D42: how the lightbox asks for full-size photos (pure, timer-injectable —
// MediaLightbox is its React adapter). The coordinator's rules:
//   • the opening click and «Загрузить» are explicit (`click`, may spend,
//     may pass the daily budget) and load at once;
//   • stepping with ‹ › or the arrow keys is not a click: a frame reached by
//     navigation asks only after it stayed on screen LIGHTBOX_DWELL_MS, and
//     as `auto` — budgeted, and for a full-size photo Core answers «load on
//     click» (a full already in the local cache still shows);
//   • leaving a frame (or closing) drops its load: a pending dwell timer is
//     cleared, a started automatic load is cancelled in main if it has not
//     begun there yet;
//   • a held arrow key (auto-repeat) never steps.

import type { MediaStateVM, MediaTriggerVM } from '../../../../preload/contract';

export const LIGHTBOX_DWELL_MS = 400;

export interface FullPhotoLoaderDeps {
  load(url: string, trigger: MediaTriggerVM): Promise<MediaStateVM>;
  cancel(url: string): void;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  dwellMs?: number;
}

export interface FullPhotoLoader {
  /**
   * Ask for one frame's full photo. `onAnswer` fires once, unless the returned
   * function (call it on frame change / close) dropped the request first.
   */
  request(url: string, trigger: MediaTriggerVM, onAnswer: (state: MediaStateVM) => void): () => void;
}

export function createFullPhotoLoader(deps: FullPhotoLoaderDeps): FullPhotoLoader {
  const dwellMs = deps.dwellMs ?? LIGHTBOX_DWELL_MS;
  return {
    request(url, trigger, onAnswer) {
      let timer: unknown = null;
      let started = false;
      let settled = false;
      let dropped = false;
      const start = (): void => {
        timer = null;
        started = true;
        deps.load(url, trigger).then(
          (state) => {
            settled = true;
            if (!dropped) onAnswer(state);
          },
          () => {
            settled = true;
            if (!dropped) onAnswer({ state: 'load', reason: 'failed' });
          },
        );
      };
      if (trigger === 'click') start();
      else timer = deps.setTimer(start, dwellMs);
      return () => {
        if (dropped) return;
        dropped = true;
        if (timer !== null) {
          deps.clearTimer(timer);
          timer = null;
        } else if (started && !settled && trigger === 'auto') {
          deps.cancel(url);
        }
      };
    },
  };
}

export type LightboxKeyAction = 'close' | 'prev' | 'next' | 'swallow' | null;

/** The lightbox owns Escape and the arrows while open; a held arrow never steps. */
export function lightboxKeyAction(event: { key: string; repeat: boolean }): LightboxKeyAction {
  if (event.key === 'Escape') return 'close';
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (event.repeat) return 'swallow';
    return event.key === 'ArrowLeft' ? 'prev' : 'next';
  }
  return null;
}

/** The trigger for the frame on screen: explicit until the first step. */
export function lightboxFrameTrigger(navigated: boolean, retried: boolean): MediaTriggerVM {
  return retried || !navigated ? 'click' : 'auto';
}
