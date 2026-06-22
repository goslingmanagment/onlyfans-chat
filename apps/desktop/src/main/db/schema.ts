// v1 DDL — tables per SPEC §10. Additive columns beyond the SPEC list exist only
// where the pinned renderer contract (preload/contract.ts view-models) needs
// queryable data: chats.last_message_is_sent_by_me, messages.tip_amount/tip_text/
// reply_to, fans.about (SPEC §10 updated in the same change).

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  auth_state TEXT NOT NULL,
  raw TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chats (
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  fan_name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  has_unread_tips INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_message_preview TEXT NOT NULL DEFAULT '',
  last_message_is_sent_by_me INTEGER NOT NULL DEFAULT 0,
  last_read_message_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  can_send_message INTEGER NOT NULL DEFAULT 1,
  can_not_send_reason TEXT,
  raw TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, chat_id)
);
CREATE INDEX idx_chats_account_recent ON chats (account_id, last_message_at DESC);

CREATE TABLE messages (
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_sent_by_me INTEGER NOT NULL DEFAULT 0,
  text_html TEXT NOT NULL DEFAULT '',
  text_plain TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  is_opened INTEGER,
  is_new INTEGER NOT NULL DEFAULT 0,
  is_tip INTEGER NOT NULL DEFAULT 0,
  tip_amount REAL,
  tip_text TEXT,
  reply_to TEXT,
  media TEXT NOT NULL DEFAULT '[]',
  deleted INTEGER NOT NULL DEFAULT 0,
  raw TEXT NOT NULL,
  PRIMARY KEY (account_id, chat_id, message_id)
);
CREATE INDEX idx_messages_chat_recent ON messages (account_id, chat_id, created_at DESC);

CREATE TABLE fans (
  account_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  custom_name TEXT,
  avatar TEXT,
  about TEXT,
  last_seen TEXT,
  spending TEXT,
  subscription TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (account_id, fan_id)
);

CREATE TABLE summaries (
  account_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  body TEXT NOT NULL,
  model_id TEXT,
  personality_id TEXT NOT NULL,
  personality_updated_at INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  spending_verified INTEGER,
  subscription_verified INTEGER,
  hub_sync_state TEXT,
  PRIMARY KEY (account_id, fan_id)
);

CREATE TABLE outbox (
  local_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('sending', 'sent', 'failed', 'unconfirmed')),
  message_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_outbox_chat ON outbox (account_id, chat_id, created_at);

CREATE TABLE media_cache (
  url_hash TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE usage_events (
  client_event_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE credit_log (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);
`;

// v2 (additive) — media_urls backs the opaque media:// token (SPEC §4): the
// protocol handler resolves only url_hashes registered here, so a renderer
// can never make main fetch a URL that sync/mapping did not mint.
export const SCHEMA_V2 = `
CREATE TABLE media_urls (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

// v3 (additive) — the chat-list delta detector compares against the row's own
// last_message_id: hydration is list-only (no message bodies), so the messages
// table can no longer serve as the "what did we last see" baseline.
export const SCHEMA_V3 = `
ALTER TABLE chats ADD COLUMN last_message_id TEXT;
`;

// v4 — outbox shaped for the SPEC §7 state machine. Recreate is safe: nothing
// could have written the v1 outbox (no send path existed before this version).
// States: queued (sequence parts awaiting their turn) → sending (persisted
// BEFORE the POST) → sent | failed (definite non-delivery) | unconfirmed
// (indeterminate — NEVER auto-retried) | cancelled (sequence abort, restart
// policy, or user dismissal). Rows are kept forever — they are the send audit.
export const SCHEMA_V4 = `
DROP TABLE outbox;
CREATE TABLE outbox (
  local_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'sending', 'sent', 'failed', 'unconfirmed', 'cancelled')),
  sequence_id TEXT,
  part_index INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  text_highlights TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_of TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_outbox_chat ON outbox (account_id, chat_id, created_at);
CREATE INDEX idx_outbox_state ON outbox (state);
`;

// v5 (additive) — PPV send path (SPEC §7, PRD F7): outbox rows carry the paid
// payload. price in dollars (0 = free media message; 3–200 enforced in the
// engine BEFORE enqueue); media_files/previews are JSON arrays of vault ids
// (numbers) and/or single-use `ofapi_media_…` ids (strings); previews must be
// a subset of media_files (engine-enforced invariant).
export const SCHEMA_V5 = `
ALTER TABLE outbox ADD COLUMN price REAL NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN media_files TEXT NOT NULL DEFAULT '[]';
ALTER TABLE outbox ADD COLUMN previews TEXT NOT NULL DEFAULT '[]';
`;

// v6 — per-fan spend window (DESIGN §1 "Fan value in the row"). Rolling raw
// store of account transactions: the sweep fetches the -30days window once,
// then only increments from the newest cached row; the 30-day aggregate is
// computed at read time (chats list JOIN), so the window rolls without
// re-fetching. created_at is normalized ISO-UTC on write (lexicographic
// comparisons). amount is the gross fan payment in dollars (never mills).
export const SCHEMA_V6 = `
CREATE TABLE fan_transactions (
  account_id TEXT NOT NULL,
  tx_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, tx_id)
);
CREATE INDEX idx_fan_tx_fan ON fan_transactions (account_id, fan_id, created_at);
CREATE INDEX idx_fan_tx_created ON fan_transactions (account_id, created_at);
`;

// v7 — Activity panel ledgers (PLAN item 9).
// credit_log becomes per-day per-purpose (requests + credits): the PK change
// requires a rename-copy-drop, with pre-v7 rows preserved under the 'untagged'
// purpose so historical totals survive.
// ai_spend_log is the DURABLE per-day per-feature AI ledger: usage_events is a
// hub upload queue that DRAINS once core is configured, so the panel needs its
// own additive counters (runs / inserted / tokens / cost in integer micro-USD).
export const SCHEMA_V7 = `
ALTER TABLE credit_log RENAME TO credit_log_v6;
CREATE TABLE credit_log (
  day TEXT NOT NULL,
  purpose TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, purpose)
);
INSERT INTO credit_log (day, purpose, used, requests)
  SELECT day, 'untagged', used, 0 FROM credit_log_v6;
DROP TABLE credit_log_v6;

CREATE TABLE ai_spend_log (
  day TEXT NOT NULL,
  feature TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  cache_hit_runs INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_microusd INTEGER NOT NULL DEFAULT 0,
  top_run_microusd INTEGER NOT NULL DEFAULT 0,
  top_run_chat_id TEXT,
  PRIMARY KEY (day, feature)
);
`;

// v8 — Supporters → Spenders rename (owner decision 2026-06-13): carry the
// persisted shelf mapping and the credits-ledger purpose tag across the rename
// so nothing needs re-configuring. The credit merge is defensive — a 'spenders'
// row cannot exist before this migration, but summing keeps it idempotent-safe.
export const SCHEMA_V8 = `
UPDATE OR IGNORE settings SET key = 'spendersListMappings' WHERE key = 'supportersListMappings';
DELETE FROM settings WHERE key = 'supportersListMappings';
INSERT INTO credit_log (day, purpose, used, requests)
  SELECT day, 'spenders', used, requests FROM credit_log WHERE purpose = 'supporters'
  ON CONFLICT (day, purpose) DO UPDATE SET
    used = used + excluded.used,
    requests = requests + excluded.requests;
DELETE FROM credit_log WHERE purpose = 'supporters';
`;

// v9 — 30-day spend figures switch to creator NET (owner decision 2026-06-13).
// fans.spending.total (OnlyFans totalSumm) is already net of the platform 20%
// cut, while transaction `amount` is the gross fan payment — summing gross next
// to a net lifetime made the green figure exceed the total for young fans.
// New `net` column: OFAPI tx.net, fallback 0.8 × amount (mappers). The rebuild
// intentionally discards cached rows (they lack net): latestCreatedAt() turns
// null, so the next sweep's first-run path refetches the full -30days window.
export const SCHEMA_V9 = `
DROP TABLE fan_transactions;
CREATE TABLE fan_transactions (
  account_id TEXT NOT NULL,
  tx_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  amount REAL NOT NULL,
  net REAL NOT NULL,
  type TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, tx_id)
);
CREATE INDEX idx_fan_tx_fan ON fan_transactions (account_id, fan_id, created_at);
CREATE INDEX idx_fan_tx_created ON fan_transactions (account_id, created_at);
`;

// v10 — Spenders data freshness (PLAN item 13). Internal per-fan stamp of the
// last thread tail fetch, written by EVERY fetch path (poll-delta, conversation
// open, quick-look hydrate, scoped refresh) — including fans whose thread came
// back EMPTY, so automatic paths never re-spend on fans who never wrote. The
// stamp is TTL-consulted (5 min) by the hydrate command and the refresh queue;
// it is never rendered per row (owner decision: one per-scope line only).
export const SCHEMA_V10 = `
CREATE TABLE thread_fetch_log (
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (account_id, chat_id)
);
`;

// v11 — core command transport ownership for plain-text sends. The local
// outbox keeps the message text/draft and a durable transport choice; the
// row's UUID is also the core clientCommandId, so a restart can repeat command
// intake idempotently without persisting core payloads or issuing a second
// vendor attempt.
export const SCHEMA_V11 = `
ALTER TABLE outbox ADD COLUMN transport TEXT NOT NULL DEFAULT 'direct'
  CHECK (transport IN ('direct', 'hub'));
`;

// v12 — production custody defaults after core read + text-command live
// acceptance. These are reversible settings, not destructive data changes:
// support can select Direct and/or restore the legacy 10-minute sweep.
export const SCHEMA_V12 = `
INSERT INTO settings (key, value) VALUES
  ('ofapiReadTransport', '"hub"'),
  ('ofapiWriteTransport', '"hub"'),
  ('spendSweepRollbackToLegacy', 'false')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
`;

// v13 — Hub/keyless is now the fail-safe default even for low-level outbox
// inserts that omit an explicit transport. Existing rows keep their stamped
// transport; old pre-v11 rows remain Direct because they were created before the
// core command outbox existed.
export const SCHEMA_V13 = `
CREATE TABLE outbox_next (
  local_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'sending', 'sent', 'failed', 'unconfirmed', 'cancelled')),
  sequence_id TEXT,
  part_index INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  text_highlights TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_of TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  media_files TEXT NOT NULL DEFAULT '[]',
  previews TEXT NOT NULL DEFAULT '[]',
  transport TEXT NOT NULL DEFAULT 'hub' CHECK (transport IN ('direct', 'hub'))
);

INSERT INTO outbox_next (
  local_id, account_id, chat_id, text, state, sequence_id, part_index,
  message_id, error_code, error_message, text_highlights, attempts, retry_of,
  created_at, updated_at, price, media_files, previews, transport
)
SELECT
  local_id, account_id, chat_id, text, state, sequence_id, part_index,
  message_id, error_code, error_message, text_highlights, attempts, retry_of,
  created_at, updated_at, price, media_files, previews, transport
FROM outbox;

DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
CREATE INDEX idx_outbox_chat ON outbox (account_id, chat_id, created_at);
CREATE INDEX idx_outbox_state ON outbox (state);
`;

// v14 — Direct OFAPI writes are no longer an app-supported rollback. Preserve
// old outbox row stamps for audit/recovery, but force any persisted write
// transport preference back to the Hub command path.
export const SCHEMA_V14 = `
INSERT INTO settings (key, value) VALUES ('ofapiWriteTransport', '"hub"')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
`;

export const ALL_TABLES = [
  'settings',
  'accounts',
  'chats',
  'messages',
  'fans',
  'summaries',
  'outbox',
  'media_cache',
  'media_urls',
  'usage_events',
  'credit_log',
  'fan_transactions',
  'ai_spend_log',
  'thread_fetch_log',
] as const;
