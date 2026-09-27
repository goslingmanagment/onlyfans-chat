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
  lightboxKeyAction,
} from '../../src/renderer/src/features/media/lightboxLoader';

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
