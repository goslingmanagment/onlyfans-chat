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
  auth_state TEXT NOT NULL,
  raw TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chats (
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  fan_name TEXT NOT NULL DEFAULT '',
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

export const ALL_TABLES = [
  'settings',
  'accounts',
  'chats',
  'messages',
  'fans',
  'summaries',
  'outbox',
  'media_cache',
  'usage_events',
  'credit_log',
] as const;
