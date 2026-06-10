// OFAPI HTTP/network failures → CG-OF-* registry (SPEC §5, §11).
// This module owns OFAPI response shapes; shared `errors` covers LLM providers.

import { z } from 'zod';
import { CgError } from '@chatgoose/shared';
import type { CgErrorCode, CgErrorDetail, CgErrorOptions } from '@chatgoose/shared';

const errorBodySchema = z.looseObject({
  error: z.string().nullish(),
  message: z.string().nullish(),
  description: z.string().nullish(),
  errors: z.record(z.string(), z.array(z.string())).nullish(),
  // OnlyFans-origin restricted-words shape (400). String or list per docs.
  textHighLight: z.union([z.string(), z.array(z.string())]).nullish(),
});

export interface OfApiErrorExtras {
  /** Restricted-words highlight (CG-OF-05), normalized to one string. */
  textHighLight?: string;
  /** 422 field validation map. */
  validationErrors?: Record<string, string[]>;
}

export class OfApiError extends CgError {
  readonly textHighLight?: string;
  readonly validationErrors?: Record<string, string[]>;

  constructor(code: CgErrorCode, options: CgErrorOptions & OfApiErrorExtras = {}) {
    const { textHighLight, validationErrors, ...cgOptions } = options;
    super(code, cgOptions);
    this.name = 'OfApiError';
    if (textHighLight !== undefined) this.textHighLight = textHighLight;
    if (validationErrors !== undefined) this.validationErrors = validationErrors;
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
  const parsed = errorBodySchema.safeParse(input.body);
  const body = parsed.success ? parsed.data : undefined;
  const message = body?.message ?? '';
  const lower = `${message} ${body?.description ?? ''} ${body?.error ?? ''}`.toLowerCase();
  const detail = buildDetail(input, message);

  if (input.status === 401) {
    return new OfApiError('CG-OF-01', { detail });
  }
  if (input.status === 429) {
    return new OfApiError('CG-OF-03', { detail });
  }
  if (input.status === 402 || matchesAny(lower, CREDITS_PHRASES)) {
    return new OfApiError('CG-OF-04', { detail });
  }
  if (body?.textHighLight != null || (input.status === 400 && lower.includes('restricted words'))) {
    const highlight = Array.isArray(body?.textHighLight)
      ? body.textHighLight.join(', ')
      : (body?.textHighLight ?? '');
    return new OfApiError('CG-OF-05', {
      detail,
      ...(highlight !== '' ? { textHighLight: highlight } : {}),
    });
  }
  if (matchesAny(lower, ACCOUNT_AUTH_PHRASES)) {
    return new OfApiError('CG-OF-02', { detail });
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
  return new OfApiError('CG-APP-01', { detail });
}

/** Maps a thrown fetch error (request never produced a response). */
export function mapOfApiNetworkError(error: unknown, url: string): OfApiError {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const detail: CgErrorDetail = {
    provider: 'ofapi',
    ...(message !== '' ? { providerMessage: message } : {}),
  };
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new OfApiError('CG-NET-02', { message: `OFAPI request timed out: ${url}`, detail });
  }
  return new OfApiError('CG-NET-01', { message: `OFAPI request failed: ${url}`, detail });
}

/** Trust-boundary zod failure on a 2xx body (shape drifted upstream). */
export function ofApiShapeError(url: string, summary: string): OfApiError {
  return new OfApiError('CG-APP-01', {
    message: `OFAPI response failed validation for ${url}: ${summary}`,
    detail: { provider: 'ofapi', providerMessage: summary.slice(0, 500) },
  });
}
