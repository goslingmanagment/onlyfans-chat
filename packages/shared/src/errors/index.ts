// CG-* error registry. Behavioral port of the legacy extension's error system
// (~/code/chatgoose src/shared/errors.ts + provider error mapping), re-keyed by
// code instead of snake_case keys. Legacy CG-FAN-01/03 (Fansly tab/server) and
// CG-HUB-01..08 (extension hub config) are not ported; OFAPI failures get the
// new CG-OF-* family and the hub family restarts at CG-HUB-01 per SPEC §11.

import { z } from 'zod';

export const CG_ERROR_CODES = [
  'CG-AUTH-01',
  'CG-AUTH-02',
  'CG-API-01',
  'CG-API-02',
  'CG-API-03',
  'CG-API-04',
  'CG-API-05',
  'CG-API-06',
  'CG-NET-01',
  'CG-NET-02',
  'CG-FLOW-01',
  'CG-FLOW-02',
  'CG-FLOW-03',
  'CG-FLOW-04',
  'CG-FLOW-05',
  'CG-FLOW-06',
  'CG-FLOW-07',
  'CG-FLOW-08',
  'CG-FLOW-09',
  'CG-FAN-02',
  'CG-UI-01',
  'CG-APP-01',
  'CG-OF-01',
  'CG-OF-02',
  'CG-OF-03',
  'CG-OF-04',
  'CG-OF-05',
  'CG-OF-06',
  'CG-OF-07',
  'CG-OF-08',
  'CG-HUB-01',
  'CG-HUB-02',
  'CG-GUARD-01',
  'CG-GUARD-02',
] as const;

export type CgErrorCode = (typeof CG_ERROR_CODES)[number];

export interface CgErrorDefinition {
  /** User-facing one-liner. */
  message: string;
  /** User-facing recovery action. */
  recovery: string;
  /** UI should link to Settings. */
  settingsLink?: true;
}

export const CG_ERROR_REGISTRY: Record<CgErrorCode, CgErrorDefinition> = {
  'CG-AUTH-01': {
    message: 'Claude API key not configured.',
    recovery: 'Open Settings and add a valid Claude API key.',
    settingsLink: true,
  },
  'CG-AUTH-02': {
    message: 'Claude API key is invalid.',
    recovery: 'Check the key in Settings and try again.',
    settingsLink: true,
  },
  'CG-API-01': {
    message: 'Rate limit reached.',
    recovery: 'ChatGoose will retry if the wait is short; otherwise run it again later.',
  },
  'CG-API-02': {
    message: 'Anthropic balance is insufficient.',
    recovery: 'Add credits or update billing before trying again.',
  },
  'CG-API-03': {
    message: 'Selected Claude model is unavailable.',
    recovery: 'Pick another model in Settings or wait until the model is available again.',
    settingsLink: true,
  },
  'CG-API-04': {
    message: 'Prompt is too large for this model.',
    recovery: 'Reduce the context or use a shorter conversation window.',
  },
  'CG-API-05': {
    message: 'Anthropic service is unavailable.',
    recovery: 'Wait a moment and try again.',
  },
  'CG-API-06': {
    message: 'AI reply could not be used.',
    recovery: 'The model returned an incomplete or meta response. Regenerate the reply.',
  },
  'CG-NET-01': {
    message: 'Network request failed.',
    recovery: 'Check your connection and try again.',
  },
  'CG-NET-02': {
    message: 'Operation timed out.',
    recovery: 'The request took too long. Try again.',
  },
  'CG-FLOW-01': {
    message: 'No model personalities are configured.',
    recovery: 'Open Settings and create at least one personality.',
    settingsLink: true,
  },
  'CG-FLOW-02': {
    message: 'No model personality is assigned for this account.',
    recovery: 'Open Settings and map this OnlyFans account to a personality.',
    settingsLink: true,
  },
  'CG-FLOW-03': {
    message: 'Not enough conversation history.',
    recovery: 'This feature needs at least 30 messages in the chat history.',
  },
  'CG-FLOW-04': {
    message: 'Another operation is already running.',
    recovery: 'Wait for the current job to finish or cancel it first.',
  },
  'CG-FLOW-05': {
    message: 'This fan is still active.',
    recovery: 'Use Reply instead of Ping for an active conversation.',
  },
  'CG-FLOW-06': {
    message: 'Conversation changed.',
    recovery: 'The result was discarded because you switched chats.',
  },
  // Legacy "Extension reloaded." — desktop equivalent is an app reload mid-operation.
  'CG-FLOW-07': {
    message: 'ChatGoose reloaded.',
    recovery: 'Run the action again.',
  },
  'CG-FLOW-08': {
    message: 'Compare needs at least two model cards.',
    recovery: 'Add draft cards or map the current personality before running Compare.',
  },
  'CG-FLOW-09': {
    message: 'This conversation has too many messages for a greeting.',
    recovery: 'Hi works best for new conversations (10 messages or fewer). Use Reply instead.',
  },
  // OFAPI auto-recovers expired sessions; a lone session_expired event is informational (SPEC §11).
  'CG-FAN-02': {
    message: 'OnlyFans session expired.',
    recovery: 'OnlyFans usually reconnects automatically; re-link the account in Settings if it keeps failing.',
  },
  'CG-UI-01': {
    message: 'Could not insert into the message box.',
    recovery: 'Copy the result manually instead.',
  },
  'CG-APP-01': {
    message: 'Something went wrong.',
    recovery: 'Try again. If it keeps failing, report the error code.',
  },
  // ── New for the desktop app (SPEC §11), not in the legacy extension registry ──
  'CG-OF-01': {
    message: 'OnlyFans API key is invalid.',
    recovery: 'Check the OnlyFans API key in Settings and try again.',
    settingsLink: true,
  },
  'CG-OF-02': {
    message: 'OnlyFans account authentication failed.',
    recovery: 'Re-authenticate this OnlyFans account, then try again.',
  },
  'CG-OF-03': {
    message: 'OnlyFans API rate limit reached.',
    recovery: 'ChatGoose is backing off automatically. Try again in a moment.',
  },
  'CG-OF-04': {
    message: 'OnlyFans API credits are exhausted.',
    recovery: 'Top up OnlyFans API credits before trying again.',
  },
  'CG-OF-05': {
    message: 'Message contains words OnlyFans restricts.',
    recovery: 'Edit the highlighted words and send again.',
  },
  // Indeterminate send — never auto-retried (SPEC §15); the verifier UI owns recovery.
  'CG-OF-06': {
    message: 'Send could not be confirmed.',
    recovery: 'Check the conversation before retrying — the message may already have been delivered.',
  },
  'CG-OF-07': {
    message: 'The unsend window for this message has passed.',
    recovery: 'Messages can only be unsent within 24 hours of sending.',
  },
  'CG-OF-08': {
    message: 'Media is still processing or unavailable.',
    recovery: 'Wait for OnlyFans to finish processing the media, then try again.',
  },
  'CG-HUB-01': {
    message: 'Agency Hub authentication failed.',
    recovery: 'Check the chatter API key in Settings, then test the connection again.',
    settingsLink: true,
  },
  'CG-HUB-02': {
    message: 'Agency Hub request failed.',
    recovery: 'Local results are kept and sync retries automatically. Report this if it keeps failing.',
  },
  'CG-GUARD-01': {
    message: 'Message Guard blocked this message.',
    recovery: 'Edit the highlighted text and send again.',
  },
  'CG-GUARD-02': {
    message: 'Message Guard policy is unavailable.',
    recovery: 'Reload ChatGoose or contact a manager before sending.',
  },
};

const CODE_SET: ReadonlySet<string> = new Set(CG_ERROR_CODES);

export function isCgErrorCode(value: unknown): value is CgErrorCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

// ── User-facing error (crosses IPC; validate at the boundary) ──────────────

export const userFacingErrorSchema = z.object({
  code: z.enum(CG_ERROR_CODES),
  message: z.string().min(1),
  recovery: z.string().min(1),
  settingsLink: z.literal(true).optional(),
  retryAtMs: z.number().optional(),
  retryAfterMs: z.number().optional(),
});

export type UserFacingError = z.infer<typeof userFacingErrorSchema>;

export function isUserFacingError(value: unknown): value is UserFacingError {
  return userFacingErrorSchema.safeParse(value).success;
}

// ── Typed error ─────────────────────────────────────────────────────────────

export interface CgErrorDetail {
  status?: number;
  provider?: string;
  providerMessage?: string;
  responseSnippet?: string;
  retryAfterMs?: number;
  retryAtMs?: number;
  policyVersion?: string;
  guardSpans?: Array<{
    start: number;
    end: number;
    category: string;
    ruleId: string;
    ruleLabel: string;
  }>;
}

export interface CgErrorOptions {
  /** Internal/debug message; defaults to the registry user-facing message. */
  message?: string;
  detail?: CgErrorDetail;
  /** Failure of an optional pipeline stage — callers may continue. */
  isOptional?: boolean;
  retryAfterMs?: number;
  retryAtMs?: number;
}

export class CgError extends Error {
  readonly code: CgErrorCode;
  readonly detail?: CgErrorDetail;
  readonly isOptional: boolean;
  readonly retryAtMs?: number;
  readonly retryAfterMs?: number;

  constructor(code: CgErrorCode, options: CgErrorOptions = {}) {
    super(options.message ?? CG_ERROR_REGISTRY[code].message);
    this.name = 'CgError';
    this.code = code;
    this.isOptional = options.isOptional ?? false;
    if (options.detail !== undefined) {
      this.detail = options.detail;
    }
    const retryAfterMs = options.retryAfterMs ?? options.detail?.retryAfterMs;
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = retryAfterMs;
    }
    const retryAtMs = options.retryAtMs ?? options.detail?.retryAtMs;
    if (retryAtMs !== undefined) {
      this.retryAtMs = retryAtMs;
    }
  }
}

// ── User-facing construction ────────────────────────────────────────────────

export interface UserFacingOverrides {
  message?: string;
  recovery?: string;
  retryAtMs?: number;
  retryAfterMs?: number;
}

export function createUserFacing(code: CgErrorCode, overrides: UserFacingOverrides = {}): UserFacingError {
  const def = CG_ERROR_REGISTRY[code];
  return {
    code,
    message: overrides.message ?? def.message,
    recovery: overrides.recovery ?? def.recovery,
    ...(def.settingsLink ? { settingsLink: true as const } : {}),
    ...(overrides.retryAtMs !== undefined ? { retryAtMs: overrides.retryAtMs } : {}),
    ...(overrides.retryAfterMs !== undefined ? { retryAfterMs: overrides.retryAfterMs } : {}),
  };
}

export function describeError(code: CgErrorCode): UserFacingError {
  return createUserFacing(code);
}

type ProviderWording = Pick<UserFacingError, 'message' | 'recovery'>;

// Legacy behavior: registry wording names Claude/Anthropic; OpenRouter-classified
// errors get reworded per provider so the user fixes the right key/balance.
function providerWordingOverrides(code: CgErrorCode, provider: string | undefined): ProviderWording | null {
  if (provider !== 'openrouter') {
    return null;
  }
  switch (code) {
    case 'CG-AUTH-01':
      return {
        message: 'OpenRouter API key not configured.',
        recovery: 'Open Settings and add a valid OpenRouter API key.',
      };
    case 'CG-AUTH-02':
      return {
        message: 'OpenRouter API key is invalid.',
        recovery: 'Check the OpenRouter key in Settings and try again.',
      };
    case 'CG-API-01':
      return {
        message: 'OpenRouter rate limit reached.',
        recovery: 'ChatGoose will retry if the wait is short; otherwise run it again later.',
      };
    case 'CG-API-02':
      return {
        message: 'OpenRouter balance is insufficient.',
        recovery: 'Add credits or update billing in OpenRouter before trying again.',
      };
    case 'CG-API-03':
      return {
        message: 'Selected OpenRouter model is unavailable.',
        recovery: 'Pick another model in Settings or wait until the model is available again.',
      };
    case 'CG-API-05':
      return {
        message: 'OpenRouter service is unavailable.',
        recovery: 'Wait a moment and try again.',
      };
    default:
      return null;
  }
}

/**
 * Convert anything thrown into a user-facing error. Handles CgError instances,
 * structured-clone copies that lost their prototype over IPC, pre-built
 * user-facing objects, and unknown values (→ CG-APP-01).
 */
export function toUserFacing(error: unknown): UserFacingError {
  if (error instanceof CgError) {
    return createUserFacing(error.code, {
      ...(providerWordingOverrides(error.code, error.detail?.provider) ?? {}),
      ...(error.retryAtMs !== undefined ? { retryAtMs: error.retryAtMs } : {}),
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    });
  }

  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error ? error.code : undefined;
    if (isCgErrorCode(code)) {
      const detail = 'detail' in error ? error.detail : undefined;
      const provider =
        typeof detail === 'object' && detail !== null && 'provider' in detail && typeof detail.provider === 'string'
          ? detail.provider
          : undefined;
      const retryAtMs = 'retryAtMs' in error && typeof error.retryAtMs === 'number' ? error.retryAtMs : undefined;
      const retryAfterMs =
        'retryAfterMs' in error && typeof error.retryAfterMs === 'number' ? error.retryAfterMs : undefined;
      const retryOverrides = {
        ...(retryAtMs !== undefined ? { retryAtMs } : {}),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };

      const wording = providerWordingOverrides(code, provider);
      if (wording) {
        return createUserFacing(code, { ...wording, ...retryOverrides });
      }
      if (isUserFacingError(error)) {
        return error;
      }
      return createUserFacing(code, retryOverrides);
    }
  }

  return describeError('CG-APP-01');
}

export function formatUserFacing(error: UserFacingError): string {
  return `${error.code}: ${error.message}`;
}

export function toDebugPayload(error: unknown): unknown {
  if (error instanceof CgError) {
    return {
      code: error.code,
      message: error.message,
      isOptional: error.isOptional,
      ...(error.retryAtMs !== undefined ? { retryAtMs: error.retryAtMs } : {}),
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      ...(error.detail ? { detail: error.detail } : {}),
    };
  }
  return error;
}

// ── Provider/HTTP error classification ──────────────────────────────────────
// Ported decision order and phrase lists are production-found — do not loosen.
// OFAPI responses are classified by the OFAPI client module (→ CG-OF-*), which
// owns its response shapes; these helpers cover the direct LLM providers.

export interface ProviderErrorInfo {
  /** Provider error type, e.g. Anthropic `rate_limit_error`. */
  type?: string | null;
  /** OpenRouter error code (string or number). */
  code?: string | number | null;
  message?: string | null;
}

function matchesAny(message: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => message.includes(phrase));
}

function buildProviderDetail(
  provider: 'anthropic' | 'openrouter',
  status: number,
  providerMessage: string,
  retryAfterMs: number | undefined,
): CgErrorDetail {
  return {
    provider,
    ...(status > 0 ? { status } : {}),
    ...(providerMessage !== '' ? { providerMessage } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs, retryAtMs: Date.now() + retryAfterMs } : {}),
  };
}

// Bare 'billing' is intentionally excluded — it over-matches unrelated messages.
const ANTHROPIC_BALANCE_PHRASES = [
  'insufficient balance',
  'insufficient credits',
  'credit balance is too low',
  'payment required',
] as const;

// Bare 'not found' is intentionally excluded — it over-matches and would
// wrongly trigger the model-fallback retry.
const ANTHROPIC_MODEL_PHRASES = ['model not found', 'does not exist', 'is unavailable', 'deprecated'] as const;

const ANTHROPIC_CONTEXT_PHRASES = [
  'prompt is too long',
  'context length',
  'maximum context length',
  'too many tokens',
  'request is too large',
  'input is too long',
] as const;

export function classifyAnthropicHttpError(
  status: number,
  info?: ProviderErrorInfo | null,
  retryAfterMs?: number,
): CgError {
  const type = info?.type?.trim().toLowerCase() ?? '';
  const providerMessage = info?.message?.trim() ?? '';
  const message = providerMessage.toLowerCase();
  const detail = buildProviderDetail('anthropic', status, providerMessage, retryAfterMs);

  if (status === 429 || type === 'rate_limit_error' || message.includes('rate limit')) {
    return new CgError('CG-API-01', { detail });
  }
  if (
    type === 'insufficient_balance_error' ||
    type === 'payment_required_error' ||
    matchesAny(message, ANTHROPIC_BALANCE_PHRASES)
  ) {
    return new CgError('CG-API-02', { detail });
  }
  if (status === 401 || status === 403) {
    return new CgError('CG-AUTH-02', { detail });
  }
  if (type === 'not_found_error' || matchesAny(message, ANTHROPIC_MODEL_PHRASES)) {
    return new CgError('CG-API-03', { detail });
  }
  if (status === 413 || type === 'context_window_exceeded_error' || matchesAny(message, ANTHROPIC_CONTEXT_PHRASES)) {
    return new CgError('CG-API-04', { detail });
  }
  if (status === 529 || status >= 500 || type === 'overloaded_error') {
    return new CgError('CG-API-05', { detail });
  }
  if (status === 400) {
    return new CgError('CG-APP-01', { detail });
  }
  if (status === 0) {
    return new CgError('CG-API-05', { detail });
  }
  return new CgError('CG-NET-01', { detail });
}

const OPENROUTER_BALANCE_PHRASES = ['insufficient credits', 'insufficient balance', 'payment required'] as const;

const OPENROUTER_MODEL_PHRASES = [
  'model not found',
  'invalid model',
  'not a valid model',
  'does not exist',
  'is unavailable',
] as const;

const OPENROUTER_CONTEXT_PHRASES = [
  'context length',
  'maximum context',
  'too many tokens',
  'prompt is too long',
  'request is too large',
] as const;

export function classifyOpenRouterHttpError(
  status: number,
  info?: ProviderErrorInfo | null,
  retryAfterMs?: number,
): CgError {
  const type = info?.type?.trim().toLowerCase() ?? '';
  const code = info?.code != null ? String(info.code).trim().toLowerCase() : '';
  const providerMessage = info?.message?.trim() ?? '';
  const message = providerMessage.toLowerCase();
  const detail = buildProviderDetail('openrouter', status, providerMessage, retryAfterMs);

  if (status === 429 || code === '429' || message.includes('rate limit')) {
    return new CgError('CG-API-01', { detail });
  }
  if (status === 402 || code === '402' || matchesAny(message, OPENROUTER_BALANCE_PHRASES)) {
    return new CgError('CG-API-02', { detail });
  }
  if (status === 401 || status === 403 || code === '401' || code === '403') {
    return new CgError('CG-AUTH-02', { detail });
  }
  if (status === 404 || type === 'not_found_error' || matchesAny(message, OPENROUTER_MODEL_PHRASES)) {
    return new CgError('CG-API-03', { detail });
  }
  if (status === 413 || matchesAny(message, OPENROUTER_CONTEXT_PHRASES)) {
    return new CgError('CG-API-04', { detail });
  }
  if (status === 502 || status === 503 || status >= 500) {
    return new CgError('CG-API-05', { detail });
  }
  if (status === 400) {
    return new CgError('CG-APP-01', { detail });
  }
  if (status === 0) {
    return new CgError('CG-API-05', { detail });
  }
  return new CgError('CG-NET-01', { detail });
}
