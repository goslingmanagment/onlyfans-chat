> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# 09 — Data Model & Local Storage

## Scope

This doc maps the desktop app's **local persistence layer**: the single encrypted SQLite database (`apps/desktop/src/main/db/**`) and the encrypted on-disk media cache with its serving protocol (`apps/desktop/src/main/media/**`). It covers the SQLite driver seam and cipher/key application, the schema and its migration history, the row types and read-time decoding, every query module and the tables/columns each touches, the DB-change invalidation bus, and the media cache / vault / `media://` protocol. The centerpiece is the **table catalog** (§4).

Everything here runs in the **Electron main process** only. The encryption keys come from the keychain — key generation and `safeStorage` are owned by **04-main-bootstrap-ipc-settings.md** (`secrets/keychain.ts`); this doc describes only how the keys are *consumed* by the DB and media cache. The composition-root wiring (which path constructs the data layer and registers the protocol) lives in `apps/desktop/src/main/index.ts` and is owned by **04**. Who *writes* each cached row (the read/sync mappers) is owned by **06-sync-and-reads.md**; the outbox table's state machine and send semantics are owned by **07-send-engine-outbox.md** (this doc treats it as a table + query surface only); the AI pipeline that fills `ai_spend_log`/`usage_events` is owned by **08-ai-pipeline.md**; the usage upload queue drain (`hub/usage-store.ts`) and the Activity/credit surfaces are owned by **11-hub-monetization-activity.md**; renderer consumption of `db:changed` events is owned by **10-renderer-ui.md**. The `preload/contract.ts` view-models the row types serialize toward are catalogued in **02-external-boundaries.md**.

---

## 1. Module surface & composition

`apps/desktop/src/main/db/index.ts` is the DB module's public face. `createDataLayer(options)` (`index.ts:55`) opens the database once and constructs a `DataLayer` object (`index.ts:36`) that bundles:

- the raw handle `db` (`ChatGooseDb`),
- the change bus `bus`,
- and one query object per table family: `accounts`, `chats`, `messages`, `fans`, `fanTransactions`, `summaries`, `settings`, `outbox`, `creditLog`, `aiSpendLog`, `mediaUrls`, `threadFetchLog`, `messageGuardEvents`.

`close()` drains and disposes the bus, then closes the handle (`index.ts:74`). `index.ts` also re-exports every row type, query factory, migration constant, and the driver types — this is the single import point for the rest of main.

**Composition root** (`apps/desktop/src/main/index.ts`, owned by 04): at boot it fetches two 32-byte random keys as 64-char hex strings via `keychain.getOrCreateGeneratedKey('dbKey')` and `('mediaCacheKey')` (`index.ts:830-831`; each key is `randomBytes(32).toString('hex')` — `secrets/keychain.ts:43-44`), then calls `createDataLayer({ driverPath: 'better-sqlite3-multiple-ciphers', filePath: join(userData, 'chatgoose.db'), encryptionKey: dbKey })` (`index.ts:833-837`). The media cache/protocol is wired **separately** (§8), not through `createDataLayer`.

**Two query objects are constructed without a bus** (they emit no `db:changed` events): `creditLog`, `aiSpendLog`, `mediaUrls`, `threadFetchLog` (`index.ts:69-72`) — actually four; the remaining nine take the bus. The `media_cache` table is not represented in the `DataLayer` at all; its queries are built by a different factory in the media module (§8.1).

---

## 2. Driver seam & connection setup

### 2.1 `db/driver.ts` — the native-binding seam

`driver.ts` is a typed structural wrapper over `better-sqlite3-multiple-ciphers`. Nothing imports the native module statically. `loadSqliteDriver(driverPath)` (`driver.ts:38`) does a dynamic `require` (via `createRequire`) of a caller-named module, unwraps `.default`, and runtime-narrows the result to a constructor (`driver.ts:29`, throws if not a function). This lets the Electron-ABI build load at runtime while tests inject a Node-ABI alias by name (`TEST_DRIVER` in `tests/db/helpers.ts`). Types: `SqlValue = string | number | bigint | null`, `BindParams = Record<string, SqlValue>`, `SqliteStatement` (`run`/`get`/`all` with named `@params`), `SqliteDatabase` (`prepare`/`exec`/`pragma`/`transaction`/`close`). The `transaction<Result>` wrapper is documented as savepoint-nested when re-entered (`driver.ts:20-21`).

### 2.2 `db/database.ts` — open, key, migrate, wrap

`openDatabase(options)` (`database.ts:33`) is the only place the cipher is applied. `OpenDatabaseOptions` requires `driverPath`, `filePath`, and `encryptionKey: string | null`.

Guards (`database.ts:36-41`):
- `':memory:'` **must** pass `encryptionKey: null` (in-memory DBs cannot be keyed — tests only).
- A file DB **must** pass a non-empty key (the encryption-at-rest invariant); a null/empty key throws.

Cipher flow, order-sensitive (`database.ts:46-52`):
1. `PRAGMA cipher='sqlcipher'` — cipher selection first.
2. `PRAGMA key='<key>'` — key next; the value is single-quote-escaped by `quotePragmaValue` (`database.ts:29`). The dbKey **hex string is used directly as the SQLCipher passphrase** (not decoded to bytes).
3. A probe `SELECT count(*) FROM sqlite_master` — the first real read, which throws `SQLITE_NOTADB` on a wrong/missing key.

Then connection PRAGMAs (`database.ts:54-57`): `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`. **Discrepancy worth noting:** `foreign_keys = ON` is set but **no table in the schema declares any `FOREIGN KEY` constraint** (verified: 0 matches in `schema.ts`) — all cross-table relations are by convention on composite keys, not enforced. So the PRAGMA is effectively inert.

`runMigrations` runs inside the same `try` (`database.ts:59`); any failure closes the handle and rethrows (`database.ts:60-63`).

`wrap(db)` (`database.ts:68`) returns the `ChatGooseDb` facade. Notable behaviors:
- **Prepared-statement cache**: `prepare(sql)` memoizes statements in a `Map` keyed by the exact SQL string, forever, until `close()` clears it (`database.ts:69-80, 108`). Every query module relies on this — they re-`prepare` the same literal each call and get the cached statement.
- `transaction(fn)` immediately invokes the better-sqlite3 transaction (`database.ts:90-92`).
- `schemaVersion()` reads the `schema_version` settings row and JSON-parses it (`database.ts:93-104`) — a **second, independent** reader of the same value that `migrations.readSchemaVersion` also reads (§3).
- `close()` is idempotent via an `open` flag (`database.ts:105`).

---

## 3. Schema & migrations

### 3.1 Mechanism (`db/migrations.ts`)

`SCHEMA_VERSION = 16` (`migrations.ts:30`). `MIGRATIONS` is an array of `{ toVersion, up(db) }`, each `up` executing one `SCHEMA_Vn` DDL string (`migrations.ts:32-129`). The version lives as a **`settings` row** keyed `schema_version` whose value is a JSON-stringified integer (`migrations.ts:131`, `writeSchemaVersion` at `:152`), so it migrates alongside the data it describes.

`runMigrations(db, migrations)` (`migrations.ts:174`):
- `validateSequence` asserts `toVersion === index + 1` (strictly sequential from 1; `migrations.ts:159`).
- Reads the current version via `readSchemaVersion` (`migrations.ts:140`), which first `CREATE TABLE IF NOT EXISTS settings` (`ensureSettingsTable`, `:136`), returns `0` when the row is absent, and zod-validates the stored value (`z.number().int().nonnegative()`).
- Throws if the stored version is **newer** than this build's latest (downgrade guard, `migrations.ts:181`).
- Applies each pending migration **inside its own transaction** together with the version bump (`migrations.ts:190-193`) — a mid-migration failure rolls back both DDL and version. Idempotent: an up-to-date DB is untouched.

`ALL_TABLES` (`schema.ts:407`) is the canonical 15-name list: `settings, accounts, chats, messages, fans, summaries, outbox, media_cache, media_urls, usage_events, credit_log, fan_transactions, ai_spend_log, thread_fetch_log, message_guard_events`.

### 3.2 Migration history (what each version did)

| Ver | File const | Change |
|----|-----------|--------|
| 1 | `SCHEMA_V1` | Initial DDL: `settings, accounts, chats, messages, fans, summaries, outbox(v1 shape), media_cache, usage_events, credit_log(day,used)` + indices. |
| 2 | `SCHEMA_V2` | Add `media_urls(url_hash, url, created_at)` — the `media://` token registry. |
| 3 | `SCHEMA_V3` | `chats ADD COLUMN last_message_id` — the delta detector's own baseline (list hydration carries no message bodies). |
| 4 | `SCHEMA_V4` | **Drop & recreate `outbox`** for the send state machine (states `queued/sending/sent/failed/unconfirmed/cancelled`, `sequence_id`, `part_index`, `text_highlights`, `attempts`, `retry_of`) + `idx_outbox_state`. Safe drop: no send path existed at v1. |
| 5 | `SCHEMA_V5` | `outbox ADD price, media_files, previews` (PPV payload; JSON arrays of vault ids/`ofapi_media_…`). |
| 6 | `SCHEMA_V6` | Add `fan_transactions(account_id, tx_id, fan_id, amount, type, created_at)` + two indices — rolling 30-day spend window. |
| 7 | `SCHEMA_V7` | Rebuild `credit_log` to `(day, purpose, used, requests)` PK `(day,purpose)`, migrating pre-v7 rows under purpose `'untagged'`. Add `ai_spend_log(day, feature, …)`. |
| 8 | `SCHEMA_V8` | Supporters→Spenders rename: rename the `supportersListMappings` settings key to `spendersListMappings`; merge `credit_log` purpose `'supporters'`→`'spenders'` (summing, idempotent-safe). |
| 9 | `SCHEMA_V9` | **Drop & recreate `fan_transactions`** adding `net REAL NOT NULL`. Intentionally discards cached rows (they lack `net`), forcing the next sweep to refetch the full −30d window. |
| 10 | `SCHEMA_V10` | Add `thread_fetch_log(account_id, chat_id, fetched_at)` — per-fan tail-fetch freshness stamp. |
| 11 | `SCHEMA_V11` | `outbox ADD transport TEXT DEFAULT 'direct' CHECK(direct|hub)` — command transport ownership. |
| 12 | `SCHEMA_V12` | Seed settings: `ofapiReadTransport='hub'`, `ofapiWriteTransport='hub'`, `spendSweepRollbackToLegacy=false` (upsert). |
| 13 | `SCHEMA_V13` | Rebuild `outbox` via `outbox_next` copy so the `transport` default flips to `'hub'`; existing rows keep their stamped transport, pre-v11 rows stay `'direct'`. |
| 14 | `SCHEMA_V14` | Force settings `ofapiWriteTransport='hub'` (Direct write path removed as an option). |
| 15 | `SCHEMA_V15` | Add `message_guard_events(…)` + three indices — Message Guard local audit (full text kept only here). |
| 16 | `SCHEMA_V16` | `outbox ADD core_command_id TEXT` — Hub-accepted command lineage for retries. |

Notes: the `outbox` table has been rebuilt three times (v4, v13) and altered twice (v5, v11, v16); its effective final shape is enumerated in §4. `credit_log` and `fan_transactions` were each rebuilt once (v7/v8, v9). The v13 copy preserves all columns explicitly (`schema.ts:342-351`).

---

## 4. Table catalog (the centerpiece)

Column types below are the **effective final** types after all migrations. "Source" distinguishes tables that **cache OnlyFans data** (repopulated by sync; safe to lose) from **app-local** tables (settings/audit/spend/ledgers/protocol plumbing). Every claim is grounded in `schema.ts` (DDL) and the named query module (readers/writers). All `db:changed` scopes are from §7.

### 4.1 `settings` — app-local (key/value JSON store)

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT NOT NULL | JSON-encoded value |

- **DDL**: `schema.ts:7` (v1). **Writers/readers**: `queries/settings.ts` (`get`/`getParsed`/`set`/`remove`/`all`); also `migrations.ts` (`schema_version` + v12/v14 seed rows) and the composition root's `createSettingsStore` (04).
- `schema_version` is stored here but **guarded** against `settings.set`/`remove` (`settings.ts:24` `guardKey`); it is owned by the migration runner. `settings.all()` excludes it (`settings.ts:85`).
- Reads are zod-validated against caller-supplied schemas (`getParsed`); a value failing the schema reads as `undefined` (`settings.ts:46-59`). `set` emits `db:changed{scope:'settings'}`.

### 4.2 `accounts` — caches OFAPI connected-account data

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | OFAPI `acct_…` id |
| `username` | TEXT NOT NULL | |
| `display_name` | TEXT NOT NULL DEFAULT '' | |
| `avatar` | TEXT (nullable) | pre-mapped `media://` URL |
| `auth_state` | TEXT NOT NULL | `authenticated`/`session_expired`/`unauthenticated` |
| `raw` | TEXT NOT NULL | raw OFAPI JSON; never re-exposed on read |
| `updated_at` | TEXT NOT NULL | ISO, set on every write |

- **DDL**: `schema.ts:12` (v1). **Module**: `queries/accounts.ts`. `upsert`/`upsertMany` use an `ON CONFLICT DO UPDATE` with **display-name preservation logic** (`accounts.ts:14-21`): a blank incoming name, or an incoming name equal to the username when a real prior display name exists, keeps the old name; `avatar` uses `COALESCE(excluded, existing)`. `setAuthState` updates only `auth_state`.
- **Reads**: `get`, `list` (`list` also computes `unread_total = SUM(chats.unread_count)` via a correlated subquery, ordered by `username`; `accounts.ts:82-95`). Emits `db:changed{scope:'accounts', accountId}`.

### 4.3 `chats` — caches OF conversation-list data

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT NOT NULL | PK part |
| `chat_id` | TEXT NOT NULL | PK part; `chat_id === fan.id` (numeric OF id) |
| `fan_name` | TEXT NOT NULL DEFAULT '' | |
| `avatar` | TEXT (nullable) | `media://` URL |
| `unread_count` | INTEGER NOT NULL DEFAULT 0 | |
| `has_unread_tips` | INTEGER NOT NULL DEFAULT 0 | bool |
| `last_message_at` | TEXT (nullable) | ISO |
| `last_message_preview` | TEXT NOT NULL DEFAULT '' | |
| `last_message_is_sent_by_me` | INTEGER NOT NULL DEFAULT 0 | bool |
| `last_message_id` | TEXT (nullable, v3) | delta-detector baseline |
| `last_read_message_id` | TEXT (nullable) | |
| `pinned` | INTEGER NOT NULL DEFAULT 0 | bool |
| `can_send_message` | INTEGER NOT NULL DEFAULT 1 | bool |
| `can_not_send_reason` | TEXT (nullable) | |
| `raw` | TEXT NOT NULL | raw JSON; not re-exposed |
| `updated_at` | TEXT NOT NULL | ISO |

- **PK** `(account_id, chat_id)`. **Index** `idx_chats_account_recent (account_id, last_message_at DESC)` (`schema.ts:40`). **DDL**: `schema.ts:22` (v1) + v3 column.
- **Module**: `queries/chats.ts`. `upsert`/`upsertMany` (`chats.ts:104`). `get`/`getMany` (batched, chunked via `chunked()`). `list`/`search` are **read models** that JOIN fan-value figures at read time (`chats.ts:35-43`): `lifetime_spend` from `fans.spending.total` JSON (guarded by `json_valid`, `CAST(... AS REAL)`), and `spend_30d` = `SUM(fan_transactions.net)` over a rolling read-time cutoff (`SPEND_WINDOW_MS = 30 days`, `chats.ts:16`). Ordering: `pinned DESC, last_message_at DESC` (`ORDER`, `chats.ts:71`). Filters `all`/`unread`/`with_tips` (`FILTER_WHERE`, `chats.ts:73`). `search` does an ASCII-`LIKE` substring on `fan_name` with `escapeLike` (`chats.ts:83`). `list` fetches `limit+1` to compute `hasMore`.
- These joined figures are **never stored** in `chats` — the `ChatListRow` type (`rows.ts:132`) carries `lifetimeSpend`/`spend30d` only in the read model. Emits `db:changed{scope:'chats', accountId}`.

### 4.4 `messages` — caches OF messages

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT NOT NULL | PK part |
| `chat_id` | TEXT NOT NULL | PK part |
| `message_id` | TEXT NOT NULL | PK part (numeric OF id as text) |
| `created_at` | TEXT NOT NULL | ISO |
| `is_sent_by_me` | INTEGER NOT NULL DEFAULT 0 | bool |
| `text_html` | TEXT NOT NULL DEFAULT '' | |
| `text_plain` | TEXT NOT NULL DEFAULT '' | |
| `price` | REAL NOT NULL DEFAULT 0 | dollars |
| `is_opened` | INTEGER (nullable) | tri-state bool |
| `is_new` | INTEGER NOT NULL DEFAULT 0 | bool |
| `is_tip` | INTEGER NOT NULL DEFAULT 0 | bool |
| `tip_amount` | REAL (nullable) | |
| `tip_text` | TEXT (nullable) | |
| `reply_to` | TEXT (nullable) | JSON `{sender, textPreview}` |
| `media` | TEXT NOT NULL DEFAULT '[]' | JSON array of media VMs |
| `deleted` | INTEGER NOT NULL DEFAULT 0 | tombstone flag |
| `raw` | TEXT NOT NULL | raw JSON; not re-exposed |

- **PK** `(account_id, chat_id, message_id)`. **Index** `idx_messages_chat_recent (account_id, chat_id, created_at DESC)` (`schema.ts:62`). **DDL**: `schema.ts:42` (v1).
- **Module**: `queries/messages.ts`. `MESSAGE_RETENTION_DEFAULT = 5000` (`messages.ts:13`). Two write paths: `upsertMany` (full upsert, but `deleted = messages.deleted OR excluded.deleted` — a tombstone can never be un-set by a later sync, `messages.ts:40`) and `insertManyIfAbsent` (`ON CONFLICT DO NOTHING`, returns count inserted, publishes only for actually-inserted rows, `messages.ts:145`).
- **Reads**: `get`, `oldest`, `page` (keyset pagination — descending by `created_at, CAST(message_id AS INTEGER), message_id`, then `.reverse()`d to ascending; anchored `beforeId` uses a compound comparison casting ids to INTEGER with a string tiebreak, `messages.ts:210-223`), `count`. Two batched Spenders-board helpers: `latestBySender` (per-chat `MAX(created_at)` split by `is_sent_by_me`, excludes `deleted`, `messages.ts:232`) and `newestPerChat` (newest non-deleted `text_plain`+sender per chat — **relies on SQLite's bare-column-with-`MAX()` aggregate semantics**, documented in-code at `messages.ts:276-277`).
- **Mutations**: `markDeleted` (sets `deleted=1`, keeps rows) and `prune` (deletes rows beyond newest `keep`; validates `keep` is a non-negative integer, `messages.ts:318`). Emits `db:changed{scope:'messages', accountId, chatId}`.

### 4.5 `fans` — caches OF fan-profile data

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT NOT NULL | PK part |
| `fan_id` | TEXT NOT NULL | PK part (= `chat_id`) |
| `username` | TEXT NOT NULL DEFAULT '' | |
| `name` | TEXT NOT NULL DEFAULT '' | |
| `custom_name` | TEXT (nullable) | chatter-set alias |
| `avatar` | TEXT (nullable) | `media://` URL |
| `about` | TEXT (nullable) | bio |
| `last_seen` | TEXT (nullable) | ISO |
| `spending` | TEXT (nullable) | JSON `{total, subscriptions, tips, messages, posts, streams}` |
| `subscription` | TEXT (nullable) | JSON `{status, priceUsd, subscribedAt, renewsAt, autoRenewOff, durationLabel}` |
| `fetched_at` | TEXT NOT NULL | ISO |

- **PK** `(account_id, fan_id)`. No index beyond the PK. No `raw` column (spending/subscription JSON stored directly). **DDL**: `schema.ts:64` (v1).
- **Module**: `queries/fans.ts`. `upsert`, `get`, `getMany` (batched/chunked, `SQL_IN_CHUNK = 400`, `fans.ts:38` — this module also exports the shared `chunked()` helper reused by chats/messages/thread-fetch-log). `listSpenderIds` returns fans with `spending.total > 0` (json-guarded, the "Без тира" candidate pool, `fans.ts:95`). `spending.total` is also JOINed by `chats.list` as `lifetime_spend`. Emits `db:changed{scope:'fans', accountId}`.

### 4.6 `fan_transactions` — caches OF transaction data (rolling 30-day window)

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT NOT NULL | PK part |
| `tx_id` | TEXT NOT NULL | PK part |
| `fan_id` | TEXT NOT NULL | |
| `amount` | REAL NOT NULL | gross fan payment, dollars |
| `net` | REAL NOT NULL (v9) | creator net = `tx.net` or `0.8×amount` |
| `type` | TEXT (nullable) | `subs`/`tips`/`post`/`chat_messages`/`stream` |
| `created_at` | TEXT NOT NULL | normalized ISO-UTC (lexicographic-sortable) |

- **PK** `(account_id, tx_id)`. **Indices** `idx_fan_tx_fan (account_id, fan_id, created_at)`, `idx_fan_tx_created (account_id, created_at)` (`schema.ts:275-276`). **DDL**: `schema.ts:190` (v6) rebuilt at v9.
- **Module**: `queries/fan-transactions.ts`. `upsertMany` (idempotent by `(account_id, tx_id)`). `latestCreatedAt` = the incremental-sweep cursor (`MAX(created_at)`). All aggregates **sum `net`** (owner decision: every money figure is net): `sumByFanSince`, `statsByFanSince` (SUM+COUNT), `dailyTotals` (per **local**-calendar-day via `date(created_at,'localtime')`). `pruneOlderThan` drops rows past retention.
- **Discrepancy/behavior note**: `upsertMany` publishes `db:changed{scope:'chats', accountId}` (`fan-transactions.ts:73-75`) — there is **no** `fan_transactions`/`fans` scope; the visible artifact is the chat-list 30-day figure, so it invalidates `chats`.

### 4.7 `summaries` — app-derived AI output cache

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT NOT NULL | PK part |
| `fan_id` | TEXT NOT NULL | PK part |
| `body` | TEXT NOT NULL | generated summary text |
| `model_id` | TEXT (nullable) | |
| `personality_id` | TEXT NOT NULL | |
| `personality_updated_at` | INTEGER NOT NULL | epoch ms |
| `generated_at` | INTEGER NOT NULL | epoch ms |
| `spending_verified` | INTEGER (nullable) | bool-or-null |
| `subscription_verified` | INTEGER (nullable) | bool-or-null |
| `hub_sync_state` | TEXT (nullable) | opaque hub state JSON |

- **PK** `(account_id, fan_id)`. **DDL**: `schema.ts:79` (v1). **Module**: `queries/summaries.ts`. `get` rebuilds a candidate object and passes it through `normalizeSummaryCacheEntry` from `@chatgoose/shared/summary/validity` (validity/staleness logic lives in shared — see **03**); a corrupt row or `hub_sync_state` that fails `JSON.parse` degrades to null/absent (`summaries.ts:48-77`). `put` upserts, `remove` deletes (refresh = delete+regenerate). Emits `db:changed{scope:'summaries', accountId}`.

### 4.8 `outbox` — app-local send audit (owned by 07)

Effective final columns (post-v16): `local_id` (TEXT PK), `account_id`, `chat_id`, `text`, `state` (TEXT CHECK `queued|sending|sent|failed|unconfirmed|cancelled`), `sequence_id` (nullable), `part_index` (INTEGER DEFAULT 0), `message_id` (nullable), `error_code` (nullable), `error_message` (nullable), `text_highlights` (TEXT JSON DEFAULT '[]'), `attempts` (INTEGER DEFAULT 0), `retry_of` (nullable), `created_at`, `updated_at`, `price` (REAL DEFAULT 0, v5), `media_files` (TEXT JSON DEFAULT '[]', v5), `previews` (TEXT JSON DEFAULT '[]', v5), `transport` (TEXT DEFAULT 'hub' CHECK `direct|hub`, v11/v13), `core_command_id` (nullable, v16). **Indices** `idx_outbox_chat (account_id, chat_id, created_at)`, `idx_outbox_state (state)`.

- **Module**: `queries/outbox.ts` (`OutboxQueries`). This doc catalogs the table and query surface; the **state machine, claim protocol, and send invariants are owned by 07**. Key storage facts: rows enter only as `'queued'` (`INSERT_SQL`, `outbox.ts:173`); `insertMany` defaults `transport` to `'hub'` when omitted (`outbox.ts:208`). `transition` is a guarded `UPDATE ... WHERE state IN (from)` returning whether it wrote (`outbox.ts:231`). `claimNextQueued` wraps a nested transaction that selects the oldest `queued` row by **`rowid`** (insertion order, not `created_at`) and flips it to `'sending'` with `attempts+1` (`outbox.ts:321-350`). `decodeOutboxRow` (`outbox.ts:106`) zod-parses with `transport` defaulting to `'direct'` and `core_command_id` defaulting to `null` for pre-migration audit rows. Emits `db:changed{scope:'outbox', accountId, chatId}`.

### 4.9 `media_cache` — app-local encrypted-blob bookkeeping (managed by the media module, NOT db/queries)

Effective final columns: `url_hash` (TEXT PK), `path` (TEXT NOT NULL), `bytes` (INTEGER NOT NULL), `fetched_at` (TEXT NOT NULL), **plus** `content_type` (TEXT, added at runtime) and `last_accessed_at` (TEXT NOT NULL DEFAULT ''), plus index `idx_media_cache_last_access (last_accessed_at)`.

- **Discrepancy (important)**: the base DDL (`schema.ts:106`, v1) declares only the first four columns and **no migration ever adds `content_type`/`last_accessed_at`**. Those two columns and the LRU index are added at runtime by `ensureMediaCacheColumns` in `media/cache.ts:247` (idempotent `CREATE TABLE IF NOT EXISTS` + conditional `ALTER TABLE` gated on `pragma_table_info`). The `''` default on `last_accessed_at` sorts legacy rows first under LRU (`cache.ts:265`). So the effective schema of this table is defined jointly by the migration DDL and the media module — it is the one table whose shape is not fully described by `schema.ts` + `migrations.ts`.
- The queries are built by `createSqliteMediaCacheQueries(db)` (`cache.ts:272`), passed the same `data.db` handle at the composition root (`index.ts:937`) — **not** wired into `createDataLayer`/`DataLayer`. Methods: `get`/`upsert`/`touch`/`delete`/`totalBytes`/`evictionCandidates`/`clear` (§8.1). No `db:changed` scope.

### 4.10 `media_urls` — app-local `media://` token registry

| Column | Type | Notes |
|---|---|---|
| `url_hash` | TEXT PK | sha256 hex of the stable remote URL (= the token) |
| `url` | TEXT NOT NULL | latest signed remote URL |
| `created_at` | TEXT NOT NULL | ISO |

- **DDL**: `schema.ts:130` (v2). **Module**: `queries/media-urls.ts` (`MediaUrlsQueries`: `register`/`lookup`/`delete`/`clear`). `register` upserts with **latest-URL-wins** (`ON CONFLICT ... SET url = excluded.url`, `media-urls.ts:26`). No `db:changed` scope (protocol plumbing; nothing renders these rows). This is the security seam behind `media://` (§8.3): the protocol handler resolves **only** hashes registered here. Written indirectly by the sync mappers and vault service via `createToMediaUrl` (§8.3, **06**/**05**).

### 4.11 `usage_events` — app-local hub-upload queue (no db/queries module)

| Column | Type | Notes |
|---|---|---|
| `client_event_id` | TEXT PK | dedupe key |
| `payload` | TEXT NOT NULL | JSON usage event |
| `created_at` | TEXT NOT NULL | ISO |
| `attempts` | INTEGER NOT NULL DEFAULT 0 | upload attempts |

- **DDL**: `schema.ts:113` (v1). **No query module in `db/queries/`.** Accessed via raw SQL from: `ai/coordinator.ts:611` (INSERT at operation completion — **08**), `hub/usage-store.ts` (the drain queue: list/insert/delete/attempt-increment/quarantine via `json_set` — **11**), and `ipc/activity.ts` / `ipc/handlers.ts` (counts + feedback marking). Rows are "parked" until the hub is configured, then drained. No `db:changed` scope; the renderer learns of pending count via `sync:event` frames (**06**/**11**).

### 4.12 `credit_log` — app-local OFAPI credit ledger

| Column | Type | Notes |
|---|---|---|
| `day` | TEXT NOT NULL | UTC `YYYY-MM-DD`, PK part |
| `purpose` | TEXT NOT NULL | PK part; pre-v7 rows = `'untagged'` |
| `used` | INTEGER NOT NULL DEFAULT 0 | credits |
| `requests` | INTEGER NOT NULL DEFAULT 0 | request count |

- **PK** `(day, purpose)`. **DDL**: v1 (`day,used`) rebuilt at v7 (`schema.ts:211`), data-migrated at v8. **Module**: `queries/credit-log.ts`. `add` validates the day pattern (`/^\d{4}-\d{2}-\d{2}$/`), non-empty purpose, non-negative finite credits/requests, then upserts additively (`credit-log.ts:39`). Reads: `usedOn` (SUM over purposes), `byPurposeOn`, `totalsSince`. **No `db:changed` scope** — the renderer refreshes via `sync:event` `creditBalance` frames (`credit-log.ts:2-4`; consumer in **11**).

### 4.13 `ai_spend_log` — app-local durable AI spend ledger

| Column | Type | Notes |
|---|---|---|
| `day` | TEXT NOT NULL | UTC `YYYY-MM-DD`, PK part |
| `feature` | TEXT NOT NULL | PK part |
| `runs` | INTEGER DEFAULT 0 | |
| `cache_hit_runs` | INTEGER DEFAULT 0 | |
| `inserted` | INTEGER DEFAULT 0 | accepted drafts |
| `input_tokens` | INTEGER DEFAULT 0 | |
| `cache_write_tokens` | INTEGER DEFAULT 0 | |
| `cache_read_tokens` | INTEGER DEFAULT 0 | |
| `output_tokens` | INTEGER DEFAULT 0 | |
| `cost_microusd` | INTEGER DEFAULT 0 | integer micro-USD |
| `top_run_microusd` | INTEGER DEFAULT 0 | most-expensive single run |
| `top_run_chat_id` | TEXT (nullable) | chat of the top run |

- **PK** `(day, feature)`. **DDL**: `schema.ts:224` (v7). **Module**: `queries/ai-spend.ts`. `recordRun` upserts additively; the **top-run compare-and-swap** (`top_run_chat_id`/`top_run_microusd`) is race-free within one `UPDATE SET` because SQLite reads the pre-update row (`ai-spend.ts:80-83`; noted at `:5`). `markInserted` bumps `inserted` (upsert-safe across a UTC day flip). `rowsSince` maps to `AiSpendDayRow` (shared type). Costs rounded/clamped `≥0`. **No `db:changed` scope** (Activity panel aggregates — **11**). This is the durable counterpart to the draining `usage_events`.

### 4.14 `thread_fetch_log` — app-local freshness stamp

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT NOT NULL | PK part |
| `chat_id` | TEXT NOT NULL | PK part |
| `fetched_at` | TEXT NOT NULL | ISO of last tail fetch |

- **PK** `(account_id, chat_id)`. **DDL**: `schema.ts:285` (v10). **Module**: `queries/thread-fetch-log.ts` (`stamp`/`get`/`getMany` batched). Stamped by **every** thread-tail fetch path — including fans whose thread returned empty — so automatic paths never re-spend on silent fans; consulted with a 5-min TTL (owned by **06**). **No `db:changed` scope** (never rendered per row).

### 4.15 `message_guard_events` — app-local Message Guard audit

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `occurred_at` | TEXT NOT NULL | ISO |
| `actor_user_id` | TEXT (nullable) | |
| `actor_label` | TEXT (nullable) | |
| `account_id` | TEXT NOT NULL | |
| `chat_id` | TEXT NOT NULL | |
| `surface` | TEXT NOT NULL | where the block/warn fired |
| `transport` | TEXT (nullable) | |
| `decision` | TEXT NOT NULL CHECK `blocked\|warned\|sent_after_warning` | |
| `policy_version` | TEXT NOT NULL | |
| `category` | TEXT NOT NULL | `off_platform`/`red`/`yellow`/`custom` (enum enforced at read) |
| `rule_id` / `rule_label` | TEXT NOT NULL | |
| `matched_original` / `matched_normalized` | TEXT NOT NULL | matched span text |
| `span_start` / `span_end` | INTEGER NOT NULL | |
| `message_text` | TEXT NOT NULL | **full text — kept only in this encrypted DB** |
| `message_hash` | TEXT NOT NULL | |
| `media_count` | INTEGER NOT NULL DEFAULT 0 | |
| `price` | REAL NOT NULL DEFAULT 0 | |

- **Indices** `idx_message_guard_events_occurred`, `..._account_chat (account_id, chat_id, occurred_at)`, `..._hash (message_hash)` (`schema.ts:394-396`). **DDL**: `schema.ts:370` (v15). **Module**: `queries/message-guard-events.ts`. `insert` writes the full row (source event `GuardAuditEvent` from `@chatgoose/shared/message-guard` — **03**/**08**). `report`/`count` expose **only** counts, buckets (by decision/category/rule), hashes, and metadata — never `message_text`, `matched_original`, or `matched_normalized` (`report`'s `recent` SELECT omits them, `message-guard-events.ts:166-174`; the report row schema has no text field). `pruneOlderThan` deletes by `occurred_at`. Emits `db:changed{scope:'guard', accountId?, chatId?}`.

---

## 5. Row types & read-time decoding (`db/rows.ts`)

`rows.ts` is the normalized-row contract between the sync/mapping layers (producers) and the query modules (persisters/servers). Design (`rows.ts:1-4`):

- **Write shape** (`*Upsert`) carries raw OFAPI objects in a `raw` field that lands in the JSON `raw` column; reads never re-expose `raw`.
- **Read shape** (`*Row`) is produced by a `decode*Row` function that **zod-validates the SQL row first** (storage is a trust boundary) then converts snake_case→camelCase and JSON-parses embedded columns.

Scalar helpers: `sqlBool` (union `0|1` → boolean), `toSqlBool` (boolean → `0|1`), `toJson` (JSON.stringify, falling back to the string `'null'` for non-serializable roots — `rows.ts:19-23`), `parseJsonOrNull` (safe-parse a JSON text column against a schema, returning null on any failure — used for `fans.spending`/`subscription`, `rows.ts:316`).

Types & decoders: `AccountRow`/`decodeAccountRow`; `ChatRow`/`decodeChatRow` and the read-model `ChatListRow`/`decodeChatListRow` (adds `lifetimeSpend`/`spend30d` from the JOIN, `rows.ts:132-149`); `MessageRow`/`decodeMessageRow` (validates the `media` JSON against `MessageMediaVM[]` and `reply_to` against `{sender, textPreview}`, `rows.ts:238-260`); `FanRow`/`decodeFanRow` (spending/subscription via `parseJsonOrNull`); `FanTransactionRow` (no decoder — the fan-transactions module parses inline). Media/reply/spending/subscription zod schemas here are pinned to the corresponding `preload/contract.ts` VMs (`FanPanelVM`, `MessageMediaVM`), so a schema drift is a compile error. `OutboxRow`/`decodeOutboxRow` live in the outbox module (`queries/outbox.ts:106`), not here.

Every query module that returns domain rows parses its raw SQL result with either these decoders or an inline `z.object(...).parse(...)` — so **the storage read path is a zod-validated trust boundary throughout** (SPEC-invariant style, but verified in code here).

---

## 6. In-DB JSON payloads

Several columns store JSON blobs parsed at read time (all guarded so corruption degrades rather than throws):

- `accounts.raw`, `chats.raw`, `messages.raw` — raw OFAPI objects, write-only (never decoded back).
- `messages.media` (array of media VMs), `messages.reply_to` (`{sender, textPreview}`).
- `fans.spending`, `fans.subscription` — decoded via `parseJsonOrNull`; also read **inside SQL** by `chats.list`/`fans.listSpenderIds` with `json_valid` + `json_extract($.total)` + `CAST(... AS REAL)` (a malformed value degrades to null instead of throwing inside `json_extract`, `chats.ts:31-32`, `fans.ts:96-104`).
- `outbox.text_highlights`, `outbox.media_files`, `outbox.previews` — JSON arrays.
- `summaries.hub_sync_state` — opaque hub JSON.
- `usage_events.payload` — JSON, mutated in place by `hub/usage-store.ts` via `json_set(payload, '$.quarantined', json('true'))`.
- `settings.value` — every settings row is a JSON-encoded value.

---

## 7. Change bus (`db/change-bus.ts`)

The single DB-write fanout. `createChangeBus(flushIntervalMs = 50)` returns `{ publish, subscribe, flushNow, dispose }` (`change-bus.ts:25`). Behavior:

- **Coalescing**: `publish(event)` stores into a `Map` keyed by `dedupeKey = scope|accountId|chatId` (`change-bus.ts:21`), so repeated writes to the same scope within a window collapse to one event. First publish arms a `setTimeout(flush, 50)` (`DB_CHANGE_FLUSH_MS = 50`, cited to the stream-batching lesson).
- **Flush**: `flush()` drains the batch as an array to every subscriber; a throwing subscriber is swallowed so a faulty listener can't break the write path (`change-bus.ts:42-46`).
- `flushNow()` drains immediately (shutdown/tests); `dispose()` clears timer/pending/listeners and latches `disposed` so further `publish` is a no-op.

**Emitted scopes** (`DbChangedEvent.scope`, union in `preload/contract.ts:531`): `accounts | chats | messages | fans | summaries | settings | outbox | guard`. Producer map:

| Scope | Emitted by | Carries |
|---|---|---|
| `accounts` | `accounts.ts` (upsert/upsertMany/setAuthState) | accountId |
| `chats` | `chats.ts` (upsert*) **and** `fan-transactions.ts` (upsertMany) | accountId |
| `messages` | `messages.ts` (upsertMany/insertIfAbsent/markDeleted/prune) | accountId, chatId |
| `fans` | `fans.ts` (upsert) | accountId |
| `summaries` | `summaries.ts` (put/remove) | accountId |
| `settings` | `settings.ts` (set/remove) | — |
| `outbox` | `outbox.ts` (insert/transition/claim/cancel/setCoreCommandId) | accountId, chatId |
| `guard` | `message-guard-events.ts` (insert/pruneOlderThan) | accountId?, chatId? |

**Tables with no scope** (renderer refreshes via other channels): `credit_log`, `ai_spend_log`, `usage_events`, `media_urls`, `media_cache`, `thread_fetch_log`, `fan_transactions` (piggybacks on `chats`). The composition root wires `bus.subscribe → webContents.send('db:changed', …)` (04) and also uses a `settings`-scope subscription internally to refresh UI prefs and log-redaction secrets (`index.ts:901-908`). Renderer-side consumption (React-Query invalidation) is owned by **10**.

---

## 8. Media subsystem (`media/`)

### 8.1 `media/cache.ts` — encrypted disk cache + its SQLite queries

Two concerns in one file: blob crypto/LRU cache, and the `media_cache` table queries.

**Blob encryption** — AES-256-GCM, key = the 32-byte `mediaCacheKey`. On-disk format is `iv(12) ‖ authTag(16) ‖ ciphertext` (`encryptBlob`, `cache.ts:19`; `decryptBlob` throws on GCM auth failure or too-short input, `cache.ts:28`). `assertKey` enforces exactly 32 bytes.

**Keying** — `stableRemoteUrlKey(remoteUrl)` strips `search` + `hash` (`cache.ts:48`), so an OF signed URL's rotating query params don't change the key; `hashRemoteUrl` = sha256-hex of that stable key (`cache.ts:55`). This same hash is the `media://` token and the `media_cache.url_hash` (one sha256 shared across the token, the cache row, and the `media_urls` row).

**Cache object** (`createMediaCache`, `cache.ts:108`):
- `get(remoteUrl)`: look up the `media_cache` row → read the file (`fileFor` refuses non-plain paths as a path-traversal guard, `cache.ts:114-120`) → `decryptBlob`. A missing file or a decrypt failure (tamper/key-rotation) calls `dropEntry` (delete file + row + `onPruneUrlHash`) and returns null (refetch). On success it `touch`es `last_accessed_at`.
- `put(remoteUrl, data, contentType)`: encrypt → write `${urlHash}.bin` with mode `0o600` → upsert the row → `evict`.
- `clear()`: clear rows, fire `onClear`, `rm -rf` the cache dir.
- **Eviction** (`evict`, `cache.ts:131`): LRU by `last_accessed_at ASC` in batches of 16, dropping entries until total `≤ maxBytes` (`MEDIA_CACHE_MAX_BYTES = 2 GiB`, `cache.ts:11`), never evicting the just-written `keepUrlHash`.

**SQLite queries** (`createSqliteMediaCacheQueries`, `cache.ts:272`): builds `get`/`upsert`/`touch`/`delete`/`totalBytes` (`SUM(bytes)`)/`evictionCandidates`(LRU, ordered `last_accessed_at ASC, url_hash ASC`)/`clear`, after calling `ensureMediaCacheColumns` (the runtime schema-drift patch, §4.9). Structural `SqliteDatabaseLike`/`SqliteStatementLike` types mirror `driver.ts` so both the `ChatGooseDb` wrapper and a raw handle satisfy them.

### 8.2 `media/vault.ts` — OF vault/gallery mapping (touches storage only via token minting)

`createVaultService` (`vault.ts:67`) exposes `listVault`/`listAlbums`/`chatGallery` — it calls the Direct OFAPI client (**05**) and maps responses to `preload/contract` VMs. **Its only storage interaction is indirect**: `mapVaultItem`/`chatGallery` turn raw OF CDN URLs into `media://` tokens via the injected `toMediaUrl` seam (`vault.ts:58, 113-116`), which is `createToMediaUrl(dataLayer.mediaUrls)` at the composition root (`index.ts:532`) — so every thumb it surfaces **registers a `media_urls` row** (§8.3). It writes no other table. `VAULT_PAGE_LIMIT = 60`, `GALLERY_PAGE_LIMIT = 40`. Local file-byte upload is intentionally absent (`vault.ts:3-4`). Fuller treatment of the OFAPI read surface is in **05**/**02**.

### 8.3 `media/protocol.ts` — the `media://` custom protocol

The renderer references media only as `media://<64-hex sha256>` — an opaque, non-reversible token (`protocol.ts:1-9`). Pieces:

- **Host allowlist** `isAllowedMediaUrl` (`protocol.ts:30`): `https:` only, hostname must be `onlyfans.com`/`fansapi.com` or a subdomain. Re-checked at mint time, at resolve time, and (composition root) inside `fetchRemote` — defense-in-depth so the scheme can never become an SSRF egress from main.
- **Minting** `createToMediaUrl(registry)` (`protocol.ts:59`): non-allowlisted input mints nothing (returns null, registers nothing); allowlisted input computes `hashRemoteUrl`, `registry.register(urlHash, remoteUrl)` (into `media_urls`), and returns `media://<urlHash>`.
- **Token parsing** `parseMediaToken` (`protocol.ts:78`): strict `^[0-9a-f]{64}$` after stripping any trailing `/`, `?`, `#`; legacy base64url-of-URL payloads never match.
- **Request handler** `createMediaRequestHandler` (`protocol.ts:128`): parse token → `registry.lookup` in `media_urls` → **404 without any network** if unknown or if the resolved URL fails the allowlist (poisoned-row guard) → try the encrypted `cache.get` (`x-chatgoose-cache: hit`) → else `fetchRemote` (throw → 502, null → 404) → cache the result best-effort (a failed cache write still serves, `x-chatgoose-cache: miss`).
- **Registration** `registerMediaProtocol` (`protocol.ts:188`): builds the `MediaCache` and handler, calls `session.protocol.handle(MEDIA_SCHEME, handler)`. **Coupling**: `onPruneUrlHash → registry.delete(urlHash)` and `onClear → registry.clear()` (`protocol.ts:196-197`) mean **evicting or clearing a cached blob also deletes its `media_urls` mapping** — an evicted token becomes unresolvable (404) until sync re-mints it. `MEDIA_SCHEME_PRIVILEGES` (`protocol.ts:19`) advises the composition root to register the scheme with `supportFetchAPI`+`stream`, non-`standard`. The composition root's `fetchRemote` (`index.ts:915`) does a plain `fetch` of the signed URL (0 credits), returning null on 404/410 and throwing on other non-OK (the OFAPI download-endpoint fallback is noted as a follow-up, not implemented here).

---

## 9. Encryption-at-rest posture (summary)

Two independent keys, both 32 random bytes as 64-char hex, both from `keychain.getOrCreateGeneratedKey` backed by Electron `safeStorage` (OS keychain) — see **04**:

| Store | Key | Cipher | Applied where |
|---|---|---|---|
| SQLite DB (`chatgoose.db`, all tables) | `dbKey` (hex string used as passphrase) | SQLCipher via `better-sqlite3-multiple-ciphers` | `PRAGMA cipher='sqlcipher'` + `PRAGMA key=...` (`database.ts:46-52`) |
| Media blobs (`media-cache/*.bin`) | `mediaCacheKey` (hex → 32-byte Buffer) | AES-256-GCM (per-blob random IV, auth tag) | `encryptBlob`/`decryptBlob` (`cache.ts:19-40`) |

Consequences: file DBs are rejected without a key (`database.ts:39`); a wrong key surfaces as `SQLITE_NOTADB` on the probe read (`database.ts:52`); `':memory:'` (tests) is unencrypted by construction. Media metadata (`media_cache`, `media_urls`) lives inside the encrypted DB, and the blob bytes are separately AES-GCM-encrypted, so a stolen `media-cache/` dir without the key yields only ciphertext. Message Guard stores full offending message text **only** in the encrypted DB and never re-exposes it through the read/report APIs (§4.15). `encryption.test.ts` proves a keyed DB can't be opened without the key and the file bytes contain no plaintext probe; `cache.test.ts` proves blobs are unreadable without `mediaCacheKey`.

---

## 10. Notable discrepancies & behaviors (recap)

1. **`media_cache` schema drift** (§4.9): `content_type` and `last_accessed_at` + the LRU index exist only via a runtime `ALTER` in `media/cache.ts`, not any migration. `schema.ts`'s v1 `media_cache` DDL is a subset of the table's real shape.
2. **`media_cache` is outside `DataLayer`** (§1, §8.1): built by a separate factory against the same handle; the only table not represented in `createDataLayer`.
3. **`foreign_keys = ON` with zero FK constraints** (§2.2): the PRAGMA is inert; all relations are convention-only on composite PKs.
4. **`fan_transactions` publishes the `chats` scope, not its own** (§4.6) — invalidation follows the visible artifact (chat-list 30-day figure).
5. **Seven tables emit no `db:changed`** (§7); their renderers refresh via `sync:event` frames or Activity aggregation, not the bus.
6. **Two independent `schema_version` readers** — `migrations.readSchemaVersion` (with zod) and `database.schemaVersion()` — read the same `settings` row (§2.2, §3.1).
7. **`raw` columns are write-only** (§5): stored on upsert, never decoded back into domain rows.
8. **Media-cache eviction cascades to `media_urls`** (§8.3): a dropped blob also unregisters its token, so it 404s until re-minted.
9. **`newestPerChat` depends on SQLite bare-column-with-`MAX()` semantics** (§4.4) — an intentional reliance on documented SQLite behavior rather than a windowed subquery.
10. **`prune`/keyset pagination CAST `message_id AS INTEGER`** (§4.4) — OF message ids are numeric-as-text; ordering casts to INTEGER with a string tiebreak.

---

## 11. Test coverage (skim)

`apps/desktop/tests/db/`: `encryption.test.ts` (keyed-open + no-plaintext proof), `migrations.test.ts` (sequential apply, version gating, idempotency, downgrade guard — largest DB test at ~19 KB), `accounts-fans.test.ts`, `chats.test.ts`, `messages.test.ts`, `fan-transactions.test.ts`, `summaries-settings.test.ts`, `change-bus.test.ts` (coalescing/flush/dispose), `thread-fetch-log.test.ts`, `message-guard-events.test.ts` (asserts reports omit text), plus `helpers.ts` (`tempDbFile`, `TEST_DRIVER` Node-ABI alias, sample fixtures). `apps/desktop/tests/media/`: `cache.test.ts` (encrypt/decrypt/LRU/tamper), `protocol.test.ts` (token parse, allowlist, handler hit/miss/404/502), `sqlite-queries.test.ts` (media_cache runtime-column upgrade + media_urls registry against the real node-ABI driver), `helpers.ts`. `apps/desktop/tests/vault/`: `vault-logic.test.ts`, `vault-service.test.ts` (VM mapping with thumbs minted through `toMediaUrl`).
