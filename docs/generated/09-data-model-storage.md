> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Data Model & Storage (main/db, main/media, main/harvest)

The encrypted local SQLite database, the encrypted media cache + `media://` protocol, and
the one-time local-history harvest to the kernel capture lane. Everything on disk is
encrypted at rest; projections are local caches that can be rebuilt, and (post-migration)
the kernel is the durable source of truth for most facts — the local DB retains history and
serves reads during hub outages.

## Storage engine & encryption at rest

- Engine: `better-sqlite3-multiple-ciphers`, loaded **dynamically** via `createRequire` so
  the native binding enters the process in exactly one place
  (`db/driver.ts:27-48`).
- Encryption: SQLCipher-compatible. On open: `pragma cipher='sqlcipher'` then `pragma
  key='…'` **before** any other statement; a real `SELECT count(*) FROM sqlite_master` then
  throws `SQLITE_NOTADB` on a wrong/missing key; then WAL, `synchronous=NORMAL`,
  `busy_timeout=5000`, `foreign_keys=ON` (`db/database.ts:46-57`).
- **Invariant:** file DBs MUST be encrypted (null/empty key throws, `database.ts:39-41`);
  `:memory:` MUST be unencrypted (tests only).
- **Key:** not derived — a 32-byte random value rendered as 64 hex chars
  (`secrets/keychain.ts:59-61`), generated once via `getOrCreateGeneratedKey('dbKey')`,
  passed in by the composition root (`index.ts:824-831`, DB file `userData/chatgoose.db`).

## Layer composition — driver / database / index

- `db/driver.ts`: pure typed seam (`SqliteDatabase`/`SqliteStatement`/`SqlValue`/`BindParams`
  + `loadSqliteDriver`); no SQL.
- `db/database.ts`: `openDatabase()` (cipher/key/pragmas/migrations), a prepared-statement
  cache, `transaction(fn)`, `schemaVersion()` (reads the `settings.schema_version` JSON row),
  idempotent `close()`.
- `db/index.ts`: `createDataLayer()` opens the DB, wires every query module, and owns the
  `DbChangeBus`. `close()` = `bus.flushNow() → bus.dispose() → db.close()`. Note: `creditLog`,
  `aiSpendLog`, `mediaUrls`, `threadFetchLog` are constructed WITHOUT the bus.

## Migrations — `db/migrations.ts`

`SCHEMA_VERSION = 16` (`migrations.ts:30`). 16 sequential migrations, each in its own
transaction with the version bump; forward-only; refuses to open a DB newer than the build.
The version lives as the runner-owned `settings.schema_version` row (guarded against app
writes). Notable migrations (`schema.ts`): v4 recreates `outbox` for the send state machine;
v7 splits `credit_log` per-day-per-purpose + adds `ai_spend_log`; v8 renames
Supporters→Spenders; v9 rebuilds `fan_transactions` adding `net` (creator-net basis); v11
adds `outbox.transport`; v12 seeds `ofapiReadTransport='hub'`/`ofapiWriteTransport='hub'`;
v13 rebuilds outbox to default transport `'hub'`; v14 forces `ofapiWriteTransport='hub'`; v15
adds `message_guard_events`; **v16 adds `outbox.core_command_id`** (hub command lineage).

## Table catalog — `db/schema.ts`

`ALL_TABLES`: settings, accounts, chats, messages, fans, summaries, outbox, media_cache,
media_urls, usage_events, credit_log, fan_transactions, ai_spend_log, thread_fetch_log,
message_guard_events.

- **settings** — `key TEXT PK`, `value TEXT` (JSON); holds `schema_version` (runner-owned)
  plus every persisted setting and several KV spools (harvest cursors, `hubSync.*`,
  `sync.chatHydration.*`, `spenders.refreshQueue.*`, `aiAcceptanceSpool`).
- **accounts** — `id` PK (`acct_…`), `username`, `display_name`, `avatar` (media:// URL),
  `auth_state`, `raw`, `updated_at`.
- **chats** — PK `(account_id, chat_id)`; `fan_name`, `avatar`, `unread_count`,
  `has_unread_tips`, `last_message_*`, `can_send_message`/`can_not_send_reason`, `raw`;
  index on `(account_id, last_message_at DESC)`.
- **messages** — PK `(account_id, chat_id, message_id)`; `created_at`, `is_sent_by_me`,
  `text_html`/`text_plain`, `price` (REAL, dollars), tip fields, `media` (JSON), `deleted`
  (tombstone), `raw`; index on `(account_id, chat_id, created_at DESC)`.
- **fans** — PK `(account_id, fan_id)`; `username/name/custom_name/avatar/about/last_seen`,
  `spending` (JSON), `subscription` (JSON), `fetched_at`.
- **summaries** — PK `(account_id, fan_id)`; `body`, `model_id`, `personality_id/updated_at`,
  `generated_at`, `spending_verified`/`subscription_verified`, `hub_sync_state` (JSON).
- **outbox** (owner of `07`) — `local_id` PK (= clientCommandId), state CHECK
  `('queued','sending','sent','failed','unconfirmed','cancelled')`, `transport` default `'hub'`
  CHECK `('direct','hub')`, `core_command_id` (v16), `media_files`/`previews`/`price` for PPV,
  `retry_of`, `sequence_id`/`part_index`, attempts/error fields. "Rows kept forever — the send
  audit."
- **media_cache** — base DDL `(url_hash PK, path, bytes, fetched_at)`; `content_type` +
  `last_accessed_at` (+ LRU index) are added **at runtime** by `media/cache.ts`
  `ensureMediaCacheColumns` (a documented temporary split-ownership until a migration owns
  them).
- **media_urls** — `(url_hash PK, url, created_at)` — the registry behind the opaque `media://`
  token.
- **usage_events** — `(client_event_id PK, payload, created_at, attempts)` — the hub upload
  queue (drain-only post-migration; the durable AI ledger is `ai_spend_log`).
- **credit_log** — PK `(day, purpose)`, `used`, `requests` — per-day per-purpose OFAPI credit
  counters (pre-v7 rows under `'untagged'`).
- **fan_transactions** — PK `(account_id, tx_id)`, `fan_id`, `amount` (gross USD), `net`
  (creator net), `type`, `created_at`; rolling 30-day spend, aggregated at read time on `net`.
- **ai_spend_log** — PK `(day, feature)`, counters `runs, cache_hit_runs, inserted, *_tokens,
  cost_microusd` (integer micro-USD), `top_run_microusd/chat_id` — the durable Activity ledger.
- **thread_fetch_log** — PK `(account_id, chat_id)`, `fetched_at` — per-fan last-tail-fetch
  stamp (shared 5-min TTL; written by every fetch path including empty threads).
- **message_guard_events** — full-detail guard audit rows; the `report` read layer omits
  `message_text`/`matched_*`, exposing only hashes/categories/rule ids.

`db/rows.ts` holds the normalized row types + zod decoders: raw OFAPI rides in `raw` JSON on
write, reads are zod-validated (storage = a trust boundary) and never re-expose `raw`; corrupt
JSON degrades to null.

## Query modules — `db/queries/*` (semantics)

- **accounts.ts** — upsert (smart `display_name` preservation; `avatar` COALESCEd),
  `list()` with `unreadTotal = SUM(chats.unread_count)`; publishes `scope:'accounts'`.
- **chats.ts** — chat-list read models joining fan value at read time: `lifetime_spend` from
  `fans.spending.total` and `spend_30d = SUM(fan_transactions.net)` over a rolling 30-day
  window (`SPEND_WINDOW_MS=30d`). **Both figures are creator-NET.** Filters
  `all/unread/with_tips`; pinned then last_message_at DESC; publishes `scope:'chats'`.
- **messages.ts** — `upsertMany` (tombstones stick via `deleted = deleted OR excluded.deleted`),
  `insertManyIfAbsent`, keyset `page` on `(created_at, message_id)`, `markDeleted`, `prune`;
  `MESSAGE_RETENTION_DEFAULT = 50000` (~10× legacy); publishes `scope:'messages'`.
- **outbox.ts** (see `07`) — the send state machine: `insertMany` (default transport `'hub'`),
  atomic `claimNextQueued` (persisted before the POST), guarded `transition`,
  `setCoreCommandId` (write-once), cross-claim guards, boot reconcile. Ordering by `rowid`.
- **fans.ts / fan-transactions.ts** — fan cache + rolling per-fan transaction store; every
  aggregate uses `net`; `dailyTotals` groups by local date; retention prune.
- **summaries.ts** — normalized summary cache keyed `(account, fan_id)`; validity logic lives
  in `@chatgoose/shared`.
- **settings.ts** — KV get/getParsed/set/remove/all; `set`/`remove` guard `schema_version`.
- **credit-log.ts / ai-spend.ts / media-urls.ts / thread-fetch-log.ts** — DB-only (no bus);
  `credit-log.add` upsert-accumulates per `(day, purpose)`; `ai-spend.recordRun` folds
  tokens/cost with a race-free top-run compare-and-swap; `media-urls.register` (latest URL
  wins per hash); `thread-fetch-log.stamp` (consulted with a 5-min TTL; never rendered).
- **message-guard-events.ts** — `insert` (full text local-only, publishes `scope:'guard'`),
  `report` (counts/buckets + a recent list that **omits** message text/matched-strings).

## Change-invalidation bus — `db/change-bus.ts`

`DbChangedEvent = { scope, accountId?, chatId? }` with `scope ∈ accounts|chats|messages|fans|
summaries|settings|outbox|guard`. Publishes coalesce into a Map keyed
`scope|accountId|chatId`, flushed at most once per `DB_CHANGE_FLUSH_MS=50`ms; a faulty
subscriber cannot break the write path. The composition root subscribes and pushes each event
to the renderer over the `db:changed` IPC channel; the renderer turns them into query
invalidations (`10`).

## Media — `main/media/*`

- **cache.ts:** an encrypted disk cache of remote OF media, keyed by
  `sha256(stableRemoteUrlKey)` (query/fragment stripped). Blobs are **AES-256-GCM**
  (`iv(12)‖authTag(16)‖ciphertext`) written mode `0o600`, keyed by the 32-byte keychain
  `mediaCacheKey`; a GCM auth failure (tamper/key-rotate) drops the entry and refetches. Cap
  `MEDIA_CACHE_MAX_BYTES = 2 GB`, **LRU by `last_accessed_at`** (evict oldest-access-first,
  never the just-written hash). Path-safety: row `path` must equal its basename.
- **protocol.ts:** the `media` scheme (privileged, non-standard, `supportFetchAPI+stream`).
  The renderer only ever references `media://<64-hex sha256>` — an opaque, non-reversible
  token. The handler: `parseMediaToken` (accepts only `/^[0-9a-f]{64}$/`) → `registry.lookup`
  → re-check `isAllowedMediaUrl` (https + onlyfans/fansapi only) → cache.get (hit) else
  `fetchRemote` → cache.put → serve. An unknown/off-allowlist token → 404 **without touching
  the network**. Minting (`createToMediaUrl`) registers only allowlisted URLs; the allowlist
  is re-checked before any fetch (SSRF defense-in-depth).
- **vault.ts:** the vault/PPV read service — `listVault`/`listAlbums`/`chatGallery` — minting
  raw OF CDN URLs into `media://` tokens; local file-byte upload is intentionally absent (the
  transport wrapper also fails it closed, `05`).

## One-time local-history harvest — `main/harvest/index.ts` (427 lines)

A **one-time upload of local DB rows** (not OFAPI fetching) to the kernel capture lane
`POST /api/v1/ingest/observations` via `postIngestObservations` (`harvest/index.ts:1-7`).

- **Deterministic ids:** `clientEventId = UUIDv5(machineId:table:rowPk)` (fixed namespace),
  so a re-run/resume re-sends the same ids and the lane's idempotency makes it a no-op —
  over-uploading is free, under-uploading is the only failure mode that matters.
- **Tables harvested** (`HARVEST_TABLES`, `:50-58`): `messages, fan_transactions, outbox,
  message_guard_events, usage_events, ai_spend_log, credit_log`. Excluded per spec:
  chats/accounts/fans (kernel reference data), summaries (already synced), media caches,
  thread_fetch_log (local telemetry), settings (secrets — never leaves).
- **Mechanics:** `run()` (idempotent, single-flight) walks each table by natural-key order in
  `HARVEST_BATCH_SIZE=100` batches, paced `HARVEST_BATCH_PACE_MS=2000`, retries `[5s,30s,120s]`,
  bodies split under `HARVEST_MAX_BATCH_BYTES=900_000` (hub 1 MiB cap). **Cursor/progress
  persist only after a 2xx.** A 400 = contract bug → quarantine file + halt. `pause()` is
  supported; on completion it writes a manifest.
- **Retention interlock:** `isIncomplete()` (started but not completed) **freezes retention
  prunes** in polling-sync (`index.ts:355-359`; consumed as `isPruneFrozen`) — local history
  must reach the kernel before it may age out locally.
- IPC: `query:harvest.status`, `cmd:harvest.start` (fire-and-forget), `cmd:harvest.pause`,
  surfaced in the Danger Zone (`10`).
