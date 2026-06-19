// Agency Hub ("core") REST client — SPEC §8.5/§8.6/§9.1. Fresh code to the
// legacy behavioral spec (legacy research §7); response shapes verified against
// core's OpenAPI snapshot (~/code/core/reference/agency-hub.openapi.json) and
// the live contract check of 2026-06-11. Platform-pure: fetch + AbortSignal only,
// typed structurally (lib "ES2023" has no DOM types). Instantiated in the
// Electron main process only — never import from the renderer (SPEC §15).

import { z } from 'zod';
import type { CgErrorDetail } from '../errors/index';
import { CgError } from '../errors/index';
import type { LlmUsageMetrics } from '../llm/sse';
import { parseSseEventBlock } from '../llm/sse';

// Minimal ambient type for the WHATWG TextDecoder global (lib "ES2023" has no DOM types).
declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

// ─── Timeouts & limits (legacy constants are normative; research §7) ─────

/** Legacy AGENCY_HUB_PREFETCH_TIMEOUT_MS — profile GET before generation (SPEC §8.5). */
export const HUB_PROFILE_GET_TIMEOUT_MS = 5_000;
/** Legacy AGENCY_HUB_SYNC_TIMEOUT_MS — fire-and-forget profile push (SPEC §8.5). */
export const HUB_PROFILE_PUT_TIMEOUT_MS = 10_000;
/** SPEC-era value; legacy used 5 s per flush, superseded for the desktop reporter. */
export const HUB_USAGE_BATCH_TIMEOUT_MS = 15_000;
/** No legacy constant; bounded by the 10 s sync window the call used to run inside. */
export const HUB_LIST_PAGES_TIMEOUT_MS = 10_000;
/** C2 desktop spend read-model: small DB-only response, keep Activity snappy. */
export const HUB_OFAPI_CREDITS_TIMEOUT_MS = 5_000;
/** C6b command outbox calls are DB-only while execution is default-off. */
export const HUB_OFAPI_COMMAND_TIMEOUT_MS = 10_000;

/**
 * Core's zod cap on PUT profile body (string length, matching core's check).
 * Legacy gated upstream on 50,000 UTF-8 bytes (AGENCY_HUB_PROFILE_MAX_BYTES);
 * that byte gate stays in the summary-sync caller.
 */
export const HUB_PROFILE_MAX_CHARS = 50_000;
/** Legacy AGENCY_HUB_AI_USAGE_BATCH_MAX_EVENTS; also core's zod maxItems. */
export const HUB_USAGE_BATCH_MAX_EVENTS = 100;

// ─── Structural fetch surface (platform-pure seams) ──────────────────────

export interface HubAbortSignalLike {
  readonly aborted: boolean;
  addEventListener?(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener?(type: 'abort', listener: () => void): void;
}

export interface HubReadableStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
  cancel(): Promise<unknown>;
  releaseLock?(): void;
}

export interface HubReadableStreamLike {
  getReader(): HubReadableStreamReader;
}

export interface HubResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  body?: HubReadableStreamLike | null;
  text(): Promise<string>;
}

export interface HubRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: HubAbortSignalLike;
}

export type HubFetch = (url: string, init: HubRequestInit) => Promise<HubResponseLike>;

interface FetchGlobals {
  fetch?: HubFetch;
  AbortSignal?: { timeout(ms: number): HubAbortSignalLike };
}

const fetchGlobals = globalThis as unknown as FetchGlobals;

function defaultFetch(url: string, init: HubRequestInit): Promise<HubResponseLike> {
  const fetchFn = fetchGlobals.fetch;
  if (!fetchFn) {
    throw new Error('global fetch is unavailable; pass fetchImpl to createHubClient');
  }
  return fetchFn(url, init);
}

function defaultTimeoutSignal(ms: number): HubAbortSignalLike | undefined {
  return fetchGlobals.AbortSignal?.timeout(ms);
}

// ─── Errors ───────────────────────────────────────────────────────────────

/**
 * Why a hub call failed. 'bad-request' covers both server HTTP 400 and
 * client-side contract validation (a request core would deterministically
 * 400) — the usage reporter quarantines on it and must never blind-retry
 * (SPEC §8.6). Everything except 'auth' maps to CG-HUB-02.
 */
export type HubFailureReason = 'auth' | 'bad-request' | 'http' | 'timeout' | 'network' | 'invalid-response';

export class HubError extends CgError {
  readonly reason: HubFailureReason;

  constructor(reason: HubFailureReason, options: { message?: string; detail?: CgErrorDetail } = {}) {
    super(reason === 'auth' ? 'CG-HUB-01' : 'CG-HUB-02', options);
    this.name = 'HubError';
    this.reason = reason;
  }
}

function classifyFetchFailure(error: unknown): 'timeout' | 'network' {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    // AbortSignal.timeout rejects with DOMException 'TimeoutError'; some
    // runtimes surface plain 'AbortError' for an aborted signal.
    if (name === 'TimeoutError' || name === 'AbortError') {
      return 'timeout';
    }
  }
  return 'network';
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Response schemas (zod at the trust boundary; SPEC §15) ───────────────

const hubPageSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  platform: z.enum(['fansly', 'onlyfans']),
  modelSlug: z.string(),
  modelName: z.string(),
  // Present per OpenAPI but nullable, and the live 2026-06-11 check did not
  // confirm them — treat as optional so page-list parsing never breaks mapping.
  username: z.string().nullish(),
  displayName: z.string().nullish(),
});

const hubPagesResponseSchema = z.array(hubPageSchema);

export type HubPage = z.infer<typeof hubPageSchema>;

const hubProfileVersionSchema = z.object({
  version: z.number().int().positive(),
  body: z.string(),
  // Core stamps 'chatmuse' today; do not over-constrain a label we only display.
  source: z.string(),
  createdAt: z.string(),
  createdByUserId: z.number().int().nullish(),
});

export type HubProfileVersion = z.infer<typeof hubProfileVersionSchema>;

const hubFanProfileResponseSchema = z.object({
  fan: z.object({
    platform: z.enum(['fansly', 'onlyfans']),
    platformUserId: z.string(),
    username: z.string().nullish(),
    displayName: z.string().nullish(),
    createdAtExternal: z.string().nullish(),
    pageAlias: z.string().nullish(),
  }),
  profile: hubProfileVersionSchema.nullable(),
});

export type HubFanProfile = z.infer<typeof hubFanProfileResponseSchema>;

const hubUsageBatchResponseSchema = z.object({
  receivedCount: z.number().int().nonnegative(),
  insertedCount: z.number().int().nonnegative(),
  // Added by the 2026-06-11 core patch (per-event invalid skip); default for older cores.
  invalidCount: z.number().int().nonnegative().default(0),
  dedupedCount: z.number().int().nonnegative(),
});

export type HubUsageBatchResult = z.infer<typeof hubUsageBatchResponseSchema>;

const hubOfapiCreditsWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
  restCredits: z.number().int().nonnegative(),
  webhook: z.object({
    eventCount: z.number().int().nonnegative(),
    estimatedCredits: z.number().int().nonnegative(),
  }),
  totalEstimatedCredits: z.number().int().nonnegative(),
});

const hubOfapiCreditsSummarySchema = z.object({
  enabled: z.boolean(),
  scope: z.object({
    pageIds: z.array(z.number().int().positive()),
    pageCount: z.number().int().nonnegative(),
  }),
  today: z.object({ day: z.string() }).merge(hubOfapiCreditsWindowSchema),
  last7d: hubOfapiCreditsWindowSchema,
  limitations: z.array(z.string()),
});

export type HubOfapiCreditsSummary = z.infer<typeof hubOfapiCreditsSummarySchema>;

// ─── OFAPI command outbox (core C6b; default-off desktop transport) ──────

export const HUB_OFAPI_COMMAND_STATES = [
  'queued',
  'in_flight',
  'confirmed',
  'failed_retryable',
  'failed_terminal',
  'indeterminate',
  'cancelled',
] as const;

const hubOfapiCommandStateSchema = z.enum(HUB_OFAPI_COMMAND_STATES);

const hubOfapiCommandCreateRequestSchema = z.strictObject({
  clientCommandId: z.string().uuid(),
  kind: z.literal('send_text_message_v1'),
  accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
  conversationId: z.string().regex(/^[0-9]{1,30}$/),
  payload: z.strictObject({
    text: z.string().min(1).max(10_000).refine((text) => text.trim().length > 0, {
      message: 'Message text must not be blank',
    }),
  }),
  retryOfCommandId: z.string().uuid().nullable().optional(),
});

const hubOfapiCommandResponseSchema = z.strictObject({
  commandId: z.string().uuid(),
  clientCommandId: z.string().uuid(),
  kind: z.literal('send_text_message_v1'),
  accountId: z.string(),
  conversationId: z.string(),
  state: hubOfapiCommandStateSchema,
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  retryOfCommandId: z.string().uuid().nullable(),
  attemptCount: z.number().int().min(0),
  lastErrorCode: z.string().nullable(),
  lastErrorClass: z.string().nullable(),
  verifierResult: z.record(z.string(), z.unknown()).nullable(),
  platformMessageId: z.string().nullable(),
  attemptStartedAt: z.string().nullable(),
  attemptFinishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deduplicated: z.boolean(),
});

export type HubOfapiCommandCreateRequest = z.infer<typeof hubOfapiCommandCreateRequestSchema>;
export type HubOfapiCommand = z.infer<typeof hubOfapiCommandResponseSchema>;

// ─── Usage event (outbound; mirrors core's closed contract) ───────────────

/** Core's closed aiUsageFeatures enum — extending it requires a core change first (SPEC §8.6). */
export const HUB_USAGE_FEATURES = [
  'fast-reply',
  'improve-draft',
  'help-me',
  'fan-summary',
  'chat-review',
  'scan',
  'ping',
  'hi-greeting',
] as const;

export type HubUsageFeature = (typeof HUB_USAGE_FEATURES)[number];

const usageTokenCount = z.number().int().min(0).max(100_000_000);

/**
 * Wire shape of one usage event. Validated before sending so a request core
 * would 400 never leaves the client (one malformed REQUEST still fails the
 * whole batch at core's zod layer even after the per-event-skip patch).
 * isCacheHit/isRegeneration are required by core's OpenAPI snapshot; the
 * reporter defaults them to false.
 */
export const hubUsageEventSchema = z.object({
  clientEventId: z.string().min(1).max(255),
  feature: z.enum(HUB_USAGE_FEATURES),
  model: z.string().min(1).max(100),
  inputTokens: usageTokenCount,
  outputTokens: usageTokenCount,
  cacheWriteTokens: usageTokenCount,
  cacheReadTokens: usageTokenCount,
  conversationId: z.string().min(1).max(255).nullish(),
  durationMs: z.number().int().nonnegative().nullish(),
  isCacheHit: z.boolean(),
  isRegeneration: z.boolean(),
  // Core rejects completedAt >5 min in the future; the reporter clamps to
  // server time, which requires a parseable instant.
  completedAt: z
    .string()
    .min(1)
    .refine((value) => Number.isFinite(Date.parse(value)), 'completedAt must be a parseable ISO timestamp'),
});

export type HubUsageEvent = z.infer<typeof hubUsageEventSchema>;

const hubUsageBatchRequestSchema = z.object({
  events: z.array(hubUsageEventSchema).min(1).max(HUB_USAGE_BATCH_MAX_EVENTS),
});

// ─── AI gateway stream (core C6c/R4; outbound + inbound contract) ─────────

const hubAiGatewayPromptBlockSchema = z.object({
  text: z.string().min(1).max(100_000),
  cache: z.enum(['1h', '5m', 'none']),
});

const hubAiGatewayStreamRequestSchema = z.object({
  clientRequestId: z.uuid(),
  feature: z.enum(HUB_USAGE_FEATURES),
  pageLabel: z.string().min(1).max(120),
  platform: z.enum(['onlyfans', 'fansly']),
  platformUserId: z.string().min(1).max(255),
  conversationId: z.string().min(1).max(255).nullable().optional(),
  model: z.string().min(1).max(100),
  reasoningEffort: z.enum(['off', 'low', 'medium', 'high', 'max']),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(100_000).optional(),
  isRegeneration: z.boolean(),
  prompt: z.object({
    systemBlocks: z.array(hubAiGatewayPromptBlockSchema).min(1).max(64),
    userBlocks: z.array(hubAiGatewayPromptBlockSchema).min(1).max(64),
  }),
});

export type HubAiGatewayStreamRequest = z.infer<typeof hubAiGatewayStreamRequestSchema>;

const hubAiGatewayUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
  costApproximate: z.boolean(),
});

const hubAiGatewayQuotaSchema = z.object({
  accepted: z.boolean(),
  remainingRequestsToday: z.number().int().nonnegative().nullable(),
  remainingMicroUsdToday: z.number().int().nonnegative().nullable(),
});

const hubAiGatewayStreamFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('meta'),
    requestId: z.uuid(),
    clientRequestId: z.uuid(),
    feature: z.enum(HUB_USAGE_FEATURES),
    pageLabel: z.string(),
    model: z.string(),
    provider: z.enum(['anthropic', 'openrouter']),
    providerResponseId: z.string().nullable(),
    quota: hubAiGatewayQuotaSchema,
  }),
  z.object({ type: z.literal('content_delta'), text: z.string() }),
  z.object({ type: z.literal('reasoning_delta'), text: z.string() }),
  z.object({
    type: z.literal('usage'),
    usage: hubAiGatewayUsageSchema,
    providerResponseId: z.string().nullable(),
    cacheHit: z.boolean(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
    retryAfterMs: z.number().int().nonnegative().nullable(),
  }),
  z.object({ type: z.literal('done'), stopReason: z.string().nullable() }),
]);

type HubAiGatewayStreamFrame = z.infer<typeof hubAiGatewayStreamFrameSchema>;

export interface HubAiGatewayStreamCallbacks {
  onText: (text: string) => void;
  onUsage?: (usage: LlmUsageMetrics) => void;
  onProgress?: () => void;
  onReasoningDelta?: (text: string) => void;
  onStopReason?: (stopReason: string | null) => void;
}

function mapGatewayUsage(usage: z.infer<typeof hubAiGatewayUsageSchema>): LlmUsageMetrics {
  return {
    input_tokens: usage.inputTokens,
    cache_creation_input_tokens: usage.cacheWriteTokens,
    cache_read_input_tokens: usage.cacheReadTokens,
    output_tokens: usage.outputTokens,
  };
}

function frameParseError(message: string, detail?: CgErrorDetail): HubError {
  return new HubError('invalid-response', {
    message,
    ...(detail !== undefined ? { detail } : {}),
  });
}

// ─── Client ───────────────────────────────────────────────────────────────

export interface HubClientOptions {
  baseUrl: string;
  /** Chatter API key (`agency_hub_core_…`); sent as a Bearer token. */
  apiKey: string;
  fetchImpl?: HubFetch;
  /** Epoch ms clock; seam for the server-time offset computation. */
  now?: () => number;
  /** Seam over AbortSignal.timeout so tests can assert exact per-call budgets. */
  timeoutSignal?: (ms: number) => HubAbortSignalLike | undefined;
}

export interface HubClient {
  listPages(options?: { timeoutMs?: number }): Promise<HubPage[]>;
  /** Returns null when core 404s (unknown page label or fan core has never seen — SPEC §9.1 caveat). */
  getFanProfile(args: { pageLabel: string; fanId: string; timeoutMs?: number }): Promise<HubFanProfile | null>;
  /** Appends a profile version (core auto-creates unknown onlyfans fans since the 2026-06-11 patch). */
  putFanProfile(args: {
    pageLabel: string;
    fanId: string;
    body: string;
    timeoutMs?: number;
  }): Promise<HubProfileVersion>;
  postUsageBatch(args: { events: HubUsageEvent[]; timeoutMs?: number }): Promise<HubUsageBatchResult>;
  getOfapiCreditsSummary(options?: { timeoutMs?: number }): Promise<HubOfapiCreditsSummary>;
  createOfapiCommand(args: {
    command: HubOfapiCommandCreateRequest;
    timeoutMs?: number;
  }): Promise<HubOfapiCommand>;
  getOfapiCommand(args: { commandId: string; timeoutMs?: number }): Promise<HubOfapiCommand>;
  cancelOfapiCommand(args: { commandId: string; timeoutMs?: number }): Promise<HubOfapiCommand>;
  streamAiGateway(
    args: { request: HubAiGatewayStreamRequest; signal?: HubAbortSignalLike },
    callbacks: HubAiGatewayStreamCallbacks,
  ): Promise<string>;
  /**
   * Last observed server-minus-local clock offset in ms, derived from the
   * Date header of any core response (SPEC §8.6 clock-skew guard; also feeds
   * the 24 h unsend countdown). Null before the first response that carried
   * a parseable Date header.
   */
  getServerTimeOffsetMs(): number | null;
}

export function createHubClient(options: HubClientOptions): HubClient {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = options.apiKey.trim();
  if (!baseUrl || !apiKey) {
    throw new Error('createHubClient requires a non-empty baseUrl and apiKey');
  }

  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const now = options.now ?? (() => Date.now());
  const timeoutSignal = options.timeoutSignal ?? defaultTimeoutSignal;

  let serverTimeOffsetMs: number | null = null;

  function recordServerTime(response: HubResponseLike): void {
    const dateHeader = response.headers.get('date');
    if (dateHeader === null) {
      return;
    }
    const serverMs = Date.parse(dateHeader);
    if (Number.isFinite(serverMs)) {
      serverTimeOffsetMs = serverMs - now();
    }
  }

  async function request(args: {
    method: string;
    path: string;
    timeoutMs: number;
    body?: unknown;
    /** 404 is a domain result (fan/profile unknown), not an error, for this call. */
    allow404?: boolean;
  }): Promise<{ status: number; text: string }> {
    const init: HubRequestInit = {
      method: args.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        ...(args.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(args.body !== undefined ? { body: JSON.stringify(args.body) } : {}),
    };
    const signal = timeoutSignal(args.timeoutMs);
    if (signal !== undefined) {
      init.signal = signal;
    }

    let response: HubResponseLike;
    try {
      response = await fetchImpl(`${baseUrl}${args.path}`, init);
    } catch (error) {
      throw new HubError(classifyFetchFailure(error), {
        message: errorMessageOf(error),
        detail: { providerMessage: errorMessageOf(error) },
      });
    }

    // Server time is server time — capture it from error responses too.
    recordServerTime(response);

    let text = '';
    try {
      text = await response.text();
    } catch {
      // Body read failures fall through to status routing with an empty snippet.
    }

    if (response.status === 401 || response.status === 403) {
      throw new HubError('auth', { detail: buildHttpDetail(response.status, text) });
    }
    if (response.status === 400) {
      throw new HubError('bad-request', { detail: buildHttpDetail(response.status, text) });
    }
    if (response.status < 200 || response.status >= 300) {
      if (!(response.status === 404 && args.allow404 === true)) {
        throw new HubError('http', { detail: buildHttpDetail(response.status, text) });
      }
    }
    return { status: response.status, text };
  }

  function buildHttpDetail(status: number, text: string): CgErrorDetail {
    return { status, ...(text ? { responseSnippet: text.slice(0, 400) } : {}) };
  }

  function parseBody<T>(schema: z.ZodType<T>, raw: { status: number; text: string }): T {
    let json: unknown;
    try {
      json = JSON.parse(raw.text);
    } catch {
      throw new HubError('invalid-response', {
        message: 'hub response was not JSON',
        detail: buildHttpDetail(raw.status, raw.text),
      });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new HubError('invalid-response', {
        message: 'hub response failed schema validation',
        detail: { status: raw.status, providerMessage: parsed.error.message.slice(0, 400) },
      });
    }
    return parsed.data;
  }

  async function readTextSafely(response: HubResponseLike): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  function dispatchAiGatewayFrame(
    frame: HubAiGatewayStreamFrame,
    callbacks: HubAiGatewayStreamCallbacks,
    state: { rawText: string; doneSeen: boolean },
  ): void {
    callbacks.onProgress?.();
    switch (frame.type) {
      case 'meta':
        return;
      case 'content_delta':
        state.rawText += frame.text;
        callbacks.onText(frame.text);
        return;
      case 'reasoning_delta':
        callbacks.onReasoningDelta?.(frame.text);
        return;
      case 'usage':
        callbacks.onUsage?.(mapGatewayUsage(frame.usage));
        return;
      case 'error':
        throw new HubError('http', {
          message: frame.message,
          detail: {
            providerMessage: frame.code,
            ...(frame.retryAfterMs !== null ? { retryAfterMs: frame.retryAfterMs } : {}),
          },
        });
      case 'done':
        state.doneSeen = true;
        callbacks.onStopReason?.(frame.stopReason);
        return;
    }
  }

  function drainAiGatewayBlocks(
    raw: string,
    callbacks: HubAiGatewayStreamCallbacks,
    state: { rawText: string; doneSeen: boolean },
  ): string {
    const blocks = raw.split(/\r?\n\r?\n/);
    const remainder = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parseSseEventBlock(block);
      if (event === null || event.data === '[DONE]') {
        continue;
      }
      if (event.event !== 'ai') {
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        throw frameParseError('hub AI stream frame was not JSON');
      }
      const frame = hubAiGatewayStreamFrameSchema.safeParse(json);
      if (!frame.success) {
        throw frameParseError('hub AI stream frame failed schema validation', {
          providerMessage: frame.error.message.slice(0, 400),
        });
      }
      dispatchAiGatewayFrame(frame.data, callbacks, state);
    }
    return remainder;
  }

  function profilePath(pageLabel: string, fanId: string): string {
    return `/api/v1/pages/${encodeURIComponent(pageLabel)}/fans/${encodeURIComponent(fanId)}/profile`;
  }

  return {
    async listPages(listOptions) {
      const raw = await request({
        method: 'GET',
        path: '/api/v1/pages',
        timeoutMs: listOptions?.timeoutMs ?? HUB_LIST_PAGES_TIMEOUT_MS,
      });
      return parseBody(hubPagesResponseSchema, raw);
    },

    async getFanProfile({ pageLabel, fanId, timeoutMs }) {
      const raw = await request({
        method: 'GET',
        path: profilePath(pageLabel, fanId),
        timeoutMs: timeoutMs ?? HUB_PROFILE_GET_TIMEOUT_MS,
        allow404: true,
      });
      if (raw.status === 404) {
        return null;
      }
      return parseBody(hubFanProfileResponseSchema, raw);
    },

    async putFanProfile({ pageLabel, fanId, body, timeoutMs }) {
      if (body.length === 0 || body.length > HUB_PROFILE_MAX_CHARS) {
        // Core's zod would 400 this deterministically; fail before the wire.
        throw new HubError('bad-request', {
          message: `profile body must be 1..${HUB_PROFILE_MAX_CHARS} characters (got ${body.length})`,
        });
      }
      // No allow404: an unknown page label is an error here (fan auto-create
      // only covers fans — SPEC §9.1), so 404 maps to HubError 'http'.
      const raw = await request({
        method: 'PUT',
        path: profilePath(pageLabel, fanId),
        timeoutMs: timeoutMs ?? HUB_PROFILE_PUT_TIMEOUT_MS,
        body: { body },
      });
      return parseBody(hubProfileVersionSchema, raw);
    },

    async postUsageBatch({ events, timeoutMs }) {
      const requestBody = hubUsageBatchRequestSchema.safeParse({ events });
      if (!requestBody.success) {
        throw new HubError('bad-request', {
          message: 'usage batch failed contract validation',
          detail: { providerMessage: requestBody.error.message.slice(0, 400) },
        });
      }
      const raw = await request({
        method: 'POST',
        path: '/api/v1/ai-usage/batch',
        timeoutMs: timeoutMs ?? HUB_USAGE_BATCH_TIMEOUT_MS,
        body: requestBody.data,
      });
      return parseBody(hubUsageBatchResponseSchema, raw);
    },

    async getOfapiCreditsSummary(summaryOptions) {
      const raw = await request({
        method: 'GET',
        path: '/api/v1/ofapi/credits/summary',
        timeoutMs: summaryOptions?.timeoutMs ?? HUB_OFAPI_CREDITS_TIMEOUT_MS,
      });
      return parseBody(hubOfapiCreditsSummarySchema, raw);
    },

    async createOfapiCommand({ command, timeoutMs }) {
      const requestBody = hubOfapiCommandCreateRequestSchema.safeParse(command);
      if (!requestBody.success) {
        throw new HubError('bad-request', {
          message: 'OFAPI command request failed contract validation',
          detail: { providerMessage: requestBody.error.message.slice(0, 400) },
        });
      }
      const raw = await request({
        method: 'POST',
        path: '/api/v1/ofapi/commands',
        timeoutMs: timeoutMs ?? HUB_OFAPI_COMMAND_TIMEOUT_MS,
        body: requestBody.data,
      });
      return parseBody(hubOfapiCommandResponseSchema, raw);
    },

    async getOfapiCommand({ commandId, timeoutMs }) {
      const commandIdResult = z.string().uuid().safeParse(commandId);
      if (!commandIdResult.success) {
        throw new HubError('bad-request', {
          message: 'OFAPI command id failed contract validation',
          detail: { providerMessage: commandIdResult.error.message.slice(0, 400) },
        });
      }
      const raw = await request({
        method: 'GET',
        path: `/api/v1/ofapi/commands/${encodeURIComponent(commandIdResult.data)}`,
        timeoutMs: timeoutMs ?? HUB_OFAPI_COMMAND_TIMEOUT_MS,
      });
      return parseBody(hubOfapiCommandResponseSchema, raw);
    },

    async cancelOfapiCommand({ commandId, timeoutMs }) {
      const commandIdResult = z.string().uuid().safeParse(commandId);
      if (!commandIdResult.success) {
        throw new HubError('bad-request', {
          message: 'OFAPI command id failed contract validation',
          detail: { providerMessage: commandIdResult.error.message.slice(0, 400) },
        });
      }
      const raw = await request({
        method: 'POST',
        path: `/api/v1/ofapi/commands/${encodeURIComponent(commandIdResult.data)}/cancel`,
        timeoutMs: timeoutMs ?? HUB_OFAPI_COMMAND_TIMEOUT_MS,
      });
      return parseBody(hubOfapiCommandResponseSchema, raw);
    },

    async streamAiGateway({ request: streamRequest, signal }, callbacks) {
      const requestBody = hubAiGatewayStreamRequestSchema.safeParse(streamRequest);
      if (!requestBody.success) {
        throw new HubError('bad-request', {
          message: 'AI gateway stream request failed contract validation',
          detail: { providerMessage: requestBody.error.message.slice(0, 400) },
        });
      }

      const init: HubRequestInit = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody.data),
        ...(signal !== undefined ? { signal } : {}),
      };

      let response: HubResponseLike;
      try {
        response = await fetchImpl(`${baseUrl}/api/v1/ai/gateway/stream`, init);
      } catch (error) {
        throw new HubError(classifyFetchFailure(error), {
          message: errorMessageOf(error),
          detail: { providerMessage: errorMessageOf(error) },
        });
      }

      recordServerTime(response);

      if (response.status === 401 || response.status === 403) {
        throw new HubError('auth', {
          detail: buildHttpDetail(response.status, await readTextSafely(response)),
        });
      }
      if (response.status === 400) {
        throw new HubError('bad-request', {
          detail: buildHttpDetail(response.status, await readTextSafely(response)),
        });
      }
      if (response.status < 200 || response.status >= 300) {
        throw new HubError('http', {
          detail: buildHttpDetail(response.status, await readTextSafely(response)),
        });
      }

      const body = response.body;
      if (body === null || body === undefined) {
        throw frameParseError('hub AI stream response had no body');
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      const state = { rawText: '', doneSeen: false };
      let buffer = '';
      const onAbort = (): void => {
        void reader.cancel().catch(() => {});
      };
      signal?.addEventListener?.('abort', onAbort, { once: true });

      try {
        while (true) {
          if (signal?.aborted) {
            throw new Error('Operation aborted');
          }
          const { done, value } = await reader.read();
          if (signal?.aborted) {
            throw new Error('Operation aborted');
          }
          if (done) {
            break;
          }
          if (value !== undefined) {
            buffer = drainAiGatewayBlocks(
              buffer + decoder.decode(value, { stream: true }),
              callbacks,
              state,
            );
          }
        }
      } finally {
        signal?.removeEventListener?.('abort', onAbort);
        reader.releaseLock?.();
      }

      if (!state.doneSeen) {
        throw frameParseError('hub AI stream ended without a done frame');
      }
      return state.rawText;
    },

    getServerTimeOffsetMs() {
      return serverTimeOffsetMs;
    },
  };
}
