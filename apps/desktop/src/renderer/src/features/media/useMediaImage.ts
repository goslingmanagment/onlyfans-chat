// D42: one gated media image — the React adapter of mediaImageMachine.ts.
// The cell asks the visibility gate for a slot, only then sets `src`
// (media://<token>?s=<surface>); main resolves the token through Core and
// answers with the image or a status. After an error the cell asks main what
// the token can show (`query:media.state`) — «загрузить», «недоступно»,
// «обрабатывается», or a quiet wait — and a click is the explicit action that
// may spend credits (`cmd:media.load`). A cell that leaves the viewport (or
// unmounts) before its image arrived drops its src and asks main to cancel
// the load if it has not started (`cmd:media.cancel`).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaSurfaceVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { getMediaGate, type MediaGateTicket } from './mediaGate';
import {
  initialMediaImageState,
  mediaImageWantsSlot,
  reduceMediaImage,
  type MediaImageEvent,
  type MediaImagePhase,
  type MediaImageState,
} from './mediaImageMachine';

export type { MediaImagePhase } from './mediaImageMachine';

/** `media://` tokens carry the surface (Core's log) and a reload counter. */
export function mediaSrc(url: string, surface: MediaSurfaceVM, reload: number): string {
  if (!url.startsWith('media://')) return url; // dev mock data: URIs
  return `${url}?s=${surface}${reload > 0 ? `&r=${reload}` : ''}`;
}

export function useMediaImage(
  url: string | null,
  surface: MediaSurfaceVM,
  options: {
    /** false: never load by itself (a file still processing) — only `loadNow`. */
    autoLoad?: boolean;
  } = {},
): {
  /** Callback ref for the cell element the gate watches. */
  attach: (element: HTMLElement | null) => void;
  src: string | null;
  phase: MediaImagePhase;
  onLoad: () => void;
  onError: () => void;
  /** Explicit click: fetch now (may spend credits). */
  loadNow: () => void;
} {
  const autoLoad = options.autoLoad ?? true;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [stored, setStored] = useState<MediaImageState>(() => initialMediaImageState(url));
  // A new token starts over (render-time adjustment, no effect round-trip).
  if (stored.url !== url) setStored(initialMediaImageState(url));
  const current = stored.url === url ? stored : initialMediaImageState(url);
  const ticketRef = useRef<MediaGateTicket | null>(null);

  const dispatch = useCallback((event: MediaImageEvent) => {
    setStored((prev) => (prev.url !== url ? prev : reduceMediaImage(prev, event)));
  }, [url]);

  const release = useCallback(() => {
    ticketRef.current?.release();
    ticketRef.current = null;
  }, []);

  const wantsSlot = autoLoad && url !== null && element !== null && mediaImageWantsSlot(current);
  useEffect(() => {
    if (!wantsSlot || url === null || element === null) return undefined;
    const cancelInMain = (): void => {
      void getBridge().invoke('cmd:media.cancel', { url }).catch(() => undefined);
    };
    const unwatch = getMediaGate().watch(
      element,
      (ticket) => {
        ticketRef.current = ticket;
        dispatch({ type: 'granted' });
      },
      () => {
        // The gate already freed the slot.
        ticketRef.current = null;
        dispatch({ type: 'hidden' });
        cancelInMain();
      },
    );
    return () => {
      unwatch();
      if (ticketRef.current !== null) {
        // Unmounted (or the token changed) while still loading.
        release();
        cancelInMain();
      }
    };
  }, [wantsSlot, url, element, dispatch, release]);

  // Timers are driven by the phase: a bounded recheck, or a quiet park.
  const phase = current.phase;
  const recheckDelay = phase.phase === 'recheck' ? phase.delayMs : null;
  useEffect(() => {
    if (recheckDelay === null) return undefined;
    const timer = window.setTimeout(() => dispatch({ type: 'recheckDue' }), recheckDelay);
    return () => window.clearTimeout(timer);
  }, [recheckDelay, dispatch]);
  const parkedFor = phase.phase === 'parked' ? phase.retryAfterMs : null;
  useEffect(() => {
    if (parkedFor === null) return undefined;
    const timer = window.setTimeout(() => dispatch({ type: 'rearm' }), parkedFor);
    return () => window.clearTimeout(timer);
  }, [parkedFor, dispatch]);

  const onLoad = useCallback(() => {
    release();
    dispatch({ type: 'loaded' });
  }, [dispatch, release]);

  const onError = useCallback(() => {
    release();
    if (url === null) return;
    void getBridge()
      .invoke('query:media.state', { url })
      .then((state) => dispatch({ type: 'stateAnswer', state }))
      .catch(() => dispatch({ type: 'stateFailed' }));
  }, [dispatch, release, url]);

  const loadNow = useCallback(() => {
    if (url === null) return;
    dispatch({ type: 'clickStarted' });
    void getBridge()
      .invoke('cmd:media.load', { url, surface, trigger: 'click' })
      .then((state) => dispatch({ type: 'clickAnswer', state }))
      .catch(() => dispatch({ type: 'clickFailed' }));
  }, [dispatch, surface, url]);

  const attach = useCallback((next: HTMLElement | null) => setElement(next), []);
  const showing = current.granted && (phase.phase === 'loading' || phase.phase === 'ready');
  return {
    attach,
    src: url !== null && showing ? mediaSrc(url, surface, current.reload) : null,
    phase,
    onLoad,
    onError,
    loadNow,
  };
}
