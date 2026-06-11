# ChatGoose Desktop — Implementation Plan

Status: Draft v1 — 2026-06-10. Phases gate on the acceptance criteria in [PRD.md](PRD.md) §12. Each phase ends with a working, demoable increment; AI features arrive as early as possible (they are the product's soul — the chat client is the vehicle).

## Phase 0 — Validation spikes & bootstrap (~week 0–1)

**Goal: kill the riskiest unknowns with real accounts before writing product code.**

> **Status 2026-06-10:** OFAPI dev/test API key obtained and saved in `.env` (`ONLYFANSAPI_API_KEY`, gitignored); key verified via `/api/whoami` (team `goslingmanagment`). A **real, authenticated** account is already connected: `loravie` ("LoraVie FREE", `acct_fbaf2216a7c84147a599f349e0a6fb87`) — so all **automated** spikes must be read-only (no sends, no state mutations); send testing is done manually by the owner only (item 8). Observed on the key (2026-06-10): **credit balance 99,255; 5,000 RPM** (Pro-tier) — plenty for all spikes and early phases, vendor credits question now low-priority. Webhook CRUD verified working via API (`GET /api/webhooks` → `[]`; events catalog returns all 28 events). Webhook registration: do NOT configure manually in the dashboard — the Phase-0 spike registers a temporary tunnel webhook via API (with a signing secret), captures fixtures, then deletes it.

Ops/validation (needs admin + the connected account):
1. ~~Buy OFAPI plan / connect account~~ **Done 2026-06-10** (dev key in `.env`, 99k credits, 5,000 RPM; `loravie` connected via dashboard login). Remaining from this item: confirm credit allocation terms with the vendor (low priority) and scope granularity **resolved 2026-06-11: OFAPI keys have NO scopes** (vendor FAQ: every key = full access to all connected accounts and endpoints) — custody plan rewritten in SPEC §5 (named pilot keys + P6 gateway custody required before scale).
2. **Coexistence observation (PRD risk #1) — read-only half:** account stays active in OnlyMonster while the OFAPI session exists, for several days. Verify: no logouts / 2FA churn; observe read/typing behavior. The send half moves to the pre-P3 send-spike (item 8).
3. **Latency spike (PRD risk #2) — read-only:** scripted p50/p95 for list-chats, list-messages(100), user-details over ~200 calls at realistic hours; record credit burn vs estimates (PRD §10). Also check: is `lastReplyAt` actually present on chats yet (live check 2026-06-10: absent on the freshly connected account — PRD F2 fallback decision depends on this); are avatar/thumb hosts (`thumbs.onlyfans.com`, `public.onlyfans.com`) fetchable directly or IP-locked like `cdn*.onlyfans.com` (decides `media://` proxy scope); does the chat object expose any pinned/priority flag (PRD F2 badges).
4. **Webhook smoke test:** temporary endpoint via `cloudflared`/`ngrok` tunnel; subscribe to **every event** from `GET /api/webhooks/events` (28 events; cost is 1 credit/100 events); capture real payloads into `tests/fixtures/webhooks/` for everything that fires during the window — at minimum `messages.received/sent` and `users.typing/online/offline`, which the P3 UI depends on. Events that don't fire naturally in the window (`subscriptions.*`, `messages.ppv.unlocked`, `transactions.new`) fall back to documented example payloads, marked unverified. Also fetch one historical **tip message** via list-messages on a chat known to contain tips and record its exact JSON (does it carry an amount field?) — resolves the transcript tip-label ladder (SPEC §8.2). **PII handling is mandatory:** the tunnel must be access-protected (e.g. `cloudflared` access / token-gated endpoint); raw captures live under `tmp/` (gitignored) only; fixtures are anonymized before commit (replace names/usernames/texts/ids, preserve structure exactly). Same rule for latency-spike logs.

Engineering bootstrap:
5. pnpm monorepo scaffold (electron-vite app boots, blank window, CI `pnpm check` green).
6. OpenAPI → TS codegen script wired to vendored `openapi.json`.
7. Build the `packages/shared` core **fresh from the behavioral spec** (CLAUDE.md rule: legacy is reference, not copy material): errors, split, xml, reply-output, prompt-injection, model registry — adopting the legacy test cases as the acceptance suite (re-expressed, none dropped). Locks the behavioral safety net in place first.
8. **Pre-P3 send validation — owner-manual (decided 2026-06-10: no automated send scripts; the owner personally performs a handful of test sends on `loravie`).** Checklist to cover by hand, ideally while the item-4 webhook listener is running so responses/events get captured: sends appear correctly in OnlyMonster (send half of the coexistence test); does the `messages.sent` webhook fire for our own API sends (the §7.5 send-verifier leans on it); one deliberate send with a restricted word to capture the 400 + `textHighLight` shape; informal latency feel (no p50/p95 needed).
   - **WAIVED 2026-06-11 (owner decision): this checklist is skipped.** Consequences carried into P3, not dropped: (a) §7.5 send-verifier will meet a live `messages.sent` for the first time in P3 code — P3 must treat the OFAPI send contract (success shape, whether `messages.sent` fires for our own API sends, send→event latency) as **unverified** and validate it as the first task of the phase, **only on an owner-designated controlled test fan (`.env` `P3_SEND_TEST_FAN_ID`, an account the owner controls on the FREE page) — never a real fan, and not at all if that id is unset** (`loravie` is live; a wrong send risks a page ban), before building the outbox on top; (b) the restricted-word `400 + textHighLight` shape is **uncaptured** — the §7 restricted-words UX is built against the documented shape and reconciled against the first real 400; (c) the send-half of the coexistence test (PRD risk #1) is unverified — watch for OnlyMonster interference on the first real P3 sends. Original gate ("P3 does not start until this checklist is done") is **lifted** by this waiver; the validation moves *inside* P3's opening step.
   - **P3 opening validation EXECUTED 2026-06-11** (on the designated test fan only; 2 benign messages, both unsent afterward; temp `messages.sent`-only webhook scoped to loravie registered and deleted; core's webhook untouched): **(a) RESOLVED** — success shape captured (`data` = full message object, `cancelSeconds` ≈24 h; round-trip 3.6 s), and `messages.sent` **does fire for our own API sends**, delivered ~0.2 s after the POST response — the §7.5 verifier keeps webhook confirmation as the fast path with tail-fetch reconciliation as the universal fallback; **(b) RESOLVED** — real 400 captured: wrapped `ONLYFANS_COM_ERROR`, OF body at `onlyfans_response.body`, `errors.textHighLight` = array of strings (observed: the full message text, **no per-word markers**), no `_meta`; `cashapp` triggered it, `venmo` did not; **(c) PARTIAL** — 2 API sends + 2 unsends caused no observable OnlyMonster interference (thin evidence; keep watching during the first pilot sends). Contract facts + fixtures: SPEC §7 callout, `tests/fixtures/ofapi/send-message-*.json`, `delete-message-success.json`, `tests/fixtures/webhooks/messages_sent_own_api_send.json`.

**Exit:** spike report appended to this file (latency table, credit burn, coexistence verdict, chosen auth method); CI green; core modules ported with passing tests.

### Phase-0 spike report (2026-06-10)

**Latency spike (read-only, ~203 calls, 18:36–18:50 UTC ≈ 14:36 ET — US afternoon):**

| Endpoint | calls | ok | p50 | p95 | min | max | mean |
|---|---|---|---|---|---|---|---|
| `GET /{acct}/chats?limit=50` | 70 | 67 | 2,234 ms | 7,485 ms | 936 | 15,674 | 3,100 |
| `GET /{acct}/chats/{id}/messages?limit=100` | 70 | 69 | 4,681 ms | 14,881 ms | 913 | 19,820 | 5,414 |
| `GET /{acct}/users/{username}` | 60 | 60 | 1,658 ms | 6,269 ms | 644 | 11,072 | 2,394 |

- **Error rate ≈ 2%** (4×500 across 200 calls) — transient, succeed on retry. Client retries ≤3 on idempotent GETs (SPEC §5).
- **PRD risk #2 trigger hit:** p95 ≫ 2.5 s on every endpoint → cache-first rendering is mandatory, which is already the architecture (SPEC §6.3: everything renders from SQLite; network only reconciles). Consequence applied in sync design: poll-overlap protection (a 20 s cadence with 7.5 s p95 must never stack concurrent polls of one account).
- **Credit burn: 196 credits for 203 calls** — confirms 1 credit/account-call exactly; PRD §10 arithmetic stands.

**Live shape findings (all applied to docs in the same commits):**
- `lastReplyAt`: **absent on every chat** even after ~12 h connected + active traffic (70 samples). v1 ships on the `lastMessage.isSentByMe` fallback; vendor question stays open.
- **No pinned/priority flag source** on chat objects (`countPinnedMessages` counts pinned *messages*; `fan.listsStates` = Tagged/Recent/Muted user-lists). v1 ships without pinned badges; pinned/priority remain API-level filters only.
- **Tip messages carry `tipAmount` (dollars, number) + `tipText` (fan's note, OF HTML)**; the message `text` is platform boilerplate in the fan's UI language. SPEC §8.2 ladder resolved at step ① — transcript renders `[Tip: $X.XX]` + stripped tipText.
- **Media hosts not IP-locked:** `thumbs.onlyfans.com`, `public.onlyfans.com`, and a fresh `cdn2.onlyfans.com` avatar URL all fetch directly (200, image bytes) from a non-proxy IP. `media://` handler fetches the signed URL directly first (0 credits), OFAPI download endpoint only as 403/expiry fallback.
- Live message objects use `isMediaReady` (docs/research said `isReady`) and `cancelSeconds`; field truth now captured in committed fixtures and the codegen types.

**Webhook smoke test (item 4):** registered `wh_3388f54a…` for **all 28 events**, `account_scope: global`, via API, with signing secret, against a cloudflared quick tunnel (token path + HMAC = access protection). Contract live-verified and corrected vs research: **dedupe key is the `x-ofapi-idempotency-key` header** (`evt_<40 hex>`) — the body has NO event-id field; **signature arrives in the `signature` header** (hex HMAC-SHA256 of the raw body). Captured **691 deliveries** over the ~3.5 h window: `messages.received` (48), `messages.sent` (44), `users.typing` (130, ≈3 s cadence confirmed), `users.online` (241) / `users.offline` (214), `subscriptions.new` (2), **and — naturally fired during the window — `messages.ppv.unlocked` (5), `transactions.new` (5), `messages.deleted` (1)**. Every event class the P3 UI depends on is committed live-captured + anonymized in `tests/fixtures/webhooks/`; only `tips.received` and `subscriptions.renewed` remain documented-example fixtures marked `verified:false`. Webhook `wh_3388f54a…` deleted via API at session end (verified: `GET /api/webhooks` → `[]`).
- **Surprise: a second authenticated account (`loravievip`) exists on the team** — events from both accounts flowed in; `account_scope: global` covers the team, and fixtures span both (ids anonymized).

**Coexistence (item 2, read-only half):** across the whole session (18:29 → 21:34 UTC, ~3 h) loravie + loravievip stayed `is_authenticated: true` **while OnlyMonster was actively used in parallel** (44 live `messages.sent` webhook events = chatters replying from OM during our continuous API + webhook + app-polling activity, including the app itself polling both accounts every 20–60 s at session end). Zero `accounts.session_expired` / `accounts.authentication_failed` events in 691 captured deliveries. No read/typing interference observable read-only; the multi-day half continues as owner-ops; the send half stays in item 8.

**Chosen auth method (confirmed):** console-issued API keys + dashboard-connected accounts (automated login). `raw_data` cookie import remains the fallback; v2 Face-Auth accounts would need the Auth+ iPhone app.

**Engineering bootstrap (items 5–7):** pnpm monorepo scaffold (electron-vite, React 19, Tailwind 4, TS strict) with `pnpm check` green; Electron pinned to 41 (42's V8 breaks `better-sqlite3-multiple-ciphers` ≤12.10); OpenAPI→TS codegen committed (51,871 lines of generated types); `packages/shared` built fresh — 8 module clusters, **561 unit tests**, three adversarial verifications clean (prompt byte-fidelity 35 artifacts; legacy test-case coverage 220 cases, none dropped; constants audit 130 values). Model registry refreshed per PRD F6: `anthropic:claude-opus-4-8` added (with sampling-params-removed capability handling); legacy-tuned defaults unchanged.

## Phase 1 — Read-only chat client (~week 1–3)

Build: OFAPI client layer (rate limiter, pagination adapters, credit meter, error mapping, fixture capture) · SQLite layer + migrations · PollingSync with delta rule · accounts rail + chat list (filters, search, badges) · conversation view (history, media via `media://` cache, PPV badges, tips, read-state, scrollback virtualization) · fan context panel (spending, subscription, notes read, lastSeen) · settings shell + keychain · status bar (credits, freshness) · notifications/toasts.

**Exit (PRD P1 gate):** a chatter monitors a real account for a full shift reading only in the app; spot-checks vs OnlyMonster show correct messages, PPV purchase states, spending; credit burn within 2× of §10 estimate.

## Phase 2 — AI core: quick features, companion mode (~week 3–5)

> Decision 2026-06-10: AI ships **before** in-app sending. During this phase the chatter reads in the app and copies AI output into OnlyMonster by hand (matches PRD §5 rollout). Main value (AI assistance, which OF chatters currently have zero of) arrives ~2 weeks earlier, and the correctness-critical send pipeline isn't rushed.

Build: operation coordinator (lifecycle, staged timeouts, operationId discard) over IPC · transcript builder from OF messages (HTML→plain, media labels, **PPV labels from `price`/`isOpened`**) · spending/subscription context builders (legacy text formats) · DirectGateway (Anthropic + OpenRouter SSE, prompt caching, reasoning effort) · AI dock UI (streaming card, **Copy / Copy-part** as primary actions, regenerate, cancel, per-op cost) · draft input field in the AI dock (feeds Improve Draft; becomes the composer in P3) · **Fast Reply** (tones, split mode) · **Improve Draft** · **Help Me** (XML) · personalities CRUD + account mapping gate · per-feature model/reasoning settings · debug prompt inspector · **minimal golden set** for the three quick features (a few recorded transcript fixtures + reviewed reference outputs) before pilot use — the full regression harness still lands in P4.

**Exit (PRD P2 gate):** chatters use the three quick features in real shifts (copy mode); acceptance rate instrumented from day 1, baselined in pilot week 1, week-2 trend stable/improving + chatter sign-off (no legacy baseline exists); prompt inspector confirms context blocks byte-match the legacy shapes on golden fixtures; minimal golden output set reviewed and checked in.

## Parallel track — real-time events via core (runs alongside P1–P3, lands in the core repo)

> Added 2026-06-10: webhook-delivered messages are too important to wait for P6. In companion mode (P1–P2) OnlyMonster still gives the chatter instant awareness, so polling is acceptable; the moment the app becomes the primary surface (P3, sending), seeing a message 20–60 s late kills the product — and webhooks also carry revenue signals polling can't deliver fresh (`messages.ppv.unlocked`, `tips.received`, `users.online/typing`), at ~1/100 of the credit cost. This track has zero dependency on desktop phases: start once Phase-0's webhook spike has captured real payloads; target **live before the P3 gate**.

Work in **core repo**: OFAPI webhook receiver (HMAC verify, `event_id` dedupe, event journal, <1 s ack, pg-boss processing) · SSE event fanout (`GET /api/v1/events/stream`: chatter-key auth, page ACLs, `Last-Event-ID` replay; SSE per core decision #25) · admin flow to register the OFAPI webhook (`account_scope: global`, events per PRD F8).

> **Status 2026-06-11: SHIPPED and live.** Core side landed (`core` commit `de37911`, decision #48; dedupe corrected to the `x-ofapi-idempotency-key` header per live contract). Webhook registered via the admin flow: `wh_62c805b091ae47e69418a8927b16bf64`, `account_scope: global`, 17 events, both accounts auto-mapped to pages (`lora-free`, `lora-vip`). Verified end-to-end same day: events journal in `ofapi_webhook_events` and settle assigns `fanout_seq` (SSE replay ids) — 56 deliveries in the first minute, 22 settled at check time. **Ops caveats:** core currently runs on the owner's laptop behind an ephemeral `trycloudflare` quick tunnel — events are lost while the laptop sleeps or the tunnel is down, and every tunnel restart changes the URL (re-run the idempotent `POST /api/v1/admin/ofapi/webhook` with the new `endpointUrl`). **Before the P3 pilot (chatters relying on SSE), core must move to a stable host/domain.**

> **Related core work (launched 2026-06-11, separate plan):** core is independently building OnlyFans features for its own dashboard — `core: docs/ofapi-integration-plan.md` (DM projection from the same webhook journal, budgeted REST backfill, account-health/credit alerting). It pins our contract (no changes to receiver semantics / `fanout_seq` / SSE) and stays read-only toward OnlyFans (no send path). Two touchpoints for us: **(a) shared credit pool** — its bootstrap (~450–700 cr/page once) + steady ~50–150 cr/day draw from the same team credits as desktop polling; its Phase 3 adds the floor/alerts; **(b)** its OFAPI REST client + credit telemetry become the base for the **gateway proxy (runbook prompt №4)** — the key-custody gate required before scaling beyond the supervised pilot (OFAPI keys cannot be scoped; SPEC §5).

Work in **this repo** (during P3): HubSync provider (SSE client; polling demoted to fallback) · presence/typing UI from `users.*` events.

**Exit:** incoming message → UI ≤2 s p95 via core SSE; polling demoted to fallback; per-shift credit burn drops ≥3× vs polling mode (read-state sweeps remain in both modes per SPEC §6.1, capping the theoretical gap).

## Phase 3 — Sending (~week 5–7 — two weeks: the outbox/verifier state machine and the SSE client are the two most correctness-critical pieces in the app)

Build: composer (absorbs the P2 draft field; drafts per chat, formatting subset, emoji) · outbox state machine + send verifier (SPEC §7 — the no-idempotency design, including restart reconciliation) · optimistic UI states (sending/sent/seen/failed/unconfirmed) · restricted-words UX (`textHighLight`) · typing indicator · mark-as-read auto-on-open + settings toggle (decided; Phase-0 test still validates OnlyMonster interplay) · AI dock switches Copy → **Insert / Insert-part** · multi-part send sequences from `[NEXT]` parts · reply-to, like, unsend-with-countdown, custom-name write (**P3-stretch** — may slip into the P4 window without blocking the gate). Human-written fan notes are cut from v1 (PRD F5).

**Exit (PRD P3 gate):** full text shift in-app; ≥500 real sends with zero lost/duplicated messages (outbox journal audited); error paths demonstrated (restricted words, network drop mid-send, app restart with in-flight send); AI Insert replaces copy in real use. **External dependency:** the real-time gate inside PRD P3 requires the parallel core track (work in the core repo) — if it slips, P3 ships on tightened polling and the "primary surface" declaration waits for SSE.

## Phase 4 — AI deep features & quality harness (~week 6–8)

Build: **Fan Summary** (deep fetch w/ progress, SQLite cache + legacy staleness rules, refresh) · **Chat Review** · **Ping** (segment analysis port, active-block) · **Hi Greeting** (3 variants, ≤10-msg gate) · **Compare** (if time allows — lowest priority) · **Agency Hub (core) integration** — port the legacy agency-hub client against core's live endpoints: profile prefetch/push (`GET/PUT /api/v1/pages/{label}/fans/{fanId}/profile`), AI-usage batches (`POST /api/v1/ai-usage/batch`), chatter API key + core URL in settings, account→page-label mapping (all three endpoints exist; **confirmed prerequisite, 2026-06-10**: core's profile PUT 404s on fans its sync hasn't seen — `resolvePageFan` → `findFanOnPage` → `NotFoundError` at `core: apps/runtime/src/services/fan-profiles.ts:88` — so the pre-P4 core mini-session must patch it to auto-create the fan + page membership on `PUT profile` for `platform=onlyfans`; the same mini-session should switch ai-usage batch validation to per-event skip — one bad `completedAt` currently 400s the whole batch (`core: services/ai-usage.ts:20–33`); also confirm all target OF pages are onboarded as core pages) · **prompt regression harness**: golden transcript fixtures → outputs reviewed against the AI-slop taxonomy; only then iterate prompt content (legacy lesson: examples beat rules; banned-word lists don't work).

**Exit (PRD P4 gate):** behavior parity sign-off vs legacy on side-by-side outputs; summary cache invalidation tests green; ping segmentation ms-exact tests green; a summary generated in the app shows up in core's dashboard (FanProfilePage) and prefetches for another chatter.

## Phase 5 — Vault & PPV sending (~week 8–10)

Build: vault browser (grid, albums, search, multi-select) · attach + price ($3–200) + previews (⊆ mediaFiles validation) + locked text · upload from disk with size/credit preflight (vault-first for reusability; `ofapi_media_` ids are single-use) · PPV compose summary confirmation · processing-media states (`isReady` polling) · chat media gallery tab.

**Exit (PRD P5 gate):** end-to-end PPV send (vault media + previews + price) verified on OnlyFans; mispricing guard demonstrated; purchased state appears on the sent message after a test unlock.

## Phase 6 — AI gateway & central LLM governance (~week 10–13)

> **Resolved 2026-06-10:** no separate relay — the existing Agency Hub ("core", `~/code/core`, production Fastify + Postgres + worker) is the hub; core knows nothing about onlyfansapi.com today, so all OFAPI-facing pieces are new work in the core repo. Real-time (webhooks + SSE) was pulled forward into the parallel track above; P6 is the remaining centralization: core's own Phase 7 "ChatMuse Backend" / "Hub-Owned AI Gateway".

Work in **core repo**: AI gateway (SSE streaming proxy, central provider keys, per-chatter quotas, cost ledger, prompt cache) · (stretch) OFAPI key custody/proxying.

Work in **this repo**: HubGateway (AI via core's gateway) · settings: gateway mode replaces local LLM keys.

**Exit (PRD P6 gate):** per-chatter LLM limits enforced by core's gateway; desktop runs without local LLM provider keys in gateway mode; kill-switch (revoke chatter API key in core's admin UI) demonstrated.

## Phase 7 — Scale & leverage (backlog, prioritize after P6)

- **Ping queue:** fan list ranked by `lastReplyAt` (OFAPI hybrid enrichment) → guided reactivation workflow (legacy "Follower Queue" idea, finally feasible).
- **Greet queue:** `subscriptions.new` events → new-subscriber greeting workflow with Hi Greeting prefill.
- Scheduled sends (mass-messaging single-fan trick) · saved replies/snippets · Windows packaging, code signing, auto-update channel · multi-chatter presence ("who's working this account") · feeding OFAPI webhook data into core's OnlyFans analytics (today OnlyMonster-only, transactions-only) · AI-extracted persistent fan facts accumulating in core automatically (replaces human notes — the transcript's original "AI заметки" idea) · Fansly provider exploration (shared `packages/shared` was built for it).

## Standing risks while executing

| Risk | Standing mitigation |
|---|---|
| OFAPI latency/outage degrades shifts | Cache-first rendering; status surface; OnlyMonster fallback protocol (one surface per account per shift) |
| Credit burn surprises | Credit meter from day 1; budget guard; weekly burn review during pilot |
| Prompt quality regression while porting | No prompt-content edits until P4 harness exists; port verbatim first |
| Double-send incidents | Outbox audits in P3 exit; verifier never auto-retries |
| Scope creep toward agency dashboard | PRD non-goals; core stores chat-product data (summaries/usage) and keeps analytics dashboards as its own scope |

## Open questions for the owner

1. **LLM provider API key (needed for P2 live evidence):** no `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` found in this repo's `.env`. The P2 gate evidence ("AI features producing output", golden reference outputs) needs at least one. Add `ANTHROPIC_API_KEY=` (preferred — prompt caching + adaptive thinking) and/or `OPENROUTER_API_KEY=` to `.env`; the app itself stores keys in the OS keychain via settings, `.env` is only for dev/golden-set tooling.

## Immediate next actions (updated 2026-06-11)

0. **Sync bug (found 2026-06-11, live): OnlyFans ignores the chats `limit` and dictates page size itself** (>10 → server-chosen size, not the requested value: measured 10/page on `order=recent`, 16/page on `order=old`, stable over repeats; `limit`≤10 honored; `_pagination.notice` confirms the override). `apps/desktop/src/main/sync/polling-sync.ts:170` fetches one `limit:50` page and ignores `nextPageUrl`, and `paginateNextPageUrl` is never used for chats — so the delta detector sees only the 10 most-recent chats and the inbox never loads a full chat list. **Desktop fix:** paginate the first N pages for the detector and/or add an initial full chat-list sync; update SPEC §6 (already annotated). **Core impact (record for the core session):** `core: docs/ofapi-integration-plan.md` Phase 2 bootstrap assumes `limit 100` chat pages (~2 pages/credit estimate) — with the cap it is ~10× more pages; its credit budget and pacing need revisiting.

1. ~~Phase-0 items 1–7~~ **Done 2026-06-11** (spike report above; scaffold/codegen/shared/P1/P2 code built — see git log). Item 8 (owner-manual send checklist) **WAIVED 2026-06-11** — no longer gates P3; the send-contract validation moves into P3's opening step (see item 8 and SESSIONS №3).
2. ~~LLM key + live AI output + golden reference outputs~~ **Done 2026-06-11**: key added (app Settings keychain + dev `.env`); owner confirmed live generation in the app; 7 golden reference outputs generated through the production pipeline and committed (`tests/fixtures/golden/*/reference-*.md`, regenerate with `GOLDEN_GEN=1 npx vitest run tests/golden-gen` in apps/desktop). The help-me reference demonstrably reads PPV purchase states + tip amounts from the context blocks. **Owner reviewed the golden reference outputs and confirmed them good (2026-06-11)** — first human half of the P2 gate met. Remaining: pilot week-1 acceptance baseline accumulates in `usage_events` during real shifts.
3. ~~Core repo session (#2 in SESSIONS.md)~~ **Done 2026-06-11** (`core` commit `de37911`): all four additions shipped (profile auto-create, per-event ai-usage skip, webhook receiver, SSE fanout) and the webhook is registered and live (see the parallel-track status above). **Runbook №3 preconditions: (b) pre-P4 core patch deployed — ✅ done 2026-06-11** (running in the local-prod core); **(a) owner-manual send checklist (Phase 0 item 8) — WAIVED 2026-06-11**, validation folded into P3's opening step. **№3 has no remaining blockers** — it can start; its first task is live send-contract validation on a test fan.
4. Admin: ~~scoped keys~~ **resolved 2026-06-11 — OFAPI has no key scopes** (every key is full-access). Instead: issue one *named* key per pilot chatter machine (instant individual revocation; SPEC §5 custody), file a vendor feature request for scoped keys, and treat P6 gateway custody as **required before scaling beyond the supervised pilot**. Credit-terms question stays low priority.
5. Product: confirm the remaining open question PRD §11 #7 (one-surface-per-account-per-shift transition protocol) with the pilot chatters.
6. P1/P2 pilot (owner-ops): chatter monitors a shift in the app (read-only), spot-checks vs OnlyMonster; P2 acceptance-rate metrics are instrumented from day 1 (`cmd:ai.feedback` → usage_events).
7. Cosmetic follow-ups noted during live runs: free-subscription far-future expiry renders as "renews 3462d" in the header chip; status-bar RPM mixes plan-remaining with the client's configured limit ("4996/300").
