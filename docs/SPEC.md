# ChatGoose Desktop — Technical Specification

Status: Updated 2026-06-11 — implementation built through P5 (the architecture here is realized in `apps/desktop` + `packages/shared`; per-subsystem deviations are noted inline where found live). Companion to [PRD.md](PRD.md) (what/why) and [PLAN.md](PLAN.md) (when). Normative references: [research/legacy-chatgoose.md](research/legacy-chatgoose.md) (ported behavior, exact constants), [research/onlyfansapi.md](research/onlyfansapi.md) (API capabilities), `docs/vendor/onlyfansapi/openapi.json` (field-level API truth).

## 1. Architecture overview

```
DIRECT MODE (P1+, polling)                    HUB MODE (real-time from ~P3, AI gateway P6)
┌─────────────────────────────┐               ┌─────────────────────────────┐
│  Desktop app (Electron)     │               │  Desktop app                │
│ ┌─────────┐   ┌───────────┐ │               │  (per-chatter OFAPI key     │
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
| Shell | **Electron** (latest stable whose V8 the SQLCipher native module compiles against — currently **41**; 42 breaks `better-sqlite3-multiple-ciphers` ≤12.10 on the V8 `ExternalPointerTypeTag` API, re-check on dep updates) + electron-vite + electron-builder | Single-language TS across main/renderer/hub/shared maximizes AI-dev velocity and reuse of the legacy TS codebase (prompts, parsers, LLM streaming). Tauri (Rust core) was considered and rejected: second toolchain, fewer training-data patterns, no payoff for an internal tool where bundle size is irrelevant. |
| UI | **React 19 + TypeScript (strict) + Tailwind CSS 4** (React 18 was written here pre-implementation; 19 is current stable and what the scaffold resolved — no API differences matter for us) | Custom design system from scratch per PRD §7 + `docs/DESIGN.md` (layout, hotkeys, perf checklist — review-blocking); Tailwind keeps it consistent without a heavy component dep. Virtualized lists via `@tanstack/react-virtual` (chat list + message history are the two perf-critical lists). |
| State | **Zustand** (UI state) + **TanStack Query** (server-state cache over IPC) | Small API surface, easy for agents to keep correct; Query gives staleness/refetch semantics that match the sync model. |
| Local DB | **better-sqlite3** (main process only) + WAL | Message/fan cache, summaries, outbox, settings. Synchronous API is fine in main; no ORM — typed query modules. |
| OFAPI types | **openapi-typescript** codegen from `docs/vendor/onlyfansapi/openapi.json` | Generated types + thin hand-written client (§5); regen script in repo. |
| LLM | Hand-rolled SSE clients, written fresh (legacy clients as behavioral reference) | Proven approach: no SDK, dependency-free, supports adaptive thinking + prompt caching exactly as tuned in legacy. |
| Validation | **zod** at all trust boundaries (IPC, OFAPI responses, webhook payloads, storage migration) | Legacy lesson 1.4.1: type guards at boundaries, not `as` casts. |
| Tests | **Vitest** (unit), **Playwright** (e2e, later) | Re-express the legacy test cases as the spec-by-example — fresh test code, same cases (research doc §12). |
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
  shared/                # platform-agnostic; fresh code to the legacy behavioral spec (§8.1):
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

- `contextIsolation: true`, `nodeIntegration: false` for the renderer; `sandbox: false` (changed 2026-06-11: Electron cannot sandbox ESM preload scripts, and the project is ESM — context isolation plus the typed-bridge-only preload remain the security boundary; revisit if Electron gains sandboxed-ESM-preload support). Single `BrowserWindow`; no remote content — all UI is local. CSP blocks remote scripts; OF media loads through a dedicated `media://` protocol handler proxied by main, which caches on disk — renderer never holds OF CDN URLs (they carry expiring signatures). **Fetch strategy (Phase-0 finding 2026-06-10):** `thumbs.onlyfans.com`, `public.onlyfans.com` and even fresh `cdn*.onlyfans.com` avatar URLs are directly fetchable from a non-proxy IP (no IP lock observed) — main fetches the signed URL directly first (0 credits) and falls back to the OFAPI download endpoint (3 credits/MB, their CDN cache afterwards) on 403/expired signature.
- **All secrets and all network I/O live in main.** Renderer talks only typed IPC. OFAPI key + LLM keys encrypted via `safeStorage` (Keychain/DPAPI), held decrypted in main memory only.
- IPC surface (preload-exposed, all zod-validated request/response):
  - `query:*` — read paths backed by SQLite + fetch-through (accounts, chats, messages, fan, vault)
  - `cmd:*` — sends, mark-read, notes, settings mutations
  - `ai:*` — `start/cancel` + event stream `chunk/progress/complete/error/discarded` (ports the legacy port-protocol; `operationId` correlation, stale-chunk discard)
  - `sync:*` — status, force-refresh, event subscription (new message, chat updated, credit balance)
- Renderer never receives: API keys, raw OFAPI errors with headers, file-system paths outside app data.
- Logging: ported legacy redaction (keys, auth headers → `[REDACTED]`); debug mode gates verbose logs + prompt inspector.
- **Windows parity (PLAN item 11, 2026-06-13):** `safeStorage` on Windows = DPAPI (per-user). The POSIX `0o700`/`0o600` modes on the secrets dir are no-ops on NTFS — **accepted**: the DPAPI ciphertext plus the per-user profile ACL are the boundary, same trust level as the macOS Keychain path. Main takes `app.requestSingleInstanceLock()` (two processes on one encrypted db would double polling/credits and race the WAL; a duplicate launch focuses the existing window — `platform/single-instance.ts`) and sets `setAppUserModelId('com.chatgoose.desktop')` = the electron-builder appId, without which Windows toasts never show. Unread badge: macOS dock badge ↔ win32 taskbar overlay icon with the count drawn in main (`platform/badge.ts`). Packaged builds pin `userData` to `appData/ChatGoose` — the package.json-derived default (`@chatgoose/desktop`) collided with the dev profile. **Auto-update (win32 packaged only, added 2026-06-13):** `electron-updater` generic feed over HTTPS on the agency VPS; download in background, install on quit, never a mid-shift restart prompt, failures silent (`main/platform/updater.ts` — a `createUpdateController` shared by the background loop and a manual **Settings → Updates** "Check for updates / Restart & install" button over `query:updates.status` + `cmd:updates.{check,install}`). Unsigned builds can't verify update signatures, so the feed host is the trust anchor (ours, CI-only uploads via an unprivileged user). macOS: no auto-update — Squirrel.Mac refuses unsigned apps. Packaging/signing + release ritual: `docs/RELEASE.md`; hardware verification: `docs/WINDOWS-VERIFICATION.md`.

## 5. OFAPI client layer (`apps/desktop/src/main/ofapi`)

- **Base:** `https://app.onlyfansapi.com/api`, `Authorization: Bearer <key>`. Account ids `acct_*`; fan/chat/message ids are raw OF numeric ids (`chat_id === fan.id`). Never concatenate paths by hand outside this module.
- **Generated types** from vendored `openapi.json`; hand-written `OfApiClient` exposes typed methods per subsystem (chats, messages, fans, users, transactions, vault, accounts, webhooks). **The `{data, _meta, _pagination}` envelope is NOT universal** (verified live 2026-06-10: `GET /api/accounts` returns a bare top-level array, `GET /api/whoami` a bare object, while account-scoped endpoints return the envelope) — unwrapping is per-operation, driven by the OpenAPI schema. Credits/rate-limit meta (`_meta._credits.balance`, `x-rate-limit-remaining-minute`, `x-ofapi-credits-*` headers) is published to a `CreditMeter` (status bar + persisted daily counters) whenever present.
- **Rate limiting:** client-side token bucket well under plan RPM (config; default 300 RPM, burst 20), per-account concurrency cap 4, global 12. 429 → honor `retry-after`, exponential backoff 1/2/4/8 s. 5xx → retry ≤3 (idempotent GETs only). **POST send-message is never auto-retried** (§7).
- **Pagination adapters** (four upstream styles — research doc §6): `nextPageUrl`, `limitOffset`, `marker`, `firstLastId`. One `paginate()` helper per style; callers request "N items" or "until predicate" with a hard page cap + inter-page delay (legacy: 300 ms between pages, deep fetch caps). Always pass `skip_users` explicitly — live default behavior differs from the documented default.
- **Error mapping** into the `CG-*` registry (§11): 401→`OFAPI-AUTH`, 404 acct-prefix hint, 422 validation detail, 400 restricted-words (carry `textHighLight`), session-expired detection from account state.
- **Fixture capture mode:** debug flag records sanitized request/response pairs into `tests/fixtures/ofapi/` for contract tests (no sandbox upstream — recorded fixtures are our regression net).
- **Key custody (RESOLVED 2026-06-11 — vendor FAQ is explicit): OFAPI keys have NO scopes or permissions.** “Every API key has full access to every account you've connected to OnlyFans API, including every endpoint.” Multiple keys exist only for naming, usage tracking, and individual revocation — the per-phase scoped-key matrix originally planned here is impossible. Custody rules instead: **(a) pilot (P1–P2, 1–2 supervised chatters):** one dedicated *named* key per chatter machine (revoke individually, instantly), stored only via the encrypted keychain store (§4), anomaly watch via core's webhook journal (`accounts.*` events, credit spikes); **(b) scale gate: before any rollout beyond the supervised pilot, key custody moves server-side (P6 gateway mode — desktops hold no OFAPI key) unless the vendor ships scoped keys first** (feature request to be filed); **(c)** the admin key used for webhook CRUD and account connect/disconnect never leaves the owner's machines; **(d)** `OfApiClient` stays the single network chokepoint and direct↔gateway is a config switch (base URL + auth header, identical paths/shapes/`_meta` passthrough) — the later custody migration is config-plus-thin-proxy, not a rework.

## 6. Sync engine

```ts
interface SyncProvider {
  start(accounts: AccountId[]): void
  stop(): void
  events: Emitter<SyncEvent> // chatListUpdated | messageReceived | messageSent |
                             // ppvUnlocked | tipReceived | presence | typing |
                             // accountAuthChanged | readStateChanged
  refreshChat(account: AccountId, chatId: ChatId, purpose?: OfApiPurpose): Promise<void> // automatic/background tail fetch, gated by auto-read
  readChatTailForUserOpen(account: AccountId, chatId: ChatId, purpose?: OfApiPurpose): Promise<void> // deliberate single-chat user read, no openConversation side effects
}
```

### 6.1 PollingSync (P1) — designed as a cost feature
- **Chat-list poll** is the primary detector: `GET /{account}/chats?limit=10&order=recent` (1 credit) every **20 s** for the focused account, **60 s** for other handled accounts. **⚠ Correction (live-verified 2026-06-11; fixed in P3 session 2026-06-11): OnlyFans, not our `limit`, decides the chats page size — `limit`>10 is silently truncated (saw 10/page on `order=recent`, 16/page on `order=old`; `limit`≤10 honored). Implemented design: the hot poll requests page 1 only, with an explicit `limit=10` (1 credit, cadence unchanged) — sufficient because `order=recent` means any chat whose `lastMessage` changed surfaces on page 1; deeper pages matter only for initial load and read-state/unread drift on older chats. Those are covered by (a) a deep sweep every 5 min per account: up to 5 pages via the limit/offset cursor (`offset += 10`, `_pagination.next_page` presence = has-more, 300 ms inter-page pacing); (b) initial hydration, scaled to the measured inbox (loravie FREE = **900+ chats** ≈ 60–90 pages, counted 2026-06-11): a **LIST-ONLY** walk — chat+fan rows from the list payload, **no per-chat message tail fetches** (at 900 chats those would cost ~900 credits and hours of serial fetching; history loads on conversation open) — **chunked at 10 pages per poll tick** so the hot detector keeps running, resumed across ticks **and restarts** (progress persisted in settings), runaway-capped at 150 pages; the delta detector compares against the chat row's own `last_message_id` (schema v3) since the messages table no longer reflects what the list last showed; (c) `forceRefresh` (manual refresh) = a deep sweep. Credit math: hot poll stays 1 credit/tick; deep sweeps add ~5 credits/5 min ≈ 60/h ≈ 480/shift per account; hydration is a one-time ~60–90 credits per account, ~10 per tick. The delta rule applies to head-walk pages; hydration-chunk pages upsert rows only. Initial sync additionally suppresses message-level events: the first successful poll of a process lifetime emits no `messageReceived`/`messageSent`/`tipReceived` (cached chats that changed while the app was down are tail-fetched **silently** at baseline — downtime backlog must never replay as live toasts), and chats without a cached message boundary emit only messages newer than the previous successful poll — only `chatListUpdated` is unconditional (review finding 2026-06-11).** When the window is hidden, polling **slows ×4 but keeps running** — in the P1–P2 companion phase the app lives in the background and toasts/sounds must still fire (PRD F2); a full pause happens only when notifications are disabled or after explicit long idle. Resume burst on focus.
- **Delta rule:** message fetches happen only when the list shows change (`lastMessage.id` / `unreadMessagesCount` / `lastReadMessageId` differ from cache) → fetch just that chat's new tail: **`last_id=<last cached id>&order=asc`** (verified live 2026-06-10: `last_id+asc` returns the boundary id and newer messages in ascending order; `first_id` pages *backwards* into history and must only be used for scrollback — and boundary inclusion differs between the two, so always dedupe by id). The open conversation is refreshed on its list-delta and immediately after each own send; on top of that, a **conditional read-state sweep** catches `isNew` flips for seen-ticks: every 30 s (configurable), only while the window is focused **and** there are own messages with `isNew=true` younger than 24 h, auto-stopping after 10 min without change. No flat fast poll of the open conversation — list-delta stays the primary trigger.
- Fan-detail and transactions fetched on conversation open (and cached with TTL 5 min, matching legacy in-memory caches) — not in the poll loop.
- Budget guard: per-shift credit budget setting; on 80% an unobtrusive warning, on 100% polling slows 4× (never silently stops).
- **Per-fan thread-fetch stamps + the Spenders refresh queue (PLAN item 13, 2026-06-13).** Every tail fetch (poll-delta, conversation open, quick-look hydrate, scoped refresh) writes a per-fan `thread_fetch_log` stamp (schema v10) — **including empty threads**, so automatic paths never re-spend on fans who never wrote; the shared 5-min TTL on that stamp is the spend ceiling for the quick-look hydrate (`cmd:spenders.hydrate` fires on EVERY preview open, main decides) and the refresh queue. The **scoped refresh queue** (`cmd:spenders.refreshScope`, scope = «Все» | mapped OM list) issues ONE read-only tail GET (`limit=100`, never deeper — a side absent from the newest 100 renders «—» honestly) per roster fan outside the TTL, serial with 300 ms pacing, under the distinct ledger purpose **`spenders-refresh`**. It is the LOWEST-priority OFAPI consumer: where polling slows ×4 on budget exhaustion, the queue **pauses entirely** (rechecks every 30 s; 3 consecutive fetch failures also pause — network-down must not burn through the scope erroring). Progress persists in settings every 10 fans, so a restart resumes the remainder (the TTL skip makes replayed steps free); progress streams to the renderer as additive `spendersRefresh` frames on sync:event; completion stamps the per-scope «последний апдейт» (an «Все» completion stamps every chip's scope). `SyncProvider.refreshChat` gained an optional purpose parameter for this consumer.

### 6.2 HubSync (parallel core track — target P3)
- SSE stream from core (`GET /api/v1/events/stream`, bearer chatter API key; SSE per core decision #25 — no websockets there), zod-validated `SyncEvent` frames (same union — renderer code unchanged). `Last-Event-ID` resume against core's event journal; on disconnect, exponential reconnect + a reconciliation sweep (one chat-list fetch per account) to close the gap; PollingSync (slowed) is the degraded fallback.
- Read-state remains polling of the open conversation (no upstream webhook exists), under the **same conditional sweep policy as §6.1** — left unconditional it would dominate hub-mode credit burn and erase most of the webhook savings.

### 6.3 Cache reconciliation rules
- Messages are upserted by `(account, chat_id, message_id)`; webhook/push payloads are trusted for inserts but a periodic tail check heals divergence (edits via `changedAt`, deletions via `messages.deleted` or tail-fetch diff → tombstone, render "deleted").
- Media with `isReady:false`/null URLs → poll single-message endpoint every 15 s (cap 10 min) until ready.
- Everything renders from SQLite; network only mutates SQLite; UI subscribes to DB-change events (single source of truth, instant reopen).

## 7. Send pipeline (correctness-critical: no upstream idempotency)

> **Send contract live-verified 2026-06-11** (P3 opening validation, owner-designated test fan only; fixtures: `tests/fixtures/ofapi/send-message-*.json`, `delete-message-success.json`, `tests/fixtures/webhooks/messages_sent_own_api_send.json`): ① `POST …/messages` 200 returns the full created message object in `data` (server `id`, `cancelSeconds` ≈24 h live unsend countdown); observed round-trip 3.6 s — optimistic UI is mandatory. ② **`messages.sent` fires for our own API sends** (~0.2 s after the POST response; payload = the same message object with `toUser` = full fan object instead of `fromUser`; chat identified via `toUser.id`) — the §7.5 verifier can use it as the fast confirmation signal in hub mode; tail-fetch reconciliation stays the universal fallback (polling mode, missed webhooks). ③ Restricted words → HTTP 400 **pre-delivery**, wrapped as `error:"ONLYFANS_COM_ERROR"` with the OF body nested at `onlyfans_response.body`; `errors.textHighLight` is an **array of strings** and in live capture contained the *full message text with no per-word markers* — the UX shows the platform reason and keeps the text; per-word highlighting is best-effort only. No `_meta` envelope on this error (credit meter gets nothing). ④ Unsend = `DELETE …/messages/{id}` → `{data:{success:true}}` (<24 h only). ⑤ The restricted-word list shifts (`venmo` delivered, `cashapp` blocked) — never hardcode it.

0. Composer is enabled only when the chat's `canSendMessage` is true; otherwise it is disabled with the platform-provided reason shown, and AI **Insert** degrades to **Copy**.
1. Compose → `outbox` row `{local_id: uuid, account, chat_id, payload, state: 'sending', created_at}` persisted **before** the POST; optimistic bubble keyed by `local_id`.
2. Single-flight per chat (queue further sends behind the in-flight one).
3. POST succeeds → row `state:'sent'`, store returned `message_id`, reconcile bubble.
4. POST fails **with definite non-delivery** → `state:'failed'`, inline retry/edit UI. Definite means strictly: the error occurred before any request bytes were sent (DNS resolution failure, connect refused/unreachable, TLS handshake error) **or** the server returned a definitive 4xx application response (validation; restricted words → show the platform reason from `onlyfans_response.body.errors.textHighLight`, keep text in composer — per-word highlight only when an entry is a proper substring of the draft). 4xx nuances (implemented in `classifySendFailure`): **408 is indeterminate** (a request timeout proves nothing about processing); **429 is definite** (a rate limiter rejects before processing — both OFAPI's gateway 429 and an upstream OF 429 surfaced via the wrapper); a wrapped upstream **5xx stays indeterminate** even though OFAPI packages it as a 4xx-ish body. When in doubt, it is NOT definite.
5. Everything else is **indeterminate** (timeout, connection reset after the request started, any 5xx including gateway errors) → `state:'unconfirmed'`. **Never auto-retry.** Background verifier fetches the chat tail and matches by text+timestamp window, and in hub mode promotes instantly on the matching `messages.sent` event (live-verified to fire for our own API sends) → promotes to `sent` or offers manual retry with a diff view.
6. App restart with `sending/unconfirmed` rows → same verifier path before any UI offers resend.
7. Multi-part (`[NEXT]`) sequences: each part is its own outbox row; sequence aborts on first failure; inter-part delay 2–5 s randomized; cancel between parts.
8. Typing indicator: while composer has activity, call typing endpoint every 3 s (free); stop on idle 4 s.
9. Mark-as-read: on conversation open + window focused, debounced 1.5 s; settings toggle, default ON (decided 2026-06-10).

## 8. AI layer (port of legacy, adapted to OFAPI data)

### 8.1 Behavior carried over from legacy (into `packages/shared`) — fresh code, locked behavior
All implementations are written **from scratch** (owner decision 2026-06-10: legacy code is reference reading, not copy material). Three things carry over literally:
1. **Prompt artifacts, byte-for-byte:** all templates (7 + compare), safety preambles (reply/analysis modes), tone instructions, ping segment instructions, prompt-cache block segmentation (1h system/personality, 5m transcript, uncached task). Only Fansly→OnlyFans wording changes.
2. **Product constants/data:** staged timeouts (60 s quick; 180/45/45/300 s deep), temperatures and max_tokens per feature, message counts, ping thresholds (5 d / 3 msgs), min-deep 30, summary-cache validity rules, model registry entries, `CG-*` error taxonomy. The constants tables in research doc §1/§4/§5 are normative.
3. **Test cases as behavior facts:** re-express the legacy suites' cases in fresh test code without dropping cases — `escapeForPrompt` ordering (& first), `[NEXT]`/`[VARIANT]` edge cases, XML extraction, reply-sanitizer regressions (think-blocks, meta-leak lines, Gemini bracket garbage, wrapping quotes), cache-staleness matrix. Dropping a case = dropping production knowledge.

Everything else — module boundaries, types, structure, style — is the implementer's own design; when the exact behavior is unclear, the legacy source is the truth to learn from, not to copy.

### 8.2 Context builder mapping (legacy → OFAPI)

| Context input | Legacy (Fansly) source | New (OFAPI) source |
|---|---|---|
| Transcript messages | `/api/v1/message` pages | `GET /{account}/chats/{chat_id}/messages` (`limit` 100/page, `first_id` pagination, ascending sort by `createdAt`, dedupe by id) |
| Sender label | senderId vs modelAccountId | `isSentByMe` → `Model:` else `Fan:` |
| Message text | plain `content` | `text` is OF HTML → strip to plain text (entity decode, `<br>`→newline, drop styling spans) before `[HH:MM] Sender: …` formatting |
| Media labels | attachment contentType map | `media[]`/`mediaCount` types → `[Photo]`, `[Video]`, `[Audio]`, `[Media Bundle: …]`; GIFs via `giphyId` → `[GIF]` |
| **PPV state** | orderhistory verification pipeline (10-item cap, 3s timeouts, `unknown` fallback) | **Directly on message:** `price>0` ⇒ PPV; sent + `isOpened===true` ⇒ `purchased`; sent + `isOpened===false` ⇒ `not purchased`. `unknown` label retained in format but should be rare. `messages.ppv.unlocked` event (P6) updates live |
| Tips | `totalTipAmount` mills | `isTip` messages → `[Tip: $X.XX]`. **Resolved 2026-06-10 (Phase-0 live fixture):** tip messages carry `tipAmount` (number, dollars) and `tipText` (fan's accompanying note, OF HTML) — ladder step ① wins; `text` on a tip message is platform boilerplate in the fan's UI language ("Ich habe dir einen $5.00 Tipp geschickt") and is NOT the fan's words — render `[Tip: $X.XX]` + stripped `tipText`, ignore `text`. Fallback `[Tip]` without amount only if `tipAmount` is absent (never fabricate) |
| Fan display name | group users + DOM fallback | `fan.displayName` (creator-set custom name, set by the team via OnlyMonster; `''` = unset — live-verified 2026-06-11) → `fan.name` → `username`; original `name` kept as the secondary identity line |
| Spending block | wallets/earnings stats + monthly breakdowns | `subscribedOnData` `*Summ` totals (totalSumm, subscribesSumm, tipsSumm, messagesSumm, postsSumm, streamsSumm); monthly breakdown from `GET /{account}/transactions` filtered by fan id, `marker`-paginated, page cap 5, on-demand + 5 min cache. Keep legacy text block format |
| Subscription block | messaging groups / subscribers walk | `subscribedOnData`: subscribeAt, expiredAt, renewedAt, duration, discountPercent, hasActivePaidSubscriptions, unsubscribeReason; renew-off ⇒ "churn risk" line. Keep legacy text block format |
| Fan bio (hi-greeting) | DOM/account API | `GET /{account}/users/{username}` `about` |
| Ping segment | analyzePingSegment on transcript | identical algorithm; fan text messages = `!isSentByMe && text non-empty`; thresholds 5 days / 3 messages unchanged |

**Invariant:** block text formats stay byte-compatible with legacy where data allows — the prompts were tuned against those exact shapes.

**Transcript timezone (decided 2026-06-10):** `[HH:MM]` timestamps are rendered in **UTC for everyone**. Legacy used the machine-local timezone — unacceptable now that summaries and caches are shared across chatters in different timezones: byte-stable context blocks (and cache keys derived from them) require a single timezone.

### 8.3 Operation coordinator
Ports legacy lifecycle: one operation per conversation context (`CG-FLOW-04` on concurrent start), synchronous reservation, `operationId` UUID correlation, discard on conversation switch, staged timeouts (`quick-total` 60 s; deep: prep 180 s, TTFB 45 s, idle 45 s, max-stream 300 s), auto-retry on LLM 429 (`Retry-After` ≤60 s) and 503 (+5 s), profiling stages in debug mode. Transport changes from extension Port to IPC events — protocol types live in `packages/shared/protocol`.

### 8.4 Feature policies
Same registry pattern (`features.ts`): surface (`ai-dock` inline vs panel-tab read-only), result kind (reply parts / single reply / XML doc), context recipe (message counts: quick 100 / improve 25 / deep 1500 / hi-greeting 25 cap 10-msg-convo / ping 100), includesEarnings flags, min-messages gate (deep ≥30 → `CG-FLOW-03`), model-selection delegation (improve+hi → fast-reply's model). **Default reply tone = `casual`** (owner 2026-06-10; legacy shipped `none` — deliberate default change, the tone instruction text is verbatim; active tone click-toggles off to no-override).

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
| Identity probe — Settings "Test connection" (returns `{authMethod, user:{username, role, assignedPages[]}}`; cheapest authenticated call, no page aggregation) | `GET /api/v1/auth/me` | chatter API key |
| List pages visible to the chatter | `GET /api/v1/pages` | chatter API key (Bearer `agency_hub_core_…`) |
| Read latest fan profile (summary) | `GET /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` | chatter API key |
| Append fan profile version | `PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` `{body ≤50k}` — append-only versions, stamped `source:"chatmuse"` | chatter API key only |
| Report AI usage | `POST /api/v1/ai-usage/batch` `{events[1..100]}` — dedupe by `(userId, clientEventId)` | chatter API key only |
| Fan detail / notes / flags | `GET …/fans/{platformUserId}`, `POST …/notes`, `PATCH /api/v1/fans/{platform}/{platformUserId}/flags` | chatter API key |

Notes that bind us: chatter API keys are **one-active-per-chatter, page-scoped, revocable** (kill-switch exists today, managed in core's Settings → Users). Fan identity in core is `(platform, platform_user_id)` — matches OFAPI's `chat_id === fan.id` directly. The `feature` field of usage events is a **closed enum** in core (`fast-reply | improve-draft | help-me | fan-summary | chat-review | scan | ping | hi-greeting`); core stores tokens, not dollars (cost derived at report time). Core's own OnlyFans data today is OnlyMonster-based and thin (transactions only; DM polling disabled) — none of our flows depend on it. **Caveat (verified in core source 2026-06-10):** the profile GET/PUT routes 404 for fans core's sync has never seen (`resolvePageFan` → `findFanOnPage` → `NotFoundError`, `core: apps/runtime/src/services/fan-profiles.ts:88`) — the pre-P4 core patch (PLAN P4) is a hard prerequisite before relying on them for OnlyFans non-spenders.

### 9.2 New work in core (tracked in core's repo; aligns with its Phase 7 "ChatMuse Backend" + "Hub-Owned AI Gateway" decisions). Timing: webhook receiver + SSE fanout = parallel track targeting desktop P3; AI gateway = P6; custody = stretch
- **OFAPI webhook receiver** — verify `HMAC-SHA256(rawBody, signing_secret)` from the **`signature` header**, dedupe by the **`x-ofapi-idempotency-key` header** (`evt_<40 hex>`; live-verified 2026-06-10 — the body has no event-id field) with a unique index, journal to an events table, ack 200 < 1 s (async processing via pg-boss) to stay inside OFAPI's 15 s timeout / 5-retry policy. Admin flow to register the webhook at OFAPI (`account_scope: global`, events per PRD F8).
- **SSE event fanout** — `GET /api/v1/events/stream`: chatter-key auth, events filtered to the chatter's assigned pages, `Last-Event-ID` replay from the journal (retention ~7 days). Frames = `SyncEvent` union (schema shared conceptually with `packages/shared/protocol`; core owns its copy in `contracts`).
- **AI gateway** — SSE streaming proxy to Anthropic/OpenRouter with central keys, per-chatter quotas, cost ledger, prompt caching (this is core's planned Phase 7 scope verbatim).
- OFAPI key custody + proxying of OF calls, so desktops hold no OFAPI key at all — **upgraded from stretch to required-before-scale (2026-06-11): OFAPI keys cannot be scoped (§5), so gateway custody is the only real containment unless the vendor ships scoped keys first.** Until then: per-chatter named full-access keys, supervised pilot only, instantly revocable.

### 9.3 Desktop side
Settings hold core base URL + chatter API key (keychain). HubSync (§6.2) and HubGateway (§8.6) consume the new endpoints; profile sync and usage reporting (§8.5, §8.6) already point at 9.1 from P4. Mapping OFAPI accounts to core page labels per §8.5.

## 10. Data layer (SQLite, desktop)

Tables (all with `account_id` scoping; ids TEXT):
- `accounts(id, username, display_name, auth_state, raw JSON, updated_at)`
- `chats(account_id, chat_id, fan_name, unread_count, has_unread_tips, last_message_at, last_message_preview, last_message_is_sent_by_me, last_read_message_id, pinned, can_send_message, can_not_send_reason, raw JSON, updated_at)` — index `(account_id, last_message_at DESC)`
- `messages(account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain, price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to JSON, media JSON, deleted, raw JSON)` — PK `(account_id, chat_id, message_id)`, index `(account_id, chat_id, created_at DESC)`
- `fans(account_id, fan_id, username, name, custom_name, about, last_seen, spending JSON, subscription JSON, fetched_at)` — no notes store: human notes cut from v1 (PRD F5)
- `summaries(…)` per §8.5; `outbox(…)` per §7; `media_cache(url_hash, path, bytes, fetched_at)` (LRU, cap 2 GB)
- `settings(key, value JSON)` with `schema_version` + sequential migrations (legacy pattern); `usage_events` (hub upload QUEUE — drains once core is configured); `credit_log(day, purpose, used, requests)` (per-purpose since v7 — Activity panel; pre-v7 rows carry purpose `untagged`); `ai_spend_log(day, feature, runs, cache_hit_runs, inserted, *_tokens, cost_microusd, top_run_*)` (durable AI ledger — survives the usage_events drain); `thread_fetch_log(account_id, chat_id, fetched_at)` (v10 — per-fan stamp of the last thread tail fetch, written by every fetch path incl. empty threads; TTL source for the quick-look hydrate and the Spenders refresh queue, §6.1; never rendered per row)
- Retention: messages pruned per chat beyond 5,000 (configurable); summaries/outbox kept.

**Encryption at rest (decided 2026-06-10):** chatter machines hold fan PII and adult-content DM history, and OS full-disk encryption can't be assumed. The SQLite DB uses a SQLCipher-compatible build (e.g. `better-sqlite3-multiple-ciphers`) with a per-install random key held in the OS keychain (`safeStorage`); the media cache stores encrypted blobs, decrypted on the fly by the `media://` protocol handler. Settings include a "Purge local data" action (drops DB + media cache). Idle app-lock is a later-phase option.

## 11. Error taxonomy

Extend legacy `CG-*` registry (every error: code, user-facing message, recovery action; raw detail in debug):
- Ported: `CG-AUTH-01` (LLM key missing), `CG-FLOW-01..09` (no personality / unmapped / min-messages / busy / ping-active / compare-min / hi-locked), `CG-API-06` (unusable output), `CG-NET-02` (timeout).
- New: `CG-OF-01` OFAPI key invalid · `CG-OF-02` account authentication failed (re-auth CTA; a lone `accounts.session_expired` event is informational — OFAPI auto-recovers it) · `CG-OF-03` rate-limited (auto-backoff notice) · `CG-OF-04` credits exhausted · `CG-OF-05` restricted words (`textHighLight`) · `CG-OF-06` send unconfirmed (verifier UI) · `CG-OF-07` unsend window passed · `CG-OF-08` media processing/unavailable · `CG-HUB-01..` hub auth/connection.

## 12. Observability

- Status bar: credit balance/today, LLM per-op cost (ported spend summary), sync freshness, RPM headroom.
- Debug mode: pipeline profiling per operation (ported stage profiler incl. `llm-ttfb`, `llm-stream`), prompt inspector (exact blocks + cache flags), OFAPI request log (sanitized), fixture capture toggle.
- **Local rotating file logs (`apps/desktop/src/main/diagnostics/logger.ts`)** — main-process logger writing `userData/logs/app.log` (rotates to `app.1.log` at 2 MB) plus an in-memory ring (last 1000 records). Every record is passed through the shared secret redactor (`@chatgoose/shared/diagnostics/log`) before it is kept or written. Boot lifecycle, `uncaughtException`/`unhandledRejection`, hub telemetry failures and IPC handler failures are recorded; the renderer feeds its own failures (render crashes via an `ErrorBoundary`, `window.onerror`/`unhandledrejection`, and every failed `invoke` at the bridge chokepoint) over `cmd:diag.logClient` so one timeline covers both processes.
- **Diagnostics export (`cmd:localData.exportDiagnostics`)** — ONE secrets-free `.json` file the user can send to support: app/runtime versions, settings (keyMeta stripped), sync/hub/credit status, DB counts + schema version, outbox-audit COUNTS (no message text), an error-code summary, and the recent log ring. The whole bundle is deep-redacted once more before write (`diagnostics/report.ts`), then revealed in the file manager. The crash `ErrorBoundary` exposes the same export as a one-click recovery action.

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
10. Logs and the diagnostics export carry no secrets: every log record passes the redactor at capture, and the export is deep-redacted once more before write (§12). Logs are plaintext by design (the user must be able to send them), so redaction — not encryption — is the guarantee. Logging never throws into a caller.
