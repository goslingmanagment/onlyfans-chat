// Sanitize the Phase-0 live OFAPI probes (tmp/probe-*.json, PII, not committed)
// into committed contract-test fixtures (tests/fixtures/ofapi/). Uses the same
// sanitizer as the app's fixture-capture mode (single source of truth) via Node
// type-stripping. Run: node scripts/make-ofapi-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOfApiSanitizer } from '../apps/desktop/src/main/ofapi/sanitize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tests', 'fixtures', 'ofapi');
mkdirSync(outDir, { recursive: true });

// One sanitizer for all three fixtures: id mappings stay consistent across files
// (the same fan keeps the same fake id in chats, messages, and user-details).
const sanitizer = createOfApiSanitizer();

const jobs = [
  [
    'probe-chats.json',
    'list-chats.json',
    'GET /{account}/chats?limit=50&order=recent — live probe 2026-06-10, envelope {data,_meta,_pagination}',
  ],
  [
    'probe-messages.json',
    'list-messages.json',
    'GET /{account}/chats/{chat_id}/messages?limit=100&order=desc — live probe 2026-06-10, envelope {data,_meta,_pagination}',
  ],
  [
    'probe-user.json',
    'user-details.json',
    'GET /{account}/users/{username} — live probe 2026-06-10, envelope {data,_meta} (no _pagination)',
  ],
];

for (const [src, out, source] of jobs) {
  const raw = JSON.parse(readFileSync(join(root, 'tmp', src), 'utf8'));
  const sanitized = sanitizer.sanitize(raw);
  const doc = { _fixture: { source, anonymized: true }, ...sanitized };
  writeFileSync(join(outDir, out), `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`fixture: ${out}`);
}
