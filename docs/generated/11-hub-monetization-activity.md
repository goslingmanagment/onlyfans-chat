> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Hub Module, Money & Usage, Spenders & Online (main/hub, main/spenders, main/online)

The main-process hub module that composes the core client, the two ledgers (an upload queue
vs durable counters), the telemetry lanes to core, account→page resolution, the credits
summary, and the two on-demand read surfaces (Spenders board, online presence). The wire
contract for each hub call is owned by `01`/`02`; this doc maps the implementation and the
money/usage semantics.

## The hub module — `main/hub/index.ts` (304)

`createHubModule` builds one `HubClient` (via `createHubClient`, carrying `clientVersion` as
`x-client-version`) plus a `UsageReporter`, summary hooks, and the AI feature gateway — all
rebuilt on `reconfigure()` when `hubBaseUrl`/credential changes (a `generation` counter
invalidates mid-await races). Exposed surfaces:

- `summaryHub` — stable delegators, inert when unconfigured (`main/hub/summary-hooks.ts`).
- `aiFeatureGateway` — the kernel AI lane (owner `08`; errors HubError when off).
- `personas.{list,upsert,archive}` — kernel persona CRUD (`GET /api/v1/ai/personas`,
  `PUT`/`DELETE /api/v1/ai/personas/:key`); on first config it fire-and-forget syncs local
  custom personas up via `upsertAiPersona`.
- `acceptance`/`acceptanceTracker`/`onAcceptanceEvent` — the acceptance capture lane below.
- `commandClient` — `createOfapiCommand`/`getOfapiCommand`/`cancelOfapiCommand` (owner `07`).
- `onUsageEvent` — the drain-only usage lane below.
- `getOfapiCreditsSummary()` — `GET /api/v1/ofapi/credits/summary`.

Related small modules: `main/hub/device-token.ts` (owner `04`), `main/hub/test-connection.ts`
(the Settings "Test connection" probe — `GET /api/v1/auth/me`, returns `{username, role,
pages}`), `main/hub/page-resolver.ts` (below).

## The two ledgers

The desktop keeps two separate money/usage stores with different roles:

1. **`usage_events` — the AI-usage upload queue (drain-only).** Backed by `usage_events` and
   the persisted `packages/shared/src/hub/usage-reporter.ts` (`03`), reported to core via
   `postUsageBatch` → `aiUsageBatch POST /api/v1/ai-usage/batch`. **Post-migration the AI
   coordinator no longer writes rows here** — the gateway usage frame is authoritative, and the
   SDK marks this route deprecated. This queue survives only to drain rows parked by pre-cutover
   app versions. `main/hub/usage-store.ts` is the SQLite store (`load` rowid-order, `save` upsert
   by `client_event_id`, `remove`, `incrementAttempts`, `markQuarantined`); `main/hub/usage-mapper.ts`
   maps raw LLM-metric field names → the core wire event (drops local-only acceptance metadata,
   reports `compare` as `fast-reply`, malformed → null → core 400s the whole batch).

2. **`ai_spend_log` — the durable spend counters (Activity panel truth).** Integer micro-USD
   counters per `(day, feature)` written by `db/queries/ai-spend.ts:recordRun` from the gateway
   usage frame, aggregated by `@chatgoose/shared/activity/ai-spend.buildAiSpendLedger`. This is
   the ledger the Activity UI reads; `usage_events` is NOT read for display.

There is also the **OFAPI credit ledger** (`credit_log`, per-day per-purpose), fed from the
credit meter's per-purpose deltas (`05`), aggregated by
`@chatgoose/shared/activity/credit-ledger`.

## Telemetry lanes to core

- **AI-acceptance** — `main/hub/acceptance-reporter.ts` (310). A bounded FIFO spool in the
  settings KV key `aiAcceptanceSpool` (cap 500, batch 100, debounce 1s, ≤5 attempts — **no new
  table**, SCHEMA_VERSION 16 pinned). Actions `shown|copied|inserted|sent`; each becomes an
  observation `{ clientEventId: uuidV5(operationId:action:at), kind:'ai_acceptance', observedAt,
  payload:{ operationId, requestId/generationRef?, feature, action, accountId, conversationId,
  edited? } }` uploaded to `postIngestObservations` → `POST /api/v1/ingest/observations`. A
  bad-request drops the batch loudly; a transient error retries with the spool intact.
  `createAcceptanceTracker` tracks the last inserted suggestion per conversation and one-shot
  `consumeForSend` computes `edited`. The `shown` event comes from the coordinator (`08`);
  `copied`/`inserted` from `cmd:ai.feedback`; `sent` is observed on `cmd:send.message`.
- **Fan-summary sync** — `main/hub/summary-hooks.ts` (166): `prefetchSummary` (5s budget) →
  `getFanProfile` (`GET /api/v1/pages/:pageLabel/fans/:platformUserId/profile`), adopting a hub
  profile newer than local; `pushSummary` (10s budget, ≤50 KB) → `putFanProfile` (PUT same
  path). Both no-throw, own their budgets, skip when the page label is null.

## Account → page resolution — `main/hub/page-resolver.ts` (74)

`createPageLabelResolver`: a manual override `settings.accountPageLabels[accountId]` wins; else
`matchPageLabelForUsername(username, pages)` (`packages/shared/src/hub/page-mapping.ts`, `03`)
over a cached `client.listPages()` (`GET /api/v1/pages`) with a 5-min TTL; concurrent resolves
share one in-flight request; on fetch failure an expired cache beats guessing; unknown/ambiguous
→ null (callers skip silently). This is the `acct_…` ↔ core `pageLabel` bridge the AI lane,
fan-profile sync, and (indirectly) all page-scoped hub calls depend on.

## Spenders services — `main/spenders/`

- **`service.ts` (484):** the Spenders board data source. Tiers come from OnlyMonster
  user-lists, read via the metered OFAPI read client (purpose `'spenders'`): `client.listUserLists`
  (`/{acct}/user-lists`) + `client.listUserListUsers` (`/{acct}/user-lists/{id}/users`).
  Everything money/preview/counter-shaped joins from local SQLite (0 credits). TTL 5min; caps
  `LISTS_PAGE_LIMIT=50`/`LISTS_MAX_PAGES=5`, `ROSTER_PAGE_LIMIT=100`/`ROSTER_MAX_PAGES=10` (=1000
  fans/list then truncated); in-memory TTL cache + single-flight per list/roster; first-shelf
  dedup (highest shelf wins). `stats()` builds the 30-day daily series, tier revenue/payers,
  reactivation radar, and waiting/new-spender queues from local `fan_transactions`.
- **`refresh.ts` (443):** the freshness queue + preview hydration — the **lowest-priority OFAPI
  consumer**, distinct purpose `'spenders-refresh'`, serial and paced; it **pauses first on
  budget exhaustion** (polling merely slows). The queue is a per-fan tail GET, skipping fans
  within the shared 5-min `thread_fetch_log` TTL; with auto-read OFF (default) it skips the body
  read but still drains to stamp freshness honestly. Progress persists in `spenders.refreshQueue.
  <accountId>` and resumes after restart (idempotent via TTL skip). Quick-look preview hydration
  (`hydrateIfStale`) is a deliberate single-chat read (purpose `'message-tail'`) — always
  hydrates (an explicit open is sanctioned) — and emits additive `spendersRefresh` frames on the
  `sync:event` channel.

## Online presence service — `main/online/service.ts` (271)

Source is an **explicit user press only — no background polling** (the header notes auto-polling
was rejected as too credit-hungry). The single OFAPI call is `client.listFansActive({
purpose:'online', online:true[, minTotalSpent:1] })` → `/{acct}/fans/active` (which does **not**
mark chats read). `ONLINE_PAGE_LIMIT=20` (1 credit/page), `ONLINE_MAX_PAGES=5` (≤100 fans then
`truncated`), spenders-only filter default on. Single-flight per `(account, spendersOnly)` so a
double press can't double-spend; the member snapshot lives in memory (row joins rebuilt on read
from local DB, reusing the Spenders join), with a persisted `online.refreshedAt.<accountId>`
stamp surviving restart.

## Credits summary & the Activity panel

`getOfapiCreditsSummary()` fetches the credits/runway card from core (`GET /api/v1/ofapi/credits/
summary`). The Activity panel (`main/ipc/activity.ts`, `04`) assembles `query:activity.summary`
from the per-purpose `credit_log`, the durable `ai_spend_log`, outbox transitions, hub liveness,
and the usage/summary queue depths; AI readiness there is `{gatewayConfigured: hubBaseUrl !==
null && hasHubKey}`. The renderer's ActivitySettings surface (`10`) renders these three ledgers
plus the outbox audit (`07`).
