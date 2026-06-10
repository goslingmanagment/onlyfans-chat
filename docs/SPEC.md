# ChatGoose Desktop — Technical Specification

Status: Draft v1 — 2026-06-10. Companion to [PRD.md](PRD.md) (what/why) and [PLAN.md](PLAN.md) (when). Normative references: [research/legacy-chatgoose.md](research/legacy-chatgoose.md) (ported behavior, exact constants), [research/onlyfansapi.md](research/onlyfansapi.md) (API capabilities), `docs/vendor/onlyfansapi/openapi.json` (field-level API truth).

## 1. Architecture overview

```
PHASES 1–5 (direct mode)                      PHASE 6+ (hub mode)
┌─────────────────────────────┐               ┌─────────────────────────────┐
│  Desktop app (Electron)     │               │  Desktop app                │
│ ┌─────────┐   ┌───────────┐ │               │  (no OFAPI/LLM keys)        │
│ │Renderer │◄─►│   Main    │ │   REST        └───────┬─────────▲───────────┘
│ │React UI │IPC│ ofapi cli ├─┼──────► OFAPI          │REST+WS  │push
│ │         │   │ llm cli   ├─┼──────► Anthropic/     ▼         │
│ │         │   │ sqlite    │ │  SSE   OpenRouter  ┌────────────┴──────────┐
│ └─────────┘   └───────────┘ │               │  Hub relay (Node)          │
└─────────────────────────────┘               │  ofapi key custody          │
        ▲ polling (list-delta)                │  webhook receiver (HMAC)    │
        └─────────────────────                │  WS fanout, event journal   │
                                              │  summaries/notes/usage DB   │
                                              │  LLM proxy + chatter limits │
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
| UI | **React 18 + TypeScript (strict) + Tailwind CSS** | Custom design system from scratch per PRD §7; Tailwind keeps it consistent without a heavy component dep. Virtualized lists via `@tanstack/react-virtual` (chat list + message history are the two perf-critical lists). |
| State | **Zustand** (UI state) + **TanStack Query** (server-state cache over IPC) | Small API surface, easy for agents to keep correct; Query gives staleness/refetch semantics that match the sync model. |
| Local DB | **better-sqlite3** (main process only) + WAL | Message/fan cache, summaries, outbox, settings. Synchronous API is fine in main; no ORM — typed query modules. |
| OFAPI types | **openapi-typescript** codegen from `docs/vendor/onlyfansapi/openapi.json` | Generated types + thin hand-written client (§5); regen script in repo. |
| LLM | Hand-rolled SSE clients ported from legacy (`anthropic-client`, `openrouter-client`) | Proven, dependency-free, supports adaptive thinking + prompt caching exactly as tuned. |
| Validation | **zod** at all trust boundaries (IPC, OFAPI responses, webhook payloads, storage migration) | Legacy lesson 1.4.1: type guards at boundaries, not `as` casts. |
| Tests | **Vitest** (unit), **Playwright** (e2e, later) | Port legacy test patterns (research doc §12). |
| Monorepo | **pnpm workspaces** | `apps/desktop`, `apps/hub` (P6), `packages/core` shared. |
| Hub (P6) | **Node 22 + Fastify + better-sqlite3→Postgres-ready**, Docker deploy | Smallest thing that can verify HMAC, journal events, fan out WS, serve REST. |

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
  hub/                   # P6: Fastify service (webhooks, ws, profiles, usage, llm proxy)
packages/
  core/                  # platform-agnostic, ported from legacy + OF adaptations:
    prompts/             # *.md templates (OF wording) + builder + caching blocks
    transcript/          # OF message → transcript lines, PPV labels, ping segments
    context/             # spending/subscription block formatters
    llm/                 # model registry, capabilities, cost, SSE parsing
    output/              # [NEXT]/[VARIANT] split, XML extract, reply sanitizer
    protocol/            # operation lifecycle types + zod schemas (IPC & hub-WS reuse)
    errors/              # CG-* error registry
docs/                    # PRD, SPEC, PLAN, research/, vendor/
scripts/                 # codegen (openapi → types), fixture capture
```

`packages/core` must stay free of Electron/Node-API imports (pure TS + fetch/Web streams) so hub and desktop share it and unit tests run anywhere. This mirrors the legacy `src/shared/` discipline that made 783 tests cheap.

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
- **Generated types** from vendored `openapi.json`; hand-written `OfApiClient` exposes typed methods per subsystem (chats, messages, fans, users, transactions, vault, accounts, webhooks). Response envelope `{data, _meta, _pagination}` unwrapped here; `_meta._credits.balance` and `x-rate-limit-remaining-minute` published to a `CreditMeter` (status bar + persisted daily counters).
- **Rate limiting:** client-side token bucket well under plan RPM (config; default 300 RPM, burst 20), per-account concurrency cap 4, global 12. 429 → honor `retry-after`, exponential backoff 1/2/4/8 s. 5xx → retry ≤3 (idempotent GETs only). **POST send-message is never auto-retried** (§7).
- **Pagination adapters** (four upstream styles — research doc §6): `nextPageUrl`, `limitOffset`, `marker`, `firstLastId`. One `paginate()` helper per style; callers request "N items" or "until predicate" with a hard page cap + inter-page delay (legacy: 300 ms between pages, deep fetch caps).
- **Error mapping** into the `CG-*` registry (§11): 401→`OFAPI-AUTH`, 404 acct-prefix hint, 422 validation detail, 400 restricted-words (carry `textHighLight`), session-expired detection from account state.
- **Fixture capture mode:** debug flag records sanitized request/response pairs into `tests/fixtures/ofapi/` for contract tests (no sandbox upstream — recorded fixtures are our regression net).

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
- **Chat-list poll** is the primary detector: `GET /{account}/chats?limit=50&order=recent` (1 credit) every **20 s** for the focused account, **60 s** for other handled accounts, **paused when window hidden >2 min** (resume burst on focus).
- **Delta rule:** message fetches happen only when the list shows change (`lastMessage.id` / `unreadMessagesCount` / `lastReadMessageId` differ from cache) → fetch just that chat's new tail (`first_id` pagination from last cached id). The open conversation additionally refreshes every **10 s** (read-state `isNew` flips ride on this).
- Fan-detail and transactions fetched on conversation open (and cached with TTL 5 min, matching legacy in-memory caches) — not in the poll loop.
- Budget guard: per-shift credit budget setting; on 80% an unobtrusive warning, on 100% polling slows 4× (never silently stops).

### 6.2 HubSync (P6)
- WebSocket to hub (`wss://hub/ws?token=…`), zod-validated `SyncEvent` frames (same union — renderer code unchanged). Heartbeat 30 s; on disconnect, exponential reconnect + a reconciliation sweep (one chat-list fetch per account) to close the gap; PollingSync (slowed) is the degraded fallback.
- Read-state remains on-demand polling of the open conversation (no upstream webhook exists).

### 6.3 Cache reconciliation rules
- Messages are upserted by `(account, chat_id, message_id)`; webhook/push payloads are trusted for inserts but a periodic tail check heals divergence (edits via `changedAt`, deletions via `messages.deleted` or tail-fetch diff → tombstone, render "deleted").
- Media with `isReady:false`/null URLs → poll single-message endpoint every 15 s (cap 10 min) until ready.
- Everything renders from SQLite; network only mutates SQLite; UI subscribes to DB-change events (single source of truth, instant reopen).

## 7. Send pipeline (correctness-critical: no upstream idempotency)

1. Compose → `outbox` row `{local_id: uuid, account, chat_id, payload, state: 'sending', created_at}` persisted **before** the POST; optimistic bubble keyed by `local_id`.
2. Single-flight per chat (queue further sends behind the in-flight one).
3. POST succeeds → row `state:'sent'`, store returned `message_id`, reconcile bubble.
4. POST fails **with definite non-delivery** (network refused before request wrote, 4xx validation, restricted words) → `state:'failed'`, inline retry/edit UI. Restricted words: show `textHighLight` terms, keep text in composer.
5. POST **indeterminate** (timeout, 5xx, connection dropped mid-flight) → `state:'unconfirmed'`. **Never auto-retry.** Background verifier fetches the chat tail and matches by text+timestamp window (and later `messages.sent` events) → promotes to `sent` or offers manual retry with a diff view.
6. App restart with `sending/unconfirmed` rows → same verifier path before any UI offers resend.
7. Multi-part (`[NEXT]`) sequences: each part is its own outbox row; sequence aborts on first failure; inter-part delay 2–5 s randomized; cancel between parts.
8. Typing indicator: while composer has activity, call typing endpoint every 3 s (free); stop on idle 4 s.
9. Mark-as-read: on conversation open + window focused, debounced 1.5 s; settings toggle, default ON (decided 2026-06-10).

## 8. AI layer (port of legacy, adapted to OFAPI data)

### 8.1 What ports verbatim (from `packages/core`)
Prompt templates (all 7 + compare), safety preambles (reply/analysis modes), prompt-cache block segmentation (1h system/personality, 5m transcript, uncached task), `escapeForPrompt` (& < > ordering), reply sanitizer (think-blocks, meta-leak lines, prefixes, quotes, bracket garbage), `[NEXT]`/`[VARIANT]` splitting, XML extraction (helpMe, chatReview), tone instructions, ping segment instructions, model registry/capabilities/cost modules, staged timeout values, temperatures and max_tokens per feature, summary cache validity rules. Constants table in research doc §1/§4/§5 is normative. Fansly wording in templates → OnlyFans.

### 8.2 Context builder mapping (legacy → OFAPI)

| Context input | Legacy (Fansly) source | New (OFAPI) source |
|---|---|---|
| Transcript messages | `/api/v1/message` pages | `GET /{account}/chats/{chat_id}/messages` (`limit` 100/page, `first_id` pagination, ascending sort by `createdAt`, dedupe by id) |
| Sender label | senderId vs modelAccountId | `isSentByMe` → `Model:` else `Fan:` |
| Message text | plain `content` | `text` is OF HTML → strip to plain text (entity decode, `<br>`→newline, drop styling spans) before `[HH:MM] Sender: …` formatting |
| Media labels | attachment contentType map | `media[]`/`mediaCount` types → `[Photo]`, `[Video]`, `[Audio]`, `[Media Bundle: …]`; GIFs via `giphyId` → `[GIF]` |
| **PPV state** | orderhistory verification pipeline (10-item cap, 3s timeouts, `unknown` fallback) | **Directly on message:** `price>0` ⇒ PPV; sent + `isOpened===true` ⇒ `purchased`; sent + `isOpened===false` ⇒ `not purchased`. `unknown` label retained in format but should be rare. `messages.ppv.unlocked` event (P6) updates live |
| Tips | `totalTipAmount` mills | `isTip` messages → `[Tip: $X.XX]` (amount per openapi field; verify exact name at impl) |
| Fan display name | group users + DOM fallback | chat `fan.name` / custom name |
| Spending block | wallets/earnings stats + monthly breakdowns | `subscribedOnData` `*Summ` totals (totalSumm, subscribesSumm, tipsSumm, messagesSumm, postsSumm, streamsSumm); monthly breakdown from `GET /{account}/transactions` filtered by fan id, `marker`-paginated, page cap 5, on-demand + 5 min cache. Keep legacy text block format |
| Subscription block | messaging groups / subscribers walk | `subscribedOnData`: subscribeAt, expiredAt, renewedAt, duration, discountPercent, hasActivePaidSubscriptions, unsubscribeReason; renew-off ⇒ "churn risk" line. Keep legacy text block format |
| Fan bio (hi-greeting) | DOM/account API | `GET /{account}/users/{username}` `about` |
| Ping segment | analyzePingSegment on transcript | identical algorithm; fan text messages = `!isSentByMe && text non-empty`; thresholds 5 days / 3 messages unchanged |

**Invariant:** block text formats stay byte-compatible with legacy where data allows — the prompts were tuned against those exact shapes.

### 8.3 Operation coordinator
Ports legacy lifecycle: one operation per conversation context (`CG-FLOW-04` on concurrent start), synchronous reservation, `operationId` UUID correlation, discard on conversation switch, staged timeouts (`quick-total` 60 s; deep: prep 180 s, TTFB 45 s, idle 45 s, max-stream 300 s), auto-retry on LLM 429 (`Retry-After` ≤60 s) and 503 (+5 s), profiling stages in debug mode. Transport changes from extension Port to IPC events — protocol types live in `packages/core/protocol`.

### 8.4 Feature policies
Same registry pattern (`features.ts`): surface (`ai-dock` inline vs panel-tab read-only), result kind (reply parts / single reply / XML doc), context recipe (message counts: quick 100 / improve 25 / deep 1500 / hi-greeting 25 cap 10-msg-convo / ping 100), includesEarnings flags, min-messages gate (deep ≥30 → `CG-FLOW-03`), model-selection delegation (improve+hi → fast-reply's model).

### 8.5 Summary cache
SQLite `summaries` table replacing browser.storage: key `(account, fan_id)`, fields per legacy entry (`body, model_id, personality_id, personality_updated_at, generated_at, spending_verified, subscription_verified, hub_sync_state`). Same staleness rules; refresh = delete + regenerate. Hub prefetch (5 s timeout) before generation and fire-and-forget push (10 s timeout) after — ported Agency Hub client, pointed at hub (P6); disabled when hub unconfigured.

### 8.6 AiGateway seam
```ts
interface AiGateway { stream(req: LlmRequest, cb: StreamCallbacks): CancelFn }
```
`DirectGateway` (P3): provider SSE clients with local keys. `HubGateway` (P6): same contract over hub (`POST /ai/stream` SSE or WS); hub holds provider keys, enforces per-chatter token limits, records usage events (legacy batching: 1 s debounce, 100/batch, retry 5 s/15 s, drop after 3).

## 9. Hub relay service (P6) — `apps/hub`

- **Inbound:** `POST /webhooks/ofapi` — verify `HMAC-SHA256(rawBody, signing_secret)`, dedupe by `event_id` (unique index), journal to `events` table, fan out. Respond 200 < 1 s (process async) to stay under OFAPI's 15 s timeout / 5-retry policy.
- **WS fanout:** `/ws` with per-chatter token auth; subscription = the chatter's permitted `account_ids`. Frames = `SyncEvent` union from `packages/core`. Missed-event replay: client sends last `event_id` seen → journal replay (journal retention 7 days).
- **REST:** `GET/PUT /profiles/{account}/{fan_id}` (summaries; ports legacy Agency Hub shape: 50 KB cap), `POST /ai-usage/batch`, `GET /accounts` (proxied, ACL-filtered), `POST /ai/stream` (LLM proxy with limits), `POST /admin/webhook-setup` (registers OFAPI webhook: events list per PRD F8, `account_scope: global`).
- **Auth:** per-chatter bearer tokens (admin-issued, revocable), account ACL per token. Admin role for keys/limits.
- **Storage:** SQLite (WAL) first; schema kept Postgres-compatible. Docker single-container deploy + volume; config via env (`OFAPI_KEY`, `WEBHOOK_SECRET`, `ANTHROPIC_KEY`, `OPENROUTER_KEY`).
- Desktop in hub mode stores only the hub URL + chatter token.

## 10. Data layer (SQLite, desktop)

Tables (all with `account_id` scoping; ids TEXT):
- `accounts(id, username, display_name, auth_state, raw JSON, updated_at)`
- `chats(account_id, chat_id, fan_name, unread_count, has_unread_tips, last_message_at, last_message_preview, last_read_message_id, pinned, raw JSON, updated_at)` — index `(account_id, last_message_at DESC)`
- `messages(account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain, price, is_opened, is_new, is_tip, media JSON, deleted, raw JSON)` — PK `(account_id, chat_id, message_id)`, index `(account_id, chat_id, created_at DESC)`
- `fans(account_id, fan_id, username, name, custom_name, last_seen, spending JSON, subscription JSON, notes_cached, fetched_at)`
- `summaries(…)` per §8.5; `outbox(…)` per §7; `media_cache(url_hash, path, bytes, fetched_at)` (LRU, cap 2 GB)
- `settings(key, value JSON)` with `schema_version` + sequential migrations (legacy pattern); `usage_events` (pending hub flush); `credit_log(day, used)`
- Retention: messages pruned per chat beyond 5,000 (configurable); summaries/outbox kept.

## 11. Error taxonomy

Extend legacy `CG-*` registry (every error: code, user-facing message, recovery action; raw detail in debug):
- Ported: `CG-AUTH-01` (LLM key missing), `CG-FLOW-01..09` (no personality / unmapped / min-messages / busy / ping-active / compare-min / hi-locked), `CG-API-06` (unusable output), `CG-NET-02` (timeout).
- New: `CG-OF-01` OFAPI key invalid · `CG-OF-02` account session expired (re-auth CTA) · `CG-OF-03` rate-limited (auto-backoff notice) · `CG-OF-04` credits exhausted · `CG-OF-05` restricted words (`textHighLight`) · `CG-OF-06` send unconfirmed (verifier UI) · `CG-OF-07` unsend window passed · `CG-OF-08` media processing/unavailable · `CG-HUB-01..` hub auth/connection.

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

- **Unit (Vitest), bulk of coverage** — `packages/core` pure functions: transcript/PPV labeling, ping segmentation (ms-exact), spending/subscription formatting, splitters, XML, sanitizer (Gemini leak regressions), prompt block caching structure, cost calc, error mapping, migrations. Port legacy test suites as the spec-by-example.
- **Contract tests** — OfApiClient against recorded fixtures (capture mode §5): pagination styles, envelope parsing, error mapping, restricted-words shape.
- **Integration** — sync delta logic, outbox/send-verifier state machine (timeout/5xx/restart paths), summary cache staleness — against in-memory SQLite + mocked client.
- **E2E (Playwright, from P2)** — happy-path shift flows against a stub OFAPI server (recorded fixtures); golden-screenshot the three-zone layout.
- **Prompt regression harness (P4)** — golden transcripts → generated outputs diffed/reviewed vs legacy outputs; AI-slop taxonomy checklist (legacy TODO) as review rubric.
- CI: `pnpm check` = typecheck + lint + unit + build (mirrors legacy `npm run check` gate).

## 15. Key invariants (enforced in review)

1. Renderer never touches network or secrets; all OFAPI/LLM traffic in main (or hub).
2. `packages/core` stays platform-pure (no Electron/Node imports).
3. Every IPC/webhook/storage boundary validates with zod — no `as` casts across trust boundaries.
4. All fan-derived text passes `escapeForPrompt` before prompt inclusion; safety preamble on every LLM call; sanitizer on every insertable output.
5. Send-message is never auto-retried on indeterminate failure (§7.5).
6. Context block text formats stay legacy-compatible (§8.2) unless the prompt regression harness approves a change.
7. Credits: every OFAPI call goes through the metered client; no ad-hoc fetches.
8. AI never sends without explicit human action (PRD non-goal #1).
