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

## Gate 2: Transaction/Spend Projection

This gate blocks C3 and desktop D6.

Required fixture state:

- `tests/fixtures/webhooks/transactions_new.json`: live-captured and anonymized.
- `tests/fixtures/webhooks/messages_ppv_unlocked.json`: live-captured and anonymized.
- `tests/fixtures/webhooks/unverified_tips_received.json`: documented example only. This is not
  enough to ship a money mapper. A live `tips.received` production or controlled-test fixture must
  be captured before `tips.received` contributes to settled spend.

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
   but does not change desktop behavior or reduce the desktop spend sweep.
2. Compare the shadow projection to the existing core `transactions` table and desktop
   `fan_transactions` rollups over sampled production windows.
3. Required comparison dimensions: page, fan, UTC day, category, gross mills, creator-net mills,
   row count, duplicate count, missing-fan count, and pending/estimated rows.
4. Acceptance before D6: zero duplicate settled rows; every mismatch over one cent per
   page/fan/day is explained; no unexplained category drift; rollback flag leaves the old
   10-minute desktop sweep unchanged.
5. Only after a clean shadow window may desktop D6 reduce `spend-sweep` cadence or make it
   fallback/dev-only.

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

No desktop spend-sweep reduction and no historical DM backfill may start until these gates are
represented in core tests and production shadow validation.
