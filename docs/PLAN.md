# ChatGoose Desktop — Implementation Plan

Status: Draft v1 — 2026-06-10. Phases gate on the acceptance criteria in [PRD.md](PRD.md) §12. Each phase ends with a working, demoable increment; AI features arrive as early as possible (they are the product's soul — the chat client is the vehicle).

## Phase 0 — Validation spikes & bootstrap (~week 0–1)

**Goal: kill the riskiest unknowns with real accounts before writing product code.**

Ops/validation (needs admin + one throwaway/low-value OF account):
1. Buy OFAPI plan (start Basic $69 for the spike; confirm credit allocations with vendor — docs/pricing discrepancy, PRD risk #5). Connect the test account (note which auth method worked; check for v2 Face-Auth).
2. **Coexistence test (PRD risk #1):** account active in OnlyMonster + OFAPI simultaneously for several days. Verify: no logouts; sends from API appear correctly in OM; read/typing race behavior; document the mark-as-read policy decision.
3. **Latency spike (PRD risk #2):** scripted p50/p95 for list-chats, list-messages(100), send-message, user-details over ~200 calls at realistic hours. Record credit burn vs estimates (PRD §10).
4. **Webhook smoke test:** temporary endpoint via `cloudflared`/`ngrok` tunnel; subscribe `messages.*`, `tips.received`, `accounts.*`; capture real payloads into `tests/fixtures/webhooks/` (these become the P6 contract fixtures and validate the rich-payload assumption).

Engineering bootstrap:
5. pnpm monorepo scaffold (electron-vite app boots, blank window, CI `pnpm check` green).
6. OpenAPI → TS codegen script wired to vendored `openapi.json`.
7. Port `packages/core` skeleton from legacy: errors, split, xml, reply-output, prompt-injection, model registry + their tests (pure-TS modules port nearly verbatim — fastest possible win, locks the safety net in place).

**Exit:** spike report appended to this file (latency table, credit burn, coexistence verdict, chosen auth method); CI green; core modules ported with passing tests.

## Phase 1 — Read-only chat client (~week 1–3)

Build: OFAPI client layer (rate limiter, pagination adapters, credit meter, error mapping, fixture capture) · SQLite layer + migrations · PollingSync with delta rule · accounts rail + chat list (filters, search, badges) · conversation view (history, media via `media://` cache, PPV badges, tips, read-state, scrollback virtualization) · fan context panel (spending, subscription, notes read, lastSeen) · settings shell + keychain · status bar (credits, freshness) · notifications/toasts.

**Exit (PRD P1 gate):** a chatter monitors a real account for a full shift reading only in the app; spot-checks vs OnlyMonster show correct messages, PPV purchase states, spending; credit burn within 2× of §10 estimate.

## Phase 2 — AI core: quick features, companion mode (~week 3–5)

> Decision 2026-06-10: AI ships **before** in-app sending. During this phase the chatter reads in the app and copies AI output into OnlyMonster by hand (matches PRD §5 rollout). Main value (AI assistance, which OF chatters currently have zero of) arrives ~2 weeks earlier, and the correctness-critical send pipeline isn't rushed.

Build: operation coordinator (lifecycle, staged timeouts, operationId discard) over IPC · transcript builder from OF messages (HTML→plain, media labels, **PPV labels from `price`/`isOpened`**) · spending/subscription context builders (legacy text formats) · DirectGateway (Anthropic + OpenRouter SSE, prompt caching, reasoning effort) · AI dock UI (streaming card, **Copy / Copy-part** as primary actions, regenerate, cancel, per-op cost) · draft input field in the AI dock (feeds Improve Draft; becomes the composer in P3) · **Fast Reply** (tones, split mode) · **Improve Draft** · **Help Me** (XML) · personalities CRUD + account mapping gate · per-feature model/reasoning settings · debug prompt inspector.

**Exit (PRD P2 gate):** chatters use the three quick features in real shifts (copy mode); acceptance rate measured and ≥ Fansly baseline; prompt inspector confirms context blocks byte-match the legacy shapes on golden fixtures.

## Phase 3 — Sending (~week 5–6)

Build: composer (absorbs the P2 draft field; drafts per chat, formatting subset, emoji) · outbox state machine + send verifier (SPEC §7 — the no-idempotency design, including restart reconciliation) · optimistic UI states (sending/sent/seen/failed/unconfirmed) · restricted-words UX (`textHighLight`) · typing indicator · mark-as-read auto-on-open + settings toggle (decided; Phase-0 test still validates OnlyMonster interplay) · reply-to, like, unsend-with-countdown · notes write, custom-name write · AI dock switches Copy → **Insert / Insert-part** · multi-part send sequences from `[NEXT]` parts.

**Exit (PRD P3 gate):** full text shift in-app; ≥500 real sends with zero lost/duplicated messages (outbox journal audited); error paths demonstrated (restricted words, network drop mid-send, app restart with in-flight send); AI Insert replaces copy in real use.

## Phase 4 — AI deep features & quality harness (~week 6–8)

Build: **Fan Summary** (deep fetch w/ progress, SQLite cache + legacy staleness rules, refresh) · **Chat Review** · **Ping** (segment analysis port, active-block) · **Hi Greeting** (3 variants, ≤10-msg gate) · **Compare** (if time allows — lowest priority) · **prompt regression harness**: golden transcript fixtures → outputs reviewed against the AI-slop taxonomy; only then iterate prompt content (legacy lesson: examples beat rules; banned-word lists don't work).

**Exit (PRD P4 gate):** behavior parity sign-off vs legacy on side-by-side outputs; summary cache invalidation tests green; ping segmentation ms-exact tests green.

## Phase 5 — Vault & PPV sending (~week 8–10)

Build: vault browser (grid, albums, search, multi-select) · attach + price ($3–200) + previews (⊆ mediaFiles validation) + locked text · upload from disk with size/credit preflight (vault-first for reusability; `ofapi_media_` ids are single-use) · PPV compose summary confirmation · processing-media states (`isReady` polling) · chat media gallery tab.

**Exit (PRD P5 gate):** end-to-end PPV send (vault media + previews + price) verified on OnlyFans; mispricing guard demonstrated; purchased state appears on the sent message after a test unlock.

## Phase 6 — Hub relay & real-time (~week 10–13)

> **Scope/location decision pending (2026-06-10):** build hub here (`apps/hub`) vs as part of the separate agency "core" project — to be discussed before this phase starts. The desktop is hub-ready either way (SyncProvider/AiGateway seams), so this does not block earlier phases.

Build: `apps/hub` (Fastify): webhook receiver (HMAC verify, `event_id` dedupe, journal, <1 s ack) · WS fanout with per-chatter tokens + account ACLs + missed-event replay · HubSync provider in desktop (push events; polling demoted to fallback) · OFAPI key custody moves to hub; desktop keeps only hub token · central summaries/notes prefetch+push (ported Agency Hub client) · AI usage event collection + per-chatter token limits · HubGateway LLM proxy · presence/typing UI from `users.*` events · Docker deploy + runbook.

**Exit (PRD P6 gate):** incoming message → UI ≤2 s p95; desktop binary holds no OFAPI/LLM keys; summary written by chatter A visible to chatter B; per-shift credit burn drops ≥5× vs polling; kill-switch (revoke chatter token) demonstrated.

## Phase 7 — Scale & leverage (backlog, prioritize after P6)

- **Ping queue:** fan list ranked by `lastReplyAt` (OFAPI hybrid enrichment) → guided reactivation workflow (legacy "Follower Queue" idea, finally feasible).
- **Greet queue:** `subscriptions.new` events → new-subscriber greeting workflow with Hi Greeting prefill.
- Scheduled sends (mass-messaging single-fan trick) · saved replies/snippets · Windows packaging, code signing, auto-update channel · multi-chatter presence ("who's working this account") · hub Postgres migration if volume demands · Fansly provider exploration (shared `packages/core` was built for it).

## Standing risks while executing

| Risk | Standing mitigation |
|---|---|
| OFAPI latency/outage degrades shifts | Cache-first rendering; status surface; OnlyMonster fallback protocol (one surface per account per shift) |
| Credit burn surprises | Credit meter from day 1; budget guard; weekly burn review during pilot |
| Prompt quality regression while porting | No prompt-content edits until P4 harness exists; port verbatim first |
| Double-send incidents | Outbox audits in P3 exit; verifier never auto-retries |
| Scope creep toward agency dashboard | PRD non-goals; hub stores only chat-product data (summaries/usage), analytics stays in the separate core project |

## Immediate next actions

1. Admin: purchase OFAPI plan, connect throwaway account, create scoped key → run Phase-0 items 1–4 (engineering pairs on scripts).
2. Engineering: Phase-0 items 5–7 (scaffold, codegen, core port) — can start immediately, no external dependencies.
3. Product: confirm open questions PRD §11 #6–9 with the pilot chatters (UI language, read-marking policy, transition protocol).
