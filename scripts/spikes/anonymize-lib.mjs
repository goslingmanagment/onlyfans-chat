// Shared anonymization walker for OFAPI captures (webhooks + golden transcripts).
// Structure-preserving: only values of identifying fields are replaced, with
// stable mappings so cross-references stay consistent within one run.

const idMap = new Map();
let nextId = 1000001;
const acctMap = new Map();
let nextAcct = 1;
const nameMap = new Map();
let nextName = 1;

export function fakeNumericId(real) {
  const key = String(real);
  if (!idMap.has(key)) idMap.set(key, nextId++);
  const mapped = idMap.get(key);
  return typeof real === 'number' ? mapped : String(mapped);
}

export function fakeAcct(real) {
  if (!acctMap.has(real)) {
    acctMap.set(real, `acct_${String(nextAcct++).padStart(2, '0')}${'0'.repeat(30)}`);
  }
  return acctMap.get(real);
}

function fakePersona(real) {
  if (!nameMap.has(real)) nameMap.set(real, nextName++);
  return nameMap.get(real);
}

const ID_KEYS = new Set(['id', 'userId', 'fromUserId', 'toUserId', 'queueId', 'replyToMessageId']);
const NAME_KEYS = new Set(['name', 'displayName', 'display_name', 'customName']);
const USERNAME_KEYS = new Set(['username', 'onlyfans_username']);
const TEXT_KEYS = new Set(['text', 'tipText', 'lockedText', 'about', 'rawText', 'message', 'notes']);
const URL_KEYS = /avatar|thumb|cover|url|src|preview/i;
const DROP_VALUE_KEYS = new Set(['website', 'location', 'wishlist', 'email', 'onlyfans_email']);

let textCounter = 0;
const textMap = new Map();

/**
 * Replace fan text while preserving HTML-ness and rough length class. With
 * `varied: true`, distinct source texts map to distinct (numbered) outputs so
 * transcripts keep a sense of conversation flow.
 */
function anonText(value, varied) {
  if (typeof value !== 'string' || value.length === 0) return value;
  const isHtml = /<[a-z]/i.test(value);
  let base = 'Sample fan message text used in anonymized fixtures.';
  if (varied) {
    if (!textMap.has(value)) {
      textCounter += 1;
      const lengthClass = value.length > 200 ? ' This one is a longer message for layout and token-count realism, repeated to preserve the rough size of the original message in the fixture.' : '';
      textMap.set(value, `Anonymized message ${textCounter}.${lengthClass}`);
    }
    base = textMap.get(value);
  }
  return isHtml ? `<p>${base}</p>` : base;
}

function anonUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//.test(value)) return value;
  try {
    const u = new URL(value);
    const ext = u.pathname.match(/\.(\w{2,4})$/)?.[1] ?? 'jpg';
    return `https://${u.host}/anonymized/sample.${ext}`;
  } catch {
    return value;
  }
}

function scrubEmbedded(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/https?:\/\/onlyfans\.com\/u\d+/g, 'https://onlyfans.com/anonymized')
    .replace(/(<a [^>]*>)[^<]*(<\/a>)/g, '$1Fan$2');
}

export function anonymize(node, { variedText = false, keyHint } = {}) {
  if (Array.isArray(node)) return node.map((v) => anonymize(v, { variedText, keyHint }));
  if (node !== null && typeof node === 'object') {
    const out = {};
    const inReplacePairs = keyHint === 'replacePairs';
    for (const [k, v] of Object.entries(node)) {
      if (v === null || v === undefined) {
        out[k] = v;
      } else if (inReplacePairs && typeof v === 'string') {
        out[k] = /^[$€£]?\d[\d.,]*$/.test(v) ? v : scrubEmbedded(anonText(v, false));
      } else if (ID_KEYS.has(k) && (typeof v === 'number' || /^\d+$/.test(String(v)))) {
        out[k] = fakeNumericId(v);
      } else if (typeof v === 'string' && /^acct_[0-9a-f]{32}$/.test(v)) {
        out[k] = fakeAcct(v);
      } else if (USERNAME_KEYS.has(k) && typeof v === 'string') {
        out[k] = `fan${String(fakePersona(v)).padStart(3, '0')}`;
      } else if (NAME_KEYS.has(k) && typeof v === 'string') {
        out[k] = `Fan ${fakePersona(v)}`;
      } else if (TEXT_KEYS.has(k) && typeof v === 'string') {
        out[k] = scrubEmbedded(anonText(v, variedText));
      } else if (DROP_VALUE_KEYS.has(k) && typeof v === 'string') {
        out[k] = '';
      } else if (typeof v === 'string' && URL_KEYS.test(k)) {
        out[k] = anonUrl(v);
      } else {
        out[k] = anonymize(v, { variedText, keyHint: k });
      }
    }
    return out;
  }
  return scrubEmbedded(node);
}
