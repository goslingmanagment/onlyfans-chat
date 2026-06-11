// Hand-written OFAPI client (SPEC §5): read paths plus the §7 send-path writes
// (sendMessage / deleteMessage / like / unlike / typing / mark-as-read). OFAPI
// has NO idempotency keys, so every write runs with retry:'none' — EXACTLY one
// attempt, never auto-retried (a retried send can double-message a fan); the
// outbox owns recovery via classifySendFailure. All calls flow through the
// metered rate limiter and publish credit telemetry — never fetch OFAPI outside
// this client.
//
// Envelope unwrap is PER-OPERATION: account-scoped endpoints return
// {data,_meta,_pagination}, but /api/accounts returns a bare array and
// /api/whoami a bare object (verified live 2026-06-10).

import { z } from 'zod';
import { OFAPI_REQUEST_TIMEOUT_MS } from '@chatgoose/shared';
import type { operations } from './ofapi.gen';
import { createCreditMeter } from './credit-meter';
import type { CreditMeter, CreditMeterListener } from './credit-meter';
import { createRateLimiter, createRequestExecutor } from './rate-limiter';
import type { RateLimiter, RateLimiterOptions, RetryPolicy, SleepFn } from './rate-limiter';
import { OfApiError, mapOfApiHttpError, mapOfApiNetworkError, ofApiShapeError, parseRetryAfterMs } from './errors';
import type { FixtureCapture } from './fixture-capture';
import {
  ofapiAccountSchema,
  ofapiChatMediaDataSchema,
  ofapiChatSchema,
  ofapiEnvelopeSchema,
  ofapiFansDataSchema,
  ofapiLikeDataSchema,
  ofapiMessageSchema,
  ofapiSentMessageSchema,
  ofapiSuccessDataSchema,
  ofapiTransactionsDataSchema,
  ofapiUploadStatusSchema,
  ofapiUserSchema,
  ofapiUsersByIdSchema,
  ofapiVaultListsDataSchema,
  ofapiVaultMediaDataSchema,
  ofapiVaultMediaSchema,
  ofapiVaultUploadStartedSchema,
  ofapiWhoamiSchema,
} from './schemas';
import type {
  OfApiAccount,
  OfApiChat,
  OfApiChatMediaMessage,
  OfApiLikeResult,
  OfApiMessage,
  OfApiSentMessage,
  OfApiTransaction,
  OfApiUploadStatus,
  OfApiUser,
  OfApiVaultList,
  OfApiVaultMedia,
  OfApiWhoami,
} from './schemas';

export const OFAPI_BASE_URL = 'https://app.onlyfansapi.com/api';
export const USERS_MASS_LIST_MAX_IDS = 10;
export const FANS_LIST_MAX_LIMIT = 20;
/** List Vault Media: documented limit range 10–100 (default 24). */
export const VAULT_LIST_MAX_LIMIT = 100;
/** Direct multipart `file` uploads are capped at 100 MB by Cloudflare
 *  (vendored uploading-media guide; decimal MB per OFAPI credit policy). */
export const VAULT_UPLOAD_MAX_BYTES = 100 * 1_000_000;
/** Media upload pricing: 3 credits per decimal MB (1 MB = 1,000 KB — vendored
 *  credits table, llms-full.txt "Media Uploading"). */
export const UPLOAD_CREDITS_PER_MB = 3;

/** Size preflight: bytes → estimated upload cost in credits (ceil to whole). */
export function estimateUploadCredits(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.ceil((bytes / 1_000_000) * UPLOAD_CREDITS_PER_MB);
}

/** Multipart uploads can outlive the default API deadline (100 MB cap). */
export const UPLOAD_TIMEOUT_MS = 5 * 60_000;

/** Rate-limiter key for team-level endpoints (no account scope). */
const GLOBAL_KEY = '__global__';

type ListChatsQuery = NonNullable<operations['listChats']['parameters']['query']>;
export type ChatListFilter = Exclude<ListChatsQuery['filter'], undefined>;
export type ChatListOrder = Exclude<ListChatsQuery['order'], undefined>;
export type SkipUsers = Exclude<ListChatsQuery['skip_users'], undefined>;
export type MessageListOrder = 'desc' | 'asc';
export type TransactionType = 'subscribes' | 'tips' | 'post' | 'chat_messages' | 'stream';

export interface OfApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onMeta?: CreditMeterListener;
  creditMeter?: CreditMeter;
  rateLimiter?: RateLimiter;
  /** Used only when no rateLimiter instance is injected. */
  limits?: RateLimiterOptions;
  requestTimeoutMs?: number;
  /** Backoff sleep for 429/5xx retries (injectable for tests). */
  sleep?: SleepFn;
  fixtureCapture?: FixtureCapture;
}

export interface ListChatsParams {
  accountId: string;
  limit?: number;
  offset?: number;
  filter?: ChatListFilter;
  query?: string;
  order?: ChatListOrder;
  skipUsers?: SkipUsers;
}

export interface ListMessagesParams {
  accountId: string;
  chatId: string;
  limit?: number;
  /** Scrollback into history (order=desc, boundary-inclusive). */
  firstId?: string;
  /** Ascending tail from a cached boundary (order=asc, boundary-inclusive — dedupe!). */
  lastId?: string;
  order?: MessageListOrder;
  skipUsers?: SkipUsers;
}

export interface ListTransactionsParams {
  accountId: string;
  type?: TransactionType;
  marker?: number;
  startDate?: string;
  limit?: number;
}

export interface ListFansParams {
  accountId: string;
  /** Upstream max 20. */
  limit?: number;
  offset?: number;
  query?: string;
}

export interface SendMessageParams {
  accountId: string;
  chatId: string;
  text: string;
  replyToMessageId?: number;
  /** Hide the text behind the paywall (requires price + mediaFiles upstream). */
  lockedText?: boolean;
  /** Dollars; 0 or 3–200 upstream. Non-zero requires mediaFiles. */
  price?: number;
  /** OFAPI `ofapi_media_…` ids or OF vault ids. */
  mediaFiles?: ReadonlyArray<string | number>;
  /** Same id forms, or integer indices into mediaFiles. */
  previews?: ReadonlyArray<string | number>;
}

export interface MessageRefParams {
  accountId: string;
  chatId: string;
  messageId: string;
}

export interface ChatRefParams {
  accountId: string;
  chatId: string;
}

// ── Vault / media (PRD F7) ──────────────────────────────────────────────

export type VaultSortField = 'recent' | 'most-liked' | 'highest-tips';
export type VaultMediaType = 'photo' | 'gif' | 'video' | 'audio';

export interface ListVaultMediaParams {
  accountId: string;
  /** Free-text search. */
  query?: string;
  field?: VaultSortField;
  type?: VaultMediaType;
  /** Vault list (album) id — the `list` query param. */
  listId?: string | number;
  sort?: 'desc' | 'asc';
  /** 10–100, default 24 (openapi). */
  limit?: number;
  offset?: number;
}

export interface ListVaultListsParams {
  accountId: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ListChatMediaParams {
  accountId: string;
  chatId: string;
  type?: VaultMediaType;
  limit?: number;
  offset?: number;
}

export interface UploadVaultMediaParams {
  accountId: string;
  /** Original file name (multipart filename hint). */
  fileName: string;
  /** Raw file bytes (read in main via fs — never a renderer-supplied path). */
  data: Uint8Array;
  /** Background processing: 202 + polling_url (recommended >50 MB). */
  useAsync?: boolean;
}

export type VaultUploadOutcome =
  | { kind: 'completed'; media: OfApiVaultMedia }
  | { kind: 'started'; prefixedId: string; pollingUrl: string };

export interface OfApiClient {
  readonly creditMeter: CreditMeter;
  listAccounts(): Promise<OfApiAccount[]>;
  whoami(): Promise<OfApiWhoami>;
  listChats(params: ListChatsParams): Promise<{ chats: OfApiChat[]; nextPageUrl: string | null }>;
  listMessages(
    params: ListMessagesParams,
  ): Promise<{ messages: OfApiMessage[]; nextPageUrl: string | null }>;
  getMessage(params: { accountId: string; chatId: string; messageId: string }): Promise<OfApiMessage>;
  getUserByUsername(params: { accountId: string; username: string }): Promise<OfApiUser>;
  /** Mass-list, credit saver: up to 10 ids per call. */
  getUsersByIds(params: {
    accountId: string;
    ids: ReadonlyArray<string | number>;
  }): Promise<Record<string, OfApiUser>>;
  listTransactions(params: ListTransactionsParams): Promise<{
    transactions: OfApiTransaction[];
    hasMore: boolean;
    nextMarker: number | null;
    nextPageUrl: string | null;
  }>;
  listFansAll(params: ListFansParams): Promise<{ fans: OfApiUser[]; hasMore: boolean }>;
  listFansActive(params: ListFansParams): Promise<{ fans: OfApiUser[]; hasMore: boolean }>;
  // ── Vault / media reads (PRD F7): GETs, retry 'idempotent' ──
  listVaultMedia(params: ListVaultMediaParams): Promise<{ items: OfApiVaultMedia[]; hasMore: boolean }>;
  /** Vault lists = albums. Listing a list's media uses listVaultMedia({listId}). */
  listVaultLists(params: ListVaultListsParams): Promise<{ lists: OfApiVaultList[]; hasMore: boolean }>;
  getVaultMedia(params: { accountId: string; mediaId: string | number }): Promise<OfApiVaultMedia>;
  /** Chat media gallery: message objects carrying their media. */
  listChatMedia(params: ListChatMediaParams): Promise<{
    messages: OfApiChatMediaMessage[];
    hasMore: boolean;
    nextLastId: string | null;
  }>;
  /** Free polling endpoint for async uploads (no credits). */
  getUploadStatus(params: { accountId: string; uploadId: string }): Promise<OfApiUploadStatus>;
  /**
   * Multipart vault upload (3 credits/MB — run estimateUploadCredits first).
   * Write path: retry 'none' (a retried upload double-bills credits).
   */
  uploadVaultMedia(params: UploadVaultMediaParams): Promise<VaultUploadOutcome>;
  // ── Write paths (SPEC §7): non-idempotent, retry:'none', NEVER auto-retried ──
  sendMessage(params: SendMessageParams): Promise<OfApiSentMessage>;
  /** Unsend; only within the message's cancelSeconds window (≈24 h). */
  deleteMessage(params: MessageRefParams): Promise<{ success: boolean }>;
  likeMessage(params: MessageRefParams): Promise<OfApiLikeResult>;
  unlikeMessage(params: MessageRefParams): Promise<OfApiLikeResult>;
  /** Fire-and-forget (0 credits): failures surface but must never be queued/retried. */
  startTyping(params: ChatRefParams): Promise<void>;
  markChatRead(params: ChatRefParams): Promise<{ success: boolean }>;
}

type QueryValue = string | number | undefined;

function usageError(message: string): OfApiError {
  return new OfApiError('CG-APP-01', { message, detail: { provider: 'ofapi' } });
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

export function createOfApiClient(options: OfApiClientOptions): OfApiClient {
  const baseUrl = (options.baseUrl ?? OFAPI_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? OFAPI_REQUEST_TIMEOUT_MS;
  const creditMeter =
    options.creditMeter ??
    createCreditMeter(options.onMeta ? { onMeta: options.onMeta } : {});
  if (options.creditMeter && options.onMeta) options.creditMeter.subscribe(options.onMeta);
  const limiter = options.rateLimiter ?? createRateLimiter(options.limits ?? {});
  const executor = createRequestExecutor({
    limiter,
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });

  function buildUrl(path: string, query: Record<string, QueryValue>): string {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  interface RequestSpec {
    accountKey: string;
    method: 'GET' | 'POST' | 'DELETE';
    path: string;
    query?: Record<string, QueryValue>;
    /** JSON-serialized request body (POST). */
    jsonBody?: unknown;
    /** Multipart body (vault upload). Mutually exclusive with jsonBody; the
     *  content-type (with boundary) is set by fetch itself. */
    formBody?: () => FormData;
    /** Longer deadline for large multipart bodies. */
    timeoutMs?: number;
    retry: RetryPolicy;
  }

  async function requestJson(spec: RequestSpec): Promise<unknown> {
    const url = buildUrl(spec.path, spec.query ?? {});
    const requestHeaders: Record<string, string> = {
      authorization: `Bearer ${options.apiKey}`,
      accept: 'application/json',
      ...(spec.jsonBody !== undefined ? { 'content-type': 'application/json' } : {}),
    };
    let response: Response;
    try {
      response = await executor.execute(
        spec.accountKey,
        () =>
          fetchImpl(url, {
            method: spec.method,
            headers: requestHeaders,
            ...(spec.jsonBody !== undefined
              ? { body: JSON.stringify(spec.jsonBody) }
              : spec.formBody !== undefined
                ? { body: spec.formBody() }
                : {}),
            signal: AbortSignal.timeout(spec.timeoutMs ?? requestTimeoutMs),
          }),
        { retry: spec.retry },
      );
    } catch (error) {
      throw mapOfApiNetworkError(error, url);
    }

    const text = await response.text();
    let body: unknown = null;
    if (text !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const metaCarrier = z.looseObject({ _meta: z.unknown() }).safeParse(body);
    creditMeter.record({
      headers: response.headers,
      meta: metaCarrier.success ? metaCarrier.data._meta : undefined,
    });

    if (options.fixtureCapture?.enabled) {
      options.fixtureCapture.record({
        method: spec.method,
        url,
        requestHeaders,
        ...(spec.jsonBody !== undefined ? { requestBody: spec.jsonBody } : {}),
        status: response.status,
        responseHeaders: headersToRecord(response.headers),
        responseBody: body,
      });
    }

    if (!response.ok) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw mapOfApiHttpError({
        status: response.status,
        url,
        body,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
    }
    return body;
  }

  function getJson(
    accountKey: string,
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<unknown> {
    return requestJson({ accountKey, method: 'GET', path, query, retry: 'idempotent' });
  }

  function parseWith<T>(schema: z.ZodType<T>, value: unknown, url: string): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw ofApiShapeError(url, z.prettifyError(result.error).slice(0, 500));
    }
    return result.data;
  }

  /** Account-scoped operations: unwrap the {data,_meta,_pagination} envelope. */
  function unwrapEnvelope(payload: unknown, url: string): {
    data: unknown;
    nextPageUrl: string | null;
  } {
    const envelope = parseWith(ofapiEnvelopeSchema, payload, url);
    return { data: envelope.data, nextPageUrl: envelope._pagination?.next_page ?? null };
  }

  function accountPath(accountId: string, rest: string): string {
    return `/${encodeURIComponent(accountId)}${rest}`;
  }

  function chatPath(params: ChatRefParams, rest: string): string {
    return accountPath(params.accountId, `/chats/${encodeURIComponent(params.chatId)}${rest}`);
  }

  function messagePath(params: MessageRefParams, rest = ''): string {
    return chatPath(params, `/messages/${encodeURIComponent(params.messageId)}${rest}`);
  }

  async function listFans(
    endpoint: '/fans/all' | '/fans/active',
    params: ListFansParams,
  ): Promise<{ fans: OfApiUser[]; hasMore: boolean }> {
    if (params.limit !== undefined && params.limit > FANS_LIST_MAX_LIMIT) {
      throw usageError(`listFans: upstream limit max is ${FANS_LIST_MAX_LIMIT}`);
    }
    const path = accountPath(params.accountId, endpoint);
    const payload = await getJson(params.accountId, path, {
      limit: params.limit,
      offset: params.offset,
      query: params.query,
    });
    const { data } = unwrapEnvelope(payload, path);
    const parsed = parseWith(ofapiFansDataSchema, data, path);
    return { fans: parsed.list, hasMore: parsed.hasMore ?? false };
  }

  return {
    creditMeter,

    async listAccounts(): Promise<OfApiAccount[]> {
      const path = '/accounts';
      // Bare top-level array — no envelope (live-verified).
      const payload = await getJson(GLOBAL_KEY, path);
      return parseWith(z.array(ofapiAccountSchema), payload, path);
    },

    async whoami(): Promise<OfApiWhoami> {
      const path = '/whoami';
      // Bare object — no envelope (live-verified).
      const payload = await getJson(GLOBAL_KEY, path);
      return parseWith(ofapiWhoamiSchema, payload, path);
    },

    async listChats(params): Promise<{ chats: OfApiChat[]; nextPageUrl: string | null }> {
      const path = accountPath(params.accountId, '/chats');
      const payload = await getJson(params.accountId, path, {
        limit: params.limit ?? 50,
        offset: params.offset,
        order: params.order ?? 'recent',
        filter: params.filter,
        query: params.query,
        // Always explicit: live default differs from the documented default (SPEC §5).
        skip_users: params.skipUsers ?? 'none',
      });
      const { data, nextPageUrl } = unwrapEnvelope(payload, path);
      return { chats: parseWith(z.array(ofapiChatSchema), data, path), nextPageUrl };
    },

    async listMessages(params): Promise<{ messages: OfApiMessage[]; nextPageUrl: string | null }> {
      if (params.firstId !== undefined && params.lastId !== undefined) {
        throw usageError('listMessages: first_id and last_id are mutually exclusive');
      }
      const order = params.order ?? (params.lastId !== undefined ? 'asc' : 'desc');
      if (params.firstId !== undefined && order !== 'desc') {
        throw usageError('listMessages: first_id pages backward and requires order=desc');
      }
      if (params.lastId !== undefined && order !== 'asc') {
        throw usageError('listMessages: last_id reads the ascending tail and requires order=asc');
      }
      const path = accountPath(
        params.accountId,
        `/chats/${encodeURIComponent(params.chatId)}/messages`,
      );
      const payload = await getJson(params.accountId, path, {
        limit: params.limit ?? 100,
        order,
        first_id: params.firstId,
        last_id: params.lastId,
        skip_users: params.skipUsers ?? 'all',
      });
      const { data, nextPageUrl } = unwrapEnvelope(payload, path);
      return { messages: parseWith(z.array(ofapiMessageSchema), data, path), nextPageUrl };
    },

    async getMessage(params): Promise<OfApiMessage> {
      const path = accountPath(
        params.accountId,
        `/chats/${encodeURIComponent(params.chatId)}/messages/${encodeURIComponent(params.messageId)}`,
      );
      const payload = await getJson(params.accountId, path);
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiMessageSchema, data, path);
    },

    async getUserByUsername(params): Promise<OfApiUser> {
      const path = accountPath(params.accountId, `/users/${encodeURIComponent(params.username)}`);
      const payload = await getJson(params.accountId, path);
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiUserSchema, data, path);
    },

    async getUsersByIds(params): Promise<Record<string, OfApiUser>> {
      if (params.ids.length === 0) {
        throw usageError('getUsersByIds: at least one id is required');
      }
      if (params.ids.length > USERS_MASS_LIST_MAX_IDS) {
        throw usageError(
          `getUsersByIds: mass-list accepts at most ${USERS_MASS_LIST_MAX_IDS} ids per call`,
        );
      }
      const path = accountPath(params.accountId, '/users/list');
      const payload = await getJson(params.accountId, path, { ids: params.ids.join(',') });
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiUsersByIdSchema, data, path);
    },

    async listTransactions(params): Promise<{
      transactions: OfApiTransaction[];
      hasMore: boolean;
      nextMarker: number | null;
      nextPageUrl: string | null;
    }> {
      const path = accountPath(params.accountId, '/transactions');
      const payload = await getJson(params.accountId, path, {
        limit: params.limit,
        type: params.type,
        marker: params.marker,
        startDate: params.startDate,
      });
      const { data, nextPageUrl } = unwrapEnvelope(payload, path);
      const parsed = parseWith(ofapiTransactionsDataSchema, data, path);
      return {
        transactions: parsed.list,
        hasMore: parsed.hasMore ?? parsed.nextMarker != null,
        nextMarker: parsed.nextMarker ?? null,
        nextPageUrl,
      };
    },

    async listFansAll(params): Promise<{ fans: OfApiUser[]; hasMore: boolean }> {
      return listFans('/fans/all', params);
    },

    async listFansActive(params): Promise<{ fans: OfApiUser[]; hasMore: boolean }> {
      return listFans('/fans/active', params);
    },

    async listVaultMedia(params): Promise<{ items: OfApiVaultMedia[]; hasMore: boolean }> {
      if (params.limit !== undefined && params.limit > VAULT_LIST_MAX_LIMIT) {
        throw usageError(`listVaultMedia: upstream limit max is ${VAULT_LIST_MAX_LIMIT}`);
      }
      const path = accountPath(params.accountId, '/media/vault');
      const payload = await getJson(params.accountId, path, {
        query: params.query,
        field: params.field,
        type: params.type,
        list: params.listId,
        sort: params.sort,
        limit: params.limit,
        offset: params.offset,
      });
      const { data } = unwrapEnvelope(payload, path);
      const parsed = parseWith(ofapiVaultMediaDataSchema, data, path);
      return { items: parsed.list, hasMore: parsed.hasMore ?? false };
    },

    async listVaultLists(params): Promise<{ lists: OfApiVaultList[]; hasMore: boolean }> {
      const path = accountPath(params.accountId, '/media/vault/lists');
      const payload = await getJson(params.accountId, path, {
        query: params.query,
        limit: params.limit,
        offset: params.offset,
      });
      const { data } = unwrapEnvelope(payload, path);
      const parsed = parseWith(ofapiVaultListsDataSchema, data, path);
      return { lists: parsed.list, hasMore: parsed.hasMore ?? false };
    },

    async getVaultMedia(params): Promise<OfApiVaultMedia> {
      const path = accountPath(
        params.accountId,
        `/media/vault/${encodeURIComponent(String(params.mediaId))}`,
      );
      const payload = await getJson(params.accountId, path);
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiVaultMediaSchema, data, path);
    },

    async listChatMedia(params): Promise<{
      messages: OfApiChatMediaMessage[];
      hasMore: boolean;
      nextLastId: string | null;
    }> {
      const path = chatPath(params, '/media');
      const payload = await getJson(params.accountId, path, {
        type: params.type,
        limit: params.limit,
        offset: params.offset,
        // Gallery cells need no fan profile rows (consistent with listMessages).
        skip_users: 'all',
      });
      const { data } = unwrapEnvelope(payload, path);
      const parsed = parseWith(ofapiChatMediaDataSchema, data, path);
      return {
        messages: parsed.list,
        hasMore: parsed.hasMore ?? false,
        nextLastId: parsed.nextLastId != null ? String(parsed.nextLastId) : null,
      };
    },

    async getUploadStatus(params): Promise<OfApiUploadStatus> {
      const path = accountPath(
        params.accountId,
        `/media/uploads/${encodeURIComponent(params.uploadId)}/status`,
      );
      // Bare object — no envelope (openapi-verified); free, no credits.
      const payload = await getJson(params.accountId, path);
      return parseWith(ofapiUploadStatusSchema, payload, path);
    },

    async uploadVaultMedia(params): Promise<VaultUploadOutcome> {
      if (params.data.byteLength === 0) {
        throw usageError('uploadVaultMedia: file is empty');
      }
      if (params.data.byteLength > VAULT_UPLOAD_MAX_BYTES) {
        throw usageError(
          `uploadVaultMedia: direct uploads are capped at ${VAULT_UPLOAD_MAX_BYTES} bytes (Cloudflare)`,
        );
      }
      const path = accountPath(params.accountId, '/media/vault');
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'POST',
        path,
        formBody: () => {
          const form = new FormData();
          // Exactly one of file|file_url (422 otherwise) — we always send `file`.
          // Cast: fs bytes are never SharedArrayBuffer-backed (TS5.7 generic Uint8Array).
          form.append('file', new Blob([params.data as Uint8Array<ArrayBuffer>]), params.fileName);
          if (params.useAsync === true) form.append('async', 'true');
          return form;
        },
        // Large multipart bodies outlive the default API deadline.
        timeoutMs: UPLOAD_TIMEOUT_MS,
        retry: 'none', // credits are billed per attempt — never auto-retry
      });
      // async=true → 202 with a BARE {status,prefixed_id,polling_url} (no
      // envelope); the sync 200 envelope carries none of those keys.
      const started = ofapiVaultUploadStartedSchema.safeParse(payload);
      if (started.success) {
        return {
          kind: 'started',
          prefixedId: started.data.prefixed_id,
          pollingUrl: started.data.polling_url,
        };
      }
      const { data } = unwrapEnvelope(payload, path);
      return { kind: 'completed', media: parseWith(ofapiVaultMediaSchema, data, path) };
    },

    async sendMessage(params): Promise<OfApiSentMessage> {
      const path = chatPath(params, '/messages');
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'POST',
        path,
        jsonBody: {
          text: params.text,
          ...(params.replyToMessageId !== undefined
            ? { replyToMessageId: params.replyToMessageId }
            : {}),
          ...(params.lockedText !== undefined ? { lockedText: params.lockedText } : {}),
          ...(params.price !== undefined ? { price: params.price } : {}),
          ...(params.mediaFiles !== undefined ? { mediaFiles: [...params.mediaFiles] } : {}),
          ...(params.previews !== undefined ? { previews: [...params.previews] } : {}),
        },
        retry: 'none',
      });
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiSentMessageSchema, data, path);
    },

    async deleteMessage(params): Promise<{ success: boolean }> {
      const path = messagePath(params);
      // Non-idempotent in effect: a second DELETE after an unseen success errors.
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'DELETE',
        path,
        retry: 'none',
      });
      const { data } = unwrapEnvelope(payload, path);
      return { success: parseWith(ofapiSuccessDataSchema, data, path).success };
    },

    async likeMessage(params): Promise<OfApiLikeResult> {
      const path = messagePath(params, '/like');
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'POST',
        path,
        retry: 'none',
      });
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiLikeDataSchema, data, path);
    },

    async unlikeMessage(params): Promise<OfApiLikeResult> {
      const path = messagePath(params, '/unlike');
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'DELETE',
        path,
        retry: 'none',
      });
      const { data } = unwrapEnvelope(payload, path);
      return parseWith(ofapiLikeDataSchema, data, path);
    },

    async startTyping(params): Promise<void> {
      const path = chatPath(params, '/typing');
      // 0 credits; losing one is harmless — surface failures, never queue retries.
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'POST',
        path,
        retry: 'none',
      });
      unwrapEnvelope(payload, path);
    },

    async markChatRead(params): Promise<{ success: boolean }> {
      const path = chatPath(params, '/mark-as-read');
      const payload = await requestJson({
        accountKey: params.accountId,
        method: 'POST',
        path,
        retry: 'none',
      });
      const { data } = unwrapEnvelope(payload, path);
      return { success: parseWith(ofapiSuccessDataSchema, data, path).success };
    },
  };
}
