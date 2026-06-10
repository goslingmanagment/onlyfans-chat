// PII sanitizer for recorded OFAPI request/response JSON (fixture capture, SPEC §5).
// Same approach as scripts/spikes/anonymize-webhooks.mjs: structure is preserved
// exactly; only identifying values are replaced, with stable per-sanitizer mappings
// so cross-references survive (fan id across chats/messages, chat id inside
// `_pagination.next_page` paths, `first_id`/`last_id` cursors).
// Dependency-free on purpose: scripts/make-ofapi-fixtures.mjs imports this file
// directly under Node type-stripping.

const ID_KEYS = new Set([
  'id',
  'userId',
  'fromUserId',
  'toUserId',
  'queueId',
  'replyToMessageId',
  'subscriberId',
  'earningId',
  'lastReadMessageId',
  'onlyfans_id',
]);
const NAME_KEYS = new Set(['name', 'displayName', 'display_name', 'customName']);
const USERNAME_KEYS = new Set(['username', 'onlyfans_username']);
const TEXT_KEYS = new Set([
  'text',
  'tipText',
  'lockedText',
  'about',
  'rawText',
  'message',
  'notes',
  'description',
]);
const DROP_VALUE_KEYS = new Set([
  'website',
  'location',
  'wishlist',
  'email',
  'onlyfans_email',
  'ip',
  'csrf',
  'wsUrl',
]);
const ACCT_ID_RE = /^acct_[0-9a-f]{32}$/;
const CURSOR_PARAMS = ['first_id', 'last_id', 'marker'] as const;
const OFAPI_HOST = 'app.onlyfansapi.com';

export interface OfApiSanitizer {
  sanitize(value: unknown): unknown;
  /** Rewrites acct ids / numeric path segments / id cursors in an OFAPI URL. */
  sanitizeApiUrl(value: string): string;
}

export function createOfApiSanitizer(): OfApiSanitizer {
  const idMap = new Map<string, number>();
  let nextId = 1_000_001;
  const acctMap = new Map<string, string>();
  let nextAcct = 1;
  const personaMap = new Map<string, number>();
  let nextPersona = 1;

  function fakeNumericId(real: number | string): number | string {
    const key = String(real);
    let mapped = idMap.get(key);
    if (mapped === undefined) {
      mapped = nextId;
      nextId += 1;
      idMap.set(key, mapped);
    }
    return typeof real === 'number' ? mapped : String(mapped);
  }

  function fakeAcct(real: string): string {
    let mapped = acctMap.get(real);
    if (mapped === undefined) {
      mapped = `acct_${String(nextAcct).padStart(2, '0')}${'0'.repeat(30)}`;
      nextAcct += 1;
      acctMap.set(real, mapped);
    }
    return mapped;
  }

  function persona(real: string): number {
    let mapped = personaMap.get(real);
    if (mapped === undefined) {
      mapped = nextPersona;
      nextPersona += 1;
      personaMap.set(real, mapped);
    }
    return mapped;
  }

  function anonText(value: string): string {
    if (value.length === 0) return value;
    const base = 'Sample fan message text used in anonymized fixtures.';
    return /<[a-z]/i.test(value) ? `<p>${base}</p>` : base;
  }

  function anonUrl(value: string): string {
    if (!/^https?:\/\//.test(value)) return value;
    try {
      const url = new URL(value);
      const ext = url.pathname.match(/\.(\w{2,4})$/)?.[1] ?? 'jpg';
      return `https://${url.host}/anonymized/sample.${ext}`;
    } catch {
      return value;
    }
  }

  // Platform boilerplate strings embed profile anchors with real names/ids.
  function scrubEmbedded(value: string): string {
    return value
      .replace(/https?:\/\/onlyfans\.com\/u\d+/g, 'https://onlyfans.com/anonymized')
      .replace(/(<a [^>]*>)[^<]*(<\/a>)/g, '$1Fan$2');
  }

  function sanitizeApiUrl(value: string): string {
    try {
      const url = new URL(value);
      url.pathname = url.pathname
        .split('/')
        .map((segment) => {
          if (ACCT_ID_RE.test(segment)) return fakeAcct(segment);
          if (/^\d+$/.test(segment)) return String(fakeNumericId(segment));
          return segment;
        })
        .join('/');
      for (const param of CURSOR_PARAMS) {
        const raw = url.searchParams.get(param);
        if (raw !== null && /^\d+$/.test(raw)) {
          url.searchParams.set(param, String(fakeNumericId(raw)));
        }
      }
      return url.toString();
    } catch {
      return value;
    }
  }

  function isOfApiUrl(value: string): boolean {
    return value.startsWith(`https://${OFAPI_HOST}/`) || value.startsWith(`http://${OFAPI_HOST}/`);
  }

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map((entry) => walk(entry));
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (value === null || value === undefined) {
          out[key] = value;
        } else if (
          ID_KEYS.has(key) &&
          (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
          value !== 0 &&
          value !== '0'
        ) {
          out[key] = fakeNumericId(value);
        } else if (typeof value === 'string' && ACCT_ID_RE.test(value)) {
          out[key] = fakeAcct(value);
        } else if (USERNAME_KEYS.has(key) && typeof value === 'string' && value !== '') {
          out[key] = `fan${String(persona(value)).padStart(3, '0')}`;
        } else if (NAME_KEYS.has(key) && typeof value === 'string' && value !== '') {
          out[key] = `Fan ${persona(value)}`;
        } else if (TEXT_KEYS.has(key) && typeof value === 'string') {
          out[key] = anonText(value);
        } else if (DROP_VALUE_KEYS.has(key) && typeof value === 'string') {
          out[key] = '';
        } else if (typeof value === 'string' && isOfApiUrl(value)) {
          out[key] = sanitizeApiUrl(value);
        } else if (typeof value === 'string' && /^https?:\/\//.test(value)) {
          // CDN/avatar/media URLs carry signed policies and user ids — always anonymize.
          out[key] = anonUrl(value);
        } else {
          out[key] = walk(value);
        }
      }
      return out;
    }
    if (typeof node === 'string') return scrubEmbedded(node);
    return node;
  }

  return {
    sanitize: (value) => walk(value),
    sanitizeApiUrl,
  };
}
