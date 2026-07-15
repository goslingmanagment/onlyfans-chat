> **HISTORICAL ARCHITECTURE SPEC WITH RETAINED SAFETY INVARIANTS.** The Direct
> transport/AI diagrams and local provider-key, model, and prompt sections are
> superseded by the kernel-only implementation. Preserve §15 safety invariants,
> but verify every transport or ownership claim against current source,
> `CLAUDE.md`, `docs/decisions.md`, and the vendored kernel SDK.

# ChatGoose Desktop — Technical Specification

Status: Updated 2026-06-21 — webhook/SSE, snapshot recovery, Hub read custody, live Hub text/typing/unsend/mark-read/media-send command custody, configurable unread read-state reconcile, hourly spend reconcile, and durable telemetry are production defaults or rollout paths with rollback controls. Core AI gateway is proxy-routed and production-enabled; Desktop Direct AI remains the current rollback/default until desktop rollout is accepted.

## 1. Architecture overview

```
DIRECT MODE (P1+, polling)                    HUB MODE (real-time from ~P3, AI gateway P6)
┌─────────────────────────────┐               ┌─────────────────────────────┐
│  Desktop app (Electron)     │               │  Desktop app                │
│ ┌─────────┐   ┌───────────┐ │               │  (core chatter key          │
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
| Hub (P6) | **Extend the existing Agency Hub "core"** (`~/code/core`: Fastify 5 + Postgres 16 + Drizzle + pg-boss + React dashboard, Docker on a VPS) | Decided 2026-06-10: no separate relay. Core already serves the ChatGoose/"ChatMuse" API (fan profiles, ai-usage, per-chatter keys); webhooks + SSE, read custody, the text/typing/unsend/mark-read/media-send command outbox/executor, and the proxy-routed AI gateway foundation now live there (§9). Fresh desktop profiles default to production Hub (`https://gosling-agency.ru`) for OFAPI reads/writes and require only the chatter key for normal operation; Direct and local OFAPI keys are an explicit rollback for reads (and AI). Writes are Hub-only — `ofapiWriteTransport` is forced to `z.literal('hub')` (commit 872c750), so there is no selectable Direct write path. Local upload-from-disk is intentionally absent from the app surface. |

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
- **All secrets and all network I/O live in main.** Renderer talks only typed IPC. Hub key, optional Direct OFAPI key, and LLM keys are encrypted via `safeStorage` (Keychain/DPAPI), held decrypted in main memory only.
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
- **C6a read-custody bridge (2026-06-19):** core production revision `1d2859f3e3bf` exposes a chatter-authenticated, page-scoped `GET /api/v1/ofapi/read/*` allowlist and records the upstream attempt in the central credit ledger. Production validation proved assigned-account filtering, sanitized `/whoami`, query/path rejection, write-route absence, and one attributed ledger row per paid chats probe. The paired desktop live probe added `ofapi_gateway_chats` at `2026-06-19 19:06:52 UTC` (page 8, HTTP 200, 1 credit, not estimated, one attempt). Desktop persists `ofapiReadTransport = direct | hub` with Hub as the fresh/default production path: every `OfApiClient` GET goes through core with the chatter key, gateway 401 maps to `CG-HUB-01`, and there is no silent Direct fallback. Write custody is selected separately through C6b; supported writes no longer require a Direct client when Hub write transport is selected.
- **C6b command custody bridge (live and enabled 2026-06-20):** core owns `send_text_message_v1` intake/status/cancel plus the separately staged executor. The owner-authorized VIP→FREE test created one command, made exactly one `ofapi_command_send_text` attempt, reached `confirmed` with a platform message id, emitted the paired sent/received webhooks, and was unsent; logs/API responses contained no payload text. After proving rollback, production staged version 3 re-enabled execution with zero nonterminal commands. Desktop defaults supported write rows to Hub and reuses its local UUID as `clientCommandId`: ambiguous intake/restart recovery repeats the same idempotent command and polls core status, never falls back to Direct and never adds a `GET /messages` solely for command outcome. Desktop typing beacons use core `typing_active_v1` when Hub write transport is selected; the beacon is empty-payload, no-retry, and advisory. Desktop unsend uses core `unsend_message_v1` in Hub write mode and tombstones locally only after core confirmation. Desktop mark-read uses core `mark_chat_read_v1` in Hub write mode, waits for confirmation, and zeroes local unread state only after core confirms. Desktop media/PPV sends use bounded core `send_media_message_v1` commands when Hub write transport is selected: payload contains caption, price, media IDs, and preview IDs only; Direct was then the selectable rollback (later removed — writes became Hub-only, commit 872c750, 2026-06-23). Local upload-from-disk is intentionally absent from the app surface and the app transport fails it closed before any Direct network call.

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
  reconcileUnread(account?: AccountId, trigger?: UnreadReconcileTrigger): Promise<void> // list-only filter=unread read-state reconcile
}
```

### 6.1 PollingSync (P1) — designed as a cost feature
- **Chat-list poll** is the primary detector: `GET /{account}/chats?limit=10&order=recent` (1 credit) every **20 s** for the focused account, **60 s** for other handled accounts. **⚠ Correction (live-verified 2026-06-11; fixed in P3 session 2026-06-11): OnlyFans, not our `limit`, decides the chats page size — `limit`>10 is silently truncated (saw 10/page on `order=recent`, 16/page on `order=old`; `limit`≤10 honored). Implemented design: the hot poll requests page 1 only, with an explicit `limit=10` (1 credit, cadence unchanged) — sufficient because `order=recent` means any chat whose `lastMessage` changed surfaces on page 1; deeper pages matter only for initial load and read-state/unread drift on older chats. Those are covered by (a) a deep sweep every 5 min per account: up to 5 pages via the limit/offset cursor (`offset += 10`, `_pagination.next_page` presence = has-more, 300 ms inter-page pacing); (b) initial hydration, scaled to the measured inbox (loravie FREE = **900+ chats** ≈ 60–90 pages, counted 2026-06-11): a **LIST-ONLY** walk — chat+fan rows from the list payload, **no per-chat message tail fetches** (at 900 chats those would cost ~900 credits and hours of serial fetching; history loads on conversation open) — **chunked at 10 pages per poll tick** so the hot detector keeps running, resumed across ticks **and restarts** (progress persisted in settings), runaway-capped at 150 pages; the delta detector compares against the chat row's own `last_message_id` (schema v3) since the messages table no longer reflects what the list last showed; (c) `forceRefresh` (manual refresh) = a deep sweep. Credit math: hot poll stays 1 credit/tick; deep sweeps add ~5 credits/5 min ≈ 60/h ≈ 480/shift per account; hydration is a one-time ~60–90 credits per account, ~10 per tick. The delta rule applies to head-walk pages; hydration-chunk pages upsert rows only. Initial sync additionally suppresses message-level events: the first successful poll of a process lifetime emits no `messageReceived`/`messageSent`/`tipReceived` (cached chats that changed while the app was down are tail-fetched **silently** at baseline — downtime backlog must never replay as live toasts), and chats without a cached message boundary emit only messages newer than the previous successful poll — only `chatListUpdated` is unconditional (review finding 2026-06-11).** When the window is hidden, polling **slows ×4 but keeps running** — in the P1–P2 companion phase the app lives in the background and toasts/sounds must still fire (PRD F2); a full pause happens only when notifications are disabled or after explicit long idle. Resume burst on focus.
- **Delta rule:** message fetches happen only when the list shows change (`lastMessage.id` / `unreadMessagesCount` / `lastReadMessageId` differ from cache) → fetch just that chat's new tail: **`last_id=<last cached id>&order=asc`** (verified live 2026-06-10: `last_id+asc` returns the boundary id and newer messages in ascending order; `first_id` pages *backwards* into history and must only be used for scrollback — and boundary inclusion differs between the two, so always dedupe by id). The open conversation is refreshed on its list-delta and immediately after each own send; on top of that, a **conditional read-state sweep** catches `isNew` flips for seen-ticks: every 30 s (configurable), only while the window is focused **and** there are own messages with `isNew=true` younger than 24 h, auto-stopping after 10 min without change. No flat fast poll of the open conversation — list-delta stays the primary trigger.
- Fan-detail and transactions fetched on conversation open (and cached with TTL 5 min, matching legacy in-memory caches) — not in the poll loop.
- Budget guard: per-shift credit budget setting; on 80% an unobtrusive warning, on 100% polling slows 4× (never silently stops).
- **Per-fan thread-fetch stamps + the Spenders refresh queue (PLAN item 13, 2026-06-13).** Every tail fetch (poll-delta, conversation open, quick-look hydrate, scoped refresh) writes a per-fan `thread_fetch_log` stamp (schema v10) — **including empty threads**, so automatic paths never re-spend on fans who never wrote; the shared 5-min TTL on that stamp is the spend ceiling for the quick-look hydrate (`cmd:spenders.hydrate` fires on EVERY preview open, main decides) and the refresh queue. The **scoped refresh queue** (`cmd:spenders.refreshScope`, scope = «Все» | mapped OM list) issues ONE read-only tail GET (`limit=100`, never deeper — a side absent from the newest 100 renders «—» honestly) per roster fan outside the TTL, serial with 300 ms pacing, under the distinct ledger purpose **`spenders-refresh`**. It is the LOWEST-priority OFAPI consumer: where polling slows ×4 on budget exhaustion, the queue **pauses entirely** (rechecks every 30 s; 3 consecutive fetch failures also pause — network-down must not burn through the scope erroring). Progress persists in settings every 10 fans, so a restart resumes the remainder (the TTL skip makes replayed steps free); progress streams to the renderer as additive `spendersRefresh` frames on sync:event; completion stamps the per-scope «последний апдейт» (an «Все» completion stamps every chip's scope). `SyncProvider.refreshChat` gained an optional purpose parameter for this consumer.
- **D6 spend-sweep rollout (2026-06-20):** the normal desktop transaction reconcile now runs hourly; `spendSweepRollbackToLegacy=true` restores the old 10-minute cadence immediately. The rollout is based on the 30-day production comparison where observed `transactions.new` rows matched core truth 11/11 with every mismatch class at zero, but that proves only the observed terminal transaction path. OFAPI documents Chargebacks as a separate source (`GET /api/{account}/chargebacks`, statuses `loading | done | undo`), so core spend ingest is not final revenue truth until refund/chargeback delivery is confirmed and covered. Policy remains explicit: matched terminal `transactions.new` rows are authoritative for that source, `messages.ppv.unlocked` is estimated-only (`ppv_estimated=6` in that window), and `tips.received` remains blocked until a verified fixture exists. The hourly desktop sweep is retained as the correction net rather than being removed.
- **Read-only toward OFAPI ≠ side-effect-free (clarification).** "Read-only" here means the sync never *posts* content; it does **not** mean zero upstream side effects. Any `GET …/messages` marks that chat read on OnlyFans (the fan sees "seen" instantly). So: automatic background body-reads of *unopened* chats are gated behind `autoReadChats` (default **OFF**), while a *deliberately opened* conversation always issues the GET — the one sanctioned, ungated read — and is expected to mark read. The dedicated `mark_chat_read_v1` command (§7.9) is a separate, also-default-OFF path.

### 6.2 HubSync (live — default for Hub reads since P3)

> **SUPERSEDED (Stage 35, 2026-07-07):** this section describes stream v1
> (`/api/v1/events/stream`, `Last-Event-ID`, projection-page snapshots). The
> shipped default is stream v2 (opaque per-account cursor, snapshot = fresh-
> cursor handshake reconciled via polling); v1 survives only as a settings
> fallback. Current truth: `docs/generated/06-sync-and-reads.md` + decisions D3.

> **CURRENT AS-BUILT CORRECTION (D10, 2026-07-12):** preserve the sentence
> above as historical Stage-35 text. Stream-v2 recovery is no longer reconciled
> through polling. On a cursor-bearing auth rejection or a v2 409, the desktop
> authenticates a fresh cursor without persisting it, refreshes the actual
> read-gateway account grants and polling/allowlist membership, then exhausts
> every durable `/api/v1/events/snapshot` page for every refreshed account.
> Only a complete all-account apply permits the opaque cursor checkpoint;
> partial state, any account 404, validation/apply failure, or grant-refresh
> failure keeps the old cursor. An authenticated empty grant set is valid.

> **CURRENT AS-BUILT CORRECTION (D18, 2026-07-15):** the bullet below saying a
> degraded transition "runs a reconciliation `forceRefresh`" is historical.
> SSE state transitions now change the polling scheduler mode ONLY (suspend on
> live, resume on degraded/stopped); they never initiate paid reads beyond the
> standing cadence — the resumed loop's first tick applies its own 5-minute
> deep-sweep cap. Notification-shaped frames (`ppvUnlocked`, `tipReceived`)
> are advisory toward the stream cursor: their local facts apply monotonically
> and their preview refresh is best-effort, so a failing handler can never
> freeze the checkpoint. A frame whose handler rejects deterministically trips
> a poison breaker after 3 identical rejections: snapshot-covered message
> types rebaseline through the D10/D16 recovery; anything else parks SSE for
> 15 minutes with a loud log instead of skipping state silently. Root cause &
> prod forensics: decisions D18 (incident 2026-07-15).

- SSE stream from core (`GET /api/v1/events/stream`, bearer chatter API key; SSE per core decision #25 — no websockets there), zod-validated `SyncEvent` frames (same union — renderer code unchanged). `Last-Event-ID` resume against core's event journal; the normal server-side 15-minute stream close reconnects silently with no degraded transition. If the requested cursor has fallen behind journal retention, core returns `409 sync_snapshot_required`: HubSync enters degraded mode (polling resumes), downloads every page of chatter-scoped `GET /api/v1/events/snapshot` for locally handled accounts, applies the hot chat/message state and archive tombstones idempotently, persists the common `snapshotCursor` only after the full apply, then reconnects SSE from that cursor. A partial snapshot (`resumeAllowed=false`), malformed response, account/scope mismatch, or apply failure never advances the cursor. Presence/typing are explicitly omitted as ephemeral state.
- For ordinary transport degradation or auth failure, the app resumes polling and runs a reconciliation `forceRefresh` (the same 5-page deep sweep as manual refresh), then pauses periodic list polling again once hub returns live. While hub is live and account hydration is complete, periodic chat-list polling is fully paused; read-state/media/spenders/user-open paths remain explicit REST paths.
- `messages.received` / `messages.sent` frames may carry an optional normalized message body. Complete matching bodies are ingested into SQLite without `GET /messages`; id-only, mismatched, malformed, `ppvUnlocked`, and `tipReceived` notification-shaped frames keep the safe fallback path. With `autoReadChats=false`, that fallback is list-only and never performs a background message-body read.
- Event checkpoints advance only after a frame parses, belongs to a locally handled account, and applies successfully. Snapshot apply preserves existing local tombstones, applies unresolved delete tombstones by `(accountId,messageId)` lookup, and re-applies authoritative chat heads after idempotent message ingest.
- **Unread read-state reconcile (desktop fallback, 2026-06-21):** hub/webhook mode still has no upstream event when a chat is read externally in OF/OnlyMonster. Desktop therefore owns a small body-free reconcile path using only `GET /{account}/chats?filter=unread&order=recent` under ledger purpose `unread-reconcile`. It runs only when local unread exists, on configurable immediate triggers (Unread tab, window focus, account focus) plus a focused-account timer while hub-live polling is suspended; all toggles, intervals, debounces, and page caps live in Settings → Behavior. Returned rows are upserted normally. Missing local unread rows are cleared only when the capped scan is exhaustive, and only if the chat's `last_message_id` did not move during the scan; partial scans never clear the missing tail. This path never calls `GET /messages`, never calls mark-read, and is independent from `autoReadChats`.
- Read-state remains polling of the open conversation (no upstream webhook exists), under the **same conditional sweep policy as §6.1** — left unconditional it would dominate hub-mode credit burn and erase most of the webhook savings.
- Command custody is not implied by hub reads. Desktop has a strict shared client for core command create/read/cancel responses, including explicit `indeterminate` status and no-payload response parsing. The local send engine owns the visible outbox and recovery UX while routing supported write kinds through core when Hub write transport is selected. Fresh profiles default both read and write transport to Hub with the production Hub URL already set; normal Hub mode does not require a local OFAPI key for read, text, typing, unsend, mark-read, or media/PPV sends. Direct remains an explicit rollback path for reads and AI only; writes are **Hub-only** — `ofapiWriteTransport` is forced to `z.literal('hub')` (commit 872c750), so there is no selectable Direct write path and the "under Direct rollback" write branches in §7 are legacy and unreachable from Settings. Unsupported local file-byte upload is intentionally absent and fail-closed.

### 6.3 Cache reconciliation rules
- Messages are upserted by `(account, chat_id, message_id)`; enriched webhook/push payloads are trusted for inserts, while explicit fallback/list verification heals incomplete frames and longer gaps (edits via `changedAt`, deletions via `messages.deleted` or tail-fetch diff → tombstone, render "deleted").
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
8. Typing indicator: while composer has activity, emit a typing beacon every 3 s (free); stop on idle 4 s. Under Hub write transport this is a core `typing_active_v1` command with empty payload and no recovery UI; under Direct rollback it calls the OFAPI typing endpoint locally.
9. **Explicit mark-as-read** (the dedicated mark-read command fired on conversation open) is **default OFF**, and its standalone settings toggle was removed (`markAsReadOnOpen: false`, superseded by `autoReadChats`; commit ab9eaa0) — so the `mark_chat_read_v1` path does not fire for default users. **This does NOT mean an opened chat stays unread:** any `GET …/messages` marks the chat read on OnlyFans as a side effect, and opening a conversation always issues that GET (the one sanctioned message-body read, ungated by `autoReadChats` — see §6.1), so the fan sees "seen" on open regardless of this toggle. When the explicit command *is* enabled: under Hub write transport it is a core `mark_chat_read_v1` command with empty payload and local unread zeroed only after core confirmation; under Direct rollback it calls the OFAPI mark-as-read endpoint locally.

### 7.1 Core command recovery UX (live — write custody enabled 2026-06-20)

Desktop write custody is live (enabled 2026-06-20). The local outbox remains the source of drafts and optimistic bubbles; core command status is the source of server-owned execution state. Core responses never return message text, so recovery UI must use the local draft/outbox payload and only show core metadata (`payloadHash`, state, attempts, verifier result, platform id).

- `queued`: core accepted the command. If execution is disabled, show it as parked by the server and allow cancel while it remains queued.
- `in_flight`: server attempt is running. Disable resend/direct fallback for the same local row and keep one visible pending bubble.
- `confirmed`: reconcile to sent, using `platformMessageId` when present.
- `failed_retryable`: show edit/retry; retry creates a new local row and new `clientCommandId` with `retryOfCommandId`.
- `failed_terminal`: show the terminal reason; any new send is a new command id after human edit/confirmation.
- `indeterminate`: map to the existing unconfirmed UX. It is not safe-to-resend; the chatter must verify the conversation when possible before creating a new retry command.
- `cancelled`: remove the queued pending bubble but keep the audit row.

This mapping must not add a background `GET /messages` solely to decide command outcome. Evidence comes from the core status endpoint, `messages.sent` verifier, and existing user-visible manual checks.

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
Ports legacy lifecycle with desktop multitasking: one operation per conversation context (`CG-FLOW-04` on concurrent start), synchronous reservation, `operationId` UUID correlation, explicit cancel/dispose discard, staged timeouts (`quick-total` 60 s; deep: prep 180 s, TTFB 45 s, idle 45 s, max-stream 300 s), auto-retry on LLM 429 (`Retry-After` ≤60 s) and 503 (+5 s), profiling stages in debug mode. Conversation navigation does **not** cancel AI; the renderer keeps an in-memory `operationId → conversation` job map and per-operation stream buffer/splitter, projects only the visible chat's job into the dock, and shows background row/toast readiness when hidden jobs complete. Transport changes from extension Port to IPC events — protocol types live in `packages/shared/protocol`.

### 8.4 Feature policies
Same registry pattern (`features.ts`): surface (`ai-dock` inline vs panel-tab read-only), result kind (reply parts / single reply / XML doc), context recipe (message counts: quick 100 / improve 25 / deep 1500 / hi-greeting 25 cap 10-msg-convo / ping 100), includesEarnings flags, min-messages gate (deep ≥30 → `CG-FLOW-03`), model-selection delegation (improve+hi → fast-reply's model). **Default reply tone = `casual`** (owner 2026-06-10; legacy shipped `none` — deliberate default change, the tone instruction text is verbatim; active tone click-toggles off to no-override).

### 8.5 Summary cache
SQLite `summaries` table replacing browser.storage: key `(account, fan_id)`, fields per legacy entry (`body, model_id, personality_id, personality_updated_at, generated_at, spending_verified, subscription_verified, hub_sync_state`). Same staleness rules; refresh = delete + regenerate. Hub prefetch (5 s timeout) before generation and fire-and-forget push (10 s timeout) after — ported Agency Hub client pointed at core, **live from P4**: `GET/PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` (profile versions are append-only, 50 KB cap; the pre-P4 core patch now auto-creates missing OnlyFans fan/page membership on profile writes). Disabled when core is unconfigured. OFAPI account → core page-label mapping: match `platform === 'onlyfans'` + normalized username (legacy rule: lowercase, strip `@`), with manual override in settings.

### 8.6 AiGateway seam

> **SUPERSEDED (Stage 35, 2026-07-07):** this section predates the kernel-AI
> cutover — there is no Direct transport, no local keys, no local prompt
> assembly; the only lane is core's feature service
> (`POST /api/v1/ai/features/:feature`, refs-only request). Current truth:
> `docs/generated/08-ai-pipeline.md` + decisions D4 / core #111.

```ts
interface AiGateway { stream(req: LlmRequest, cb: StreamCallbacks): CancelFn }
```
`DirectGateway` (P2): provider SSE clients with local keys. `HubGateway` (P6): same contract over core's hub-owned AI gateway (SSE streaming per core decision #25) — core holds provider keys, enforces per-chatter quotas, records usage/cost, and reports provider/outcome metadata to owners without echoing prompt or generated text. Core's AI gateway is implemented, proxy-routed through page/account proxy infrastructure, production-enabled, and validated with streamed SSE plus a terminal usage/cost ledger row. Desktop now has an explicit `aiGatewayTransport: direct | hub` setting (default/rollback `direct`) and a HubGateway adapter that maps account → core page label, streams core `event: ai` frames, and suppresses duplicate legacy usage-batch reporting for gateway-routed generations. Desktop keeps `direct` as the active/default path until the desktop gateway rollout is accepted. During direct mode the desktop still reports usage to core's live `POST /api/v1/ai-usage/batch` (legacy batching: 1 s debounce, 100/batch, retry 5 s/15 s, drop after 3 attempts; upstream dedupes by `clientEventId`). Feature names must match core's **closed** `aiUsageFeatures` enum (`core: packages/shared/src/types.ts`) — adding a feature requires a core-side enum change first; note Compare has no name there (an unexplained `scan` exists instead) — before P4, either add `compare` to core's enum or decide to report per-card as `fast-reply`. **Clock-skew guard:** `completedAt` is clamped to server time (offset derived from the `Date` header of core responses). Core now skips invalid events per item and returns invalid counts instead of failing the whole batch; on HTTP 400 the reporter still must not blind-retry — log, surface `CG-HUB-02`, and quarantine the offending events. The same server-time offset drives the 24 h unsend countdown (§7) instead of trusting the local clock.

**Open before Desktop Hub AI default:** core must not record a completed gateway generation as `$0` when the provider stream returns content/done without a terminal usage frame. That path must become failed/indeterminate or an explicitly approximate-cost ledger row before `aiGatewayTransport=hub` is accepted as the default.

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

Notes that bind us: chatter API keys are **one-active-per-chatter, page-scoped, revocable** (kill-switch exists today, managed in core's Settings → Users). Fan identity in core is `(platform, platform_user_id)` — matches OFAPI's `chat_id === fan.id` directly. The `feature` field of usage events is a **closed enum** in core (`fast-reply | improve-draft | help-me | fan-summary | chat-review | scan | ping | hi-greeting`); core stores tokens and, for gateway-routed requests, provider/outcome/cost metadata. Core's profile routes now auto-create missing OnlyFans fan/page membership on profile writes; desktop no longer treats unknown non-spenders as a hard pre-P4 blocker.

### 9.2 Core custody status (tracked in core's repo; aligns with its Phase 7 "ChatMuse Backend" + "Hub-Owned AI Gateway" decisions). Webhook/SSE/snapshot, read custody, text/typing/unsend/mark-read/media-send command custody, and proxy-routed AI gateway are live/rolling out; desktop AI rollout remains open
- **OFAPI webhook receiver** — verify `HMAC-SHA256(rawBody, signing_secret)` from the **`signature` header**, dedupe by the **`x-ofapi-idempotency-key` header** (`evt_<40 hex>`; live-verified 2026-06-10 — the body has no event-id field) with a unique index, journal to an events table, ack 200 < 1 s (async processing via pg-boss) to stay inside OFAPI's 15 s timeout / 5-retry policy. Admin flow to register the webhook at OFAPI (`account_scope: global`, events per PRD F8).
- **SSE event fanout** — `GET /api/v1/events/stream`: chatter-key auth, events filtered to the chatter's assigned pages, `Last-Event-ID` replay from the journal (retention ~7 days). Frames = `SyncEvent` union (schema shared conceptually with `packages/shared/protocol`; core owns its copy in `contracts`).
- **Open fanout-order guard:** core's settle-order fanout remains single-worker by design. The current `OFAPI_EVENT_WORKER_REPLICAS=1` config guard is not inter-process mutual exclusion, so a future core session must add a DB-backed singleton lock or redesign ordering before any multi-worker/HA deploy.
- **AI gateway — proxy-routed and production-enabled 2026-06-20; Desktop default still blocked on M7:** SSE streaming, page/chatter authorization, atomic quota reservation, request cost ceiling, usage/cost ledger, Anthropic provider adapter, stale recovery, and owner reporting are deployed. Direct production-host Anthropic egress returned `403 Request not allowed`, so core now routes provider calls through the existing page/account proxy infrastructure and fails closed when no proxy is configured. Controlled validation produced streamed SSE frames and a completed ledger row without prompt/output logging. Desktop Direct AI remains default until desktop Hub AI rollout is accepted and core handles missing terminal usage frames without confirming zero-cost completions.
- **OFAPI read gateway — shipped C6a 2026-06-19:** strict GET allowlist, chatter/page ACLs, central pacing and credit attribution; desktop opt-in transport described in §5.
- **OFAPI command gateway — C6b text/typing/unsend/mark-read/media-send live/enabled 2026-06-20:** controlled production text validation proved one attempt/one ledger row/terminal confirmation/platform id, payload-redacted responses/logs, webhook delivery, unsend, rollback, then staged re-enable with zero queued/in-flight/indeterminate rows. Typing validation proved one empty-payload advisory command and a zero-credit non-estimated ledger row. Unsend validation proved one DELETE attempt, one non-estimated ledger row, target platform id, projected delete webhooks, redacted API/log surfaces, and a staged rollback that parked a new unsend command unclaimed. Mark-read validation proved one empty-payload POST attempt, one non-estimated ledger row, null platform message id, redacted worker logs, and a staged rollback that parked a new mark-read command unclaimed. Media-send validation proved one bounded `send_media_message_v1` command with media ids/previews only, one ledger row, platform message id, unsend cleanup, projected webhooks, redacted logs/API, and staged rollback. Desktop Hub text rows use the core status machine; local text remains encrypted, retries create new lineage, and recovery never performs a body read. Desktop Hub typing uses `typing_active_v1` with empty payload and no recovery UI. Desktop Hub unsend uses `unsend_message_v1` and does not locally tombstone unless core confirms. Desktop Hub mark-read uses `mark_chat_read_v1` and does not zero local unread state unless core confirms. Desktop Hub media/PPV sends use `send_media_message_v1`; Direct was then rollback (later removed — writes Hub-only, 872c750). Local upload-from-disk is removed from the app surface and fails closed in app transport.

### 9.3 Desktop side
Settings hold core base URL + chatter API key (keychain), Hub-default OFAPI read/write transports (Direct rollback for reads; writes are Hub-only — `ofapiWriteTransport` = `z.literal('hub')`, 872c750), the legacy spend-sweep rollback, and AI generation transport (`direct` current/default, `hub` available after production proxy validation but not default until rollout acceptance). Fresh profiles prefill `https://gosling-agency.ru` as the Hub URL and schema v13 defaults new low-level outbox rows to Hub while preserving legacy rows' stamped Direct transport. In Hub mode, normal operation no longer needs a local OFAPI key for reads or supported writes; the local OFAPI key remains optional rollback. HubSync (§6.2), read/command transports (§5/§7), HubGateway (§8.6), profile sync, and direct-mode usage reporting consume core endpoints.

## 10. Data layer (SQLite, desktop)

Tables (all with `account_id` scoping; ids TEXT):
- `accounts(id, username, display_name, auth_state, raw JSON, updated_at)`
- `chats(account_id, chat_id, fan_name, unread_count, has_unread_tips, last_message_at, last_message_preview, last_message_is_sent_by_me, last_read_message_id, pinned, can_send_message, can_not_send_reason, raw JSON, updated_at)` — index `(account_id, last_message_at DESC)`
- `messages(account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain, price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to JSON, media JSON, deleted, raw JSON)` — PK `(account_id, chat_id, message_id)`, index `(account_id, chat_id, created_at DESC)`
- `fans(account_id, fan_id, username, name, custom_name, about, last_seen, spending JSON, subscription JSON, fetched_at)` — no notes store: human notes cut from v1 (PRD F5)
- `summaries(…)` per §8.5; `outbox(…)` per §7; `media_cache(url_hash, path, bytes, fetched_at)` (LRU, cap 2 GB)
- `settings(key, value JSON)` with `schema_version` + sequential migrations (legacy pattern); `usage_events` (hub upload QUEUE — drains once core is configured); `credit_log(day, purpose, used, requests)` (per-purpose since v7 — Activity panel; pre-v7 rows carry purpose `untagged`); `ai_spend_log(day, feature, runs, cache_hit_runs, inserted, *_tokens, cost_microusd, top_run_*)` (durable AI ledger — survives the usage_events drain); `thread_fetch_log(account_id, chat_id, fetched_at)` (v10 — per-fan stamp of the last thread tail fetch, written by every fetch path incl. empty threads; TTL source for the quick-look hydrate and the Spenders refresh queue, §6.1; never rendered per row)
- Retention (Stage 4 stop-loss ×10, D1): messages pruned per chat beyond 50,000 (configurable); spend rows kept 310 days (the read window stays 30 d); message-guard audit TTL 3,650 d (effectively disabled); summaries/outbox kept.

**Encryption at rest (decided 2026-06-10):** chatter machines hold fan PII and adult-content DM history, and OS full-disk encryption can't be assumed. The SQLite DB uses a SQLCipher-compatible build (e.g. `better-sqlite3-multiple-ciphers`) with a per-install random key held in the OS keychain (`safeStorage`); the media cache stores encrypted blobs, decrypted on the fly by the `media://` protocol handler. Settings include a "Purge local data" action (drops DB + media cache). Idle app-lock is a later-phase option.

## 11. Error taxonomy

Extend legacy `CG-*` registry (every error: code, user-facing message, recovery action; raw detail in debug):
- Ported: `CG-AUTH-01` (LLM key missing), `CG-FLOW-01..09` (no personality / unmapped / min-messages / busy / ping-active / compare-min / hi-locked), `CG-API-06` (unusable output), `CG-NET-02` (timeout).
- New: `CG-OF-01` OFAPI key invalid · `CG-OF-02` account authentication failed (re-auth CTA; a lone `accounts.session_expired` event is informational — OFAPI auto-recovers it) · `CG-OF-03` rate-limited (auto-backoff notice) · `CG-OF-04` credits exhausted · `CG-OF-05` restricted words (`textHighLight`) · `CG-OF-06` send unconfirmed (verifier UI) · `CG-OF-07` unsend window passed · `CG-OF-08` media processing/unavailable · `CG-HUB-01..` hub auth/connection.

## 12. Observability

- Status bar: credit balance/today, LLM per-op cost (ported spend summary), sends, mode, and honest sync freshness. In hub-live mode the primary age is the last hub push event; list verification remains visible as a secondary clock. In polling/offline mode the existing list-poll freshness remains primary.
- Dev/support-only sync override: Settings → Behavior → Advanced exposes persisted `hubModeOverride = auto | polling | hub` only in debug mode (or while non-auto). `auto` is the product path. `polling` skips the hub connection. `hub` keeps the polling fallback suspended while a configured hub is tested. The override never changes `autoReadChats` and never blocks the explicit user-open message-body read.
- Debug mode: pipeline profiling per operation (ported stage profiler incl. `llm-ttfb`, `llm-stream`), prompt inspector (exact blocks + cache flags), OFAPI request log (sanitized), fixture capture toggle.
- **Local rotating file logs (`apps/desktop/src/main/diagnostics/logger.ts`)** — main-process logger writing `userData/logs/app.log` (rotates to `app.1.log` at 2 MB) plus an in-memory ring (last 1000 records). Every record is passed through the shared secret redactor (`@chatgoose/shared/diagnostics/log`) before it is kept or written. Boot lifecycle, `uncaughtException`/`unhandledRejection`, hub configured/null, SSE live/degraded/auth-failed/stopped, polling suspended/resumed, fallback reasons, hub telemetry failures and IPC handler failures are recorded; the renderer feeds its own failures (render crashes via an `ErrorBoundary`, `window.onerror`/`unhandledrejection`, and every failed `invoke` at the bridge chokepoint) over `cmd:diag.logClient` so one timeline covers both processes.
- **Diagnostics export (`cmd:localData.exportDiagnostics`)** — ONE secrets-free `.json` file the user can send to support: app/runtime versions, settings (keyMeta stripped), sync/hub/credit status, hub received/applied/fallback/dropped counters split by event type (daily) plus lifetime totals persisted in the settings KV, last push, last fallback reason and fallback reasons by count, DB counts + schema version, outbox-audit COUNTS (no message text), an error-code summary, the chatter-scoped core credit summary when hub is configured (`GET /api/v1/ofapi/credits/summary`), and the recent log ring. The whole bundle is deep-redacted once more before write (`diagnostics/report.ts`), then revealed in the file manager. The crash `ErrorBoundary` exposes the same export as a one-click recovery action.

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
