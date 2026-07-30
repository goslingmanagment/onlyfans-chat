// CG-* error registry. Behavioral port of the legacy extension's error system
// (~/code/goose/fansly-ext src/shared/errors.ts + provider error mapping), re-keyed by
// code instead of snake_case keys. Legacy CG-FAN-01/03 (Fansly tab/server) and
// CG-HUB-01..08 (extension hub config) are not ported; OFAPI failures get the
// new CG-OF-* family and the hub family restarts at CG-HUB-01 per SPEC §11.

import { z } from 'zod';

/**
 * Permanently reserved codes retired in D26. They have no live producer and
 * no durable UserFacingError/CgError replay path. Do not reuse them.
 *
 * Desktop replay tombstones: none.
 */
export const RETIRED_CG_ERROR_CODES = [
  'CG-AUTH-01',
  'CG-AUTH-02',
  'CG-API-01',
  'CG-API-02',
  'CG-API-03',
  'CG-API-04',
  'CG-API-05',
  'CG-FLOW-01',
  'CG-FLOW-06',
  'CG-FLOW-07',
  'CG-FLOW-08',
  'CG-FAN-02',
  'CG-UI-01',
  'CG-OF-07',
] as const;

export const CG_ERROR_CODES = [
  'CG-API-06',
  'CG-NET-01',
  'CG-NET-02',
  'CG-FLOW-02',
  'CG-FLOW-03',
  'CG-FLOW-04',
  'CG-FLOW-05',
  'CG-FLOW-09',
  'CG-APP-01',
  'CG-OF-01',
  'CG-OF-02',
  'CG-OF-03',
  'CG-OF-04',
  'CG-OF-05',
  'CG-OF-06',
  'CG-OF-08',
  'CG-HUB-01',
  'CG-HUB-02',
  'CG-HUB-03',
  'CG-HUB-04',
  'CG-HUB-05',
  'CG-HUB-06',
  'CG-HUB-07',
  'CG-HUB-08',
  'CG-HUB-09',
  'CG-HUB-10',
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
  'CG-FLOW-02': {
    message: 'No active model personality is assigned for this account.',
    recovery: 'Open Settings and assign this account to an active personality. Archived or missing assignments stay saved but cannot run AI.',
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
  'CG-FLOW-09': {
    message: 'This conversation has too many messages for a greeting.',
    recovery: 'Hi works best for new conversations (10 messages or fewer). Use Reply instead.',
  },
  'CG-APP-01': {
    message: 'Something went wrong.',
    recovery: 'Try again. If it keeps failing, report the error code.',
  },
  // ── New for the desktop app (SPEC §11), not in the legacy extension registry ──
  'CG-OF-01': {
    message: 'OnlyFans API key is invalid.',
    recovery: 'Ask a manager to reconnect the page in Agency Hub, then try again.',
  },
  'CG-OF-02': {
    message: 'OnlyFans account authentication failed.',
    recovery: 'Ask a manager to reconnect this OnlyFans account, then try again.',
  },
  'CG-OF-03': {
    message: 'OnlyFans API rate limit reached.',
    recovery: 'Wait before retrying manually. If a retry time is shown, wait until that time.',
  },
  'CG-OF-04': {
    message: 'OnlyFans API credits are exhausted.',
    recovery: 'Ask a manager to top up OnlyFans API credits before trying again.',
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
  'CG-OF-08': {
    message: 'Media is still processing or unavailable.',
    recovery: 'Wait for OnlyFans to finish processing the media, then try again.',
  },
  'CG-HUB-01': {
    message: 'Agency Hub authentication failed.',
    // D19 removed human key entry from Settings: every recovery path now ends
    // in a fresh device sign-in, regardless of which bearer was rejected.
    recovery: 'Open Settings. If a device session is still listed, sign out, then sign in again and test the connection.',
    settingsLink: true,
  },
  // Generic hub failure shown in every lane (generation, sync, commands) —
  // keep the wording honest for all of them: no promises about retries.
  'CG-HUB-02': {
    message: 'Agency Hub request failed.',
    recovery: 'Try again in a moment. If it keeps failing, check the Agency Hub connection in Settings and report the error code.',
  },
  // Kernel AI gateway daily cap (429 quota_denied). The quota is per page per
  // UTC day, so "try again" is wrong advice until midnight UTC.
  'CG-HUB-03': {
    message: 'Daily AI generation limit reached.',
    recovery: 'This page used up its Agency Hub AI quota for today. It resets at midnight UTC. Ask a manager to raise the cap if this blocks work.',
  },
  'CG-HUB-04': {
    message: 'AI provider balance is exhausted.',
    recovery: 'A manager must top up the AI provider balance. Retrying will not help until the balance is restored.',
  },
  'CG-HUB-05': {
    message: 'AI provider authentication was rejected.',
    recovery: 'This is an Agency Hub provider credential problem, not your Hub sign-in. Tell a manager; retrying will not help.',
  },
  'CG-HUB-06': {
    message: 'The AI provider is rate-limiting requests.',
    recovery: 'Wait before retrying manually. If a retry time is shown, wait until that time.',
  },
  'CG-HUB-07': {
    message: 'The AI provider is temporarily unavailable.',
    recovery: 'Wait and retry manually later. Tell a manager if the outage continues.',
  },
  'CG-HUB-08': {
    message: "This page's AI egress proxy is unreachable.",
    recovery: "Tell a manager to restore the page's proxy route. Retrying will not help until the route is fixed.",
  },
  'CG-HUB-09': {
    message: 'AI generation was interrupted.',
    recovery: 'The stream ended before completion, so no result was shown. Retry manually if needed.',
  },
  // Safe fallback for provider_stream_failed and future provider* codes. The
  // kernel remains the classifier; the client never guesses from prose.
  'CG-HUB-10': {
    message: 'AI provider request failed.',
    recovery: 'Tell a manager and include the error code. Do not keep retrying until the provider issue is checked.',
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
  /** A6/A17 (W4.4): the thrown error's own text (e.g. a deterministic kernel
   *  400 explanation), shown under the registry headline — the registry
   *  rebuild used to flatten it into the generic wording. */
  detailText: z.string().min(1).optional(),
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
  /** The kernel error body's machine code (e.g. "quota_denied", "gate_min_messages"). */
  kernelCode?: string;
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
    // Turn a relative provider backoff into one stable deadline at the first
    // typed error boundary. Renderer re-renders must not keep moving it.
    const retryAtMs =
      options.retryAtMs ??
      options.detail?.retryAtMs ??
      (retryAfterMs !== undefined ? Date.now() + retryAfterMs : undefined);
    if (retryAtMs !== undefined) {
      this.retryAtMs = retryAtMs;
    }
  }
}

// ── User-facing construction ────────────────────────────────────────────────

export interface UserFacingOverrides {
  message?: string;
  recovery?: string;
  detailText?: string;
  retryAtMs?: number;
  retryAfterMs?: number;
}

export function createUserFacing(code: CgErrorCode, overrides: UserFacingOverrides = {}): UserFacingError {
  const def = CG_ERROR_REGISTRY[code];
  return {
    code,
    message: overrides.message ?? def.message,
    recovery: overrides.recovery ?? def.recovery,
    ...(overrides.detailText !== undefined ? { detailText: overrides.detailText } : {}),
    ...(def.settingsLink ? { settingsLink: true as const } : {}),
    ...(overrides.retryAtMs !== undefined ? { retryAtMs: overrides.retryAtMs } : {}),
    ...(overrides.retryAfterMs !== undefined ? { retryAfterMs: overrides.retryAfterMs } : {}),
  };
}

export function describeError(code: CgErrorCode): UserFacingError {
  return createUserFacing(code);
}

/** A6/A17 (W4.4): a CgError whose own message differs from the registry
 * headline carries real information (a deterministic kernel 400 explanation,
 * a validation detail) — surface it as detailText instead of flattening it. */
function detailTextOf(code: CgErrorCode, message: string): string | undefined {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed === CG_ERROR_REGISTRY[code].message) {
    return undefined;
  }
  return trimmed.slice(0, 400);
}

/**
 * Convert anything thrown into a user-facing error. Handles CgError instances,
 * structured-clone copies that lost their prototype over IPC, pre-built
 * user-facing objects, and unknown values (→ CG-APP-01).
 */
export function toUserFacing(error: unknown): UserFacingError {
  if (error instanceof CgError) {
    const detailText = detailTextOf(error.code, error.message);
    return createUserFacing(error.code, {
      ...(detailText !== undefined ? { detailText } : {}),
      ...(error.retryAtMs !== undefined ? { retryAtMs: error.retryAtMs } : {}),
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    });
  }

  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error ? error.code : undefined;
    if (isCgErrorCode(code)) {
      const retryAtMs = 'retryAtMs' in error && typeof error.retryAtMs === 'number' ? error.retryAtMs : undefined;
      const retryAfterMs =
        'retryAfterMs' in error && typeof error.retryAfterMs === 'number' ? error.retryAfterMs : undefined;
      const retryOverrides = {
        ...(retryAtMs !== undefined ? { retryAtMs } : {}),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };

      if (isUserFacingError(error)) {
        return error;
      }
      // A6/A17 (W4.4): an IPC-cloned CgError keeps its message — preserve it
      // the same way the instance branch does.
      const clonedMessage =
        'message' in error && typeof error.message === 'string' ? error.message : '';
      const detailText = detailTextOf(code, clonedMessage);
      return createUserFacing(code, {
        ...(detailText !== undefined ? { detailText } : {}),
        ...retryOverrides,
      });
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
