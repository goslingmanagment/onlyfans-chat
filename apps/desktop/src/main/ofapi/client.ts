// Hand-written OFAPI client (SPEC §5). READ-ONLY by design for P3: every method
// is a GET; send / mark-read / typing / notes write paths deliberately do not
// exist in this module yet. All calls flow through the metered rate limiter and
// publish credit telemetry — never fetch OFAPI outside this client.
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
import type { RateLimiter, RateLimiterOptions, SleepFn } from './rate-limiter';
import { OfApiError, mapOfApiHttpError, mapOfApiNetworkError, ofApiShapeError, parseRetryAfterMs } from './errors';
import type { FixtureCapture } from './fixture-capture';
import {
  ofapiAccountSchema,
  ofapiChatSchema,
  ofapiEnvelopeSchema,
  ofapiFansDataSchema,
  ofapiMessageSchema,
  ofapiTransactionsDataSchema,
  ofapiUserSchema,
  ofapiUsersByIdSchema,
  ofapiWhoamiSchema,
} from './schemas';
import type {
  OfApiAccount,
  OfApiChat,
  OfApiMessage,
  OfApiTransaction,
  OfApiUser,
  OfApiWhoami,
} from './schemas';

export const OFAPI_BASE_URL = 'https://app.onlyfansapi.com/api';
export const USERS_MASS_LIST_MAX_IDS = 10;
export const FANS_LIST_MAX_LIMIT = 20;

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

  async function getJson(
    accountKey: string,
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<unknown> {
    const url = buildUrl(path, query);
    let response: Response;
    try {
      response = await executor.execute(accountKey, () =>
        fetchImpl(url, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(requestTimeoutMs),
        }),
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
        method: 'GET',
        url,
        requestHeaders: { authorization: `Bearer ${options.apiKey}`, accept: 'application/json' },
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
  };
}
