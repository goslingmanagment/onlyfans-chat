// SPEC §7 send pipeline — the ONLY code path that may create Hub OFAPI commands.
// Correctness contract (SPEC §15.5, the product's most important invariant):
// a row is submitted to core at most once per stable client command id. Rows
// reach 'sending' exclusively through the atomic outbox.claimNextQueued
// (queued→sending persisted BEFORE command intake);
// no transition re-queues a row; restarts park 'sending' as 'unconfirmed'; and
// recovery is Hub status / local sync evidence or a NEW row (retry of a definite
// failure) — never a second attempt on the same row. Indeterminate outcomes
// (timeout / reset-after-send / 5xx) are NEVER auto-retried — the verifier
// promotes them on evidence (Hub command status or messages.sent/local DB match) only.

import { randomUUID } from 'node:crypto';
import { routeSchemas } from '@kernel/sdk';
import { createComposerActionService, type ComposerActionResult } from './composer-actions';
import type { ComposerAction } from '@chatgoose/shared/composer';
import { needsComposerV2, storedComposerSchema, centsToDollars, type ComposerOptions, type StoredComposer } from '@chatgoose/shared/composer';
import { CgError } from '@chatgoose/shared';
import { HubError, type HubClient, type HubOfapiCommand } from '@chatgoose/shared/hub/index';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import type {
  DataLayer,
  MessageMediaItem,
  MessageRow,
  OutboxMediaId,
  OutboxRow,
  OutboxTransport,
} from '../db/index';
import type { OfApiClient } from '../ofapi/client';
import type { SleepFn } from '../ofapi/rate-limiter';
import type { ToMediaUrl } from '../sync/mappers';
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
// Typing endpoint is free but rate-courteous: min 2.5 s between calls per chat.
export const TYPING_MIN_INTERVAL_MS = 2500;
// SPEC §7.9: mark-as-read debounced 1.5 s per chat, gated on the settings toggle.
export const MARK_READ_DEBOUNCE_MS = 1500;
export const HUB_COMMAND_POLL_INTERVAL_MS = 500;
export const HUB_COMMAND_POLL_LIMIT = 60;
export const UNSEND_RECOVERY_INTERVAL_MS = 5_000;
export const UNSEND_RECOVERY_MAX_AGE_MS = 10 * 60_000;
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
  unsendRecoveryIntervalMs?: number;
}

export interface SendEngine {
  performAction(accountId: string, chatId: string, action: ComposerAction): Promise<ComposerActionResult>;
  listActions(accountId: string, chatId: string, messageId?: string): ComposerActionResult[];
  /** Persists queued rows (atomically) and kicks the chat's pump; never awaits the send. */
  sendParts(args: {
    accountId: string;
    chatId: string;
    parts: readonly string[];
    outreachPurpose?: 'new-follower';
    composer?: ComposerOptions | undefined;
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
    composer?: ComposerOptions | undefined;
    priceCents?: number | undefined;
  }): { localId: string };
  /** FAILED rows only — the old row is cancelled (superseded), a NEW row queues. */
  retry(args: { accountId: string; localId: string; text: string; reuseProviderOperation?: boolean | undefined }): { localId: string };
  /** failed|unconfirmed → cancelled (audit row kept). */
  dismiss(args: { accountId: string; localId: string }): void;
  /** Remaining queued rows → cancelled; an in-flight part finishes its own course. */
  cancelSequence(args: { accountId: string; sequenceId: string }): void;
  /** Hub status + local match pass over the chat's unconfirmed rows (also user-triggered). */
  verifyChat(accountId: string, chatId: string): Promise<void>;
  /** messages.sent for a chat with unconfirmed rows → local-only match (no network). */
  handleSyncEvent(event: SyncEvent): void;
  /**
   * sending → unconfirmed (+verify); queued → cancelled — but ONLY at real boot
   * (isBoot, default true). A settings-driven rebuild (isBoot=false) skips those
   * destructive rewrites so it never falsely marks rows the outgoing engine may
   * still be pumping (SPEC §15.5); verification of already-unconfirmed rows runs
   * on both paths (self-reschedules via scheduleVerify). Durable unsend rows
   * resume the same idempotent command/status lineage on both paths.
   */
  reconcileOnBoot(isBoot?: boolean): Promise<void>;
  /**
   * Runtime-replacement barrier: reject or drop new platform-write work,
   * let every pump that already owns a chat drain its authorized queue, wait
   * for submitted unsends and every already-started credential-bound auxiliary
   * task (verification, mark-read, typing), then resolve. The composition root
   * MUST await this before publishing a replacement engine or closing the DB so
   * engine-local write ownership and DB access can never overlap generations.
   */
  quiesce(): Promise<void>;
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
  if(typeof id==='number'&&!Number.isSafeInteger(id))throw new Error('Media IDs must retain exact digits');
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

/** A24 (W4.5): kernel intake body codes raised BEFORE the command insert,
 * with the HTTP status each one is serialized under. The (code, status) pair
 * is the kernel's proof that NO command exists — anything less stays
 * indeterminate under the one-attempt law. */
const PRE_INTAKE_KERNEL_CODES: Record<string, number> = {
  service_unavailable: 503,
  not_found: 404,
  rate_limit_exceeded: 429,
  follower_outreach_conflict: 409,
};

/**
 * A24 (W4.5): true only for a DEFINITE pre-intake rejection — the fresh DB
 * row still has no coreCommandId (create-time failure is proven: the id is
 * persisted before any status read) AND the error carries a typed pre-intake
 * kernel body code under its matching HTTP status. Post-intake errors and
 * unparsed transport failures (a create that may have landed) return false.
 */
function isDefinitePreIntakeRejection(error: unknown, freshRow: OutboxRow | null): boolean {
  if (freshRow === null || freshRow.coreCommandId !== null) {
    return false;
  }
  if (!(error instanceof HubError)) {
    return false;
  }
  const kernelCode = error.detail?.kernelCode;
  if (kernelCode === undefined) {
    return false;
  }
  const expectedStatus = PRE_INTAKE_KERNEL_CODES[kernelCode];
  return expectedStatus !== undefined && error.detail?.status === expectedStatus;
}

/**
 * Review #27 fix 1: a reuse-key recovery child asks Hub to replay the ORIGINAL
 * row's provider operation. Its outcome says nothing about whether the
 * original was delivered unless the vendor itself rejected the (identical)
 * payload — so a refused child must never surface as failed-with-Retry: a
 * Retry mints a fresh key and is the one path to a duplicate DM.
 */
function isRecoveryChild(row: OutboxRow): boolean {
  return row.retryOf !== null && row.composer?.reuseProviderOperation === true;
}

/** Vendor statuses that reject the payload itself; the same payload was the
 * original's, so the original can never have been accepted either. Auth /
 * not-found / throttling say nothing about an earlier attempt. */
const DEFINITE_VENDOR_REJECTION_STATUSES: ReadonlySet<number> = new Set([400, 422]);

function isDefiniteVendorRejection(command: HubOfapiCommand): boolean {
  if (command.state !== 'failed_terminal' && command.state !== 'failed_retryable') {
    return false;
  }
  const evidence = command.verifierResult;
  return (
    evidence?.source === 'ofapi_response' &&
    typeof evidence.httpStatus === 'number' &&
    DEFINITE_VENDOR_REJECTION_STATUSES.has(evidence.httpStatus)
  );
}

/** A create-time HubError that carries a definite non-5xx HTTP status: the
 * kernel answered (409 reuse refusal, 4xx precondition) rather than the
 * transport failing after a possibly-accepted intake. */
function isDefiniteIntakeRefusal(error: unknown): boolean {
  return (
    error instanceof HubError &&
    typeof error.detail?.status === 'number' &&
    error.detail.status < 500
  );
}

/** The bounded refusal reason stored as the CG-OF-09 errorMessage (the
 * registry entry carries the human explanation; the UI shows this token). */
function describeRecoveryRefusal(command: HubOfapiCommand): string {
  const evidence = command.verifierResult;
  const reason =
    typeof evidence?.reason === 'string'
      ? evidence.reason
      : (command.lastErrorCode ?? command.state);
  return reason.slice(0, 200);
}

function mediaStubForConfirmedRow(row: OutboxRow, mediaId: OutboxMediaId): MessageMediaItem {
  const previewIds = new Set(row.previews.map(String));
  return {
    id: String(mediaId),
    type: 'other',
    thumbUrl: null,
    fullUrl: null,
    isReady: true,
    locked: row.price > 0 && !previewIds.has(String(mediaId)),
    durationSeconds: null,
  };
}

export function createSendEngine(options: SendEngineOptions): SendEngine {
  const { data, messageGuard, getSettings } = options;
  const hubCommandClient = options.hubCommandClient;
  const now = options.now ?? Date.now;
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const hubCommandPollIntervalMs =
    options.hubCommandPollIntervalMs ?? HUB_COMMAND_POLL_INTERVAL_MS;
  const hubCommandPollLimit = options.hubCommandPollLimit ?? HUB_COMMAND_POLL_LIMIT;
  const unsendRecoveryIntervalMs =
    options.unsendRecoveryIntervalMs ?? UNSEND_RECOVERY_INTERVAL_MS;

  const pumping = new Set<string>();
  const pumpTasks = new Set<Promise<void>>();
  const credentialTasks = new Set<Promise<unknown>>();
  const verifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const markReadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const unsendRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const typingLastAt = new Map<string, number>();
  const pendingHubUnsends = new Map<string, Promise<void>>();
  let quiescing = false;
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

  function assertAcceptingWriteWork(): void {
    if (quiescing || disposed) {
      throw new Error('Send engine is quiescing for runtime replacement');
    }
  }

  /** Claim one credential-bound async task before it can yield. A factory keeps
   * callers from starting network/DB work before the task is registered. Tasks
   * accepted before quiesce are allowed to settle; later callers are dropped. */
  function startCredentialTask<T>(start: () => Promise<T>): Promise<T> | null {
    if (quiescing || disposed) {
      return null;
    }
    const task = Promise.resolve().then(start);
    credentialTasks.add(task);
    // Observe both outcomes without replacing the promise returned to callers.
    void task.then(
      () => credentialTasks.delete(task),
      () => credentialTasks.delete(task),
    );
    return task;
  }

  function clearDeferredTimers(): void {
    for (const timer of verifyTimers.values()) {
      clearTimeout(timer);
    }
    verifyTimers.clear();
    for (const timer of markReadTimers.values()) {
      clearTimeout(timer);
    }
    markReadTimers.clear();
    for (const timer of unsendRecoveryTimers.values()) {
      clearTimeout(timer);
    }
    unsendRecoveryTimers.clear();
  }

  // ── Pump: single-flight per chat ─────────────────────────────────────────
  // One drain loop per chat at a time; rows queued while it runs are picked up
  // by the same loop (claimNextQueued re-reads the table each iteration), so a
  // second concurrent POST for the chat cannot exist.
  function kickPump(accountId: string, chatId: string): void {
    const key = chatKey(accountId, chatId);
    if (quiescing || disposed || pumping.has(key)) {
      return;
    }
    pumping.add(key);
    const task = (async () => {
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
    pumpTasks.add(task);
    // Observe both outcomes (the old fire-and-forget pump could otherwise
    // produce an unhandled rejection) and keep quiesce's task set exact.
    void task.then(
      () => pumpTasks.delete(task),
      () => pumpTasks.delete(task),
    );
  }

  function upsertHubConfirmedMessage(row: OutboxRow, command: HubOfapiCommand): void {
    if (command.platformMessageId === null) {
      throw new Error('Hub confirmed command omitted platformMessageId');
    }
    data.messages.insertManyIfAbsent([
      {
        accountId: row.accountId,
        chatId: row.chatId,
        messageId: command.platformMessageId,
        createdAt: command.attemptFinishedAt ?? command.updatedAt,
        isSentByMe: true,
        textHtml: row.text,
        textPlain: row.text,
        price: row.price,
        // A Core command confirmation proves send acceptance, not purchase/read
        // state. Keep PPV as not-purchased and own messages as SENT until a real
        // message body/read-state sweep supplies stronger evidence.
        isOpened: row.price > 0 ? false : null,
        isNew: true,
        isTip: false,
        tipAmount: null,
        tipText: null,
        replyTo: null,
        media: row.mediaFiles.map((mediaId) => mediaStubForConfirmedRow(row, mediaId)),
        deleted: false,
        raw: {
          source: 'hub-command',
          commandId: command.commandId,
        },
      },
    ]);
  }

  function validationExplanation(command: HubOfapiCommand): string | null {
    if (command.verifierResult?.httpStatus !== 422) return null;
    const raw = command.verifierResult.validationResponse;
    if (typeof raw !== 'string') return 'The provider rejected this draft. Edit it before sending again.';
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const record = value as Record<string, unknown>;
      const messages = [typeof record.message === 'string' ? record.message : null];
      if (record.errors && typeof record.errors === 'object') {
        for (const errors of Object.values(record.errors)) {
          if (Array.isArray(errors)) messages.push(...errors.filter((x): x is string => typeof x === 'string'));
        }
      }
      return messages.filter(Boolean).join(' ').slice(0, 2000) || 'The provider rejected this draft.';
    } catch { return 'The provider rejected this draft. Its original content is retained.'; }
  }
  function validationWords(command: HubOfapiCommand): string[] {
    if (command.verifierResult?.httpStatus !== 422) return [];
    try {
      const parsed: unknown = JSON.parse(String(command.verifierResult.validationResponse));
      if (!parsed || typeof parsed !== 'object') return [];
      const record = parsed as Record<string, unknown>;
      const words = record.banned_words ?? record.words ?? record.textHighLight;
      return Array.isArray(words) ? words.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
    } catch { return []; }
  }

  /**
   * Refused recovery: park the child (audit kept) and return the ORIGINAL to
   * 'unconfirmed' carrying the refusal, so the UI shows "needs manual check"
   * with no Retry/Edit affordance. The fallback (rows moved concurrently)
   * still never lands the child in 'failed'.
   */
  function revertRecovery(row: OutboxRow, message: string): void {
    const reverted =
      row.retryOf !== null &&
      data.outbox.revertRecoveryChild({
        childLocalId: row.localId,
        originalLocalId: row.retryOf,
        errorCode: 'CG-OF-09',
        errorMessage: message,
      });
    if (reverted) {
      return;
    }
    if (row.state === 'queued') {
      data.outbox.transition({ localId: row.localId, from: ['queued'], to: 'cancelled' });
      return;
    }
    data.outbox.transition({
      localId: row.localId,
      from: ['sending', 'unconfirmed'],
      to: 'unconfirmed',
      errorCode: 'CG-OF-09',
      errorMessage: message,
    });
  }

  /** Both the initial send and response-loss verification can meet a definite
   * reuse refusal. A durable command id means the error came from a status
   * read instead, so the accepted child must retain its existing identity. */
  function revertRefusedRecoveryIntake(row: OutboxRow, error: unknown): boolean {
    const freshRow = data.outbox.get(row.localId);
    if (
      !isRecoveryChild(row) ||
      freshRow === null ||
      freshRow.coreCommandId !== null ||
      !(isHubWriteUnavailable(error) || isDefinitePreIntakeRejection(error, freshRow) || isDefiniteIntakeRefusal(error))
    ) {
      return false;
    }
    revertRecovery(
      row,
      `intake refused: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
    );
    return true;
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
        if (isRecoveryChild(row) && !isDefiniteVendorRejection(command)) {
          revertRecovery(row, describeRecoveryRefusal(command));
          return false;
        }
        data.outbox.transition({
          localId: row.localId,
          from: ['sending', 'unconfirmed'],
          to: 'failed',
          errorCode: command.lastErrorCode ?? 'CG-APP-01',
          errorMessage:
            command.state === 'cancelled'
              ? 'The server command was cancelled before delivery'
              : validationExplanation(command) ?? `The server command ended as ${command.state}`,
          textHighlights: validationWords(command),
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
    const command = row.composer ? ({
      clientCommandId: row.localId, kind: 'send_message_v2', accountId: row.accountId,
      conversationId: row.chatId, retryOfCommandId,
      payload: { ...row.composer, text: row.text,
        mediaFiles: row.mediaFiles.map(toCommandMediaId), previews: row.previews.map(toCommandMediaId) },
    } as const) :
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
            ...(row.outreachPurpose ? { outreachPurpose: row.outreachPurpose } : {}),
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
      const freshRow = data.outbox.get(row.localId);
      const acceptedByCore = freshRow !== null && freshRow.coreCommandId !== null;
      // Intake is idempotent on localId/clientCommandId. A transport failure may
      // have happened after core accepted the command, so never fall back to a
      // direct send; recovery repeats intake with the same id and reads status.
      // Missing Hub config is the exception: no command could have been accepted.
      // A24 (W4.5): a DEFINITE pre-intake rejection (typed kernel body code
      // raised before the command insert, row provably without a
      // coreCommandId) parks 'failed' too — 'unconfirmed' fed the verifier's
      // first-time intake and produced the documented hours-late silent
      // stale send. 'failed' restores the retry affordance, which is safe
      // precisely because the kernel proved no command exists (a manual
      // retry mints a new clientCommandId).
      const preIntakeRejected =
        !unavailable && isDefinitePreIntakeRejection(error, freshRow);
      // Review #27 fix 1: a recovery child refused at intake (409 reuse
      // refusal, any definite 4xx, typed pre-intake code, or no Hub transport)
      // never parks as 'failed' — the original's delivery is still unknown.
      // A transport failure keeps the existing path: 'unconfirmed' + the
      // idempotent re-intake/status read, whose settle applies the same rule.
      if (revertRefusedRecoveryIntake(row, error)) {
        return false;
      }
      // Auth/bad-config is terminal only while intake is still provably absent.
      // Once coreCommandId is durable, even a 401 came from STATUS polling:
      // Core owns the accepted command and only the verifier may settle it.
      const terminalFailure = (unavailable && !acceptedByCore) || preIntakeRejected;
      data.outbox.transition({
        localId: row.localId,
        from: ['sending'],
        to: terminalFailure ? 'failed' : 'unconfirmed',
        errorCode: hubFailureCode(error, unavailable || preIntakeRejected),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (!terminalFailure) {
        scheduleVerify(row.accountId, row.chatId);
      }
      return false;
    }
  }

  function unsendKey(accountId: string, chatId: string, messageId: string): string {
    return `${accountId}|${chatId}|${messageId}`;
  }

  function isWithinUnsendRecoveryWindow(row: { createdAt: string }): boolean {
    const createdAtMs = Date.parse(row.createdAt);
    return Number.isFinite(createdAtMs) && now() - createdAtMs < UNSEND_RECOVERY_MAX_AGE_MS;
  }

  function canRecoverUnsendOnBoot(row: { createdAt: string; coreCommandId: string | null }): boolean {
    // An accepted command is always safe to inspect once on boot/reconfigure:
    // this is a status read, never a late intake. The hot five-second loop is
    // still age-bounded below so a permanently missing/expired Core command
    // cannot produce an unbounded request stream.
    return row.coreCommandId !== null || isWithinUnsendRecoveryWindow(row);
  }

  function scheduleUnsendRecovery(accountId: string, chatId: string, messageId: string): void {
    const key = unsendKey(accountId, chatId, messageId);
    const row = data.unsendCommands.get(accountId, chatId, messageId);
    if (
      quiescing ||
      disposed ||
      unsendRecoveryTimers.has(key) ||
      row === null ||
      !isWithinUnsendRecoveryWindow(row)
    ) {
      return;
    }
    unsendRecoveryTimers.set(
      key,
      setTimeout(() => {
        unsendRecoveryTimers.delete(key);
        const current = data.unsendCommands.get(accountId, chatId, messageId);
        if (current === null || !isWithinUnsendRecoveryWindow(current)) {
          return;
        }
        void unsendViaHub(accountId, chatId, messageId, false).catch(() => undefined);
      }, unsendRecoveryIntervalMs),
    );
  }

  async function ensureHubUnsendCommand(
    accountId: string,
    chatId: string,
    messageId: string,
  ): Promise<HubOfapiCommand> {
    if (hubCommandClient === undefined) {
      throw hubWriteUnavailable();
    }
    const row = data.unsendCommands.ensure({
      accountId,
      chatId,
      messageId,
      clientCommandId: randomUUID(),
      createdAt: nowIso(),
    });
    if (row.coreCommandId !== null) {
      return hubCommandClient.getOfapiCommand({ commandId: row.coreCommandId });
    }
    const accepted = await hubCommandClient.createOfapiCommand({
      command: {
        clientCommandId: row.clientCommandId,
        kind: 'unsend_message_v1',
        accountId,
        conversationId: chatId,
        payload: { messageId },
      },
    });
    // Persist server lineage before any status polling can yield or fail.
    data.unsendCommands.setCoreCommandId(accountId, chatId, messageId, accepted.commandId);
    return accepted;
  }

  async function unsendViaHub(
    accountId: string,
    chatId: string,
    messageId: string,
    waitForTerminal = true,
  ): Promise<void> {
    if (hubCommandClient === undefined) {
      throw hubWriteUnavailable();
    }
    const key = unsendKey(accountId, chatId, messageId);
    if (data.messages.get(accountId, chatId, messageId)?.deleted === true) {
      data.unsendCommands.remove(accountId, chatId, messageId);
      return;
    }
    const pending = pendingHubUnsends.get(key);
    if (pending !== undefined) {
      return pending;
    }

    let shouldScheduleRecovery = true;
    const task = (async () => {
      const initial = await ensureHubUnsendCommand(accountId, chatId, messageId);
      const command = waitForTerminal ? await waitForHubCommand(initial) : initial;
      switch (command.state) {
        case 'confirmed':
          data.messages.markDeleted(accountId, chatId, [messageId]);
          data.unsendCommands.remove(accountId, chatId, messageId);
          return;
        case 'queued':
        case 'in_flight':
          if (waitForTerminal) {
            throw new Error('Unsend is still pending in Agency Hub; the message remains visible.');
          }
          return;
        case 'indeterminate':
          // Never resubmit or poll an outcome Core has classified as
          // indeterminate. Keep the durable lineage for explicit later status
          // inspection, but stop the five-second background loop.
          shouldScheduleRecovery = false;
          if (waitForTerminal) {
            throw new Error('Unsend could not be confirmed; the message remains visible and was not resubmitted.');
          }
          return;
        case 'failed_retryable':
        case 'failed_terminal':
        case 'cancelled':
          data.unsendCommands.remove(accountId, chatId, messageId);
          throw new Error(command.lastErrorCode ?? `Hub unsend command ended as ${command.state}`);
      }
    })();
    pendingHubUnsends.set(key, task);
    try {
      await task;
    } finally {
      if (pendingHubUnsends.get(key) === task) {
        pendingHubUnsends.delete(key);
      }
      // Any retained row is unresolved. Retry status/intake later under the
      // same durable ids; confirmed/terminal paths removed it above.
      if (shouldScheduleRecovery) {
        scheduleUnsendRecovery(accountId, chatId, messageId);
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
      if (row.composer || row.outreachPurpose) continue; // Rich sends settle only through the Hub's bound response/webhook evidence.
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

  async function verifyChatInner(accountId: string, chatId: string): Promise<void> {
    if (quiescing || disposed) {
      return;
    }
    const unconfirmed = data.outbox.listByStateForChat(accountId, chatId, 'unconfirmed');
    if (unconfirmed.length === 0) {
      return;
    }
    const hubRows = unconfirmed.filter((row) => row.transport === 'hub');
    for (const row of hubRows) {
      if (quiescing || disposed) {
        return;
      }
      // A24 (W4.5): never perform FIRST-TIME intake for a stale row. A null
      // coreCommandId here means the kernel never accepted this command;
      // ensureHubCommand would CREATE and execute a brand-new one — at any
      // age via manual verifyNow, up to hours late via the periodic pass:
      // the documented silent stale send. The kernel's own queued-TTL is
      // 10 min (= VERIFY_AUTO_STOP_AGE_MS), so past it the answer is a
      // manual retry, never late intake. Status reads for rows the kernel
      // already accepted stay allowed at any age.
      if (
        row.coreCommandId === null &&
        now() - Date.parse(row.createdAt) > VERIFY_AUTO_STOP_AGE_MS
      ) {
        continue;
      }
      try {
        const command = await waitForHubCommand(await ensureHubCommand(row));
        settleHubCommand(row, command);
      } catch (error) {
        // A response-lost reuse may first receive its definitive refusal here.
        // Unknown transport errors and failures reading accepted commands stay
        // unconfirmed; only a refused intake returns custody to the original.
        revertRefusedRecoveryIntake(row, error);
      }
    }
    matchUnconfirmed(accountId, chatId);
  }

  function verifyChat(accountId: string, chatId: string): Promise<void> {
    return startCredentialTask(() => verifyChatInner(accountId, chatId)) ?? Promise.resolve();
  }

  function hasAutoVerifiableRows(accountId: string, chatId: string): boolean {
    return data.outbox
      .listByStateForChat(accountId, chatId, 'unconfirmed')
      .some((row) => now() - Date.parse(row.createdAt) <= VERIFY_AUTO_STOP_AGE_MS);
  }

  function scheduleVerify(accountId: string, chatId: string): void {
    const key = chatKey(accountId, chatId);
    if (quiescing || disposed || verifyTimers.has(key)) {
      return;
    }
    verifyTimers.set(
      key,
      setTimeout(() => {
        verifyTimers.delete(key);
        const task = startCredentialTask(async () => {
          if (!hasAutoVerifiableRows(accountId, chatId)) {
            return; // stale (>10 min) or resolved — manual verifyNow only
          }
          try {
            await verifyChatInner(accountId, chatId);
          } catch {
            // transient (offline); the rescheduled pass retries
          }
          if (!quiescing && !disposed && hasAutoVerifiableRows(accountId, chatId)) {
            scheduleVerify(accountId, chatId);
          }
        });
        if (task === null) {
          return;
        }
        void task.catch(() => undefined);
      }, VERIFY_INTERVAL_MS),
    );
  }

  function validateComposer(accountId: string, chatId: string, text: string, composer: StoredComposer, mediaFiles: readonly OutboxMediaId[] = [], previews: readonly OutboxMediaId[] = []): void {
    routeSchemas.createOfapiCommand.body.parse({
      clientCommandId: randomUUID(), kind: 'send_message_v2', accountId, conversationId: chatId,
      payload: { ...composer, text, mediaFiles: mediaFiles.map(toCommandMediaId), previews: previews.map(toCommandMediaId) },
    });
  }

  const actions = createComposerActionService(data, hubCommandClient, now);
  return {
    listActions: actions.list,
    performAction(accountId, chatId, action) {
      assertAcceptingWriteWork();
      const task = startCredentialTask(() => actions.perform(accountId, chatId, action));
      if (!task) return Promise.reject(new Error('Command runtime is retiring'));
      return task;
    },
    sendParts({ accountId, chatId, parts, composer, outreachPurpose }) {
      assertAcceptingWriteWork();
      if (parts.length === 0) {
        throw new Error('sendParts: at least one part is required');
      }
      // Review #27 fix 3: default options ⇒ the v1 `{ text }` command exactly
      // as before (no v2 dependency, local-match verification stays possible);
      // any rich option ⇒ send_message_v2.
      if (outreachPurpose && (parts.length !== 1 || composer)) throw new Error('Follower greetings must be one immediate plain-text message');
      const stored = composer && needsComposerV2(composer) ? storedComposerSchema.parse({ ...composer, priceCents: 0 }) : null;
      if (stored && parts.length > 1 && (stored.giphyId || stored.replyToMessageId || stored.rfTag.length || stored.rfPartner.length || stored.rfGuest.length)) throw new Error('Send a reply, GIF or release references as a single message.');
      if (stored && !outreachPurpose) for (const text of parts) validateComposer(accountId, chatId, text, stored);
      gateCanSend(accountId, chatId);
      for (const text of parts) {
        guardText({ accountId, chatId, text, surface: 'engine:sendParts' });
      }
      const sequenceId = parts.length > 1 ? randomUUID() : null;
      const createdAt = nowIso();
      const rows = parts.map((text, partIndex) => ({
        localId: randomUUID(),
        composer: stored,
        outreachPurpose: outreachPurpose ?? null,
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

    sendPpv({ accountId, chatId, text, price, mediaFiles, previews, composer, priceCents }) {
      assertAcceptingWriteWork();
      // ALL validation precedes the insert: an invalid PPV must never enqueue.
      if (mediaFiles.length === 0) {
        throw new Error('sendPpv: at least one media file is required');
      }
      if (new Set(mediaFiles.map(String)).size !== mediaFiles.length) {
        throw new Error('sendPpv: mediaFiles contains duplicates');
      }
      const stored = composer ? storedComposerSchema.parse({ ...composer, priceCents }) : null;
      if (stored) { validateComposer(accountId, chatId, text, stored, mediaFiles, previews); price = centsToDollars(stored.priceCents); }
      if (!stored && !isValidPpvPrice(price)) {
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
          composer: stored,
          mediaFiles,
          previews,
        },
      ]);
      kickPump(accountId, chatId);
      return { localId };
    },

    retry({ accountId, localId, text, reuseProviderOperation = false }) {
      assertAcceptingWriteWork();
      const row = data.outbox.get(localId);
      if (row === null || row.accountId !== accountId) {
        throw new Error('retry: unknown outbox row');
      }
      if (row.outreachPurpose) throw new Error('Перепроверьте фана на экране «Новые» перед повтором приветствия');
      if (reuseProviderOperation && (!row.composer || !row.coreCommandId || text !== row.text)) throw new Error('Recovery requires an unchanged v2 draft and its accepted Hub command.');
      if (row.state === 'unconfirmed' && !reuseProviderOperation) {
        // The verifier owns unconfirmed rows: the send may have been delivered,
        // so a retry here could double-message the fan (SPEC §15.5).
        throw new Error('retry: row is unconfirmed — verify or dismiss it first');
      }
      if (row.state !== 'failed' && !(reuseProviderOperation && row.state === 'unconfirmed')) {
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
      const newLocalId = randomUUID();
      const replaced = data.outbox.replaceFailedWithRetry(localId, {
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
        composer: row.composer ? { ...row.composer, reuseProviderOperation } : null,
        mediaFiles: row.mediaFiles,
        previews: row.previews,
      }, reuseProviderOperation);
      if (!replaced) {
        throw new Error('retry: failed row changed before the retry could be persisted');
      }
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

    async reconcileOnBoot(isBoot = true) {
      // Destructive rewrites run ONLY at real boot. A settings-driven rebuild
      // (isBoot=false) builds a new engine over the SAME DB while the outgoing
      // engine may still be pumping queued/sending rows — rewriting them here
      // would cancel live parts or falsely park an in-flight send as unconfirmed
      // (SPEC §15.5). At boot no engine is live, so the rewrites are safe.
      if (isBoot) {
        // A restart kills pending sequences — the app never auto-sends on boot.
        for (const row of data.outbox.listByState('queued')) {
          if (isRecoveryChild(row)) {
            // The reuse request never reached Hub: hand the original back to
            // manual check instead of leaving both rows cancelled.
            revertRecovery(row, 'app restarted before the request reached Hub');
            continue;
          }
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
      }
      // Verification of already-unconfirmed rows runs on BOTH paths (it only
      // reads status / matches local evidence, never auto-resends).
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
      // Auxiliary unsends have no ordinary outbox row. Resume each persisted
      // logical command once without blocking boot on the full polling window;
      // unresolved rows schedule periodic status/intake recovery.
      for (const row of data.unsendCommands.listPending()) {
        // Recovery is deliberately bounded. In particular, never turn an old
        // response-lost row with no Core command id into a surprise intake on
        // a much later application boot or settings-driven runtime rebuild.
        if (!canRecoverUnsendOnBoot(row)) {
          continue;
        }
        try {
          await unsendViaHub(row.accountId, row.chatId, row.messageId, false);
        } catch {
          // Offline/auth-failed startup retains the durable row; its scheduled
          // recovery and the next configured rebuild repeat the same client id.
        }
      }
    },

    async quiesce() {
      quiescing = true;
      clearDeferredTimers();
      // No new pump can enter after the flag flips. Existing pumps may still
      // own rows (or be between sequence parts), so wait for all of them to
      // drain before a replacement engine with a fresh per-chat lock is used.
      // An already-submitted unsend also owns the durable lineage row; wait for
      // its current network continuation before publishing a replacement.
      // credentialTasks covers verifier, typing and fired mark-read work through
      // their final DB continuation, making this barrier safe for purge too.
      while (pumpTasks.size > 0 || pendingHubUnsends.size > 0 || credentialTasks.size > 0) {
        await Promise.allSettled([
          ...pumpTasks,
          ...pendingHubUnsends.values(),
          ...credentialTasks,
        ]);
      }
    },

    typingActive(accountId, chatId) {
      // Typing is deliberately lossy; once retirement starts, drop the beacon
      // instead of extending the runtime handoff for it.
      if (quiescing || disposed) {
        return;
      }
      const key = chatKey(accountId, chatId);
      const last = typingLastAt.get(key);
      if (last !== undefined && now() - last < TYPING_MIN_INTERVAL_MS) {
        return;
      }
      typingLastAt.set(key, now());
      if (hubCommandClient === undefined) {
        return;
      }
      const task = startCredentialTask(async () => {
        await hubCommandClient.createOfapiCommand({
          command: {
            clientCommandId: randomUUID(),
            kind: 'typing_active_v1',
            accountId,
            conversationId: chatId,
            payload: {},
          },
        });
      });
      if (task !== null) {
        void task.catch(() => undefined);
      }
    },

    markRead(accountId, chatId) {
      return startCredentialTask(async () => {
        const settings = await getSettings();
        if (!settings.markAsReadOnOpen || quiescing || disposed) {
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
            const task = startCredentialTask(async () => {
              const success = await markReadViaHub(accountId, chatId);
              if (!success) {
                return;
              }
              zeroUnread(accountId, chatId);
            });
            if (task !== null) {
              void task.catch(() => undefined); // lossy: the next conversation open retries
            }
          }, MARK_READ_DEBOUNCE_MS),
        );
      }) ?? Promise.resolve();
    },

    async unsend(accountId, chatId, messageId) {
      assertAcceptingWriteWork();
      await unsendViaHub(accountId, chatId, messageId);
    },

    dispose() {
      // Shutdown stays synchronous/bounded: prevent any new work and clear
      // timers, but do not wait for network-bound pumps. Runtime replacement
      // uses await quiesce() before dispose().
      quiescing = true;
      disposed = true;
      clearDeferredTimers();
    },
  };
}
