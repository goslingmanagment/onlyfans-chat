> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — External Boundaries (the contract catalog)

Every wire boundary this app has with the outside world, described **from this side**
for a reviewer stitching three projects together. For each boundary: direction, where
in code, transport/auth, and exactly what data crosses. Implementation detail lives in
the owning subsystem doc; this doc is the contract index.

**The central fact after the migration:** there is effectively **one privileged
counterparty — the core hub** — and it is reached **only through the vendored
`@kernel/sdk`** (`packages/kernel-sdk`, mapped in `02`). The desktop holds no vendor
AI keys, assembles no prompts, and issues no direct-to-OnlyFans write. OnlyFans is
reached exclusively *through* core (reads via the read-gateway, writes via the command
outbox).

### Cross-cutting conventions on every boundary

- **Auth to core:** every hub call is `authorization: Bearer <credential>` plus an
  `x-client-version` header (`packages/shared/src/hub/client.ts:365-366,440-447`). The
  credential is the per-device token (`hubDeviceToken`, `agency_hub_device_…`) when
  present, else the legacy chatter key (`hubApiKey`, `agency_hub_core_…`)
  (`apps/desktop/src/main/hub/device-token.ts:70-78`).
- **Money units:** OFAPI/platform amounts are **dollars** (never mills); AI spend is
  integer **micro-USD** (`packages/shared/src/protocol/index.ts:267-269`,
  `packages/shared/src/activity/ai-spend.ts:2-4`).
- **ID namespaces:** OFAPI account id `acct_…` vs raw OnlyFans numeric id
  (`chat_id === fan.id`, string); core adds `pageLabel`
  (`packages/shared/src/protocol/index.ts:6-8`,
  `packages/shared/src/hub/page-mapping.ts`).
- **Every inbound payload is zod-validated at the trust boundary** before it is trusted
  (`packages/shared/src/protocol/index.ts`, `.../hub/client.ts`).

## Boundary quick-map

| # | Counterparty | Direction | Where (code) | Owner doc |
|---|---|---|---|---|
| 1 | core — OFAPI read-gateway (`/ofapi/read/*`) | desktop → core → OnlyFans | `main/ofapi/*`, `main/sync/*` | 05, 06 |
| 2 | core — command outbox (`/ofapi/commands`) | desktop → core → OnlyFans | `main/send/engine.ts` | 07 |
| 3 | core — AI feature lane (`/ai/features/:feature`, SSE) | desktop → core | `main/hub/ai-feature-gateway.ts`, `shared/hub/client.ts` | 08 |
| 4 | core — usage batch (`/ai-usage/batch`) | desktop → core | `shared/hub/usage-reporter.ts` | 11 |
| 5 | core — observation ingest (`/ingest/observations`) | desktop → core | `main/hub/acceptance-reporter.ts`, `main/harvest/index.ts` | 09, 11 |
| 6 | core — fan-profile (`/pages/:label/fans/:id/profile`) | desktop ↔ core | `main/hub/summary-hooks.ts` | 11 |
| 7 | core — pages / personas / credits summary | desktop ↔ core | `main/hub/{page-resolver,index}.ts` | 11 |
| 8 | core — SSE stream v2 + snapshot (`/events/v2/*`) | core → desktop | `main/sync/hub-sync.ts` | 06 |
| 9 | core — device-token auth (`/auth/*`) | desktop → core | `main/hub/device-token.ts` | 04 |
| 10 | Auto-update feed (generic HTTPS) | feed → desktop | `main/platform/updater.ts`, `electron-builder.yml` | 04 |
| 11 | OS: keychain / notifications / badge / `media://` / navigation | desktop ↔ OS/renderer | `main/secrets`, `main/platform`, `main/media` | 04, 09 |
| 12 | Local encrypted SQLite + media cache | desktop ↔ disk | `main/db/*`, `main/media/*` | 09 |
| 13 | Inbound OFAPI webhooks | OFAPI → **core** (not desktop) | `tests/fixtures/webhooks/*` | — |
| 14 | AI providers (Anthropic/OpenRouter) **direct** | — | **removed** | 08 |

---

## 1. core — OFAPI read-gateway (all platform reads)

- **Direction:** desktop → core → OnlyFans. **Transport:** the hand-written OFAPI HTTP
  client (`apps/desktop/src/main/ofapi/client.ts`) with its base URL rewritten to core's
  gateway by `buildHubOfApiReadBaseUrl(hubBaseUrl)` →
  `<hubBaseUrl>/api/v1/ofapi/read` (`apps/desktop/src/main/ofapi/transport.ts:8-14`),
  which maps onto the kernel route `ofapiReadGateway GET /api/v1/ofapi/read/*`
  (`packages/kernel-sdk/dist/operations.js`). Wired in the composition root at
  `apps/desktop/src/main/index.ts:427-435` (auth error → `CG-HUB-01`, timeout 75s).
- **Auth:** Bearer credential (device token / chatter key). A gateway 401 is rebadged
  from `CG-OF-01` to `CG-HUB-01` (`apps/desktop/src/main/ofapi/client.ts:531-538`).
- **What crosses:** the OFAPI read surface, expressed as OFAPI paths under the gateway
  prefix — `/accounts`, `/whoami`, `/{acct}/chats`, `/{acct}/chats/{chatId}/messages`,
  `/{acct}/users/{username}`, `/{acct}/users/list`, `/{acct}/transactions`,
  `/{acct}/fans/all`, `/{acct}/fans/active`, `/{acct}/user-lists[/{id}/users]`,
  `/{acct}/media/vault[/lists]`, `/{acct}/chats/{chatId}/media`. Responses are
  zod-validated at the boundary (`apps/desktop/src/main/ofapi/schemas.ts`). OFAPI
  credit/rate telemetry rides response `_meta` + `x-ofapi-*` headers
  (`apps/desktop/src/main/ofapi/credit-meter.ts:100-119`).
- **The direct path is fail-closed:** `createOfApiTransportClient`
  (`apps/desktop/src/main/ofapi/transport.ts:35-78`) forwards the 15 read ops and throws
  before any network call on every write. The direct `OFAPI_BASE_URL =
  'https://app.onlyfansapi.com/api'` (`apps/desktop/src/main/ofapi/client.ts:60`)
  survives only as the client default and is exercised only by env-gated live tests.
  Detail: `05`, `06`.

## 2. core — command outbox (all platform writes)

- **Direction:** desktop → core → OnlyFans. **Transport:** the `@kernel/sdk` command
  client, called from the send engine (`apps/desktop/src/main/send/engine.ts`).
  Endpoints: `createOfapiCommand POST /api/v1/ofapi/commands`,
  `getOfapiCommand GET /api/v1/ofapi/commands/:commandId`,
  `cancelOfapiCommand POST /api/v1/ofapi/commands/:commandId/cancel`
  (`packages/kernel-sdk/dist/operations.js`).
- **What crosses:** an idempotent command envelope keyed by `clientCommandId =
  outbox.localId`, with a `kind` ∈ `send_text_message_v1`, `send_media_message_v1`
  (PPV: `{text, price, mediaFiles, previews}`), `unsend_message_v1`,
  `mark_chat_read_v1`, `typing_active_v1`
  (`apps/desktop/src/main/send/engine.ts:346-383,461-516,850-860`). Command status
  polling reads back `queued|in_flight|confirmed|failed_retryable|failed_terminal|
  indeterminate|cancelled`.
- **Safety invariant:** exactly one intake attempt per claimed row, never a blind
  re-submit; an indeterminate outcome becomes `CG-OF-06` and is promoted only by the
  verifier on evidence — a duplicate DM is treated as worse than a missed one. Detail:
  `07`.

## 3. core — AI feature lane (all generation, SSE)

- **Direction:** desktop → core (streamed response). **Transport:**
  `client.streamAiFeature` (SDK helper `streamAiFeature`) →
  `POST /api/v1/ai/features/:feature`, driven from
  `apps/desktop/src/main/hub/ai-feature-gateway.ts:69-93` through
  `packages/shared/src/hub/client.ts:647`.
- **What the desktop sends (refs only — no prompt, no transcript, no context):** a strict
  request body `{ clientRequestId, pageLabel, platform:'onlyfans', conversationRef
  (=chatId), fanRef?, personaKey?, replyTone?, replyMode?, draftText?, messageCount?,
  isRegeneration? }` (`aiFeatureStreamBodySchema`, `packages/kernel-sdk/dist/contracts/routes.d.ts`;
  built in `ai-feature-gateway.ts`). Prompts, models, provider keys, and context are all
  **core config** — none leave the desktop
  (`apps/desktop/src/main/ai/coordinator.ts:670-674`).
- **What core streams back (`ai` SSE frames):** a discriminated union on `type` —
  `meta { requestId (generation ref), clientRequestId, feature, pageLabel, model,
  provider:'anthropic'|'openrouter', providerResponseId, quota }`,
  `content_delta { text }`, `reasoning_delta { text }`,
  `usage { usage{inputTokens,outputTokens,cacheWriteTokens,cacheReadTokens,
  costMicroUsd,costApproximate}, providerResponseId, cacheHit }`,
  `error { code, message, retryAfterMs }`, `done { stopReason }`
  (`packages/shared/src/hub/client.ts:667-693`; SDK `aiGatewayStreamFrameSchema`).
- **Connection model:** single SSE connection, no auto-reconnect (server bounds lifetime
  ~15 min); a missing `done` frame → `HubError('invalid-response')`; caller-abort surfaces
  as a plain `Error('Operation aborted')` (`packages/shared/src/hub/client.ts:705-710`).
  The raw `aiGatewayStream POST /api/v1/ai/gateway/stream` exists in the SDK but is
  SDK-excluded and not the desktop's lane. Detail: `08`, `02`.

## 4. core — AI usage batch (drain-only telemetry)

- **Direction:** desktop → core. **Transport:** `postUsageBatch` →
  `aiUsageBatch POST /api/v1/ai-usage/batch`, via the persisted queue
  `packages/shared/src/hub/usage-reporter.ts`.
- **Status after migration:** the coordinator **no longer writes `usage_events`** — the
  gateway usage frame (boundary 3) is the authoritative spend ledger. This queue exists
  only to **drain rows parked by pre-cutover app versions**; the SDK marks the route
  deprecated ("gateway ledger is authoritative"). Batches ≤100 events, `completedAt`
  clamped to server time; HTTP-400 quarantines (never blind-retry). Detail: `11`.

## 5. core — observation ingest (acceptance + one-time harvest)

- **Direction:** desktop → core. **Transport:** `postIngestObservations` →
  `ingestObservations POST /api/v1/ingest/observations`.
- **Two producers cross this boundary:**
  - **AI-acceptance events** — `{ clientEventId: uuidV5(operationId:action:at),
    kind:'ai_acceptance', observedAt, payload:{ operationId, requestId/generationRef?,
    feature, action:'shown'|'copied'|'inserted'|'sent', accountId, conversationId,
    edited? } }` (`apps/desktop/src/main/hub/acceptance-reporter.ts:86-101`).
  - **Revision-aware local-history harvest** — deterministic-id observation rows for the local
    tables `messages, fan_transactions, outbox, message_guard_events, usage_events,
    ai_spend_log, credit_log`, with v2 ids binding machine, table, unambiguous natural key,
    source schema, and canonical content hash. Persistent SQLite revision triggers and an
    uploaded-fingerprint ledger make same-row UPDATEs and rowid reuse visible without
    re-uploading an already-captured revision. Detail: `09`, `11`.

## 6. core — fan-profile (fan summary sync)

- **Direction:** desktop ↔ core (get + put). **Transport:** `getFanProfile GET` /
  `putFanProfile PUT /api/v1/pages/:pageLabel/fans/:platformUserId/profile`
  (`apps/desktop/src/main/hub/summary-hooks.ts`;
  `packages/shared/src/hub/client.ts:481-508`).
- **What crosses:** the AI fan-summary body (≤`HUB_PROFILE_MAX_CHARS = 50_000`), synced
  with local `summaries` rows; a hub profile newer than local is adopted, `hub_sync_state`
  tracked. `getFanProfile` returns **null on 404** as a domain result, not an error.
  Detail: `11`.

## 7. core — pages, personas, credits summary

- **Direction:** desktop ↔ core. **Transport / what crosses:**
  - `pages GET /api/v1/pages` — the assigned page list, cached 5 min, used to map
    `acct_…` → `pageLabel` (`apps/desktop/src/main/hub/page-resolver.ts:9,58-62`;
    `packages/shared/src/hub/page-mapping.ts`).
  - Persona CRUD — `aiPersonasList GET`, `aiPersonaUpsert PUT /api/v1/ai/personas/:key`,
    `aiPersonaArchive DELETE /api/v1/ai/personas/:key`
    (`apps/desktop/src/main/hub/index.ts`). Only persona **keys** cross the AI lane;
    persona bodies are managed in core.
  - `ofapiCreditsChatterSummary GET /api/v1/ofapi/credits/summary` — the credits/runway
    summary card. Detail: `11`.

## 8. core — SSE event stream v2 + snapshot (the live feed)

- **Direction:** core → desktop. **Transport:** a fetch-streaming SSE consumer
  (`apps/desktop/src/main/sync/hub-sync.ts`). Default paths (Stage 24):
  `HUB_V2_SSE_PATH = /api/v1/events/v2/stream`, `HUB_V2_SNAPSHOT_PATH =
  /api/v1/events/v2/snapshot` (`hub-sync.ts:26-31`). A v1 path
  (`/api/v1/events/stream` + `/api/v1/events/snapshot`) is retained only as a
  settings-file fallback.
- **What crosses (v2):** `event: domain` frames — `domainEventFrameSchema { accountId,
  accountSeq, type (open string), occurredAt, data, fanRef?, conversationRef?,
  messageRef?, accountRef?, payload? }` — canonicalized to local `SyncEvent`s by
  `mapDomainFrame` (`packages/shared/src/protocol/index.ts:487-563`); and `event:
  ephemeral` frames (typing/presence). The local `SyncEvent` union has 10 members
  (`chatListUpdated, messageReceived, messageSent, ppvUnlocked, tipReceived, presence,
  typing, accountAuthChanged, readStateChanged, messageDeleted`).
- **Resume / gap recovery:** v2 resumes with an opaque per-account `?cursor=…` persisted
  under `hubSync.v2Cursor`, checkpointed **after** handling; a `409` +
  `domainSnapshotRequiredSchema` (version 2) triggers a cursor-handshake snapshot then a
  polling head-refresh reconciliation (`hub-sync.ts:342-378`). Status goes `live` on
  first bytes; unmapped/unknown domain types still checkpoint (forward-compat). Detail:
  `06`, `02` (SDK `subscribeSyncEvents`/`subscribeDomainEvents`).

## 9. core — device-token auth

- **Direction:** desktop → core. **Transport / what crosses:** a one-time exchange —
  `login POST /api/v1/auth/login` with `{username,password}`, capturing the session
  cookie, then `authIssueDeviceToken POST /api/v1/auth/device-tokens` (`{label}`) which
  returns the device token stored in keychain secret `hubDeviceToken`; a best-effort
  `logout` follows (`apps/desktop/src/main/hub/device-token.ts:30-64`). The token
  (`agency_hub_device_…`, sliding 90-day) becomes the Bearer credential on all
  subsequent hub calls. Connectivity is probed via `me GET /api/v1/auth/me`
  (`apps/desktop/src/main/hub/test-connection.ts`). Detail: `04`.

## 10. Auto-update feed

- **Direction:** feed → desktop. **Transport:** electron-updater **generic** provider
  over HTTPS, `url: https://45-8-230-111.sslip.io/u/bffe2540bd2b7e87bd9b88e3/`
  (`apps/desktop/electron-builder.yml`). Builds are unsigned, so the feed host is the
  trust anchor.
- **What crosses:** `latest.yml` + the NSIS installer + blockmap. Update checks happen
  **only on Windows packaged builds** (`apps/desktop/src/main/platform/updater.ts:19-21`),
  at launch + every 4h; download is automatic, install on quit. Detail: `04`.

## 11. OS integration

- **Keychain:** Electron `safeStorage` (Keychain/DPAPI), one encrypted file per secret,
  no plaintext fallback (`apps/desktop/src/main/secrets/keychain.ts:88-95`). Secrets:
  `hubApiKey`, `hubDeviceToken`, `dbKey`, `mediaCacheKey`; the retired vendor/OFAPI keys
  are actively deleted on every boot (`keychain.ts:49-56`).
- **`media://` protocol:** a privileged, non-standard scheme; the renderer only ever
  references `media://<sha256>` opaque tokens minted in main, resolved against an
  allowlist (onlyfans/fansapi https only) with an encrypted disk cache
  (`apps/desktop/src/main/media/protocol.ts`). Detail: `09`.
- **Notifications / badge / navigation / single-instance:** informational silent
  notifications with **no click handler**; a Windows overlay-icon / macOS dock unread
  badge; all in-window navigation and `window.open`/webview are denied — allowed
  external links go to the OS browser only (`apps/desktop/src/main/platform/*`,
  `apps/desktop/src/main/notifications.ts`). Detail: `04`.

## 12. Local encrypted storage

- **Direction:** desktop ↔ disk. **SQLite** via `better-sqlite3-multiple-ciphers`,
  SQLCipher-encrypted with a 32-byte keychain-held random key; file DBs must be
  encrypted (`apps/desktop/src/main/db/database.ts:39-52`). **Media cache:** AES-256-GCM
  blobs, 2 GB LRU (`apps/desktop/src/main/media/cache.ts`). These are the two on-disk
  boundaries; nothing here leaves the machine except through the ingest lanes (5).
  Detail: `09`.

## 13. Inbound OFAPI webhooks (land on core, not desktop)

- OFAPI's real-time webhooks are delivered to **core**, not to the desktop — the desktop
  has no inbound HTTP server. The only trace in this repo is the anonymized capture
  corpus `tests/fixtures/webhooks/*` (built by `scripts/spikes/anonymize-webhooks.mjs`)
  used to shape core's SSE fanout, which the desktop then consumes via boundary 8.

## 14. AI providers direct — removed

- There is **no direct AI-provider boundary**. No `@anthropic-ai/sdk`/`openai` package is
  imported anywhere in `apps/desktop/src` or `packages/shared/src`; no API keys or prompt
  files exist. Vendor names survive only as string literals (error wording, model-id
  defaults, redaction regexes). CI pins this:
  `apps/desktop/tests/security/ai-cutover-gates.test.ts` fails on any `api.anthropic.com`/
  `openrouter.ai` reference, any import of a prompt/provider module, or any legacy gateway
  factory. Every generation goes through boundary 3. Detail: `08`.
