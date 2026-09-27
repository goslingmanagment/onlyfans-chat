// D42: images load only while really visible. `loading="lazy"` is not enough
// here — Chromium starts lazy images 1250–2500 px before the viewport, and on
// this app a started image can be a paid download. One IntersectionObserver
// with rootMargin 0 tracks visibility; a small FIFO grants at most
// MEDIA_GATE_MAX_ACTIVE loads at once and re-checks visibility right before
// it hands a slot out, so a cell scrolled away while it waited never starts.
// A cell that got its slot and scrolls away before its image arrived is told
// (`onHide`): it drops its src and asks main to cancel the load if main has
// not started it yet (D5); the slot goes to the next visible cell.

export const MEDIA_GATE_MAX_ACTIVE = 4;

export interface MediaGateTicket {
  /** Free the slot (image loaded, failed, or unmounted). Idempotent. */
  release(): void;
}

export interface IntersectionObserverLike {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
}

export type IntersectionObserverFactory = (
  callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void,
) => IntersectionObserverLike;

interface Waiter {
  element: Element;
  onGrant: (ticket: MediaGateTicket) => void;
  onHide: (() => void) | undefined;
  granted: boolean;
  cancelled: boolean;
  ticket: MediaGateTicket | null;
}

export interface MediaGate {
  /**
   * Watch `element`; `onGrant` fires when the element is visible AND a slot is
   * free. `onHide` fires when a granted element leaves the viewport: its slot
   * is freed, and it is granted again when it comes back. The returned
   * function stops watching (and frees a held slot).
   */
  watch(element: Element, onGrant: (ticket: MediaGateTicket) => void, onHide?: () => void): () => void;
  /** Test/diagnostic view. */
  activeCount(): number;
}

export function createMediaGate(
  factory: IntersectionObserverFactory,
  maxActive = MEDIA_GATE_MAX_ACTIVE,
): MediaGate {
  const visible = new Map<Element, boolean>();
  const waiters = new Map<Element, Waiter>();
  const queue: Waiter[] = [];
  let active = 0;

  function pump(): void {
    while (active < maxActive && queue.length > 0) {
      const next = queue.shift();
      if (next === undefined || next.cancelled || next.granted) continue;
      // Re-check right before the slot is handed out: a cell that scrolled
      // away while it waited goes back to waiting for visibility.
      if (visible.get(next.element) !== true) continue;
      next.granted = true;
      active += 1;
      let released = false;
      const ticket: MediaGateTicket = {
        release() {
          if (released) return;
          released = true;
          active -= 1;
          pump();
        },
      };
      next.ticket = ticket;
      next.onGrant(ticket);
    }
  }

  const observer = factory((entries) => {
    for (const entry of entries) {
      visible.set(entry.target, entry.isIntersecting);
      const waiter = waiters.get(entry.target);
      if (waiter === undefined || waiter.cancelled) continue;
      if (entry.isIntersecting && !waiter.granted && !queue.includes(waiter)) {
        queue.push(waiter);
      } else if (!entry.isIntersecting && waiter.granted && waiter.onHide !== undefined) {
        // D5: scrolled away while loading — tell the cell, then free its slot.
        const ticket = waiter.ticket;
        waiter.granted = false;
        waiter.ticket = null;
        waiter.onHide();
        ticket?.release();
      }
    }
    pump();
  });

  return {
    watch(element, onGrant, onHide) {
      const waiter: Waiter = { element, onGrant, onHide, granted: false, cancelled: false, ticket: null };
      waiters.set(element, waiter);
      observer.observe(element);
      return () => {
        waiter.cancelled = true;
        waiters.delete(element);
        visible.delete(element);
        observer.unobserve(element);
      };
    },
    activeCount: () => active,
  };
}

let sharedGate: MediaGate | null = null;

/** The app-wide gate over the viewport (rootMargin 0). */
export function getMediaGate(): MediaGate {
  sharedGate ??= createMediaGate((callback) => {
    const io = new IntersectionObserver(
      (entries) => callback(entries.map((entry) => ({ target: entry.target, isIntersecting: entry.isIntersecting }))),
      { root: null, rootMargin: '0px', threshold: 0 },
    );
    return io;
  });
  return sharedGate;
}
