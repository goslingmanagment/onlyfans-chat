// D39 purchases: Core's money facts applied locally, from the live v2 stream
// and from the `GET /api/v1/events/v2/facts` catch-up.
//
//   message.ppv_unlocked → message_facts (+ the cached PPV row opens)
//   transaction.posted   → fan_transactions at once, keyed by OFAPI's
//                          transaction id (the sweep's key: no double count)
//   tip.received         → nothing to store (no message/transaction ref);
//                          the stream uses it only for the quiet tip alert
//
// The catch-up is history, never news: it writes state and emits nothing an
// alert could hang on. It costs no OFAPI credits (a Core ledger read). It
// runs per account from a persisted watermark — the first run reads the whole
// ledger history — at every hub (re)configuration (session start, new
// credential: a cursorless stream start skips history) and after every gap
// recovery (409 / snapshot, grant/scope drift). The watermark moves only with
// the catch-up itself, never with stream frames: after a gap the stream
// resumes from a fresh cursor past the gap, so only the catch-up can prove it.

import { z } from 'zod';
import type { HubMoneyFactsResult } from '@chatgoose/shared/hub/index';
import {
  DOMAIN_EVENT_FACT_TYPES,
  frameProvenance,
  mapDomainFrame,
  parseDomainEventFrame,
  type SyncEvent,
} from '@chatgoose/shared/protocol/index';
import type { DataLayer, FanTransactionUpsert, MessageFactSource } from '../db/index';
import { SPEND_RETENTION_MS } from './polling-sync';

export type MoneyFactEvent = Extract<
  SyncEvent,
  { type: 'ppvUnlocked' | 'tipReceived' | 'transactionPosted' }
>;

export function isMoneyFactEvent(event: SyncEvent): event is MoneyFactEvent {
  return event.type === 'ppvUnlocked'
    || event.type === 'tipReceived'
    || event.type === 'transactionPosted';
}

/** Where a fact came from and which ledger row it is. */
export interface MoneyFactContext {
  hubAccountId: number | null;
  accountSeq: number | null;
  /** live | redelivery | repair | unknown (v1 frames carry none: unknown). */
  provenance: string;
  occurredAt: string | null;
  source: MessageFactSource;
}

export type MoneyFactOutcome =
  | {
      kind: 'ppv';
      /** False when the fact names no message (nothing to key it by). */
      recorded: boolean;
      newFact: boolean;
      rowOpened: boolean;
      superseded: number;
    }
  | { kind: 'tip' }
  | {
      kind: 'transaction';
      inserted: boolean;
      /** Why the fact was not applied: past the local retention horizon. */
      skipped: 'retention' | null;
    };

/**
 * Applies one money fact synchronously (callers run it inside the stream
 * frame's transaction or the catch-up page's transaction). Idempotent: a fact
 * delivered twice — by the stream and by the catch-up, or on a replay —
 * changes nothing the second time.
 */
export function applyMoneyFact(
  data: DataLayer,
  event: MoneyFactEvent,
  context: MoneyFactContext,
  nowMs: number,
): MoneyFactOutcome {
  const recordedAt = new Date(nowMs).toISOString();
  switch (event.type) {
    case 'ppvUnlocked': {
      if (event.messageId === undefined) {
        return { kind: 'ppv', recorded: false, newFact: false, rowOpened: false, superseded: 0 };
      }
      const outcome = data.messageFacts.recordPpvUnlock(
        {
          accountId: event.accountId,
          chatId: event.chatId,
          messageId: event.messageId,
          hubAccountId: context.hubAccountId,
          accountSeq: context.accountSeq,
          amountUsd: event.amountUsd ?? null,
          provenance: context.provenance,
          occurredAt: context.occurredAt,
          source: context.source,
        },
        recordedAt,
      );
      return { kind: 'ppv', recorded: true, ...outcome };
    }
    case 'tipReceived':
      return { kind: 'tip' };
    case 'transactionPosted': {
      const createdMs = Date.parse(event.createdAt);
      if (nowMs - createdMs > SPEND_RETENTION_MS) {
        // The sweep prunes past this horizon; re-inserting would only churn.
        return { kind: 'transaction', inserted: false, skipped: 'retention' };
      }
      // Same net rule as the sweep's mapper: Core's netAmount when it is a
      // plausible share of the gross, else the platform's 80 %.
      const net = event.netUsd !== undefined && event.netUsd > 0 && event.netUsd <= event.amountUsd
        ? event.netUsd
        : Math.round(event.amountUsd * 80) / 100;
      const row: FanTransactionUpsert = {
        accountId: event.accountId,
        txId: event.transactionId,
        fanId: event.fanId,
        amount: event.amountUsd,
        net,
        type: event.transactionType ?? null,
        createdAt: new Date(createdMs).toISOString(),
      };
      return {
        kind: 'transaction',
        inserted: data.fanTransactions.insertFromHub(row),
        skipped: null,
      };
    }
  }
}

// ─── Catch-up ───────────────────────────────────────────────────────────────

export type MoneyFactsCatchUpReason =
  | 'session-start'
  | 'reconfigure'
  | 'gap'
  | 'page-mapped';

export type MoneyFactsFetch = (args: {
  hubAccountId: number;
  afterSeq: number;
  limit: number;
}) => Promise<HubMoneyFactsResult>;

/** Facts per request; Core allows up to 1000. Pages 8/9 hold ~1.3k facts in
 * total (2026-09-26), so a first run is 1–2 pages per account. */
export const MONEY_FACTS_PAGE_LIMIT = 500;
/** A run stops after this many pages and continues in a fresh run. */
const MAX_PAGES_PER_RUN = 100;
/** Failed runs retry after these delays, then wait for the next trigger. */
export const MONEY_FACTS_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;

const catchUpStateSchema = z.object({
  /** Core page id the watermark belongs to (a remapped page restarts at 0). */
  hubAccountId: z.number().int().positive(),
  /** `afterSeq` of the next request: every fact at or below it is applied. */
  afterSeq: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type MoneyFactsCatchUpState = z.infer<typeof catchUpStateSchema>;

/** Wiped with the v2 cursor on a hub switch (settings store). */
export function moneyFactsStateKey(accountId: string): string {
  return `hubSync.facts.v1.${accountId}`;
}

export interface MoneyFactsCatchUpOptions {
  data: DataLayer;
  /** Null = hub not configured: requests are no-ops. */
  fetchFacts: MoneyFactsFetch | null;
  accountHandled: (accountId: string) => boolean;
  now: () => number;
  onLog: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
  retryDelaysMs?: readonly number[];
  pageLimit?: number;
}

export interface MoneyFactsCatchUp {
  /**
   * Synchronous and DB-local (safe inside a frame transaction): remembers
   * the account's Core page id from a frame. True when a catch-up is now
   * owed — the page was never seen (history not read yet), it was remapped
   * (its watermark restarts at 0), or a request was waiting for the id.
   */
  notePage(accountId: string, hubAccountId: number): boolean;
  /** Schedules a catch-up of each account (never on the caller's stack). */
  request(accountIds: readonly string[], reason: MoneyFactsCatchUpReason): void;
  start(): void;
  stop(): void;
  state(accountId: string): MoneyFactsCatchUpState | null;
  /** Tests/diagnostics: resolves when no run is scheduled or in flight. */
  whenIdle(): Promise<void>;
}

interface RunCounters {
  pages: number;
  facts: number;
  ppvNew: number;
  ppvOpened: number;
  ppvRepaired: number;
  ppvWithoutMessage: number;
  txInserted: number;
  txKnown: number;
  tips: number;
  malformed: number;
  unmapped: number;
  foreign: number;
}

function emptyCounters(): RunCounters {
  return {
    pages: 0,
    facts: 0,
    ppvNew: 0,
    ppvOpened: 0,
    ppvRepaired: 0,
    ppvWithoutMessage: 0,
    txInserted: 0,
    txKnown: 0,
    tips: 0,
    malformed: 0,
    unmapped: 0,
    foreign: 0,
  };
}

const FACT_TYPES: ReadonlySet<string> = new Set(DOMAIN_EVENT_FACT_TYPES);

export function createMoneyFactsCatchUp(options: MoneyFactsCatchUpOptions): MoneyFactsCatchUp {
  const { data, fetchFacts, accountHandled, now, onLog } = options;
  const retryDelays = options.retryDelaysMs ?? MONEY_FACTS_RETRY_DELAYS_MS;
  const pageLimit = options.pageLimit ?? MONEY_FACTS_PAGE_LIMIT;
  let running = false;
  /** Bumped by stop(): a run that resolves afterwards must not touch the DB
   * (a retired runtime may already have closed it). */
  let generation = 0;
  /** In-memory copy of each account's page id (frames arrive constantly). */
  const knownPages = new Map<string, number>();
  /** Requested before the page id was known; the first frame kicks it. */
  const awaitingPage = new Map<string, MoneyFactsCatchUpReason>();
  const inFlight = new Map<string, Promise<void>>();
  const rerun = new Map<string, MoneyFactsCatchUpReason>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, number>();

  function readState(accountId: string): MoneyFactsCatchUpState | null {
    return data.settings.getParsed(moneyFactsStateKey(accountId), catchUpStateSchema) ?? null;
  }

  function writeState(accountId: string, hubAccountId: number, afterSeq: number): void {
    data.settings.set(moneyFactsStateKey(accountId), {
      hubAccountId,
      afterSeq,
      updatedAt: new Date(now()).toISOString(),
    } satisfies MoneyFactsCatchUpState);
    knownPages.set(accountId, hubAccountId);
  }

  function schedule(accountId: string, reason: MoneyFactsCatchUpReason, delayMs: number): void {
    if (!running || fetchFacts === null) {
      return;
    }
    if (inFlight.has(accountId)) {
      // The running pass may already be past the facts this trigger is about
      // (a gap recovered mid-run): run once more from its new watermark.
      rerun.set(accountId, reason);
      return;
    }
    const pending = timers.get(accountId);
    if (pending !== undefined) {
      clearTimeout(pending);
    }
    const timer = setTimeout(() => {
      timers.delete(accountId);
      if (running) {
        void runAccount(accountId, reason);
      }
    }, delayMs);
    timers.set(accountId, timer);
  }

  async function catchUpOnce(
    accountId: string,
    reason: MoneyFactsCatchUpReason,
    runGeneration: number,
  ): Promise<void> {
    const fetch = fetchFacts;
    let state = readState(accountId);
    if (fetch === null || state === null) {
      return;
    }
    const startedAtMs = now();
    const fromSeq = state.afterSeq;
    const counters = emptyCounters();
    let throughSeq = fromSeq;
    let restarted = false;
    let more = true;
    while (more) {
      const hubAccountId: number = state.hubAccountId;
      const afterSeq: number = state.afterSeq;
      const result = await fetch({ hubAccountId, afterSeq, limit: pageLimit });
      if (!running || runGeneration !== generation || !accountHandled(accountId)) {
        return; // retired, or the grant went away while the page was in flight
      }
      if (result.kind === 'forbidden') {
        onLog('warn', 'money facts catch-up refused: page outside the grants', {
          accountId,
          hubAccountId,
        });
        return;
      }
      if (result.kind === 'ahead-of-head') {
        if (afterSeq === 0 || restarted) {
          throw new Error(`money facts: Core answered 409 at afterSeq ${afterSeq}`);
        }
        // Core's ledger head is behind the watermark (a restored database, a
        // different Core): the only safe restart is from the beginning —
        // every apply is idempotent.
        onLog('warn', 'money facts watermark ahead of Core; restarting from 0', {
          accountId,
          hubAccountId,
          afterSeq,
          detail: result.message,
        });
        writeState(accountId, hubAccountId, 0);
        state = readState(accountId) ?? state;
        restarted = true;
        continue;
      }
      const page = result.page;
      if (page.accountId !== hubAccountId) {
        throw new Error(`money facts page for ${page.accountId}, asked for ${hubAccountId}`);
      }
      if (page.nextAfterSeq < afterSeq || (page.hasMore && page.nextAfterSeq === afterSeq)) {
        throw new Error(`money facts cursor did not advance (${afterSeq} → ${page.nextAfterSeq})`);
      }
      // One transaction per page: the facts and the watermark past them
      // commit together, so a crash never skips or half-applies a page.
      const applied = data.db.transaction((): boolean => {
        const current = readState(accountId);
        if (current === null || current.hubAccountId !== hubAccountId || current.afterSeq !== afterSeq) {
          // A frame remapped the page while this page was in flight; the
          // remap already asked for a fresh run from its own watermark.
          return false;
        }
        for (const raw of page.facts) {
          const frame = parseDomainEventFrame(raw);
          if (frame === null) {
            counters.malformed += 1;
            continue;
          }
          if (
            frame.accountId !== hubAccountId
            || (typeof frame.accountRef === 'string' && frame.accountRef !== accountId)
          ) {
            counters.foreign += 1; // a remapped page: not this account's to apply
            continue;
          }
          if (!FACT_TYPES.has(frame.type)) {
            counters.unmapped += 1;
            continue;
          }
          const event = mapDomainFrame(frame);
          if (event === null || !isMoneyFactEvent(event) || event.accountId !== accountId) {
            counters.unmapped += 1;
            continue;
          }
          const outcome = applyMoneyFact(
            data,
            event,
            {
              hubAccountId: frame.accountId,
              accountSeq: frame.accountSeq,
              provenance: frameProvenance(frame),
              occurredAt: frame.occurredAt,
              source: 'catch-up',
            },
            now(),
          );
          if (outcome.kind === 'ppv') {
            if (!outcome.recorded) {
              counters.ppvWithoutMessage += 1;
            }
            counters.ppvNew += outcome.newFact ? 1 : 0;
            counters.ppvOpened += outcome.rowOpened ? 1 : 0;
            counters.ppvRepaired += outcome.superseded;
          } else if (outcome.kind === 'transaction') {
            if (outcome.inserted) {
              counters.txInserted += 1;
            } else {
              counters.txKnown += 1;
            }
          } else {
            counters.tips += 1;
          }
        }
        writeState(accountId, hubAccountId, page.nextAfterSeq);
        return true;
      });
      if (!applied) {
        onLog('info', 'money facts run superseded by a page remap', { accountId, hubAccountId });
        return;
      }
      state = { ...state, afterSeq: page.nextAfterSeq };
      counters.pages += 1;
      counters.facts += page.facts.length;
      throughSeq = page.throughSeq;
      more = page.hasMore;
      if (more && counters.pages >= MAX_PAGES_PER_RUN) {
        rerun.set(accountId, reason); // continue in a fresh run
        break;
      }
    }
    failures.delete(accountId);
    // Acceptance: `localPpvFacts` is this device's count of PPV purchase
    // facts for the account, to compare with Core's non-superseded
    // message.ppv_unlocked rows of the same page (hubAccountId).
    onLog('info', 'money facts caught up', {
      accountId,
      hubAccountId: state.hubAccountId,
      reason,
      fromSeq,
      afterSeq: state.afterSeq,
      throughSeq,
      ms: now() - startedAtMs,
      ...counters,
      localPpvFacts: data.messageFacts.countByAccount(accountId),
    });
  }

  async function runAccount(accountId: string, reason: MoneyFactsCatchUpReason): Promise<void> {
    const runGeneration = generation;
    const run = catchUpOnce(accountId, reason, runGeneration);
    inFlight.set(accountId, run);
    try {
      await run;
    } catch (error) {
      if (runGeneration === generation && running) {
        const attempt = (failures.get(accountId) ?? 0) + 1;
        failures.set(accountId, attempt);
        const delayMs = retryDelays[attempt - 1];
        const fields = {
          accountId,
          reason,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        };
        if (delayMs === undefined) {
          failures.delete(accountId);
          onLog('warn', 'money facts catch-up gave up until the next trigger', fields);
        } else {
          onLog('warn', 'money facts catch-up failed', { ...fields, retryInMs: delayMs });
          inFlight.delete(accountId);
          schedule(accountId, reason, delayMs);
        }
      }
    } finally {
      if (inFlight.get(accountId) === run) {
        inFlight.delete(accountId);
      }
      const again = rerun.get(accountId);
      if (again !== undefined) {
        rerun.delete(accountId);
        if (runGeneration === generation && running) {
          schedule(accountId, again, 0);
        }
      }
    }
  }

  return {
    notePage(accountId, hubAccountId) {
      if (!Number.isSafeInteger(hubAccountId) || hubAccountId <= 0) {
        return false;
      }
      if (knownPages.get(accountId) === hubAccountId && !awaitingPage.has(accountId)) {
        return false; // the hot path: every frame of a known page
      }
      const stored = readState(accountId);
      if (stored !== null && stored.hubAccountId === hubAccountId) {
        knownPages.set(accountId, hubAccountId);
        return awaitingPage.has(accountId);
      }
      // First sight of this account's page, or a remapped page: its history
      // has not been read here yet — start from the beginning.
      writeState(accountId, hubAccountId, 0);
      onLog('info', 'money facts page mapped', {
        accountId,
        hubAccountId,
        previousHubAccountId: stored?.hubAccountId ?? null,
      });
      return true;
    },

    request(accountIds, reason) {
      if (!running || fetchFacts === null) {
        return;
      }
      for (const accountId of accountIds) {
        if (!accountHandled(accountId)) {
          continue;
        }
        const state = readState(accountId);
        if (state === null) {
          // The Core page id comes with the account's first stream frame (or
          // a gap recovery's snapshot); the catch-up starts then.
          awaitingPage.set(accountId, reason);
          continue;
        }
        awaitingPage.delete(accountId);
        failures.delete(accountId);
        schedule(accountId, reason, 0);
      }
    },

    start() {
      running = true;
    },

    stop() {
      running = false;
      generation += 1;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      rerun.clear();
      awaitingPage.clear();
      failures.clear();
    },

    state: readState,

    async whenIdle() {
      for (let guard = 0; guard < 100; guard += 1) {
        const runs = [...inFlight.values()];
        if (runs.length > 0) {
          await Promise.allSettled(runs);
          continue;
        }
        const immediate = [...timers.keys()];
        if (immediate.length === 0) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}
