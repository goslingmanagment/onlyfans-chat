// Agency Hub ("core") REST client — SPEC §8.5/§8.6/§9.1. Since kernel
// Stage 24 the operations are thin delegations to the pinned @kernel/sdk
// (vendored, contract-hash pinned): the SDK's typed operations + runtime
// validation replace the hand-mirrored schemas this file used to carry, so
// contract drift now fails loudly instead of silently tolerating shape decay.
// The public `HubClient` interface, `HubError` taxonomy, per-call timeout
// budgets, and the structural fetch seam are unchanged — callers (send
// engine, usage reporter, hub module) do not change. Platform-pure: fetch +
// AbortSignal only, typed structurally (lib "ES2023" has no DOM types).
// Instantiated in the Electron main process only (SPEC §15).

import { z } from 'zod';
import {
  KernelApiError,
  createClient,
  routeSchemas,
  streamAiFeature as sdkStreamAiFeature,
  streamAiGateway as sdkStreamAiGateway,
  type AiGatewayStreamFrame,
  type KernelClient,
  type KernelClientOptions,
  type KernelOperationResponse,
} from '@kernel/sdk';
import type { CgErrorCode, CgErrorDetail } from '../errors/index';
import { domainEventFactsPageSchema, type DomainEventFactsPage } from '../protocol/index';
import { CgError, isHubAuthReason } from '../errors/index';
import type { LlmUsageMetrics } from '../usage-metrics';

// Minimal ambient type for the WHATWG AbortController global (lib "ES2023"
// has no DOM types; Electron main / Node 22 provide the real one).
declare class AbortController {
  readonly signal: HubAbortSignalLike & { aborted: boolean };
  abort(): void;
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
/** D39: one money-facts page is a DB-only ledger read (H3: page 8 from seq 0
 * cold ≈ 0.6 s); the H2 gateway budget is plenty. */
export const HUB_MONEY_FACTS_TIMEOUT_MS = 20_000;
/** D42: a media resolve may queue for Core's media transport and make up to
 * three OFAPI/CDN hops server-side (Core's worst case ≈ 35 s); a timeout is
 * retried once with the same requestId, which Core joins or replays. */
export const HUB_MEDIA_RESOLVE_TIMEOUT_MS = 45_000;
/** D42: transfer reports are a DB-only write. */
export const HUB_MEDIA_REPORTS_TIMEOUT_MS = 10_000;

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
 * (SPEC §8.6). 'quota' is the kernel AI gateway's daily-cap denial (429 with
 * code "quota_denied") — it resets at midnight UTC, so retrying sooner is
 * pointless. Provider failures are classified separately from the chatter's
 * own Hub auth and from Hub transport failures. A stream that closes without
 * `done` is fail-closed and gets its own interrupted-generation card.
 */
export type HubFailureReason =
  | 'auth'
  | 'bad-request'
  | 'quota'
  | 'http'
  | 'timeout'
  | 'network'
  | 'invalid-response'
  | 'stream-truncated';

const PROVIDER_KERNEL_CODES: Readonly<Record<string, CgErrorCode>> = {
  provider_billing: 'CG-HUB-04',
  provider_auth: 'CG-HUB-05',
  provider_rate_limited: 'CG-HUB-06',
  provider_unavailable: 'CG-HUB-07',
  provider_proxy_unreachable: 'CG-HUB-08',
};

function providerCodeFor(kernelCode: string | undefined): CgErrorCode | null {
  if (kernelCode === undefined) return null;
  const exact = PROVIDER_KERNEL_CODES[kernelCode];
  if (exact !== undefined) return exact;
  // provider_stream_failed and future provider* codes deliberately degrade to
  // one manager-action card. Never infer a narrower cause from frame prose.
  return kernelCode.startsWith('provider') ? 'CG-HUB-10' : null;
}

function hubCodeFor(reason: HubFailureReason, detail: CgErrorDetail | undefined): CgErrorCode {
  const providerCode = providerCodeFor(detail?.kernelCode);
  if (providerCode !== null) return providerCode;
  if (reason === 'auth') return 'CG-HUB-01';
  if (reason === 'quota') return 'CG-HUB-03';
  if (reason === 'stream-truncated') return 'CG-HUB-09';
  return 'CG-HUB-02';
}

export class HubError extends CgError {
  readonly reason: HubFailureReason;

  constructor(reason: HubFailureReason, options: { message?: string; detail?: CgErrorDetail } = {}) {
    super(hubCodeFor(reason, options.detail), options);
    this.name = 'HubError';
    this.reason = reason;
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** KernelApiError → the desktop taxonomy. The send engine's indeterminate-
 * outcome discipline rides this mapping: timeouts and 5xx land in the same
 * classes as before ('timeout'/'http'), never a retryable-looking success. */
function toHubError(error: unknown): HubError {
  if (error instanceof HubError) {
    return error;
  }
  if (error instanceof KernelApiError) {
    const detail = kernelErrorDetail(error);
    // A6/A17 (W4.4): every arm keeps `message` — dropping it flattened a
    // deterministic kernel explanation ("Unknown persona: …") into the
    // generic registry text with no way back.
    switch (error.category) {
      case 'auth':
        return new HubError('auth', { message: error.message, detail });
      case 'validation':
        return new HubError('bad-request', { message: error.message, detail });
      case 'network':
        return new HubError(error.code === 'timeout' || error.code === 'aborted' ? 'timeout' : 'network', {
          message: error.message,
          detail: { providerMessage: error.message },
        });
      case 'rate_limit':
        // The AI gateway's daily-cap denial ships code "quota_denied" (its
        // gateway_outcome ledger value); generic 429s stay plain HTTP.
        return error.code === 'quota_denied'
          ? new HubError('quota', { message: error.message, detail })
          : new HubError('http', { message: error.message, detail });
      case 'contract':
        return new HubError('invalid-response', {
          message: error.message,
          detail: { providerMessage: error.message.slice(0, 400), ...(error.status !== null ? { status: error.status } : {}) },
        });
      default:
        // not_found / conflict / server — plain HTTP failures.
        return new HubError('http', { message: error.message, detail });
    }
  }
  return new HubError('network', {
    message: errorMessageOf(error),
    detail: { providerMessage: errorMessageOf(error) },
  });
}

function kernelErrorDetail(error: KernelApiError): CgErrorDetail {
  const snippet = typeof error.body === 'string'
    ? error.body
    : error.body !== null && error.body !== undefined
      ? JSON.stringify(error.body)
      : '';
  // D35 / core plan §4.5: a 401 for a device credential the kernel FOUND
  // carries a machine reason. It is the only thing that may cost a client its
  // stored sign-in, so it is lifted out of the body into typed detail here;
  // an unknown or absent reason stays absent and the client fails closed.
  const body: unknown = error.body;
  const reason = typeof body === 'object' && body !== null
    ? (body as { reason?: unknown }).reason
    : undefined;
  return {
    ...(error.status !== null ? { status: error.status } : {}),
    ...(error.code !== null ? { kernelCode: error.code } : {}),
    ...(isHubAuthReason(reason) ? { authReason: reason } : {}),
    ...(snippet ? { responseSnippet: snippet.slice(0, 400) } : {}),
  };
}

function badRequestBeforeWire(message: string, issue: string): HubError {
  return new HubError('bad-request', {
    message,
    detail: { providerMessage: issue.slice(0, 400) },
  });
}

function streamFrameError(frame: {
  code: string;
  message: string;
  retryAfterMs: number | null;
}): HubError {
  const retryTiming =
    frame.retryAfterMs !== null
      ? {
          retryAfterMs: frame.retryAfterMs,
          retryAtMs: Date.now() + frame.retryAfterMs,
        }
      : {};
  return new HubError('http', {
    message: frame.message,
    detail: {
      kernelCode: frame.code,
      providerMessage: frame.message,
      ...retryTiming,
    },
  });
}

// ─── Contract-derived types (the SDK registry is the single source) ───────

export type HubPage = KernelOperationResponse<'pages'>[number];
export type HubFanProfile = KernelOperationResponse<'pageFanProfile'>;
export type HubProfileVersion = KernelOperationResponse<'upsertFanProfile'>;
export type HubUsageBatchResult = KernelOperationResponse<'aiUsageBatch'>;
export type HubOfapiCreditsSummary = KernelOperationResponse<'ofapiCreditsChatterSummary'>;
export type HubOfapiCommand = KernelOperationResponse<'getOfapiCommand'>;
export type HubOfapiCommandCreateRequest = z.input<(typeof routeSchemas)['createOfapiCommand']['body']>;
export type HubIngestBatchResult = KernelOperationResponse<'ingestObservations'>;
export type HubAiGatewayStreamRequest = z.input<(typeof routeSchemas)['aiGatewayStream']['body']>;
/** Stage 31: kernel feature-service request — refs, not assembled blocks. */
export type HubAiFeatureStreamRequest = z.input<(typeof routeSchemas)['aiFeatureStream']['body']>;
/** Metadata-only catalog available to bearer-authenticated clients. */
export type HubAiPersonaCatalogEntry = z.infer<
  (typeof routeSchemas)['aiPersonaCatalog']['response'][200]
>['personas'][number];

export const HUB_OFAPI_COMMAND_STATES = [
  'queued',
  'in_flight',
  'confirmed',
  'failed_retryable',
  'failed_terminal',
  'indeterminate',
  'cancelled',
] as const;

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

/** The contract's usage-event element plus the desktop's stricter completedAt
 * gate: core accepts an unparseable completedAt on the wire but silently
 * burns the event as invalidCount — the reporter/mapper reject it pre-wire
 * instead (SPEC §8.6; the clamp logic needs a parseable instant anyway). */
export const hubUsageEventSchema = routeSchemas.aiUsageBatch.body.shape.events.element.refine(
  (event) => Number.isFinite(Date.parse(event.completedAt)),
  { message: 'completedAt must be a parseable ISO timestamp', path: ['completedAt'] },
);
export type HubUsageEvent = z.infer<typeof hubUsageEventSchema>;

const hubUsageBatchRequestSchema = z.object({
  events: z.array(hubUsageEventSchema).min(1).max(HUB_USAGE_BATCH_MAX_EVENTS),
});

export type HubIngestObservationEvent = z.infer<typeof routeSchemas.ingestObservations.body.shape.events.element>;

/** Core #140: the kernel's echo of the prompt it actually assembled. Arrives
 * only when the caller asked for it (capability header) AND the owner's
 * time-bounded window names this chatter — silence is "not now", not an error. */
/**
 * D39: one `GET /api/v1/events/v2/facts` answer. `ahead-of-head` is Core's
 * 409 (the watermark is past the account's head — restart from 0);
 * `forbidden` is its 403 (the page is outside this credential's grants).
 * Facts stay unparsed rows: the caller reads each one tolerantly.
 */
/** D42: request/answer of Core's media resolve (never a client URL in). */
export type HubMediaResolveRequest = z.input<(typeof routeSchemas)['ofapiMediaResolve']['body']>;
export type HubMediaResolveResponse = KernelOperationResponse<'ofapiMediaResolve'>;
export type HubMediaReport = z.input<(typeof routeSchemas)['ofapiMediaReports']['body']>['reports'][number];
export type HubMediaReportsResult = KernelOperationResponse<'ofapiMediaReports'>;
/**
 * `unsupported`: this Core has no media routes (an older deploy, or a
 * rollback) or does not grant the account — the desktop shows the file as
 * unavailable, quietly. Everything else is a typed answer or a HubError.
 */
export type HubMediaResolveResult =
  | { kind: 'resolved'; response: HubMediaResolveResponse }
  | { kind: 'unsupported' }
  /** Core rate-limited this device (429): wait `retryAfterMs` (null = unknown). */
  | { kind: 'throttled'; retryAfterMs: number | null };

/** `Retry-After` in seconds or as an HTTP date → milliseconds (null if absent/garbled). */
export function parseRetryAfterMs(value: string | null, nowMs: number = Date.now()): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d{1,7}$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
}

export type HubMoneyFactsResult =
  | { kind: 'page'; page: DomainEventFactsPage }
  | { kind: 'ahead-of-head'; message: string }
  | { kind: 'forbidden' };

export interface HubAiDebugInput {
  systemBlocks: Array<{ text: string; cache: string }>;
  userBlocks: Array<{ text: string; cache: string }>;
  contextManifest: Record<string, unknown> | null;
}

export interface HubAiGatewayStreamCallbacks {
  onText: (text: string) => void;
  onUsage?: (usage: LlmUsageMetrics) => void;
  onProgress?: () => void;
  onReasoningDelta?: (text: string) => void;
  onStopReason?: (stopReason: string | null) => void;
  /** Stage 31: the gateway meta frame — requestId is the generation ref
   * (the acceptance correlation key kernel-side). quotaRemainingRequests is
   * the page's remaining daily gateway budget (null = kernel didn't say). */
  onMeta?: (meta: {
    requestId: string;
    clientRequestId: string;
    personaDefinitionId: string | undefined;
    quotaRemainingRequests: number | null;
  }) => void;
  onDebugInput?: (input: HubAiDebugInput) => void;
}

type AiGatewayUsageFrame = Extract<AiGatewayStreamFrame, { type: 'usage' }>;

function mapGatewayUsage(usage: AiGatewayUsageFrame['usage']): LlmUsageMetrics {
  return {
    input_tokens: usage.inputTokens,
    cache_creation_input_tokens: usage.cacheWriteTokens,
    cache_read_input_tokens: usage.cacheReadTokens,
    output_tokens: usage.outputTokens,
    // Stage 31: the kernel gateway prices the generation (Stage 29 tables);
    // local price tables are gone, so this is the only spend source.
    cost_micro_usd: usage.costMicroUsd,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────

export interface HubClientOptions {
  baseUrl: string;
  /** Chatter API key (`agency_hub_core_…`); sent as a Bearer token. */
  apiKey: string;
  /**
   * App version sent as `x-client-version` on every hub request (kernel
   * Stage 4 / Proposal 4.1 — core's Stage 11 capture lane reads it as the
   * producer version). Injected by the caller: the shared package stays
   * platform-pure and never reads process/electron versions itself.
   */
  clientVersion?: string;
  fetchImpl?: HubFetch;
  /**
   * D35: every hub call that comes back as an auth rejection is reported here
   * BEFORE it is thrown, so the client owns exactly one self-healing funnel
   * instead of one per caller. Reporting must never change the thrown error.
   *
   * Wired to the SDK's own `onAuthError` hook rather than to a catch block:
   * the hook fires on typed calls, raw calls AND the two AI SSE paths, which
   * are the chatter's main work — a catch in `delegate` would have missed
   * every generation.
   */
  onAuthFailure?: (error: HubError) => void;
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
    /** Original Scan generation time; Core append time is not dossier age. */
    generatedAtMs: number;
    timeoutMs?: number;
  }): Promise<HubProfileVersion>;
  postUsageBatch(args: { events: HubUsageEvent[]; timeoutMs?: number }): Promise<HubUsageBatchResult>;
  /** Stage 11/12 capture lane. Whole-batch atomic server-side; resend the
   *  whole batch until 2xx — clientEventId dedup makes overlap free. */
  postIngestObservations(args: {
    events: HubIngestObservationEvent[];
    timeoutMs?: number;
  }): Promise<HubIngestBatchResult>;
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
  /** Global persona definitions are owner-managed; clients receive metadata only. */
  listAiPersonaCatalog(options?: { timeoutMs?: number }): Promise<HubAiPersonaCatalogEntry[]>;
  /**
   * D39: one page of an account's money facts (PPV unlocks, tips, posted
   * transactions) by account_seq, through the SDK's `eventsV2Facts`
   * operation. A read of existing ledger rows — no OFAPI credits. The body is
   * validated with the desktop's tolerant frame schema, not the SDK's closed
   * provenance enum (hence `raw`).
   */
  listMoneyFacts(args: {
    /** Core page id (numeric), not the OFAPI `acct_…` ref. */
    accountId: number;
    afterSeq: number;
    limit: number;
    timeoutMs?: number;
  }): Promise<HubMoneyFactsResult>;
  /** D42: how to fetch one media file (Core decides; may spend credits on a click). */
  resolveMedia(args: { request: HubMediaResolveRequest; timeoutMs?: number }): Promise<HubMediaResolveResult>;
  /** D42: batched transfer results, idempotent by resolveId. */
  reportMediaFetches(args: { reports: HubMediaReport[]; timeoutMs?: number }): Promise<HubMediaReportsResult | null>;
  /** Stage 31: stream a KERNEL-ASSEMBLED feature generation (Stage 30 route).
   *  Same SSE frames as streamAiGateway; the kernel loads context and builds
   *  the prompt — the desktop sends refs only. */
  streamAiFeature(
    args: {
      feature: string;
      request: HubAiFeatureStreamRequest;
      signal?: HubAbortSignalLike;
      /** Debug mode only (#140): ask the kernel to echo the assembled prompt.
       * Rides a capability header, so an old kernel simply ignores it. */
      debugPromptEcho?: boolean;
    },
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

/** What the SDK actually passes to its fetch option (typed structurally —
 * lib "ES2023" has no RequestInit). */
interface SdkRequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: HubAbortSignalLike;
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
  const clientVersion = options.clientVersion?.trim() ?? '';
  const versionHeader: Record<string, string> =
    clientVersion.length > 0 ? { 'x-client-version': clientVersion } : {};

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

  /** Wrap a HubResponseLike into the surface the SDK consumes (ok/status/
   * headers.get/text/json/body.getReader). Invalid JSON on a 2xx becomes the
   * SDK's contract category → HubError 'invalid-response', as before. */
  function toSdkResponse(like: HubResponseLike): unknown {
    const bodyLike = like.body;
    return {
      ok: like.status >= 200 && like.status < 300,
      status: like.status,
      headers: like.headers,
      // The seam's reader contract makes releaseLock optional; the SDK's
      // parser calls it unconditionally — bridge the gap.
      body: bodyLike
        ? {
          getReader: () => {
            const reader = bodyLike.getReader();
            return {
              read: () => reader.read(),
              cancel: () => reader.cancel(),
              releaseLock: () => reader.releaseLock?.(),
            };
          },
        }
        : null,
      text: () => like.text(),
      json: async () => {
        const text = await like.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new KernelApiError('hub response was not JSON', 'contract', like.status, 'invalid_json', text.slice(0, 400));
        }
      },
    };
  }

  /** Bridge the SDK's standard-fetch expectation onto the HubFetch seam. A
   * fixed per-request timeout budget is baked into each bridge (clients are
   * memoized per budget below), so concurrent calls can never race a shared
   * timeout slot. `null` budget = no timeout (the AI stream owns its abort). */
  function bridgedFetch(timeoutMs: number | null) {
    return async (input: unknown, init?: SdkRequestInitLike): Promise<unknown> => {
      const url = typeof input === 'string' ? input : String(input);
      const headers: Record<string, string> = { accept: 'application/json', ...init?.headers };
      const hubInit: HubRequestInit = {
        method: init?.method ?? 'GET',
        headers,
        ...(init?.body !== undefined ? { body: init.body } : {}),
      };
      const signal = init?.signal ?? (timeoutMs !== null ? timeoutSignal(timeoutMs) : undefined);
      if (signal !== undefined) {
        hubInit.signal = signal;
      }
      const response = await fetchImpl(url, hubInit);
      // Server time is server time — capture it from error responses too.
      recordServerTime(response);
      return toSdkResponse(response);
    };
  }

  function sdkOptions(timeoutMs: number | null): KernelClientOptions {
    return {
      baseUrl,
      auth: { mode: 'bearer', token: () => apiKey },
      headers: versionHeader,
      fetch: bridgedFetch(timeoutMs) as NonNullable<KernelClientOptions['fetch']>,
      ...(options.onAuthFailure !== undefined
        ? {
            onAuthError: (error): void => {
              try {
                options.onAuthFailure?.(toHubError(error));
              } catch {
                // Reporting must never replace the failure being thrown.
              }
            },
          }
        : {}),
    };
  }

  // One typed client per timeout budget (the budget set is tiny and static).
  const clients = new Map<number, KernelClient>();
  function clientFor(timeoutMs: number): KernelClient {
    let client = clients.get(timeoutMs);
    if (client === undefined) {
      client = createClient(sdkOptions(timeoutMs));
      clients.set(timeoutMs, client);
    }
    return client;
  }

  async function delegate<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      // Auth rejections are reported by the SDK's onAuthError hook above, on
      // every path this client has — reporting again here would double-fire
      // for typed calls and still miss the streams.
      throw toHubError(error);
    }
  }

  function requireCommandId(commandId: string): string {
    const result = z.uuid().safeParse(commandId);
    if (!result.success) {
      throw badRequestBeforeWire('OFAPI command id failed contract validation', result.error.message);
    }
    return result.data;
  }

  return {
    async listPages(listOptions) {
      return delegate(() => clientFor(listOptions?.timeoutMs ?? HUB_LIST_PAGES_TIMEOUT_MS).pages());
    },

    async getFanProfile({ pageLabel, fanId, timeoutMs }) {
      try {
        return await clientFor(timeoutMs ?? HUB_PROFILE_GET_TIMEOUT_MS).pageFanProfile({
          params: { pageLabel, platformUserId: fanId },
        });
      } catch (error) {
        // 404 is a domain result (fan/profile unknown), not an error, here.
        if (error instanceof KernelApiError && error.status === 404) {
          return null;
        }
        throw toHubError(error);
      }
    },

    async putFanProfile({ pageLabel, fanId, body, generatedAtMs, timeoutMs }) {
      if (body.length === 0 || body.length > HUB_PROFILE_MAX_CHARS) {
        // Core's zod would 400 this deterministically; fail before the wire.
        throw new HubError('bad-request', {
          message: `profile body must be 1..${HUB_PROFILE_MAX_CHARS} characters (got ${body.length})`,
        });
      }
      // An unknown page label is an error here (fan auto-create only covers
      // fans — SPEC §9.1), so 404 maps to HubError 'http'.
      return delegate(() => clientFor(timeoutMs ?? HUB_PROFILE_PUT_TIMEOUT_MS).upsertFanProfile({
        params: { pageLabel, platformUserId: fanId },
        body: { body, generatedAtMs },
      }));
    },

    async postUsageBatch({ events, timeoutMs }) {
      const requestBody = hubUsageBatchRequestSchema.safeParse({ events });
      if (!requestBody.success) {
        throw badRequestBeforeWire('usage batch failed contract validation', requestBody.error.message);
      }
      return delegate(() => clientFor(timeoutMs ?? HUB_USAGE_BATCH_TIMEOUT_MS).aiUsageBatch({
        body: requestBody.data,
      }));
    },

    async postIngestObservations({ events, timeoutMs }) {
      const requestBody = routeSchemas.ingestObservations.body.safeParse({ events });
      if (!requestBody.success) {
        throw badRequestBeforeWire('ingest batch failed contract validation', requestBody.error.message);
      }
      return delegate(() => clientFor(timeoutMs ?? HUB_USAGE_BATCH_TIMEOUT_MS).ingestObservations({
        body: requestBody.data,
      }));
    },

    async getOfapiCreditsSummary(summaryOptions) {
      return delegate(() => clientFor(summaryOptions?.timeoutMs ?? HUB_OFAPI_CREDITS_TIMEOUT_MS).ofapiCreditsChatterSummary());
    },

    async createOfapiCommand({ command, timeoutMs }) {
      const requestBody = routeSchemas.createOfapiCommand.body.safeParse(command);
      if (!requestBody.success) {
        throw badRequestBeforeWire('OFAPI command request failed contract validation', requestBody.error.message);
      }
      return delegate(() => clientFor(timeoutMs ?? HUB_OFAPI_COMMAND_TIMEOUT_MS).createOfapiCommand({
        body: requestBody.data,
      }));
    },

    async getOfapiCommand({ commandId, timeoutMs }) {
      const validId = requireCommandId(commandId);
      return delegate(() => clientFor(timeoutMs ?? HUB_OFAPI_COMMAND_TIMEOUT_MS).getOfapiCommand({
        params: { commandId: validId },
      }));
    },

    async cancelOfapiCommand({ commandId, timeoutMs }) {
      const validId = requireCommandId(commandId);
      return delegate(() => clientFor(timeoutMs ?? HUB_OFAPI_COMMAND_TIMEOUT_MS).cancelOfapiCommand({
        params: { commandId: validId },
      }));
    },

    async streamAiGateway({ request: streamRequest, signal }, callbacks) {
      const requestBody = routeSchemas.aiGatewayStream.body.safeParse(streamRequest);
      if (!requestBody.success) {
        throw badRequestBeforeWire('AI gateway stream request failed contract validation', requestBody.error.message);
      }

      // Adapt the structural abort seam onto a real AbortSignal for the SDK.
      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      if (signal?.aborted) {
        controller.abort();
      }
      signal?.addEventListener?.('abort', onAbort, { once: true });

      const state = { rawText: '', doneSeen: false };
      const handle = sdkStreamAiGateway(sdkOptions(null), {
        body: requestBody.data,
        signal: controller.signal as never,
        onFrame: (frame) => {
          callbacks.onProgress?.();
          switch (frame.type) {
            case 'meta':
              callbacks.onMeta?.({
                requestId: frame.requestId,
                clientRequestId: frame.clientRequestId,
                personaDefinitionId: frame.personaDefinitionId,
                quotaRemainingRequests: frame.quota.remainingRequestsToday,
              });
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
              // A6/A17 (W4.4): the frame's machine code belongs in kernelCode
              // (structural mapping), not smuggled through providerMessage.
              throw streamFrameError(frame);
            case 'done':
              state.doneSeen = true;
              callbacks.onStopReason?.(frame.stopReason);
              return;
          }
        },
      });

      try {
        await handle.done;
      } catch (error) {
        throw toHubError(error);
      } finally {
        signal?.removeEventListener?.('abort', onAbort);
      }

      // Parity with the pre-SDK client: a caller abort surfaces as a plain
      // Error (never a HubError — nothing failed), checked after the stream
      // settles because the SDK helper resolves quietly on abort.
      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }
      if (!state.doneSeen) {
        throw new HubError('stream-truncated', { message: 'hub AI stream ended without a done frame' });
      }
      return state.rawText;
    },

    async listAiPersonaCatalog(personaOptions) {
      const response = await delegate(() =>
        clientFor(personaOptions?.timeoutMs ?? HUB_LIST_PAGES_TIMEOUT_MS).aiPersonaCatalog());
      return response.personas;
    },

    async listMoneyFacts({ accountId, afterSeq, limit, timeoutMs }) {
      const response = await delegate(() =>
        clientFor(timeoutMs ?? HUB_MONEY_FACTS_TIMEOUT_MS).raw('eventsV2Facts', {
          query: { accountId, afterSeq, limit },
        }));
      if (response.status === 409) {
        return { kind: 'ahead-of-head', message: (await response.text().catch(() => '')).slice(0, 400) };
      }
      if (response.status === 403) {
        return { kind: 'forbidden' };
      }
      if (response.status === 401) {
        throw new HubError('auth', { message: 'money facts: hub rejected the credential', detail: { status: 401 } });
      }
      if (response.status !== 200) {
        throw new HubError('http', {
          message: `money facts request failed (${response.status})`,
          detail: { status: response.status },
        });
      }
      const payload: unknown = await delegate(() => response.json() as Promise<unknown>);
      const parsed = domainEventFactsPageSchema.safeParse(payload);
      if (!parsed.success) {
        throw new HubError('invalid-response', {
          message: 'money facts page failed validation',
          detail: { providerMessage: parsed.error.message.slice(0, 400), status: 200 },
        });
      }
      return { kind: 'page', page: parsed.data };
    },

    async resolveMedia({ request: mediaRequest, timeoutMs }) {
      const requestBody = routeSchemas.ofapiMediaResolve.body.safeParse(mediaRequest);
      if (!requestBody.success) {
        throw badRequestBeforeWire('media resolve request failed contract validation', requestBody.error.message);
      }
      const response = await delegate(() =>
        clientFor(timeoutMs ?? HUB_MEDIA_RESOLVE_TIMEOUT_MS).raw('ofapiMediaResolve', { body: requestBody.data }));
      // An older Core (or a rollback) has no route; an ungranted account is 404 too.
      if (response.status === 404 || response.status === 405) {
        return { kind: 'unsupported' };
      }
      if (response.status === 429) {
        return { kind: 'throttled', retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')) };
      }
      if (response.status === 401) {
        throw new HubError('auth', { message: 'media resolve: hub rejected the credential', detail: { status: 401 } });
      }
      if (response.status !== 200) {
        throw new HubError('http', {
          message: `media resolve failed (${response.status})`,
          detail: { status: response.status },
        });
      }
      const payload: unknown = await delegate(() => response.json() as Promise<unknown>);
      const parsed = routeSchemas.ofapiMediaResolve.response[200].safeParse(payload);
      if (!parsed.success) {
        throw new HubError('invalid-response', {
          message: 'media resolve answer failed validation',
          detail: { providerMessage: parsed.error.message.slice(0, 400), status: 200 },
        });
      }
      return { kind: 'resolved', response: parsed.data };
    },

    async reportMediaFetches({ reports, timeoutMs }) {
      const requestBody = routeSchemas.ofapiMediaReports.body.safeParse({ reports });
      if (!requestBody.success) {
        throw badRequestBeforeWire('media reports failed contract validation', requestBody.error.message);
      }
      const response = await delegate(() =>
        clientFor(timeoutMs ?? HUB_MEDIA_REPORTS_TIMEOUT_MS).raw('ofapiMediaReports', { body: requestBody.data }));
      if (response.status === 404 || response.status === 405) {
        return null; // no media routes: nothing to report to
      }
      if (response.status === 401) {
        throw new HubError('auth', { message: 'media reports: hub rejected the credential', detail: { status: 401 } });
      }
      if (response.status !== 200) {
        throw new HubError('http', { message: `media reports failed (${response.status})`, detail: { status: response.status } });
      }
      const payload: unknown = await delegate(() => response.json() as Promise<unknown>);
      const parsed = routeSchemas.ofapiMediaReports.response[200].safeParse(payload);
      if (!parsed.success) {
        throw new HubError('invalid-response', {
          message: 'media reports answer failed validation',
          detail: { providerMessage: parsed.error.message.slice(0, 400), status: 200 },
        });
      }
      return parsed.data;
    },

    async streamAiFeature({ feature, request: streamRequest, signal, debugPromptEcho }, callbacks) {
      const requestBody = routeSchemas.aiFeatureStream.body.safeParse(streamRequest);
      if (!requestBody.success) {
        throw badRequestBeforeWire('AI feature stream request failed contract validation', requestBody.error.message);
      }

      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      if (signal?.aborted) {
        controller.abort();
      }
      signal?.addEventListener?.('abort', onAbort, { once: true });

      const state = { rawText: '', doneSeen: false };
      const handle = sdkStreamAiFeature(sdkOptions(null), {
        feature,
        body: requestBody.data,
        signal: controller.signal as never,
        ...(debugPromptEcho ? { debugPromptEcho: true } : {}),
        onFrame: (frame) => {
          callbacks.onProgress?.();
          switch (frame.type) {
            case 'debug_input_v1':
              callbacks.onDebugInput?.({
                systemBlocks: frame.systemBlocks,
                userBlocks: frame.userBlocks,
                contextManifest: frame.contextManifest,
              });
              return;
            case 'meta':
              callbacks.onMeta?.({
                requestId: frame.requestId,
                clientRequestId: frame.clientRequestId,
                personaDefinitionId: frame.personaDefinitionId,
                quotaRemainingRequests: frame.quota.remainingRequestsToday,
              });
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
              // A6/A17 (W4.4): the frame's machine code belongs in kernelCode
              // (structural mapping), not smuggled through providerMessage.
              throw streamFrameError(frame);
            case 'done':
              state.doneSeen = true;
              callbacks.onStopReason?.(frame.stopReason);
              return;
          }
        },
      });

      try {
        await handle.done;
      } catch (error) {
        throw toHubError(error);
      } finally {
        signal?.removeEventListener?.('abort', onAbort);
      }

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }
      if (!state.doneSeen) {
        throw new HubError('stream-truncated', { message: 'hub AI feature stream ended without a done frame' });
      }
      return state.rawText;
    },

    getServerTimeOffsetMs() {
      return serverTimeOffsetMs;
    },
  };
}
