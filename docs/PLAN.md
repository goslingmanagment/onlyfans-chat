# ChatGoose Desktop — Implementation Plan

Status: Draft v1 — 2026-06-10. Phases gate on the acceptance criteria in [PRD.md](PRD.md) §12. Each phase ends with a working, demoable increment; AI features arrive as early as possible (they are the product's soul — the chat client is the vehicle).

## Phase 0 — Validation spikes & bootstrap (~week 0–1)

**Goal: kill the riskiest unknowns with real accounts before writing product code.**

> **Status 2026-06-10:** OFAPI dev/test API key obtained and saved in `.env` (`ONLYFANSAPI_API_KEY`, gitignored); key verified via `/api/whoami` (team `goslingmanagment`). A **real, authenticated** account is already connected: `loravie` ("LoraVie FREE", `acct_fbaf2216a7c84147a599f349e0a6fb87`) — so all spikes must be read-only (no sends, no state mutations beyond what a test explicitly requires). Plan/credit-allocation confirmation with the vendor still pending. Webhook registration: do NOT configure manually in the dashboard — the Phase-0 spike registers a temporary tunnel webhook via API (with a signing secret), captures fixtures, then deletes it.

Ops/validation (needs admin + the connected account):
1. Buy OFAPI plan (start Basic $69 for the spike; confirm credit allocations with vendor — docs/pricing discrepancy, PRD risk #5). Connect the test account (note which auth method worked; check for v2 Face-Auth).
2. **Coexistence test (PRD risk #1):** account active in OnlyMonster + OFAPI simultaneously for several days. Verify: no logouts; sends from API appear correctly in OM; read/typing race behavior; document the mark-as-read policy decision.
3. **Latency spike (PRD risk #2):** scripted p50/p95 for list-chats, list-messages(100), send-message, user-details over ~200 calls at realistic hours. Record credit burn vs estimates (PRD §10).
4. **Webhook smoke test:** temporary endpoint via `cloudflared`/`ngrok` tunnel; subscribe `messages.*`, `tips.received`, `accounts.*`; capture real payloads into `tests/fixtures/webhooks/` (these become the P6 contract fixtures and validate the rich-payload assumption).

Engineering bootstrap:
5. pnpm monorepo scaffold (electron-vite app boots, blank window, CI `pnpm check` green).
6. OpenAPI → TS codegen script wired to vendored `openapi.json`.
7. Port `packages/shared` skeleton from legacy: errors, split, xml, reply-output, prompt-injection, model registry + their tests (pure-TS modules port nearly verbatim — fastest possible win, locks the safety net in place).

**Exit:** spike report appended to this file (latency table, credit burn, coexistence verdict, chosen auth method); CI green; core modules ported with passing tests.

## Phase 1 — Read-only chat client (~week 1–3)

Build: OFAPI client layer (rate limiter, pagination adapters, credit meter, error mapping, fixture capture) · SQLite layer + migrations · PollingSync with delta rule · accounts rail + chat list (filters, search, badges) · conversation view (history, media via `media://` cache, PPV badges, tips, read-state, scrollback virtualization) · fan context panel (spending, subscription, notes read, lastSeen) · settings shell + keychain · status bar (credits, freshness) · notifications/toasts.

**Exit (PRD P1 gate):** a chatter monitors a real account for a full shift reading only in the app; spot-checks vs OnlyMonster show correct messages, PPV purchase states, spending; credit burn within 2× of §10 estimate.

## Phase 2 — AI core: quick features, companion mode (~week 3–5)

> Decision 2026-06-10: AI ships **before** in-app sending. During this phase the chatter reads in the app and copies AI output into OnlyMonster by hand (matches PRD §5 rollout). Main value (AI assistance, which OF chatters currently have zero of) arrives ~2 weeks earlier, and the correctness-critical send pipeline isn't rushed.

Build: operation coordinator (lifecycle, staged timeouts, operationId discard) over IPC · transcript builder from OF messages (HTML→plain, media labels, **PPV labels from `price`/`isOpened`**) · spending/subscription context builders (legacy text formats) · DirectGateway (Anthropic + OpenRouter SSE, prompt caching, reasoning effort) · AI dock UI (streaming card, **Copy / Copy-part** as primary actions, regenerate, cancel, per-op cost) · draft input field in the AI dock (feeds Improve Draft; becomes the composer in P3) · **Fast Reply** (tones, split mode) · **Improve Draft** · **Help Me** (XML) · personalities CRUD + account mapping gate · per-feature model/reasoning settings · debug prompt inspector.

**Exit (PRD P2 gate):** chatters use the three quick features in real shifts (copy mode); acceptance rate measured and ≥ Fansly baseline; prompt inspector confirms context blocks byte-match the legacy shapes on golden fixtures.

## Parallel track — real-time events via core (runs alongside P1–P3, lands in the core repo)

> Added 2026-06-10: webhook-delivered messages are too important to wait for P6. In companion mode (P1–P2) OnlyMonster still gives the chatter instant awareness, so polling is acceptable; the moment the app becomes the primary surface (P3, sending), seeing a message 20–60 s late kills the product — and webhooks also carry revenue signals polling can't deliver fresh (`messages.ppv.unlocked`, `tips.received`, `users.online/typing`), at ~1/100 of the credit cost. This track has zero dependency on desktop phases: start once Phase-0's webhook spike has captured real payloads; target **live before the P3 gate**.

Work in **core repo**: OFAPI webhook receiver (HMAC verify, `event_id` dedupe, event journal, <1 s ack, pg-boss processing) · SSE event fanout (`GET /api/v1/events/stream`: chatter-key auth, page ACLs, `Last-Event-ID` replay; SSE per core decision #25) · admin flow to register the OFAPI webhook (`account_scope: global`, events per PRD F8).

Work in **this repo** (during P3): HubSync provider (SSE client; polling demoted to fallback) · presence/typing UI from `users.*` events.

**Exit:** incoming message → UI ≤2 s p95 via core SSE; polling demoted to fallback; per-shift credit burn drops ≥5× vs pure polling.

## Phase 3 — Sending (~week 5–6)

Build: composer (absorbs the P2 draft field; drafts per chat, formatting subset, emoji) · outbox state machine + send verifier (SPEC §7 — the no-idempotency design, including restart reconciliation) · optimistic UI states (sending/sent/seen/failed/unconfirmed) · restricted-words UX (`textHighLight`) · typing indicator · mark-as-read auto-on-open + settings toggle (decided; Phase-0 test still validates OnlyMonster interplay) · reply-to, like, unsend-with-countdown · notes write, custom-name write · AI dock switches Copy → **Insert / Insert-part** · multi-part send sequences from `[NEXT]` parts.

**Exit (PRD P3 gate):** full text shift in-app; ≥500 real sends with zero lost/duplicated messages (outbox journal audited); error paths demonstrated (restricted words, network drop mid-send, app restart with in-flight send); AI Insert replaces copy in real use.

## Phase 4 — AI deep features & quality harness (~week 6–8)

Build: **Fan Summary** (deep fetch w/ progress, SQLite cache + legacy staleness rules, refresh) · **Chat Review** · **Ping** (segment analysis port, active-block) · **Hi Greeting** (3 variants, ≤10-msg gate) · **Compare** (if time allows — lowest priority) · **Agency Hub (core) integration** — port the legacy agency-hub client against core's live endpoints: profile prefetch/push (`GET/PUT /api/v1/pages/{label}/fans/{fanId}/profile`), AI-usage batches (`POST /api/v1/ai-usage/batch`), chatter API key + core URL in settings, account→page-label mapping (no core-side work expected — all three endpoints exist; **verify early**: does core's profile PUT auto-create fan rows for fans its OnlyFans sync hasn't seen (non-spenders)? If not, a small core patch is needed; also confirm all target OF pages are onboarded as core pages) · **prompt regression harness**: golden transcript fixtures → outputs reviewed against the AI-slop taxonomy; only then iterate prompt content (legacy lesson: examples beat rules; banned-word lists don't work).

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

## Immediate next actions

1. Admin: purchase OFAPI plan, connect throwaway account, create scoped key → run Phase-0 items 1–4 (engineering pairs on scripts).
2. Engineering: Phase-0 items 5–7 (scaffold, codegen, core port) — can start immediately, no external dependencies.
3. Product: confirm open questions PRD §11 #6–9 with the pilot chatters (UI language, read-marking policy, transition protocol).
