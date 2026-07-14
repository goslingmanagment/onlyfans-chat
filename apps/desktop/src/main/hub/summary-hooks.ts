// SummaryHubHooks adapters (SPEC §8.5) over HubClient.get/putFanProfile,
// matching the exact seam shape pinned in src/main/ai/coordinator.ts. Both
// hooks are no-throw and own their time budgets (prefetch 5 s, push 10 s) —
// a down or slow hub must never break or delay a Scan. `accountId` resolves
// to a core pageLabel; a null resolution silently skips all hub work.

import {
  HUB_PROFILE_GET_TIMEOUT_MS,
  HUB_PROFILE_PUT_TIMEOUT_MS,
} from '@chatgoose/shared/hub/index';
import type { HubClient } from '@chatgoose/shared/hub/index';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { SummaryHubHooks } from '../ai/coordinator';
import type { DataLayer } from '../db/index';

/** Legacy AGENCY_HUB_PROFILE_MAX_BYTES — UTF-8 byte gate, kept in the caller. */
export const HUB_PROFILE_MAX_BYTES = 50_000;
export const SUMMARY_REPLAY_DELAY_MS = 60_000;

/** Opaque hubSyncState carried on summaries rows; owned by this module. */
export interface HubSummarySyncState extends Record<string, unknown> {
  state: 'synced' | 'pending' | 'rejected';
  at: string;
  reason?: 'delivery-pending' | 'delivery-failed' | 'page-unresolved' | 'oversize';
}

export interface SummaryHubSyncHooks extends SummaryHubHooks {
  /** Replay pending rows immediately (Hub configure) and arm retry on failure. */
  replayPending(): Promise<void>;
  /** Stops new work and awaits every continuation that can still touch SQLite. */
  quiesce(): Promise<void>;
  dispose(): void;
}

export interface SummaryHubHooksOptions {
  client: Pick<HubClient, 'getFanProfile' | 'putFanProfile'>;
  data: DataLayer;
  resolvePageLabel: (accountId: string) => Promise<string | null>;
  /** Exact current Hub-origin + mapping + persona-revision proof. */
  isSummaryCurrent: (accountId: string, entry: SummaryCacheEntry) => boolean;
  /** Exact synchronous page-label proof immediately before/after transport. */
  isPageLabelCurrent: (accountId: string, pageLabel: string) => boolean;
  now?: () => number;
}

/** Resolves `fallback` when the budget elapses or the promise rejects. */
function withBudget<T>(promise: Promise<T>, budgetMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), budgetMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function createSummaryHubHooks(options: SummaryHubHooksOptions): SummaryHubSyncHooks {
  const {
    client,
    data,
    resolvePageLabel,
    isSummaryCurrent,
    isPageLabelCurrent,
  } = options;
  const now = options.now ?? (() => Date.now());
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let replaying: Promise<void> | null = null;
  let disposed = false;
  const activeTasks = new Set<Promise<unknown>>();

  function track<T>(task: Promise<T>): Promise<T> {
    activeTasks.add(task);
    const clear = (): void => {
      activeTasks.delete(task);
    };
    void task.then(clear, clear);
    return task;
  }

  function disposeHooks(): void {
    disposed = true;
    if (replayTimer !== null) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
  }

  function syncState(
    state: HubSummarySyncState['state'],
    reason?: HubSummarySyncState['reason'],
  ): HubSummarySyncState {
    return {
      state,
      at: new Date(now()).toISOString(),
      ...(reason === undefined ? {} : { reason }),
    };
  }

  /** Sets hub_sync_state only on the exact body + generation being delivered. */
  function markSyncState(
    accountId: string,
    fanId: string,
    body: string,
    generatedAt: number,
    state: HubSummarySyncState['state'],
    reason?: HubSummarySyncState['reason'],
  ): void {
    try {
      const entry = data.summaries.get(accountId, fanId);
      if (entry === null || entry.body !== body || entry.generatedAt !== generatedAt) {
        return;
      }
      data.summaries.put(accountId, fanId, {
        ...entry,
        hubSyncState: syncState(state, reason),
      });
    } catch {
      // Sync-state bookkeeping must never surface.
    }
  }

  async function doPrefetch(
    accountId: string,
    fanId: string,
  ): Promise<{ body: string; generatedAt: number } | null> {
    if (disposed) {
      return null;
    }
    const pageLabel = await resolvePageLabel(accountId);
    if (disposed || pageLabel === null) {
      return null;
    }
    const profile = await client.getFanProfile({
      pageLabel,
      fanId,
      timeoutMs: HUB_PROFILE_GET_TIMEOUT_MS,
    });
    if (disposed) {
      return null;
    }
    const version = profile?.profile ?? null;
    if (version === null || version.body.length === 0) {
      return null;
    }
    const createdAtMs = Date.parse(version.createdAt);
    const generatedAt = Number.isFinite(createdAtMs) ? createdAtMs : now();

    // Adopt only a hub profile NEWER than the local cache — an older hub copy
    // must not regress a locally generated summary (push will upload ours).
    const existing = data.summaries.get(accountId, fanId);
    if (existing !== null && existing.generatedAt >= generatedAt) {
      return null;
    }

    // Hydrate immediately so the fan panel sees the hub body even when the
    // operation is discarded mid-await. Personality fields come from the stale
    // row when one exists; the coordinator re-puts a complete entry on adopt.
    const entry: SummaryCacheEntry = {
      body: version.body,
      personalityId: existing?.personalityId ?? '',
      personalityUpdatedAt: existing?.personalityUpdatedAt ?? 0,
      generatedAt,
      spendingVerified: true,
      subscriptionVerified: true,
      ...(existing?.modelId !== undefined ? { modelId: existing.modelId } : {}),
      hubSyncState: syncState('synced'),
    };
    try {
      data.summaries.put(accountId, fanId, entry);
    } catch {
      // Cache hydration is best-effort; the returned value still gets adopted.
    }
    // This legacy read adapter is not exposed by the Hub composition while
    // profiles lack persona provenance. Keep its own hydration bookkeeping
    // exact in case the contract later grows the required fields.
    setTimeout(() => {
      if (!disposed) markSyncState(accountId, fanId, version.body, generatedAt, 'synced');
    }, 0);
    return { body: version.body, generatedAt };
  }

  function scheduleReplay(): void {
    if (disposed || replayTimer !== null) {
      return;
    }
    replayTimer = setTimeout(() => {
      replayTimer = null;
      void replayPending().catch(() => undefined);
    }, SUMMARY_REPLAY_DELAY_MS);
    (replayTimer as unknown as { unref?: () => void }).unref?.();
  }

  async function doPush(
    accountId: string,
    fanId: string,
    body: string,
    generatedAtMs: number,
  ): Promise<boolean> {
    if (disposed) {
      return false;
    }
    const isCurrentDelivery = (): boolean => {
      const entry = data.summaries.get(accountId, fanId);
      return entry !== null
        && entry.body === body
        && entry.generatedAt === generatedAtMs
        && isSummaryCurrent(accountId, entry);
    };
    // A pending row from another Hub origin is deliberately parked. Its body
    // may be valid again if that origin is restored, but it must never ride the
    // currently configured Hub client.
    if (!isCurrentDelivery()) {
      return true;
    }
    if (body.length === 0 || Buffer.byteLength(body, 'utf8') > HUB_PROFILE_MAX_BYTES) {
      markSyncState(accountId, fanId, body, generatedAtMs, 'rejected', 'oversize');
      return true; // explicit non-retriable classification
    }
    // Persist the replay obligation before the first await. A crash, runtime
    // swap, or process exit during page resolution/network I/O must leave a row
    // the next configured hook can discover.
    markSyncState(accountId, fanId, body, generatedAtMs, 'pending', 'delivery-pending');
    const pageLabel = await resolvePageLabel(accountId);
    if (disposed) {
      return false;
    }
    if (!isCurrentDelivery()) {
      return true;
    }
    if (pageLabel === null) {
      markSyncState(accountId, fanId, body, generatedAtMs, 'pending', 'page-unresolved');
      return false;
    }
    if (!isPageLabelCurrent(accountId, pageLabel)) {
      return false;
    }
    const delivered = await withBudget(
      client
        .putFanProfile({
          pageLabel,
          fanId,
          body,
          generatedAtMs,
          timeoutMs: HUB_PROFILE_PUT_TIMEOUT_MS,
        })
        .then(
          () => true,
          () => false,
        ),
      HUB_PROFILE_PUT_TIMEOUT_MS,
      false,
    );
    if (disposed) {
      return delivered;
    }
    if (isCurrentDelivery() && isPageLabelCurrent(accountId, pageLabel)) {
      markSyncState(
        accountId,
        fanId,
        body,
        generatedAtMs,
        delivered ? 'synced' : 'pending',
        delivered ? undefined : 'delivery-failed',
      );
    }
    return delivered;
  }

  function replayPending(): Promise<void> {
    if (disposed) {
      return Promise.resolve();
    }
    if (replaying !== null) {
      return replaying;
    }
    const task = track((async () => {
      for (const pending of data.summaries.listHubSyncPending()) {
        if (disposed) {
          return;
        }
        if (!isSummaryCurrent(pending.accountId, pending.entry)) {
          continue;
        }
        try {
          await doPush(
            pending.accountId,
            pending.fanId,
            pending.entry.body,
            pending.entry.generatedAt,
          );
        } catch {
          markSyncState(
            pending.accountId,
            pending.fanId,
            pending.entry.body,
            pending.entry.generatedAt,
            'pending',
            'delivery-failed',
          );
        }
      }
      // Even an ineligible row stays on a cheap local timer: a later mapping
      // restore can make it current without rebuilding the Hub runtime.
      if (!disposed && data.summaries.listHubSyncPending(1).length > 0) {
        scheduleReplay();
      }
    })());
    replaying = task;
    const clear = (): void => {
      if (replaying === task) replaying = null;
    };
    void task.then(clear, clear);
    return task;
  }

  return {
    prefetchSummary: ({ accountId, fanId }) => disposed
      ? Promise.resolve(null)
      :
      // 5 s budget covers everything including page resolution; on elapse the
      // result is abandoned and generation proceeds (hub down ≠ broken Scan).
      withBudget(track(doPrefetch(accountId, fanId)), HUB_PROFILE_GET_TIMEOUT_MS, null),

    pushSummary: async ({ accountId, fanId, body, generatedAt }) => {
      try {
        const delivered = await track(doPush(accountId, fanId, body, generatedAt));
        if (!delivered) {
          scheduleReplay();
        }
      } catch {
        markSyncState(accountId, fanId, body, generatedAt, 'pending', 'delivery-failed');
        scheduleReplay();
      }
    },
    replayPending,
    async quiesce() {
      disposeHooks();
      while (activeTasks.size > 0) {
        await Promise.allSettled([...activeTasks]);
      }
    },
    dispose() {
      disposeHooks();
    },
  };
}
