// Platform-pure logging core (SPEC §15.2): log shapes + a secret redactor + a
// ring buffer + the file line formatter. Shared by the main-process file logger
// (apps/desktop/src/main/diagnostics/logger.ts) and the diagnostics-export
// builder, and unit-tested here. NO Node/Electron imports — the redactor is the
// review-blocking guarantee that logs and the exported bundle never carry key
// material (SPEC §15.9 is about the DB; logs are plaintext-by-design because the
// whole point is that a user can send them, so redaction is the safety net).

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function levelRank(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

/** True when `level` is at least as severe as `min`. */
export function meetsLevel(level: LogLevel, min: LogLevel): boolean {
  return levelRank(level) >= levelRank(min);
}

export interface LogEntry {
  /** Epoch ms. */
  t: number;
  level: LogLevel;
  /** Subsystem tag, e.g. 'boot', 'ipc:cmd:send.message', 'sync', 'renderer'. */
  scope: string;
  msg: string;
  /** CG-* code when the entry describes a classified failure (export summary groups by it). */
  code?: string;
  /** Structured context — already redacted before it reaches the ring/file. */
  fields?: Record<string, unknown>;
}

// ─── Redaction ─────────────────────────────────────────────────────────────

export const REDACTED = '[redacted]';

// Token SHAPES we mask even when the exact value isn't known to the redactor
// (e.g. a token that leaked into an upstream error string). Conservative on
// purpose: each anchors on a vendor prefix or an explicit key/secret label, so
// ordinary words and ids (acct_…, message ids) are never touched.
const TOKEN_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /sk-or-[A-Za-z0-9_-]{8,}/g, // OpenRouter
  /sk-[A-Za-z0-9_-]{20,}/g, // generic sk- keys
  /ofapi_[A-Za-z0-9_-]{8,}/g, // OnlyFans API (OFAPI) key — keys start with ofapi_
  /agency_hub_core_[A-Za-z0-9_-]{6,}/g, // Agency Hub chatter key
  /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, // Authorization headers
];

// `"apiKey": "VALUE"` / `token=VALUE` / `authorization: VALUE` — keep the field
// name, mask the value. The first group is the label+separator, preserved.
const LABELLED_SECRET =
  /(["']?(?:api[_-]?key|apikey|access[_-]?token|token|secret|password|authorization)["']?\s*[:=]\s*["']?)([A-Za-z0-9._-]{6,})/gi;

/**
 * Mask known secret values and token-shaped substrings in arbitrary text.
 * `secrets` are the live secret VALUES (read from the keychain) — exact-literal
 * masking is the strongest layer; the shape patterns are defense-in-depth for
 * values the caller didn't enumerate. Values shorter than 6 chars are ignored
 * (too generic — would mask unrelated text). Order matters: literal first.
 */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 6) {
      // split/join = literal global replace, no regex-escaping of the value.
      out = out.split(secret).join(REDACTED);
    }
  }
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  out = out.replace(LABELLED_SECRET, (_match, label: string) => `${label}${REDACTED}`);
  return out;
}

const REDACT_MAX_DEPTH = 8;
const REDACT_MAX_ARRAY_ITEMS = 100;
const REDACT_MAX_OBJECT_KEYS = 100;
const REDACT_MAX_STRING_CHARS = 20_000;

function boundedString(value: string): string {
  if (value.length <= REDACT_MAX_STRING_CHARS) {
    return value;
  }
  return `${value.slice(0, REDACT_MAX_STRING_CHARS)}...[truncated]`;
}

function redactValueInner(
  value: unknown,
  secrets: readonly string[],
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (typeof value === 'string') {
    return boundedString(redactSecrets(value, secrets));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  if (depth >= REDACT_MAX_DEPTH) {
    return '[max-depth]';
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, REDACT_MAX_ARRAY_ITEMS)
        .map((item) => redactValueInner(item, secrets, seen, depth + 1));
      if (value.length > REDACT_MAX_ARRAY_ITEMS) {
        items.push(`[${value.length - REDACT_MAX_ARRAY_ITEMS} items truncated]`);
      }
      return items;
    }

    const out: Record<string, unknown> = {};
    const entries = Object.entries(value);
    for (const [key, inner] of entries.slice(0, REDACT_MAX_OBJECT_KEYS)) {
      out[boundedString(redactSecrets(key, secrets))] = redactValueInner(
        inner,
        secrets,
        seen,
        depth + 1,
      );
    }
    if (entries.length > REDACT_MAX_OBJECT_KEYS) {
      out['__truncatedKeys'] = entries.length - REDACT_MAX_OBJECT_KEYS;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/** Deep-redact every string leaf of a structured value (objects, arrays). */
export function redactValue(value: unknown, secrets: readonly string[] = []): unknown {
  return redactValueInner(value, secrets, new WeakSet<object>(), 0);
}

/** Redact a log entry's message and fields. Returns a new entry. */
export function redactEntry(entry: LogEntry, secrets: readonly string[] = []): LogEntry {
  return {
    ...entry,
    msg: redactSecrets(entry.msg, secrets),
    ...(entry.fields !== undefined
      ? { fields: redactValue(entry.fields, secrets) as Record<string, unknown> }
      : {}),
  };
}

// ─── Errors → loggable fields ────────────────────────────────────────────────

/** Flatten any thrown value into JSON-safe fields (name/message/stack/code/cause). */
export function errorToFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (typeof error.stack === 'string') {
      out['stack'] = error.stack;
    }
    // CgError and friends carry a `.code`; surface it without importing them.
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      out['code'] = code;
    }
    const detail = (error as { detail?: unknown }).detail;
    if (detail !== undefined) {
      out['detail'] = detail;
    }
    if (error.cause !== undefined && error.cause !== error) {
      out['cause'] =
        error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message }
          : error.cause;
    }
    return out;
  }
  return { value: typeof error === 'object' ? error : String(error) };
}

// ─── File line formatting ─────────────────────────────────────────────────────

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[circular]';
        }
        seen.add(val);
      }
      if (typeof val === 'bigint') {
        return val.toString();
      }
      return val;
    });
  } catch {
    return '"[unserializable]"';
  }
}

/** One single-line record for the rotating log file. */
export function formatLogLine(entry: LogEntry): string {
  const iso = new Date(entry.t).toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const code = entry.code !== undefined ? ` ${entry.code}` : '';
  const fields =
    entry.fields !== undefined && Object.keys(entry.fields).length > 0
      ? ` ${safeJsonStringify(entry.fields)}`
      : '';
  // Newlines in the message would break the one-record-per-line contract.
  const msg = entry.msg.replace(/\r?\n/g, ' ⏎ ');
  return `${iso} ${level} [${entry.scope}]${code} ${msg}${fields}`;
}

// ─── Ring buffer ─────────────────────────────────────────────────────────────

/** Fixed-capacity FIFO; oldest entries fall off the front once full. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }
  }

  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
