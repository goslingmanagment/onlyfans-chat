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

// v15 — Message Guard local audit (desktop UX + defense-in-depth). Full text is
// stored only in the encrypted local DB for owner review; diagnostics/read APIs
// expose counts, hashes, categories and rule ids, never message_text.
export const SCHEMA_V15 = `
CREATE TABLE message_guard_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_label TEXT,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  transport TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('blocked', 'warned', 'sent_after_warning')),
  policy_version TEXT NOT NULL,
  category TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_label TEXT NOT NULL,
  matched_original TEXT NOT NULL,
  matched_normalized TEXT NOT NULL,
  span_start INTEGER NOT NULL,
  span_end INTEGER NOT NULL,
  message_text TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  media_count INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_message_guard_events_occurred ON message_guard_events (occurred_at);
CREATE INDEX idx_message_guard_events_account_chat ON message_guard_events (account_id, chat_id, occurred_at);
CREATE INDEX idx_message_guard_events_hash ON message_guard_events (message_hash);
`;

// v16 — Core command lineage for Hub sends (audit-final H1). The row's local_id
// is still the stable clientCommandId, but retries must reference the server's
// accepted command id only when intake actually succeeded. Rows that failed
// before core accepted them keep NULL and retry as fresh lineage.
export const SCHEMA_V16 = `
ALTER TABLE outbox ADD COLUMN core_command_id TEXT;
`;

// v17 — durable AI acceptance correlation + dedup. The coordinator's bounded
// in-memory completed-op registry is replaced during runtime rebuilds, but a
// renderer may insert/copy a result afterward. Persist the authoritative
// operation metadata when the first result token is shown, then claim
// accepted_at exactly once before incrementing ai_spend_log.inserted.
export const SCHEMA_V17 = `
CREATE TABLE ai_acceptance_ops (
  operation_id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  day TEXT NOT NULL,
  request_id TEXT,
  account_id TEXT,
  conversation_id TEXT,
  parts TEXT NOT NULL DEFAULT '[]',
  known_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX idx_ai_acceptance_ops_known_at ON ai_acceptance_ops (known_at);
`;

// v18 — durable auxiliary-command lineage for unsend. Unlike text/media sends,
// unsend has no local outbox row to lend it a stable clientCommandId. Persist
// the logical command before intake so a lost response, runtime rebuild, or
// process restart can repeat the SAME idempotent Core command and resume status
// by the accepted command id instead of silently latching in memory.
export const SCHEMA_V18 = `
CREATE TABLE unsend_commands (
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  client_command_id TEXT NOT NULL UNIQUE,
  core_command_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, chat_id, message_id)
);
CREATE INDEX idx_unsend_commands_core_command ON unsend_commands (core_command_id);

-- v17 initially retained accepted reply parts. Once accepted_at is durable the
-- correlation has been consumed, so scrub existing installs as well as relying
-- on the guarded UPSERT/claim behavior for future rows.
UPDATE ai_acceptance_ops
SET parts = '[]'
WHERE accepted_at IS NOT NULL AND parts <> '[]';
`;

// v19 — revision-aware local-history harvest. The immutable fingerprint ledger
// remembers every natural-key/content revision that reached Core; per-source
// triggers make INSERT/UPDATE/DELETE dirtiness observable without trusting
// mutable/reusable rowids. Missing revision settings mean revision 0; the v2
// format marker, not eager settings rows, forces completed v1 installs through
// one full rescan without polluting the normal settings snapshot.
const HARVEST_REVISION_TABLES_V19 = [
  'messages',
  'fan_transactions',
  'outbox',
  'message_guard_events',
  'usage_events',
  'ai_spend_log',
  'credit_log',
] as const;

const HARVEST_REVISION_TRIGGERS_V19 = HARVEST_REVISION_TABLES_V19.flatMap((table) =>
  ['insert', 'update', 'delete'].map((operation) => `
CREATE TRIGGER harvest_revision_${table}_${operation}
AFTER ${operation.toUpperCase()} ON ${table}
BEGIN
  INSERT INTO settings (key, value)
  VALUES ('harvest.revision.${table}', '1')
  ON CONFLICT (key) DO UPDATE SET
    value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);
END;`),
).join('\n');

export const SCHEMA_V19 = `
CREATE TABLE harvest_uploaded_revisions (
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (table_name, row_key, content_hash)
);

${HARVEST_REVISION_TRIGGERS_V19}
`;

// v20 — distinguish vendor authentication health from the active Hub
// credential's account grant. Revoked rows and all dependent cache stay local,
// but renderer-facing account lists can hide them without hiding a currently
// granted account that merely needs re-authentication.
export const SCHEMA_V20 = `
ALTER TABLE accounts ADD COLUMN grant_state TEXT NOT NULL DEFAULT 'granted'
  CHECK (grant_state IN ('granted', 'revoked'));
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
  'ai_acceptance_ops',
  'unsend_commands',
  'composer_actions',
  'thread_fetch_log',
  'message_guard_events',
  'harvest_uploaded_revisions',
  'sync_intents',
] as const;

// Preserve the exact new send payload and every closed action's logical identity.
export const SCHEMA_V21 = `
ALTER TABLE outbox ADD COLUMN composer TEXT;
ALTER TABLE chats ADD COLUMN locally_hidden INTEGER NOT NULL DEFAULT 0;
CREATE TABLE composer_actions (
  client_command_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, chat_id TEXT NOT NULL,
  action TEXT NOT NULL, action_key TEXT NOT NULL, core_command_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','confirmed','failed','unconfirmed')),
  result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX composer_actions_pending ON composer_actions(account_id, chat_id, action_key)
  WHERE state IN ('pending','unconfirmed');
`;

// v22 (review #27, fix 2) — a locally hidden chat must resurface when the
// conversation moves on (OnlyFans itself un-hides on a new message). The hide
// moment is recorded so the chats upsert can clear the flag exactly when the
// head advances past it; rows hidden before this column existed are stamped
// with their last write so any newer head un-hides them.
export const SCHEMA_V22 = `
ALTER TABLE chats ADD COLUMN locally_hidden_at TEXT;
UPDATE chats SET locally_hidden_at = updated_at WHERE locally_hidden = 1 AND locally_hidden_at IS NULL;
`;

// v23: outreach custody is command metadata, independent of composer options.
export const SCHEMA_V23 = `
ALTER TABLE outbox ADD COLUMN outreach_purpose TEXT CHECK (outreach_purpose IS NULL OR outreach_purpose = 'new-follower');
`;

// v24 (D38) — the startup/list-freshness rework.
//
// `sync_baseline_message_id` is the chat-list DELTA DETECTOR, split from the UI
// head (`last_message_id`). A page-1 read is now written the moment it arrives
// so the inbox paints at once; the detector only advances after the automatic
// body delta for that chat has really reached the advertised head (auto-read
// on) or at once (list-only). Existing rows start with detector = head, which
// is exactly what the previous single column meant.
//
// `sync_intents` holds the durable follow-up reads a hub frame obliges, written
// in the SAME transaction as the frame's local state and its v2 cursor. A row
// exists only while the obligation is open (closing deletes it); '' stands for
// "not applicable" so the natural key stays UNIQUE (NULLs are distinct).
//   account_list — «this account's list is not older than not_before_ms»;
//   chat_message — «message message_id of chat chat_id is visible locally»;
//   delete_head  — «re-check a cached head that may still show message_id».
export const SCHEMA_V24 = `
ALTER TABLE chats ADD COLUMN sync_baseline_message_id TEXT;
UPDATE chats SET sync_baseline_message_id = last_message_id;
CREATE TABLE sync_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('account_list', 'chat_message', 'delete_head')),
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL DEFAULT '',
  message_id TEXT NOT NULL DEFAULT '',
  not_before_ms INTEGER NOT NULL,
  reason TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_ms INTEGER NOT NULL,
  created_ms INTEGER NOT NULL,
  UNIQUE (kind, account_id, chat_id, message_id)
);
CREATE INDEX idx_sync_intents_account ON sync_intents (account_id, kind);
`;
