// OFAPI HTTP/network failures → CG-OF-* registry (SPEC §5, §11).
// This module owns OFAPI response shapes; shared `errors` covers LLM providers.

import { z } from 'zod';
import { CgError } from '@chatgoose/shared';
import type { CgErrorCode, CgErrorDetail, CgErrorOptions } from '@chatgoose/shared';

// OnlyFans-origin failures arrive wrapped (live 2026-06-11, fixture
// send-message-restricted-400.json): {error:"ONLYFANS_COM_ERROR", message,
// description, onlyfans_response:{status, body:{error:{code,message},
// errors:{text:[…], textHighLight:[…]}}}} — textHighLight is NOT top-level there.
const onlyfansResponseSchema = z.looseObject({
  status: z.number().nullish(),
  body: z
    .looseObject({
      error: z
        .looseObject({
          code: z.union([z.number(), z.string()]).nullish(),
          message: z.string().nullish(),
        })
        .nullish(),
      errors: z
        .looseObject({
          text: z.array(z.string()).nullish(),
          textHighLight: z.union([z.string(), z.array(z.string())]).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

const errorBodySchema = z.looseObject({
  error: z.string().nullish(),
  message: z.string().nullish(),
  description: z.string().nullish(),
  errors: z.record(z.string(), z.array(z.string())).nullish(),
  // Top-level restricted-words shape per docs (kept as fallback). String or list.
  textHighLight: z.union([z.string(), z.array(z.string())]).nullish(),
  onlyfans_response: onlyfansResponseSchema.nullish(),
});

export interface OfApiErrorExtras {
  /** Restricted-words highlight (CG-OF-05), normalized to one string (compat). */
  textHighLight?: string;
  /**
   * Raw highlight entries. Live capture: entries may be the FULL message text
   * with no per-word markers — per-word highlighting is best-effort only.
   */
  textHighLights?: string[];
  /** 422 field validation map. */
  validationErrors?: Record<string, string[]>;
  /** OnlyFans' own HTTP status when OFAPI wrapped it (ONLYFANS_COM_ERROR). */
  upstreamStatus?: number;
}

export class OfApiError extends CgError {
  readonly textHighLight?: string;
  readonly textHighLights?: string[];
  readonly validationErrors?: Record<string, string[]>;
  readonly upstreamStatus?: number;

  constructor(code: CgErrorCode, options: CgErrorOptions & OfApiErrorExtras = {}) {
    const { textHighLight, textHighLights, validationErrors, upstreamStatus, ...cgOptions } =
      options;
    super(code, cgOptions);
    this.name = 'OfApiError';
    if (textHighLight !== undefined) this.textHighLight = textHighLight;
    if (textHighLights !== undefined) this.textHighLights = textHighLights;
    if (validationErrors !== undefined) this.validationErrors = validationErrors;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

/** `retry-after` header: delta-seconds or HTTP-date. */
export function parseRetryAfterMs(headerValue: string | null | undefined): number | undefined {
  if (headerValue == null || headerValue.trim() === '') return undefined;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

const CREDITS_PHRASES = [
  'insufficient credits',
  'not enough credits',
  'credits exhausted',
  'out of credits',
  'credit balance is too low',
] as const;

// Session-expired / auth-failed wording from OFAPI for account-scoped calls when
// the connected OnlyFans account (not our API key) lost authentication.
const ACCOUNT_AUTH_PHRASES = [
  'session expired',
  'session has expired',
  'not authenticated',
  'authentication failed',
  'authentication expired',
  'reconnect the account',
  'reconnect your account',
  'account is not connected',
  're-authenticate',
] as const;

function matchesAny(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => haystack.includes(phrase));
}

export interface OfApiHttpFailure {
  status: number;
  url: string;
  /** Parsed JSON body when available (raw text otherwise is fine too). */
  body: unknown;
  retryAfterMs?: number;
}

function buildDetail(input: OfApiHttpFailure, providerMessage: string): CgErrorDetail {
  const snippet = typeof input.body === 'string' ? input.body : JSON.stringify(input.body ?? null);
  return {
    provider: 'ofapi',
    status: input.status,
    ...(providerMessage !== '' ? { providerMessage } : {}),
    ...(snippet && snippet !== 'null' ? { responseSnippet: snippet.slice(0, 500) } : {}),
    ...(input.retryAfterMs !== undefined
      ? { retryAfterMs: input.retryAfterMs, retryAtMs: Date.now() + input.retryAfterMs }
      : {}),
  };
}

/** Maps a non-2xx OFAPI response. Decision order is load-bearing — keep 401/429 first. */
export function mapOfApiHttpError(input: OfApiHttpFailure): OfApiError {
  // safeParse tolerates non-JSON bodies (live: 405 returns an HTML page) — body
  // is then undefined and only the outer status drives classification.
  const parsed = errorBodySchema.safeParse(input.body);
  const body = parsed.success ? parsed.data : undefined;
  const message = body?.message ?? '';
  const wrapped =
    body?.error === 'ONLYFANS_COM_ERROR' ? (body.onlyfans_response ?? undefined) : undefined;
  const upstreamStatus = wrapped?.status ?? undefined;
  const upstreamMessage = wrapped?.body?.error?.message ?? '';
  const lower =
    `${message} ${body?.description ?? ''} ${body?.error ?? ''} ${upstreamMessage}`.toLowerCase();
  const detail = buildDetail(input, message !== '' ? message : upstreamMessage);
  const upstream = upstreamStatus !== undefined ? { upstreamStatus } : {};

  if (input.status === 401) {
    return new OfApiError('CG-OF-01', { detail });
  }
  if (input.status === 429) {
    return new OfApiError('CG-OF-03', { detail });
  }
  if (input.status === 402 || matchesAny(lower, CREDITS_PHRASES)) {
    return new OfApiError('CG-OF-04', { detail, ...upstream });
  }
  const rawHighlight = body?.textHighLight ?? wrapped?.body?.errors?.textHighLight;
  if (
    rawHighlight != null ||
    ((input.status === 400 || upstreamStatus === 400) && lower.includes('restricted words'))
  ) {
    const highlights =
      rawHighlight == null ? [] : Array.isArray(rawHighlight) ? rawHighlight : [rawHighlight];
    const joined = highlights.join(', ');
    return new OfApiError('CG-OF-05', {
      detail,
      ...(joined !== '' ? { textHighLight: joined } : {}),
      ...(highlights.length > 0 ? { textHighLights: highlights } : {}),
      ...upstream,
    });
  }
  // OnlyFans rejected our session (wrapped 401) — the OFAPI key itself is fine.
  if (matchesAny(lower, ACCOUNT_AUTH_PHRASES) || upstreamStatus === 401) {
    return new OfApiError('CG-OF-02', { detail, ...upstream });
  }
  if (input.status === 422) {
    const validationErrors: Record<string, string[]> = {};
    for (const [field, issues] of Object.entries(body?.errors ?? {})) {
      validationErrors[field] = issues;
    }
    return new OfApiError('CG-APP-01', {
      message: `OFAPI validation error: ${message || 'request parameters failed validation'}`,
      detail,
      ...(Object.keys(validationErrors).length > 0 ? { validationErrors } : {}),
    });
  }
  // General ONLYFANS_COM_ERROR: classify by OnlyFans' own status when present.
  if (upstreamStatus === 429) {
    return new OfApiError('CG-OF-03', { detail, ...upstream });
  }
  if (upstreamStatus !== undefined && upstreamStatus >= 500) {
    return new OfApiError('CG-NET-01', { detail, ...upstream });
  }
  if (input.status === 404) {
    const missingAcctPrefix = !/\/acct_/.test(input.url);
    return new OfApiError('CG-APP-01', {
      message: missingAcctPrefix
        ? 'OFAPI 404 — endpoint not found; account-scoped paths need the `acct_` account id prefix'
        : 'OFAPI 404 — endpoint or resource not found',
      detail,
    });
  }
  if (input.status >= 500) {
    return new OfApiError('CG-NET-01', { detail });
  }
  return new OfApiError('CG-APP-01', { detail, ...upstream });
}

/** Maps a thrown fetch error (request never produced a response). */
export function mapOfApiNetworkError(error: unknown, url: string): OfApiError {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const detail: CgErrorDetail = {
    provider: 'ofapi',
    ...(message !== '' ? { providerMessage: message } : {}),
  };
  const mapped =
    name === 'AbortError' || name === 'TimeoutError'
      ? new OfApiError('CG-NET-02', { message: `OFAPI request timed out: ${url}`, detail })
      : new OfApiError('CG-NET-01', { message: `OFAPI request failed: ${url}`, detail });
  // Keep the original error chain (undici puts ENOTFOUND/ECONNREFUSED/… on
  // .cause): classifySendFailure needs it to prove a request never left.
  mapped.cause = error;
  return mapped;
}

/** Trust-boundary zod failure on a 2xx body (shape drifted upstream). */
export function ofApiShapeError(url: string, summary: string): OfApiError {
  return new OfApiError('CG-APP-01', {
    message: `OFAPI response failed validation for ${url}: ${summary}`,
    detail: { provider: 'ofapi', providerMessage: summary.slice(0, 500) },
  });
}
