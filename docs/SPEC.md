# ChatGoose Desktop — Technical Specification

Status: Draft v1 — 2026-06-10. Companion to [PRD.md](PRD.md) (what/why) and [PLAN.md](PLAN.md) (when). Normative references: [research/legacy-chatgoose.md](research/legacy-chatgoose.md) (ported behavior, exact constants), [research/onlyfansapi.md](research/onlyfansapi.md) (API capabilities), `docs/vendor/onlyfansapi/openapi.json` (field-level API truth).

## 1. Architecture overview

```
DIRECT MODE (P1+, polling)                    HUB MODE (real-time from ~P3, AI gateway P6)
┌─────────────────────────────┐               ┌─────────────────────────────┐
│  Desktop app (Electron)     │               │  Desktop app                │
│ ┌─────────┐   ┌───────────┐ │               │  (scoped OFAPI key or none) │
│ │Renderer │◄─►│   Main    │ │   REST        └───────┬─────────▲───────────┘
│ │React UI │IPC│ ofapi cli ├─┼──────► OFAPI          │REST     │SSE push
│ │         │   │ llm cli   ├─┼──────► Anthropic/     ▼         │
│ │         │   │ sqlite    │ │  SSE   OpenRouter  ┌────────────┴──────────┐
│ └─────────┘   └───────────┘ │               │  Agency Hub "core"          │
└─────────────────────────────┘               │  (EXISTING: ~/code/core,    │
        ▲ polling (list-delta)                │  Fastify+Postgres+worker)   │
        └─────────────────────                │  has: fan profiles, ai-usage│
   From P4 (still direct mode):               │  chatter API keys, dashboard│
   summaries + ai-usage sync → core           │  adds: webhooks+SSE (→P3),  │
                                              │  AI gateway (P6)            │
                                              └──────┬──────────▲───────────┘
                                                     │ REST     │ webhooks
                                                     ▼          │
                                                   OFAPI ───────┘
```

The desktop app is built **hub-ready from day 1** via two seams:
- `SyncProvider` interface (poll-driven vs push-driven event stream — §6)
- `AiGateway` interface (direct provider calls vs hub-proxied — §8.6)

## 2. Stack & rationale

| Layer | Choice | Rationale |
|---|---|---|
| Shell | **Electron** (latest LTS) + electron-vite + electron-builder | Single-language TS across main/renderer/hub/shared maximizes AI-dev velocity and reuse of the legacy TS codebase (prompts, parsers, LLM streaming). Tauri (Rust core) was considered and rejected: second toolchain, fewer training-data patterns, no payoff for an internal tool where bundle size is irrelevant. |
| UI | **React 18 + TypeScript (strict) + Tailwind CSS** | Custom design system from scratch per PRD §7 + `docs/DESIGN.md` (layout, hotkeys, perf checklist — review-blocking); Tailwind keeps it consistent without a heavy component dep. Virtualized lists via `@tanstack/react-virtual` (chat list + message history are the two perf-critical lists). |
| State | **Zustand** (UI state) + **TanStack Query** (server-state cache over IPC) | Small API surface, easy for agents to keep correct; Query gives staleness/refetch semantics that match the sync model. |
| Local DB | **better-sqlite3** (main process only) + WAL | Message/fan cache, summaries, outbox, settings. Synchronous API is fine in main; no ORM — typed query modules. |
| OFAPI types | **openapi-typescript** codegen from `docs/vendor/onlyfansapi/openapi.json` | Generated types + thin hand-written client (§5); regen script in repo. |
| LLM | Hand-rolled SSE clients ported from legacy (`anthropic-client`, `openrouter-client`) | Proven, dependency-free, supports adaptive thinking + prompt caching exactly as tuned. |
| Validation | **zod** at all trust boundaries (IPC, OFAPI responses, webhook payloads, storage migration) | Legacy lesson 1.4.1: type guards at boundaries, not `as` casts. |
| Tests | **Vitest** (unit), **Playwright** (e2e, later) | Port legacy test patterns (research doc §12). |
| Monorepo | **pnpm workspaces** | `apps/desktop`, `packages/shared`. No `apps/hub` — server-side hub work lands in the core repo. |
| Hub (P6) | **Extend the existing Agency Hub "core"** (`~/code/core`: Fastify 5 + Postgres 16 + Drizzle + pg-boss + React dashboard, Docker on VPS) | Decided 2026-06-10: no separate relay. Core already serves the ChatGoose/"ChatMuse" API (fan profiles, ai-usage, per-chatter keys); webhooks + SSE fanout land there via the parallel track (target P3), the AI gateway in P6 (§9). |

## 3. Repository layout (target)

```
apps/
  desktop/
    src/main/            # Electron main: composition root, IPC handlers
      ofapi/             # client, rate limiter, pagination adapters, credit meter
      sync/              # SyncProvider impls: PollingSync, HubSync (P6)
      ai/                # operation coordinator, llm clients, AiGateway
      db/                # sqlite schema, migrations, query modules
      secrets/           # keychain (safeStorage) access
    src/renderer/        # React app
      app/               # shell, routing, layout zones
      features/          # inbox, conversation, composer, fan-panel, ai-dock, settings, vault (P5)
      design/            # design system primitives (tokens, components)
    src/preload/         # contextBridge — typed IPC surface only
packages/
  shared/                # platform-agnostic, ported from legacy + OF adaptations:
    prompts/             # *.md templates (OF wording) + builder + caching blocks
    transcript/          # OF message → transcript lines, PPV labels, ping segments
    context/             # spending/subscription block formatters
    llm/                 # model registry, capabilities, cost, SSE parsing
    output/              # [NEXT]/[VARIANT] split, XML extract, reply sanitizer
    protocol/            # operation lifecycle types + zod schemas (IPC & hub-SSE reuse)
    errors/              # CG-* error registry
docs/                    # PRD, SPEC, PLAN, research/, vendor/
scripts/                 # codegen (openapi → types), fixture capture
```

`packages/shared` must stay free of Electron/Node-API imports (pure TS + fetch/Web streams) so unit tests run anywhere and modules remain reusable outside Electron (e.g. by core's future AI gateway). This mirrors the legacy `src/shared/` discipline that made 783 tests cheap. (Named `shared`, not `core`, to avoid collision with the Agency Hub "core" repo.) Network-capable modules inside `shared` (the LLM SSE clients, the ported agency-hub client) are **instantiated only in the main process** (or hub contexts); the renderer may import types and pure functions only — enforced with a lint rule (`no-restricted-imports` per entry point), upholding invariant §15.1.

## 4. Process & security model (Electron)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for renderer. Single `BrowserWindow`; no remote content — all UI is local. CSP blocks remote scripts; OF media loads through a dedicated `media://` protocol handler proxied by main (which fetches via OFAPI download endpoint and caches on disk — renderer never holds OF CDN URLs, which expire in ~1 min anyway).
- **All secrets and all network I/O live in main.** Renderer talks only typed IPC. OFAPI key + LLM keys encrypted via `safeStorage` (Keychain/DPAPI), held decrypted in main memory only.
- IPC surface (preload-exposed, all zod-validated request/response):
  - `query:*` — read paths backed by SQLite + fetch-through (accounts, chats, messages, fan, vault)
  - `cmd:*` — sends, mark-read, notes, settings mutations
  - `ai:*` — `start/cancel` + event stream `chunk/progress/complete/error/discarded` (ports the legacy port-protocol; `operationId` correlation, stale-chunk discard)
  - `sync:*` — status, force-refresh, event subscription (new message, chat updated, credit balance)
- Renderer never receives: API keys, raw OFAPI errors with headers, file-system paths outside app data.
- Logging: ported legacy redaction (keys, auth headers → `[REDACTED]`); debug mode gates verbose logs + prompt inspector.

## 5. OFAPI client layer (`apps/desktop/src/main/ofapi`)

- **Base:** `https://app.onlyfansapi.com/api`, `Authorization: Bearer <key>`. Account ids `acct_*`; fan/chat/message ids are raw OF numeric ids (`chat_id === fan.id`). Never concatenate paths by hand outside this module.
- **Generated types** from vendored `openapi.json`; hand-written `OfApiClient` exposes typed methods per subsystem (chats, messages, fans, users, transactions, vault, accounts, webhooks). **The `{data, _meta, _pagination}` envelope is NOT universal** (verified live 2026-06-10: `GET /api/accounts` returns a bare top-level array, `GET /api/whoami` a bare object, while account-scoped endpoints return the envelope) — unwrapping is per-operation, driven by the OpenAPI schema. Credits/rate-limit meta (`_meta._credits.balance`, `x-rate-limit-remaining-minute`, `x-ofapi-credits-*` headers) is published to a `CreditMeter` (status bar + persisted daily counters) whenever present.
- **Rate limiting:** client-side token bucket well under plan RPM (config; default 300 RPM, burst 20), per-account concurrency cap 4, global 12. 429 → honor `retry-after`, exponential backoff 1/2/4/8 s. 5xx → retry ≤3 (idempotent GETs only). **POST send-message is never auto-retried** (§7).
- **Pagination adapters** (four upstream styles — research doc §6): `nextPageUrl`, `limitOffset`, `marker`, `firstLastId`. One `paginate()` helper per style; callers request "N items" or "until predicate" with a hard page cap + inter-page delay (legacy: 300 ms between pages, deep fetch caps). Always pass `skip_users` explicitly — live default behavior differs from the documented default.
- **Error mapping** into the `CG-*` registry (§11): 401→`OFAPI-AUTH`, 404 acct-prefix hint, 422 validation detail, 400 restricted-words (carry `textHighLight`), session-expired detection from account state.
- **Fixture capture mode:** debug flag records sanitized request/response pairs into `tests/fixtures/ofapi/` for contract tests (no sandbox upstream — recorded fixtures are our regression net).
- **Key scoping per phase** (configured in the OFAPI console; exact scope granularity to verify in Phase 0): P1–P2 chatter keys = read-only (chats/messages/fans/users/transactions GET); P3 adds send-message, mark-read, typing, notes/custom-name writes; P5 adds media upload + vault; webhook CRUD and account connect/disconnect stay on the admin/core key only. Never put the unscoped master key on a chatter machine.

## 6. Sync engine

```ts
interface SyncProvider {
  start(accounts: AccountId[]): void
  stop(): void
  events: Emitter<SyncEvent> // chatListUpdated | messageReceived | messageSent |
                             // ppvUnlocked | tipReceived | presence | typing |
                             // accountAuthChanged | readStateChanged
  refreshChat(account: AccountId, chatId: ChatId): Promise<void> // on-demand
}
```

### 6.1 PollingSync (P1) — designed as a cost feature
- **Chat-list poll** is the primary detector: `GET /{account}/chats?limit=50&order=recent` (1 credit) every **20 s** for the focused account, **60 s** for other handled accounts. When the window is hidden, polling **slows ×4 but keeps running** — in the P1–P2 companion phase the app lives in the background and toasts/sounds must still fire (PRD F2); a full pause happens only when notifications are disabled or after explicit long idle. Resume burst on focus.
- **Delta rule:** message fetches happen only when the list shows change (`lastMessage.id` / `unreadMessagesCount` / `lastReadMessageId` differ from cache) → fetch just that chat's new tail: **`last_id=<last cached id>&order=asc`** (verified live 2026-06-10: `last_id+asc` returns the boundary id and newer messages in ascending order; `first_id` pages *backwards* into history and must only be used for scrollback — and boundary inclusion differs between the two, so always dedupe by id). The open conversation is refreshed on its list-delta and immediately after each own send; on top of that, a **conditional read-state sweep** catches `isNew` flips for seen-ticks: every 30 s (configurable), only while the window is focused **and** there are own messages with `isNew=true` younger than 24 h, auto-stopping after 10 min without change. No flat fast poll of the open conversation — list-delta stays the primary trigger.
- Fan-detail and transactions fetched on conversation open (and cached with TTL 5 min, matching legacy in-memory caches) — not in the poll loop.
- Budget guard: per-shift credit budget setting; on 80% an unobtrusive warning, on 100% polling slows 4× (never silently stops).

### 6.2 HubSync (parallel core track — target P3)
- SSE stream from core (`GET /api/v1/events/stream`, bearer chatter API key; SSE per core decision #25 — no websockets there), zod-validated `SyncEvent` frames (same union — renderer code unchanged). `Last-Event-ID` resume against core's event journal; on disconnect, exponential reconnect + a reconciliation sweep (one chat-list fetch per account) to close the gap; PollingSync (slowed) is the degraded fallback.
- Read-state remains polling of the open conversation (no upstream webhook exists), under the **same conditional sweep policy as §6.1** — left unconditional it would dominate hub-mode credit burn and erase most of the webhook savings.

### 6.3 Cache reconciliation rules
- Messages are upserted by `(account, chat_id, message_id)`; webhook/push payloads are trusted for inserts but a periodic tail check heals divergence (edits via `changedAt`, deletions via `messages.deleted` or tail-fetch diff → tombstone, render "deleted").
- Media with `isReady:false`/null URLs → poll single-message endpoint every 15 s (cap 10 min) until ready.
- Everything renders from SQLite; network only mutates SQLite; UI subscribes to DB-change events (single source of truth, instant reopen).

## 7. Send pipeline (correctness-critical: no upstream idempotency)

0. Composer is enabled only when the chat's `canSendMessage` is true; otherwise it is disabled with the platform-provided reason shown, and AI **Insert** degrades to **Copy**.
1. Compose → `outbox` row `{local_id: uuid, account, chat_id, payload, state: 'sending', created_at}` persisted **before** the POST; optimistic bubble keyed by `local_id`.
2. Single-flight per chat (queue further sends behind the in-flight one).
3. POST succeeds → row `state:'sent'`, store returned `message_id`, reconcile bubble.
4. POST fails **with definite non-delivery** → `state:'failed'`, inline retry/edit UI. Definite means strictly: the error occurred before any request bytes were sent (DNS resolution failure, connect refused/unreachable, TLS handshake error) **or** the server returned a definitive 4xx application response (validation; restricted words → show `textHighLight` terms, keep text in composer). When in doubt, it is NOT definite.
5. Everything else is **indeterminate** (timeout, connection reset after the request started, any 5xx including gateway errors) → `state:'unconfirmed'`. **Never auto-retry.** Background verifier fetches the chat tail and matches by text+timestamp window (and later `messages.sent` events) → promotes to `sent` or offers manual retry with a diff view.
6. App restart with `sending/unconfirmed` rows → same verifier path before any UI offers resend.
7. Multi-part (`[NEXT]`) sequences: each part is its own outbox row; sequence aborts on first failure; inter-part delay 2–5 s randomized; cancel between parts.
8. Typing indicator: while composer has activity, call typing endpoint every 3 s (free); stop on idle 4 s.
9. Mark-as-read: on conversation open + window focused, debounced 1.5 s; settings toggle, default ON (decided 2026-06-10).

## 8. AI layer (port of legacy, adapted to OFAPI data)

### 8.1 What ports verbatim (into `packages/shared`)
Prompt templates (all 7 + compare), safety preambles (reply/analysis modes), prompt-cache block segmentation (1h system/personality, 5m transcript, uncached task), `escapeForPrompt` (& < > ordering), reply sanitizer (think-blocks, meta-leak lines, prefixes, quotes, bracket garbage), `[NEXT]`/`[VARIANT]` splitting, XML extraction (helpMe, chatReview), tone instructions, ping segment instructions, model registry/capabilities/cost modules, staged timeout values, temperatures and max_tokens per feature, summary cache validity rules. Constants table in research doc §1/§4/§5 is normative. Fansly wording in templates → OnlyFans.

### 8.2 Context builder mapping (legacy → OFAPI)

| Context input | Legacy (Fansly) source | New (OFAPI) source |
|---|---|---|
| Transcript messages | `/api/v1/message` pages | `GET /{account}/chats/{chat_id}/messages` (`limit` 100/page, `first_id` pagination, ascending sort by `createdAt`, dedupe by id) |
| Sender label | senderId vs modelAccountId | `isSentByMe` → `Model:` else `Fan:` |
| Message text | plain `content` | `text` is OF HTML → strip to plain text (entity decode, `<br>`→newline, drop styling spans) before `[HH:MM] Sender: …` formatting |
| Media labels | attachment contentType map | `media[]`/`mediaCount` types → `[Photo]`, `[Video]`, `[Audio]`, `[Media Bundle: …]`; GIFs via `giphyId` → `[GIF]` |
| **PPV state** | orderhistory verification pipeline (10-item cap, 3s timeouts, `unknown` fallback) | **Directly on message:** `price>0` ⇒ PPV; sent + `isOpened===true` ⇒ `purchased`; sent + `isOpened===false` ⇒ `not purchased`. `unknown` label retained in format but should be rare. `messages.ppv.unlocked` event (P6) updates live |
| Tips | `totalTipAmount` mills | `isTip` messages → `[Tip: $X.XX]`. Amount-source ladder (resolve with a real tip-message fixture in Phase 0 — the OpenAPI list-messages example shows no amount field next to `isTip`): ① amount field on the message if it exists → ② join `/transactions` (`type=tips`, `tipsSource=chat`) by fan + timestamp → ③ render `[Tip]` without amount (degraded, never fabricate). Live `tips.received` webhooks carry `amountGross/Net` and enrich tips going forward |
| Fan display name | group users + DOM fallback | chat `fan.name` / custom name |
| Spending block | wallets/earnings stats + monthly breakdowns | `subscribedOnData` `*Summ` totals (totalSumm, subscribesSumm, tipsSumm, messagesSumm, postsSumm, streamsSumm); monthly breakdown from `GET /{account}/transactions` filtered by fan id, `marker`-paginated, page cap 5, on-demand + 5 min cache. Keep legacy text block format |
| Subscription block | messaging groups / subscribers walk | `subscribedOnData`: subscribeAt, expiredAt, renewedAt, duration, discountPercent, hasActivePaidSubscriptions, unsubscribeReason; renew-off ⇒ "churn risk" line. Keep legacy text block format |
| Fan bio (hi-greeting) | DOM/account API | `GET /{account}/users/{username}` `about` |
| Ping segment | analyzePingSegment on transcript | identical algorithm; fan text messages = `!isSentByMe && text non-empty`; thresholds 5 days / 3 messages unchanged |

**Invariant:** block text formats stay byte-compatible with legacy where data allows — the prompts were tuned against those exact shapes.

**Transcript timezone (decided 2026-06-10):** `[HH:MM]` timestamps are rendered in **UTC for everyone**. Legacy used the machine-local timezone — unacceptable now that summaries and caches are shared across chatters in different timezones: byte-stable context blocks (and cache keys derived from them) require a single timezone.

### 8.3 Operation coordinator
Ports legacy lifecycle: one operation per conversation context (`CG-FLOW-04` on concurrent start), synchronous reservation, `operationId` UUID correlation, discard on conversation switch, staged timeouts (`quick-total` 60 s; deep: prep 180 s, TTFB 45 s, idle 45 s, max-stream 300 s), auto-retry on LLM 429 (`Retry-After` ≤60 s) and 503 (+5 s), profiling stages in debug mode. Transport changes from extension Port to IPC events — protocol types live in `packages/shared/protocol`.

### 8.4 Feature policies
Same registry pattern (`features.ts`): surface (`ai-dock` inline vs panel-tab read-only), result kind (reply parts / single reply / XML doc), context recipe (message counts: quick 100 / improve 25 / deep 1500 / hi-greeting 25 cap 10-msg-convo / ping 100), includesEarnings flags, min-messages gate (deep ≥30 → `CG-FLOW-03`), model-selection delegation (improve+hi → fast-reply's model).

### 8.5 Summary cache
SQLite `summaries` table replacing browser.storage: key `(account, fan_id)`, fields per legacy entry (`body, model_id, personality_id, personality_updated_at, generated_at, spending_verified, subscription_verified, hub_sync_state`). Same staleness rules; refresh = delete + regenerate. Hub prefetch (5 s timeout) before generation and fire-and-forget push (10 s timeout) after — ported Agency Hub client pointed at core, **live from P4**: `GET/PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` (both already exist in core; profile versions are append-only, 50 KB cap; **404 on fans unknown to core until the pre-P4 core patch lands — see §9.1 caveat and PLAN P4**). Disabled when core is unconfigured. OFAPI account → core page-label mapping: match `platform === 'onlyfans'` + normalized username (legacy rule: lowercase, strip `@`), with manual override in settings.

### 8.6 AiGateway seam
```ts
interface AiGateway { stream(req: LlmRequest, cb: StreamCallbacks): CancelFn }
```
`DirectGateway` (P2): provider SSE clients with local keys. `HubGateway` (P6): same contract over core's hub-owned AI gateway (its roadmap Phase 7; SSE streaming per core decision #25) — core holds provider keys, enforces per-chatter token limits, records usage. Until the gateway exists, the desktop reports usage itself to core's live `POST /api/v1/ai-usage/batch` (legacy batching: 1 s debounce, 100/batch, retry 5 s/15 s, drop after 3 attempts; upstream dedupes by `clientEventId`). Feature names must match core's **closed** `aiUsageFeatures` enum (`core: packages/shared/src/types.ts`) — adding a feature requires a core-side enum change first; note Compare has no name there (an unexplained `scan` exists instead) — before P4, either add `compare` to core's enum or decide to report per-card as `fast-reply`. **Clock-skew guard:** `completedAt` is clamped to server time (offset derived from the `Date` header of core responses) — core rejects events >5 min in the future and one bad event **fails the whole batch** with 400 (`core: services/ai-usage.ts:20–33`, verified), and the ported reporter would silently drop the batch after 3 retries; therefore on HTTP 400 the reporter must not blind-retry — log, surface `CG-HUB-02`, and quarantine the offending events. (Core-side per-event skip is queued as a pre-P4 core task.) The same server-time offset drives the 24 h unsend countdown (§7) instead of trusting the local clock.

## 9. Agency Hub ("core") integration

The hub is the **existing** Agency Hub project (`~/code/core` — Fastify 5 + Postgres 16/Drizzle + pg-boss worker + React dashboard, deployed via Docker behind TLS). It already implements the legacy ChatGoose ("ChatMuse") server contract. Decided 2026-06-10: all server-side hub work happens **in the core repo**; this repo only consumes its REST/SSE contract. Core's OpenAPI: `GET /api/v1/openapi.json` (owner session) or the snapshot at `core: reference/agency-hub.openapi.json`.

### 9.1 Already live in core — consumed from P4 (direct mode)
| Capability | Endpoint (core) | Auth |
|---|---|---|
| List pages visible to the chatter | `GET /api/v1/pages` | chatter API key (Bearer `agency_hub_core_…`) |
| Read latest fan profile (summary) | `GET /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` | chatter API key |
| Append fan profile version | `PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` `{body ≤50k}` — append-only versions, stamped `source:"chatmuse"` | chatter API key only |
| Report AI usage | `POST /api/v1/ai-usage/batch` `{events[1..100]}` — dedupe by `(userId, clientEventId)` | chatter API key only |
| Fan detail / notes / flags | `GET …/fans/{platformUserId}`, `POST …/notes`, `PATCH /api/v1/fans/{platform}/{platformUserId}/flags` | chatter API key |

Notes that bind us: chatter API keys are **one-active-per-chatter, page-scoped, revocable** (kill-switch exists today, managed in core's Settings → Users). Fan identity in core is `(platform, platform_user_id)` — matches OFAPI's `chat_id === fan.id` directly. The `feature` field of usage events is a **closed enum** in core (`fast-reply | improve-draft | help-me | fan-summary | chat-review | scan | ping | hi-greeting`); core stores tokens, not dollars (cost derived at report time). Core's own OnlyFans data today is OnlyMonster-based and thin (transactions only; DM polling disabled) — none of our flows depend on it. **Caveat (verified in core source 2026-06-10):** the profile GET/PUT routes 404 for fans core's sync has never seen (`resolvePageFan` → `findFanOnPage` → `NotFoundError`, `core: apps/runtime/src/services/fan-profiles.ts:88`) — the pre-P4 core patch (PLAN P4) is a hard prerequisite before relying on them for OnlyFans non-spenders.

### 9.2 New work in core (tracked in core's repo; aligns with its Phase 7 "ChatMuse Backend" + "Hub-Owned AI Gateway" decisions). Timing: webhook receiver + SSE fanout = parallel track targeting desktop P3; AI gateway = P6; custody = stretch
- **OFAPI webhook receiver** — verify `HMAC-SHA256(rawBody, signing_secret)`, dedupe by `event_id` (unique index), journal to an events table, ack 200 < 1 s (async processing via pg-boss) to stay inside OFAPI's 15 s timeout / 5-retry policy. Admin flow to register the webhook at OFAPI (`account_scope: global`, events per PRD F8).
- **SSE event fanout** — `GET /api/v1/events/stream`: chatter-key auth, events filtered to the chatter's assigned pages, `Last-Event-ID` replay from the journal (retention ~7 days). Frames = `SyncEvent` union (schema shared conceptually with `packages/shared/protocol`; core owns its copy in `contracts`).
- **AI gateway** — SSE streaming proxy to Anthropic/OpenRouter with central keys, per-chatter quotas, cost ledger, prompt caching (this is core's planned Phase 7 scope verbatim).
- **(Stretch)** OFAPI key custody + proxying of OF calls, so desktops hold no OFAPI key at all. Until then: per-chatter scoped OFAPI keys.

### 9.3 Desktop side
Settings hold core base URL + chatter API key (keychain). HubSync (§6.2) and HubGateway (§8.6) consume the new endpoints; profile sync and usage reporting (§8.5, §8.6) already point at 9.1 from P4. Mapping OFAPI accounts to core page labels per §8.5.

## 10. Data layer (SQLite, desktop)

Tables (all with `account_id` scoping; ids TEXT):
- `accounts(id, username, display_name, auth_state, raw JSON, updated_at)`
- `chats(account_id, chat_id, fan_name, unread_count, has_unread_tips, last_message_at, last_message_preview, last_read_message_id, pinned, can_send_message, can_not_send_reason, raw JSON, updated_at)` — index `(account_id, last_message_at DESC)`
- `messages(account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain, price, is_opened, is_new, is_tip, media JSON, deleted, raw JSON)` — PK `(account_id, chat_id, message_id)`, index `(account_id, chat_id, created_at DESC)`
- `fans(account_id, fan_id, username, name, custom_name, last_seen, spending JSON, subscription JSON, notes_cached, fetched_at)`
- `summaries(…)` per §8.5; `outbox(…)` per §7; `media_cache(url_hash, path, bytes, fetched_at)` (LRU, cap 2 GB)
- `settings(key, value JSON)` with `schema_version` + sequential migrations (legacy pattern); `usage_events` (pending hub flush); `credit_log(day, used)`
- Retention: messages pruned per chat beyond 5,000 (configurable); summaries/outbox kept.

**Encryption at rest (decided 2026-06-10):** chatter machines hold fan PII and adult-content DM history, and OS full-disk encryption can't be assumed. The SQLite DB uses a SQLCipher-compatible build (e.g. `better-sqlite3-multiple-ciphers`) with a per-install random key held in the OS keychain (`safeStorage`); the media cache stores encrypted blobs, decrypted on the fly by the `media://` protocol handler. Settings include a "Purge local data" action (drops DB + media cache). Idle app-lock is a later-phase option.

## 11. Error taxonomy

Extend legacy `CG-*` registry (every error: code, user-facing message, recovery action; raw detail in debug):
- Ported: `CG-AUTH-01` (LLM key missing), `CG-FLOW-01..09` (no personality / unmapped / min-messages / busy / ping-active / compare-min / hi-locked), `CG-API-06` (unusable output), `CG-NET-02` (timeout).
- New: `CG-OF-01` OFAPI key invalid · `CG-OF-02` account authentication failed (re-auth CTA; a lone `accounts.session_expired` event is informational — OFAPI auto-recovers it) · `CG-OF-03` rate-limited (auto-backoff notice) · `CG-OF-04` credits exhausted · `CG-OF-05` restricted words (`textHighLight`) · `CG-OF-06` send unconfirmed (verifier UI) · `CG-OF-07` unsend window passed · `CG-OF-08` media processing/unavailable · `CG-HUB-01..` hub auth/connection.

## 12. Observability

- Status bar: credit balance/today, LLM per-op cost (ported spend summary), sync freshness, RPM headroom.
- Debug mode: pipeline profiling per operation (ported stage profiler incl. `llm-ttfb`, `llm-stream`), prompt inspector (exact blocks + cache flags), OFAPI request log (sanitized), fixture capture toggle.
- Local rotating file logs (main process, redacted), exportable for bug reports.

## 13. Performance budgets

| Surface | Budget |
|---|---|
| Cold start → interactive inbox (cached) | < 3 s |
| Conversation open (cached) | < 300 ms paint, refresh reconcile < 2 s |
| Account switch | < 500 ms |
| Incoming message → UI (hub mode) | < 2 s p95 |
| AI first token (quick features) | < 3 s p95 (provider-bound; show TTFB) |
| Scroll 10k-message history | 60 fps (virtualized) |
| Memory | < 500 MB with 3 accounts loaded |

## 14. Testing strategy

- **Unit (Vitest), bulk of coverage** — `packages/shared` pure functions: transcript/PPV labeling, ping segmentation (ms-exact), spending/subscription formatting, splitters, XML, sanitizer (Gemini leak regressions), prompt block caching structure, cost calc, error mapping, migrations. Port legacy test suites as the spec-by-example.
- **Contract tests** — OfApiClient against recorded fixtures (capture mode §5): pagination styles, envelope parsing, error mapping, restricted-words shape.
- **Integration** — sync delta logic, outbox/send-verifier state machine (timeout/5xx/restart paths), summary cache staleness — against in-memory SQLite + mocked client.
- **E2E (Playwright, from P2)** — happy-path shift flows against a stub OFAPI server (recorded fixtures); golden-screenshot the three-zone layout.
- **Prompt regression harness (minimal golden set in P2, full harness in P4)** — golden transcripts → generated outputs diffed/reviewed vs legacy outputs; AI-slop taxonomy checklist (legacy TODO) as review rubric. The P2 minimal set (a few reviewed reference outputs for Fast Reply / Improve / Help Me) must exist before pilot use.
- CI: `pnpm check` = typecheck + lint + unit + build (mirrors legacy `npm run check` gate).

## 15. Key invariants (enforced in review)

1. Renderer never touches network or secrets; all OFAPI/LLM traffic in main (or hub).
2. `packages/shared` stays platform-pure (no Electron/Node imports).
3. Every IPC/webhook/storage boundary validates with zod — no `as` casts across trust boundaries.
4. All fan-derived text passes `escapeForPrompt` before prompt inclusion; safety preamble on every LLM call; sanitizer on every insertable output.
5. Send-message is never auto-retried on indeterminate failure (§7.5).
6. Context block text formats stay legacy-compatible (§8.2) unless the prompt regression harness approves a change.
7. Credits: every OFAPI call goes through the metered client; no ad-hoc fetches.
8. AI never sends without explicit human action (PRD non-goal #1).
9. Local DB and media cache are encrypted at rest; the key lives only in the OS keychain (§10).
