// SPEC §7 send pipeline — the ONLY code path that may call client.sendMessage.
// Correctness contract (SPEC §15.5, the product's most important invariant):
// a row is POSTed at most once, ever. Rows reach 'sending' exclusively through
// the atomic outbox.claimNextQueued (queued→sending persisted BEFORE the POST);
// no transition re-queues a row; restarts park 'sending' as 'unconfirmed'; and
// recovery is verification (read-only) or a NEW row (retry of a definite
// failure) — never a second attempt on the same row. Indeterminate outcomes
// (timeout / reset-after-send / 5xx) are NEVER auto-retried — the verifier
// promotes them on evidence (messages.sent event or tail-fetch match) only.

import { randomUUID } from 'node:crypto';
import { CgError } from '@chatgoose/shared';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import type { DataLayer, MessageRow, OutboxRow } from '../db/index';
import type { OfApiClient } from '../ofapi/client';
import { classifySendFailure } from '../ofapi/send-outcome';
import { OfApiError } from '../ofapi/errors';
import type { SleepFn } from '../ofapi/rate-limiter';
import { mapMessage, type ToMediaUrl } from '../sync/mappers';

// Multi-part pacing (SPEC §7.7): randomized so sequences don't read as a bot.
export const INTER_PART_DELAY_MIN_MS = 2000;
export const INTER_PART_DELAY_MAX_MS = 5000;
// Verifier cadence (SPEC §7.5): re-check unconfirmed rows every 30 s; stop
// auto-verifying rows older than 10 min (manual verifyNow always allowed).
export const VERIFY_INTERVAL_MS = 30_000;
export const VERIFY_AUTO_STOP_AGE_MS = 10 * 60_000;
// Tail-match window: a candidate counts only when its server timestamp falls
// inside [row.createdAt − 2 min, row.createdAt + 10 min] (clock-skew tolerant
// behind, delivery-latency tolerant ahead).
export const VERIFY_WINDOW_BEFORE_MS = 2 * 60_000;
export const VERIFY_WINDOW_AFTER_MS = 10 * 60_000;
const VERIFY_TAIL_LIMIT = 50;
// Typing endpoint is free but rate-courteous: min 2.5 s between calls per chat.
export const TYPING_MIN_INTERVAL_MS = 2500;
// SPEC §7.9: mark-as-read debounced 1.5 s per chat, gated on the settings toggle.
export const MARK_READ_DEBOUNCE_MS = 1500;

/** The narrow client surface the engine touches (stubbed in tests). */
export type SendClient = Pick<
  OfApiClient,
  'sendMessage' | 'listMessages' | 'deleteMessage' | 'startTyping' | 'markChatRead'
>;

export interface SendEngineOptions {
  client: SendClient;
  data: DataLayer;
  toMediaUrl: ToMediaUrl;
  getSettings: () => Promise<{ markAsReadOnOpen: boolean }>;
  now?: () => number;
  sleep?: SleepFn;
  /** Uniform [0,1) source for the inter-part delay (injectable for tests). */
  random?: () => number;
}

export interface SendEngine {
  /** Persists queued rows (atomically) and kicks the chat's pump; never awaits the send. */
  sendParts(args: {
    accountId: string;
    chatId: string;
    parts: readonly string[];
  }): { localIds: string[]; sequenceId: string | null };
  /** FAILED rows only — the old row is cancelled (superseded), a NEW row queues. */
  retry(args: { accountId: string; localId: string; text: string }): { localId: string };
  /** failed|unconfirmed → cancelled (audit row kept). */
  dismiss(args: { accountId: string; localId: string }): void;
  /** Remaining queued rows → cancelled; an in-flight part finishes its own course. */
  cancelSequence(args: { accountId: string; sequenceId: string }): void;
  /** Tail-fetch + match pass over the chat's unconfirmed rows (also user-triggered). */
  verifyChat(accountId: string, chatId: string): Promise<void>;
  /** messages.sent for a chat with unconfirmed rows → local-only match (no network). */
  handleSyncEvent(event: SyncEvent): void;
  /** sending → unconfirmed (+verify); queued → cancelled. Never auto-sends on boot. */
  reconcileOnBoot(): Promise<void>;
  typingActive(accountId: string, chatId: string): void;
  markRead(accountId: string, chatId: string): Promise<void>;
  unsend(accountId: string, chatId: string, messageId: string): Promise<void>;
  dispose(): void;
}

/** Plain-text equality for verifier matching: trim + collapse inner whitespace. */
export function normalizeForMatch(text: string): string {
  return text.trim().replaceAll(/\s+/g, ' ');
}

export function createSendEngine(options: SendEngineOptions): SendEngine {
  const { client, data, toMediaUrl, getSettings } = options;
  const now = options.now ?? Date.now;
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;

  const pumping = new Set<string>();
  const verifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const markReadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const typingLastAt = new Map<string, number>();
  let disposed = false;

  function chatKey(accountId: string, chatId: string): string {
    return `${accountId}|${chatId}`;
  }

  function nowIso(): string {
    return new Date(now()).toISOString();
  }

  function gateCanSend(accountId: string, chatId: string): void {
    const chat = data.chats.get(accountId, chatId);
    if (chat === null) {
      throw new Error('Cannot send: unknown chat');
    }
    if (!chat.canSendMessage) {
      throw new Error(
        `Cannot send to this chat: ${chat.canNotSendReason ?? 'messaging is restricted by the platform'}`,
      );
    }
  }

  function interPartDelayMs(): number {
    return Math.round(
      INTER_PART_DELAY_MIN_MS + random() * (INTER_PART_DELAY_MAX_MS - INTER_PART_DELAY_MIN_MS),
    );
  }

  // ── Pump: single-flight per chat ─────────────────────────────────────────
  // One drain loop per chat at a time; rows queued while it runs are picked up
  // by the same loop (claimNextQueued re-reads the table each iteration), so a
  // second concurrent POST for the chat cannot exist.
  function kickPump(accountId: string, chatId: string): void {
    const key = chatKey(accountId, chatId);
    if (pumping.has(key)) {
      return;
    }
    pumping.add(key);
    void (async () => {
      try {
        for (;;) {
          // queued → sending (attempts+1) persisted BEFORE the POST (SPEC §7.1).
          const row = data.outbox.claimNextQueued(accountId, chatId);
          if (row === null) {
            return;
          }
          const sent = await attemptSend(row);
          if (!sent) {
            // EITHER failure kind aborts the sequence (SPEC §7.7).
            if (row.sequenceId !== null) {
              data.outbox.cancelQueuedInSequence(accountId, row.sequenceId);
            }
            continue;
          }
          if (row.sequenceId !== null && data.outbox.hasQueuedInSequence(accountId, row.sequenceId)) {
            // Delay BEFORE claiming the next part: it stays 'queued' and thus
            // cancelable between parts (SPEC §7.7).
            await sleep(interPartDelayMs());
          }
        }
      } finally {
        pumping.delete(key);
      }
    })();
  }

  /** Exactly one client.sendMessage per claimed row — there is no other call site. */
  async function attemptSend(row: OutboxRow): Promise<boolean> {
    try {
      const created = await client.sendMessage({
        accountId: row.accountId,
        chatId: row.chatId,
        text: row.text,
      });
      // The POST response lacks isSentByMe — it is OUR send by definition.
      const upsert = mapMessage(
        row.accountId,
        row.chatId,
        { ...created, isSentByMe: true },
        toMediaUrl,
      );
      data.messages.upsertMany([upsert]);
      data.outbox.transition({
        localId: row.localId,
        from: ['sending'],
        to: 'sent',
        messageId: String(created.id),
      });
      return true;
    } catch (error) {
      settleFailure(row, error);
      return false;
    }
  }

  function settleFailure(row: OutboxRow, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (classifySendFailure(error) === 'definite') {
      // Strictly-definite non-delivery (SPEC §7.4): safe to offer retry/edit.
      data.outbox.transition({
        localId: row.localId,
        from: ['sending'],
        to: 'failed',
        errorCode: error instanceof CgError ? error.code : 'CG-APP-01',
        errorMessage,
        textHighlights: error instanceof OfApiError ? (error.textHighLights ?? []) : [],
      });
    } else {
      // The message may have reached the fan — NEVER auto-retry (SPEC §15.5).
      data.outbox.transition({
        localId: row.localId,
        from: ['sending'],
        to: 'unconfirmed',
        errorCode: 'CG-OF-06',
        errorMessage,
      });
      scheduleVerify(row.accountId, row.chatId);
    }
  }

  // ── Verifier (SPEC §7.5) ─────────────────────────────────────────────────

  /**
   * Matches the chat's unconfirmed rows against the LOCAL messages table:
   * own message + normalized text equality + creation-time window, each
   * message id claimable by at most one outbox row (no cross-claiming).
   */
  function matchUnconfirmed(accountId: string, chatId: string): void {
    const unconfirmed = data.outbox.listByStateForChat(accountId, chatId, 'unconfirmed');
    if (unconfirmed.length === 0) {
      return;
    }
    const candidates = data.messages
      .page({ accountId, chatId, limit: 100 })
      .items.filter((message) => message.isSentByMe && !message.deleted);
    const claimed = data.outbox.claimedMessageIds(accountId, chatId);
    for (const row of unconfirmed) {
      const rowCreatedMs = Date.parse(row.createdAt);
      const wanted = normalizeForMatch(row.text);
      const match = candidates.find(
        (candidate: MessageRow) =>
          !claimed.has(candidate.messageId) &&
          normalizeForMatch(candidate.textPlain) === wanted &&
          Date.parse(candidate.createdAt) >= rowCreatedMs - VERIFY_WINDOW_BEFORE_MS &&
          Date.parse(candidate.createdAt) <= rowCreatedMs + VERIFY_WINDOW_AFTER_MS,
      );
      if (match !== undefined) {
        claimed.add(match.messageId);
        data.outbox.transition({
          localId: row.localId,
          from: ['unconfirmed'],
          to: 'sent',
          messageId: match.messageId,
        });
      }
    }
  }

  async function verifyChat(accountId: string, chatId: string): Promise<void> {
    const unconfirmed = data.outbox.listByStateForChat(accountId, chatId, 'unconfirmed');
    if (unconfirmed.length === 0) {
      return;
    }
    const { messages } = await client.listMessages({
      accountId,
      chatId,
      order: 'desc',
      limit: VERIFY_TAIL_LIMIT,
    });
    data.messages.upsertMany(
      messages.map((message) => mapMessage(accountId, chatId, message, toMediaUrl)),
    );
    matchUnconfirmed(accountId, chatId);
  }

  function hasAutoVerifiableRows(accountId: string, chatId: string): boolean {
    return data.outbox
      .listByStateForChat(accountId, chatId, 'unconfirmed')
      .some((row) => now() - Date.parse(row.createdAt) <= VERIFY_AUTO_STOP_AGE_MS);
  }

  function scheduleVerify(accountId: string, chatId: string): void {
    const key = chatKey(accountId, chatId);
    if (disposed || verifyTimers.has(key)) {
      return;
    }
    verifyTimers.set(
      key,
      setTimeout(() => {
        verifyTimers.delete(key);
        void (async () => {
          if (!hasAutoVerifiableRows(accountId, chatId)) {
            return; // stale (>10 min) or resolved — manual verifyNow only
          }
          try {
            await verifyChat(accountId, chatId);
          } catch {
            // transient (offline); the rescheduled pass retries
          }
          if (hasAutoVerifiableRows(accountId, chatId)) {
            scheduleVerify(accountId, chatId);
          }
        })();
      }, VERIFY_INTERVAL_MS),
    );
  }

  return {
    sendParts({ accountId, chatId, parts }) {
      if (parts.length === 0) {
        throw new Error('sendParts: at least one part is required');
      }
      gateCanSend(accountId, chatId);
      const sequenceId = parts.length > 1 ? randomUUID() : null;
      const createdAt = nowIso();
      const rows = parts.map((text, partIndex) => ({
        localId: randomUUID(),
        accountId,
        chatId,
        text,
        sequenceId,
        partIndex,
        retryOf: null,
        createdAt,
      }));
      data.outbox.insertMany(rows);
      kickPump(accountId, chatId);
      return { localIds: rows.map((row) => row.localId), sequenceId };
    },

    retry({ accountId, localId, text }) {
      const row = data.outbox.get(localId);
      if (row === null || row.accountId !== accountId) {
        throw new Error('retry: unknown outbox row');
      }
      if (row.state === 'unconfirmed') {
        // The verifier owns unconfirmed rows: the send may have been delivered,
        // so a retry here could double-message the fan (SPEC §15.5).
        throw new Error('retry: row is unconfirmed — verify or dismiss it first');
      }
      if (row.state !== 'failed') {
        throw new Error(`retry: only failed rows can be retried (row is '${row.state}')`);
      }
      gateCanSend(accountId, row.chatId);
      data.outbox.transition({ localId, from: ['failed'], to: 'cancelled' }); // superseded
      const newLocalId = randomUUID();
      data.outbox.insertMany([
        {
          localId: newLocalId,
          accountId,
          chatId: row.chatId,
          text,
          sequenceId: null,
          partIndex: 0,
          retryOf: localId,
          createdAt: nowIso(),
        },
      ]);
      kickPump(accountId, row.chatId);
      return { localId: newLocalId };
    },

    dismiss({ accountId, localId }) {
      const row = data.outbox.get(localId);
      if (row === null || row.accountId !== accountId) {
        throw new Error('dismiss: unknown outbox row');
      }
      const changed = data.outbox.transition({
        localId,
        from: ['failed', 'unconfirmed'],
        to: 'cancelled',
      });
      if (!changed) {
        throw new Error(`dismiss: only failed/unconfirmed rows can be dismissed (row is '${row.state}')`);
      }
    },

    cancelSequence({ accountId, sequenceId }) {
      data.outbox.cancelQueuedInSequence(accountId, sequenceId);
    },

    verifyChat,

    handleSyncEvent(event) {
      if (event.type !== 'messageSent') {
        return;
      }
      // Sync already upserted the message — match locally, no extra network.
      matchUnconfirmed(event.accountId, event.chatId);
    },

    async reconcileOnBoot() {
      // A restart kills pending sequences — the app never auto-sends on boot.
      for (const row of data.outbox.listByState('queued')) {
        data.outbox.transition({ localId: row.localId, from: ['queued'], to: 'cancelled' });
      }
      // In flight at shutdown: the outcome is unknowable — verification, not resend.
      for (const row of data.outbox.listByState('sending')) {
        data.outbox.transition({
          localId: row.localId,
          from: ['sending'],
          to: 'unconfirmed',
          errorCode: 'CG-OF-06',
          errorMessage: 'The app restarted while this send was in flight',
        });
      }
      for (const { accountId, chatId } of data.outbox.chatsWithState('unconfirmed')) {
        try {
          await verifyChat(accountId, chatId);
        } catch {
          // offline at boot — the periodic pass retries
        }
        if (data.outbox.listByStateForChat(accountId, chatId, 'unconfirmed').length > 0) {
          scheduleVerify(accountId, chatId);
        }
      }
    },

    typingActive(accountId, chatId) {
      const key = chatKey(accountId, chatId);
      const last = typingLastAt.get(key);
      if (last !== undefined && now() - last < TYPING_MIN_INTERVAL_MS) {
        return;
      }
      typingLastAt.set(key, now());
      // 0 credits, purely cosmetic: losing one is harmless (client contract).
      void client.startTyping({ accountId, chatId }).catch(() => undefined);
    },

    async markRead(accountId, chatId) {
      const settings = await getSettings();
      if (!settings.markAsReadOnOpen || disposed) {
        return;
      }
      const key = chatKey(accountId, chatId);
      const pending = markReadTimers.get(key);
      if (pending !== undefined) {
        clearTimeout(pending); // debounce: rapid re-opens collapse into one call
      }
      markReadTimers.set(
        key,
        setTimeout(() => {
          markReadTimers.delete(key);
          void client
            .markChatRead({ accountId, chatId })
            .then(({ success }) => {
              if (!success) {
                return;
              }
              data.db
                .prepare(
                  `UPDATE chats SET unread_count = 0, updated_at = @updated_at
                   WHERE account_id = @account_id AND chat_id = @chat_id`,
                )
                .run({ account_id: accountId, chat_id: chatId, updated_at: nowIso() });
              data.bus.publish({ scope: 'chats', accountId, chatId });
            })
            .catch(() => undefined); // lossy: the next conversation open retries
        }, MARK_READ_DEBOUNCE_MS),
      );
    },

    async unsend(accountId, chatId, messageId) {
      // Window errors (CG-OF-07 / upstream 4xx) propagate to the caller.
      const { success } = await client.deleteMessage({ accountId, chatId, messageId });
      if (success) {
        data.messages.markDeleted(accountId, chatId, [messageId]); // tombstone
      }
    },

    dispose() {
      disposed = true;
      for (const timer of verifyTimers.values()) {
        clearTimeout(timer);
      }
      verifyTimers.clear();
      for (const timer of markReadTimers.values()) {
        clearTimeout(timer);
      }
      markReadTimers.clear();
    },
  };
}
