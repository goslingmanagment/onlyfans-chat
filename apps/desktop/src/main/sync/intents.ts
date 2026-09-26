// Sync intents (D38): the durable follow-up reads that hub frames oblige.
//
// A hub frame handler never awaits the network any more. Whatever read a
// frame still needs becomes a row in `sync_intents`, written in the SAME
// SQLite transaction as the frame's local state and its v2 cursor, and this
// worker satisfies it afterwards:
//
//   account_list  «this account's chat list is not older than T» — closed by
//                 ANY successful page-1 read that started at or after
//                 T + 2 s (the list endpoint lags the webhook); intent-driven
//                 reads of one account run at most once per 30 s.
//   chat_message  «message M of chat C is visible» (thin frames, D13) — with
//                 auto-read the exact row M must exist (a body read); in
//                 list-only mode a cached head at or past M is enough. Also
//                 closed when M arrives from any source or is deleted.
//   delete_head   a cached head may still show deleted message M — re-checked
//                 after the next qualifying page-1 read.
//
// Failed reads back off exponentially (5, 10, 20 s); after three the intent
// closes with a warning — the 5-minute safety read covers what is left. Open
// intents survive restarts; the worker resumes them once the account's list
// verification of the current session has settled.

import type { DataLayer, SyncIntentKind, SyncIntentRow } from '../db/index';
import type { ListReadOutcome } from './polling-sync';

/** The list endpoint lags the webhook: a read must start this long after T. */
export const INTENT_LIST_LAG_MS = 2_000;
/** At most one intent-driven list read per account per this window. */
export const INTENT_ACCOUNT_READ_MIN_GAP_MS = 30_000;
/** Exponential backoff base after a failed read: 5 s, 10 s, 20 s. */
export const INTENT_BACKOFF_BASE_MS = 5_000;
/** Failed reads after which an intent closes with a warning. */
export const INTENT_MAX_FAILED_READS = 3;

export type SyncIntentCloseReason =
  | 'satisfied'
  | 'message-arrived'
  | 'message-deleted'
  | 'gave-up'
  | 'account-gone';

export interface SyncIntentReads {
  /** Intent-driven page-1 read, body-free. `authoritative` may move a head
   * backwards (a deletion); otherwise a newer local head is kept. */
  accountHead(accountId: string, options: { authoritative: boolean }): Promise<ListReadOutcome>;
  /** Auto-read body read of one chat; `gone` when auto-read is off. */
  chatTail(accountId: string, chatId: string): Promise<ListReadOutcome>;
  autoReadEnabled(): boolean;
  /** List-only proof: the cached head is M or a newer numeric id. */
  listHeadReached(accountId: string, chatId: string, messageId: string): boolean;
}

export interface SyncIntentWorkerOptions {
  data: DataLayer;
  reads: SyncIntentReads;
  /** Intents of an account wait while its list verification is pending (the
   * verification read usually satisfies them for free). */
  accountReady(accountId: string): boolean;
  /** delete_head follow-up: clear a cached head that still shows M. */
  clearTombstonedHeads(accountId: string, messageIds: readonly string[]): void;
  now?: () => number;
  onLog?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export interface SyncIntentWorker {
  /** Open (or widen) «list not older than notBeforeMs». Call inside the
   * frame transaction; kick() after the commit. */
  openAccountList(accountId: string, notBeforeMs: number, reason: string): void;
  /** Open «message M is visible» unless it already is. Returns whether an
   * obligation remains open. */
  openChatMessage(
    accountId: string,
    chatId: string,
    messageId: string,
    notBeforeMs: number,
    reason: string,
  ): boolean;
  /** Re-check a cached head that may still show deleted message M. */
  openDeleteHead(accountId: string, messageId: string, notBeforeMs: number): void;
  /** M arrived (enriched frame, snapshot) or was deleted. */
  closeChatMessage(
    accountId: string,
    chatId: string,
    messageId: string,
    reason: 'message-arrived' | 'message-deleted',
  ): void;
  /** A successful page-1 read of the account started at `startedAtMs`. */
  noteListRead(accountId: string, startedAtMs: number): void;
  /** Re-evaluate the schedule (after a commit or a readiness change). */
  kick(): void;
  start(): void;
  stop(): void;
  /** Diagnostics/tests. */
  openIntents(): SyncIntentRow[];
}

function backoffMs(failedReads: number): number {
  return INTENT_BACKOFF_BASE_MS * 2 ** Math.max(0, failedReads - 1);
}

export function createSyncIntentWorker(options: SyncIntentWorkerOptions): SyncIntentWorker {
  const { data, reads } = options;
  const now = options.now ?? Date.now;
  const onLog = options.onLog ?? ((): void => undefined);

  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let kickQueued = false;
  /** Accounts with a worker read in flight (one at a time per account). */
  const readsInFlight = new Set<string>();
  /** Start of the last intent-driven LIST read per account (30 s limiter). */
  const lastAccountReadAt = new Map<string, number>();

  function describe(row: SyncIntentRow): Record<string, unknown> {
    return {
      id: row.id,
      kind: row.kind,
      accountId: row.accountId,
      ...(row.chatId !== '' ? { chatId: row.chatId } : {}),
      ...(row.messageId !== '' ? { messageId: row.messageId } : {}),
      reason: row.reason,
    };
  }

  function close(row: SyncIntentRow, reason: SyncIntentCloseReason): void {
    if (!data.syncIntents.close(row.id)) {
      return;
    }
    const fields = {
      ...describe(row),
      closeReason: reason,
      failedReads: row.attempts,
      ageMs: now() - row.createdMs,
    };
    if (reason === 'gave-up') {
      onLog('warn', 'sync intent gave up; the safety read covers it', fields);
    } else {
      onLog('info', 'sync intent closed', fields);
    }
  }

  function open(
    kind: SyncIntentKind,
    accountId: string,
    notBeforeMs: number,
    reason: string,
    extra: { chatId?: string; messageId?: string; nextAttemptMs?: number } = {},
  ): SyncIntentRow {
    const nowMs = now();
    const { row, created } = data.syncIntents.open({
      kind,
      accountId,
      ...(extra.chatId !== undefined ? { chatId: extra.chatId } : {}),
      ...(extra.messageId !== undefined ? { messageId: extra.messageId } : {}),
      notBeforeMs,
      reason,
      nextAttemptMs: extra.nextAttemptMs ?? nowMs,
      nowMs,
    });
    if (created) {
      onLog('info', 'sync intent opened', { ...describe(row), notBeforeMs });
    }
    return row;
  }

  /** chat_message proof. `deleted` closes it as well (nothing left to show). */
  function chatIntentState(row: SyncIntentRow): 'open' | 'satisfied' | 'deleted' {
    const local = data.messages.get(row.accountId, row.chatId, row.messageId);
    if (local?.deleted === true) {
      return 'deleted';
    }
    if (local !== null) {
      return 'satisfied';
    }
    if (!reads.autoReadEnabled() && reads.listHeadReached(row.accountId, row.chatId, row.messageId)) {
      return 'satisfied';
    }
    return 'open';
  }

  function closeIfChatSatisfied(row: SyncIntentRow): boolean {
    const state = chatIntentState(row);
    if (state === 'open') {
      return false;
    }
    close(row, state === 'deleted' ? 'message-deleted' : 'satisfied');
    return true;
  }

  /** Record one failed (or non-satisfying) read; give up after the third. */
  function failedRead(row: SyncIntentRow): void {
    const current = data.syncIntents.get(row.id);
    if (current === null) {
      return;
    }
    const attempts = current.attempts + 1;
    if (attempts >= INTENT_MAX_FAILED_READS) {
      close({ ...current, attempts }, 'gave-up');
      return;
    }
    data.syncIntents.recordAttempt(current.id, attempts, now() + backoffMs(attempts));
  }

  function listTargetsOf(intents: readonly SyncIntentRow[]): SyncIntentRow[] {
    const autoRead = reads.autoReadEnabled();
    return intents.filter((row) => row.kind !== 'chat_message' || !autoRead);
  }

  function listDueAt(row: SyncIntentRow): number {
    return Math.max(row.notBeforeMs + INTENT_LIST_LAG_MS, row.nextAttemptMs);
  }

  async function runAccountRead(accountId: string, targets: readonly SyncIntentRow[]): Promise<void> {
    readsInFlight.add(accountId);
    const startedAtMs = now();
    lastAccountReadAt.set(accountId, startedAtMs);
    try {
      const authoritative = targets.some((row) => row.kind === 'delete_head');
      const outcome = await reads.accountHead(accountId, { authoritative });
      onLog(outcome === 'ok' ? 'info' : 'warn', 'sync intent read', {
        accountId,
        read: 'list',
        authoritative,
        outcome,
        intents: targets.map((row) => row.id),
        ms: now() - startedAtMs,
      });
      if (!running) {
        return;
      }
      if (outcome === 'gone') {
        for (const row of data.syncIntents.listOpenForAccount(accountId)) {
          close(row, 'account-gone');
        }
        return;
      }
      for (const target of targets) {
        const row = data.syncIntents.get(target.id);
        if (row === null) {
          continue; // closed by the read (noteListRead) or by another source
        }
        if (outcome === 'ok') {
          if (row.kind === 'chat_message') {
            // A qualifying list read that still does not show M.
            if (!closeIfChatSatisfied(row)) {
              failedRead(row);
            }
          }
          // account_list / delete_head still open after a successful read:
          // a later frame widened T past this read's start — not a failure.
          continue;
        }
        failedRead(row);
      }
    } finally {
      readsInFlight.delete(accountId);
      kick();
    }
  }

  async function runChatRead(row: SyncIntentRow): Promise<void> {
    readsInFlight.add(row.accountId);
    const startedAtMs = now();
    try {
      const outcome = await reads.chatTail(row.accountId, row.chatId);
      onLog(outcome === 'ok' ? 'info' : 'warn', 'sync intent read', {
        accountId: row.accountId,
        chatId: row.chatId,
        read: 'chat',
        outcome,
        intents: [row.id],
        ms: now() - startedAtMs,
      });
      if (!running) {
        return;
      }
      const current = data.syncIntents.get(row.id);
      if (current === null || closeIfChatSatisfied(current)) {
        return;
      }
      if (outcome === 'gone') {
        // Auto-read was switched off meanwhile: the list path takes over.
        return;
      }
      failedRead(current);
    } finally {
      readsInFlight.delete(row.accountId);
      kick();
    }
  }

  function process(): void {
    if (!running) {
      return;
    }
    const nowMs = now();
    let nextWakeMs = Number.POSITIVE_INFINITY;
    const byAccount = new Map<string, SyncIntentRow[]>();
    for (const row of data.syncIntents.listOpen()) {
      // Cheap local proof first: M may have arrived from any source.
      if (row.kind === 'chat_message' && closeIfChatSatisfied(row)) {
        continue;
      }
      const list = byAccount.get(row.accountId) ?? [];
      list.push(row);
      byAccount.set(row.accountId, list);
    }
    for (const [accountId, intents] of byAccount) {
      if (readsInFlight.has(accountId) || !options.accountReady(accountId)) {
        continue; // re-kicked when the read finishes / readiness changes
      }
      const listTargets = listTargetsOf(intents);
      if (listTargets.length > 0) {
        const lastRead = lastAccountReadAt.get(accountId);
        const gateMs = lastRead === undefined ? 0 : lastRead + INTENT_ACCOUNT_READ_MIN_GAP_MS;
        const dueMs = Math.max(Math.min(...listTargets.map(listDueAt)), gateMs);
        if (dueMs <= nowMs) {
          const due = listTargets.filter((row) => listDueAt(row) <= nowMs);
          void runAccountRead(accountId, due);
          continue;
        }
        nextWakeMs = Math.min(nextWakeMs, dueMs);
      }
      const chatTargets = intents.filter(
        (row) => row.kind === 'chat_message' && reads.autoReadEnabled(),
      );
      if (chatTargets.length > 0) {
        const next = chatTargets.reduce((earliest, row) =>
          row.nextAttemptMs < earliest.nextAttemptMs ? row : earliest);
        if (next.nextAttemptMs <= nowMs) {
          void runChatRead(next);
          continue;
        }
        nextWakeMs = Math.min(nextWakeMs, next.nextAttemptMs);
      }
    }
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (Number.isFinite(nextWakeMs)) {
      timer = setTimeout(() => {
        timer = null;
        kick();
      }, Math.max(0, nextWakeMs - now()));
    }
  }

  function kick(): void {
    if (!running || kickQueued) {
      return;
    }
    // Coalesce a burst of commits (replay) into one evaluation.
    kickQueued = true;
    queueMicrotask(() => {
      kickQueued = false;
      try {
        process();
      } catch (error) {
        onLog('warn', 'sync intent worker failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  return {
    openAccountList(accountId, notBeforeMs, reason) {
      open('account_list', accountId, notBeforeMs, reason);
    },
    openChatMessage(accountId, chatId, messageId, notBeforeMs, reason) {
      const existing = data.syncIntents.findChatMessage(accountId, chatId, messageId);
      const probe: SyncIntentRow = existing ?? {
        id: -1,
        kind: 'chat_message',
        accountId,
        chatId,
        messageId,
        notBeforeMs,
        reason,
        attempts: 0,
        nextAttemptMs: now(),
        createdMs: now(),
      };
      if (chatIntentState(probe) !== 'open') {
        if (existing !== null) {
          close(existing, 'message-arrived');
        }
        return false;
      }
      open('chat_message', accountId, notBeforeMs, reason, {
        chatId,
        messageId,
        // Body reads may start at once; list-only proofs wait out the lag.
        nextAttemptMs: now(),
      });
      return true;
    },
    openDeleteHead(accountId, messageId, notBeforeMs) {
      open('delete_head', accountId, notBeforeMs, 'delete', { messageId });
    },
    closeChatMessage(accountId, chatId, messageId, reason) {
      const row = data.syncIntents.findChatMessage(accountId, chatId, messageId);
      if (row !== null) {
        close(row, reason);
      }
    },
    noteListRead(accountId, startedAtMs) {
      const deleteHeads: SyncIntentRow[] = [];
      for (const row of data.syncIntents.listOpenForAccount(accountId)) {
        if (row.kind === 'chat_message') {
          closeIfChatSatisfied(row);
          continue;
        }
        if (row.notBeforeMs + INTENT_LIST_LAG_MS > startedAtMs) {
          continue; // the read started too early to prove this obligation
        }
        if (row.kind === 'delete_head') {
          deleteHeads.push(row);
          continue;
        }
        close(row, 'satisfied');
      }
      if (deleteHeads.length > 0) {
        options.clearTombstonedHeads(accountId, deleteHeads.map((row) => row.messageId));
        for (const row of deleteHeads) {
          close(row, 'satisfied');
        }
      }
      kick();
    },
    kick,
    start() {
      if (running) {
        return;
      }
      running = true;
      const open = data.syncIntents.listOpen();
      if (open.length > 0) {
        onLog('info', 'sync intents resumed', {
          open: open.length,
          byKind: open.reduce<Record<string, number>>((counts, row) => {
            counts[row.kind] = (counts[row.kind] ?? 0) + 1;
            return counts;
          }, {}),
        });
      }
      kick();
    },
    stop() {
      running = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    openIntents: () => data.syncIntents.listOpen(),
  };
}
