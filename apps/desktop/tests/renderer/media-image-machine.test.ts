// D42 (review D4/D5/D9/D11): the state machine behind one gated media image.
// Pins: a throttled or busy token parks quietly and tries again by itself —
// it never becomes «Загрузить»; the transient recheck loop is bounded and
// ends parked, not blocked; a cell that leaves the viewport while loading
// gives its slot back; an explicit click that comes back ready shows the
// image without a gate slot; Core's "needs a click" answers block with their
// reason.

import { describe, expect, it } from 'vitest';
import {
  initialMediaImageState,
  MEDIA_IMAGE_PARK_MS,
  MEDIA_IMAGE_RECHECKS,
  mediaImageWantsSlot,
  reduceMediaImage,
  type MediaImageEvent,
  type MediaImageState,
} from '../../src/renderer/src/features/media/mediaImageMachine';

const URL = `media://${'a'.repeat(64)}`;

function run(events: MediaImageEvent[], from: MediaImageState = initialMediaImageState(URL)): MediaImageState {
  return events.reduce(reduceMediaImage, from);
}

describe('media image state machine', () => {
  it('waits for a slot, loads, and is ready', () => {
    const loading = run([{ type: 'granted' }]);
    expect(loading).toMatchObject({ granted: true, phase: { phase: 'loading' } });
    expect(mediaImageWantsSlot(loading)).toBe(true);
    const ready = reduceMediaImage(loading, { type: 'loaded' });
    expect(ready.phase).toEqual({ phase: 'ready' });
    expect(mediaImageWantsSlot(ready)).toBe(false);
  });

  it('D5: leaving the viewport while loading gives the slot back; after ready it changes nothing', () => {
    expect(run([{ type: 'granted' }, { type: 'hidden' }])).toMatchObject({ granted: false, phase: { phase: 'waiting' } });
    const ready = run([{ type: 'granted' }, { type: 'loaded' }]);
    expect(reduceMediaImage(ready, { type: 'hidden' })).toBe(ready);
  });

  it('D4: a rate-limited or busy token parks quietly and rearms by itself — never «Загрузить»', () => {
    const parked = run([{ type: 'granted' }, { type: 'stateAnswer', state: { state: 'wait', retryAfterMs: 42_000 } }]);
    expect(parked).toMatchObject({ granted: false, phase: { phase: 'parked', retryAfterMs: 42_000 } });
    const rearmed = reduceMediaImage(parked, { type: 'rearm' });
    expect(rearmed).toMatchObject({ granted: false, phase: { phase: 'waiting' }, reload: parked.reload + 1 });
    expect(mediaImageWantsSlot(rearmed)).toBe(true);
    // A click answered with a wait parks too.
    expect(run([{ type: 'clickStarted' }, { type: 'clickAnswer', state: { state: 'wait', retryAfterMs: 1 } }]).phase)
      .toEqual({ phase: 'parked', retryAfterMs: 5_000 });
  });

  it('D4: the transient recheck loop is bounded and ends parked, not blocked', () => {
    let state = run([{ type: 'granted' }]);
    for (let i = 0; i < MEDIA_IMAGE_RECHECKS; i += 1) {
      state = reduceMediaImage(state, { type: 'stateAnswer', state: { state: 'loading' } });
      expect(state.phase).toEqual({ phase: 'recheck', delayMs: 2_000 });
      state = reduceMediaImage(state, { type: 'recheckDue' });
      // N4: a recheck waits for a gate slot again — no src until it is granted.
      expect(state).toMatchObject({ granted: false, phase: { phase: 'waiting' }, reload: i + 1 });
      expect(mediaImageWantsSlot(state)).toBe(true);
      state = reduceMediaImage(state, { type: 'granted' });
      expect(state).toMatchObject({ granted: true, phase: { phase: 'loading' }, reload: i + 1 });
    }
    state = reduceMediaImage(state, { type: 'stateAnswer', state: { state: 'idle' } });
    expect(state.phase).toEqual({ phase: 'parked', retryAfterMs: MEDIA_IMAGE_PARK_MS });
    // A token already cached rechecks at once.
    expect(run([{ type: 'granted' }, { type: 'stateAnswer', state: { state: 'ready' } }]).phase)
      .toEqual({ phase: 'recheck', delayMs: 0 });
  });

  it('Core\'s "needs a click" and quiet answers block with their state', () => {
    for (const answer of [
      { state: 'load', reason: 'budget' },
      { state: 'unavailable' },
      { state: 'processing', refresh: true },
    ] as const) {
      expect(run([{ type: 'granted' }, { type: 'stateAnswer', state: answer }]).phase).toEqual({ phase: 'blocked', state: answer });
    }
    expect(run([{ type: 'stateFailed' }]).phase).toEqual({ phase: 'blocked', state: { state: 'unavailable' } });
  });

  it('D9: an explicit click that comes back ready shows the image without a gate slot', () => {
    const clicked = run([{ type: 'clickStarted' }]);
    expect(clicked).toMatchObject({ granted: false, phase: { phase: 'loading' } });
    const ready = reduceMediaImage(clicked, { type: 'clickAnswer', state: { state: 'ready' } });
    expect(ready).toMatchObject({ granted: true, reload: 1, phase: { phase: 'loading' } });
    expect(run([{ type: 'clickStarted' }, { type: 'clickAnswer', state: { state: 'processing', refresh: false } }]).phase)
      .toEqual({ phase: 'blocked', state: { state: 'processing', refresh: false } });
    expect(run([{ type: 'clickStarted' }, { type: 'clickFailed' }]).phase)
      .toEqual({ phase: 'blocked', state: { state: 'load', reason: 'failed' } });
  });
});
