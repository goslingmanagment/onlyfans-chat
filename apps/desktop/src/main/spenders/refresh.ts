// Spenders scoped refresh queue + quick-look hydrate guard (PLAN item 13;
// binding experiment page mockups/experiments/spenders-freshness.html).
// One read-only tail GET per roster fan of the current scope, skipping fans
// fetched within the shared 5-min TTL (thread_fetch_log — written by every
// fetch path, empty threads included). The LOWEST-priority OFAPI consumer:
// serial, paced, and it PAUSES FIRST when the shift budget guard trips
// (polling merely slows ×4). Progress persists in settings so a restart
// resumes instead of re-spending; the TTL skip makes resumption idempotent.
// Distinct credit-ledger purpose 'spenders-refresh' — the owner sees the cost
// BEFORE the click (button) and AFTER (Activity ledger row).
// STRICTLY READ-ONLY toward OFAPI.

import { z } from 'zod';
import {
  OFAPI_INTER_PAGE_DELAY_MS,
  THREAD_FETCH_TTL_MS,
  isWithinFetchTtl,
  type OfApiPurpose,
} from '@chatgoose/shared';
import type { SleepFn } from '../ofapi/rate-limiter';
import type { DataLayer } from '../db/index';

export const SPENDERS_REFRESH_PURPOSE: OfApiPurpose = 'spenders-refresh';
/** Paused queue (budget exhausted / network down) rechecks at this cadence. */
export const REFRESH_RETRY_MS = 30_000;
/** Consecutive fetch failures before the queue assumes the network is down
 *  and pauses (instead of burning through the scope erroring). */
export const REFRESH_FAILURE_PAUSE_THRESHOLD = 3;
/** Progress persists every N fans — a crash loses at most N-1 steps, and the
 *  per-fan TTL skip makes the replayed steps free. */
const PERSIST_EVERY = 10;

export type SpendersRefreshState = 'running' | 'paused' | 'done' | 'stopped';

/** Additive status frame on the sync:event channel (same pattern as
 *  CreditBalanceEvent): renderers that only run frames through parseSyncEvent
 *  drop it harmlessly. */
export interface SpendersRefreshFrame {
  type: 'spendersRefresh';
  accountId: string;
  /** 'all' or a mapped OM list id — the chip the click happened on. */
  scope: string;
  state: SpendersRefreshState;
  /** Fans processed so far (fetched or TTL-skipped). */
  done: number;
  total: number;
}

export interface SpendersRefreshStatus {
  scope: string;
  state: 'running' | 'paused';
  done: number;
  total: number;
}

/** Discriminated quick-look hydrate outcome (the cmd:spenders.hydrate result).
 *  The renderer needs to tell a genuinely-empty fan (show «нет истории») from a
 *  transient fetch error (quiet, retriable) instead of swallowing both. */
export interface SpendersHydrateResult {
  /** The chat-list ROW resolved. A deep fan we couldn't resolve is `false`, but
   *  the tail GET is keyed by chatId so history can still load anyway. */
  hasChat: boolean;
  /** A tail GET actually ran this call (false ⇒ skipped — see skippedByTtl). */
  fetched: boolean;
  /** Local message count after the call (>0 ⇒ history is present). */
  messageCount: number;
  /** The GET was skipped because the per-fan fetch stamp is still fresh. */
  skippedByTtl: boolean;
  /** Set iff the tail GET threw — the renderer shows a quiet, retriable state
   *  (no stamp was written, so the next open retries). */
  error?: string;
}

export interface SpendersRefreshService {
  /** Quick-look on-open hydrate: ONE tail GET unless the fan was fetched within
   *  the TTL AND already has local history. A fresh stamp over an EMPTY local
   *  thread (a poisoned stamp — a fetch stamped without landing messages, or a
   *  row-less ensureChat aborted) gets exactly one more probe GET; a genuinely-
   *  empty fan is then not re-probed until that stamp expires. Main's stamp is
   *  authoritative and survives restarts. */
  hydrateIfStale(
    accountId: string,
    chatId: string,
    hint?: { username?: string | null },
  ): Promise<SpendersHydrateResult>;
  /** Start the scoped queue (replaces a queue already running on the account
   *  unless it is the same scope, which is a no-op). Returns once started;
   *  processing continues in the background. */
  start(accountId: string, scope: string): Promise<void>;
  stop(accountId: string): void;
  status(accountId: string): SpendersRefreshStatus | null;
  /** Per-scope «последний апдейт» stamps (scope → ISO) for the account. */
  freshness(accountId: string): Record<string, string>;
  /** Resume queues persisted before a restart (composition root, after sync). */
  resume(accountIds: readonly string[]): void;
  subscribe(listener: (frame: SpendersRefreshFrame) => void): () => void;
  dispose(): void;
}

export interface SpendersRefreshOptions {
  data: DataLayer;
  /** Automatic/background sync tail fetch (SPEC §6.1) — ONE page, limit 100.
   *  Gated by auto-read in the sync provider; used by the scoped queue only. */
  refreshChat: (accountId: string, chatId: string, purpose: OfApiPurpose) => Promise<void>;
  /** Deliberate single-chat user read for QuickLook. Same tail write/stamp path
   *  as full chat open, but without openConversation/sweep side effects. */
  readChatTailForUserOpen: (
    accountId: string,
    chatId: string,
    purpose: OfApiPurpose,
  ) => Promise<void>;
  /** Lazy chat-list metadata resolution for deep Spenders rows. */
  ensureChat: (accountId: string, chatId: string, hint?: { username?: string | null }) => Promise<boolean>;
  /** Roster fan ids of a scope (spenders service; board order). */
  scopeChatIds: (accountId: string, scope: string) => Promise<string[]>;
  /** Owner-ordered mapped list ids — an «Все» completion stamps every chip. */
  getMappedListIds: (accountId: string) => Promise<string[]>;
  /** The queue pauses FIRST when the shift budget trips (SPEC §6.1). */
  isBudgetExhausted: () => boolean;
  /**
   * Gate for AUTOMATIC message-body reads (settings.autoReadChats). Default
   * OFF: the per-fan refreshChat tail GET marks each fan read on OnlyFans, so
   * the refresh queue skips it. QuickLook hydrate uses
   * readChatTailForUserOpen because it is a deliberate single-chat read.
   * ensureChat (listChats) is safe and still runs. Default () => false.
   */
  getAutoRead?: () => boolean;
  now?: () => number;
  sleep?: SleepFn;
  ttlMs?: number;
}

const queueStateSchema = z.object({
  scope: z.string(),
  pending: z.array(z.string()),
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
});
type PersistedQueue = z.infer<typeof queueStateSchema>;

const stampsSchema = z.record(z.string(), z.string());

function queueKey(accountId: string): string {
  return `spenders.refreshQueue.${accountId}`;
}

function stampsKey(accountId: string): string {
  return `spenders.refreshedAt.${accountId}`;
}

interface ActiveQueue {
  scope: string;
  pending: string[];
  total: number;
  done: number;
  state: 'running' | 'paused';
  stopRequested: boolean;
  promise: Promise<void>;
}

export function createSpendersRefresh(options: SpendersRefreshOptions): SpendersRefreshService {
  const {
    data,
    refreshChat,
    readChatTailForUserOpen,
    ensureChat,
    scopeChatIds,
    getMappedListIds,
    isBudgetExhausted,
  } = options;
  const getAutoRead = options.getAutoRead ?? ((): boolean => false);
  const now = options.now ?? Date.now;
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const ttlMs = options.ttlMs ?? THREAD_FETCH_TTL_MS;

  const listeners = new Set<(frame: SpendersRefreshFrame) => void>();
  const queues = new Map<string, ActiveQueue>();
  const hydrateInFlight = new Map<string, Promise<void>>();
  // Per-fan freshness stamp a quick-look hydrate already probed and found
  // genuinely EMPTY. Lets a poisoned stamp get exactly ONE more tail GET, while
  // a truly-empty fan is not re-probed until that stamp expires — net ≤1 extra
  // GET / fan / TTL, no loop. Preview path ONLY: the scoped queue (runQueue)
  // never consults it, so 'spenders-refresh' stamping is untouched. In-memory by
  // design — a restart costs at most one extra probe.
  const emptyProbedStampMs = new Map<string, number>();
  let disposed = false;

  function emit(accountId: string, queue: Pick<ActiveQueue, 'scope' | 'done' | 'total'>, state: SpendersRefreshState): void {
    const frame: SpendersRefreshFrame = {
      type: 'spendersRefresh',
      accountId,
      scope: queue.scope,
      state,
      done: queue.done,
      total: queue.total,
    };
    for (const listener of listeners) {
      listener(frame);
    }
  }

  function stampMsOf(accountId: string, chatId: string): number | null {
    const iso = data.threadFetchLog.get(accountId, chatId);
    if (iso === null) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }

  function persist(accountId: string, queue: ActiveQueue): void {
    data.settings.set(queueKey(accountId), {
      scope: queue.scope,
      pending: queue.pending,
      total: queue.total,
      done: queue.done,
    } satisfies PersistedQueue);
  }

  function writeScopeStamps(accountId: string, scope: string, mapped: readonly string[]): void {
    const stamps = data.settings.getParsed(stampsKey(accountId), stampsSchema) ?? {};
    const iso = new Date(now()).toISOString();
    stamps[scope] = iso;
    // A completed «Все» run refreshed every shelf's fans — each chip's line is
    // honestly this fresh too (a stopped/partial run stamps nothing).
    if (scope === 'all') {
      for (const listId of mapped) {
        stamps[listId] = iso;
      }
    }
    data.settings.set(stampsKey(accountId), stamps);
  }

  async function runQueue(accountId: string, queue: ActiveQueue): Promise<void> {
    let consecutiveFailures = 0;
    while (queue.pending.length > 0 && !queue.stopRequested && !disposed) {
      if (isBudgetExhausted()) {
        if (queue.state !== 'paused') {
          queue.state = 'paused';
          persist(accountId, queue);
          emit(accountId, queue, 'paused');
        }
        await sleep(REFRESH_RETRY_MS);
        continue;
      }
      if (queue.state === 'paused') {
        queue.state = 'running';
        emit(accountId, queue, 'running');
      }
      const chatId = queue.pending[0];
      if (chatId === undefined) break;
      // Auto-read OFF: the per-fan tail GET marks the fan read on OnlyFans, so
      // skip it. We still drain the queue (no body reads happen) so the run
      // completes and stamps «последний апдейт» honestly for the cached view.
      if (getAutoRead() && !isWithinFetchTtl(stampMsOf(accountId, chatId), now(), ttlMs)) {
        try {
          await refreshChat(accountId, chatId, SPENDERS_REFRESH_PURPOSE);
          consecutiveFailures = 0;
          await sleep(OFAPI_INTER_PAGE_DELAY_MS); // legacy deep-fetch pacing
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= REFRESH_FAILURE_PAUSE_THRESHOLD) {
            // Likely network-down: pause and retry the SAME fan instead of
            // burning through the whole scope erroring.
            consecutiveFailures = 0;
            queue.state = 'paused';
            persist(accountId, queue);
            emit(accountId, queue, 'paused');
            await sleep(REFRESH_RETRY_MS);
            continue;
          }
          // isolated failure (deactivated fan, transient 5xx): skip the fan —
          // no stamp was written, the next explicit click retries it
        }
      }
      queue.pending.shift();
      queue.done += 1;
      if (queue.done % PERSIST_EVERY === 0) {
        persist(accountId, queue);
      }
      emit(accountId, queue, 'running');
    }

    queues.delete(accountId);
    if (queue.stopRequested || disposed) {
      data.settings.remove(queueKey(accountId));
      emit(accountId, queue, 'stopped');
      return;
    }
    writeScopeStamps(accountId, queue.scope, await getMappedListIds(accountId).catch(() => []));
    data.settings.remove(queueKey(accountId));
    emit(accountId, queue, 'done');
  }

  function launch(accountId: string, persisted: PersistedQueue): void {
    const queue: ActiveQueue = {
      scope: persisted.scope,
      pending: [...persisted.pending],
      total: persisted.total,
      done: persisted.done,
      state: 'running',
      stopRequested: false,
      promise: Promise.resolve(),
    };
    queues.set(accountId, queue);
    persist(accountId, queue);
    emit(accountId, queue, 'running');
    queue.promise = runQueue(accountId, queue);
  }

  return {
    async hydrateIfStale(accountId, chatId, hint) {
      // ensureChat resolves the chat-list ROW for deep Spenders fans (it is
      // listChats-backed — no read marked — so it is always safe), but its
      // failure must NOT block the tail GET: the message fetch is keyed by
      // chatId alone (same as openConversation, which never gates on it).
      let hasChat = false;
      try {
        hasChat = await ensureChat(accountId, chatId, hint);
      } catch {
        // A deep fan we couldn't resolve — hasChat stays false; the tail GET
        // (keyed by chatId alone) still proceeds below.
      }

      const key = `${accountId}|${chatId}`;
      const stampMs = stampMsOf(accountId, chatId);
      const fresh = isWithinFetchTtl(stampMs, now(), ttlMs);
      const localCount = data.messages.count(accountId, chatId);

      // NOTE: opening a quick-look is a DELIBERATE read of THIS chat (exactly
      // like opening the full chat), so it ALWAYS hydrates — it is NOT gated on
      // auto-read. The auto-read=OFF setting only suppresses BACKGROUND
      // read-marking (the polling sweep + the bulk scoped-refresh queue), never
      // a single chat the chatter explicitly opened.

      // Skip the GET only when the stamp is fresh AND we either already have
      // local history (the 0-credit ceiling) or already probed this exact stamp
      // and found the fan genuinely empty. A fresh stamp + empty thread + no
      // prior probe is a poisoned stamp → fall through for one more tail GET.
      if (fresh && (localCount > 0 || emptyProbedStampMs.get(key) === stampMs)) {
        return { hasChat, fetched: false, messageCount: localCount, skippedByTtl: true };
      }
      const probingFreshEmpty = fresh && localCount === 0;

      // Single-flight: J/K walking + reopen must not double-spend before the
      // stamp lands.
      let pending = hydrateInFlight.get(key);
      if (pending === undefined) {
        pending = readChatTailForUserOpen(accountId, chatId, 'message-tail').finally(() =>
          hydrateInFlight.delete(key),
        );
        hydrateInFlight.set(key, pending);
      }
      try {
        await pending;
      } catch (error) {
        // The tail GET threw — fetchChatTail stamps only after a successful GET,
        // so no stamp was written and the next open retries. Surface a quiet,
        // retriable error (no auto-retry loop).
        return {
          hasChat,
          fetched: false,
          messageCount: data.messages.count(accountId, chatId),
          skippedByTtl: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const messageCount = data.messages.count(accountId, chatId);
      if (probingFreshEmpty && messageCount === 0) {
        // Confirmed genuinely empty against the (now-refreshed) stamp — don't
        // probe again until it expires. Bounds empty fans to one extra GET.
        const probedStamp = stampMsOf(accountId, chatId);
        if (probedStamp !== null) {
          emptyProbedStampMs.set(key, probedStamp);
        }
      } else {
        // History landed (or this was a normal stale fetch): drop any stale
        // probe marker so a later emptying never wedges.
        emptyProbedStampMs.delete(key);
      }
      return { hasChat, fetched: true, messageCount, skippedByTtl: false };
    },

    async start(accountId, scope) {
      const active = queues.get(accountId);
      if (active !== undefined) {
        if (active.scope === scope) {
          return; // already refreshing this view
        }
        active.stopRequested = true;
        await active.promise;
      }
      const ids = await scopeChatIds(accountId, scope);
      launch(accountId, { scope, pending: ids, total: ids.length, done: 0 });
    },

    stop(accountId) {
      const active = queues.get(accountId);
      if (active !== undefined) {
        active.stopRequested = true;
      }
    },

    status(accountId) {
      const active = queues.get(accountId);
      if (active === undefined) return null;
      return {
        scope: active.scope,
        state: active.state,
        done: active.done,
        total: active.total,
      };
    },

    freshness(accountId) {
      return data.settings.getParsed(stampsKey(accountId), stampsSchema) ?? {};
    },

    resume(accountIds) {
      for (const accountId of accountIds) {
        if (queues.has(accountId)) continue;
        const persisted = data.settings.getParsed(queueKey(accountId), queueStateSchema);
        if (persisted !== undefined && persisted.pending.length > 0) {
          launch(accountId, persisted);
        } else if (persisted !== undefined) {
          data.settings.remove(queueKey(accountId));
        }
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      disposed = true;
      for (const queue of queues.values()) {
        queue.stopRequested = true;
      }
    },
  };
}
