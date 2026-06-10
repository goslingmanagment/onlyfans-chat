// Anonymize captured webhook deliveries (tmp/webhooks/*.json, PII) into committable
// fixtures (tests/fixtures/webhooks/). Structure is preserved exactly — only values
// of identifying fields are replaced, with stable mappings so cross-references
// (fan.id across events) stay consistent. PLAN Phase 0 item 4.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const inDir = join(process.cwd(), 'tmp', 'webhooks');
const outDir = join(process.cwd(), 'tests', 'fixtures', 'webhooks');
mkdirSync(outDir, { recursive: true });

const idMap = new Map(); // numeric OF ids → stable fake ids
let nextId = 1000001;
const acctMap = new Map();
let nextAcct = 1;
const nameMap = new Map();
let nextName = 1;

function fakeNumericId(real) {
  const key = String(real);
  if (!idMap.has(key)) idMap.set(key, nextId++);
  return typeof real === 'number' ? idMap.get(key) : String(idMap.get(key));
}
function fakeAcct(real) {
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

function anonText(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  // preserve rough HTML-ness and length class
  const isHtml = /<[a-z]/i.test(value);
  const base = 'Sample fan message text used in anonymized fixtures.';
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

// platform boilerplate strings (subscriptions text, replacePairs) embed profile
// anchors with real names/ids — scrub them inside any string value
function scrubEmbedded(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/https?:\/\/onlyfans\.com\/u\d+/g, 'https://onlyfans.com/anonymized')
    .replace(/(<a [^>]*>)[^<]*(<\/a>)/g, '$1Fan$2');
}

function walk(node, keyHint) {
  if (Array.isArray(node)) return node.map((v) => walk(v, keyHint));
  if (node !== null && typeof node === 'object') {
    const out = {};
    const inReplacePairs = keyHint === 'replacePairs';
    for (const [k, v] of Object.entries(node)) {
      if (inReplacePairs && typeof v === 'string') {
        // money-shaped values ($10.00) are not PII — keep them for structural fidelity
        out[k] = /^[$€£]?\d[\d.,]*$/.test(v) ? v : scrubEmbedded(anonText(v));
        continue;
      }
      if (v === null || v === undefined) {
        out[k] = v;
      } else if (ID_KEYS.has(k) && (typeof v === 'number' || /^\d+$/.test(String(v)))) {
        out[k] = fakeNumericId(v);
      } else if (typeof v === 'string' && /^acct_[0-9a-f]{32}$/.test(v)) {
        out[k] = fakeAcct(v);
      } else if (USERNAME_KEYS.has(k) && typeof v === 'string') {
        out[k] = `fan${String(fakePersona(v)).padStart(3, '0')}`;
      } else if (NAME_KEYS.has(k) && typeof v === 'string') {
        out[k] = `Fan ${fakePersona(v)}`;
      } else if (TEXT_KEYS.has(k) && typeof v === 'string') {
        out[k] = anonText(v);
      } else if (DROP_VALUE_KEYS.has(k) && typeof v === 'string') {
        out[k] = '';
      } else if (typeof v === 'string' && URL_KEYS.test(k)) {
        out[k] = anonUrl(v);
      } else {
        out[k] = walk(v, k);
      }
    }
    return out;
  }
  return scrubEmbedded(node);
}

const files = readdirSync(inDir).filter((f) => f.endsWith('.json') && !f.includes('selftest'));
// pick the richest sample per event type (largest payload JSON)
const byEvent = new Map();
for (const f of files) {
  const doc = JSON.parse(readFileSync(join(inDir, f), 'utf8'));
  const ev = doc.body?.event;
  if (!ev) continue;
  const size = JSON.stringify(doc.body.payload ?? {}).length;
  const prev = byEvent.get(ev);
  if (!prev || size > prev.size) byEvent.set(ev, { doc, size, file: f });
}

const inventory = [];
for (const [ev, { doc }] of [...byEvent.entries()].sort()) {
  const fixture = {
    _meta: {
      capturedAt: doc.receivedAt,
      anonymized: true,
      source: 'live capture, Phase-0 webhook spike (loravie team), 2026-06-10',
      signatureHeader: 'signature',
      idempotencyKeyHeader: 'x-ofapi-idempotency-key',
      idempotencyKeySample: 'evt_' + 'a'.repeat(40),
    },
    event: doc.body.event,
    account_id: typeof doc.body.account_id === 'string' ? fakeAcct(doc.body.account_id) : doc.body.account_id,
    payload: walk(doc.body.payload),
  };
  const name = `${ev.replaceAll('.', '_')}.json`;
  writeFileSync(join(outDir, name), JSON.stringify(fixture, null, 2) + '\n');
  inventory.push(name);
  console.log(`fixture: ${name}`);
}
console.log(`${inventory.length} fixtures written to tests/fixtures/webhooks/`);
