// DB-change fanout (SPEC §6.3 single source of truth): every write-path mutation
// publishes here; subscribers (IPC push to renderer) receive deduped batches at
// most once per 50 ms (DESIGN §3.3 stream-batching lesson).

import type { DbChangedEvent } from '../../preload/contract';

export type { DbChangedEvent };

export const DB_CHANGE_FLUSH_MS = 50;

export type DbChangeListener = (events: readonly DbChangedEvent[]) => void;

export interface DbChangeBus {
  publish(event: DbChangedEvent): void;
  subscribe(listener: DbChangeListener): () => void;
  /** Drain pending events immediately (shutdown / tests). */
  flushNow(): void;
  dispose(): void;
}

function dedupeKey(event: DbChangedEvent): string {
  return `${event.scope}|${event.accountId ?? ''}|${event.chatId ?? ''}`;
}

export function createChangeBus(flushIntervalMs: number = DB_CHANGE_FLUSH_MS): DbChangeBus {
  const listeners = new Set<DbChangeListener>();
  let pending = new Map<string, DbChangedEvent>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) {
      return;
    }
    const batch = [...pending.values()];
    pending = new Map();
    for (const listener of listeners) {
      try {
        listener(batch);
      } catch {
        // A faulty subscriber must not break the write path.
      }
    }
  };

  return {
    publish(event) {
      if (disposed) {
        return;
      }
      pending.set(dedupeKey(event), event);
      if (timer === null) {
        timer = setTimeout(flush, flushIntervalMs);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flushNow() {
      flush();
    },
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
      listeners.clear();
    },
  };
}
