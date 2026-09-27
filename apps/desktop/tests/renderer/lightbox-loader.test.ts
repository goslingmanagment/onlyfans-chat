// D42 (review D2): lightbox navigation. The opening click and «Загрузить» load
// the full photo at once as `click`; a frame reached by navigation asks only
// after it stayed 400 ms, as `auto`; leaving a frame drops its load (a dwell
// timer is cleared, a started automatic load is cancelled in main); a held
// arrow key never steps.

import { describe, expect, it, vi } from 'vitest';
import type { MediaStateVM, MediaTriggerVM } from '../../src/preload/contract';
import {
  createFullPhotoLoader,
  LIGHTBOX_DWELL_MS,
  lightboxFrameTrigger,
  lightboxFullRequest,
  lightboxKeyAction,
} from '../../src/renderer/src/features/media/lightboxLoader';
import { useLightboxStore, type LightboxItem } from '../../src/renderer/src/features/media/lightboxStore';

function fakeTimers() {
  let seq = 0;
  const timers = new Map<number, { run: () => void; at: number }>();
  let now = 0;
  return {
    setTimer: (run: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { run, at: now + ms });
      return seq;
    },
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.run();
        }
      }
    },
    pending: () => timers.size,
  };
}

function harness(answer: MediaStateVM = { state: 'ready' }) {
  const timers = fakeTimers();
  const loads: Array<[string, MediaTriggerVM]> = [];
  const cancels: string[] = [];
  let finish: (state: MediaStateVM) => void = () => undefined;
  const loader = createFullPhotoLoader({
    load: (url, trigger) => {
      loads.push([url, trigger]);
      return new Promise<MediaStateVM>((resolve) => {
        finish = resolve;
      });
    },
    cancel: (url) => cancels.push(url),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { loader, timers, loads, cancels, finish: (state: MediaStateVM = answer) => finish(state) };
}

describe('lightbox full-photo loader', () => {
  it('the opening click (and «Загрузить») loads at once as click', () => {
    const h = harness();
    h.loader.request('media://full-1', 'click', () => undefined);
    expect(h.loads).toEqual([['media://full-1', 'click']]);
    expect(h.timers.pending()).toBe(0);
  });

  it('a frame reached by navigation asks only after the dwell, as auto', async () => {
    const h = harness();
    const answers: MediaStateVM[] = [];
    h.loader.request('media://full-2', 'auto', (state) => answers.push(state));
    h.timers.advance(LIGHTBOX_DWELL_MS - 1);
    expect(h.loads).toEqual([]);
    h.timers.advance(1);
    expect(h.loads).toEqual([['media://full-2', 'auto']]);
    h.finish({ state: 'load', reason: 'click' });
    await Promise.resolve();
    expect(answers).toEqual([{ state: 'load', reason: 'click' }]);
  });

  it('stepping through frames quickly loads only the frame that stays', () => {
    const h = harness();
    const drops = ['media://a', 'media://b', 'media://c'].map((url) => h.loader.request(url, 'auto', () => undefined));
    drops[0]!();
    h.timers.advance(100);
    drops[1]!();
    h.timers.advance(LIGHTBOX_DWELL_MS);
    expect(h.loads).toEqual([['media://c', 'auto']]);
    expect(h.cancels).toEqual([]);
  });

  it('leaving (or closing) after an automatic load started cancels it in main; its answer is ignored', async () => {
    const h = harness();
    const answers: MediaStateVM[] = [];
    const drop = h.loader.request('media://full-3', 'auto', (state) => answers.push(state));
    h.timers.advance(LIGHTBOX_DWELL_MS);
    drop();
    drop(); // idempotent
    expect(h.cancels).toEqual(['media://full-3']);
    h.finish({ state: 'ready' });
    await Promise.resolve();
    expect(answers).toEqual([]);
  });

  it('a click in flight is never cancelled (it is the explicit action)', () => {
    const h = harness();
    const drop = h.loader.request('media://full-4', 'click', () => undefined);
    drop();
    expect(h.cancels).toEqual([]);
  });

  it('a failed load answers «Загрузить» (failed)', async () => {
    const answers: MediaStateVM[] = [];
    const loader = createFullPhotoLoader({
      load: () => Promise.reject(new Error('ipc down')),
      cancel: vi.fn(),
      setTimer: (run) => {
        run();
        return 0;
      },
      clearTimer: vi.fn(),
    });
    loader.request('media://full-5', 'click', (state) => answers.push(state));
    await Promise.resolve();
    await Promise.resolve();
    expect(answers).toEqual([{ state: 'load', reason: 'failed' }]);
  });
});

describe('lightbox keys and triggers', () => {
  it('a held arrow key never steps; Escape closes', () => {
    expect(lightboxKeyAction({ key: 'ArrowRight', repeat: false })).toBe('next');
    expect(lightboxKeyAction({ key: 'ArrowLeft', repeat: false })).toBe('prev');
    expect(lightboxKeyAction({ key: 'ArrowRight', repeat: true })).toBe('swallow');
    expect(lightboxKeyAction({ key: 'Escape', repeat: false })).toBe('close');
    expect(lightboxKeyAction({ key: 'k', repeat: false })).toBeNull();
  });

  it('only the opening frame and «Загрузить» are clicks', () => {
    expect(lightboxFrameTrigger(false, false)).toBe('click');
    expect(lightboxFrameTrigger(true, false)).toBe('auto');
    expect(lightboxFrameTrigger(true, true)).toBe('click');
  });
});

describe('lightbox full-photo requests across frames (R6)', () => {
  const photo = (id: string): LightboxItem => ({
    id, type: 'photo', thumbUrl: `media://thumb-${id}`, fullUrl: `media://full-${id}`,
    isReady: true, locked: false, durationSeconds: null,
  });

  /**
   * Mirrors MediaLightbox: a request goes out whenever the frame's request key
   * changes. Returns [frame, trigger] for every request the actions caused.
   */
  function requestsDuring(actions: Array<() => void>): Array<[string, MediaTriggerVM]> {
    const made: Array<[string, MediaTriggerVM]> = [];
    let lastKey: string | null = null;
    const observe = (): void => {
      const state = useLightboxStore.getState();
      const item = state.open ? state.items[state.index] ?? null : null;
      const request = lightboxFullRequest(state, item?.fullUrl ?? null, 0);
      if (request !== null && request.key !== lastKey && item !== null) made.push([item.id, request.trigger]);
      lastKey = request?.key ?? null;
    };
    for (const action of actions) {
      action();
      observe();
    }
    return made;
  }

  it('returning to a frame after «Загрузить» sends no click — only the free automatic ask', () => {
    const lightbox = useLightboxStore.getState();
    const made = requestsDuring([
      () => lightbox.show([photo('A'), photo('B')], 0, 'thread'),
      () => useLightboxStore.getState().press(), // «Загрузить» on A
      () => useLightboxStore.getState().step(1),
      () => useLightboxStore.getState().step(-1), // back on A
    ]);
    expect(made).toEqual([['A', 'click'], ['A', 'click'], ['B', 'auto'], ['A', 'auto']]);
    useLightboxStore.getState().close();
  });

  it('a press belongs to the frame it was made on, and each press is one click', () => {
    const made = requestsDuring([
      () => useLightboxStore.getState().show([photo('A'), photo('B'), photo('C')], 0, 'gallery'),
      () => useLightboxStore.getState().step(1),
      () => useLightboxStore.getState().press(), // B
      () => useLightboxStore.getState().press(), // B again, after a failure
      () => useLightboxStore.getState().step(1), // C
      () => useLightboxStore.getState().step(-1), // B again: a new visit
      () => useLightboxStore.getState().close(),
      () => useLightboxStore.getState().show([photo('A'), photo('B')], 1, 'thread'), // reopened on B by a click
    ]);
    expect(made).toEqual([
      ['A', 'click'], ['B', 'auto'], ['B', 'click'], ['B', 'click'], ['C', 'auto'], ['B', 'auto'], ['B', 'click'],
    ]);
    useLightboxStore.getState().close();
  });

  it('a press on a closed lightbox does nothing', () => {
    useLightboxStore.getState().close();
    useLightboxStore.getState().press();
    expect(useLightboxStore.getState().presses).toBe(0);
  });
});
