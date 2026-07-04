# Architecture Review — ChatGoose Desktop ↔ Agency Hub Core

**Date:** 2026-06-29
**Type:** Read-only staff/principal architecture review of the two-repo system.
**Scope:** `chatgoose_desktop_fable` (Electron desktop, ~132k LOC) and `core` / `agency_hub_core` (Fastify + Postgres + React + pg-boss, ~110k LOC, in production).
**Method:** Independent reads of the critical seams (read-gateway, SSE state machine, local DB schema, command contract, auth, money) plus nine parallel deep-exploration passes across both repos, synthesised into one review.
**Citation convention:** `D:` = `chatgoose_desktop_fable`, `C:` = `core`. Paths are repo-relative; line numbers are as of the review date.

> Where a decision is genuinely a cost-vs-freshness-vs-resilience call, this review says so rather than forcing a pick.

---

## Independent pass — the problems ranked highest (before the flagged list)

These were formed from the code first; several sit *underneath* the seven flagged questions.

1. **The live read-gateway amplifies cost far beyond OFAPI credits, and nothing caps it.** Every proxied read runs *2 Postgres queries + builds and tears down a fresh proxied TLS dispatcher* (no keep-alive) + 1 live OFAPI call, with **no credit floor and a per-IP (NAT-shared) rate limit** (`C:apps/runtime/src/services/ofapi-read-gateway.ts:387,414`, `C:apps/runtime/src/services/ofapi-egress.ts:42-46`, `C:apps/runtime/src/api/server.ts:1560`). A buggy desktop poll loop can drain the agency's OFAPI balance to zero.
2. **The same DM data is materialised three times** (OFAPI → core Postgres projection → desktop SQLite) and the *most expensive* copy — live OFAPI — is the one on the hot path. Core's webhook-fed `page_dm_*` projection is **dead weight on reads** (snapshot/gap-recovery only).
3. **The real trust gap is client-side *enforcement*, not secrets-at-rest.** Compliance/guard, spend caps, and AI safety all run on the adversary's machine; `safeStorage` protects against everyone *except the chatter themselves* (the stated adversary). The only real boundary is what the chatter token is authorised to do server-side — plus the read-gateway allowlist, which is the sole thing standing between a chatter and **god-mode OFAPI access through core's key** (OFAPI keys have no scopes).
4. **The "no-HA real-time" framing is wrong in an important way:** the *fanout/API tier is already multi-replica-safe*; the genuine single points are the one settle-ordering worker (liveness/throughput, not data loss) and Postgres `LISTEN/NOTIFY` as the entire bus.
5. **Operational: the live-passthrough is maximally sensitive to the network path, and core now runs on a RU VPS** (`gosling-agency.ru`) that a prior session flagged as DPI-throttled to foreign traffic (~1 KB/s to OFAPI). If still true, 1 MB chat reads exceed the 60 s proxy timeout — **the #1 production risk and itself an argument for projection-serving.** *Flagged to verify; partly from prior-session memory.*
6. **Two-product coupling is a `max:10` connection pool**, not just "shared process" — a ChatMuse read spike starves the revenue dashboard (`C:apps/runtime/src/bootstrap.ts:134`).
7. **No AI/LLM spend cap on the Direct path** (the default), and Direct keeps LLM keys on every machine. Ironically, **Hub-AI — not yet rolled out — already has the server-side cap** (200/day, $5/day, atomic reservation; `C:apps/runtime/src/services/ai-gateway.ts:24,188`).
8. **Ephemeral typing/presence are journaled into the durable spine** — every keystroke burns a global sequence number + a 7-day row (`C:apps/runtime/src/services/ofapi-events.ts:203`).
9. **Docs lag code by days on core-side gates** — three items PLAN/SPEC call "open" already shipped in core.

---

## §1 Current architecture (with stale-claim corrections)

### The seam, as actually coded

```
 chatter's machine (adversarial)                    one VPS, one Postgres
┌──────────────────────────────┐         ┌────────────────────────────────────────┐
│ Renderer (React)             │  IPC    │  CORE = agency_hub_core (Fastify)        │
│  reads ONLY local SQLite ────┼────────▶│   ├ /ofapi/read/*  live passthrough ─────┼─▶ OFAPI
│  (query:* → data.*)          │ (zod)   │   ├ /ofapi/commands outbox+executor ─────┼─▶ OFAPI
├──────────────────────────────┤         │   ├ /events/stream SSE (journal replay)  │
│ Main (Electron)              │  HTTPS  │   ├ /ai/gateway/stream (built, unused)    │
│  SQLCipher replica           │  + SSE  │   ├ webhook receiver (HMAC) → journal     │
│  outbox / send engine        │◀───────▶│   └ DASHBOARD analytics (Fansly+OF) ──────┼─▶ OnlyMonster
│  AI coordinator (Direct keys)│  bearer │  worker: single settle-order fanout_seq   │
│  secrets: safeStorage        │  token  │  projections: page_dm_*, presence, spend  │
└──────────────────────────────┘         └────────────────────────────────────────┘
```

### Data ownership today (per code, not docs)

| Data | Truth | How desktop gets it | Stored where |
|---|---|---|---|
| Chats / messages / threads | OnlyFans (OFAPI) | **Live passthrough** → upsert local | OFAPI + core PG projection (bypassed) + **desktop SQLite** |
| Presence / "online now" | OFAPI live | **Live** `filter[online]` pull **+** SSE deltas | 3 disjoint reps; desktop = in-memory only |
| Typing | ephemeral | SSE | journaled (smell) |
| Transactions / spend | **OnlyMonster→core** (mills); OFAPI = shadow | Live `/transactions` → local | core PG truth + desktop SQLite (dollars, `REAL`) |
| Fan summaries | **locally-authored AI** | local; mirrored to core shared store | desktop + core |
| Outbox / send intent | **locally-authored**; core row = execution truth | local | desktop + core command row |
| Guard/compliance events | **locally-authored audit** | local only | desktop SQLCipher only |
| AI spend | should be core; today **local** on Direct | local `ai_spend_log` (micro-USD) | desktop |

**Transports.** Reads = live passthrough through each page's egress proxy (`C:ofapi-read-gateway.ts:419`, proxy *mandatory*); writes = command outbox + one-attempt executor, **at-most-once / never-auto-retry** (`C:apps/runtime/src/services/ofapi-command-executor.ts`); real-time = SSE over a Postgres journal with a `fanout_seq` cursor, `Last-Event-ID` replay, and a `409 → /events/snapshot` gap path (`C:server.ts:1320-1529`).

**Trust model.** Desktop authenticates with a `chatter`-role bearer token; `assignedPageIds` is derived **server-side** at auth time and never trusted from the request; page scoping is enforced at all three ChatMuse boundaries (`C:apps/runtime/src/services/auth.ts:671,712`, `C:ofapi-read-gateway.ts:388`, `C:apps/runtime/src/services/events-stream.ts:88`). Owner = global superuser; **no DB-level tenant key** — this is single-agency-per-deployment with per-page sub-scoping.

**Core is multi-platform, not "two products."** Fansly is *not* dead code — `FanslyAdapter` is wired in `C:bootstrap.ts`, with live presence/workboard/sync paths. Core is a mature multi-platform agency analytics backend (Fansly + OnlyFans-via-OnlyMonster) onto which the OFAPI/ChatMuse real-time + chat stack was added, reusing the existing page/proxy/auth/fan infrastructure. That reuse is a strength; the shared process/DB is the cost.

### Stale claims to correct (the review's framing and the repos')

- **"Reads: desktop → core read-gateway"** — true as the *default*, but **Direct read is still a selectable rollback** (`D:apps/desktop/src/main/settings/store.ts:236`, `ofapiReadTransport ∈ {direct,hub}`). **Writes** *are* hard hub-only (`z.literal('hub')`, `D:settings/store.ts:178`).
- **"SSE … single worker … no HA path"** — incomplete. The worker is single *by explicit design* (advisory-lock guarded, `C:ofapi-events.ts:392`), but the **API tier is already replay-safe for N replicas** (independent watermarks + durable cursor, no sticky sessions). Gap-recovery (replay + snapshot) is solid. The real SPOFs are the settle-worker (a *liveness/throughput* bottleneck, no data loss) and Postgres `LISTEN/NOTIFY` as the whole bus.
- **"core maintains projections … desktop bypasses these"** — correct, and deeper: there are **two** projection layers; the live read is redundant with **both**.
- **Money "units differ — landmine"** — *mostly* separate islands (every `*Mills` field is on dashboard/analytics routes the desktop's typed hub client never reads), **except one live crossing**: the SSE cold-archive snapshot converts mills→dollars at a single unguarded site (see §2 B9 and §3 Q4). Risk is therefore **one live silent-corruption point + a latent REST-mills path**, not zero.
- **Desktop PLAN/SPEC** still list as "open": the AI-gateway zero-token bug (fixed in core, commit `f7469e7`), the event-worker singleton lock (shipped, `ea3ffa2`), and the C6a identity fix (committed, `5fdc85b`). Both repos still warn "move core off the laptop tunnel" though it's on a stable VPS. **Genuinely open = owner/pilot evidence + off-server backups**, not engineering.
- **Doc bug:** `C:docs/decisions.md` #53 says a cursor-ahead returns HTTP 400; code returns 409 (`C:server.ts:1342`).
- **Contradiction across repos:** `C:docs/chatgoose-custody-go-live.md:29` lists `ofapiSpendTransactionIngestEnabled=true` as *required running state* while `D:docs/PLAN.md:252` says *do not enable as spend truth* — reconciled only by the desktop's hourly sweep net.

---

## §2 Blind spots / what wasn't asked (weighted heavily)

**B1 — Per-read cost amplification (load, not just credits).** Each gateway read = `listOfapiMappedPages` + `findPageById` (2 PG queries) + `createProxyRequestDispatcher` + `dispatcher.close()` (a fresh proxied connection, no keep-alive) + the OFAPI call (`C:ofapi-read-gateway.ts:387,414`, `C:ofapi-egress.ts:42`). At 20–60 s polling × pages × chatters, that's DB load and TLS handshakes the "1 credit" framing hides. Cheap fixes exist (cache the page mapping; reuse keep-alive dispatchers).

**B2 — No spend governor on the read path.** No per-account/per-chatter credit budget, no balance floor; the only limiter is 120/min keyed **per-IP with no `keyGenerator`** (`C:server.ts:408`), so chatters behind one NAT share a bucket and a chatter on a unique IP is effectively unbounded. The budget machinery exists only in the *executor sync* path, not the gateway.

**B3 — Triple data custody.** Core's `page_dm_*` projection is good engineering the hot path never uses. You pay to build/store it (webhook → settle → projection) *and* pay OFAPI credits to fetch the same data live. Either the projection should start serving reads (§3 Q2) or its read-serving ambition should be explicitly scoped to gap-recovery so nobody over-invests.

**B4 — Two-product coupling is a 10-connection pool.** `new Pool({connectionString})` with no `max` ⇒ node-pg default 10, shared by dashboard *and* ChatMuse (`C:bootstrap.ts:134`, `C:packages/db/src/client.ts:8`). One ChatMuse read spike (or a reconnect storm after the 15-min SSE lifetime cap) can exhaust it and stall revenue queries. No bulkhead, no global concurrency cap (`global:false`, `C:server.ts:409`). Fixable without splitting the deployable.

**B5 — Network-path fragility + RU-VPS DPI.** The live-passthrough makes the read experience a direct function of *two* network legs (chatter→core and core→proxy→OFAPI). The 60 s proxy timeout (`C:apps/runtime/src/services/ofapi.ts:18`) means any sustained sub-30 KB/s path fails 1 MB reads outright. A prior-session note flags `gosling-agency.ru` foreign traffic as DPI-throttled to ~1 KB/s. **Verify the current host and the egress-proxy geography** — if the throttle is real, it dominates everything else here. *Hedged: leans on memory.*

**B6 — Ephemeral mixed into the durable journal.** `users.typing` / `users.online|offline` each get a global `fanout_seq` + a 7-day-retained journal row and compete for the single worker's one-txn-per-event throughput (`C:ofapi-events.ts:189-206`). On reconnect, clients replay minutes-old typing. Highest-ROI real-time fix is to split these onto a transient channel.

**B7 — Enforcement on the adversary's machine.** Guard/compliance (`D:apps/desktop/src/main/message-guard/runtime.ts:184`), the `canSend` gate, AI safety (escape/preamble/sanitizer), and *all* spend caps run client-side only; a patched build or extracted token bypasses every one. Core's command intake does **not** re-run the guard. Fine for a trusted pilot; a hard prerequisite before untrusted-chatter scale. Rides the command-outbox seam.

**B8 — The gateway allowlist is the real attack surface.** It's the only thing converting a chatter token into *scoped* OFAPI access over core's unscoped god-key. The path-segment decoder has traversal guards (`C:ofapi-read-gateway.ts:45-69`) — good — but the allowlist deserves fuzzing and a written invariant ("no allowlisted path may mutate OnlyFans state"), since `GET /messages` already mark-reads as a side effect.

**B9 — Money has one live, unguarded mills→dollars crossing.** Cold-archive money is stored in mills and converted at exactly one site: `C:apps/runtime/src/services/ofapi-sync-snapshot.ts:192` (`price: Number(priceMills)/1000`) and `:195` (`tipAmountUsd: Number(tipAmountMills)/1000`). The desktop accepts any non-negative number with **no sanity cap** (`D:packages/shared/src/protocol/index.ts:225,229` → `D:apps/desktop/src/main/sync/mappers.ts:198,202`). Drop/rename that `/1000` and the desktop silently renders **1000× tips and PPV prices**. Nothing tests it. (Desktop float money — `REAL` columns summed at read-time — is fine for display; keep it display-only and never authoritative against core's exact mills.)

**B10 — Command ordering is mutual-exclusion, not FIFO.** Only one `in_flight` per `(page,conversation)` is guaranteed; a command losing the lane race waits **up to ~60 s for the sweep**, and a later send can overtake an earlier one. Outcome delivery is **poll-based** (`GET /commands/:id`), not pushed. Multi-part sequences can reorder under contention.

**B11 — No per-message monotonic version in the replica.** Merge correctness rests on `created_at`/id heuristics + hand-written head guards (`D:apps/desktop/src/main/sync/polling-sync.ts:760,862`). Works, but yields rare, hard-to-reproduce ordering bugs; a per-message version/seq would make merges total.

**B12 — Tenant scoping is hand-repeated.** `canAccessPage`/`pageScope` is copy-applied across ~30 handlers with **no central preHandler**, and the predicate is duplicated three times (`C:server.ts:264`, `C:apps/runtime/src/services/spenders.ts:114`, `C:auth.ts:712`). One forgotten guard = cross-page leak. A single resolving+asserting `preHandler` makes the bug class impossible by construction.

**B13 — Two OnlyFans ingestion paths in core.** OnlyMonster (transaction truth) and OFAPI (ChatMuse + webhooks) both feed `pages/fans/transactions`. The spend projection ("shadow, forward-applied") is the seam. Real, defensible complexity — but "spend truth" has two clocks, and the doc contradiction in §1 is a symptom.

**B14 — Contract drift is silent and unguarded by CI.** No cross-repo parity test exists; even core's *internal* `contracts:generate` is referenced nowhere in `C:.github/workflows/ci.yml`. The wire holds by tolerant-reader + additive evolution, with live drift already present (see §3 Q4).

---

## §3 Open questions / solution space (options first), with the recommendation per question

### Q1 — Source of truth per data kind

**Options** hinge on classifying by *volatility × authority*: durable conversational (chats/messages) — live vs. projection vs. hybrid; ephemeral (presence/typing) — stream only; financial — exact + reconciled (core mills, never desktop float); derived/authored (summaries, drafts, outbox intent, guard audit) — local, optionally mirrored.

**Recommendation.** Make the model explicit per kind rather than "everything live": durable conversational → **core projection is the canonical replica, desktop mirrors it, live OFAPI is a fallback/refresh** (Q2); ephemeral → **stream, never journal** (Q6); financial → **core mills is truth, desktop is display**; authored → unchanged (already right). Fix now: presence has **three** unreconciled representations (live pull, webhook projection, SSE) — collapse to "SSE-fed projection is truth; the `filter[online]` pull is a manual refresh of it."

### Q2 — Read path: live passthrough vs. projection *(the central call, partly yours)*

**Options.**
- **(a) Status quo — all live.** *Pro:* always fresh; simple; OnlyFans read-state side effects "just work"; no projection-correctness burden. *Con:* per-read amplification (B1); no spend floor (B2); network-path-fragile (B5); redundant with both projections (B3).
- **(b) Hybrid — serve high-frequency/low-fidelity reads from the projection, keep live only for the open-conversation tail + explicit refresh.** *Pro:* cuts the hottest polls (chat-list, unread reconcile, history pagination) off OFAPI; resilient to OFAPI/network blips; offline-from-core. *Con:* needs projection completeness — the hot store **hard-codes `price:0`/`media:[]`**, has **no historical backfill**, and `unread` is a heuristic (`C:ofapi-sync-snapshot.ts:170`); loses the GET-marks-read side effect.
- **(c) Full projection + SSE, live only as gap-recovery.** *Pro:* minimal credits, max resilience. *Con:* biggest correctness investment; must match OnlyFans exactly.

**Recommendation — and the evidence that flips it.** Diagnostics put live REST at only **~1,050 credits/7 days**. If credits are cheap in absolute terms, the case for (b)/(c) is **resilience and load, not credit savings** — so the cheap mitigations capture most of the value without the projection tax:

> **Do the "b-lite" mitigations first** (migration #2): page-mapping cache + keep-alive dispatcher reuse + a per-page/agency **credit floor** + a per-chatter rate-limit key. Near-zero risk; kills B1/B2 directly.

Then invest in real projection-serving **only if**: (i) the network path (B5) hurts the chatter experience; (ii) scale pushes OFAPI credits or DB load into the binding constraint; or (iii) you need offline/blip resilience for the inbox. If you do, start with the **chat-list poll** (highest frequency, tolerates projection fidelity), measure the delta, and expand to history only after backfilling PPV-price/media into the hot store. **Keep the open-conversation tail live** regardless — freshness + the read-state side effect. *This is the place to decide on cost-vs-freshness-vs-resilience rather than have the review decide; verify B5 first, because a bad network path changes the answer.*

### Q3 — Trust boundary: secrets + enforcement

**Options for secrets:** today writes need no OFAPI key, reads default to hub (OFAPI key only under Direct rollback), **AI Direct keeps LLM keys on every desktop**. End-state = chatter token only.
**Options for enforcement:** keep client-side, re-enforce server-side, or both (defense-in-depth).

**Recommendation.**
1. **Accept the Hub-AI rollout** — removes LLM keys from every machine *and* turns on the server-side spend cap already built (`C:ai-gateway.ts:24,188`). Gate on the two real loose ends: wire desktop `ai:cancel` → server abort, and one round of load evidence. Direct is acceptable only because the pilot is trusted.
2. **Re-scan guard/compliance at core's command-outbox intake** (the desktop scan stays for UX latency). Highest-leverage trust improvement; makes a patched client or extracted token gain *nothing the token isn't already authorised to do.*
3. **Treat the read-gateway allowlist as a security control** (B8): fuzz it, write the no-mutation invariant, add the credit floor.
4. Stop reasoning about local-at-rest encryption as a control against the chatter — it defends against device theft/other apps only. *Evidence that changes urgency:* if chatters remain fully trusted employees on managed devices, (2) stays a scaling-prerequisite rather than a now-task.

### Q4 — Wire contract

**Grounding.** The wire is hand-mirrored zod in *both* repos with **no shared source of truth** (desktop has zero dependency on any core package; the only link is a comment pointing at `~/code/core/reference/agency-hub.openapi.json`). Core *generates* `api-types.ts` via `openapi-typescript` that nobody consumes. The desktop runtime-validates every response with its own zod (`D:packages/shared/src/hub/client.ts:670`). The contract holds by **tolerant-reader + additive evolution**, and **live drift already exists**:
- Desktop has a **`readStateChanged`** SSE variant core does not emit (`D:protocol/index.ts:301` vs none in `C:packages/contracts/src/routes.ts:2884`) — safe only because desktop reuses the union over local IPC.
- **`messageDeleted`**: core `{type, accountId, messageId}` (no `chatId`) vs desktop adds `chatId` optional (`C:routes.ts:2838` vs `D:protocol/index.ts:291`).
- `profile.source` enum→string and prompt-block `.strict()` asymmetries.

So drift here is **absorbed silently**, not failed-loud — and additive/tolerant is the *only* safe evolution (no required-field adds, no enum tightening, no `version: z.literal(1)` bump without lockstep). The generated artifact is **blind exactly where drift lives**: SSE responses are typed `z.string()` and the AI stream `z.unknown()`, so `SyncEvent` and AI-stream frames don't appear in `api-types.ts` at all.

**Options:** (a) generate-and-consume types; (b) shared zod package; (c) contract test + golden fixtures; (d) status quo.

**Recommendation (revised toward the actual risk surface):**
1. **First, two cheap tests that pin the live risks** (these belong in the #1-tier cheap wins, not later): a core unit test asserting `ofapi-sync-snapshot` emits **dollars** for a known mills input (locks the `/1000`, B9); and a desktop fixture-parity test running canonical core responses **and SSE frames** through the desktop zod (catches `readStateChanged` / `messageDeleted.chatId` / enum drift).
2. **Then a *targeted* shared zod package** for **just the SSE union + the command/usage/AI-gateway schemas** — small, near-identical, runtime-validated, and the highest-drift surface, precisely where codegen can't reach. This is the one place a shared definition justifies the repo-coupling cost.
3. **Do not** rely on generate-and-consume (a) as a complete answer — it covers the REST half and leaves the risky SSE/AI-stream half uncovered. A full shared package across the whole contract is the "someday-right" blocked by repo separation; the targeted version above is the pragmatic subset.

**Money:** keep mills/dollars as separate islands; route any future desktop consumption of a `*Mills` endpoint through one typed boundary function with a fixture asserting the unit; never store float as authoritative.

### Q5 — Local-first vs. server-authoritative

The local replica is a genuine strength (sub-300 ms paint, offline inbox, draft durability) — **keep it.** Division: **local = read model + send intent/outbox + UX state; core = source of truth for everything durable + execution + enforcement.** Fix: (1) the **bolt-on live-read surfaces** (vault, chat gallery, spenders rosters, online rail) bypass SQLite and break offline (in-memory caches in main) — either back them with a local table or *document them as online-only* and stop implying "everything renders from SQLite" (SPEC §6.3 is now false). (2) Consider a **per-message version/seq** to make replica merges total (B11).

### Q6 — Real-time scaling/reliability

**Options, cheapest first:** (a) status quo; (b) **decouple ephemeral typing/presence from the journal**; (c) **run 2+ API replicas** (already replay-safe) behind the existing LB; (d) **warm-standby worker** on the advisory lock for fast failover; (e) Redis/NATS bus.

**Recommendation:** **(b) → (d) → (c)**, and **(e) only on measured evidence.** (b) is the highest ROI — a localised change in `mapOfapiEventToSyncEvent` + the SSE channel that cuts worker load, sequence churn, journal volume, and stale replay at once. (d) shrinks the fanout-stall window from "manual restart" to seconds with no ordering redesign. (c) removes the API connection-capacity SPOF but first needs each replica's drain made page-aware so N replicas don't each scan the whole journal (`C:events-stream.ts:133`). **Do not** start with the multi-active-worker ordering redesign — (b) likely defers that need for a long time. *Evidence that changes it:* if presence/typing volume is low, skip (b) and just do (d).

### Q7 — Structural debt, ranked by how much it blocks change

1. **Two-product coupling (shared pool/process)** — blocks independent scaling & reliability isolation of ChatMuse. *Cheap partial fix without a repo split:* separate connection pools per surface, and/or run a second instance of the **same image** serving only ChatMuse routes behind the LB (process split ≠ repo split).
2. **`server.ts` god-file (3,487 lines)** — blocks safe change by readability, but handlers already delegate to services, so a **mechanical split into route-group registrars** is low-risk. Friction is shared closures (`boss`, `syncEventHub`, `requirePrincipal`) — pass them into registrars.
3. **Double-projection redundancy / live-passthrough** (→ Q2).
4. **Ephemeral-in-durable-journal** (→ Q6).
5. **Hand-mirrored contract** (→ Q4) — low urgency given fail-loud REST validation, *but* the SSE/money seam is the exception (B9/B14).
6. **Money-unit heterogeneity** — one live crossing (B9) + a latent REST-mills path; otherwise separate islands.
7. **Overloaded tables** (`page_fans.external_presence_*`, etc.) and ~13 legacy markers — modest. Fansly is *not* dead code; core is genuinely multi-platform.

**On "split core into services":** the long-term target *for the ChatMuse real-time/read surface specifically* (different scaling profile and failure domain than batch analytics). But the incremental moves above capture ~80% of the isolation benefit while it stays one deployable, so a repo/service split is **not** on the critical path.

---

## §4 Recommendations summary

Folded into each question above. The throughline: **the cheapest, lowest-risk wins (read-path mitigations + the money/contract tests) defend against the most concrete failures** (unbounded OFAPI spend; a silent 1000× money bug), so they outrank the larger architectural moves. Bigger investments (projection-serving, replica scale-out, server-side enforcement) should be triggered by *evidence* — network-path quality, scale, and the trust posture of who's running the desktop — not by architectural aesthetics.

---

## §5 What's already right (preserve — don't refactor for its own sake)

- **Send-path safety is textbook.** At-most-once via five independent guards (atomic claim + `attempt_count ≤ 1` CHECK + pg-boss `retryLimit:0` + `singletonKey` + one-`in_flight`-per-lane unique index), `clientCommandId` dedupe, park-on-uncertainty, **zero auto-retry of indeterminate**. The desktop's "re-POST only when `coreCommandId` is null" depends on exactly core's `(page,chatter,clientCommandId)` uniqueness — which **holds in code** (`C:apps/runtime/src/services/ofapi-command-outbox.ts`, `D:apps/desktop/src/main/send/engine.ts:329`). The crown jewel; change nothing without a regression.
- **The SSE design is genuinely good:** journal as source of truth, NOTIFY as *wake-up only* (lost-NOTIFY structurally impossible), serialised in-order drain, monotonic per-connection seq guard, `Last-Event-ID` replay + `409 → snapshot` gap-recovery, auth revalidation, bounded lifetime, slow-client drop (`C:events-stream.ts`, `C:server.ts:1320`). Already multi-replica-capable.
- **Secrets at rest:** `safeStorage` + SQLCipher, refused if OS crypto absent, never returned to the renderer; IPC channel allowlist + zod at every boundary + navigation lockdown (`D:apps/desktop/src/main/secrets/keychain.ts`, `D:apps/desktop/src/preload/index.ts`).
- **Auth:** method↔role bound at authentication time, server-derived `assignedPageIds`, no client-supplied scoping, argon2id + timing equalisation.
- **Infra reuse:** ChatMuse rode core's existing page/proxy/auth/fan machinery instead of rebuilding it.
- **Migration discipline** (desktop schema v1→v16, each block annotated with the why) and **fail-loud response validation** on the desktop REST surface.
- **AI-gateway server-side quota + atomic reservation** (when enabled) — the right design, just not yet rolled out.

---

## §6 Migration — incremental, each step on an existing seam, ranked by leverage

| # | Move | Seam it rides | Risk | Why it's high-leverage |
|---|---|---|---|---|
| **1** | **Pin the money/contract seam:** money-seam test (lock the `/1000`) + golden wire-fixture parity test incl. SSE frames | CI | very low | Defends against a silent 1000× money bug + catches the live SSE drift (B9/B14/Q4) |
| **2** | **Read-path mitigations:** cache page mapping; reuse keep-alive dispatchers; per-page/agency **credit floor**; per-chatter rate-limit key | read-gateway | very low | Kills B1+B2 (amplification + unbounded spend), no behavior change |
| **3** | **Decouple typing/presence** onto a transient channel (stop journaling) | `mapOfapiEventToSyncEvent` + SSE | low | Cuts worker load, journal churn, stale replay (Q6) |
| **4** | **Re-scan guard/compliance at command intake** | command outbox | low | Closes the #1 trust gap before untrusted-chatter scale (Q3) |
| **5** | **Accept Hub-AI** (wire `ai:cancel`, gather load evidence) | selectable AI gateway | medium | Removes LLM keys from desktops **and** enables the existing spend cap |
| **6** | **Separate DB pools per surface** (or second same-image instance) | `bootstrap.ts` pool / LB routing | low | Bulkheads ChatMuse from the dashboard (B4) without a repo split |
| **7** | **Mechanical `server.ts` file-split** into route-group registrars | already-delegated handlers | low | Makes every later change safer |
| **8** | **Targeted shared zod package** for the SSE union + command/usage/gateway schemas | contracts | medium | Removes the highest-drift duplication codegen can't cover (Q4) |
| **9** | **Warm-standby worker** on the advisory lock | event worker | medium | Fast fanout failover, no ordering redesign (Q6) |
| **10** | **Selective projection-serving**, starting with the chat-list poll | read-gateway + snapshot infra | medium–high | *Only if* #2's measurements or B5 say reads are still the binding constraint (Q2) |
| **0** | **Reconcile docs; verify the production host/DPI path (B5)** | docs / ops | — | Prevents redundant work; B5 may reorder this whole list |

---

## Where the owner's judgment is required

- **Q2 (live vs. projection)** is genuinely a cost/freshness/resilience call. Read: credits look cheap, so do the cheap mitigations (#2) and let *resilience/network* — not credits — decide whether to invest in projection-serving. **Verify the host/DPI path (B5) before that decision.**
- **Hub-AI acceptance (Q3/#5)** trades a possible latency regression for removing every desktop's LLM keys and gaining a spend cap — worth it before scaling; the pilot-timing call is yours.

---

## Revisions / provenance

This document consolidates an independent code study with nine parallel exploration passes. Two conclusions were sharpened late by the wire-contract/money analysis and are reflected in the body above:

1. **Money seam (B9, Q4):** an earlier draft called mills/dollars "separate islands, not on the desktop wire." That is true for the live read-gateway and the typed hub client, but **the SSE cold-archive snapshot path is a real, unguarded mills→dollars crossing** (`C:ofapi-sync-snapshot.ts:192,195`). Upgraded from "latent" to "one live silent-corruption point."
2. **Contract drift (Q4, B14):** an earlier draft implied the contract was "in sync / fails loud." Correct for the REST surface; **the SSE union has live drift** (`readStateChanged`, `messageDeleted.chatId`) absorbed silently by tolerant-reader. The Q4 recommendation was revised to put two cheap pinning tests first and to scope the shared-zod package to the SSE union specifically.

All other conclusions stand. Items marked *hedged* (notably B5, the RU-VPS DPI throttle) rely partly on prior-session memory and should be verified against the current production host before being actioned.
