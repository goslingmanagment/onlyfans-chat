// D42: the state machine behind one gated media image (useMediaImage is its
// thin React adapter). Pure: every transition is a function of the previous
// state and one event, so the rules are testable without a DOM.
//
//   waiting ──granted──▶ loading ──loaded──▶ ready
//      ▲                   │  └──hidden──▶ waiting (the unstarted load is cancelled in main)
//      │                   └──error──▶ (ask main what the token can show)
//      │                          transient ─▶ recheck ─(delay)─▶ loading   (bounded, 3×)
//      │                          wait      ─▶ parked  ─(retryAfter)─▶ waiting
//      └──────── rearm ───────────  load/unavailable/processing ─▶ blocked
//
// Nothing here ever turns a throttled or busy token into «Загрузить»: `wait`
// (and a transient answer that never settles) parks the cell as a quiet
// placeholder and it tries again by itself; only Core's real "needs a click"
// answers become `blocked` with a load reason.

import type { MediaStateVM } from '../../../../preload/contract';

export const MEDIA_IMAGE_RECHECKS = 3;
export const MEDIA_IMAGE_RECHECK_MS = 2_000;
/** A transient answer that never settled: try again later, quietly. */
export const MEDIA_IMAGE_PARK_MS = 30_000;
const PARK_MIN_MS = 5_000;
const PARK_MAX_MS = 15 * 60_000;

export type MediaImagePhase =
  | { phase: 'waiting' }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'recheck'; delayMs: number }
  | { phase: 'parked'; retryAfterMs: number }
  | { phase: 'blocked'; state: MediaStateVM };

export interface MediaImageState {
  url: string | null;
  /** The <img> may carry a src (a gate slot, or an explicit click). */
  granted: boolean;
  /** Bumped to force a fresh request for the same token. */
  reload: number;
  rechecks: number;
  phase: MediaImagePhase;
}

export type MediaImageEvent =
  | { type: 'granted' }
  | { type: 'hidden' }
  | { type: 'loaded' }
  /** main's answer to query:media.state after an <img> error. */
  | { type: 'stateAnswer'; state: MediaStateVM }
  | { type: 'stateFailed' }
  | { type: 'recheckDue' }
  | { type: 'rearm' }
  | { type: 'clickStarted' }
  /** main's answer to cmd:media.load (the explicit click). */
  | { type: 'clickAnswer'; state: MediaStateVM }
  | { type: 'clickFailed' };

export function initialMediaImageState(url: string | null): MediaImageState {
  return { url, granted: false, reload: 0, rechecks: 0, phase: { phase: 'waiting' } };
}

function park(state: MediaImageState, retryAfterMs: number): MediaImageState {
  const ms = Math.min(PARK_MAX_MS, Math.max(PARK_MIN_MS, Math.round(retryAfterMs)));
  return { ...state, granted: false, phase: { phase: 'parked', retryAfterMs: ms } };
}

function isTransient(state: MediaStateVM): boolean {
  return state.state === 'loading' || state.state === 'idle' || state.state === 'ready';
}

export function reduceMediaImage(state: MediaImageState, event: MediaImageEvent): MediaImageState {
  switch (event.type) {
    case 'granted':
      return state.phase.phase === 'waiting' ? { ...state, granted: true, phase: { phase: 'loading' } } : state;
    case 'hidden':
      // Left the viewport before the bytes arrived: give the slot back.
      return state.phase.phase === 'loading' ? { ...state, granted: false, phase: { phase: 'waiting' } } : state;
    case 'loaded':
      return { ...state, rechecks: 0, phase: { phase: 'ready' } };
    case 'stateAnswer': {
      const answer = event.state;
      if (isTransient(answer)) {
        if (state.rechecks < MEDIA_IMAGE_RECHECKS) {
          return {
            ...state,
            granted: false,
            rechecks: state.rechecks + 1,
            phase: { phase: 'recheck', delayMs: answer.state === 'ready' ? 0 : MEDIA_IMAGE_RECHECK_MS },
          };
        }
        return park(state, MEDIA_IMAGE_PARK_MS);
      }
      if (answer.state === 'wait') return park(state, answer.retryAfterMs);
      return { ...state, granted: false, phase: { phase: 'blocked', state: answer } };
    }
    case 'stateFailed':
      return { ...state, granted: false, phase: { phase: 'blocked', state: { state: 'unavailable' } } };
    case 'recheckDue':
      return state.phase.phase === 'recheck'
        ? { ...state, granted: true, reload: state.reload + 1, phase: { phase: 'loading' } }
        : state;
    case 'rearm':
      return state.phase.phase === 'parked'
        ? { ...state, granted: false, rechecks: 0, reload: state.reload + 1, phase: { phase: 'waiting' } }
        : state;
    case 'clickStarted':
      return { ...state, phase: { phase: 'loading' } };
    case 'clickAnswer': {
      const answer = event.state;
      // The file is in the local cache now: show it (an explicit click needs no gate slot).
      if (answer.state === 'ready') {
        return { ...state, granted: true, rechecks: 0, reload: state.reload + 1, phase: { phase: 'loading' } };
      }
      if (answer.state === 'wait') return park(state, answer.retryAfterMs);
      if (isTransient(answer)) return park(state, MEDIA_IMAGE_PARK_MS);
      return { ...state, granted: false, phase: { phase: 'blocked', state: answer } };
    }
    case 'clickFailed':
      return { ...state, granted: false, phase: { phase: 'blocked', state: { state: 'load', reason: 'failed' } } };
    default:
      return state;
  }
}

/** Still wants a gate slot (or holds one): watch the element while this is true. */
export function mediaImageWantsSlot(state: MediaImageState): boolean {
  return state.phase.phase === 'waiting' || state.phase.phase === 'loading';
}
