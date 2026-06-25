// SPEC §7 send pipeline — the ONLY code path that may create Hub OFAPI commands.
// Correctness contract (SPEC §15.5, the product's most important invariant):
// a row is submitted to core at most once per stable client command id. Rows
// reach 'sending' exclusively through the atomic outbox.claimNextQueued
// (queued→sending persisted BEFORE command intake);
// no transition re-queues a row; restarts park 'sending' as 'unconfirmed'; and
// recovery is verification (read-only) or a NEW row (retry of a definite
// failure) — never a second attempt on the same row. Indeterminate outcomes
// (timeout / reset-after-send / 5xx) are NEVER auto-retried — the verifier
// promotes them on evidence (messages.sent event or tail-fetch match) only.

import { randomUUID } from 'node:crypto';
import { CgError } from '@chatgoose/shared';
import { HubError, type HubClient, type HubOfapiCommand } from '@chatgoose/shared/hub/index';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import type {
  DataLayer,
  MessageRow,
  OutboxMediaId,
  OutboxRow,
  OutboxTransport,
} from '../db/index';
import type { OfApiClient } from '../ofapi/client';
import type { SleepFn } from '../ofapi/rate-limiter';
import { mapMessage, type ToMediaUrl } from '../sync/mappers';
import type { MessageGuardRuntime } from '../message-guard/runtime';

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
export const HUB_COMMAND_POLL_INTERVAL_MS = 500;
export const HUB_COMMAND_POLL_LIMIT = 60;
// PPV price bounds (openapi send-message: "0 or between 3-200", integer dollars).
export const PPV_PRICE_MIN = 3;
export const PPV_PRICE_MAX = 200;

/** The narrow client surface the engine touches (stubbed in tests). */
export type SendClient = Pick<OfApiClient, 'listMessages'>;

export interface SendEngineOptions {
  client: SendClient;
  hubCommandClient?: Pick<HubClient, 'createOfapiCommand' | 'getOfapiCommand'>;
  data: DataLayer;
  messageGuard: Pick<MessageGuardRuntime, 'assertAllowed'>;
  toMediaUrl: ToMediaUrl;
  getSettings: () => Promise<{ markAsReadOnOpen: boolean }>;
  now?: () => number;
  sleep?: SleepFn;
  /** Uniform [0,1) source for the inter-part delay (injectable for tests). */
  random?: () => number;
  hubCommandPollIntervalMs?: number;
  hubCommandPollLimit?: number;
}

export interface SendEngine {
  /** Persists queued rows (atomically) and kicks the chat's pump; never awaits the send. */
  sendParts(args: {
    accountId: string;
    chatId: string;
    parts: readonly string[];
  }): { localIds: string[]; sequenceId: string | null };
  /**
   * PPV / media send (PRD F7): ALWAYS a single outbox row — [NEXT] sequences
   * never apply to PPV. Validates BEFORE enqueue: mediaFiles non-empty, price
   * 0 (free media message) or an integer 3–200, previews ⊆ mediaFiles.
   */
  sendPpv(args: {
    accountId: string;
    chatId: string;
    /** Caption; may be empty (media-only message). Locked behind the paywall when priced. */
    text: string;
    price: number;
    mediaFiles: readonly OutboxMediaId[];
    previews: readonly OutboxMediaId[];
  }): { localId: string };
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

/** PPV price: 0 (free media message) or whole dollars 3–200 (openapi: integer). */
export function isValidPpvPrice(price: number): boolean {
  if (!Number.isFinite(price)) return false;
  if (price === 0) return true;
  return Number.isInteger(price) && price >= PPV_PRICE_MIN && price <= PPV_PRICE_MAX;
}

const HUB_WRITE_TRANSPORT: OutboxTransport = 'hub';
const DIRECT_WRITE_DISABLED_MESSAGE =
  'Direct OFAPI writes are disabled. Configure Agency Hub before sending OnlyFans messages.';
const HUB_WRITE_UNAVAILABLE_MESSAGE =
  'Agency Hub command transport is required for OnlyFans writes. Configure Hub before sending.';

function toCommandMediaId(id: OutboxMediaId): string {
  return String(id);
}

function hubWriteUnavailable(): CgError {
  return new CgError('CG-HUB-02', { message: HUB_WRITE_UNAVAILABLE_MESSAGE });
}

function isHubWriteUnavailable(error: unknown): boolean {
  if (error instanceof HubError) {
    return error.reason === 'auth' || error.reason === 'bad-request';
  }
  return (
    error instanceof CgError &&
    error.code === 'CG-HUB-02' &&
    error.message === HUB_WRITE_UNAVAILABLE_MESSAGE
  );
}

function hubFailureCode(error: unknown, unavailable: boolean): 'CG-HUB-01' | 'CG-HUB-02' | 'CG-OF-06' {
  if (!unavailable) {
    return 'CG-OF-06';
  }
  return error instanceof CgError && (error.code === 'CG-HUB-01' || error.code === 'CG-HUB-02')
    ? error.code
    : 'CG-HUB-02';
}

export function createSendEngine(options: SendEngineOptions): SendEngine {
  const { client, data, messageGuard, toMediaUrl, getSettings } = options;
  const hubCommandClient = options.hubCommandClient;
  const now = options.now ?? Date.now;
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const hubCommandPollIntervalMs =
    options.hubCommandPollIntervalMs ?? HUB_COMMAND_POLL_INTERVAL_MS;
  const hubCommandPollLimit = options.hubCommandPollLimit ?? HUB_COMMAND_POLL_LIMIT;

  const pumping = new Set<string>();
  const verifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const markReadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const typingLastAt = new Map<string, number>();
  const pendingHubUnsends = new Map<string, Promise<void>>();
  const submittedHubUnsends = new Set<string>();
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

  function guardText(args: {
    accountId: string;
    chatId: string;
    text: string;
    surface: string;
    mediaCount?: number;
    price?: number;
  }): void {
    messageGuard.assertAllowed({
      accountId: args.accountId,
      chatId: args.chatId,
      text: args.text,
      surface: args.surface,
      transport: HUB_WRITE_TRANSPORT,
      ...(args.mediaCount !== undefined ? { mediaCount: args.mediaCount } : {}),
      ...(args.price !== undefined ? { price: args.price } : {}),
    });
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

  function upsertHubConfirmedMessage(row: OutboxRow, command: HubOfapiCommand): void {
    if (command.platformMessageId === null) {
      throw new Error('Hub confirmed command omitted platformMessageId');
    }
    data.messages.upsertMany([
      {
        accountId: row.accountId,
        chatId: row.chatId,
        messageId: command.platformMessageId,
        createdAt: command.attemptFinishedAt ?? command.updatedAt,
        isSentByMe: true,
        textHtml: row.text,
        textPlain: row.text,
        price: row.price,
        isOpened: null,
        isNew: false,
        isTip: false,
        tipAmount: null,
        tipText: null,
        replyTo: null,
        media: [],
        deleted: false,
        raw: {
          source: 'hub-command',
          commandId: command.commandId,
        },
      },
    ]);
  }

  function settleHubCommand(row: OutboxRow, command: HubOfapiCommand): boolean {
    switch (command.state) {
      case 'confirmed':
        upsertHubConfirmedMessage(row, command);
        data.outbox.transition({
          localId: row.localId,
          from: ['sending', 'unconfirmed'],
          to: 'sent',
          ...(command.platformMessageId === null ? {} : { messageId: command.platformMessageId }),
        });
        return true;
      case 'failed_retryable':
      case 'failed_terminal':
      case 'cancelled':
        data.outbox.transition({
          localId: row.localId,
          from: ['sending', 'unconfirmed'],
          to: 'failed',
          errorCode: command.lastErrorCode ?? 'CG-APP-01',
          errorMessage:
            command.state === 'cancelled'
              ? 'The server command was cancelled before delivery'
              : `The server command ended as ${command.state}`,
        });
        return false;
      case 'indeterminate':
        data.outbox.transition({
          localId: row.localId,
          from: ['sending'],
          to: 'unconfirmed',
          errorCode: 'CG-OF-06',
          errorMessage: 'The server could not prove whether the message was delivered',
        });
        return false;
      case 'queued':
      case 'in_flight':
        return false;
    }
  }

  async function ensureHubCommand(row: OutboxRow): Promise<HubOfapiCommand> {
    if (hubCommandClient === undefined) {
      throw hubWriteUnavailable();
    }
    if (row.coreCommandId !== null) {
      return hubCommandClient.getOfapiCommand({ commandId: row.coreCommandId });
    }
    let retryOfCommandId: string | null = null;
    if (row.retryOf !== null) {
      const original = data.outbox.get(row.retryOf);
      if (original !== null && original.transport === 'hub') {
        retryOfCommandId = original.coreCommandId;
      }
    }
    const command =
      row.mediaFiles.length > 0
        ? ({
            clientCommandId: row.localId,
            kind: 'send_media_message_v1',
            accountId: row.accountId,
            conversationId: row.chatId,
            payload: {
              text: row.text,
              price: row.price,
              mediaFiles: row.mediaFiles.map(toCommandMediaId),
              previews: row.previews.map(toCommandMediaId),
            },
            retryOfCommandId,
          } as const)
        : ({
            clientCommandId: row.localId,
            kind: 'send_text_message_v1',
            accountId: row.accountId,
            conversationId: row.chatId,
            payload: { text: row.text },
            retryOfCommandId,
          } as const);
    const accepted = await hubCommandClient.createOfapiCommand({
      command,
    });
    data.outbox.setCoreCommandId(row.localId, accepted.commandId);
    return accepted;
  }

  async function waitForHubCommand(command: HubOfapiCommand): Promise<HubOfapiCommand> {
    if (hubCommandClient === undefined) {
      throw hubWriteUnavailable();
    }
    let current = command;
    for (let poll = 0; poll < hubCommandPollLimit; poll += 1) {
      if (current.state !== 'queued' && current.state !== 'in_flight') {
        return current;
      }
      await sleep(hubCommandPollIntervalMs);
      current = await hubCommandClient.getOfapiCommand({ commandId: current.commandId });
    }
    return current;
  }

  async function attemptHubSend(row: OutboxRow): Promise<boolean> {
    try {
      const command = await waitForHubCommand(await ensureHubCommand(row));
      if (command.state === 'queued' || command.state === 'in_flight') {
        data.outbox.transition({
          localId: row.localId,
          from: ['sending'],
          to: 'unconfirmed',
          errorCode: 'CG-OF-06',
          errorMessage: 'The server command is still pending; status recovery will continue',
        });
        scheduleVerify(row.accountId, row.chatId);
        return false;
      }
      const sent = settleHubCommand(row, command);
      if (!sent && command.state === 'indeterminate') {
        scheduleVerify(row.accountId, row.chatId);
      }
      return sent;
    } catch (error) {
      const unavailable = isHubWriteUnavailable(error);
      // Intake is idempotent on localId/clientCommandId. A transport failure may
      // have happened after core accepted the command, so never fall back to a
      // direct send; recovery repeats intake with the same id and reads status.
      // Missing Hub config is the exception: no command could have been accepted.
      data.outbox.transition({
        localId: row.localId,
        from: ['sending'],
        to: unavailable ? 'failed' : 'unconfirmed',
        errorCode: hubFailureCode(error, unavailable),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (!unavailable) {
        scheduleVerify(row.accountId, row.chatId);
      }
      return false;
    }
  }

  async function unsendViaHub(accountId: string, chatId: string, messageId: string): Promise<void> {
    if (hubCommandClient === undefined) {
      throw hubWriteUnavailable();
    }
    const key = `${accountId}|${chatId}|${messageId}`;
    if (data.messages.get(accountId, chatId, messageId)?.deleted === true) {
      submittedHubUnsends.delete(key);
      return;
    }
    const pending = pendingHubUnsends.get(key);
    if (pending !== undefined) {
      return pending;
    }
    if (submittedHubUnsends.has(key)) {
      return;
    }
    submittedHubUnsends.add(key);

    const task = (async () => {
      try {
        const command = await waitForHubCommand(
          await hubCommandClient.createOfapiCommand({
            command: {
              clientCommandId: randomUUID(),
              kind: 'unsend_message_v1',
              accountId,
              conversationId: chatId,
              payload: { messageId },
            },
          }),
        );
        switch (command.state) {
          case 'confirmed':
            data.messages.markDeleted(accountId, chatId, [messageId]);
            submittedHubUnsends.delete(key);
            return;
          case 'queued':
          case 'in_flight':
          case 'indeterminate':
            return;
          case 'failed_retryable':
          case 'failed_terminal':
          case 'cancelled':
            submittedHubUnsends.delete(key);
            throw new Error(command.lastErrorCode ?? `Hub unsend command ended as ${command.state}`);
        }
      } catch (error) {
        if (isHubWriteUnavailable(error)) {
          submittedHubUnsends.delete(key);
        }
        throw error;
      }
    })();
    pendingHubUnsends.set(key, task);
    try {
      await task;
    } finally {
      if (pendingHubUnsends.get(key) === task) {
        pendingHubUnsends.delete(key);
      }
    }
  }

  async function markReadViaHub(accountId: string, chatId: string): Promise<boolean> {
    if (hubCommandClient === undefined) {
      return false;
    }
    const command = await waitForHubCommand(
      await hubCommandClient.createOfapiCommand({
        command: {
          clientCommandId: randomUUID(),
          kind: 'mark_chat_read_v1',
          accountId,
          conversationId: chatId,
          payload: {},
        },
      }),
    );
    return command.state === 'confirmed';
  }

  function zeroUnread(accountId: string, chatId: string): void {
    data.db
      .prepare(
        `UPDATE chats SET unread_count = 0, has_unread_tips = 0, updated_at = @updated_at
         WHERE account_id = @account_id AND chat_id = @chat_id`,
      )
      .run({ account_id: accountId, chat_id: chatId, updated_at: nowIso() });
    data.bus.publish({ scope: 'chats', accountId, chatId });
  }

  function failClosedDirectRow(row: OutboxRow): boolean {
    data.outbox.transition({
      localId: row.localId,
      from: ['sending'],
      to: 'failed',
      errorCode: 'CG-HUB-02',
      errorMessage: DIRECT_WRITE_DISABLED_MESSAGE,
    });
    return false;
  }

  /** Exactly one idempotent core command per claimed row; Direct rows fail closed. */
  async function attemptSend(row: OutboxRow): Promise<boolean> {
    if (row.transport === 'hub') {
      return attemptHubSend(row);
    }
    return failClosedDirectRow(row);
  }

  // ── Verifier (SPEC §7.5) ─────────────────────────────────────────────────

  /**
   * Verifier candidate test for one row (SPEC §7.5; PPV: PRD F7).
   * - Captioned rows: normalized text equality (the caption IS the text for
   *   PPV — same semantics as plain sends); PPV rows additionally pin
   *   price + media count so a caption-less twin or a plain text message
   *   with identical wording can't be cross-claimed.
   * - Caption-less rows exist ONLY for media/PPV sends (sendParts requires
   *   non-empty text): match on empty text + price + media count inside the
   *   window — the strongest evidence available without a message id.
   */
  function rowMatchesCandidate(row: OutboxRow, candidate: MessageRow): boolean {
    const rowCreatedMs = Date.parse(row.createdAt);
    const createdMs = Date.parse(candidate.createdAt);
    if (
      createdMs < rowCreatedMs - VERIFY_WINDOW_BEFORE_MS ||
      createdMs > rowCreatedMs + VERIFY_WINDOW_AFTER_MS
    ) {
      return false;
    }
    const isMediaSend = row.mediaFiles.length > 0;
    const wanted = normalizeForMatch(row.text);
    if (normalizeForMatch(candidate.textPlain) !== wanted) {
      return false;
    }
    if (!isMediaSend) {
      return true;
    }
    return candidate.price === row.price && candidate.media.length === row.mediaFiles.length;
  }

  /**
   * Matches the chat's unconfirmed rows against the LOCAL messages table:
   * own message + rowMatchesCandidate, each message id claimable by at most
   * one outbox row (no cross-claiming).
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
      const match = candidates.find(
        (candidate: MessageRow) =>
          !claimed.has(candidate.messageId) && rowMatchesCandidate(row, candidate),
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
    const hubRows = unconfirmed.filter((row) => row.transport === 'hub');
    for (const row of hubRows) {
      try {
        const command = await waitForHubCommand(await ensureHubCommand(row));
        settleHubCommand(row, command);
      } catch {
        // Core or network still unavailable; the periodic status pass retries.
      }
    }
    const directRows = data.outbox
      .listByStateForChat(accountId, chatId, 'unconfirmed')
      .filter((row) => row.transport === 'direct');
    if (directRows.length === 0) {
      return;
    }
    const { messages } = await client.listMessages({
      accountId,
      chatId,
      order: 'desc',
      limit: VERIFY_TAIL_LIMIT,
      purpose: 'send',
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
      for (const text of parts) {
        guardText({ accountId, chatId, text, surface: 'engine:sendParts' });
      }
      const sequenceId = parts.length > 1 ? randomUUID() : null;
      const createdAt = nowIso();
      const rows = parts.map((text, partIndex) => ({
        localId: randomUUID(),
        accountId,
        chatId,
        text,
        transport: HUB_WRITE_TRANSPORT,
        sequenceId,
        partIndex,
        retryOf: null,
        createdAt,
      }));
      data.outbox.insertMany(rows);
      kickPump(accountId, chatId);
      return { localIds: rows.map((row) => row.localId), sequenceId };
    },

    sendPpv({ accountId, chatId, text, price, mediaFiles, previews }) {
      // ALL validation precedes the insert: an invalid PPV must never enqueue.
      if (mediaFiles.length === 0) {
        throw new Error('sendPpv: at least one media file is required');
      }
      if (new Set(mediaFiles.map(String)).size !== mediaFiles.length) {
        throw new Error('sendPpv: mediaFiles contains duplicates');
      }
      if (!isValidPpvPrice(price)) {
        throw new Error(
          `sendPpv: price must be 0 (free) or a whole-dollar amount between ${PPV_PRICE_MIN} and ${PPV_PRICE_MAX}`,
        );
      }
      const attached = new Set(mediaFiles.map(String));
      for (const preview of previews) {
        if (!attached.has(String(preview))) {
          throw new Error('sendPpv: previews must be a subset of mediaFiles');
        }
      }
      gateCanSend(accountId, chatId);
      guardText({
        accountId,
        chatId,
        text,
        surface: 'engine:sendPpv',
        mediaCount: mediaFiles.length,
        price,
      });
      const localId = randomUUID();
      data.outbox.insertMany([
        {
          localId,
          accountId,
          chatId,
          text,
          transport: HUB_WRITE_TRANSPORT,
          sequenceId: null, // sequences never apply to PPV (one row, PRD F7)
          partIndex: 0,
          retryOf: null,
          createdAt: nowIso(),
          price,
          mediaFiles,
          previews,
        },
      ]);
      kickPump(accountId, chatId);
      return { localId };
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
      guardText({
        accountId,
        chatId: row.chatId,
        text,
        surface: 'engine:retry',
        mediaCount: row.mediaFiles.length,
        price: row.price,
      });
      data.outbox.transition({ localId, from: ['failed'], to: 'cancelled' }); // superseded
      const newLocalId = randomUUID();
      data.outbox.insertMany([
        {
          localId: newLocalId,
          accountId,
          chatId: row.chatId,
          text,
          transport: HUB_WRITE_TRANSPORT,
          sequenceId: null,
          partIndex: 0,
          retryOf: localId,
          createdAt: nowIso(),
          // PPV payload carries over unchanged (only the caption is editable);
          // previews ⊆ mediaFiles holds because the old row enforced it.
          price: row.price,
          mediaFiles: row.mediaFiles,
          previews: row.previews,
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
      if (hubCommandClient === undefined) {
        return;
      }
      void hubCommandClient
        .createOfapiCommand({
          command: {
            clientCommandId: randomUUID(),
            kind: 'typing_active_v1',
            accountId,
            conversationId: chatId,
            payload: {},
          },
        })
        .catch(() => undefined);
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
          void (async () => {
            const success = await markReadViaHub(accountId, chatId);
            if (!success) {
              return;
            }
            zeroUnread(accountId, chatId);
          })().catch(() => undefined); // lossy: the next conversation open retries
        }, MARK_READ_DEBOUNCE_MS),
      );
    },

    async unsend(accountId, chatId, messageId) {
      await unsendViaHub(accountId, chatId, messageId);
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
