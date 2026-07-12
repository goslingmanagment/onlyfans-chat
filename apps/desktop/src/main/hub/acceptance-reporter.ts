// Stage 31 Task 2 — the acceptance lifecycle spool. Events ride the Stage 11
// capture lane (kind 'ai_acceptance' → journaled kernel-side as
// desktop.ai_acceptance) carrying the correlation pair: operationId
// (= the gateway clientRequestId) and requestId (the generation ref from the
// meta frame; null on the direct lane — correlation is best-effort there).
//
// SPOOL: the db settings KV (key below), not a dedicated table. Later schema
// migrations do not change this telemetry-grade queue. Bounded FIFO (oldest dropped past the cap);
// telemetry-grade delivery: a 400 drops the batch loudly, transient errors
// retry with the spool intact.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HubError } from '@chatgoose/shared/hub/index';
import type { HubClient, HubIngestObservationEvent } from '@chatgoose/shared/hub/index';
import type { DataLayer } from '../db/index';

export const ACCEPTANCE_SPOOL_SETTINGS_KEY = 'aiAcceptanceSpool';
const SPOOL_CAP = 500;
const BATCH_MAX = 100;
const FLUSH_DEBOUNCE_MS = 1_000;
const MAX_ATTEMPTS = 5;

/** RFC 4122 v5 (SHA-1, name-based) — same construction as the harvest
 * uploader's; its own namespace so acceptance ids never collide. */
const ACCEPTANCE_UUID_NAMESPACE = '5e2f9b52-8c1d-4f6a-9b0e-2a7c94d1c31b';

function uuidV5(name: string): string {
  const namespaceBytes = Buffer.from(ACCEPTANCE_UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export type AcceptanceAction = 'shown' | 'copied' | 'inserted' | 'sent';

export interface AcceptanceEventInput {
  operationId: string;
  /** Gateway generation ref (meta frame); null on the direct lane. */
  requestId: string | null;
  feature: string;
  action: AcceptanceAction;
  accountId: string;
  conversationId: string;
  /** 'sent' only: sent text differs from the inserted suggestion. */
  edited?: boolean;
  at: string;
}

const spooledEventSchema = z.object({
  operationId: z.string(),
  requestId: z.string().nullable(),
  feature: z.string(),
  action: z.enum(['shown', 'copied', 'inserted', 'sent']),
  accountId: z.string(),
  conversationId: z.string(),
  edited: z.boolean().optional(),
  at: z.string(),
  attempts: z.number().int().min(0),
});

type SpooledEvent = z.infer<typeof spooledEventSchema>;

const spoolSchema = z.array(spooledEventSchema);

export interface AcceptanceReporter {
  enqueue(event: AcceptanceEventInput): void;
  /** Pending spool size (diagnostics). */
  pending(): number;
  flushNow(): Promise<void>;
  /** Stops new work and waits for the current SQLite-owning continuation. */
  quiesce(): Promise<void>;
  dispose(): void;
}

export interface AcceptanceReporterOptions {
  data: Pick<DataLayer, 'settings'>;
  /** Null while the hub is unconfigured — events keep spooling. */
  getClient: () => Pick<HubClient, 'postIngestObservations'> | null;
  onWarn?: (message: string) => void;
}

/** Durably append even while no credential-bound Hub runtime exists. A later
 * reporter configure/flush drains the same KV spool. */
export function enqueueAcceptanceEvent(
  data: Pick<DataLayer, 'settings'>,
  event: AcceptanceEventInput,
): void {
  const spool = data.settings.getParsed(ACCEPTANCE_SPOOL_SETTINGS_KEY, spoolSchema) ?? [];
  spool.push({ ...event, attempts: 0 });
  data.settings.set(
    ACCEPTANCE_SPOOL_SETTINGS_KEY,
    spool.length > SPOOL_CAP ? spool.slice(spool.length - SPOOL_CAP) : spool,
  );
}

function toWireEvent(event: SpooledEvent): HubIngestObservationEvent {
  return {
    clientEventId: uuidV5(`${event.operationId}:${event.action}:${event.at}`),
    kind: 'ai_acceptance',
    observedAt: event.at,
    payload: {
      operationId: event.operationId,
      ...(event.requestId !== null ? { requestId: event.requestId, generationRef: event.requestId } : {}),
      feature: event.feature,
      action: event.action,
      accountId: event.accountId,
      conversationId: event.conversationId,
      ...(event.edited !== undefined ? { edited: event.edited } : {}),
    },
  };
}

export function createAcceptanceReporter(options: AcceptanceReporterOptions): AcceptanceReporter {
  const onWarn = options.onWarn ?? (() => {});
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let flushPromise: Promise<void> | null = null;
  let flushAgain = false;
  let disposed = false;

  function load(): SpooledEvent[] {
    const raw = options.data.settings.getParsed(ACCEPTANCE_SPOOL_SETTINGS_KEY, spoolSchema);
    return raw ?? [];
  }

  function persist(spool: SpooledEvent[]): void {
    options.data.settings.set(ACCEPTANCE_SPOOL_SETTINGS_KEY, spool);
  }

  function eventId(event: SpooledEvent): string {
    return toWireEvent(event).clientEventId;
  }

  /**
   * Mutate the latest durable spool after an awaited request. `enqueue()` may
   * have appended events while the request was in flight, so deriving the next
   * value from the pre-request snapshot would overwrite those events.
   * Settings reads/writes are synchronous, making this read-modify-write one
   * event-loop critical section.
   */
  function updatePostedBatch(
    batch: readonly SpooledEvent[],
    update: (event: SpooledEvent) => SpooledEvent | null,
  ): void {
    const postedIds = new Set(batch.map(eventId));
    const latest = load();
    const next: SpooledEvent[] = [];
    for (const event of latest) {
      if (!postedIds.has(eventId(event))) {
        next.push(event);
        continue;
      }
      const updated = update(event);
      if (updated !== null) {
        next.push(updated);
      }
    }
    persist(next);
  }

  function schedule(): void {
    if (disposed || timer !== null) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  async function performFlush(): Promise<void> {
    if (disposed) {
      return;
    }
    if (flushing) {
      // Reconfigure calls flushNow while the outgoing credential may still own
      // an awaited batch. Preserve that request and run it under the current
      // client when this generation releases the single-flight owner.
      flushAgain = true;
      return;
    }
    flushing = true;
    try {
      for (;;) {
        // A credential-bound reporter may be retired while an HTTP batch is
        // in flight. Never let that old instance pick up events appended for
        // its replacement after the awaited request settles.
        if (disposed) {
          return;
        }
        const client = options.getClient();
        if (client === null) {
          return; // hub unconfigured — spool waits
        }
        const spool = load();
        if (spool.length === 0) {
          return;
        }
        const batch = spool.slice(0, BATCH_MAX);
        try {
          await client.postIngestObservations({ events: batch.map(toWireEvent) });
          updatePostedBatch(batch, () => null);
          if (disposed) {
            return;
          }
          if (options.getClient() !== client) {
            flushAgain = true;
            return;
          }
        } catch (error) {
          // The replacement reporter owns retry/drop policy now. In
          // particular, a 400 from a retired credential must not delete events
          // that the new credential may be authorized to deliver.
          if (disposed) {
            return;
          }
          if (options.getClient() !== client) {
            flushAgain = true;
            return;
          }
          if (error instanceof HubError && error.reason === 'bad-request') {
            // Contract bug: never retriable verbatim — drop loudly.
            onWarn(`[acceptance] batch rejected (${error.message}); dropping ${batch.length} events`);
            updatePostedBatch(batch, () => null);
            continue;
          }
          updatePostedBatch(batch, (event) => {
            const attempted = { ...event, attempts: event.attempts + 1 };
            if (attempted.attempts >= MAX_ATTEMPTS) {
              onWarn(
                `[acceptance] dropping event after ${attempted.attempts} attempts (${attempted.action})`,
              );
              return null;
            }
            return attempted;
          });
          schedule(); // transient — try again later
          return;
        }
      }
    } finally {
      flushing = false;
    }
  }

  function flush(): Promise<void> {
    if (flushPromise !== null) {
      flushAgain = true;
      return flushPromise;
    }
    const tracked = performFlush().finally(() => {
      if (flushPromise === tracked) {
        flushPromise = null;
        if (!disposed && flushAgain) {
          flushAgain = false;
          void flush();
        }
      }
    });
    flushPromise = tracked;
    return tracked;
  }

  function disposeReporter(): void {
    disposed = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    enqueue(event) {
      if (disposed) {
        return;
      }
      enqueueAcceptanceEvent(options.data, event);
      schedule();
    },
    pending() {
      return load().length;
    },
    flushNow() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      return flush();
    },
    async quiesce() {
      disposeReporter();
      await flushPromise;
    },
    dispose() {
      disposeReporter();
    },
  };
}

// ─── Sent/edited tracker (observe-only; never touches outbox state) ───────

export interface InsertedSuggestion {
  operationId: string;
  requestId: string | null;
  feature: string;
  text: string;
}

export interface AcceptanceTracker {
  /** Record the latest inserted suggestion for a conversation. */
  trackInserted(accountId: string, chatId: string, suggestion: InsertedSuggestion): void;
  /** One-shot: consume the tracked insertion when a send follows. */
  consumeForSend(
    accountId: string,
    chatId: string,
    sentText: string,
  ): (InsertedSuggestion & { edited: boolean }) | null;
}

export function createAcceptanceTracker(): AcceptanceTracker {
  const byConversation = new Map<string, InsertedSuggestion>();
  const keyOf = (accountId: string, chatId: string): string => `${accountId}|${chatId}`;
  return {
    trackInserted(accountId, chatId, suggestion) {
      byConversation.set(keyOf(accountId, chatId), suggestion);
    },
    consumeForSend(accountId, chatId, sentText) {
      const key = keyOf(accountId, chatId);
      const tracked = byConversation.get(key);
      if (tracked === undefined) {
        return null;
      }
      byConversation.delete(key);
      return { ...tracked, edited: sentText.trim() !== tracked.text.trim() };
    },
  };
}

// ─── IPC hook bodies (pure over the seams; unit-tested directly) ──────────

export interface AcceptanceSeam {
  enqueue: (event: AcceptanceEventInput) => void;
  trackInserted: AcceptanceTracker['trackInserted'];
  consumeForSend: AcceptanceTracker['consumeForSend'];
}

export interface FeedbackContext {
  operationId: string;
  requestId: string | null;
  feature: string;
  accountId: string;
  chatId: string;
  parts: string[];
}

/** cmd:ai.feedback → capture lane (+ insertion tracking for sent/edited). */
export function reportFeedbackAcceptance(
  seam: AcceptanceSeam,
  context: FeedbackContext,
  action: 'copied' | 'inserted',
  partIndex: number | null,
  at: string,
): void {
  seam.enqueue({
    operationId: context.operationId,
    requestId: context.requestId,
    feature: context.feature,
    action,
    accountId: context.accountId,
    conversationId: context.chatId,
    at,
  });
  if (action === 'inserted') {
    seam.trackInserted(context.accountId, context.chatId, {
      operationId: context.operationId,
      requestId: context.requestId,
      feature: context.feature,
      text: context.parts[partIndex ?? 0] ?? context.parts.join('\n'),
    });
  }
}

/**
 * cmd:send.message observer — OBSERVE-ONLY BY CONSTRUCTION: it receives no
 * send engine and returns nothing; the only capabilities in reach are the
 * acceptance seam's. The proof test freezes the args and pins the call set.
 */
export function observeSendForAcceptance(
  seam: Pick<AcceptanceSeam, 'enqueue' | 'consumeForSend'>,
  args: { readonly accountId: string; readonly chatId: string; readonly parts: readonly string[] },
  at: string,
): void {
  const tracked = seam.consumeForSend(args.accountId, args.chatId, args.parts.join('\n'));
  if (tracked !== null) {
    seam.enqueue({
      operationId: tracked.operationId,
      requestId: tracked.requestId,
      feature: tracked.feature,
      action: 'sent',
      accountId: args.accountId,
      conversationId: args.chatId,
      edited: tracked.edited,
      at,
    });
  }
}
