> Generated 2026-07-12 from docs/project-kernel/prompt-1-map.md at commit 8aaf3ea.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.
> Working-tree note: this snapshot includes the uncommitted sync-hardening
> changes present in the desktop working tree on 2026-07-12.

# ChatGoose Desktop — Sync and Reads

## Scope and source boundary

This chapter maps the current read/sync implementation from code. Its primary
sources are:

- `apps/desktop/src/main/sync/provider.ts`
- `apps/desktop/src/main/sync/polling-sync.ts`
- `apps/desktop/src/main/sync/hub-sync.ts`
- `apps/desktop/src/main/sync/hub-provider.ts`
- `apps/desktop/src/main/sync/mappers.ts`
- `apps/desktop/src/main/sync/budget-guard.ts`
- `apps/desktop/src/main/ofapi/transport.ts`
- `apps/desktop/src/main/index.ts`
- `packages/shared/src/protocol/index.ts`
- `packages/shared/src/activity/purposes.ts`

The runtime is a hybrid, not a choice between two independent providers:

1. All OFAPI-shaped reads go through core's read gateway.
2. `PollingSync` owns account bootstrap, chat-list hydration, explicit message
   reads, unread reconciliation, media readiness, and spend reconciliation.
3. `HubSync` consumes core's SSE stream v2. While that stream is live,
   `HubAwareSync` suspends periodic polling for accounts whose hydration is
   complete; the polling object remains alive for the other read paths.
4. Both providers mutate the encrypted local SQLite mirror and publish one
   `SyncEvent` stream to the renderer and send engine.

The previous statement that stream-v2 gap recovery is a fresh cursor followed
by polling-only reconciliation is no longer true in this working tree. Current
v2 recovery is fail-closed: authenticate a fresh cursor, refresh the actual
read-gateway account grants, apply every durable state-snapshot page for every
granted account, and only then persist the opaque cursor.

## File inventory

| File | Current lines | Role |
|---|---:|---|
| `sync/provider.ts` | 58 | Public `SyncProvider` and health/status types. |
| `sync/polling-sync.ts` | 1,825 | Polling, hydration, explicit history reads, unread/media/spend reconciliation, grant-loop management, and account bootstrap. |
| `sync/hub-sync.ts` | 723 | SSE parser, v1/v2 stream consumer, cursor handling, reconnect logic, and durable snapshot recovery. |
| `sync/hub-provider.ts` | 860 | Composition, event routing, snapshot application, grant refresh, polling suspension, and telemetry. |
| `sync/mappers.ts` | 327 | OFAPI and normalized hub payloads to database upserts. |
| `sync/budget-guard.ts` | 42 | Per-shift warning/exhaustion gate. |

## External read and live-event boundaries

### Hub-only OFAPI reads

`apps/desktop/src/main/ofapi/transport.ts` defines
`OfApiReadTransport = 'hub'`. `buildHubOfApiReadBaseUrl` normalizes the configured
hub URL to `/api/v1/ofapi/read`. `createOfApiTransportClient` delegates every
read method to that read client and fails app-level direct writes closed.

`apps/desktop/src/main/index.ts` creates the read client with the resolved hub
credential, the hub read-gateway URL, a request timeout, the credit meter, and
`x-client-version`. It passes the resulting client to `createPollingSync`.
Consequently, names such as `listChats`, `listMessages`, and `listAccounts`
describe OFAPI-shaped operations, but their network destination is core.

The read-gateway methods used by this subsystem include account, chat, message,
fan-profile, and transaction reads. Explicit writes such as send, delete,
typing, mark-read, and upload do not have a direct path through this client;
write custody is mapped separately in `docs/generated/07-send-engine-outbox.md`.

### SSE endpoints and checkpoints

`apps/desktop/src/main/sync/hub-sync.ts` declares four endpoints:

| Protocol | Stream | Snapshot endpoint |
|---|---|---|
| v2 default | `/api/v1/events/v2/stream` | `/api/v1/events/v2/snapshot` for a fresh opaque cursor; `/api/v1/events/snapshot` for durable state pages during recovery |
| v1 fallback | `/api/v1/events/stream` | `/api/v1/events/snapshot` |

The default setting is v2; v1 remains a settings-file fallback. The numeric v1
checkpoint is stored under `hubSync.lastEventId`. The v2 checkpoint is stored
under a credential-scoped key of the form
`hubSync.v2Cursor.<sha256-prefix>` in `apps/desktop/src/main/index.ts`, so a
credential replacement does not inherit a cursor earned by another bearer.
`clearV2Cursor` remains in the construction interface for wiring compatibility,
but the recovery state machine does not call it.

## The public provider and event seam

`apps/desktop/src/main/sync/provider.ts` exposes `SyncProvider`:

| Method | Current behavior |
|---|---|
| `start` / `stop` | Start or stop handled account loops. |
| `subscribe` | Subscribe to the unified semantic event stream. |
| `refreshChat` | Automatic one-page tail refresh; list-only when auto-read is disabled. |
| `readChatTailForUserOpen` | Deliberate message read that bypasses the automatic-read gate without changing conversation focus. |
| `loadOlderMessagesForUserOpen` | Deliberate `first_id + desc` scrollback before the oldest local row. |
| `ensureChat` | Resolve a list metadata row for a fan outside local hydration. |
| `openConversation` / `closeConversation` | Manage conversation focus, explicit read, and read-state sweep. |
| `setFocusedAccount` / `setWindowVisible` | Update cadence and immediate unread-reconcile inputs. |
| `forceRefresh` | Deep list sweep for one or all handled accounts. |
| `reconcileUnread` | Body-free `filter=unread` reconciliation. |
| `status` | Poll freshness, effective intervals, and failure-derived health. |

`packages/shared/src/protocol/index.ts` defines the ten-member `SyncEvent`
union crossing main to renderer: `chatListUpdated`, `messageReceived`,
`messageSent`, `ppvUnlocked`, `tipReceived`, `presence`, `typing`,
`accountAuthChanged`, `readStateChanged`, and `messageDeleted`.

Message-received/sent events may carry a normalized message. That nested body is
tolerant: schema drift removes the optional body and leaves the id-only event,
which routes through the safe fallback. `messageDeleted.chatId` is optional
because upstream deletion frames do not necessarily carry it. All hub wire
objects are validated at this shared protocol boundary before local handling.

## `PollingSync`

### Core scheduling constants

The current constants in `apps/desktop/src/main/sync/polling-sync.ts` are:

| Behavior | Value |
|---|---:|
| Focused-account hot poll | 20 s |
| Other-account hot poll | 60 s |
| Hidden-window multiplier | 4× |
| Exhausted-budget multiplier | 4× |
| Hub list-refresh debounce | 2 s |
| Head-reconcile wait interval | 250 ms |
| Requested chat-list page size | 10 |
| Deep sweep | up to 5 pages every 5 min |
| Initial hydration | 10 pages per tick, 150-page cap |
| Open-chat read-state sweep | every 30 s; idle stop at 10 min |
| Own-message age eligible for sweep | 24 h |
| Media-ready poll | every 15 s, 10-min cap |
| Fan-detail TTL | 5 min |
| Offline health threshold | 3 consecutive poll failures |
| Explicit-open / scrollback page size | 30 |
| Spend sweep | 60 min normally; 10 min behind rollback setting |
| Spend overlap / retention | 1 h / 310 d |

Every client call has an `OfApiPurpose` from
`packages/shared/src/activity/purposes.ts`. This subsystem uses the list,
hydration, unread, message-tail, media, spend, and Spenders purposes; the credit
meter and `credit_log` preserve their counts.

### Per-account loops and grant replacement

Each account loop tracks poll, spend, and unread timers; three in-flight flags;
last-success/deep/spend/unread timestamps; and consecutive failures.

`start(accountIds)` installs or reuses loop objects and starts an immediate
poll. `stop()` clears active timers without deleting loop state; restarting the
same provider re-arms those retained loops and performs a new immediate poll.

`refreshAccountGrants()` is the authenticated v2 recovery seam:

1. It calls the exported `syncAccounts`, which performs read-gateway
   `listAccounts({ purpose: 'hydration' })`, maps/upserts returned accounts, and
   returns their OFAPI account ids.
2. It deduplicates that result and removes loops absent from the new set.
3. Removal deletes the loop before cleanup, clears poll/spend/unread timers,
   resolves pending debounced head refreshes, clears account media timers and
   history-coverage entries, and clears removed focus/open-conversation state.
4. Cached account/chat/message rows are not deleted. The removed account is
   marked `unauthenticated`, making it non-live while preserving local history.
5. Newly granted accounts receive loops before snapshot application. They are
   scheduled at normal cadence rather than polled immediately, so the following
   durable snapshot normally wins the initial state race.

The returned id list becomes both `HubAwareSync`'s handled-account set and
`HubSync`'s event/snapshot allowlist. An empty list is a valid authenticated
grant state: every old loop is removed and no replacement loop is created.

### Single-flight behavior

`pollAccount` claims `AccountLoop.inFlight` synchronously and returns if another
poll owns it. `reconcileAccountHeadNow` uses the same flag: it waits while an
owner is active, claims the flag before its first awaited head request, runs one
page-1 refresh, and releases in `finally`. While waiting and immediately before
the request, it verifies that the provider is still running and the same loop
is still registered. A queued reconcile therefore exits when its grant is
revoked instead of issuing a late request for a removed account.

The ordinary event-driven `refreshAccountHead` path is separately debounced.
Pending debounced refreshes are resolved and removed when an account loop is
revoked.

### Poll algorithm and hydration

`pollAccount(accountId, depth = 'hot')` is the primary detector:

1. Read the persisted hydration cursor.
2. Walk page 1 for a normal hot tick, or up to five pages when a deep sweep is
   due or explicitly requested.
3. Compare list heads with local chat rows. A changed last-message id, unread
   count, or read boundary is a delta.
4. Upsert chat and fan list rows.
5. If automatic message reads are enabled, fetch one changed-chat tail and
   emit fresh message/tip events. The initial process baseline is applied
   silently so downtime backlog does not replay as live notifications.
6. Emit `chatListUpdated` regardless of the body-read gate.
7. If hydration is incomplete, walk another chunk of up to ten list pages,
   persist progress under `sync.chatHydration.<accountId>`, and paint
   progressively. Hydration never reads every chat body.
8. Update freshness/deep timestamps, clear the failure counter, and arm unread
   reconciliation. Throws increment the failure counter.

`walkChatPages` requests `order=recent`, `skipUsers=none`, and `limit=10`, then
advances offsets by the number of rows actually received. It deduplicates fan
ids and treats an empty result or absent next-page URL as exhaustion. Deeper
hydration and unread scans apply a local-head fence so stale pages do not regress
a newer SSE/list head.

### Message bodies and explicit reads

`fetchChatTail` is the central one-page body-read seam. With a cached boundary
it uses `last_id + order=asc`; without one it loads a descending cold page.
Results are deduplicated, mapped, upserted, retention-pruned unless harvest has
frozen pruning, and stamped in `thread_fetch_log` even when empty.

`readHistoryForExplicitUserOpen` always forces the read. A small local window is
reloaded as a recent descending page and then backfilled. `backfillOlder` uses
`first_id + order=desc` and remembers thread coverage so an exhausted history
does not refetch indefinitely.

The externally observed invariant encoded by the implementation is that a
message-body GET marks the OnlyFans chat read. Therefore:

| Read | Automatic-read gate |
|---|---|
| Poll-delta tail fetch | Required |
| Hub fallback `refreshChat` | Required; becomes list-only when disabled |
| Read-state sweep | Required |
| Background media-ready `getMessage` | Required |
| `openConversation` | Bypassed: explicit user read |
| `readChatTailForUserOpen` | Bypassed: explicit user read |
| User scrollback | Bypassed: explicit user read |
| Chat lists, account lists, profiles, transactions | Not message-body reads |

After a successful explicit conversation read, `openConversation` clears the
local unread flags, schedules unread reconciliation, and refreshes fan detail.
The explicit mark-read command is not part of this subsystem.

### Unread, media, spend, and local hub ingest

- The body-free unread reconcile walks `filter=unread`. It clears missing local
  unread rows only after an exhaustive capped scan and only when the chat head
  did not move during the scan.
- The open-chat read-state sweep looks for recent own messages whose upstream
  `isNew` flips to false. It runs only while eligible and automatic reads are
  enabled.
- Media items whose mapped `isReady` flag is false are re-read every 15 seconds for at most ten
  minutes. Revoking an account cancels its pollers, and completion handlers do
  not re-arm a poller for an account whose loop disappeared.
- Fan spend walks transactions newest-first, overlaps the last hour, stores
  normalized transaction rows, and prunes transaction rows beyond 310 days.
  The injected harvest-freeze gate controls message retention pruning, not this
  transaction prune.
- `ingestHubMessage` maps a complete normalized hub body directly into SQLite,
  refuses to resurrect a tombstone, updates the chat head monotonically, and
  does not need a read-gateway message request.

## `HubAwareSync`

`apps/desktop/src/main/sync/hub-provider.ts` wraps one `PollingSync` and one
lazily created `HubSync`. It forwards polling events into the same listener set
used for hub events and delegates all public read methods to polling.

### Liveness and mode override

In normal `auto` mode:

- First live SSE bytes cause `setHubPollingSuspended(true)`.
- Hydrating accounts continue polling until hydration is complete; completed
  accounts have a `null` effective periodic interval.
- Leaving live state restores periodic polling and starts one deep
  `forceRefresh` reconciliation.

The support override `polling` skips hub creation. The `hub` override suspends
polling while the stream connects and keeps it suspended through stream
degradation. `reconfigureHub` invalidates an in-progress factory generation,
stops the old stream, and constructs a new one from current settings.

### Event routing

| Hub event | Local handling |
|---|---|
| Enriched matching message received/sent | Direct `ingestHubMessage`, then emit. |
| Missing, mismatched, malformed, or failed message body | `refreshChat`; list-only when auto-read is off; then emit. |
| PPV unlock or tip notification | Same safe refresh fallback, then emit. |
| Message deletion | Resolve optional chat id from SQLite, tombstone, refresh account head, then emit. Unknown ids trigger only a head refresh. |
| Chat-list update | Debounced account-head refresh. |
| Presence, typing, auth change, other mapped local events | Emit directly. |

Daily and lifetime telemetry under `hubSync.eventStats` has received, applied,
fallback, and dropped shapes plus fallback reasons. Current routing increments
received, applied, and fallback; there is no provider call that increments the
dropped counters, so those remain default/migrated values. `hubActivity()` also
exposes liveness timestamps and `HubSync`'s separate parser-drop count.

### Durable snapshot application

`applyHubSnapshot` is used by v1 recovery and by the new v2 durable recovery.
It rejects a page outside the current handled-account set, applies account auth
state, and upserts visible/current thread heads. For snapshot messages it:

- validates thread/message scope;
- preserves an existing corrected local body while merging monotonic facts
  (`isOpened`, tip status, maximum tip amount);
- ingests new normalized messages through `PollingSync`;
- preserves local deletion tombstones and applies snapshot deletions;
- resolves archive tombstones by local `(accountId, messageId)` lookup;
- re-applies authoritative heads after message ingestion; and
- emits `chatListUpdated` only after the page applies.

`handleV2GapRecovered` is named for the older callback contract, but now runs
before durable state paging. It refreshes read-gateway grants, replaces
`handledAccountIds`, records `hub-v2-gap-cursor-rebaseline` telemetry, and
returns the refreshed ids to `HubSync`.

## `HubSync`

### SSE parser and normal checkpointing

`SseFrameParser` implements the emitted WHATWG subset: arbitrary chunk splits,
CR/LF variants, comments, multiline `data`, sticky `id`, `event`, and numeric
`retry`. Keep-alive comments feed the byte watchdog without creating frames.

For v2:

- `event: ephemeral` is parsed as a local event, account-filtered, applied, and
  never checkpointed.
- `event: domain` is parsed as `DomainEventFrame`, mapped by
  `mapDomainFrame`, account-filtered, and awaited before the opaque SSE id is
  persisted.
- Unknown but structurally valid domain types still advance the opaque cursor;
  this is the forward-compatibility rule.

For v1, only `event: sync` is parsed; a numeric frame id becomes
`hubSync.lastEventId` after successful local handling. Both protocols are
handle-then-checkpoint.

The stream becomes live only after the first bytes arrive, not on HTTP 200.
Forty-five seconds without bytes aborts the reader. A normal server lifetime
close reconnects at the announced retry floor without a liveness demotion.
Other failures use exponential backoff capped at 30 seconds.

### Fail-closed authenticated v2 rebaseline

The same recovery function handles a valid v2 `409 sync_snapshot_required` and
an SSE `401/403` received while a non-null v2 cursor exists:

1. Keep the old opaque cursor persisted.
2. GET `/api/v1/events/v2/snapshot` with the same bearer and validate the fresh
   cursor plus its exact `{accountId, accountRef}` grant binding. The fresh
   cursor remains in memory only.
3. Invoke the grant-refresh callback. It calls read-gateway `listAccounts`,
   reconciles polling-loop membership, and returns the current OFAPI account
   refs. If this set differs from the response-bound refs (including duplicate
   refs), abort before any state request or cursor checkpoint and retry the
   handshake with the old cursor.
4. Replace the event allowlist with the response-bound refs. If that set is
   empty, there is no OFAPI account state to page; persist
   the authenticated empty-grant cursor and reconnect with it.
5. Otherwise, for every response-bound ref in Core's order, exhaust the
   bounded `/api/v1/events/snapshot?afterSeq=0&pageMode=bounded_v1&limit=1`
   walk. The first page establishes a numeric `snapshotCursor`; every
   subsequent page and account must use and return that same cursor.
6. Validate account scope, requested sequence, schema, cursor stability, and
   `resumeAllowed`; await `applyHubSnapshot` for every page.
7. Only after all response-bound accounts finish does
   `setV2Cursor(freshCursor)` run.
8. Reconnect v2 using that fresh cursor.

The cursor is never cleared to force a cursorless connection. Core interprets
cursorless v2 as a baseline at the current high-water mark, so that shortcut
would make the missed interval unrecoverable.

Core embeds a full-grant marker in cursors minted by the omitted-accounts
snapshot request. If a grant changes after Desktop's verification but before
reconnect, Core answers 403 for revocation or 409 for widening; it never fills
a newly granted account at its current head.

Failure handling is intentionally asymmetric:

| Failure | Result |
|---|---|
| Cursorless stream 401/403 | Terminal `auth-failed`. |
| Fresh-cursor endpoint 401/403 | Terminal `auth-failed`. |
| Durable state endpoint 401/403 | Terminal `auth-failed`. |
| Grant refresh failure | No new cursor; backoff and retry with the old cursor. |
| Network, schema, scope, cursor-stability, partial-state, or apply failure | No new cursor; backoff and retry with the old cursor. |
| Any refreshed account returns 404 | Entire recovery fails; successful pages from other accounts do not permit persistence. |
| Stop during recovery | No new cursor. |

The per-account 404 rule is important: recovery is all-account, not
best-effort. Polling is not treated as an authoritative substitute for a
missing durable page.

### v1 fallback recovery

The v1 path uses the same `recoverStateSnapshots` helper with the sequence from
the v1 409 response. It exhausts every allowed account/page, applies through the
same provider callback, and sets the numeric last-event id only after complete
success. A partial page, mismatched scope/cursor, 404, auth error, or apply
failure does not advance it.

## Mappers

`apps/desktop/src/main/sync/mappers.ts` is the storage interpretation boundary:

| Mapper | Result |
|---|---|
| `mapMediaItem` | Rich media to local media metadata and registered `media://` URLs. |
| `mapAccount` | Read-gateway account to account row and auth state. |
| `mapChat` | Chat/fan list object to local chat row; rows without a fan id are rejected. |
| `mapMessage` | OFAPI-shaped message to local body, tip, reply, and media fields. |
| `mapHubMessage` | Normalized hub body to a local message without remote URLs; invalid id/time is rejected. |
| `mapFan` | Fan profile, spend, and subscription fields to a fan row. |
| `mapFanTransaction` | Positive, attributable transaction to normalized dollars/net/UTC. |

Remote URLs are converted through the injected token-minting seam; renderer
code never receives raw authenticated CDN URLs from these mappers.

## Budget guard

`createBudgetGuard` warns once after usage reaches 80 percent of a positive
configured budget and reports exhausted at 100 percent. Polling multiplies its
cadence by four when exhausted and the spend sweep defers; it does not silently
stop synchronization. The guard's `warned` state is module-local and resets
only through `resetWarning()`; the comment saying “once per UTC day” is not
implemented inside this file itself.

## Composition-root wiring

`apps/desktop/src/main/index.ts` constructs the runtime in this order:

1. Hub read-gateway `OfApiClient` and fail-closed transport wrapper.
2. Hydrated credit meter and `BudgetGuard`.
3. `PollingSync` with current settings closures for automatic reads, spend
   rollback, unread reconciliation, budget state, and prune freeze.
4. `HubAwareSync` with a hub factory that resolves the current bearer,
   protocol, credential-scoped cursor key, account ids, snapshot callbacks,
   and client version.
5. The unified sync subscription feeding the send engine and IPC surfaces.

At runtime activation, `syncAccounts` first pulls the initial account set and
the provider starts with those ids. A settings fingerprint containing hub URL,
credential, mode override, and protocol determines whether the hub connection
is recreated; cursor writes alone do not cause reconnect loops.

## Regression anchors in the current tree

The behavior above is exercised by:

- `apps/desktop/tests/sync/hub-sync-v2.test.ts`: opaque checkpoint ordering,
  cursor-bearing auth recovery, exhaustive page application, state/auth
  failures, grant replacement, shrink-to-zero, and multi-account 404 refusal.
- `apps/desktop/tests/sync/hub-sync.test.ts`: v1 recovery, provider composition,
  allowlist replacement, and idempotent snapshot application of message, tip,
  and deletion state before cursor persistence.
- `apps/desktop/tests/sync/polling-sync.test.ts`: polling/hydration/read gates,
  shared reconcile single-flight ownership, queued-reconcile revocation,
  grant-loop replacement, cache preservation, shrink-to-zero, and restart.
