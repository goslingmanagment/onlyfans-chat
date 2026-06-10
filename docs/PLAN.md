# ChatGoose Desktop — Implementation Plan

Status: Draft v1 — 2026-06-10. Phases gate on the acceptance criteria in [PRD.md](PRD.md) §12. Each phase ends with a working, demoable increment; AI features arrive as early as possible (they are the product's soul — the chat client is the vehicle).

## Phase 0 — Validation spikes & bootstrap (~week 0–1)

**Goal: kill the riskiest unknowns with real accounts before writing product code.**

> **Status 2026-06-10:** OFAPI dev/test API key obtained and saved in `.env` (`ONLYFANSAPI_API_KEY`, gitignored); key verified via `/api/whoami` (team `goslingmanagment`). A **real, authenticated** account is already connected: `loravie` ("LoraVie FREE", `acct_fbaf2216a7c84147a599f349e0a6fb87`) — so all **automated** spikes must be read-only (no sends, no state mutations); send testing is done manually by the owner only (item 8). Observed on the key (2026-06-10): **credit balance 99,255; 5,000 RPM** (Pro-tier) — plenty for all spikes and early phases, vendor credits question now low-priority. Webhook CRUD verified working via API (`GET /api/webhooks` → `[]`; events catalog returns all 28 events). Webhook registration: do NOT configure manually in the dashboard — the Phase-0 spike registers a temporary tunnel webhook via API (with a signing secret), captures fixtures, then deletes it.

Ops/validation (needs admin + the connected account):
1. ~~Buy OFAPI plan / connect account~~ **Done 2026-06-10** (dev key in `.env`, 99k credits, 5,000 RPM; `loravie` connected via dashboard login). Remaining from this item: confirm credit allocation terms with the vendor (low priority) and verify what scope granularity the console offers for per-phase chatter keys (SPEC §5 matrix).
2. **Coexistence observation (PRD risk #1) — read-only half:** account stays active in OnlyMonster while the OFAPI session exists, for several days. Verify: no logouts / 2FA churn; observe read/typing behavior. The send half moves to the pre-P3 send-spike (item 8).
3. **Latency spike (PRD risk #2) — read-only:** scripted p50/p95 for list-chats, list-messages(100), user-details over ~200 calls at realistic hours; record credit burn vs estimates (PRD §10). Also check: is `lastReplyAt` actually present on chats yet (live check 2026-06-10: absent on the freshly connected account — PRD F2 fallback decision depends on this); are avatar/thumb hosts (`thumbs.onlyfans.com`, `public.onlyfans.com`) fetchable directly or IP-locked like `cdn*.onlyfans.com` (decides `media://` proxy scope); does the chat object expose any pinned/priority flag (PRD F2 badges).
4. **Webhook smoke test:** temporary endpoint via `cloudflared`/`ngrok` tunnel; subscribe to **every event** from `GET /api/webhooks/events` (28 events; cost is 1 credit/100 events); capture real payloads into `tests/fixtures/webhooks/` for everything that fires during the window — at minimum `messages.received/sent` and `users.typing/online/offline`, which the P3 UI depends on. Events that don't fire naturally in the window (`subscriptions.*`, `messages.ppv.unlocked`, `transactions.new`) fall back to documented example payloads, marked unverified. Also fetch one historical **tip message** via list-messages on a chat known to contain tips and record its exact JSON (does it carry an amount field?) — resolves the transcript tip-label ladder (SPEC §8.2). **PII handling is mandatory:** the tunnel must be access-protected (e.g. `cloudflared` access / token-gated endpoint); raw captures live under `tmp/` (gitignored) only; fixtures are anonymized before commit (replace names/usernames/texts/ids, preserve structure exactly). Same rule for latency-spike logs.

Engineering bootstrap:
5. pnpm monorepo scaffold (electron-vite app boots, blank window, CI `pnpm check` green).
6. OpenAPI → TS codegen script wired to vendored `openapi.json`.
7. Port `packages/shared` skeleton from legacy: errors, split, xml, reply-output, prompt-injection, model registry + their tests (pure-TS modules port nearly verbatim — fastest possible win, locks the safety net in place).
8. **Pre-P3 send validation — owner-manual (decided 2026-06-10: no automated send scripts; the owner personally performs a handful of test sends on `loravie`).** Checklist to cover by hand, ideally while the item-4 webhook listener is running so responses/events get captured: sends appear correctly in OnlyMonster (send half of the coexistence test); does the `messages.sent` webhook fire for our own API sends (the §7.5 send-verifier leans on it); one deliberate send with a restricted word to capture the 400 + `textHighLight` shape; informal latency feel (no p50/p95 needed). **P3 does not start until this checklist is done** — Phase 0 items 1–7 are read-only and runnable now.

**Exit:** spike report appended to this file (latency table, credit burn, coexistence verdict, chosen auth method); CI green; core modules ported with passing tests.

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

Work in **this repo** (during P3): HubSync provider (SSE client; polling demoted to fallback) · presence/typing UI from `users.*` events.

**Exit:** incoming message → UI ≤2 s p95 via core SSE; polling demoted to fallback; per-shift credit burn drops ≥3× vs polling mode (read-state sweeps remain in both modes per SPEC §6.1, capping the theoretical gap).

## Phase 3 — Sending (~week 5–7 — two weeks: the outbox/verifier state machine and the SSE client are the two most correctness-critical pieces in the app)

Build: composer (absorbs the P2 draft field; drafts per chat, formatting subset, emoji) · outbox state machine + send verifier (SPEC §7 — the no-idempotency design, including restart reconciliation) · optimistic UI states (sending/sent/seen/failed/unconfirmed) · restricted-words UX (`textHighLight`) · typing indicator · mark-as-read auto-on-open + settings toggle (decided; Phase-0 test still validates OnlyMonster interplay) · AI dock switches Copy → **Insert / Insert-part** · multi-part send sequences from `[NEXT]` parts · reply-to, like, unsend-with-countdown, custom-name write (**P3-stretch** — may slip into the P4 window without blocking the gate). Fan notes are core-backed and land in P4 (PRD F5 — team uses OnlyMonster notes, whose API exposes none).

**Exit (PRD P3 gate):** full text shift in-app; ≥500 real sends with zero lost/duplicated messages (outbox journal audited); error paths demonstrated (restricted words, network drop mid-send, app restart with in-flight send); AI Insert replaces copy in real use. **External dependency:** the real-time gate inside PRD P3 requires the parallel core track (work in the core repo) — if it slips, P3 ships on tightened polling and the "primary surface" declaration waits for SSE.

## Phase 4 — AI deep features & quality harness (~week 6–8)

Build: **Fan Summary** (deep fetch w/ progress, SQLite cache + legacy staleness rules, refresh) · **Chat Review** · **Ping** (segment analysis port, active-block) · **Hi Greeting** (3 variants, ≤10-msg gate) · **Compare** (if time allows — lowest priority) · **Agency Hub (core) integration** — port the legacy agency-hub client against core's live endpoints: profile prefetch/push (`GET/PUT /api/v1/pages/{label}/fans/{fanId}/profile`), AI-usage batches (`POST /api/v1/ai-usage/batch`), chatter API key + core URL in settings, in-app fan notes via core (`POST /api/v1/pages/{label}/fans/{id}/notes` — live today), account→page-label mapping (all three endpoints exist; **confirmed prerequisite, 2026-06-10**: core's profile PUT 404s on fans its sync hasn't seen — `resolvePageFan` → `findFanOnPage` → `NotFoundError` at `core: apps/runtime/src/services/fan-profiles.ts:88` — so the pre-P4 core mini-session must patch it to auto-create the fan + page membership on `PUT profile` for `platform=onlyfans`; the same mini-session should switch ai-usage batch validation to per-event skip — one bad `completedAt` currently 400s the whole batch (`core: services/ai-usage.ts:20–33`); also confirm all target OF pages are onboarded as core pages) · **prompt regression harness**: golden transcript fixtures → outputs reviewed against the AI-slop taxonomy; only then iterate prompt content (legacy lesson: examples beat rules; banned-word lists don't work).

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
- Scheduled sends (mass-messaging single-fan trick) · saved replies/snippets · Windows packaging, code signing, auto-update channel · multi-chatter presence ("who's working this account") · feeding OFAPI webhook data into core's OnlyFans analytics (today OnlyMonster-only, transactions-only) · Fansly provider exploration (shared `packages/shared` was built for it).

## Standing risks while executing

| Risk | Standing mitigation |
|---|---|
| OFAPI latency/outage degrades shifts | Cache-first rendering; status surface; OnlyMonster fallback protocol (one surface per account per shift) |
| Credit burn surprises | Credit meter from day 1; budget guard; weekly burn review during pilot |
| Prompt quality regression while porting | No prompt-content edits until P4 harness exists; port verbatim first |
| Double-send incidents | Outbox audits in P3 exit; verifier never auto-retries |
| Scope creep toward agency dashboard | PRD non-goals; core stores chat-product data (summaries/usage) and keeps analytics dashboards as its own scope |

## Immediate next actions (updated 2026-06-10)

1. Engineering session (this repo): Phase-0 items 5–7 — scaffold, OpenAPI codegen, port `packages/shared` from legacy with tests. No external dependencies.
2. Engineering session (this repo): Phase-0 items 2–4 with the connected `loravie` account — OnlyMonster coexistence observation, read-only latency spike, webhook fixture capture via tunnel (all 28 events, read-only otherwise).
3. Admin: verify OFAPI console scope granularity and cut per-phase scoped chatter keys (SPEC §5); ask vendor about credit allocation terms (low priority).
4. Product: confirm the remaining open question PRD §11 #7 (one-surface-per-account-per-shift transition protocol) with the pilot chatters.
