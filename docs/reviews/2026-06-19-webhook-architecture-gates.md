# Webhook Architecture Gates

Date: 2026-06-19

This note is the design gate before any C3 transaction/spend projection, desktop D6
spend-sweep reduction, or DM cold archive implementation. It records the minimum contracts
that must exist before code starts.

## Gate 1: Ownership

Core is the source of truth for OFAPI webhook delivery, credit spend, normalized transaction
projection, long-lived DM archive data, and replay cursors. Desktop remains a local replica and
may keep its direct OFAPI paths only as explicitly labeled fallback or migration paths until the
core projection has proved equivalent.

Desktop may not call its local credit meter "total spend". Core total spend is the only total
spend number. Desktop-local direct OFAPI calls are local-only spend until they are either routed
through core or uploaded into a core-owned ledger with an explicit source bucket.

Ownership matrix:

| Entity | Source of truth | Writer | Readers | Fallback/migration path | Retention/audit |
|---|---|---|---|---|---|
| OFAPI key | core secret store/runtime config | owner/operator only | core API/worker | none in target state; desktop key paths are migration-only | secret rotation audit, no desktop export |
| OFAPI webhook journal | core Postgres | core webhook receiver | core workers, SSE fanout, replay tools | OFAPI retry into same receiver | governed by `OFAPI_EVENT_RETENTION_DAYS`; delivery headers retained for audit |
| Chat heads/list state | core projection, replicated locally | core webhook/reconcile workers | desktop SSE consumer, core dashboard | desktop polling while hub degraded during migration | cursor/audit via fanout seq; desktop cache is disposable replica |
| Message bodies | core hot DM projection plus desktop replica | core message webhook/reconcile/command confirm | desktop, support diagnostics without secrets | explicit user-open REST reads during migration only | hot capped store plus tombstones; cold archive gate below |
| Transactions/spend | core transaction/spend projection | core webhook/reconcile workers | owner dashboards, future desktop core-spend endpoint | desktop `fan_transactions` sweep until C3 shadow passes | core ledger/projection audit; desktop spend is local-only provenance |
| Command outbox | desktop until core command path exists; core afterward | desktop send engine, then core command API | desktop UI/verifier, future core audit | desktop local outbox remains for send UX during migration | no message text in diagnostics; indeterminate outcomes are auditable |
| AI usage | core AI ledger | desktop batch reporter now, core AI gateway later | core owner dashboard, desktop usage UI | desktop direct provider keys until P6 gateway | core dedupe by `clientEventId`; bad future-dated events quarantined |
| Fan profile | core page/fan projection, replicated locally | core webhook/reconcile workers | desktop, core analytics | desktop list/detail reads while migration paths remain | correction events are audit-worthy, not silent rewrites |
| Media metadata | core metadata projection, desktop cache for files | core webhook/reconcile; desktop cache writer for local files | desktop gallery/vault, future archive rollups | desktop explicit media fetch/cache until gateway exists | no signed URLs in cold archive; local cache is LRU disposable |
| Hot `page_dm_messages` | core operational store | core DM projection/sync | desktop SSE/snapshot, core live reads | REST reconcile can fill gaps but cannot regress newer webhook state | capped operational retention, tombstones, lag metrics |
| Cold DM archive | core archive store | forward-only archive worker | analytics/AI through governed read models | no historical bulk backfill before governance approval | explicit retention, ACL, audit, purge/export, encryption decision |

## Gate 2: Transaction/Spend Projection

This gate blocks settled `tips.received` money mapping and desktop D6. Because a controlled tip
fixture is not available yet, the first C3 shadow implementation may proceed without tips only if
`tips.received` rows are explicitly recorded as blocked/excluded and never counted as settled spend.

Required fixture state:

- `tests/fixtures/webhooks/transactions_new.json`: live-captured and anonymized.
- `tests/fixtures/webhooks/messages_ppv_unlocked.json`: live-captured and anonymized.
- `tests/fixtures/webhooks/unverified_tips_received.json`: documented example only. This is not
  enough to ship a money mapper. A live `tips.received` production or controlled-test fixture must
  be captured before `tips.received` contributes to settled spend; until then, shadow projection
  must mark the event blocked/excluded with `tips_received_live_fixture_required`.

Canonical domain event:

```ts
type CoreSpendProjectionEvent = {
  source: "ofapi_webhook";
  sourceEventType: "transactions.new" | "tips.received" | "messages.ppv.unlocked";
  sourceIdempotencyKey: string;
  journalId: number;
  fanoutSeq: number | null;
  platform: "onlyfans";
  ofapiAccountId: string;
  pageId: number;
  fanPlatformUserId: string;
  transactionId: string | null;
  messageId: string | null;
  occurredAt: string;
  category: "message" | "tip" | "subscription" | "post" | "stream" | "other";
  currency: "USD";
  grossAmountMills: number | null;
  creatorNetAmountMills: number | null;
  status: "pending" | "settled" | "reversed" | "estimated";
};
```

Money policy:

- Persist money in integer mills in core, matching the existing `transactions` table and rollups.
  OFAPI webhook payloads carry dollar numbers; convert once at the parser boundary.
- `transactions.new`: `amount` is gross, `net_amount` is creator net, `fee_amount`,
  `vat_amount`, and `tax_amount` are source metadata. `status: "loading"` is pending until the
  current transaction sync/reconcile confirms settlement or reversal.
- `tips.received`: use only live-verified `amountGross` and `amountNet`. Do not parse tip money
  out of text or `replacePairs` until production shape proves it is stable.
- `messages.ppv.unlocked`: marks purchase state immediately. It may create an estimated spend
  signal from `{AMOUNT}`, but it must not become settled revenue while a matching
  `transactions.new` can still arrive. The transaction row wins once present.

Idempotency and duplicate policy:

- Delivery idempotency is the `x-ofapi-idempotency-key` header plus the journal row id. Processing
  must be safe to replay from the journal.
- Revenue identity is domain-level, not delivery-level:
  - `transactions.new`: `(ofapi_account_id, payload.id)`.
  - `tips.received`: `(ofapi_account_id, payload.id)`, after live fixture verification.
  - `messages.ppv.unlocked`: `(ofapi_account_id, payload.id, payload.user_id)` as a purchase-state
    signal. It is not a settled revenue identity unless no transaction arrives inside the agreed
    shadow window.
- A `transactions.new` row that matches a PPV/tip signal replaces the estimated signal for spend
  totals. The estimated signal remains as provenance/audit, not as additional revenue.

Shadow projection plan:

1. Add a core feature flag for shadow-only spend projection. The first PR writes projection rows
   but does not change desktop behavior or reduce the desktop spend sweep. If the live tip fixture
   is still unavailable, `tips.received` must be blocked/excluded rather than parsed from docs.
2. Compare the shadow projection to the existing core `transactions` table and desktop
   `fan_transactions` rollups over sampled production windows. Core's owner-only
   `GET /api/v1/admin/ofapi/spend/comparison` is the production evidence surface for the
   core-transaction half of this comparison.
3. Required comparison dimensions: page, fan, UTC day, category, gross mills, creator-net mills,
   row count, duplicate count, missing-fan count, and pending/estimated rows.
4. Acceptance before D6: zero duplicate settled rows; every mismatch over one cent per
   page/fan/day is explained; no unexplained category drift; rollback flag leaves the old
   10-minute desktop sweep unchanged.
5. Only after a clean shadow window may desktop D6 reduce `spend-sweep` cadence or make it
   fallback/dev-only.

Production C3 update (2026-06-19):

- Core commit `3bdc35990018` added the second boot flag,
  `OFAPI_SPEND_TRANSACTION_INGEST_ENABLED`, after the shadow flag. It applies only missing
  `transactions.new` projection rows into core `transactions`, creates fan/page membership, and
  rebuilds spender/revenue rollups.
- Production runtime heartbeats after restart showed `ofapiSpendProjectionShadowEnabled=true`,
  `ofapiSpendTransactionIngestEnabled=true`, and `skippedOverrides=[]` on both api and worker.
- Post-apply production comparison over the current seven-day window showed
  `matched=9` for `transactions.new` (`292970` gross mills / `234370` creator-net mills),
  `missing_in_core_truth=0`, and `ppv_estimated=6`.
- This closes the first missing-core-truth blocker for live `transactions.new`, but it does not
  authorize desktop D6 yet: PPV remains estimated-only, `tips.received` still lacks a live verified
  fixture, the matched sample window is short, and desktop still needs an explicit rollback flag
  before the 10-minute `spend-sweep` cadence can be reduced.

## Gate 3: DM Cold Archive

The first archive implementation must be forward-only. Historical bulk backfill is explicitly out
of scope until governance, read-state, and budget are accepted.

Archive contract:

- Keep hot `page_dm_messages` capped and operational. Do not turn it into the cold archive.
- Add a separate cold archive keyed by `(platform, ofapi_account_id, platform_message_id)` plus
  source journal metadata.
- Store text/body, sender role, page/fan/chat ids, created/deleted timestamps, PPV/tip annotations,
  and stable media metadata. Do not store signed media URLs, raw media file URLs, or full raw
  webhook payloads in cold storage.
- Deletes are tombstones. Corrections are append/update operations with audit metadata, never
  silent destructive rewrites.
- Source precedence: own command confirmation and message-shaped webhooks establish live facts;
  REST reconcile can fill missing fields and correct coverage but must not regress newer webhook
  heads or resurrect tombstoned messages.
- Required before enabling: retention period, owner/team ACLs, audit log, purge/export policy,
  encryption-at-rest decision, and operator-visible archive lag/gap metrics.

Production C4 update (2026-06-19):

- Core commits `932bf2c` and `c7a246a` implemented the first forward-only cold archive. The
  production image is `agency-hub.source-revision=c7a246aef906`; api and worker containers were
  healthy after deploy.
- Migration `0037_dm_message_archive.sql` is applied. `dm_message_archive` stores normalized
  message facts keyed by `(platform, ofapi_account_id, platform_message_id)` with source
  idempotency/journal/fanout metadata, tombstone `deleted_at`, stable media metadata, and
  `retain_until`. It intentionally has no FK to the raw journal because journal rows expire.
- Production staged config enabled `ofapiDmColdArchiveEnabled=true`; latest api/worker heartbeats
  showed `ofapiDmProjectionEnabled=true`, `ofapiDmColdArchiveEnabled=true`,
  `ofapiDmColdArchiveRetentionDays=3650`, and `skippedOverrides=[]`.
- Live production validation archived two post-enable `messages.received` events. The rows have
  source journal ids and fanout seq values, non-empty stored text lengths, no tombstones, and
  `media_contains_signed_url=false`. The owner-only status route is protected (`401` without auth).
- Remaining boundary: no historical bulk `GET /messages` backfill, no raw transcript export API,
  no media download/storage, and no desktop fallback removal. Historical import still needs a
  separate governance/read-state/budget acceptance.

## Gate 4: Sync Snapshot, Cursor, and Gap Recovery

The desktop cannot treat "eventually reconciled by polling" as the long-term correctness model.
Core must expose replay plus snapshot semantics before desktop removes its remaining direct OFAPI
fallbacks.

Contract:

- `SyncEvent` frames are versioned. Adding a new frame type or changing an existing payload shape
  requires a core contract fixture and a desktop parser/apply test in the same cross-repo change set.
- Core's fanout sequence is the durable stream cursor. SSE `Last-Event-ID` is the wire-level resume
  cursor for that fanout sequence.
- Desktop persists `lastAppliedSeq` only after the event has been parsed, authorized for the local
  page assignment, and applied idempotently to SQLite.
- Reconnecting with `Last-Event-ID` inside retention must replay all authorized events after that
  sequence without duplication changing local state.
- If the requested sequence is older than core retention or the stream reports a gap, desktop must
  stop claiming push freshness, request a core state snapshot, apply it idempotently, persist the
  snapshot cursor, and tail SSE from that cursor.
- Snapshot responses must include the snapshot cursor, state timestamp, page/account coverage, and
  any omitted domains. A partial snapshot cannot reset `lastAppliedSeq` for omitted domains.
- Corrections and deletes are first-class idempotent events. They must not require background body
  fetches to become correct.
- The currently verified production retention is seven days. Future implementation work must
  recheck live runtime configuration before choosing gap behavior.

Minimum tests before implementing C5:

- replay from `Last-Event-ID` applies exactly once after reconnect;
- replay outside retention enters snapshot-required state;
- snapshot apply preserves newer local tombstones/corrections unless the snapshot has a newer
  source timestamp;
- malformed or unauthorized events are dropped without advancing `lastAppliedSeq`.

## Gate 5: Command Outbox and Write Semantics

Desktop's local outbox remains the product send-state model until core owns the command path. Moving
writes to core requires an explicit command outbox contract; it is not implied by SSE reads.

Command states:

- Desktop-local today: `queued`, `sending`, `sent`, `failed`, `unconfirmed`, `cancelled`.
- Core command path target: `draft/local_pending`, `queued`, `in_flight`, `confirmed`,
  `failed_retryable`, `failed_terminal`, `indeterminate`, `cancelled`.

Rules:

- Each command has a stable client command id. Core dedupes by `(page_id, chatter_id,
  client_command_id)` for the agreed dedupe window.
- Single-flight scope is one command per conversation send lane unless a later command type declares
  a narrower key. Multi-part sends keep one command/outbox row per part.
- A request that may have reached OFAPI is `indeterminate`; neither desktop nor core may auto-retry
  it. Retry is a new command that the UI offers only after verification or an explicit human choice.
- Definite non-delivery can become `failed_retryable`; validation/policy rejection is
  `failed_terminal` unless the composer changes the command payload.
- Core command confirmation or matching `messages.sent` events can promote local optimistic bubbles
  to confirmed state. REST tail verification remains read-only.
- When command ownership moves to core, desktop diagnostics must show local id, core command id,
  state, retry lineage, and last verifier result without exporting message text.

## Gate 6: OLTP/OLAP Boundary

Webhook projection tables are product state, not the analytics warehouse.

- Live desktop reads and operational dashboards use OLTP projections with bounded indexes and
  explicit pagination.
- Analytics over the cold DM archive, spend history, or AI usage must read from materialized
  aggregates, a read replica, or a warehouse path once volume demands it.
- No dashboard or AI summary path may scan raw cold archive payloads at request time.
- Product projections keep only the fields needed for live correctness. Archive/audit payloads stay
  behind governed access and should feed rollups asynchronously.

## Gate 7: Shared Contracts and Runtime Flags

Cross-repo event contracts must have one owner per boundary:

- Core owns externally emitted SSE, webhook journal, credit/ledger, command, and future gateway API
  schemas.
- Desktop owns local SQLite and renderer view models, but consumes core-owned schemas through a
  generated or shared package plus fixtures.
- Spend projection event fixtures must include live-captured `transactions.new`,
  `messages.ppv.unlocked`, and verified `tips.received` before settled money mapping ships.
- AI usage feature names must remain compatible with core's closed enum before desktop emits or
  forwards a new feature name.

Production runtime evidence from C1 on 2026-06-19:

- Active in production: `OFAPI_DM_PROJECTION_ENABLED`, `OFAPI_DM_SYNC_ENABLED`,
  `OFAPI_ACCOUNT_HEALTH_ENABLED`, `OFAPI_CREDIT_LEDGER_ENABLED`,
  `OFAPI_BALANCE_PING_ENABLED`, `OFAPI_AUDIENCE_SYNC_ENABLED`.
- Active retention: `OFAPI_EVENT_RETENTION_DAYS=7`.
- Core production revision after C1 deploy: `d3b34fba3289`.

This evidence is a point-in-time gate result, not a future assumption. Every later production phase
must recheck live runtime config, ledger/dashboard behavior, and database state before changing
behavior.

No desktop spend-sweep reduction, no C3 settled spend mapper, no C5 snapshot removal of fallback
paths, no command gateway, and no historical DM backfill may start until the relevant gates above
are represented in core tests and production shadow validation.
