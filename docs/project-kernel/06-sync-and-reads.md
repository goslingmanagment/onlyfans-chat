> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# Read / Sync Subsystem

## Scope

This doc maps how ChatGoose Desktop **reads** OnlyFans data and keeps its local encrypted SQLite mirror fresh. It covers the read-provider seam (`sync/provider.ts`), the polling engine (`sync/polling-sync.ts`), the SSE consumer and hub-aware composition (`sync/hub-sync.ts`, `sync/hub-provider.ts`), the OFAPI→row mappers (`sync/mappers.ts`), the credit budget guard (`sync/budget-guard.ts`), how the two **read transports** (Direct OFAPI vs Hub read-gateway) are selected in the composition root, and the exact **auto-read** semantics (which reads mark a chat read on OnlyFans and which are gated). It also traces the read→persist→invalidate→renderer flow through the DB change-bus from the sync side.

It defers to neighbor docs: the OFAPI HTTP client itself (methods, credit meter, rate limiter, errors) is **05-ofapi-client**; the wire contracts (`SyncEvent`, `SyncSnapshotResponse`, OFAPI/hub JSON shapes) are **02-external-boundaries** and the shared `protocol/` package in **03-shared-package**; the SQLite schema, queries, and the `DbChangeBus` implementation are **09-data-model-storage**; how the renderer subscribes to `db:changed`/`sync:event` and reacts is **10-renderer-ui**; the write path (command outbox, send engine, mark-read *commands*) is **07-send-engine-outbox**; the AI pipeline is **08-ai-pipeline**; main bootstrap/IPC/settings wiring is **04-main-bootstrap-ipc-settings**; the Spenders/online/usage surfaces that consume the same metered client are **11-hub-monetization-activity**.

---

## 1. File inventory

Directory: `apps/desktop/src/main/sync/`

| File | Lines | Role |
|---|---|---|
| `provider.ts` | 58 | The `SyncProvider` interface + `SyncStatusSnapshot`, `UnreadReconcileTrigger`, `SyncListener` types — the seam both the polling engine and the hub-aware wrapper satisfy. |
| `polling-sync.ts` | 1678 | `createPollingSync` — the full read engine (chat-list poll, delta detection, tail fetch, hydration walk, deep sweep, read-state sweep, media-ready polling, fan-spend sweep, unread reconcile, hub-message ingest). Plus the `syncAccounts` bootstrap. |
| `hub-provider.ts` | 833 | `createHubAwareSync` — composes `PollingSync` + `HubSync` behind one `SyncProvider`; routes hub events into local ingest / reconciliation, applies replay snapshots, keeps hub telemetry. |
| `hub-sync.ts` | 488 | `createHubSync` — the fetch-streaming SSE consumer of core's `/api/v1/events/stream`, plus a standalone `SseFrameParser`. |
| `mappers.ts` | 327 | Pure OFAPI/hub-payload → DB-upsert-row mappers (chat, message, fan, account, transaction, media). The only place raw shapes are interpreted for storage. |
| `budget-guard.ts` | 42 | `createBudgetGuard` — per-shift credit budget guard (80% warn, 100% → ×4 slowdown). |

Related file owned elsewhere but described here from the sync perspective: `apps/desktop/src/main/db/change-bus.ts` (§9).

Tests: `apps/desktop/tests/sync/` — `polling-sync.test.ts` (1558+ lines), `hub-sync.test.ts` (SSE parser + `createHubSync` + `createHubAwareSync` composition), `mappers.test.ts`, `fan-spend-sweep.test.ts` (§10).

---

## 2. Two independent "hub" concepts (do not conflate)

A recurring source of confusion is that "hub" means two structurally separate things in the read path. Both are wired in the runtime-activation function in `apps/desktop/src/main/index.ts` (~lines 397–580).

### 2a. OFAPI read transport — `ofapiReadTransport` setting (`'direct' | 'hub'`)

This chooses **which HTTP base URL + credentials the OFAPI read client uses**. It does *not* change the polling machinery; `PollingSync` runs identically either way.

- `directClient` (`index.ts:397`) — built from the local OFAPI key (`apiKey`), talks straight to onlyfansapi.com.
- When `ofapiReadTransport === 'hub'` (`index.ts:411`), `readClient` is instead built against `buildHubOfApiReadBaseUrl(hubBaseUrl)` with the **hub chatter key** and `authErrorCode: 'CG-HUB-01'`. `buildHubOfApiReadBaseUrl` (`ofapi/transport.ts:7`) appends `/ofapi/read` (or `/api/v1/ofapi/read`) to the hub base URL — i.e. OFAPI-shaped reads proxied through core's read-gateway.
- Either way, `readClient` is wrapped by `createOfApiTransportClient(readClient)` (`ofapi/transport.ts:34`) into `nextClient`, and `nextClient` is the single client handed to `createPollingSync` (`index.ts:534`), the send engine, spenders, vault, online, and AI coordinator.
- The enum lives at `ofapi/transport.ts:4` (`OFAPI_READ_TRANSPORTS = ['direct', 'hub']`); the setting is validated in `settings/store.ts:176`.
- **Selection is a composition-time decision.** Changing `ofapiReadTransport` triggers a full runtime rebuild (the IPC settings handler flags it — `ipc/handlers.ts:752`), not a live swap. Inside `PollingSync`, the `readTransport()` callback (`index.ts:545`, captured from `initialSettings.ofapiReadTransport`) is used **only as a diagnostic log label**; it does not affect any code path.

### 2b. Hub SSE real-time stream — `HubSync` (`createHubSync`)

This is core's push fanout, entirely separate from `ofapiReadTransport`. `createHub` (`index.ts:556`) constructs a `HubSync` whenever `hubBaseUrl` + `hubApiKey` exist and `hubModeOverride !== 'polling'` — **regardless of the read transport**. So all four combinations are possible (Direct-read + SSE-live, Hub-read + SSE-off, etc.). When the SSE stream is live it *suspends the periodic chat-list poll* (§4.7) but the same OFAPI read client keeps serving on-demand reads (opens, backfills, sweeps).

### 2c. Write transport — always Hub

`ofapiWriteTransport` is `z.literal('hub')` (`settings/store.ts:178`) — a hard invariant. The read client wrapper (`createOfApiTransportClient`) fails **every** OFAPI write closed: `sendMessage`, `deleteMessage`, `likeMessage`, `unlikeMessage`, `startTyping`, `markChatRead`, `uploadVaultMedia` all throw (`CG-HUB-02` / `CG-OF-08`, `ofapi/transport.ts:55–75`). Consequence for this subsystem: **the sync engine physically cannot issue an explicit OnlyFans mark-read** — any read-marking it causes is a side effect of GET requests (§5). Writes (including mark-read *commands* via the outbox) belong to 07-send-engine-outbox.

---

## 3. The `SyncProvider` seam (`provider.ts`)

`SyncProvider` (`provider.ts:27`) is the surface both `createPollingSync` and `createHubAwareSync` implement; IPC handlers call it via `deps.sync` without knowing which mode is active. Key methods and their documented semantics:

| Method | Behavior (per interface doc + implementation) |
|---|---|
| `start(accountIds)` / `stop()` | Lifecycle. |
| `subscribe(listener)` | Register a `SyncListener` for semantic `SyncEvent`s (returns unsubscribe). |
| `refreshChat(acct, chat, purpose?)` | **Automatic/background** tail fetch (limit=100, one page). Gated by `autoReadChats` because the OFAPI body read marks the chat read (`provider.ts:31`). |
| `readChatTailForUserOpen(acct, chat, purpose?)` | **Deliberate** single-chat user read (QuickLook / in-chat ↻). Bypasses the auto-read gate but does NOT set `openConversation` or arm the sweep. |
| `loadOlderMessagesForUserOpen(acct, chat)` | Deliberate scrollback: `first_id + desc` page older than the oldest local row. Returns `{ returned, fresh, hasOlder }`; no bodies leaked. |
| `ensureChat(acct, chat, hint?)` | Lazily resolve a chat-list metadata row for a deep Spenders row outside initial hydration. |
| `openConversation` / `closeConversation` | Conversation focus; drives the read-state sweep + an immediate forced read. |
| `setFocusedAccount` / `setWindowVisible` | Cadence/eligibility inputs. |
| `forceRefresh(acct?)` | Manual deep refresh. |
| `reconcileUnread(acct?, trigger?)` | Body-free `filter=unread` read-state reconcile. |
| `status()` | `SyncStatusSnapshot`. |

`SyncStatusSnapshot` (`provider.ts:16`): `freshness` (per-account ISO of last successful list poll), `listVerifiedAt` (aliased to the *same* object in the polling impl), `state` (`'live' | 'degraded' | 'offline'`), `pollIntervalsMs` (null = polling paused), `deepSweepEveryMs`.

`UnreadReconcileTrigger` (`provider.ts:9`): `'manual' | 'unread-tab' | 'window-focus' | 'account-focus' | 'timer'`.

> Comment/behavior note: the header comment (`provider.ts:1`) says "HubSync … at P3 swaps in behind the same surface." In the shipped code it is not a swap — `createHubAwareSync` **wraps** `createPollingSync` and delegates every non-hub method straight through to it (`hub-provider.ts:784–798`); the polling engine always runs.

---

## 4. `PollingSync` (`polling-sync.ts`)

`createPollingSync(options)` returns a `SyncProvider` **plus** the extra methods `pollAccount`, `setHubPollingSuspended`, `refreshAccountHead`, `ingestHubMessage`, `reconcileUnread` (return type declared at `polling-sync.ts:233`). Options (`PollingSyncOptions`, `polling-sync.ts:111`): `client`, `data` (the `DataLayer`), `toMediaUrl`, and injectable gates `isBudgetExhausted`, `autoReadEnabled`, `spendSweepRollbackToLegacy`, `unreadReconcileSettings`, `now`, `sleep`, `onLog`, `readTransport`. The last three (`onLog`, `readTransport`) are for the temporary "empty-thread" diagnostics (dated 2026-06-23 in comments).

Design premise (`polling-sync.ts:1`): the engine is a **cost feature**. The chat-list poll is the primary change detector; message fetches happen only on list deltas; hydration is **list-only** (never a tail-fetch per discovered chat — at 900+ chats that would cost ~900 credits, measured on account "loravie" 2026-06-11).

### 4.1 Tunable constants (`polling-sync.ts:34–81`)

| Constant | Value | Meaning |
|---|---|---|
| `FOCUSED_POLL_MS` | 20 000 | Focused-account hot-poll cadence. |
| `UNFOCUSED_POLL_MS` | 60 000 | Other accounts. |
| `HIDDEN_FACTOR` | 4 | ×4 slowdown when the window is hidden. |
| `BUDGET_FACTOR` | 4 | ×4 slowdown when the shift budget is exhausted. |
| `HUB_LIST_REFRESH_DEBOUNCE_MS` | 2 000 | Coalesce body-free head refreshes for hub id-only/notification frames. |
| `CHATS_PAGE_LIMIT` | 10 | Requested chat-list page size (OnlyFans ignores >10; offset advances by what actually arrived). |
| `DEEP_SWEEP_PAGES` / `DEEP_SWEEP_INTERVAL_MS` | 5 / 5 min | Periodic deeper list walk for read-state/unread drift on older chats. |
| `HYDRATION_PAGES_PER_TICK` / `HYDRATION_MAX_PAGES` | 10 / 150 | Initial resumable list walk; the 150 cap is a runaway guard. |
| `READ_STATE_SWEEP_MS` | 30 000 | Read-state sweep cadence for the open chat. |
| `READ_STATE_SWEEP_IDLE_STOP_MS` | 10 min | Auto-stop the sweep after no `isNew` flip. |
| `READ_STATE_OWN_MESSAGE_MAX_AGE_MS` | 24 h | Only sweep for own `isNew` messages newer than this. |
| `MEDIA_READY_POLL_MS` / `_CAP_MS` | 15 s / 10 min | Re-poll not-yet-ready media; give up after cap. |
| `FAN_DETAIL_TTL_MS` | 5 min | Fan-profile refresh TTL. |
| `OFFLINE_AFTER_FAILURES` | 3 | `status()` goes `offline` at ≥3 consecutive failures. |
| `USER_OPEN_COLD_PAGE_LIMIT` / `USER_BACKFILL_PAGE_LIMIT` / `USER_OPEN_BACKFILL_THRESHOLD` | 30 / 30 / 30 | Deliberate-open sizing. |
| `LEGACY_SPEND_SWEEP_INTERVAL_MS` / `REDUCED_SPEND_SWEEP_INTERVAL_MS` | 10 min / 60 min | Fan-spend sweep cadence (rollback-gated). |
| `SPEND_TX_PAGE_LIMIT` / `SPEND_SWEEP_MAX_PAGES` / `SPEND_SWEEP_OVERLAP_MS` / `SPEND_RETENTION_MS` | 10 / 100 / 60 min / 31 d | Fan-spend walk sizing/overlap/retention. |

Inter-page pacing during multi-page walks uses `OFAPI_INTER_PAGE_DELAY_MS` (from `@chatgoose/shared`, injected via `sleep`, `polling-sync.ts:827`).

### 4.2 Per-account loop state & scheduling

`AccountLoop` (`polling-sync.ts:148`) tracks three timers (`timer`, `spendTimer`, `unreadReconcileTimer`), three in-flight flags, and last-run timestamps. `loops` is a `Map<accountId, AccountLoop>` (`polling-sync.ts:263`).

- `intervalFor(accountId)` (`polling-sync.ts:290`): returns `null` if `shouldSuspendLoop` (hub-suspended **and** hydration done — `polling-sync.ts:286`), else `base × hidden × budget`. `null` means the poll timer is not re-armed.
- `schedule(accountId, delayMs)` (`polling-sync.ts:395`): self-rescheduling `setTimeout` that runs `pollAccount` then re-arms at `intervalFor`. `scheduleBurst` (`:412`) schedules delay 0 (used on focus/visibility resume).
- Overlap protection: `pollAccount` early-returns if `loop.inFlight` (`polling-sync.ts:1173`) — Phase-0 measured p95 7.5 s on list-chats.

### 4.3 The poll loop — `pollAccount(accountId, depth='hot')` (`polling-sync.ts:1171`)

1. Read persisted hydration state (`readHydration`, `:1179`). Decide `deepDue` (hydration done **and** (depth `'deep'` or the 5-min deep interval elapsed), `:1180`).
2. **Head walk** — `walkChatPages(accountId, 0, deepDue ? 5 : 1, purpose)` (`:1187`). Purpose tag is `'deep-sweep'` or `'hot-poll'`. Page 1 suffices on hot ticks because of the recency invariant (`order=recent`): any chat whose `lastMessage` changed resurfaces on page 1 (`polling-sync.ts:47`).
3. **Delta detection** — for each returned chat, `chatChanged` (`:794`) compares the *chat row's own* `lastMessageId`, `unreadCount`, `lastReadMessageId` baseline (hydration is list-only so the messages table is not a reliable baseline). Deltas are collected with a `wasCached` flag.
4. **Persist list rows** — `upsertChatRows(accountId, head.chats)` (`:1214`) writes chat + fan rows (never messages).
5. **Tail fetches (gated)** — only `if (autoReadEnabled())` (`:1220`): for each delta, `fetchChatTail` then, post-baseline, emit semantic events (`messageReceived`/`messageSent`, plus `tipReceived` with USD amount) per fresh id. Tail-fetch policy (`:1205`): a cached chat that changed is always fetched (silently swallowing downtime backlog); an uncached chat is fetched only post-baseline. Baseline history (`prevSuccessAt === null`) is not emitted as news.
6. **Always** emit `chatListUpdated` (`:1255`) — list, unread counts and previews update in **both** auto-read modes because they came from `listChats` (no read marked).
7. **Hydration chunk (if not done)** — after the delta work, walk `HYDRATION_PAGES_PER_TICK` more pages from `max(hydration.nextOffset, head.nextOffset)` (`:1263`), persist rows with `preserveLocalHead`, persist the new `HydrationState` into the settings KV, emit `chatListUpdated` for progressive paint, and kick off the fan-spend sweep the moment hydration completes (`:1278`).
8. Update `lastSuccessAt`, `lastDeepSweepAt`, reset `consecutiveFailures`, arm the unread reconcile timer. On throw, bump `consecutiveFailures` (`:1290`) — the only place the health counter moves.

### 4.4 Chat-list walking & hydration state

- `walkChatPages` (`:813`) requests `limit=10, order=recent, skipUsers='none'`; advances `offset` by `chats.length` (server chooses page sizes); dedupes fan ids across pages (recency reshuffle can repeat a chat); stops when `nextPageUrl === null` or an empty page (`exhausted`).
- Hydration progress persists per account in the settings table under `sync.chatHydration.<accountId>` (`hydrationKey`, `:184`), schema `{ nextOffset, pagesWalked, done }` (`:175`). Restarts resume instead of rewalking; on `start()` a done-hydration account schedules the spend sweep immediately (`:1480`).
- `applyLocalHeadGuard` / `cachedHeadIsNewer` (`:876`/`:862`): during hydration/unread-reconcile upserts, a stale deeper page never regresses a locally-newer head (compares `lastMessageAt` then `lastMessageId`).

### 4.5 Tail fetch — `fetchChatTail` (`polling-sync.ts:451`)

The single seam through which message bodies are read; **every** caller is one of the four thread-fetch paths (poll-delta, conversation open, quick-look hydrate, scoped refresh). Behavior:

- Reads the newest cached message id; if present, requests `last_id + order=asc` (boundary-inclusive ascending tail, dedupe by id); if absent, a cold `order=desc` page (`coldLimit`, default 100). `recentWindow:true` forces a `desc` reload ignoring the boundary.
- **One page max, never paginates deeper** — a side absent from the newest 100 renders "—" honestly.
- Stamps per-fan freshness via `data.threadFetchLog.stamp(...)` (`:516`) — including for **empty** threads, so automatic paths never re-spend on fans who never wrote.
- Upserts mapped messages (`mapMessage`), then `data.messages.prune` (retention 5 000/chat).
- Media polling (`trackUnreadyMedia`) is enrolled only when `force || autoReadEnabled()` (`:581`) — because `getMessage` is itself a body read.
- Returns `{ freshIds, hadCachedMessages }`. Wrapped in heavy temporary diagnostic logging (`onLog('info'/'warn', 'diag openTail', …)`).

Deliberate-open composition — `readHistoryForExplicitUserOpen` (`:692`): if the local window is small (`0 < count < 30`) it reloads the recent desc window and then `backfillSmallLocalWindow` → `backfillOlder`; otherwise a normal forced tail. Always `force=true`, `priority:'user'`, `retry:'none'`.

Scrollback — `backfillOlder` (`:590`): `first_id + order=desc` older than the oldest local row; caches per-thread coverage in `historyCoverage` (`hasOlder=false` short-circuits future calls); returns `{ returned, fresh, hasOlder }`.

### 4.6 Read-state sweep (`polling-sync.ts:1296–1359`)

Detects when the fan **reads** the chatter's own messages (flips OnlyFans `isNew`). Runs only for the currently open conversation.

- `sweepEligible` (`:1297`): requires the window visible **and** an open conversation with a recent own message that is still `isNew` (newer than the 24 h cutoff).
- `scheduleSweep` (`:1310`): arms a 30 s timer **only when `autoReadEnabled()`** — because the sweep's `listMessages` marks the open chat read.
- `runSweep` (`:1325`): re-checks `autoReadEnabled()`, eligibility, and the 10-min idle-stop; fetches `order=desc limit=50`; if any own message flipped `isNew → false`, records the change and emits `readStateChanged`.

### 4.7 Hub-suspension & unread reconcile

`setHubPollingSuspended(suspended)` (`:1609`): flips the internal `hubPollingSuspended` flag; for each account either cancels the poll timer (`shouldSuspendLoop` true) or restores normal cadence. Called by the hub-aware wrapper when SSE goes live/down.

While the poll loop is suspended and there is local unread, a **body-free** `filter=unread` reconcile runs to catch chats read elsewhere (e.g. in OnlyMonster) that never resurface on the recency head:

- `UnreadReconcileSettings` + `DEFAULT_UNREAD_RECONCILE_SETTINGS` (`:83`/`:97`): triggers (`unread-tab`/`window-focus`/`account-focus`), `focusDebounceMs` 30 s, immediate/focused/hidden max-pages and intervals.
- `runUnreadReconcile` (`:912`): `walkChatPages(..., filter:'unread')` (purpose `'unread-reconcile'`), upserts heads with `preserveLocalHead`, and — only if the scan was `exhausted` — clears locally-unread chats that did not come back *and* whose head is unchanged since the scan started (head-fence guards against SSE advancing a chat mid-scan). Emits `chatListUpdated`. Swallows errors so it never poisons `consecutiveFailures`.
- `reconcileUnread` (`:996`, public): dedupes by `focusDebounceMs`, requires suspended (except `manual`) and local unread. `armUnreadReconcile`/`scheduleUnreadReconcile` (`:381`/`:362`) manage the timer.

This reconcile issues **no message-body reads and marks nothing read** (list-only), so it runs in both auto-read modes.

### 4.8 Fan-spend sweep (`polling-sync.ts:1361–1441`)

Independent of chat-list polling and of hub suspension. Walks `listTransactions` into `fan_transactions` (DESIGN §1 30-day spend). First run pulls the full `-30days` window; later runs resume from the newest cached row minus a 1 h overlap (steady state ~1 page/sweep). Uses `paginateMarker` (`ofapi/pagination.ts:129`) with a `'until'` predicate on `createdAt`. Runs only after hydration is done (`:1414`); defers (reschedules, does not run) when the budget is exhausted (`:1417`). Cadence is `spendSweepIntervalMs()` (`:300`): legacy 10 min if `spendSweepRollbackToLegacy()`, else reduced 60 min (core `transactions.new` projection is treated authoritative). `runSpendSweep`'s stamp advances even on failure so a broken transactions endpoint retries at cadence.

### 4.9 Fan-detail refresh & ensureChat & account bootstrap

- `refreshFanDetail` (`:1443`): fire-and-forget `getUserByUsername` (purpose `'hydration'`) on conversation open, TTL-guarded (5 min), fail-open on 404. This is a **profile** read, not a chat-message read → it does **not** mark a chat read.
- `ensureChat` (`:1032`): `listChats(query=username)` to synthesize a chat row for a deep Spenders fan; list read, no mark-read.
- `syncAccounts` (`:1664`, exported): `listAccounts` → `mapAccount` upserts at boot; returns account ids to poll.

---

## 5. Auto-read semantics (which reads mark a chat read)

The core fact (memory-note-confirmed, and encoded throughout the comments): **`GET /messages` marks the chat read on OnlyFans**. There is no explicit mark-read call in the sync engine (the write client fails it closed, §2c). Read-marking therefore happens purely as a side effect of message-body GETs. The gate is `autoReadEnabled()` = `settingsCache.autoReadChats` (default **false**, `index.ts:542`).

Two things are gated *only* by this flag: **background** message-body reads. Two things are **never** gated: `listChats`/list reads (they never mark read), and a deliberately-opened chat (must always load).

### 5.1 Every OnlyFans read call in the subsystem

| Read call | Site | Marks a chat read? | Gated by `autoReadChats`? |
|---|---|---|---|
| `listMessages` in `fetchChatTail` via **poll-delta** loop | `:1222` inside `if (autoReadEnabled())` `:1220` | Yes | **Yes** — skipped when OFF; only `chatListUpdated` fires. |
| `listMessages` in `fetchChatTail` via **`refreshChat`** (background/scoped Spenders) | `:1528` | Yes | **Yes** — when OFF, `refreshChat` early-returns to a debounced list-only `refreshAccountHead` (`:1524`). |
| `listMessages` in `fetchChatTail` via **`openConversation`** / **`readChatTailForUserOpen`** | `readHistoryForExplicitUserOpen` `:702`, `force=true` | Yes | **No** — the one sanctioned read; always runs. |
| `listMessages` (`first_id+desc`) in **`backfillOlder`** (user scrollback / small-window backfill) | `:609` | Yes | **No** — deliberate user action; always runs. |
| `listMessages` (`desc limit 50`) in **read-state sweep** `runSweep` | `:1335` | Yes | **Yes** — `scheduleSweep` only arms when ON (`:1317`); `runSweep` re-checks (`:1327`). |
| `getMessage` (media-ready re-poll) in **`trackUnreadyMedia`** | `:732` | Yes (body read) | **Yes** — only enrolled when `force || autoReadEnabled()` (`:581`); in hub ingest only when ON (`:1137`). |
| `getUserByUsername` in **`refreshFanDetail`** | `:1453` | No (profile read) | n/a (TTL-guarded only). |
| `listChats` (head/deep/hydration/unread-reconcile/`ensureChat`) | `walkChatPages` `:829`, `ensureChat` `:1044` | No | Never gated. |
| `listTransactions` (fan-spend sweep) | `:1385` | No | Not gated (budget-gated instead). |

### 5.2 Foreground deliberate-open vs background sweep — precise distinction

- **Foreground deliberate open** = `openConversation` (`:1542`) and `readChatTailForUserOpen` (`:1531`). Both call `readHistoryForExplicitUserOpen` with `force=true`, bypassing the auto-read gate. `openConversation` additionally sets `openConversation` focus, re-arms the read-state sweep (`scheduleSweep`), clears the local unread count **body-free** (`:1554`, runs in both modes, only after the read succeeds so a failed open doesn't hide still-unread chats), schedules an unread reconcile, and fires `refreshFanDetail`. `readChatTailForUserOpen` does **not** set focus or arm the sweep (used by the in-chat ↻ and QuickLook).
- **Background sweep** = the poll-delta tail fetch, the read-state sweep, background media polling, and `refreshChat` (hub reactions / scoped Spenders refresh). All are `autoReadChats`-gated so OnlyFans never marks a chat read without an explicit human open.

When auto-read is OFF, live message/tip *events* do not come from polling (its tail fetch is skipped); they arrive through `HubSync` enriched frames instead (§6/§7), which write bodies with no mark-read.

---

## 6. `HubSync` — the SSE consumer (`hub-sync.ts`)

`createHubSync` (`hub-sync.ts:194`) is a fetch-streaming consumer of core's `GET /api/v1/events/stream` (`HUB_SSE_PATH`, `:22`), bearer chatter key. Contract notes in the header (`:1`): frames are `id:<fanout_seq>\nevent: sync\ndata:<SyncEvent JSON>\n\n`; server announces `retry: 3000`, sends `: keep-alive` every 30 s, and **closes every stream at the 15-min max lifetime — reconnect with `?lastEventId=` is the normal path, not an error**; 401/403 = permanent stop.

- **`SseFrameParser`** (`:49`) — a standalone WHATWG-SSE-subset line parser (handles split chunks, comments, multi-line `data`, CRLF, sticky `id`, `retry`). Unit-tested directly.
- **Connection loop** — `runLoop` (`:426`) / `connectOnce` (`:341`): a 45 s byte-silence **watchdog** (`HUB_WATCHDOG_MS`, `:28`) aborts a dead pipe; status flips to `'live'` on the **first byte** received, not on response headers (so a proxy that answers 200 then stalls never demotes polling, `:401`). Statuses: `'connecting' | 'live' | 'degraded' | 'auth-failed' | 'stopped'` (`:131`). Backoff is exponential capped at `HUB_RECONNECT_CAP_MS` 30 s (`:464`).
- **Checkpoint discipline** — `handleFrame` (`:228`) parses `frame.data` JSON, validates via `parseSyncEvent` (drops on failure, bumps `dropped`), filters out events whose `accountId` is not in `allowedAccountIds`, then **awaits `onEvent` before** persisting `frame.id` as `lastEventId` (`:250`) — handle-then-checkpoint so a crash mid-handle replays, never skips. `getLastEventId`/`setLastEventId` read/write `hubSync.lastEventId` in the settings table (`index.ts:575`).
- **Replay-gap snapshot recovery** — a `409` with a `syncSnapshotRequired` body (`:365`) triggers `recoverSnapshots` (`:255`): paginates `GET /api/v1/events/snapshot` (`HUB_SNAPSHOT_PATH`, `:23`) per allowed account (`afterSeq`, `pageCursor`, `limit=50`, sticky `snapshotCursor`), validates each page (`syncSnapshotResponseSchema`), applies via `onSnapshot`, refuses to advance on partial/`resumeAllowed:false`, and only then sets `lastEventId` to the snapshot cursor.
- `HubSync` interface (`:179`): `start`/`stop`/`status`/`droppedFrameCount`. Injectable `fetchImpl`/`sleep`/`now` for tests.

---

## 7. `createHubAwareSync` — composition & hub event handling (`hub-provider.ts`)

`createHubAwareSync` (`hub-provider.ts:168`) implements `SyncProvider` by wrapping the `PollingLike` engine and a lazily-created `HubSync`. `createHub` (injected) resolves `null` when hub config is absent → polling-only.

### 7.1 One listener set, delegation

`polling.subscribe(emit)` (`:379`) forwards **all** polling events unchanged through the hub-aware provider's own listener set, so the send engine's `messageSent` subscription works identically in both modes (`index.ts:658`). Every non-hub `SyncProvider` method delegates straight to `polling` (`:784–798`).

### 7.2 Status → polling suspension (`handleHubStatus`, `:647`)

- SSE goes **live** → `polling.setHubPollingSuspended(true)` (poll loop pauses after hydration; read-state sweeps and the spend sweep are unaffected).
- SSE goes **not-live** (degraded/stopped) → `setHubPollingSuspended(false)` **and** one `polling.forceRefresh()` reconciliation sweep to close the gap (`:679`).
- `hubModeOverride` (`'auto' | 'polling' | 'hub'`, dev/support D3 override): `'polling'` skips SSE entirely (`startHub` `:696`); `'hub'` keeps polling suspended even while SSE is not live (`:652`). Mode resolved from `settingsCache.hubModeOverride` (`index.ts:553`).
- `hubMode()` (`:756`) collapses status to `'live' | 'degraded' | 'off'` for the UI.

### 7.3 Event routing (`handleHubEvent`, `:532`)

| Event | Handling | Fallback reason recorded |
|---|---|---|
| `messageReceived` / `messageSent` with an **enriched, id-matching** `message` | `polling.ingestHubMessage` (body-free local upsert), emit, `recordApplied`. | — |
| …with mismatched id / missing body / ingest error | falls through to `polling.refreshChat` (list-only when auto-read OFF), still emit. | `hub-mismatched-message-fallback` / `hub-id-only-fallback` / `hub-malformed-message-fallback` / `hub-ingest-error-fallback` |
| `ppvUnlocked` / `tipReceived` | notification-shaped → `polling.refreshChat` + emit. | `hub-notification-fallback` |
| `messageDeleted` | resolve `chatId` (event or `lookupChatId` raw SQL probe `:382`), `data.messages.markDeleted`, `refreshAccountHead`, emit. Unknown id → head refresh only, drop. | `unknown-delete-head-refresh` (unknown-id case) |
| `chatListUpdated` | `polling.refreshAccountHead`. | — |
| default (typing/presence/accountAuth…) | emit as-is. | — |

`ingestHubMessage` (`polling-sync.ts:1119`) is the body-free local write: maps via `mapHubMessage`, refuses to resurrect a local tombstone (`:1130`), upserts + prunes, tracks media only if auto-read ON, then recomputes the chat head (unread ±, preview, `advances` monotonic guard via `hubMessageAdvances`) so previews/unread stay correct with **no OFAPI read**.

### 7.4 Snapshot application (`applyHubSnapshot`, `:449`)

Rejects snapshots for unhandled accounts; sets account auth state; upserts thread heads (`upsertSnapshotThread`, `:411`, with a `snapshotHeadIsCurrent` recency guard); for each message either **merges monotonic webhook facts** onto an existing local body (preserving a body a concurrent REST read may have corrected — only bumps `isOpened`/`isTip`/`tipAmount`) or ingests a new one via `polling.ingestHubMessage`; applies `deletedAt` tombstones and `unresolvedTombstones`; re-applies authoritative heads; emits `chatListUpdated`.

### 7.5 Telemetry (`hub-provider.ts:114–353, 810–831`)

Persists a daily + lifetime event counter (`hubSync.eventStats` in the settings KV, survives restarts, migrates a pre-`lifetime` shape) covering received/applied/fallback/dropped by type and `fallbackByReason`. Surfaced via `hubActivity()` (`:810`) → IPC `sync.status` (`ipc/handlers.ts:464`). `HubFallbackReason` union at `:22`.

---

## 8. Mappers (`mappers.ts`)

The only place raw OFAPI/hub shapes are interpreted for storage. Remote media URLs become opaque `media://` tokens here (via injected `ToMediaUrl`) so the renderer never sees OF CDN URLs.

| Function | Input → output | Notes |
|---|---|---|
| `mapMediaItem` (`:49`) | rich media → `MessageMediaItem` | zod `richMediaSchema`; picks thumb/full URL, `locked = canView === false`, drops null-id items. |
| `mapAccount` (`:70`) | `OfApiAccount` → `AccountUpsert` | `authState` from `is_authenticated`. |
| `mapChat` (`:108`) | `OfApiChat` → `ChatUpsert \| null` | **`chatId === fan.id`**; chats without a fan are dropped (two-namespace rule). `preview` via `previewOf` (`:82`); `pinned` hardcoded false (no source). |
| `mapMessage` (`:141`) | `OfApiMessage` → `MessageUpsert` | text→plain via `htmlToPlainText`; `replyTo` preview 120 chars; media mapped to tokens. |
| `mapHubMessage` (`:181`) | `NormalizedSyncMessage` → `MessageUpsert \| null` | body-free path; **media stores `thumbUrl/fullUrl = null`** (hub frames carry no URLs); rejects empty id / unparseable date. |
| `mapFan` (`:231`) | `OfApiUser` → `FanUpsert` | spend aggregate, subscription status (`active`/`expired`/`none`), `autoRenewOff` from current subscribe entry's `cancelDate`. |
| `avatarMediaUrl` (`:291`) | smallest avatar thumb → token. |
| `mapFanTransaction` (`:302`) | `OfApiTransaction` → `FanTransactionUpsert \| null` | drops rows with no fan / non-positive amount / unparseable date; `net` = `tx.net` else `0.8 × amount` (20% platform cut); `createdAt` normalized to ISO-UTC. |

---

## 9. DB change-bus & the read→persist→invalidate→renderer flow

There are **two distinct fanouts** from the sync engine to the renderer; they carry different payloads (see `ipc/events.ts`, `attachEventForwarding`, `:33`):

1. **`sync:event`** — semantic `SyncEvent`s from the `SyncProvider` listener set (`messageReceived`, `messageSent`, `tipReceived`, `readStateChanged`, `chatListUpdated`, `messageDeleted`, typing/presence, plus `syncStatus`, `creditBalance`, and Spenders-refresh frames). These drive notifications, dock/taskbar unread badges (`index.ts:747`), and the send-engine reconciliation (`engine.handleSyncEvent`, `index.ts:658`).
2. **`db:changed`** — scope-keyed invalidations from the `DbChangeBus` (`db/change-bus.ts`), forwarded one-by-one (`ipc/events.ts:44`). This is what the renderer's react-query layer keys off (doc 10).

The persist→invalidate half is implicit and lives in the DB query layer (owned by doc 09), not in the sync files. When sync calls `data.chats.upsertMany`, `data.messages.upsertMany`, `data.messages.markDeleted`, `data.fans.upsert`, `data.fanTransactions.upsertMany`, etc., **those query methods** call `bus.publish({ scope, accountId?, chatId? })` — e.g. `db/queries/messages.ts:109/313/332` (`scope:'messages'`), `db/queries/chats.ts:127` (`scope:'chats'`), `db/queries/fans.ts:64` (`scope:'fans'`), `db/queries/fan-transactions.ts:74` (publishes `scope:'chats'`, since spend feeds chat rows). `DbChangedEvent.scope` union: `'accounts' | 'chats' | 'messages' | 'fans' | 'summaries' | 'settings' | 'outbox' | 'guard'` (`preload/contract.ts:531`).

`createChangeBus` (`db/change-bus.ts:25`) **dedupes** by `scope|accountId|chatId` (`:21`) and **batches** at most once per `DB_CHANGE_FLUSH_MS = 50 ms` (`:9`) before delivering to subscribers; a faulty subscriber is swallowed so it can't break the write path. So a burst of upserts inside one poll collapses into a small deduped batch per 50 ms tick.

End-to-end for a background message arriving (auto-read ON): `pollAccount` head walk → `fetchChatTail` → `data.messages.upsertMany` (publishes `scope:'messages'`) + `data.chats.upsertMany` (publishes `scope:'chats'`) → change-bus 50 ms batch → `db:changed` to renderer (react-query invalidation); **separately** `pollAccount` emits `messageReceived` → `sync:event` (notification/badge/send-engine). For a hub-live message (auto-read OFF): `HubSync` → `handleHubEvent` → `ingestHubMessage` writes rows (same `bus.publish`) + emits the `SyncEvent`.

---

## 10. Budget guard (`budget-guard.ts`)

`createBudgetGuard` (`budget-guard.ts:19`) is a tiny per-shift credit guard:

- `isExhausted()` — `budget !== null && budget > 0 && usedToday >= budget`. Wired into `PollingSync.isBudgetExhausted` (`index.ts:539`) → ×4 poll slowdown (never stops) and defers the fan-spend sweep; also gates the Spenders refresh queue (`index.ts:653`).
- `check()` — fires `onWarning` **once per process life** at ≥80% (a module-local `warned` flag, reset only by `resetWarning()`; despite the header comment "once per UTC day," there is no day tracking in this file — day rollover is not re-armed here). `onWarning` shows an OS notification (`index.ts:467`).
- Inputs are injected: `getBudget` = `settingsCache.creditBudgetPerShift`, `getUsedToday` = `creditMeter.snapshot().usedToday`. `check()` is invoked from the credit-meter subscription on every meter update (`index.ts:504`). The credit meter itself (per-purpose tallies, `credit_log` persistence) is doc 05.

---

## 11. Tests (`apps/desktop/tests/sync/`)

- **`polling-sync.test.ts`** — the densest suite. Covers: list-only hydration + chunked resume across restart; delta rule (no delta → no fetch; ascending tail dedupe; no-boundary post-poll emit); tip emit with USD; page-1 hot vs 5-page deep sweep vs `forceRefresh` deep; overlap protection; cadence (20 s focused / 60 s others / ×4 hidden / ×4 budget); **hub-live suspends the poll loop but keeps read-state sweeps full-rate and the spend sweep independent**; the entire **unread-reconcile** matrix (clear externally-read, preserve tip state, partial-scan no-clear, head-fence vs SSE, timer arming); thread-fetch freshness stamps (including empty threads and stamp-only-on-success); and a dedicated **`auto-read OFF (default)`** describe block asserting: poll delta does not `listMessages` (list still updates), `refreshChat` debounces a list-only head refresh, `readChatTailForUserOpen`/`openConversation` still read + stamp, `ingestHubMessage` writes bodies + preview without body reads, dedup/tombstone/sent-clear behavior, and hub media stores no URLs / no `getMessage`. Includes a `budget guard` describe.
- **`hub-sync.test.ts`** — `SseFrameParser` (split chunks, comments, CRLF, sticky id), `createHubSync` (auth stop, watchdog, resume checkpoint, snapshot recovery), and `createHubAwareSync` composition (event routing, fallbacks, status→suspension).
- **`mappers.test.ts`** — `customNameOf`, `mapChat` fan-name precedence, `mapFan` custom name, `mapFanTransaction` net fallback / drop rules.
- **`fan-spend-sweep.test.ts`** — incremental transactions walk / overlap / retention.

---

## 12. Discrepancies & noteworthy points

- **`provider.ts:1` "HubSync swaps in behind the same surface"** — actual code *wraps* rather than swaps; `PollingSync` always runs, and the hub layer suspends its loop rather than replacing it (§3, §7.2).
- **`budget-guard.ts` "once per UTC day"** — the file only tracks a boolean `warned`; there is no day rollover logic inside it, so the 80% warning fires at most once per process unless `resetWarning()` is called (§10).
- **`readTransport()` in `PollingSync`** is diagnostic-only (log labels) and is captured from `initialSettings.ofapiReadTransport` at composition time; it does not feed any behavioral branch (§2a).
- **Read transport vs SSE are orthogonal** — being in Direct read mode does not disable the SSE stream, and being in Hub read mode does not by itself enable it; the SSE stream depends only on hub config + `hubModeOverride` (§2b).
- **No explicit mark-read in sync** — because the write client fails `markChatRead` closed (`ofapi/transport.ts:73`), all read-marking is a GET side effect; the local unread-clear on open is a pure DB write (§2c, §5.2).
- **`fan-transactions` publishes `scope:'chats'`** (`db/queries/fan-transactions.ts:74`), not a `'fans'`/`'transactions'` scope — a spend update invalidates chat-list-derived views (§9).
- Extensive **temporary diagnostic logging** (`'diag openTail'`, `'diag backfillOlder'`, dated 2026-06-23) is threaded through the tail/backfill paths for an "empty-thread" investigation; it logs counts only, never message text.
