> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# Hub Integration, Monetization & Activity

## Scope

This doc maps the **main-process Agency Hub ("core") integration** and the **money/usage side** of the desktop app: how the hub REST cluster is constructed and reconfigured, how AI usage and OFAPI credits are metered locally, accumulated into ledgers, and reported to core, plus the two board surfaces that read spend-shaped data — **Spenders** ("top spenders" tiers) and **Online-now** ("who is active"). It also covers the two prompt-context blocks that render a fan's spending/subscription history for the AI pipeline.

It describes **flows and internal state**. The **wire contracts** themselves (the `HubClient` HTTP surface, request/response schemas, OFAPI endpoints, auth) are owned by **`02-external-boundaries.md`** and referenced here by symbol, not re-specified. Other cross-refs: the AI generation pipeline that *emits* usage (`08-ai-pipeline.md`, esp. `coordinator.ts`'s `recordUsageEvent`); the OFAPI Direct client and its `CreditMeter` (`05-ofapi-client.md`); the read/sync subsystem that feeds `fan_transactions` and drives `refreshChat` (`06-sync-and-reads.md`); the SQLite schema/migrations behind these queries (`09-data-model-storage.md`); the IPC channel plumbing (`04-main-bootstrap-ipc-settings.md`); and the renderer surfaces — ActivitySettings/StatsPanel, the Spenders board and OnlineSurface (`10-renderer-ui.md`). `packages/shared` structure is owned by `03-shared-package.md`; `hub/ai-gateway.ts` is owned by `08`.

---

## 1. The hub module (`apps/desktop/src/main/hub/index.ts`)

`createHubModule` (line 65) is the single main-process object that owns the hub REST client, the persisted usage reporter, the summary hooks, and the hub AI gateway. It is built once at composition time (`apps/desktop/src/main/index.ts:584`) and returns a set of **stable delegators** whose behavior tracks an internal `active: ActiveHub | null` (line 71). The pattern: attach the delegators to their consumers once; reconfiguration swaps the inner `active` object without re-wiring anything.

### 1.1 Config lifecycle

- `reconfigure()` (line 156) reads `settingsStore.get()` for `hubBaseUrl` and `keychain.getSecret('hubApiKey')` in parallel, then rebuilds `active`. A `generation` counter (line 73) invalidates in-flight reconfigures if config changes mid-await; `disposed` short-circuits after teardown.
- **Unconfigured hub = inert.** When `hubBaseUrl === null` or the API key is null/blank (line 167), `teardown()` runs and `active` stays `null`. In that state: `prefetchSummary` resolves `null`, `pushSummary` no-ops, `onUsageEvent` parks the row (does nothing), `aiGateway.stream` calls back `onError` with a `HubError('bad-request')`, and the command-client methods reject (lines 82–128).
- `teardown()` (line 76) calls `reporter.dispose()`, which cancels timers but **keeps queued events persisted** (crash-safe store) — so switching the hub off does not lose the usage backlog.
- The composition root recomputes a `hubConfigFingerprint()` and only calls `reconfigure()` when the base URL or key actually changed (`index.ts:592`, `hubConfigFingerprint` at `index.ts:522`) — a settings write that does not touch hub config does not resubscribe.

### 1.2 What it exposes (the `HubModule` interface, lines 39–56)

| Member | Purpose |
|---|---|
| `summaryHub: SummaryHubHooks` | prefetch/push fan-summary bodies to core (§4). Passed to the AI coordinator as `summaryHub` (`index.ts:668`). |
| `aiGateway: AiGateway` | Hub AI transport (owned by `08`); wrapped into `createSelectableAiGateway({ direct, hub })` at `index.ts:664`. |
| `commandClient` | `create/get/cancelOfapiCommand` delegators, passed to the send engine as `hubCommandClient` (`index.ts:613`) — the write path (owned by `07`). |
| `onUsageEvent(event)` | coordinator's usage sink → wire event → reporter (§2). Wired at `index.ts:669`. |
| `getOfapiCreditsSummary()` | core's page-scoped OFAPI credit estimate for the Activity panel (§7). |
| `reconfigure()` / `dispose()` | lifecycle. |

When `active` is present, `getOfapiCreditsSummary()` (line 141) calls `client.getOfapiCreditsSummary()` and **swallows any `HubError` to `null`** (logs a warn), so the Activity panel never fails on a down hub.

### 1.3 Reporter/hooks construction (lines 170–199)

On reconfigure, the module builds: a `HubClient` via `createHubClient` (or the injected `createClient` test seam); a `PageLabelResolver` (§3); a `UsageReporter` via `createUsageReporter` whose `onError` logs telemetry failures with the CG error code but never interrupts (line 179); the `SummaryHubHooks` (§4); and the hub AI gateway. The `UsageEventStore` (`store`, line 69) is built once outside the active object — it is backed by the `usage_events` table and survives reconfigures.

### 1.4 Connection probe (`hub/test-connection.ts`)

`probeHubConnection({ baseUrl, apiKey })` (`apps/desktop/src/main/hub/test-connection.ts:34`) is a standalone one-shot health check used by the Settings "test hub" flow — it is **not** part of `createHubModule`. It `GET`s `/api/v1/auth/me` with `Authorization: Bearer <chatter key>` (`:44`), validates the body against `authMeSchema` (`:13` — `{ authMethod, user:{ username, role, assignedPages:[{label}] } }`), and returns the compact `{ username, role, pages: assignedPages.length }` (`:69`) surfaced in Settings → Agency Hub. A 401/403 maps to `CG-HUB-01`; other failures to `CG-HUB-02`. The wire contract for this endpoint is catalogued in `02-external-boundaries.md` §2.2.

---

## 2. Usage/spend reporting to core

There are **two distinct ledgers** written at every AI operation completion. This split is load-bearing and easy to misread from names:

1. **`usage_events`** — a **hub upload QUEUE**. It drains to core when the hub is configured, then rows are deleted. It is *not* what the Activity panel aggregates.
2. **`ai_spend_log`** — the **durable per-day per-feature counters** the Activity panel actually reads (§6). Never drained.

Both are written by `recordUsageEvent` in the AI coordinator (`apps/desktop/src/main/ai/coordinator.ts:585`, owned by `08`), called on both a real completion (`:456`) and a cache-hit settle (`:521`).

### 2.1 `recordUsageEvent` behavior (coordinator, cited for context)

- Builds a raw `UsageEventRecord` with LLM-metric field names (`cacheCreationInputTokens…`), `feature` a wire-stable id, `chatId`, `durationMs`, `isCacheHit`, `isRegeneration`, and `completedAt = now` (lines 591–606).
- **Transport gate:** when `op.aiGatewayTransport === 'hub'` (line 607) it **skips** the `usage_events` INSERT *and* skips `onUsageEvent` — hub-routed AI is metered server-side, so the desktop must not double-report to the queue. It **still** writes `ai_spend_log` in all cases (line 624). This is the key asymmetry: the local Activity ledger is populated regardless of transport; the upload queue only for Direct AI.
- The `usage_events` INSERT uses `ON CONFLICT (client_event_id) DO NOTHING` with `attempts` 0 (lines 611–619). `client_event_id === operationId` is the dedupe key core uses upstream.
- All three writes are wrapped in try/catch that swallows — "usage bookkeeping must never fail a completed operation."

### 2.2 `usage-mapper.ts` — raw payload → wire event

`mapUsagePayloadToHubEvent(value)` (`hub/usage-mapper.ts:54`) converts a persisted raw payload into the core wire shape, returning `null` on any payload that fails the persisted schema or the final wire schema — a malformed row must never reach the wire (core 400s the whole batch on one bad event).

- `usageEventPayloadSchema` (line 24) is a `z.object` that **strips** unknown keys — importantly `totalTokens`, `accepted`, `acceptedPart`, `quarantined` (the local-only fields) never go upstream.
- Field renames to the wire contract: `cacheCreationInputTokens → cacheWriteTokens`, `cacheReadInputTokens → cacheReadTokens`, `chatId → conversationId` (present only when set).
- **`compare → fast-reply`** mapping (line 62): `'compare'` is a reportable desktop feature with no core enum entry, so each Compare card reports as `'fast-reply'` (PLAN P4 decision). `REPORTABLE_FEATURES = [...HUB_USAGE_FEATURES, 'compare']` (line 14).
- Final gate: `hubUsageEventSchema.safeParse(candidate)` before returning (line 75).

### 2.3 `usage-store.ts` — the `UsageEventStore` over `usage_events`

`createSqliteUsageEventStore(db)` (line 53) is the synchronous better-sqlite3 seam the shared reporter drives.

- **Two payload encodings coexist** in the `payload` JSON column (documented in the header): (1) raw coordinator payloads → mapped at load through `usage-mapper`; (2) store-encoded rows (this module's `save`) = the wire event plus `quarantined`. `decodeEvent` (line 27) tries the wire schema first, then the mapper, else hands the raw value through — the **reporter** owns the deletion policy for events that fail wire validation, "the store stays dumb."
- `load()` returns rows in `rowid ASC` (insertion) order (line 56); each `PendingUsageEvent` carries `attempts` (a real column) and `quarantined` (read from `$.quarantined === true` inside the JSON — no schema migration, line 44).
- `save` upserts by `client_event_id`, **preserving `created_at`/rowid order** when the coordinator already parked the raw row (line 87).
- `markQuarantined` uses `json_set(payload, '$.quarantined', json('true'))` to keep it a JSON boolean (a bare `1` would break the `=== true` read, line 118).
- Acceptance metadata (`accepted`/`acceptedPart`, set by `cmd:ai.feedback`, see §6.2) rides in the same JSON and is stripped from the wire event on load — local-only, never sent upstream.

### 2.4 `packages/shared/src/hub/usage-reporter.ts` — the debounce/retry/quarantine engine

`createUsageReporter` (line 121) is the platform-pure queue engine; main wires it to the SQLite store. **Legacy-tuned constants are normative** (lines 16–18): 1 s debounce, 100 events/batch (`HUB_USAGE_BATCH_MAX_EVENTS`), retry delays 5 s then 15 s, drop after the 3rd failed attempt.

- **Crash recovery** (lines 133–150): on construction it `store.load()`s the persisted queue; rows that no longer satisfy `hubUsageEventSchema` (schema drift across app versions) are `store.remove`d — they would 400 the batch forever. Quarantined rows go to a separate `quarantined[]` list, others to `queue[]`. A restored non-empty queue schedules a flush on the normal debounce.
- **`enqueue`** (line 249): re-applies `compare → fast-reply` (a *second* place this mapping happens — idempotent), defaults `isCacheHit`/`isRegeneration` to `false`, validates against `hubUsageEventSchema`; on failure it reports `onError(kind: 'rejected')` and **drops** (telemetry must not break the pipeline). On success it pushes to the queue, `store.save`s, and schedules.
- **`flush`** (line 178): single-flight (`flushing` guard). Drains in 100-event chunks via `client.postUsageBatch`. `clampCompletedAt` (line 165) rewrites any `completedAt` that lies more than the server would accept into the future to server-time (`client.getServerTimeOffsetMs()`), so core's ">5-min-future" 400 cannot trigger.
- **Failure branches**:
  - HTTP 400 (`isQuarantineFailure`, `HubError.reason === 'bad-request'`, line 117): deterministic rejection → mark the chunk quarantined, `store.markQuarantined`, `onError(kind: 'quarantined')`, and **keep draining** later chunks (they may be fine). Never blind-retry.
  - network/timeout/5xx/auth: `incrementAttempts`; drop events that reach `HUB_USAGE_REPORT_MAX_ATTEMPTS` (3) with `onError(kind: 'dropped')`, re-queue the rest, and schedule the next retry using the attempt-indexed delay. Stops draining that pass.
- **`flushNow`** cancels the timer and flushes immediately (shutdown). `dispose` cancels timers but leaves events persisted.
- Core dedupes upstream by `(userId, clientEventId)` — the reporter does **no local dedupe**.

### 2.5 The wire shape (cross-ref `02`)

The event schema `hubUsageEventSchema` and feature enum `HUB_USAGE_FEATURES` live in `packages/shared/src/hub/client.ts:386` / `:408`. Fields: `clientEventId`, `feature`, `model`, `input/output/cacheWrite/cacheReadTokens` (each `0..100_000_000`), `conversationId?`, `durationMs?`, `isCacheHit`, `isRegeneration`, `completedAt` (parseable ISO). Posted via `POST /api/v1/ai-usage/batch` returning `{receivedCount, insertedCount, invalidCount, dedupedCount}`.

**Discrepancy to note:** `HUB_USAGE_FEATURES` (client.ts:386) contains **both `'fan-summary'` and `'scan'`**, but the coordinator only ever emits `'fan-summary'` (comment at coordinator.ts:593: "Feature ids are wire-stable ('fan-summary', never 'scan')"). `'scan'` is a valid wire feature that desktop never produces.

---

## 3. Page resolution: OFAPI `acct_…` ↔ core page label

Every hub call that is *page-scoped* (fan-profile get/put, AI gateway) needs a core **page label**, but the desktop keys everything by OFAPI `acct_…` account id. `page-resolver.ts` + shared `page-mapping.ts` do this translation.

### 3.1 `hub/page-resolver.ts`

`createPageLabelResolver` (line 24) resolves one `accountId → pageLabel | null`:

1. **Manual override wins** — `settings.accountPageLabels[accountId]`, trimmed (lines 58–61). Passed via `getOverrides` (wired at `index.ts:174` to `settingsStore`).
2. Else fetch the OnlyFans **username** of the local account row (`data.accounts.get(accountId).username`) and run the shared heuristic against a **TTL-cached** `GET /api/v1/pages` list. `PAGE_LIST_CACHE_TTL_MS = 5 min` (line 9). Concurrent resolves share one in-flight request (line 34); on fetch failure an expired cache is preferred over resolving nothing (line 50).
3. Unknown/ambiguous → `null`; hub callers then **silently skip** rather than guess.

### 3.2 `packages/shared/src/hub/page-mapping.ts` (pure heuristic)

`matchPageLabelForUsername(username, pages)` (line 44): filters to `platform === 'onlyfans'`, normalizes usernames (`normalizeHubUsername`: trim, strip leading `@`, lowercase, line 32), and matches in **strength tiers** — `username`, then `modelSlug`, then `label` (line 37). It stops at the strongest tier with any match; **ambiguity within a tier returns `null`** (never falls through to a weaker field). `matchAccountToPage` maps a whole account set. `modelName`/`displayName` are display strings and never participate. The header notes core's OnlyFans page `username` is nullable in live data (thin data), which is why the tiered fallback exists.

---

## 4. Fan-summary hub integration (`hub/summary-hooks.ts`)

`createSummaryHubHooks` (line 49) adapts `HubClient.getFanProfile/putFanProfile` to the `SummaryHubHooks` seam the AI coordinator expects (§08). Both hooks are **no-throw and own their time budgets** — a down/slow hub must never break or delay a fan-summary Scan.

- **`prefetchSummary`** (line 152) → `doPrefetch` under a 5 s budget (`HUB_PROFILE_GET_TIMEOUT_MS`, `withBudget` at line 33 resolves a fallback on elapse/reject). It resolves the page label, GETs the profile, and **adopts the hub body only if newer than the local cache** (`existing.generatedAt >= generatedAt → null`, line 101) so an older hub copy cannot regress a locally generated summary. On adopt it hydrates the local `summaries` row immediately (personality fields carried from the stale row) and stamps `hubSyncState = synced`, re-marking on the next macrotask so the flag sticks after the coordinator re-puts (lines 118–126).
- **`pushSummary`** (line 157) → `doPush`: skips empty bodies and bodies over `HUB_PROFILE_MAX_BYTES = 50_000` UTF-8 bytes (legacy `AGENCY_HUB_PROFILE_MAX_BYTES` gate, line 17); PUTs under a 10 s budget; stamps `hubSyncState` `synced`/`pending` based on delivery.
- `markSyncState` (line 61) only writes if the row's `body` still matches — never clobbers a summary regenerated/replaced while the hub call ran. `HubSummarySyncState = { state: 'synced'|'pending', at: ISO }` is the opaque state persisted on `summaries` rows (owned by this module; read back by the Activity panel, §6.1).

---

## 5. OFAPI credit metering & the credit ledger

Two **separate** notions of "credits" exist and must not be conflated:

- **OFAPI account credits** — measured **locally** from Direct OFAPI responses by the `CreditMeter` (`05`). This is the balance/RPM and the per-purpose spend the Activity ledger shows.
- **Core's page-scoped OFAPI credit estimate** — a summary *reported by the hub* (§7), a different scope and source.

### 5.1 `CreditMeter` → `credit_log` (write path)

`createCreditMeter` (`apps/desktop/src/main/ofapi/credit-meter.ts:64`, owned by `05`) parses `_meta._credits` + `x-ofapi-credits-*` + `x-rate-limit-remaining-minute` on OFAPI responses and holds running daily tallies keyed by **purpose**. A purpose-tagged response **always counts as one request even at 0 credits** (line 128). Counters reset on UTC day flip (`rollDay`, line 77).

The composition root subscribes (`index.ts:485`) and persists **deltas** to `credit_log`: for each purpose it computes `credits/requests` since the last persisted value and calls `dataLayer.creditLog.add` only on a positive delta (lines 490–503). On boot it `hydrate`s the meter from `credit_log.usedOn`/`byPurposeOn` for today (`index.ts:454`). The same subscription drives `budgetGuard.check()` (the shift-budget guard used by the refresh queue, §8.3).

### 5.2 `db/queries/credit-log.ts`

`createCreditLogQueries` (line 37) over `credit_log(day, purpose, used, requests)`:

- `add` — `INSERT … ON CONFLICT (day, purpose) DO UPDATE SET used = used + …, requests = requests + …` (line 50), with guards: day must match `YYYY-MM-DD`, purpose non-empty, credits/requests finite non-negative.
- `usedOn(day)` — `SUM(used)` that day; `byPurposeOn(day)` — the ledger rows (`CreditLedgerEntry[]`); `totalsSince(sinceDay)` — per-day totals for the pace estimate. Pre-v7 rows live under the `'untagged'` purpose.

### 5.3 Purposes taxonomy (`packages/shared/src/activity/purposes.ts`)

`OFAPI_PURPOSES` (line 5) is a closed const array every metered OFAPI call site is compiler-forced to declare: `hot-poll`, `deep-sweep`, `unread-reconcile`, `hydration`, `message-tail`, `chat-refresh`, `media`, `scan-deep-fetch`, `send`, `vault`, `spend-sweep`, `spenders`, `spenders-refresh`, `online`. `UNTAGGED_PURPOSE = 'untagged'` (line 25) for pre-v7 rows. `OFAPI_PURPOSE_LABELS` gives display strings; `purposeLabel` falls back to the raw key for forward-compat purposes.

### 5.4 `packages/shared/src/activity/credit-ledger.ts` (pure aggregation)

- `buildCreditLedger(entries)` (line 40) merges duplicate purposes, drops zero rows, sorts into `OFAPI_PURPOSES` order with `'untagged'` always last and unknown purposes after the known set (line 29). Returns `{rows, totalRequests, totalCredits}`.
- `estimateCreditDaysLeft(balance, dailyTotals)` (line 72) is the footer "at this pace ≈ N days": `balance / mean(non-zero daily totals)`, `null` when there is no balance/history/spend.

### 5.5 `fan_transactions` store (`db/queries/fan-transactions.ts`)

A rolling per-fan transaction store that feeds the 30-day spend figure across the chat list, Spenders, Online, and the Stats panel. Populated by the sync **spend-sweep** (`sync/polling-sync.ts`, retention `SPEND_RETENTION_MS = 31 days`, owned by `06`), which walks `GET /{account}/transactions` incrementally (`latestCreatedAt` is the cursor, line 78) and prunes past retention (`pruneOlderThan`). All aggregates sum **`net`** (creator earnings), the same basis as `fans.spending` lifetime figures (owner decision 2026-06-13: every money figure shows net) — note `net` is the summed column even though `amount` (gross) is also stored.

Query surface: `upsertMany` (idempotent by `(account_id, tx_id)`, publishes a `chats`-scope change), `sumByFanSince` (per-fan 30-day sum → Spenders/Online green figure), `statsByFanSince` (sum+count → payers/avg-check/new-spender counts), `dailyTotals` (per **LOCAL** day via SQLite `date(created_at,'localtime')` → the revenue chart), `pruneOlderThan`.

---

## 6. AI spend ledger

### 6.1 `db/queries/ai-spend.ts` — the durable counters

`createAiSpendLogQueries` (line 57) over `ai_spend_log(day, feature, runs, cache_hit_runs, inserted, …tokens…, cost_microusd, top_run_microusd, top_run_chat_id)`. **This is the table the Activity/status surfaces aggregate** (usage_events is a drain queue; header comment line 3).

- `recordRun(args)` (line 59): `+1 run` folding in tokens/cost, `ON CONFLICT (day, feature)`. Costs are **integer micro-USD** (`Math.round(costMicroUsd)`, no float accumulation). The top-run compare-and-swap (`top_run_chat_id`/`top_run_microusd`, lines 80–83) is race-free within the single UPDATE statement (SQLite reads the pre-update row). Called from `coordinator.recordUsageEvent` with `day = completedAt.slice(0,10)` (UTC) and `costMicroUsd = round(totalUsd * 1e6)`.
- `markInserted(day, feature)` (line 97): `+1 inserted`, upsert (a feedback landing just after a UTC-day flip must not throw).
- `rowsSince(sinceDay)` returns `AiSpendDayRow[]` for the panel.

### 6.2 Insert/acceptance instrumentation (`cmd:ai.feedback`, cross-ref `04`)

`ipc/handlers.ts:844` handles copy/insert actions: it json_sets `accepted`/`acceptedPart` onto the operation's `usage_events` row (local-only metadata) **and**, if not already accepted, calls `data.aiSpendLog.markInserted(day, feature)` (line 862) — the source of the panel's "inserted" column and the "45 / 52" acceptance denominator.

### 6.3 `packages/shared/src/activity/ai-spend.ts` (pure aggregation)

`buildAiSpendLedger(rows, today)` (line 116): from up to 7 days of `ai_spend_log` rows it builds today's per-feature table (features with zero runs omitted, sorted by `FEATURE_ORDER`, line 77) plus `totals` (runs, inserted, `insertableRuns`, tokens, costUsd), `cacheReadShare` (prompt-cache read share of today's prompt tokens), `topRun`, and `sevenDayUsd` (trailing total across **every** row passed in). `isInsertableFeature` (line 99): only `ai-dock` surfaces (per `FEATURE_POLICIES`) plus `'compare'` are insertable — analysis outputs (Help Me, Scan, Chat review) render an em dash, not `0`, in the inserted cell. `AI_FEATURE_LABELS` maps `fan-summary → "Scan (fan summary)"` etc.

### 6.4 `packages/shared/src/llm/cost.ts` — per-operation cost estimation

`estimateLlmCost(modelId, usage)` (line 109) prices `LlmUsageMetrics` against the model registry pricing (`getModelEntry`), returning per-bucket USD (`input/cacheWrite5m/cacheWrite1h/cacheRead/output`) + `totalUsd` + `approximate`. Cache-write handling (`resolveCacheWriteTokens`, line 66): without a 5m/1h breakdown all cache-write tokens price at the 5m rate flagged approximate; a breakdown that disagrees with the total is reconciled toward the reported total. `buildLlmSpendSummary` (line 143) compares actual cost to an uncached baseline (all prompt tokens at input rate) → `cacheEffectKind` `saved`/`overhead`/`neutral`. The `formatUsd`/`formatCompactTokens`/`formatSpend*` helpers are the legacy spend-format strings. This module produces the `spend.totalUsd`/`totalTokens` the coordinator feeds into `recordUsageEvent`; the estimate is per-op, the `ai_spend_log` is its daily accumulation.

---

## 7. Core's OFAPI credit summary (hub-reported)

`getOfapiCreditsSummary()` (hub/index.ts:141) → `client.getOfapiCreditsSummary()` → `GET /api/v1/ofapi/credits/summary` (`packages/shared/src/hub/client.ts:816`). Shape `HubOfapiCreditsSummary` (client.ts:196): `{enabled, scope:{pageIds, pageCount}, today:{day, from, to, restCredits, webhook:{eventCount, estimatedCredits}, totalEstimatedCredits}, last7d:{…}, limitations[]}`. **Scope note:** the hub/index comment calls this "page-scoped … for Activity/diagnostics"; the actual scope is the chatter's **assigned pages** (`scope.pageIds`), not one account. It surfaces to the renderer through `deps.getCoreCreditsSummary` (`index.ts:1027`) into `query:activity.summary` (`handlers.ts:499`) as `credits.core`, and into the diagnostics report (`diagnostics/report.ts:34`, `index.ts:1113`). Failures resolve to `null` at every layer.

---

## 8. Activity panel assembly (`ipc/activity.ts`)

`buildActivitySummary(deps)` (line 115) is the read-only SQL + composition glue behind `query:activity.summary`; pure aggregation lives in `@chatgoose/shared/activity`. It returns one `ActivityVM` combining:

- **Data-flow / sync state**: `sync.status()`, `hubStatus()`, `hubActivity()` (SSE liveness snapshot — owned by `06`); per-account freshness/poll intervals.
- **Hub queue health**: raw SQL counts over `usage_events` (pending = `quarantined != 1`, quarantined = `= 1`, lines 133–144) and `summaries` (`pendingSummaries` where `hub_sync_state.state='pending'`, `syncedSummariesToday` where `='synced'` and dated today — the fields §4 writes).
- **Credits ledger**: `buildCreditLedger(data.creditLog.byPurposeOn(today))`, `estimateCreditDaysLeft(balance, dailyTotals)`, `balance`/`rpmRemaining` from `creditMeter.snapshot()`, plus `credits.core` (§7).
- **AI spend ledger**: `buildAiSpendLedger(data.aiSpendLog.rowsSince(since), today)`; `topRun` is enriched with a fan label via a `fans` lookup that returns a label **only when exactly one fan matches** (`matches === 1`, line 182).
- **Sends today**: `sendsToday` (line 64) groups `outbox` transitions (`sent`/`failed`/`unconfirmed`) by `updated_at >= today` (cross-ref `07`).

Two smaller exports used elsewhere: `aiTodayUsd` (line 83, status-bar "AI TODAY") and `buildFeatureCosts` (line 98, Settings→Models trailing-7-day per-feature `{runs, usd}`).

---

## 9. Spenders board

### 9.1 `apps/desktop/src/main/spenders/service.ts`

`createSpendersService` (line 91) computes the "top spenders" tiers. **Tiers are OnlyMonster user-lists**, read **strictly read-only** through the metered OFAPI client (purpose `'spenders'`); **all money/preview/counter data joins from the local SQLite stores (0 credits).**

- **OFAPI reads** (the only credited part):
  - `fetchLists` (line 105) — `client.listUserLists` paginated (`LISTS_PAGE_LIMIT=50`, `LISTS_MAX_PAGES=5`). List names are HTML-entity-decoded via `htmlToPlainText` for display.
  - `fetchRoster` (line 148) — `client.listUserListUsers` paginated (`ROSTER_PAGE_LIMIT=100`, `ROSTER_MAX_PAGES=10` → 1000 fans/list cap, then `truncated=true`, no silent cap).
  - Both are **TTL-cached in memory** (`SPENDERS_TTL_MS=5 min`) with **single-flight** in-flight maps so concurrent IPC calls never double-spend credits (lines 95–99).
- **Local joins** (`buildRows`, line 201): lifetime from `fans.spending.total` (fallback the roster's `subscribedOnData.totalSumm`), 30-day from `fanTransactions.sumByFanSince`, `МОДЕЛЬ N Д / ФАН M Д` day counters derived from the local message store (`messages.latestBySender`) plus the chat row's own last-message stamp (**vendor `lastReplyAt` is null — never used**, header + inline comments). Name/username/avatar resolve through a fallback chain (custom name → chat → fan → roster). Rows are silence-bucketed (`fanSilenceBucket`) and sorted by `sortBySilence` (longest fan silence first). Rows with no chat row report `canSendMessage=false` so the mini-composer never hits the send engine's "unknown chat" reject (line 277).
- **Tier assignment** uses the shared `assignSpenderTiers` (§9.3): a fan in several mapped lists lands on the **first (highest) shelf**; `roster()` (line 318) and `scopeChatIds()` (line 347) re-implement the same first-shelf dedup by walking earlier shelves. Mapping is `settings.spendersListMappings[accountId]` (wired at `index.ts:631`).
- **`stats(accountId)`** (line 370): local joins over the cached rosters (0 extra credits once warm) → the Stats panel VM: 30-day revenue series (`buildDailySeries` over `fanTransactions.dailyTotals` in **local** calendar days via `sv-SE` formatting, line 375), 7-day `periodDelta`, payers/tx/avg-check, per-tier revenue/payers/radar, hot-silence counts, a waiting queue and a new-spender list. `«Без тира»` revenue counts **every** unclaimed payer in the window even without a fan row (line 434) — money must not vanish from the split.

### 9.2 `apps/desktop/src/main/spenders/refresh.ts`

`createSpendersRefresh` (line 161) is the scoped **refresh queue** + the quick-look on-open **hydrate guard**. Distinct credit purpose `'spenders-refresh'` so the owner sees the cost before the click (button) and after (Activity ledger row). **Strictly read-only** toward OFAPI; the **lowest-priority OFAPI consumer** — serial, paced, and it **pauses first** when the shift budget trips.

- **`hydrateIfStale(accountId, chatId)`** (line 311): one tail GET on quick-look open unless the fan was fetched within the shared TTL (`THREAD_FETCH_TTL_MS=5 min`, from `spenders/index.ts`) **and** already has local history. Handles a "poisoned stamp" (a fresh stamp over an empty local thread) by allowing exactly one more probe GET, tracked in the in-memory `emptyProbedStampMs` map (line 186) — net ≤1 extra GET per fan per TTL. **This deliberate single-chat read is NOT gated on auto-read** (opening a quick-look is exactly like opening the full chat); it uses `readChatTailForUserOpen`, not `refreshChat`. Single-flight per `(account,chat)` (line 346). On a thrown GET it returns a quiet retriable `error` (no stamp written, no auto-retry loop).
- **The scoped queue** (`runQueue`, line 233): drains `scopeChatIds(accountId, scope)` in board order, one `refreshChat` tail GET per fan, pacing with `OFAPI_INTER_PAGE_DELAY_MS`, TTL-skipping fans fetched within the window. **Auto-read gate** (`getAutoRead`, default `false`, wired to `settings.autoReadChats` at `index.ts:656`): because a per-fan tail GET marks the fan read on OnlyFans, when auto-read is OFF the queue **still drains the whole scope but performs NO body GETs** (line 254) and still stamps `«последний апдейт»` — so a refresh with auto-read off marks everything "fresh" without actually fetching. `ensureChat` (listChats) is safe and unaffected.
  - Budget: when `isBudgetExhausted()` it flips to `paused` and rechecks every `REFRESH_RETRY_MS=30 s` (line 236). After `REFRESH_FAILURE_PAUSE_THRESHOLD=3` consecutive fetch failures it assumes network-down, pauses, and retries the **same** fan (line 261).
  - Persistence: progress persists to the `settings` table every `PERSIST_EVERY=10` fans (`spenders.refreshQueue.<account>`); `resume(accountIds)` relaunches persisted queues after a restart (called after sync starts). Freshness stamps live at `spenders.refreshedAt.<account>` per scope; a completed `'all'` run stamps every mapped chip (`writeScopeStamps`, line 219).
  - Emits `SpendersRefreshFrame` (`type: 'spendersRefresh'`, line 38) on the `sync:event` channel as an additive frame — renderers that only parse known sync frames drop it harmlessly.

### 9.3 Shared spenders domain (`packages/shared/src/spenders/index.ts`)

Pure, densely unit-tested helpers: silence buckets (`fanSilenceBucket`, warm ≥8 d / hot ≥22 d fan silence), `splitTierLabel` (strips the OnlyMonster `_OM`/`_ОМ` marker and extracts a spend band like "600+"/"350-600"), `assignSpenderTiers` (first-shelf dedup + `«Без тира»`), `sortBySilence`, shelf-presentation preview counts, the Stats-panel series math (`enumerateDays`/`buildDailySeries`/`periodDelta`/`isNewSpender`), and the freshness/TTL helpers (`countPendingRefresh`, `isWithinFetchTtl`, `splitUpdateStamp`). Notable constants: `THREAD_FETCH_TTL_MS = 5 min` (shared by quick-look hydrate and the refresh queue) and **`OFAPI_USD_PER_CREDIT = 69/20000`** (line 247) — a hardcoded OFAPI Basic-plan price used to turn a refresh's credit count into the button's `~$` hint (`refreshCostUsd`).

---

## 10. Online-now surface (`apps/desktop/src/main/online/service.ts`)

`createOnlineService` (line 65) is the "who is online now" board. **No background polling** (owner: "автопарс жрёт кредиты"): the *only* OFAPI call is an explicit «Обновить» press.

- `refresh(accountId, spendersOnly)` (line 254) → `fetchSnapshot` → `client.listFansActive` with `online: true` (purpose `'online'`), paginated `ONLINE_PAGE_LIMIT=20` (= 1 credit/page), `ONLINE_MAX_PAGES=5` (≤100 fans then `truncated`). `/fans/active` is a **Hybrid fans-list read that does NOT mark OnlyFans chats read** (unlike `GET /messages`) — the header spells this out. `spendersOnly` adds `filter[total_spent]` sent as **`1`, a `>=` bound**, not `0`, so `$0` fans are excluded (`SPENDERS_MIN_TOTAL_SPENT=1`, line 28).
- Local joins (`buildRows`, line 107) are the **same machinery as Spenders** (same DB queries + `deriveFanWaiting` + silence bucket + fallback chains), plus `lastSeen` from the live active-fans payload (fallback the local fan row). `countRows` produces `{online, spenders, waiting}` chips.
- **State model:** the row snapshot lives **in memory** per `(account, spendersOnly)` cache key and is lost on restart; only a per-`(account,filter)` freshness stamp persists (`online.refreshedAt.<account>`, same settings key-value seam as Spenders). `snapshot()` returns empty rows + the persisted stamp when there is no in-memory entry (post-restart the surface shows the «нажмите Обновить» CTA but still says when it was last checked, `toVM` line 194). Single-flight `inFlight` map prevents a double-«Обновить» double-spend (line 72).

---

## 11. Fan spending/subscription prompt-context blocks

These two pure modules render a fan's money history into the AI prompt (consumed by `apps/desktop/src/main/ai/context-loader.ts`, owned by `08`). Text shapes are **legacy-locked** (prompts were tuned against them, SPEC §8.2/§15.6). **All amounts are dollars** (never divide by 1000 — the Fansly mills rule does not apply to OFAPI).

- **`packages/shared/src/context/spending.ts`** — `formatFanSpendingData` builds the `FAN SPENDING DATA:` block from OFAPI `subscribedOnData` all-time sums and `GET /{account}/transactions` rows; `deriveMonthlyTotals`/`deriveMonthlyBreakdowns` bucket transactions by **UTC** month. Transaction `type` strings map to display labels with a legacy `Unknown (type XXXX)` fallback.
- **`packages/shared/src/context/subscription.ts`** — `formatFanSubscriptionData` builds the `FAN SUBSCRIPTION DATA:` block (status, price/promo, subscribed-since, period-end, auto-renew, churn). `resolveAutoRenew` (line 53) infers renew state from the current `subscribedOnData.subscribes[]` entry's `cancelDate` (the header documents that OnlyFans exposes no boolean auto-renew flag and that the `autoRenew` field in the vendored docs is Fansly's). Dates render in UTC.

---

## 12. `mode.ts` and the hub-mode override

`packages/shared/src/hub/mode.ts` is tiny: `HUB_MODE_OVERRIDE_SETTINGS = ['auto','polling','hub']` and the `HubModeOverrideSetting` type — the settings enum for read-transport selection (surfaced in the Activity panel's `hubModeOverride`; the actual read-mode selection lives in `06`). It is re-exported through `packages/shared/src/hub/index.ts` alongside `client`, `usage-reporter`, `page-mapping`.

---

## 13. Test coverage (orientation)

`apps/desktop/tests/hub/` covers the module (`hub-module.test.ts`), reporter store (`usage-store.test.ts`), mapper (`usage-mapper.test.ts`), page resolver (`page-resolver.test.ts`), summary hooks (`summary-hooks.test.ts`), the connection probe (`test-connection.test.ts`), and the command/handlers path (`handlers.test.ts`, `ai-gateway.test.ts`). `apps/desktop/tests/spenders/` covers `service.test.ts`, `refresh.test.ts` (queue/hydrate/auto-read/budget), and `previewHydrateStatus.test.ts`. `apps/desktop/tests/online/` covers `service.test.ts` and `sortOnline.test.ts`. Shared aggregation has its own suites under `packages/shared` (activity, spenders, context, llm/cost).

---

## 14. Cross-reference & discrepancy summary

- **Two "credits":** OFAPI account credits (local `CreditMeter` → `credit_log`, §5) vs core's page-scoped OFAPI estimate (hub `getOfapiCreditsSummary`, §7). Different scope/source; both surface in `credits.*` of the Activity VM.
- **Two "usage" stores:** `usage_events` (hub upload queue, drains + deletes) vs `ai_spend_log` (durable panel source). A reader who assumes the panel reads `usage_events` would be wrong (ipc/activity.ts:166 and ai-spend.ts header both aggregate `ai_spend_log`).
- **Transport asymmetry:** hub-routed AI (`aiGatewayTransport === 'hub'`) skips `usage_events` and `onUsageEvent` but **still** writes `ai_spend_log` (coordinator.ts:607/624).
- **`'scan'` wire feature is dead on this side** — present in `HUB_USAGE_FEATURES` but never emitted; desktop uses `'fan-summary'` (§2.5).
- **`compare → fast-reply`** happens in two places (usage-mapper.ts:62 and usage-reporter.ts:257) — idempotent.
- **Auto-read + Spenders refresh:** with auto-read OFF a scoped refresh drains and stamps "fresh" while fetching nothing (refresh.ts:254) — the freshness line is honest for the *cached* view, not new data.
- **`net`, not `amount`:** every money aggregate sums `net` (fan-transactions.ts) though gross `amount` is also stored.
