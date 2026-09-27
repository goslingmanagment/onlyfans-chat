// D42: one gated media image. The cell asks the visibility gate for a slot,
// only then sets `src` (media://<token>?s=<surface>); main resolves the token
// through Core and answers with the image or a status. After an error the
// cell asks main what the token can show (`query:media.state`) — «загрузить»,
// «недоступно», «обрабатывается» — and a click on «загрузить» is the explicit
// action that may spend credits (`cmd:media.load`).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaStateVM, MediaSurfaceVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { getMediaGate, type MediaGateTicket } from './mediaGate';

export type MediaImagePhase =
  | { phase: 'waiting' }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'blocked'; state: MediaStateVM };

/** `media://` tokens carry the surface (Core's log) and a reload counter. */
export function mediaSrc(url: string, surface: MediaSurfaceVM, reload: number): string {
  if (!url.startsWith('media://')) return url; // dev mock data: URIs
  return `${url}?s=${surface}${reload > 0 ? `&r=${reload}` : ''}`;
}

const PENDING_RECHECKS = 3;
const PENDING_RECHECK_MS = 2_000;

interface ImageState {
  url: string | null;
  granted: boolean;
  reload: number;
  phase: MediaImagePhase;
}

function freshState(url: string | null): ImageState {
  return { url, granted: false, reload: 0, phase: { phase: 'waiting' } };
}

export function useMediaImage(url: string | null, surface: MediaSurfaceVM): {
  /** Callback ref for the cell element the gate watches. */
  attach: (element: HTMLElement | null) => void;
  src: string | null;
  phase: MediaImagePhase;
  onLoad: () => void;
  onError: () => void;
  /** Explicit click: fetch now (may spend credits). */
  loadNow: () => void;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [stored, setStored] = useState<ImageState>(() => freshState(url));
  // A new token starts over (render-time adjustment, no effect round-trip).
  if (stored.url !== url) setStored(freshState(url));
  const current = stored.url === url ? stored : freshState(url);
  const ticketRef = useRef<MediaGateTicket | null>(null);
  const rechecksRef = useRef(0);

  const patch = useCallback((next: Partial<ImageState> | ((prev: ImageState) => Partial<ImageState>)) => {
    setStored((prev) => (prev.url !== url ? prev : { ...prev, ...(typeof next === 'function' ? next(prev) : next) }));
  }, [url]);

  const release = useCallback(() => {
    ticketRef.current?.release();
    ticketRef.current = null;
  }, []);

  useEffect(() => {
    rechecksRef.current = 0;
  }, [url]);

  useEffect(() => {
    if (url === null || element === null || current.granted) return undefined;
    return getMediaGate().watch(element, (ticket) => {
      ticketRef.current = ticket;
      patch({ granted: true, phase: { phase: 'loading' } });
    });
  }, [url, element, current.granted, patch]);

  useEffect(() => release, [release]);

  const onLoad = useCallback(() => {
    release();
    patch({ phase: { phase: 'ready' } });
  }, [patch, release]);

  const onError = useCallback(() => {
    release();
    if (url === null) return;
    void getBridge()
      .invoke('query:media.state', { url })
      .then((state) => {
        const transient = state.state === 'loading' || state.state === 'idle' || state.state === 'ready';
        if (transient && rechecksRef.current < PENDING_RECHECKS) {
          // In flight elsewhere (another cell, another device) or just
          // cached: look again shortly — bounded, never a loop.
          rechecksRef.current += 1;
          patch({ phase: { phase: 'loading' } });
          window.setTimeout(
            () => patch((prev) => ({ reload: prev.reload + 1 })),
            state.state === 'ready' ? 0 : PENDING_RECHECK_MS,
          );
          return;
        }
        patch({ phase: { phase: 'blocked', state: transient ? { state: 'load', reason: 'failed' } : state } });
      })
      .catch(() => patch({ phase: { phase: 'blocked', state: { state: 'unavailable' } } }));
  }, [patch, release, url]);

  const loadNow = useCallback(() => {
    if (url === null) return;
    patch({ phase: { phase: 'loading' } });
    void getBridge()
      .invoke('cmd:media.load', { url, surface })
      .then((state) => {
        if (state.state === 'ready') {
          // The file is in the local cache now: show it (no gate slot needed —
          // this was an explicit click).
          patch((prev) => ({ granted: true, reload: prev.reload + 1, phase: { phase: 'loading' } }));
          return;
        }
        patch({ phase: { phase: 'blocked', state } });
      })
      .catch(() => patch({ phase: { phase: 'blocked', state: { state: 'load', reason: 'failed' } } }));
  }, [patch, surface, url]);

  const attach = useCallback((next: HTMLElement | null) => setElement(next), []);
  const blocked = current.phase.phase === 'blocked';
  return {
    attach,
    src: url !== null && current.granted && !blocked ? mediaSrc(url, surface, current.reload) : null,
    phase: current.phase,
    onLoad,
    onError,
    loadNow,
  };
}
