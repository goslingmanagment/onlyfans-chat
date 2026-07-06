> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Sync & Reads (main/sync)

## Scope

This maps how ChatGoose Desktop keeps its local encrypted SQLite mirror of
OnlyFans data fresh and how live activity reaches the renderer. It covers the
read-provider seam (`sync/provider.ts`), the polling engine
(`sync/polling-sync.ts`), the SSE stream-v2 consumer and hub-aware composition
(`sync/hub-sync.ts`, `sync/hub-provider.ts`), the OFAPI/domain-frame → DB-row
mappers (`sync/mappers.ts`), the per-shift credit budget guard
(`sync/budget-guard.ts`), the `SyncEvent` union that crosses main→renderer, the
credit-tagged read purposes, and the exact auto-read semantics.

Directory: `apps/desktop/src/main/sync/`.

## Post-migration reality: the data path is hub-only

Two facts about this subsystem changed with the Project Kernel migration and are
load-bearing for a reviewer stitching desktop + core + OFAPI:

1. **Reads no longer talk to onlyfansapi.com directly.** The read-transport enum
   collapsed to a single literal: `OfApiReadTransport = 'hub'`
   (`apps/desktop/src/main/ofapi/transport.ts:6`), and the settings field is a
   `z.literal('hub')` (`apps/desktop/src/main/settings/store.ts:178`, default
   `'hub'` at `:246`). The banner comment states the direct branch died with
   Stage 24 / DP 8 (`transport.ts:4-5`). `buildHubOfApiReadBaseUrl`
   (`transport.ts:8`) appends `/ofapi/read` (or `/api/v1/ofapi/read`) to the hub
   base URL, so every OFAPI-shaped read (`listChats`, `listMessages`,
   `getMessage`, `listTransactions`, `getUserByUsername`, …) is proxied through
   core's read-gateway. The polling engine's `client` is exactly this
   hub-proxied read client (`index.ts:519-520`, `nextClient`). Polling as a data
   source still runs — it now polls the hub read-gateway, not OFAPI directly.
   (Read-client internals: 05-ofapi-read-client.md.)

2. **The live event feed is core's SSE stream v2.** `HubSync` subscribes to
   `GET /api/v1/events/v2/stream` (`HUB_V2_SSE_PATH`,
   `apps/desktop/src/main/sync/hub-sync.ts:29`); the default protocol is `'v2'`
   (`hub-sync.ts:226`; wired from `vm.hubSyncProtocol`, `index.ts:560`; setting
   enum `['v2','v1']` default `'v2'`, `store.ts:192`/`:250`). `'v1'`
   (`/api/v1/events/stream`, `hub-sync.ts:26`) remains only as a
   settings-file-flippable rollout fallback. v2 domain frames (`event: domain`)
   are validated by `parseDomainEventFrame` and translated to the local
   `SyncEvent` union by `mapDomainFrame`
   (`packages/shared/src/protocol/index.ts:487`); typing rides a serve-time-only
   `event: ephemeral` lane. The v2 snapshot-required signal is **version 2,
   statusCode 409** (`domainSnapshotRequiredSchema`, `protocol/index.ts:442-453`;
   v1's snapshot-required is version 1, `:322-331`).

The write transport is hard-`'hub'` too (`store.ts` `ofapiWriteTransport:
z.literal('hub')`), and `createOfApiTransportClient` fails every OFAPI write
closed — `sendMessage`, `deleteMessage`, `likeMessage`, `unlikeMessage`,
`startTyping`, `markChatRead`, `uploadVaultMedia` all throw (`CG-HUB-02` /
`CG-OF-08`, `transport.ts:56-77`). Consequence for this subsystem: **the sync
engine cannot issue an explicit OnlyFans mark-read** — the only read-marking it
causes is the GET side effect described in the Auto-read section. Writes
(including the mark-read command) belong to 07 (send-engine/outbox).

The read-transport-vs-SSE orthogonality of the old design is gone: read
transport is now a constant, so the only live axis left is the SSE protocol and
the `hubModeOverride`.

## File inventory

| File | Lines | Role |
|---|---|---|
| `provider.ts` | 58 | The `SyncProvider` interface + `SyncStatusSnapshot`, `UnreadReconcileTrigger`, `SyncListener` types — the seam both engines satisfy. |
| `polling-sync.ts` | 1694 | `createPollingSync` — the full read engine (chat-list poll, delta detection, tail fetch, list-only hydration walk, deep sweep, read-state sweep, media-ready polling, fan-spend sweep, unread reconcile, hub-message ingest). Plus the exported `syncAccounts` bootstrap. |
| `hub-provider.ts` | 856 | `createHubAwareSync` — composes `PollingSync` + `HubSync` behind one `SyncProvider`; routes hub events into local ingest/reconciliation, applies replay snapshots, handles v2 gap recovery, keeps telemetry. |
| `hub-sync.ts` | 635 | `createHubSync` — the fetch-streaming SSE consumer of stream v2 (`event: domain`/`ephemeral`), cursor resume, 409 snapshot recovery, reconnect; plus the standalone `SseFrameParser`. |
| `mappers.ts` | 327 | Pure OFAPI/normalized-hub-payload → DB-upsert-row mappers (account, chat, message, hub-message, fan, transaction, media). |
| `budget-guard.ts` | 42 | `createBudgetGuard` — per-shift credit budget guard (≥80% warn, ≥100% → exhausted). |

Cross-references (not duplicated here): SSE/snapshot WIRE contract →
01-external-boundaries.md; SDK stream helpers (`subscribeSyncEvents` /
`subscribeDomainEvents`) → 02-kernel-sdk.md; OFAPI read-client internals →
05-ofapi-read-client.md; the send path (and the mark-read command) → 07;
DB writes/queries and the change-bus fanout → 09-data-model-storage.md.

## The `SyncProvider` seam (`provider.ts`)

`SyncProvider` (`provider.ts:27`) is the surface both `createPollingSync` and
`createHubAwareSync` implement; IPC handlers call it without knowing which mode
is active. Methods and their documented semantics:

| Method | Behavior |
|---|---|
| `start(accountIds)` / `stop()` | Lifecycle (`provider.ts:28-29`). |
| `subscribe(listener)` | Register a `SyncListener` for semantic `SyncEvent`s; returns unsubscribe (`:30`). |
| `refreshChat(acct, chat, purpose?)` | Automatic/background tail fetch (one page). Gated by `autoReadChats` because the body read marks the chat read (`:31-33`). |
| `readChatTailForUserOpen(acct, chat, purpose?)` | Deliberate single-chat read (QuickLook / in-chat ↻). Bypasses the auto-read gate; does NOT set `openConversation` or arm the sweep (`:34-40`). |
| `loadOlderMessagesForUserOpen(acct, chat)` | Deliberate scrollback (`first_id + desc`). Returns `{ returned, fresh, hasOlder }`; no bodies leaked (`:41-46`). |
| `ensureChat(acct, chat, hint?)` | Lazily resolve a chat-list metadata row for a deep Spenders fan (`:47-49`). |
| `openConversation` / `closeConversation` | Conversation focus; drives the read-state sweep + an immediate forced read (`:50-52`). |
| `setFocusedAccount` / `setWindowVisible` | Cadence/eligibility inputs (`:53-54`). |
| `forceRefresh(acct?)` | Manual deep refresh (`:55`). |
| `reconcileUnread(acct?, trigger?)` | Body-free `filter=unread` read-state reconcile (`:56`). |
| `status()` | `SyncStatusSnapshot` (`:57`). |

`SyncStatusSnapshot` (`provider.ts:16`): `freshness` (per-account ISO of last
successful list poll), `listVerifiedAt` (aliased to the *same* object in the
polling impl, `polling-sync.ts:1670`), `state` (`'live' | 'degraded' |
'offline'`), `pollIntervalsMs` (null = polling paused), `deepSweepEveryMs`.
`UnreadReconcileTrigger` (`provider.ts:9`): `'manual' | 'unread-tab' |
'window-focus' | 'account-focus' | 'timer'`.

Header note (`provider.ts:1-2`) says HubSync "swaps in behind the same surface."
The shipped code does not swap: `createHubAwareSync` **wraps**
`createPollingSync` and delegates every non-hub method straight through
(`hub-provider.ts:807-821`); the polling engine always runs.

## The `SyncEvent` union crossing main→renderer

`syncEventSchema` (`packages/shared/src/protocol/index.ts:308-320`) is a 10-member
discriminated union (`type` discriminant), the same union carried over Electron
IPC and hub SSE:

| # | `type` | Payload highlights | Schema |
|---|---|---|---|
| 1 | `chatListUpdated` | `accountId` only | `:201` |
| 2 | `messageReceived` | `accountId`, `chatId`, `messageId`, optional enriched `message` (`NormalizedSyncMessage`) | `:239` |
| 3 | `messageSent` | same shape as `messageReceived` | `:247` |
| 4 | `ppvUnlocked` | `accountId`, `chatId`, optional `messageId` | `:255` |
| 5 | `tipReceived` | `accountId`, `chatId`, optional `messageId`, optional `amountUsd` (dollars; never fabricated) | `:262` |
| 6 | `presence` | `accountId`, `chatId`, `online`, optional `lastSeenAt` | `:271` |
| 7 | `typing` | `accountId`, `chatId` | `:279` |
| 8 | `accountAuthChanged` | `accountId`, `authenticated` | `:285` |
| 9 | `readStateChanged` | `accountId`, `chatId`, optional `lastReadMessageId` | `:301` |
| 10 | `messageDeleted` | `accountId`, `messageId`, optional `chatId` (upstream carries no chat id — enriched locally) | `:291` |

The enriched `message` on members 2/3 is `NormalizedSyncMessage`
(`normalizedSyncMessageSchema`, `:220-235`), parsed tolerantly on the wire
(`tolerantNormalizedSyncMessageSchema`, `:237` — an invalid body becomes
`undefined`, degrading an enriched frame to id-only rather than dropping it).
`parseSyncEvent` (`:411`) returns null on failure. The union is emitted by both
engines through one listener set; the send engine subscribes to it
(`index.ts:660`, `engine.handleSyncEvent`).

## Credit-tagged read purposes

Every `OfApiClient` call declares an `OfApiPurpose`
(`packages/shared/src/activity/purposes.ts:5-22`); the credit meter tallies
per-purpose and `credit_log` persists per-day rows. The sync subsystem uses:
`'hot-poll'` (page-1 head walk), `'deep-sweep'` (5-page walk),
`'hydration'` (initial chat-list backfill + `getUserByUsername` fan detail),
`'unread-reconcile'` (body-free `filter=unread` scan), `'message-tail'`
(`fetchChatTail`/backfill/read-state sweep), `'media'` (media-ready re-poll via
`getMessage`), `'spend-sweep'` (fan transactions), and `'spenders'`
(`ensureChat` list lookup). Full label list at `purposes.ts:31-47`.

## `PollingSync` (`polling-sync.ts`)

Design premise (`polling-sync.ts:1-8`): the engine is a cost feature. The
chat-list poll is the primary change detector; message-body fetches happen only
on list deltas; hydration is **list-only** (never a tail-fetch per discovered
chat — at 900+ chats that would cost ~900 credits, measured on account "loravie"
2026-06-11).

`createPollingSync(options)` (`:243`) returns a `SyncProvider` plus the extra
methods `pollAccount`, `setHubPollingSuspended`, `refreshAccountHead`,
`ingestHubMessage`, `reconcileUnread` (return type declared `:243-258`).

### Options / injected gates (`PollingSyncOptions`, `:115-154`)

`client`, `data` (`DataLayer`), `toMediaUrl`, and callables:
`isBudgetExhausted` (×4 slowdown when the shift budget is spent, never stops,
`:119`), `autoReadEnabled` (`settings.autoReadChats`, default OFF — the gate on
all automatic message-body reads, `:121-129`), `spendSweepRollbackToLegacy`
(D6 rollback guard, `:130-134`), `isPruneFrozen` (Stage 12: retention prunes
freeze while a harvest is incomplete, `:135-140`), `unreadReconcileSettings`,
`now`, `sleep`, and the temporary diagnostics sink pair `onLog` / `readTransport`
(dated 2026-06-23, empty-thread investigation, `:146-153`). `readTransport` is
diagnostic-only — captured from `initialSettings.ofapiReadTransport`
(`index.ts:531`, now always `'hub'`) and used only as a log label; it feeds no
behavioral branch.

### Tunable constants (`:34-85`)

| Constant | Value | Meaning |
|---|---|---|
| `FOCUSED_POLL_MS` | 20 000 | Focused-account hot-poll cadence. |
| `UNFOCUSED_POLL_MS` | 60 000 | Other accounts. |
| `HIDDEN_FACTOR` | 4 | ×4 slowdown when the window is hidden. |
| `BUDGET_FACTOR` | 4 | ×4 slowdown when the shift budget is exhausted. |
| `HUB_LIST_REFRESH_DEBOUNCE_MS` | 2 000 | Coalesce body-free head refreshes for hub id-only/notification frames. |
| `CHATS_PAGE_LIMIT` | 10 | Requested chat-list page size (OnlyFans ignores >10; offset advances by what actually arrived). |
| `DEEP_SWEEP_PAGES` / `DEEP_SWEEP_INTERVAL_MS` | 5 / 5 min | Periodic deeper list walk for read-state/unread drift on older chats. |
| `HYDRATION_PAGES_PER_TICK` / `HYDRATION_MAX_PAGES` | 10 / 150 | Chunked resumable initial list walk; 150 is a runaway guard. |
| `READ_STATE_SWEEP_MS` | 30 000 | Read-state sweep cadence for the open chat. |
| `READ_STATE_SWEEP_IDLE_STOP_MS` | 10 min | Auto-stop the sweep after no `isNew` flip. |
| `READ_STATE_OWN_MESSAGE_MAX_AGE_MS` | 24 h | Only sweep for own `isNew` messages newer than this. |
| `MEDIA_READY_POLL_MS` / `_CAP_MS` | 15 s / 10 min | Re-poll not-yet-ready media; give up after cap. |
| `FAN_DETAIL_TTL_MS` | 5 min | Fan-profile refresh TTL. |
| `OFFLINE_AFTER_FAILURES` | 3 | `status()` → `offline` at ≥3 consecutive failures. |
| `USER_OPEN_COLD_PAGE_LIMIT` / `USER_BACKFILL_PAGE_LIMIT` / `USER_OPEN_BACKFILL_THRESHOLD` | 30 / 30 / 30 | Deliberate-open sizing. |
| `LEGACY_SPEND_SWEEP_INTERVAL_MS` / `REDUCED_SPEND_SWEEP_INTERVAL_MS` | 10 min / 60 min | Fan-spend sweep cadence (rollback-gated; default reduced 60 min, `:316-324`). |
| `SPEND_TX_PAGE_LIMIT` / `SPEND_SWEEP_MAX_PAGES` / `SPEND_SWEEP_OVERLAP_MS` / `SPEND_RETENTION_MS` | 10 / 100 / 60 min / 310 d | Fan-spend walk sizing/overlap/retention (retention 310 d, Stage 4 stop-loss, `:80-85`). |

Inter-page pacing during multi-page walks uses `OFAPI_INTER_PAGE_DELAY_MS`
(from `@chatgoose/shared`, injected via `sleep`, `:843`).

### Per-account loop state & scheduling

`AccountLoop` (`:158-170`) tracks three timers (`timer`, `spendTimer`,
`unreadReconcileTimer`), three in-flight flags, and last-run timestamps.
`loops` is `Map<accountId, AccountLoop>` (`:279`). Ambient state:
`focusedAccount`, `windowVisible`, `hubPollingSuspended`, `openConversation`,
plus `sweepTimer`, `mediaPollers`, `hubListRefreshes`, `historyCoverage`
(`:281-290`).

- `intervalFor(accountId)` (`:306`): returns `null` if `shouldSuspendLoop`
  (hub-suspended AND hydration done, `:302`), else `base × hidden × budget`.
  `null` means the poll timer is not re-armed.
- `schedule(accountId, delayMs)` (`:411`): self-rescheduling `setTimeout` that
  runs `pollAccount` then re-arms at `intervalFor`. `scheduleBurst` (`:428`)
  schedules delay 0 (used on focus/visibility resume).
- Overlap protection: `pollAccount` early-returns if `loop.inFlight`
  (`:1189`).

### The poll loop — `pollAccount(accountId, depth='hot')` (`:1187`)

1. Read persisted hydration state (`readHydration`, `:1195`). Decide `deepDue`
   (hydration done AND (depth `'deep'` or the 5-min deep interval elapsed),
   `:1196-1200`).
2. **Head walk** — `walkChatPages(accountId, 0, deepDue ? 5 : 1, purpose)`
   (`:1203`), purpose `'deep-sweep'` or `'hot-poll'`. Page 1 suffices on hot
   ticks (recency invariant, `order=recent`: any chat whose `lastMessage`
   changed resurfaces on page 1, `:47-50`).
3. **Delta detection** — `chatChanged` (`:810`) compares the chat ROW's own
   `lastMessageId`, `unreadCount`, `lastReadMessageId` baseline (hydration is
   list-only so the messages table is not a reliable baseline). Deltas carry a
   `wasCached` flag (`:1210-1229`).
4. **Persist list rows** — `upsertChatRows(accountId, head.chats)` (`:1230`)
   writes chat + fan rows only (never messages).
5. **Tail fetches (gated)** — only `if (autoReadEnabled())` (`:1236`): per delta,
   `fetchChatTail` then, post-baseline, emit `messageReceived`/`messageSent`
   (plus `tipReceived` with `amountUsd`) per fresh id (`:1237-1268`). Tail-fetch
   policy (`:1221-1228`): a cached changed chat is always fetched (silently
   swallowing downtime backlog); an uncached chat is fetched only post-baseline.
   Baseline history (`prevSuccessAt === null`) is not emitted as news.
6. **Always** emit `chatListUpdated` (`:1271`) — list/unread/previews update in
   both auto-read modes because they came from `listChats` (no read marked).
7. **Hydration chunk (if not done)** — walk `HYDRATION_PAGES_PER_TICK` more pages
   from `max(hydration.nextOffset, head.nextOffset)` with `preserveLocalHead`,
   persist the new `HydrationState` into the settings KV, emit `chatListUpdated`
   for progressive paint, and kick off the fan-spend sweep the moment hydration
   completes (`:1277-1297`).
8. Update `lastSuccessAt`/`lastDeepSweepAt`, reset `consecutiveFailures`, arm the
   unread reconcile (`:1299-1304`). On throw, bump `consecutiveFailures`
   (`:1306`) — the only place the health counter moves.

### Chat-list walking & hydration state

- `walkChatPages` (`:829`) requests `limit=10, order=recent, skipUsers='none'`;
  advances `offset` by `chats.length`; dedupes fan ids across pages (recency
  reshuffle can repeat a chat); stops when `nextPageUrl === null` or an empty
  page (`exhausted`).
- Hydration progress persists per account under `sync.chatHydration.<accountId>`
  (`hydrationKey`, `:194`), schema `{ nextOffset, pagesWalked, done }`
  (`:185-190`). Restarts resume; on `start()` a done-hydration account schedules
  the spend sweep immediately (`:1496-1498`).
- `applyLocalHeadGuard` / `cachedHeadIsNewer` (`:892`/`:878`): during
  hydration/unread-reconcile upserts, a stale deeper page never regresses a
  locally-newer head (compares `lastMessageAt` then `lastMessageId`).

### Tail fetch — `fetchChatTail` (`:467`)

The single seam through which message bodies are read; every caller is one of
the four thread-fetch paths (poll-delta, conversation open, quick-look hydrate,
scoped refresh). Behavior:

- Reads the newest cached message id; if present, requests `last_id + order=asc`
  (boundary-inclusive ascending tail, dedupe by id); if absent, a cold
  `order=desc` page (`coldLimit`, default 100). `recentWindow:true` forces a
  `desc` reload ignoring the boundary (`:482-511`).
- **One page max** — never paginates deeper; a side absent from the newest 100
  renders "—" honestly (`:460-466`).
- Stamps per-fan freshness via `data.threadFetchLog.stamp(...)` (`:532`) —
  including for empty threads, so automatic paths never re-spend on fans who
  never wrote.
- Upserts mapped messages (`mapMessage`) then `pruneMessages` (retention
  5 000/chat, frozen when `isPruneFrozen()`, `:266-270`/`:542`).
- Media polling (`trackUnreadyMedia`) is enrolled only when `force ||
  autoReadEnabled()` (`:597`) — because `getMessage` is itself a body read.
- Returns `{ freshIds, hadCachedMessages }`. Wrapped in heavy temporary
  diagnostic logging (`onLog('info'/'warn', 'diag openTail', …)`, `:513`/`:573`).

Deliberate-open composition — `readHistoryForExplicitUserOpen` (`:708`): if the
local window is small (`0 < count < 30`) it reloads the recent desc window then
`backfillSmallLocalWindow` → `backfillOlder`; otherwise a normal forced tail.
Always `force=true`, `priority:'user'`, `retry:'none'`.

Scrollback — `backfillOlder` (`:606`): `first_id + order=desc` older than the
oldest local row; caches per-thread coverage in `historyCoverage`
(`hasOlder=false` short-circuits future calls); returns `{ returned, fresh,
hasOlder }`.

### Read-state sweep (`:1312-1375`)

Detects when the fan reads the chatter's own messages (flips OnlyFans `isNew`),
running only for the currently open conversation.

- `sweepEligible` (`:1313`): requires the window visible AND an open conversation
  with a recent own message still `isNew` (newer than the 24 h cutoff).
- `scheduleSweep` (`:1326`): arms a 30 s timer **only when `autoReadEnabled()`**
  (`:1333`) — the sweep's `listMessages` marks the open chat read.
- `runSweep` (`:1341`): re-checks `autoReadEnabled()`, eligibility, and the
  10-min idle-stop; fetches `order=desc limit=50`; if any own message flipped
  `isNew → false`, emits `readStateChanged` (`:1370`).

### Hub-suspension & unread reconcile

- `setHubPollingSuspended(suspended)` (`:1625`): flips `hubPollingSuspended`; per
  account either cancels the poll timer (`shouldSuspendLoop` true) or restores
  normal cadence. Called by the hub-aware wrapper when SSE goes live/down.
- While the loop is suspended and there is local unread, a body-free
  `filter=unread` reconcile catches chats read elsewhere (e.g. OnlyMonster) that
  never resurface on the recency head:
  - `UnreadReconcileSettings` + `DEFAULT_UNREAD_RECONCILE_SETTINGS`
    (`:87-113`): triggers (`unread-tab`/`window-focus`/`account-focus`),
    `focusDebounceMs` 30 s, immediate/focused/hidden max-pages and intervals.
  - `runUnreadReconcile` (`:928`): `walkChatPages(..., filter:'unread')` (purpose
    `'unread-reconcile'`), upserts heads with `preserveLocalHead`, and — only if
    the scan was `exhausted` — clears locally-unread chats that did not come back
    AND whose head is unchanged since the scan started (head-fence guards against
    SSE advancing a chat mid-scan). Emits `chatListUpdated`. Swallows errors so
    it never poisons `consecutiveFailures`.
  - `reconcileUnread` (`:1012`, public): dedupes by `focusDebounceMs`, requires
    suspended (except `manual`) and local unread. `armUnreadReconcile` /
    `scheduleUnreadReconcile` (`:397`/`:378`) manage the timer.
  - This reconcile issues no message-body reads and marks nothing read
    (list-only), so it runs in both auto-read modes.

### Fan-spend sweep (`:1377-1457`)

Independent of chat-list polling and of hub suspension. `sweepFanSpend`
(`:1387`) walks `listTransactions` into `fan_transactions`. First run pulls the
full `-30days` window; later runs resume from the newest cached row minus a 1 h
overlap (steady state ~1 page/sweep) via `paginateMarker` with an `'until'`
predicate on `createdAt`. `runSpendSweep` (`:1425`) runs only after hydration is
done (`:1430`); defers (reschedules) when the budget is exhausted (`:1433-1436`).
Cadence is `spendSweepIntervalMs()` (`:316`): legacy 10 min if
`spendSweepRollbackToLegacy()`, else reduced 60 min. The stamp advances even on
failure so a broken transactions endpoint retries at cadence, not on the poll
loop (`:1452-1455`).

### Fan-detail refresh, ensureChat, bootstrap

- `refreshFanDetail` (`:1459`): fire-and-forget `getUserByUsername` (purpose
  `'hydration'`) on conversation open, TTL-guarded (5 min), fail-open on 404.
  A profile read, not a chat-message read → does not mark a chat read.
- `ensureChat` (`:1048`): `listChats(query=username)` (purpose `'spenders'`) to
  synthesize a chat row for a deep Spenders fan; list read, no mark-read.
- `syncAccounts` (`:1681`, exported): `listAccounts` (purpose `'hydration'`) →
  `mapAccount` upserts at boot; returns account ids to poll.

### Hub-message ingest & event-driven head refresh

- `ingestHubMessage` (`:1135`) is the body-free local write for enriched hub
  message events: maps via `mapHubMessage`, refuses to resurrect a local
  tombstone (`:1146-1148`), upserts + prunes, tracks media only if auto-read ON
  (`:1153`), then recomputes the chat head (unread ±, preview, monotonic
  `advances` guard via `hubMessageAdvances`, `:1163-1183`) so previews/unread
  stay correct with no OFAPI read.
- `refreshAccountHead` (`:1108`) coalesces body-free page-1 list refreshes for
  hub id-only/notification activity through a 2 s debounce
  (`armHubListRefresh` → `refreshAccountHeadNow`, `:1076`/`:1094`).

## Auto-read semantics — which reads mark a chat read

The pinned fact (encoded throughout the comments): **`GET /messages` marks the
chat read on OnlyFans.** There is no explicit mark-read call in the sync engine
(the write client fails it closed). Read-marking therefore happens purely as a
side effect of message-body GETs. The gate is `autoReadEnabled()` =
`settingsCache.autoReadChats` (default **false**, `store.ts:167`/`:240`;
`index.ts:528`).

Only **automatic/background** message-body reads are gated. Never gated:
`listChats`/list reads (they never mark read) and a deliberately-opened chat
(must always load).

| Read call | Site | Marks read? | Gated by `autoReadChats`? |
|---|---|---|---|
| `listMessages` in `fetchChatTail` via **poll-delta** | `:1238` inside `if (autoReadEnabled())` `:1236` | Yes | Yes — skipped when OFF; only `chatListUpdated` fires. |
| `listMessages` in `fetchChatTail` via **`refreshChat`** (hub reactions / scoped Spenders) | `:1544` | Yes | Yes — when OFF, `refreshChat` early-returns to `refreshAccountHead` (list-only, `:1540-1542`). |
| `listMessages` in `fetchChatTail` via **`openConversation`** / **`readChatTailForUserOpen`** | `readHistoryForExplicitUserOpen` `:718`, `force=true` | Yes | No — the sanctioned read; always runs. |
| `listMessages` (`first_id+desc`) in **`backfillOlder`** (scrollback) | `:625` | Yes | No — deliberate user action; always runs. |
| `listMessages` (`desc limit 50`) in **read-state sweep** `runSweep` | `:1351` | Yes | Yes — `scheduleSweep` arms only when ON (`:1333`); `runSweep` re-checks (`:1343`). |
| `getMessage` (media-ready re-poll) in **`trackUnreadyMedia`** | `:748` | Yes (body read) | Yes — enrolled only when `force || autoReadEnabled()` (`:597`); in hub ingest only when ON (`:1153`). |
| `getUserByUsername` in **`refreshFanDetail`** | `:1469` | No (profile read) | n/a (TTL-guarded only). |
| `listChats` (head/deep/hydration/unread-reconcile/`ensureChat`) | `walkChatPages` `:845`, `ensureChat` `:1060` | No | Never gated. |
| `listTransactions` (fan-spend sweep) | `:1401` | No | Not gated (budget-gated instead). |

`openConversation` (`:1558`) additionally sets focus, re-arms the read-state
sweep, clears the local unread count body-free (`:1570-1590`, runs in both
modes, only after the read succeeds so a failed open doesn't hide still-unread
chats), schedules an unread reconcile, and fires `refreshFanDetail`.
`readChatTailForUserOpen` (`:1547`) uses the same force path but does NOT set
focus or arm the sweep (used by the in-chat ↻ and QuickLook).

Note on `markAsReadOnOpen`: this settings field (`store.ts:166`, default false
`:237`) is **not consumed by the sync subsystem**. It drives an explicit OnlyFans
mark-read *command* through the send engine (debounced ~1.5 s in main, gated on
`settings.markAsReadOnOpen`; `apps/desktop/src/main/send/engine.ts:865`,
`preload/contract.ts:872`) — that command path is owned by 07, distinct from the
GET-marks-read side effect above. Within sync, only `autoReadChats` and the
`unreadReconcile` settings steer read behavior.

## `createHubAwareSync` — composition & mode selection (`hub-provider.ts`)

`createHubAwareSync` (`hub-provider.ts:172`) implements `SyncProvider` by wrapping
the `PollingLike` engine (`:48-57`) and a lazily-created `HubSync`. `createHub`
(injected) resolves `null` when hub config is absent → polling-only
(`index.ts:546-578`).

### One listener set, delegation

`polling.subscribe(emit)` (`:383`) forwards all polling events unchanged through
the hub-aware provider's own listener set, so the send engine's subscription
works identically in both modes. Every non-hub `SyncProvider` method delegates
straight to `polling` (`:807-821`), including `setWindowVisible`
(`:817`) — so **window-visible gating lives entirely in the polling engine**
(`HIDDEN_FACTOR` in `intervalFor`, `unreadIntervalFor` hidden branch, and
`scheduleBurst` on visibility resume, `polling-sync.ts:311`/`:349-364`/`:1614-1623`),
not in the hub layer.

### Polling-vs-SSE selection (`handleHubStatus`, `:669`; `startHub`, `:714`)

The wrapper never chooses "polling or SSE" as data sources — polling always
runs; SSE *liveness* suspends the polling loop after hydration:

- SSE goes **live** → `polling.setHubPollingSuspended(true)` (poll loop pauses
  after hydration; read-state and spend sweeps unaffected) (`:694-696`).
- SSE goes **not-live** (degraded/stopped) → `setHubPollingSuspended(false)` AND
  one `polling.forceRefresh()` reconciliation sweep to close the gap
  (`:697-702`).
- `hubModeOverride` (`'auto' | 'polling' | 'hub'`, dev/support D3 override,
  resolved from `settingsCache.hubModeOverride`, `index.ts:543`): `'polling'`
  skips SSE entirely and resumes polling (`startHub` `:718-728`); `'hub'` keeps
  polling suspended even while SSE is not live (`:674-693`, `:755-759`); `'auto'`
  is the production behavior above.
- `hubMode()` (`:779`) collapses `hub.status()` to `'live' | 'degraded' | 'off'`
  for the UI. `hubStatus()`, `hubActivity()`, and `subscribeStatus()` surface
  liveness/telemetry (`:830-854`).

### Event routing (`handleHubEvent`, `:554`)

| Event | Handling | Fallback reason |
|---|---|---|
| `messageReceived` / `messageSent` with an enriched, id-matching `message` | `polling.ingestHubMessage` (body-free upsert), emit, `recordApplied` (`:557-570`). | — |
| …with mismatched id / missing body / ingest error | falls through to `polling.refreshChat` (list-only when auto-read OFF), still emit (`:572-610`). | `hub-mismatched-message-fallback` / `hub-id-only-fallback` / `hub-malformed-message-fallback` / `hub-ingest-error-fallback` |
| `ppvUnlocked` / `tipReceived` | notification-shaped → `polling.refreshChat` + emit (`:612-629`). | `hub-notification-fallback` |
| `messageDeleted` | resolve `chatId` (event or `lookupChatId` raw-SQL probe `:386`), `data.messages.markDeleted`, `refreshAccountHead`, emit. Unknown id → head refresh only, drop (`:630-654`). | `unknown-delete-head-refresh` |
| `chatListUpdated` | `polling.refreshAccountHead` (`:655-662`). | — |
| default (typing/presence/accountAuthChanged…) | emit as-is (`:663-665`). | — |

`HubFallbackReason` union at `:22-33` (includes `hub-replay-gap-snapshot` and
`hub-v2-gap-cursor-rebaseline`).

### Snapshot application (`applyHubSnapshot`, `:453`)

Applied for v1 snapshot recovery. Rejects snapshots for unhandled accounts
(`:454`); sets account auth state (`:457-462`); upserts thread heads
(`upsertSnapshotThread`, `:415`, with a `snapshotHeadIsCurrent` recency guard
`:405`); for each message either **merges monotonic webhook facts** onto an
existing local body (preserving a body a concurrent REST read may have corrected
— only bumps `isOpened`/`isTip`/`tipAmount`, `:479-498`) or ingests a new one via
`polling.ingestHubMessage` (`:499-508`); applies `deletedAt` tombstones and
`unresolvedTombstones` (`:510-520`); re-applies authoritative heads; emits
`chatListUpdated` (`:522-526`).

### v2 gap recovery (`handleV2GapRecovered`, `:540`)

Stage 24: the v2 snapshot is a fresh-cursor handshake, not projection pages
(decision #92). When `HubSync` reports gap recovery, this records the
`hub-v2-gap-cursor-rebaseline` fallback and reconciles the missed window through
the authoritative polling path — `polling.refreshAccountHead` per handled
account, then emits `chatListUpdated` (`:544-551`).

### Telemetry (`:118-368`, `:833-854`)

Persists a daily + lifetime event counter under `hubSync.eventStats` in the
settings KV (survives restarts, migrates a pre-`lifetime` shape at
`:238-251`) covering received/applied/fallback/dropped by type and
`fallbackByReason`. Surfaced via `hubActivity()` (`:833`) as
`HubActivitySnapshot` (`:91-116`).

## `HubSync` — the SSE stream-v2 consumer (`hub-sync.ts`)

`createHubSync` (`hub-sync.ts:219`) is a fetch-streaming consumer. Header
contract notes (`:1-10`): frames `id:<seq>\nevent:<name>\ndata:<JSON>\n\n`;
`retry: 3000` on connect; `: keep-alive` comment every 30 s; the server closes
every stream at the ~15-min max lifetime (reconnect with resume is the normal
path, not an error); 401/403 = permanent stop.

- **Protocol default `'v2'`** (`:226`); constructing v2 requires
  `getV2Cursor`/`setV2Cursor` or it throws (`:227-229`). `streamUrl` (`:252`)
  builds the v2 URL `HUB_V2_SSE_PATH` with `?cursor=<opaque>`; the v1 branch uses
  `HUB_SSE_PATH` with `?lastEventId=<seq>`.
- **`SseFrameParser`** (`:57`) — a standalone WHATWG-SSE-subset line parser
  (split chunks, `:` comments, multi-line `data`, CRLF, sticky `id`, `retry`).
  Unit-tested directly.
- **Frame handling** — `handleFrame` (`:263`) dispatches by protocol.
  `handleV2Frame` (`:293`): `event: ephemeral` (typing) is parsed via
  `parseSyncEvent`, applied, and **never checkpointed** (serve-time-only lane,
  `:294-314`); `event: domain` is parsed via `parseDomainEventFrame`, mapped by
  `mapDomainFrame`, filtered by `allowedAccountIds`, awaited, then the opaque
  frame id is persisted as the v2 cursor — **even unmapped/unknown types
  checkpoint** (forward-compat: the cursor must advance past ignored events,
  `:315-339`). The v1 `handleFrame` path (`:267-290`) parses `event: sync` JSON
  via `parseSyncEvent`, filters by account, awaits `onEvent`, then persists
  `frame.id` as `lastEventId`. Both paths checkpoint **after** handling
  (handle-then-checkpoint so a crash mid-handle replays, never skips).
- **Connection loop** — `runLoop` (`:561`) / `connectOnce` (`:466`): a 45 s
  byte-silence watchdog (`HUB_WATCHDOG_MS`, `:36`) aborts a dead pipe; status
  flips to `'live'` on the **first byte** received, not on response headers
  (`:530-536`), so a proxy that answers 200 then stalls never demotes polling. A
  clean 15-min close reconnects silently while status stays `'live'`
  (`:575-580`). Backoff is exponential capped at `HUB_RECONNECT_CAP_MS` 30 s
  (`:610-613`). Statuses: `'connecting' | 'live' | 'degraded' | 'auth-failed' |
  'stopped'` (`:139`); 401/403 → `auth-failed`, permanent stop (`:487-489`,
  `:570-573`).
- **Snapshot recovery on 409** — `connectOnce` inspects a 409 response
  (`:490-507`): under v2, validates `domainSnapshotRequiredSchema` (version 2)
  → `{ kind: 'snapshot-v2' }`; under v1, validates `syncSnapshotRequiredSchema`
  (version 1) → `{ kind: 'snapshot', requirement }`. `recoverV2Cursor` (`:345`)
  GETs `HUB_V2_SNAPSHOT_PATH`, validates `domainSnapshotResponseSchema`, persists
  the fresh cursor, then calls `onV2GapRecovered` (caller reconciles via
  polling). `recoverSnapshots` (`:380`, v1) paginates `HUB_SNAPSHOT_PATH` per
  allowed account (`afterSeq`, `pageCursor`, `limit=50`, sticky
  `snapshotCursor`), validates each page (`syncSnapshotResponseSchema`), applies
  via `onSnapshot`, refuses to advance on partial / cursor-changed / scope
  mismatch, and only then sets `lastEventId` to the snapshot cursor
  (`:458-463`).
- Cursor persistence keys (`index.ts:571-576`): `hubSync.lastEventId` (v1
  numeric fanout_seq) and `hubSync.v2Cursor` (v2 opaque string) — separate keys,
  the v1 key retained untouched for the fallback window.
- `HubSync` interface (`:203-209`): `start`/`stop`/`status`/`droppedFrameCount`.
  Injectable `fetchImpl`/`sleep`/`now`.

## Mappers (`mappers.ts`)

The only place raw OFAPI/normalized-hub shapes are interpreted for storage.
Remote media URLs become opaque `media://` tokens here (via injected
`ToMediaUrl`, `:27`).

| Function | Input → output | Notes |
|---|---|---|
| `mapMediaItem` (`:49`) | rich media → `MessageMediaItem` | zod `richMediaSchema`; thumb/full URL, `locked = canView === false`, drops null-id items. |
| `mapAccount` (`:70`) | `OfApiAccount` → `AccountUpsert` | `authState` from `is_authenticated`. |
| `mapChat` (`:108`) | `OfApiChat` → `ChatUpsert \| null` | `chatId === fan.id`; chats without a fan dropped; `preview` via `previewOf` (`:82`); `pinned` hardcoded false. |
| `mapMessage` (`:141`) | `OfApiMessage` → `MessageUpsert` | text→plain via `htmlToPlainText`; `replyTo` preview 120 chars; media mapped to tokens; `deleted:false`. |
| `mapHubMessage` (`:181`) | `NormalizedSyncMessage` → `MessageUpsert \| null` | body-free path; **media stores `thumbUrl/fullUrl = null`** (hub frames carry no URLs, `:211-219`); rejects empty id / unparseable date. |
| `mapFan` (`:231`) | `OfApiUser` → `FanUpsert` | spend aggregate, subscription status (`active`/`expired`/`none`), `autoRenewOff` from the current subscribe entry's `cancelDate`. |
| `avatarMediaUrl` (`:291`) | smallest avatar thumb → token. |
| `mapFanTransaction` (`:302`) | `OfApiTransaction` → `FanTransactionUpsert \| null` | drops rows with no fan / non-positive amount / unparseable date; `net = tx.net` else `0.8 × amount` (20% platform cut); `createdAt` normalized to ISO-UTC. |

## Budget guard (`budget-guard.ts`)

`createBudgetGuard` (`budget-guard.ts:19`) is a per-shift credit guard:

- `isExhausted()` — `budget !== null && budget > 0 && usedToday >= budget`
  (`:23-26`). Wired into `PollingSync.isBudgetExhausted` (`index.ts:525`) → ×4
  poll slowdown (never stops) and defers the fan-spend sweep; also gates the
  Spenders refresh queue (`index.ts:655`).
- `check()` — fires `onWarning` at ≥80% (a module-local `warned` flag, reset
  only by `resetWarning()`; despite the interface comment "once per UTC day"
  (`:14`) there is no day tracking in this file — day rollover is not re-armed
  here) (`:27-37`). `onWarning` shows an OS notification (`index.ts:453-460`).
- Inputs injected from the composition root: `getBudget` =
  `settingsCache.creditBudgetPerShift`, `getUsedToday` =
  `creditMeter.snapshot().usedToday`; `check()` runs on every credit-meter update
  (`index.ts:450-490`). The credit meter itself is owned by 05.

## Composition-root wiring (`apps/desktop/src/main/index.ts`)

The runtime-activation function builds the chain: the hub-proxied read client
`nextClient` (through `createOfApiTransportClient`) → `createBudgetGuard`
(`:450`) → `createPollingSync` (`:519`, receiving `client: nextClient`, the
gates `isBudgetExhausted`/`autoReadEnabled`/`spendSweepRollbackToLegacy`/
`unreadReconcileSettings`/`isPruneFrozen`, and the diagnostic
`onLog`/`readTransport`) → `createHubAwareSync` (`:539`, with `createHub`
building `createHubSync` per (re)connect from `settingsStore` + keychain, protocol
`vm.hubSyncProtocol`, and the two cursor accessors). `nextSync.subscribe(...)`
feeds the send engine (`:660`); `syncAccounts` (`:677`) returns the account ids
to `start()`. Hub config is reconnected only on a base-URL/key/mode/protocol
fingerprint change (`hubConfigFingerprint`, `:508`; `recheckNextHubConfig`,
`:594`), never on every settings write (HubSync itself writes cursor keys into
the same settings table).
