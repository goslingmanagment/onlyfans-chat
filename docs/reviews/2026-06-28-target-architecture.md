# Target-Architecture Review — ChatGoose Desktop ⇄ Agency Hub "core"

**Date:** 2026-06-28
**Type:** Read-only, staff/principal target-architecture study of the two-repo system.
**Scope:** desktop = `chatgoose_desktop_fable` (Electron + React + TS, ~108k LOC); core = `core` / `agency_hub_core` (Fastify + Postgres/Drizzle + React dashboard, ~110k LOC).
**Method:** structural map of both repos + first-hand reads of the cross-system seams (command intake, transport, auth, SSE, webhook HMAC, schema/tenancy, contract) cross-validated by six parallel subsystem deep-dives. Paths are `repo:path:line`.

> This is a **mature, unusually self-aware system**, not greenfield. The owner has already written a north-star (`docs/PLAN.md:217-235`): *single trust boundary, core as sole secret-holder and sole OFAPI/LLM client, desktop as a thin local-first replica holding only the chatter token.* **That north-star is correct and is endorsed here.** This review validates it, sharpens what it under-specifies, and grounds the gap between today and it in code.

---

## 1. Current architecture

**Tenancy (core, authoritative) — single-agency-per-deployment.** There is no `agency` table; `models` is the root with no parent FK (`core:packages/db/src/schema.ts:141`). Isolation runs `models → pages → fans`, with chatters attached by `user_page_assignments` (`:1448`). The **page is the tenant unit**: `pages` (`:158`) carries `modelId`, `platform`, `label` (unique), `commissionRate`, `egressEndpointId`, and `ofapiAccountId` (`acct_…`, unique) — the OFAPI mapping. Identity: `users` (role enum), `api_keys` (sha256 digest, `revokedAt`), `auth_sessions`. Secrets at rest: `page_credentials.encryptedSession` (AES-256-GCM, `keyVersion`). Flags: `config_settings` overlay + `config_audit_log` + `runtime_instances` heartbeat. One DB = one agency.

```
                         OFAPI (onlyfansapi.com)          Anthropic / OpenRouter
                            ▲          │ webhooks                  ▲
              REST (proxy)  │          ▼  (HMAC)                   │ (proxy egress)
        ┌──────────────────┴──────────────────────────────────────┴────────────┐
        │  CORE  (Fastify + Postgres + pg-boss worker + React dashboard)         │
        │   intake→outbox→executor   webhook receiver→journal→projection         │
        │   read-gateway (live OFAPI passthrough)   SSE fanout (single worker)   │
        │   AI gateway   credit ledger   ofapi_commands / ofapi_webhook_events   │
        └───────▲──────────────────────────────▲───────────────────▲────────────┘
        REST commands │            SSE tail (Last-Event-ID) │   REST reads │  AI SSE (default OFF)
        ┌─────────────┴────────────────────────┴────────────────────┴──────────┐
        │  DESKTOP (Electron)   main = secrets + all network + SQLCipher        │
        │   send/engine (outbox)   sync (Hub/Polling)   ai/coordinator          │
        │   message-guard (compliance)   ofapi/client (+ still-live write POSTs) │
        │   ── preload (contextBridge allowlist + zod) ──  renderer (React)      │
        └───────────────────────────────────────────────────────────────────────┘
```

**The boundary today (honest state):**

| Concern | Owner | Transport | Note |
|---|---|---|---|
| **Writes** (text/media/typing/unsend/mark-read) | **core** | REST `POST /ofapi/commands` → outbox → executor | Hub-only; `ofapiWriteTransport: z.literal('hub')` (`desktop:.../settings/store.ts:178`) |
| **Reads** | core *or* desktop | `direct \| hub` (`OFAPI_READ_TRANSPORTS`) | Hub = live OFAPI passthrough via read-gateway; Direct = local key rollback |
| **Live events** | core | SSE `/events/stream` | `Last-Event-ID` replay + `409 sync_snapshot_required` |
| **AI** | desktop (default) | `direct \| hub`, default `direct` | core gateway built + prod-enabled; desktop rollout open (M7) |
| **Source of truth (render)** | desktop SQLite | — | "everything renders from SQLite; network only mutates SQLite" (SPEC §6.3) |

**Trust model.** Core is correct: API keys sha256-digested (passwords argon2id), and **row-level** authorization is enforced on all four desktop-facing seams — command intake (`resolveAssignedPage`, `core:.../ofapi-command-outbox.ts:119`), read-gateway (`ofapi-read-gateway.ts:409`), AI gateway (`canAccessPage`, `ai-gateway.ts:140`), and SSE (`assignedPageIds` scope + 60 s re-validation, `api/server.ts:1325,1434`). Commands are additionally scoped to `chatterUserId`, so a chatter cannot read another chatter's commands even on a shared page. **No "any valid token → any page" path exists.** Desktop is the adversarial surface and is only *partially* contained (§2.3).

---

## 2. Structural problems

### 2.1 The wire contract is triple-declared by hand — the highest-probability latent-bug source
The desktop↔core protocol exists as **three independent hand-kept copies**: desktop `preload/contract.ts` (TS) + `ipc/handlers.ts` (zod) ⇄ desktop `packages/shared/src/hub/client.ts` (zod) ⇄ core `packages/contracts/src/routes.ts` (zod) + generated `api-types.ts`. The command schemas are **byte-identical**: `client.ts:241` `hubOfapiCommandPriceSchema` ≡ `core:.../routes.ts:3163` `ofapiCommandPriceSchema` (`int().min(0).max(200).refine(p===0||p>=3)`), synced only by a *dated* "live contract check 2026-06-11" comment (`client.ts:1-6`). The OpenAPI is generated from the live server (`contracts/generate.ts`, static `info.version "2.0.0"`, no per-route/semantic versioning) — but **desktop and core share no compiled types**, so a core-side change silently desyncs desktop. **Core already publishes `packages/contracts` — desktop just doesn't consume it.**

### 2.2 Two source-of-truth ambiguities
- *Desktop:* SPEC calls SQLite "a cache," but it is the **sole master** for `outbox` (the permanent send audit, `schema.ts:148`), `ai_spend_log`, and `message_guard_events` (full message text), and a **two-master last-writer-wins** sync for `summaries` (reconciled only by a `generatedAt` compare, `summary-hooks.ts:101`, no version vector → silent cross-device clobber).
- *Core read path:* desktop's **hot reads hit live OFAPI** through the read-gateway (`core:.../ofapi.ts:699`), while its **gap-recovery snapshot serves the Postgres projection** `page_dm_*` (`core:.../ofapi-sync-snapshot.ts`). Two different sources that *can disagree* (projection lag, skipped/failed projections, flag-gating); reconciliation is pushed onto the client.

### 2.3 The trust boundary is half-migrated — secrets and enforcement still sit on the adversarial machine
This is the central architectural gap, and the threat model ("chatter's own, adversarial machine") is explicitly stated.
- Desktop still **ships a fully-functional Direct OFAPI write client** (`ofapi/client.ts:907-994`); "removed" is *by wiring* — three discipline guards (settings literal + the throwing `createOfApiTransportClient` wrapper + the engine's narrowed type). For a modified binary those prevent *accidents*, not abuse. The local OFAPI read key (rollback) remains a **god-key** on the box — OFAPI keys have *no scopes* (SPEC §5).
- **AI-safety is entirely client-side.** `escapeForPrompt` + safety preamble + output sanitizer all run in desktop `packages/shared` before the call; Hub-AI streams the **already-assembled** `{systemBlocks, userBlocks}` (`hub/ai-gateway.ts:63`). A tampered desktop hands core an arbitrary prompt **core cannot re-verify** — Hub-AI ports the prompt across without moving the trust boundary.
- **The Message-Guard compliance scanner** (off-platform contact-leak detection — the agency's platform-ban risk; Aho-Corasick + homoglyph/leet normalization in `packages/shared/src/message-guard/`) is **desktop-only**; core has no equivalent. A patched build bypasses it.
- **Spend is observed, never gated.** `reportCreditSpend` meters every OFAPI response (`core:.../ofapi.ts:457`) but there is **no pre-send budget or quota** at intake — a compromised desktop on an assigned page can burn the **shared global** credit pool (single OFAPI key for all pages), throttled only by a 300 cr/h alert + a 60/min route limit (~86k sends/day/chatter).
- **One read-gateway fail-open watch-point.** Authorization on the catch-all `GET /ofapi/read/*` depends on `resolveOfapiReadGatewayRequest` correctly extracting `ofapiAccountId` from *every* OFAPI path shape before the `assignedPageIds` check (`ofapi-read-gateway.ts:388-411`). Today an unclassifiable path fails **closed** (`NotFoundError`), but a *future* OFAPI endpoint whose path doesn't classify to an account is the one place this otherwise-airtight model could fail open. Pin it with a default-deny test.

> Net: encryption-at-rest defends offline disk theft and other-OS-user access — **not the chatter themselves**, who is the stated threat. The trust *model* is genuinely good; the problem is that the desktop half of the boundary still holds secrets and is the sole enforcer of safety, compliance, and spend.

### 2.4 Duplicated domain logic, no cross-repo shared package
`@chatgoose/shared` and `@agency_hub_core/shared` are unrelated packages. `htmlToPlainText` (desktop `transcript/html.ts`) and `normalizeDmMessageText` (core `dm-text.ts`) are ~85% the same algorithm with divergent edge handling. (Spender-bucketing/money are *deliberately* divergent — USD vs mills — so leave those.)

### 2.5 Dead/duplicated send-safety brain + a fragile correlation fallback (desktop)
`classifySendFailure` — the codified SPEC §7.4 "definite vs indeterminate" logic in `ofapi/send-outcome.ts` — is **called by no live path**; the Hub path switches on `command.state` instead, while stale comments still claim the old design. Worse, because OFAPI carries **no client-correlation id**, the "zero duplicated/lost messages" invariant ultimately leans on a **text-similarity fallback** (`rowMatchesCandidate`: normalized text + price + media + `[-2m,+10m]` window, `send/engine.ts:545`) — the reason `send/audit.ts` has to exist.

### 2.6 Structural hotspots that throttle change velocity and reliability
- **God-files:** core `api/server.ts` = **3,487 lines** — the entire HTTP API (all 116 routes) *and* the per-connection SSE state machine (replay loop, heartbeat, 60 s auth-revalidate, seq-guard, slow-consumer drop, `:1320-1514`) inline in the route handler, instead of beside the fanout hub in `events-stream.ts`. `db/schema.ts` = 2,242 (~50 tables); repositories `sync.ts` 75 KB, `ofapi.ts` 62 KB. Desktop `sync/polling-sync.ts` = 1,678, `index.ts` = 1,216, `ai/coordinator.ts` = 1,094, `ipc/handlers.ts` = 1,074.
- **`ofapi_webhook_events` is overloaded** with four jobs (idempotency log + stored SSE frame + `fanout_seq` replay log + projection bookkeeping); 7-day retention silently bounds the SSE replay window. `page_dm_*` has **two writers** (REST sync + webhook projection), a lost-update hazard the code visibly defends against with row locks.
- **SSE is a correctness-critical SPOF and scaling ceiling:** a single event worker (now correctly enforced by `assertOfapiEventWorkerSingleton` + a Postgres advisory lock, namespace 58211), a **global** `fanout_seq` across all tenants, O(subscribers) broadcast per frame, one LISTEN per API process, a 15-min forced lifetime + fixed `retry:3000` (no jitter → deploy thundering-herd). `ofapiEventWorkerReplicas` is documented as un-scalable until the fanout is redesigned for HA (`config-registry.ts:166`). **Financial data has no live path:** `transactions.new` is journaled but not fanned out → revenue freshness depends on the **hourly** polling stream.
- **Flag rollout is global-only and restart-gated.** Custody flags are code-default `false` → `config_settings` overlay → `applyBootOverrides` requires-DAG (fail-safe force-off) → published to `runtime_instances.running`. But overlays are **global-only** (`scope_type='global', scope_id=0`; per-page columns exist yet are unused, `schema.ts:2186`) → **no per-page/per-chatter canary** despite the page-scoped product; and `runtimeApply:'boot'` means a flip **needs a process restart**, with `api` vs `worker` able to diverge between restarts. Production state is determinable only from the `runtime_instances` heartbeat, not from source.

### 2.7 Tenancy assumption + doc drift
- **Single-agency-per-deployment is load-bearing but implicit.** No `agency_id` rides any fan/transaction/command/DM row; isolation rests entirely on `platform_account_id` FKs + `user_page_assignments`. Clean today, but co-tenanting multiple agencies would touch nearly every table and query, and owner reach is global-within-instance (`canAccessPage` → `true` for any `owner`). Make this a *stated decision* in SPEC, not an accident.
- **Doc drift (cheap to fix):** SPEC §9.2 / PLAN call the event-worker singleton a "config guard only, *not* mutual exclusion" — but the Postgres advisory lock now exists. And SPEC uniformly calls SQLite "a cache" (§2.2 shows it isn't). Update both.

---

## 3. Ideal target architecture

Endorse the owner's north-star and make it precise: **desktop talks only to core; core holds every secret and is the only thing that touches OFAPI and the LLM providers; every enforcement decision (safety, compliance, spend) is server-authoritative.**

```
  TARGET — one trust boundary, one source of truth, one clock

  DESKTOP (holds ONE secret: the core chatter token)
    renderer ─IPC(zod)─ main
       main:  • local SQLCipher replica (read model, rendered from)
              • write OUTBOX (intent log, clientCommandId)
              • message-guard runs for INSTANT UX only (advisory)
       talks ONLY to core:
         reads   ◀── SSE tail (last-applied seq = the ONE freshness clock)
         + snapshot/resync on 409
         writes  ──▶ REST command intake (idempotent)
         AI      ◀── streamed tokens (core assembles + sanitizes the prompt)
  ───────────────────────────────────────────────────────────────────────
  CORE (sole secret-holder; sole OFAPI + LLM client; sole enforcer)
    • command intake → outbox → executor   (KEEP — already excellent)
    • AUTHORITATIVE: prompt assembly + escape/preamble/sanitizer
                     message-guard re-scan at intake
                     per-page/per-chatter credit budget + send quota
    • webhook → journal → projection = the SINGLE read model
    • SSE fanout (sharded by tenant when it outgrows one worker)
    • ONE published contract artifact  ◀── desktop imports it
    • ONE credit + AI ledger
```

What this nails that today's split does not:
1. **Secrets:** desktop holds only the core token. Delete the local OFAPI key path and the desktop write client; OFAPI/LLM keys live only in core. (OFAPI has no scoped keys, so server-custody is the *only* real containment — SPEC §5(b) already mandates it before scale.)
2. **Enforcement moves with the secrets.** Core (re-)assembles and sanitizes prompts (accept raw context + `featureId`, not finished blocks), re-runs Message-Guard at command intake, and **reserves** credit/quota before executing. Client-side copies stay for UX; core is authoritative.
3. **One read source.** Trust the Postgres projection; retire the live-OFAPI read-gateway hot path. Desktop reads *only* SSE tail + snapshot → one freshness clock (`last-applied seq`), killing the dual-source reconciliation burden and the dishonest "обновлено Xs назад."
4. **One contract.** Publish `@agency_hub_core/contracts` (zod + generated types) as the single artifact; desktop imports it for command/usage/AI-gateway/SSE schemas. Drift becomes a compile error.
5. **Confirmation decoupled from execution.** Put command-state on the SSE stream (today it's poll-only) and settle on event rather than blocking the per-chat pump up to 30 s inline (`engine.ts:369`) — this also defuses the RU-DPI-throttle → `indeterminate`-churn interaction.

**Keep the resilience model exactly as-is:** local-first SQLite replica + write outbox. Core availability becoming load-bearing is the right trade (owner already accepted it): degraded = "no new data," not "dead," and it beats every laptop carrying a god-key.

**Shared logic across two repos:** one published contract package for the *wire*; for *pure domain logic* that is genuinely common (e.g. `htmlToPlainText`/`normalizeDmMessageText`), extract a single tiny zod-only package. Do **not** force-merge deliberately platform-divergent logic (USD vs mills, OnlyMonster vs Fansly buckets).

---

## 4. Migration path (incremental — every step rides an existing seam)

**Already correct — LEAVE ALONE (do not refactor for its own sake):**
- The **command-outbox idempotency spine** end-to-end: desktop `localId = clientCommandId` persisted *before* the POST + single atomic `claimNextQueued` + new-row-on-retry; core `UNIQUE(page_id, chatter_user_id, client_command_id)` + payload-hash conflict (200 dedup vs 409 mismatch) + claim predicate `queued ∧ attempt_count=0` + `CHECK attempt_count<=1` + partial-unique one-in-flight-lane + 2-min stale→`indeterminate` sweep + **never auto-retry** + webhook verifier promotion. The `confirmed` transition even accepts `fromStates:[in_flight, indeterminate]` so a slow-but-successful send still settles. **Don't touch it.**
- Row-level authz (`resolveAssignedPage`/`canAccessPage`); webhook security (raw-byte HMAC-SHA256 + `timingSafeEqual` + dual-secret rotation + idempotency-key `onConflictDoNothing`); SSE replay (durable `fanout_seq` cursor + monotonic seq-guard + `409` snapshot handshake + same-txn settle+NOTIFY); `packages/shared` platform purity; the preload `contextBridge` allowlist; encryption-at-rest (safeStorage + AES-GCM media + opaque `media://`); the Message-Guard matcher.

**Then, in order of risk-adjusted leverage:**

0.5. **Per-scope feature flags (enabler).** Wire the unused per-page `config_settings` scope columns so the trust-boundary steps below can be canaried page-by-page instead of all-pages-at-once-or-not-at-all. Without this, every step below is a global flip + restart.
1. **Contract unification.** Publish core `packages/contracts`; desktop imports it for hub schemas; delete the hand-mirror in `hub/client.ts`; add a CI drift check. *(Low risk, the artifact exists.)*
2. **Finish killing Direct OFAPI.** Read-gateway is already the default — once core is off the laptop tunnel onto stable hosting, remove the local OFAPI key path, **delete the write methods in `client.ts` and the dead `classifySendFailure`**, fix stale comments. Desktop now holds only the chatter token for OFAPI.
3. **AI server-side.** After M7 (core must not record a content-bearing generation as `$0`), have core assemble + sanitize the prompt (or re-apply guard + sanitize on received blocks), flip `aiGatewayTransport=hub` default, then remove local Anthropic/OpenRouter keys.
4. **Server-side compliance + spend governance.** Core re-scans Message-Guard at intake; add a per-page/per-chatter credit budget + send quota reserved at intake.
5. **Single read source + one clock.** Trust the projection; make snapshot + tail the only read path; retire the live read-gateway hot path and the desktop credit-meter throttle.
6. **Structural refactors.** Extract the SSE per-connection state machine from `server.ts` into `events-stream.ts` and split `server.ts` by domain; decouple `ofapi_webhook_events`' replay-log retention from its idempotency role; shard SSE fanout per tenant when one worker is outgrown; put command-state on SSE.

---

## 5. Top 5 highest-leverage changes (ranked)

1. **Finish the trust-boundary migration — get every secret *and every enforcement decision* off the desktop.** (Steps 2–4.) The product's entire threat model is "adversarial chatter machine," yet today the desktop holds god-keys *and* is the sole enforcer of AI-safety, contact-leak compliance, and spend. Nothing else matters as much: simultaneously the biggest security gap, the biggest revenue-risk gap (uncapped shared credit pool), and the biggest platform-ban-risk gap (client-side-only contact-leak scan). It is the owner's stated north-star — this is *finishing*, not re-deciding.
2. **Unify the wire contract into one published artifact.** (Step 1.) The triple hand-mirror is the highest-probability source of silent desktop↔core bugs, and the fix is nearly free because core already generates the artifact. Converts a drift *risk* into a compile error.
3. **Server-side spend + compliance gating at intake.** (Step 4.) Per-page/chatter credit budget + send quota + Message-Guard re-scan before execution directly defend revenue and the agency's most expensive failure mode (platform bans). Deployable behind a flag, independent of #1's full completion.
4. **Collapse to a single read source-of-truth.** (Step 5.) One model (core's projection), one clock (last-applied seq). Removes the live-OFAPI-vs-projection reconciliation burden, the duplicate polling, the split spend accounting, and the dishonest freshness indicator — the exact pains the owner's own audit named.
5. **Refactor the two reliability/velocity hotspots.** Extract the SSE per-connection machine from the 3,487-line `server.ts`; decouple the overloaded `ofapi_webhook_events` table; remove the dead `classifySendFailure` brain. Ranked last because it's velocity/ops rather than correctness — but `server.ts` and the single-worker fanout are what will most resist every change above, so it pays for itself.

---

### Appendix — things the repos already do right (preserve)
- Idempotent command outbox with DB-enforced exactly-once intake + at-most-once execution + human-adjudicated `indeterminate` (no auto-retry).
- Row-level tenancy authz on all four desktop seams; chatter-owned-command scoping; 60 s SSE re-validation; argon2id passwords; sha256-digested revocable keys.
- Webhook ingress: raw-byte HMAC-SHA256, constant-time compare, dual-secret rotation, idempotency-keyed journal.
- SSE replay/snapshot: durable `fanout_seq` cursor, monotonic seq-guard (exactly-once overlap), `409 sync_snapshot_required` handshake, same-transaction settle + NOTIFY.
- Desktop local-first: everything renders from SQLite; network only mutates SQLite; degraded = "no new data," not "dead."
- `packages/shared` platform purity (zero node/electron imports, single dep `zod`, network modules subpath-isolated from the barrel); preload `contextBridge` allowlist exhaustive both ways at compile time; encryption-at-rest (SQLCipher + AES-GCM media + opaque `media://` tokens).
- The Message-Guard contact-leak matcher (Aho-Corasick + homoglyph/leet normalization with provenance-preserving offset maps).

### Doc fixes to make in passing
- SPEC §9.2 / PLAN: the event-worker singleton now has a real Postgres advisory lock (namespace 58211) — not "config guard only."
- SPEC §2.2/§10: SQLite is not uniformly "a cache" — it is authoritative for `outbox`, `ai_spend_log`, `message_guard_events`, and two-master for `summaries`.
