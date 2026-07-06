> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# External Boundaries — Contract Catalog

## Scope

This document is the wire-level contract catalog for **ChatGoose Desktop** (the Electron app in `apps/desktop` plus the pure-TS `packages/shared`). It enumerates every boundary this project has with the outside world, described **from this side**: what the desktop calls, what it exposes, and exactly what data crosses each edge — endpoints, HTTP methods, authentication, request/response shapes (anchored to the zod schemas that model them), headers, and side effects.

Counterparties covered: (1) **OFAPI** `onlyfansapi.com` in Direct mode, (2) the **Core Hub** (a.k.a. Agency Hub / "ChatMuse", the Fastify+Postgres backend at `~/code/core`, not in this repo) which also fronts OFAPI reads/writes and can proxy AI, (3) **AI providers** Anthropic and OpenRouter, (4) the **auto-update feed**, (5) **OS/platform** integration (keychain, notifications, badge, single-instance, custom `media://` protocol, navigation guard), (6) the **local encrypted persistence** boundary, and (7) **inbound OFAPI webhooks** (received by Core, not desktop).

Boundary *mechanics* (how selection/wiring happens, send-engine internals, sync internals, DB schema, renderer bridge) belong to neighbor docs and are cross-referenced rather than duplicated: `04-main-bootstrap-ipc-settings.md` (IPC/preload/settings/keychain), `05-ofapi-client.md` (Direct client internals), `06-sync-and-reads.md` (read/sync selection + auto-read), `07-send-engine-outbox.md` (write path), `08-ai-pipeline.md` (AI pipeline), `09-data-model-storage.md` (DB schema + media cache), `11-hub-monetization-activity.md` (spend metering, page resolution, spenders). `03-shared-package.md` owns the structural map of `packages/shared`.

### ID namespaces (load-bearing across every boundary)

Two identifier namespaces cross these boundaries and must never be mixed (stated at `packages/shared/src/protocol/index.ts:6-8`):

- **OFAPI account id** — `acct_<hex>` (e.g. `acct_01000000…`). Identifies a *connected OnlyFans account* to OFAPI and Core. Regex-enforced in the command outbox: `/^acct_[A-Za-z0-9]+$/` (`packages/shared/src/hub/client.ts:233`).
- **Raw OnlyFans numeric id** — `chat_id === fan.id` (a fan/conversation), serialized as a string on the wire (`/^[0-9]{1,30}$/` in the outbox, `client.ts:234`). OFAPI `ofapiUserSchema.id` is a `number` (`apps/desktop/src/main/ofapi/schemas.ts:95`); the protocol/IPC layer uses string ids.

Core adds a third: its own integer **`pageId`** and string **`pageLabel`**, resolved from an `acct_…` id via username matching (see §2.7). OFAPI amounts are **dollars** (never mills) — `ofapiTransactionSchema.amount` comment at `schemas.ts:229`.

---

## 1. OFAPI Direct (`onlyfansapi.com`)

The hand-written OFAPI HTTP client. Reads may run Direct; **writes are structurally disabled in Direct mode** (see §1.5). Internals (pagination, sanitizer, fixture capture) are owned by `05-ofapi-client.md`; here is the contract surface.

### 1.1 Base URL, configuration, transport wrapping

| Aspect | Value / anchor |
|---|---|
| Direct base URL | `https://app.onlyfansapi.com/api` — `OFAPI_BASE_URL`, `apps/desktop/src/main/ofapi/client.ts:60` |
| Base URL override | `OfApiClientOptions.baseUrl` (`client.ts:94`); trailing slash stripped (`client.ts:371`) |
| Client factory | `createOfApiClient(options)` — `client.ts:370` |
| Direct instantiation | `apps/desktop/src/main/index.ts:397-408` (`directClient`), only when an `ofapiKey` secret exists |
| Request timeout | `OFAPI_REQUEST_TIMEOUT_MS` (shared constant); `requestTimeoutMs` override; multipart upload uses `UPLOAD_TIMEOUT_MS = 5 min` (`client.ts:81`) |

Every operation returned by `createOfApiClient` is re-wrapped by `createOfApiTransportClient(readClient)` (`apps/desktop/src/main/ofapi/transport.ts:34`) before use (`index.ts:447`). That wrapper (the "C6 custody bridge") **passes all read methods straight through** but replaces every write method with a fail-closed throw (§1.5).

### 1.2 Authentication

- **Direct:** `Authorization: Bearer <ofapi_key>` plus `Accept: application/json` (`client.ts:439-443`). The `ofapiKey` secret comes from the OS keychain (`SECRET_NAMES` includes `ofapiKey`, `apps/desktop/src/main/secrets/keychain.ts:11`).
- **Via hub read-gateway (default):** the *same* `OfApiClient` code is pointed at the hub read base URL with the **chatter key** as the bearer, and `authErrorCode: 'CG-HUB-01'` so a 401 is reported as a hub-auth failure rather than an OFAPI-key failure (`index.ts:427-435`, remap logic at `client.ts:531-538`). Base URL is built by `buildHubOfApiReadBaseUrl` (`transport.ts:7`): `<hubBaseUrl>/api/v1/ofapi/read`. See §2.3.

### 1.3 Operations (full list)

All account-scoped paths are prefixed `/<acct_…>` (`accountPath`, `client.ts:593`). Account-scoped responses are unwrapped from the `{data,_meta,_pagination}` envelope (`ofapiEnvelopeSchema`, `schemas.ts:15`); `/accounts` and `/whoami` are **not** enveloped (bare array / bare object, `client.ts:641,648`).

| Method / interface | HTTP | Path | Response schema (in `schemas.ts` unless noted) | Retry |
|---|---|---|---|---|
| `listAccounts` | GET | `/accounts` (bare array) | `z.array(ofapiAccountSchema)` (`:25`) | idempotent |
| `whoami` | GET | `/whoami` (bare object) | `ofapiWhoamiSchema` (`:49`) | idempotent |
| `listChats` | GET | `/{acct}/chats` | `z.array(ofapiChatSchema)` (`:169`) + `_pagination.next_page` | idempotent |
| `listMessages` | GET | `/{acct}/chats/{chatId}/messages` | array of `ofapiMessageSchema` (`:187`), tolerant per-row (`parseMessageList`, `client.ts:572`) | caller-set (`params.retry`) |
| `getMessage` | GET | `/{acct}/chats/{chatId}/messages/{messageId}` | `ofapiMessageSchema` | idempotent |
| `getUserByUsername` | GET | `/{acct}/users/{username}` | `ofapiUserSchema` (`:94`) | idempotent |
| `getUsersByIds` | GET | `/{acct}/users/list?ids=a,b,…` (≤10) | `ofapiUsersByIdSchema` — `record(userId → user)` (`:116`) | idempotent |
| `listTransactions` | GET | `/{acct}/transactions` | `ofapiTransactionsDataSchema` (`:250`) | idempotent |
| `listFansAll` | GET | `/{acct}/fans/all` | `ofapiFansDataSchema` (`:118`) | idempotent |
| `listFansActive` | GET | `/{acct}/fans/active` (`filter[online]=1`) | `ofapiFansDataSchema` | idempotent |
| `listUserLists` | GET | `/{acct}/user-lists` | `ofapiUserListsDataSchema` (`:142`) | idempotent |
| `listUserListUsers` | GET | `/{acct}/user-lists/{listId}/users` (≤100) | `ofapiUserListUsersDataSchema` (`:150`) | idempotent |
| `listVaultMedia` | GET | `/{acct}/media/vault` (≤100) | `ofapiVaultMediaDataSchema` (`:296`) | idempotent |
| `listVaultLists` | GET | `/{acct}/media/vault/lists` | `ofapiVaultListsDataSchema` (`:316`) | idempotent |
| `getVaultMedia` | GET | `/{acct}/media/vault/{mediaId}` | `ofapiVaultMediaSchema` (`:276`) | idempotent |
| `listChatMedia` | GET | `/{acct}/chats/{chatId}/media` | `ofapiChatMediaDataSchema` (`:338`) | idempotent |
| `getUploadStatus` | GET | `/{acct}/media/uploads/{uploadId}/status` (bare object, free) | `ofapiUploadStatusSchema` (`:358`) | idempotent |
| `uploadVaultMedia` | POST (multipart) | `/{acct}/media/vault` | sync 200 → `ofapiVaultMediaSchema`; async 202 → `ofapiVaultUploadStartedSchema` (`:348`) | **none** |
| `sendMessage` | POST (json) | `/{acct}/chats/{chatId}/messages` | `ofapiSentMessageSchema` (`:203`) | **none** |
| `deleteMessage` (unsend) | DELETE | `/{acct}/chats/{chatId}/messages/{messageId}` | `ofapiSuccessDataSchema` (`:212`) | **none** |
| `likeMessage` | POST | `…/messages/{messageId}/like` | `ofapiLikeDataSchema` (`:217`) | **none** |
| `unlikeMessage` | DELETE | `…/messages/{messageId}/unlike` | `ofapiLikeDataSchema` | **none** |
| `startTyping` | POST | `/{acct}/chats/{chatId}/typing` (0 credits, fire-and-forget) | `{success}` (envelope unwrapped, value discarded) | **none** |
| `markChatRead` | POST | `/{acct}/chats/{chatId}/mark-as-read` | `ofapiSuccessDataSchema` | **none** |

**Query parameters of note:**
- `listChats` always sends `skip_users=none` unless overridden (`client.ts:661`; live default differs from documented default).
- `listMessages` uses `skip_users=all` by default (`client.ts:687`); `first_id` (backward, order=desc, boundary-inclusive) and `last_id` (ascending tail, order=asc) are mutually exclusive (`client.ts:668-677`).
- `listFans*` sends **Laravel/Spatie bracket** query keys `filter[online]=1` and `filter[total_spent]=<dollars>` on the wire (not the dotted form the OpenAPI shows) — extended comment at `client.ts:617-628`.
- `getUsersByIds` joins ids with commas; caps at `USERS_MASS_LIST_MAX_IDS = 10` (`client.ts:61,714`).
- `uploadVaultMedia` sends multipart `file` (a `Blob` of raw bytes) + optional `async=true`; caps at `VAULT_UPLOAD_MAX_BYTES = 100 MB` (Cloudflare, `client.ts:69,870`).

**Send request body** (`sendMessage`, `client.ts:913-922`): `{ text, replyToMessageId?, lockedText?, price?, mediaFiles?[], previews?[] }`. `price` is dollars (0 or 3–200; non-zero requires media). `mediaFiles`/`previews` are `ofapi_media_…` ids or OF vault ids.

### 1.4 Key response-shape facts (field-level)

- `ofapiAccountSchema` (`schemas.ts:25`): `id` (`acct_…`), `is_authenticated`, `authentication_progress`, `display_name`, `onlyfans_id`, `onlyfans_username`, `onlyfans_user_data.{id,name,username,avatar}`. `accountNeedsReauth()` = `is_authenticated === false` (`schemas.ts:45`).
- `ofapiUserSchema` (`schemas.ts:94`): `id:number` (raw OF id), `name`, `username`, `displayName`, `avatar`, `avatarThumbs.{c50,c144}`, `about`, `lastSeen`, `joinDate`, `isVerified/isBlocked/isRestricted`, `canReceiveChatMessage`, `subscribedOn(Data)` where `ofapiSubscribedOnDataSchema` (`:74`) carries `totalSumm`, `subscribesSumm`, `tipsSumm`, `messagesSumm`, `postsSumm`, `streamsSumm`, `subscribeAt`, `expiredAt`, `price`, etc.
- `ofapiChatSchema` (`schemas.ts:169`): `unreadMessagesCount`, `hasUnreadTips`, `canSendMessage`, `lastMessage` (`ofapiChatLastMessageSchema` `:158`), `lastReadMessageId` (number **or** numeric string — live divergence `:177`), `fan` (full only with `skip_users=none`).
- `ofapiMessageSchema` (`schemas.ts:187`) extends the shared `ofapiChatMessageSchema` (from `@chatgoose/shared`) with `tipText` and `fromUser.id`.
- `ofapiSentMessageSchema` (`schemas.ts:203`) adds `isSentByMe`, `cancelSeconds` (server-computed ≈24 h unsend countdown), `queueId`.
- `ofapiUserListSchema` (`schemas.ts:131`): custom list ids arrive as **strings** (`'1247248934'`), built-ins as words (`'fans'`, `'recent'`); names are HTML-entity-encoded — noted `schemas.ts:123-129`. **Strictly read-only**: the client exposes no write to OnlyMonster lists (`client.ts:205-207`).
- `ofapiVaultMediaSchema` (`schemas.ts:276`): `files.{full,thumb,preview,squarePreview}` variants (each `{url,width,height,size}`), `isReady`, `counters.{likesCount,tipsSumm}`.

### 1.5 Direct-vs-Hub permission gate (writes fail closed)

`createOfApiTransportClient` (`transport.ts:34-77`) replaces the seven write methods so a Direct write **never leaves the process**:
- `sendMessage`, `deleteMessage`, `likeMessage`, `unlikeMessage`, `startTyping`, `markChatRead` → throw `OfApiError('CG-HUB-02', …)` "Direct OFAPI writes are disabled. Use Agency Hub commands…" (`transport.ts:15-20`).
- `uploadVaultMedia` → throw `OfApiError('CG-OF-08', …)` "Local file upload into Vault is disabled." (`transport.ts:22-27`).

Settings mirror this as a hard invariant: `ofapiWriteTransport` is `z.literal('hub')` (`apps/desktop/src/main/settings/store.ts:178`). `ofapiReadTransport` is `z.enum(['direct','hub'])` defaulting to `'hub'` (`store.ts:176,236`). All actual OnlyFans writes go through the Core command outbox (§2.4) — see `07-send-engine-outbox.md`.

### 1.6 Credit accounting & telemetry headers

`credit-meter.ts` parses both response **headers** and the parsed body `_meta` on every response (`client.ts:504-509` feeds it; `createCreditMeter` at `credit-meter.ts:64`):

| Source | Field |
|---|---|
| Header | `x-ofapi-credits-used` → per-call credits (`credit-meter.ts:113`) |
| Header | `x-ofapi-credits-balance` → running balance (`:115`) |
| Header | `x-rate-limit-remaining-minute` → `rpmRemaining` (`:117`) |
| Body `_meta._credits` | `{used, balance}` fallback (`responseMetaSchema`, `:10`) |
| Body `_meta._rate_limits` | `{remaining_minute, limit_minute}` fallback (`:17`) |

Each request carries an `OfApiPurpose` tag (shared enum) so the meter keeps per-purpose `{requests, credits}` tallies (`credit-meter.ts:29-33`); daily counters reset on UTC day flip and are persisted to `credit_log` by the composition root (`index.ts:485-505`). The published `CreditMeterSnapshot` is `{balance, usedToday, rpmRemaining, utcDay, usedTodayByPurpose}` (`:35-43`). Upload cost is pre-estimated at **3 credits/decimal-MB** (`UPLOAD_CREDITS_PER_MB`, `client.ts:72`; `estimateUploadCredits`, `:75`).

### 1.7 Rate limiting & retry policy

`rate-limiter.ts` throttles well under plan RPM: token bucket `DEFAULT_RPM=300`, `DEFAULT_BURST=20`, per-account concurrency 4, global 12 (`:16-19`), plus a `'user'`/`'normal'` priority queue. Retry policy is **explicit per request**:
- `'idempotent'` (GETs): 429 backoff honoring `Retry-After` up to a 60 s cap (floors `1/2/4/8 s`, `RATE_LIMIT_BACKOFF_MS`), and ≤3 retries on 5xx (`SERVER_ERROR_RETRY_DELAYS_MS = 1/2/4 s`) — `rate-limiter.ts:228-262`.
- `'none'` (all writes + uploads): **exactly one attempt**; 429/5xx/timeout surface immediately (`rate-limiter.ts:184-206`). OFAPI has **no idempotency keys**, so a retried send could double-message a fan — the outbox owns recovery (`client.ts:1-7`).

### 1.8 Documented side effect: GET marks-read

`GET /{acct}/chats/{chatId}/messages` **marks the chat read on OnlyFans** as a side effect (noted in project memory "OFAPI GET marks read"). The desktop gates background body-reads (poll deltas, sweeps, media polling) behind `autoReadEnabled` (default OFF, `index.ts:540-542`) so OnlyFans never auto-reads a chat without an explicit user open. Semantics owned by `06-sync-and-reads.md`.

### 1.9 Error taxonomy

`errors.ts` maps non-2xx and network failures into the `CG-*` registry via `OfApiError extends CgError` (`errors.ts:56`). Decision order is load-bearing (`mapOfApiHttpError`, `:132`):

| HTTP / condition | Code |
|---|---|
| 401 | `CG-OF-01` (or `CG-HUB-01` when `authErrorCode` is set for the hub gateway) |
| 429 (or wrapped upstream 429) | `CG-OF-03` |
| 402 / "insufficient credits" phrases | `CG-OF-04` |
| restricted words (`textHighLight` / "restricted words") | `CG-OF-05`, carries `textHighLights[]` |
| session/auth phrases or wrapped upstream 401 | `CG-OF-02` (OnlyFans session expired; our key is fine) |
| 422 | `CG-APP-01` with `validationErrors` map |
| upstream ≥500 / 5xx / network fail | `CG-NET-01`; timeout/abort → `CG-NET-02` |

OnlyFans-origin failures arrive wrapped as `{error:"ONLYFANS_COM_ERROR", …, onlyfans_response:{status, body}}` (`onlyfansResponseSchema`, `errors.ts:12`; live fixture `tests/fixtures/ofapi/send-message-restricted-400.json`). Shape drift on a 2xx body → `ofApiShapeError` (`CG-APP-01`, `:227`).

---

## 2. Core Hub (Agency Hub / "ChatMuse")

Two independent client codepaths talk to Core: the platform-pure **REST client** (`packages/shared/src/hub/client.ts`) and the **SSE consumer** (`apps/desktop/src/main/sync/hub-sync.ts`). Core is documented here only as a boundary; its internals live in the `~/code/core` repo.

### 2.1 Base URL, configuration, authentication

| Aspect | Value / anchor |
|---|---|
| Default base URL | `https://gosling-agency.ru` — `DEFAULT_AGENCY_HUB_BASE_URL`, `packages/shared/src/constants.ts:81` |
| Allowed values | prod origin **or** a loopback dev URL only (`hubBaseUrlSchema`, `settings/store.ts:139-148`) |
| Setting | `hubBaseUrl` (nullable), `settings/store.ts:174` |
| Auth | `Authorization: Bearer <chatter API key>` — the `hubApiKey` secret (`agency_hub_core_…`), `keychain.ts:11`; sent at `client.ts:611`, `hub-sync.ts:283`, `test-connection.ts:44` |
| REST client factory | `createHubClient(options)`, `client.ts:576` — requires non-empty `baseUrl` + `apiKey` |
| Composition | `createHubModule` (`apps/desktop/src/main/hub/index.ts:65`) builds client + usage reporter + page resolver + AI gateway; rebuilt on config change via `reconfigure()` (`hub/index.ts:156`) |

The hub base URL is host-locked at the settings boundary — the desktop refuses to point the chatter key at an arbitrary host (defense against key exfiltration).

### 2.2 REST client operations (`packages/shared/src/hub/client.ts`)

All paths are under `<baseUrl>`. Request builder at `client.ts:600`; 401/403 → `HubError('auth')` = `CG-HUB-01`; 400 → `HubError('bad-request')` = `CG-HUB-02` (never blind-retried); other non-2xx → `HubError('http')`. Timeouts are per-call constants (`client.ts:22-32`).

| Method | HTTP | Path | Request body | Response schema |
|---|---|---|---|---|
| `listPages` | GET | `/api/v1/pages` | — | `z.array(hubPageSchema)` (`:134`) |
| `getFanProfile` | GET | `/api/v1/pages/{pageLabel}/fans/{fanId}/profile` | — (404 → `null`) | `hubFanProfileResponseSchema` (`:161`) |
| `putFanProfile` | PUT | same profile path | `{ body: string }` (1–50 000 chars, `HUB_PROFILE_MAX_CHARS`) | `hubProfileVersionSchema` (`:150`) |
| `postUsageBatch` | POST | `/api/v1/ai-usage/batch` | `{ events: HubUsageEvent[] }` (1–100) | `hubUsageBatchResponseSchema` (`:175`) |
| `getOfapiCreditsSummary` | GET | `/api/v1/ofapi/credits/summary` | — | `hubOfapiCreditsSummarySchema` (`:196`) |
| `createOfapiCommand` | POST | `/api/v1/ofapi/commands` | `HubOfapiCommandCreateRequest` (`:287`) | `hubOfapiCommandResponseSchema` (`:347`) |
| `getOfapiCommand` | GET | `/api/v1/ofapi/commands/{commandId}` | — | same command response |
| `cancelOfapiCommand` | POST | `/api/v1/ofapi/commands/{commandId}/cancel` | — | same command response |
| `streamAiGateway` | POST | `/api/v1/ai/gateway/stream` | `HubAiGatewayStreamRequest` (`:441`) | SSE `event: ai` frames (§2.5) |
| identity probe | GET | `/api/v1/auth/me` | — | `authMeSchema` (`test-connection.ts:13`) |

`getServerTimeOffsetMs()` (`client.ts:967`) exposes server−local ms derived from each response's `Date` header (`recordServerTime`, `:589`) — feeds the usage reporter's `completedAt` clamp and the unsend countdown.

**Page / profile shapes:**
- `hubPageSchema` (`client.ts:134`): `{ id:int, label, platform:'fansly'|'onlyfans', modelSlug, modelName, username?, displayName? }`.
- `hubFanProfileResponseSchema` (`:161`): `{ fan:{platform, platformUserId, username?, displayName?, createdAtExternal?, pageAlias?}, profile: hubProfileVersion|null }`; `hubProfileVersionSchema` = `{version:int, body, source, createdAt, createdByUserId?}`.
- `authMeSchema` (`test-connection.ts:13`): `{ authMethod, user:{username, role, assignedPages:[{label}]} }` — `probeHubConnection` returns `{username, role, pages:count}` (`test-connection.ts:69`).

### 2.3 OFAPI read-gateway (Core-fronted OFAPI reads)

Not a distinct client — the **same** `OfApiClient` (§1) is pointed at `<hubBaseUrl>/api/v1/ofapi/read` (`buildHubOfApiReadBaseUrl`, `transport.ts:7`) with the chatter key as bearer (`index.ts:427-435`). So all §1.3 GET operations are also reachable through Core, which relays them to OFAPI. Selection is `ofapiReadTransport` (`store.ts:176`); default `'hub'`. Read/selection semantics: `06-sync-and-reads.md`.

### 2.4 OFAPI command outbox (Core-fronted OnlyFans writes)

The only supported OnlyFans write path. Command **kinds** (`hubOfapiCommandKindSchema`, `client.ts:223`): `send_text_message_v1`, `send_media_message_v1`, `typing_active_v1`, `unsend_message_v1`, `mark_chat_read_v1`.

Create request (`hubOfapiCommandCreateRequestSchema`, discriminated on `kind`, `client.ts:287`):
- Common fields (`hubOfapiCommandBaseFields`, `:231`): `clientCommandId` (uuid, client idempotency key), `accountId` (`acct_…` regex), `conversationId` (numeric-string regex).
- `send_text_message_v1.payload`: `{ text: 1–10 000 chars, non-blank }`; optional `retryOfCommandId`.
- `send_media_message_v1.payload` (`hubSendMediaMessagePayloadSchema`, `:246`): `{ text ≤10 000, price (0 or 3–200, `hubOfapiCommandPriceSchema` `:241`), mediaFiles[1–50], previews[≤50] }` with dedupe + previews⊆mediaFiles superRefine.
- `typing_active_v1` / `mark_chat_read_v1`: empty payload; `unsend_message_v1.payload`: `{ messageId: numeric string }`.

Command response (`hubOfapiCommandResponseSchema`, `:347`) is `.passthrough()` but **rejects any `payload` field** (`:350-358`) and transforms to: `commandId`, `clientCommandId`, `kind`, `accountId`, `conversationId`, `state`, `payloadHash` (sha256 hex), `retryOfCommandId`, `attemptCount`, `lastErrorCode`, `lastErrorClass`, `verifierResult`, `platformMessageId`, `attemptStartedAt/FinishedAt`, `createdAt/updatedAt`, `deduplicated`. States (`HUB_OFAPI_COMMAND_STATES`, `:211`): `queued`, `in_flight`, `confirmed`, `failed_retryable`, `failed_terminal`, `indeterminate`, `cancelled`.

The main process delegates these three methods through `HubModule.commandClient` (`hub/index.ts:103-128`), which rejects with `CG-HUB-02` when hub config is absent. Enqueue/poll/confirm orchestration is owned by `07-send-engine-outbox.md`.

### 2.5 AI gateway (alternative AI transport, Core-fronted)

Endpoint `POST /api/v1/ai/gateway/stream` returns an SSE body of `event: ai` frames. Request (`hubAiGatewayStreamRequestSchema`, `client.ts:441`): `{ clientRequestId(uuid), feature(HUB_USAGE_FEATURES), pageLabel, platform, platformUserId, conversationId?, model, reasoningEffort('off'|'low'|'medium'|'high'|'max'), temperature?, maxTokens?, isRegeneration, prompt:{ systemBlocks[], userBlocks[] } }` where each block is `{ text(1–100k), cache:'1h'|'5m'|'none' }` (`:436`).

Frames (`hubAiGatewayStreamFrameSchema`, discriminated on `type`, `:476`):
- `meta` → `{requestId, clientRequestId, feature, pageLabel, model, provider:'anthropic'|'openrouter', providerResponseId?, quota}` where quota = `{accepted, remainingRequestsToday?, remainingMicroUsdToday?}`.
- `content_delta {text}`, `reasoning_delta {text}`.
- `usage {usage:{inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costMicroUsd, costApproximate}, providerResponseId?, cacheHit}` → mapped to `LlmUsageMetrics` (`mapGatewayUsage`, `:515`).
- `error {code, message, retryAfterMs?}` → thrown as `HubError('http')`.
- `done {stopReason}`; stream must end with a `done` frame or `streamAiGateway` throws `invalid-response` (`:961`).

The desktop-side adapter is `createHubAiGateway` (`apps/desktop/src/main/hub/ai-gateway.ts:30`): it resolves `accountId → pageLabel` (fails `CG-HUB-02` "needs a mapped core page label" if unresolved, `:41-46`), hard-codes `platform:'onlyfans'`, sets `platformUserId = conversationId = req.chatId`, and streams via `client.streamAiGateway`. Selected per-request by `createSelectableAiGateway` when `req.transport === 'hub'` (`ai/gateway.ts:128-135`); the setting is `aiGatewayTransport: z.enum(['direct','hub'])` (`store.ts:180`). Per project memory, desktop AI defaults to **Direct** today; the hub AI path is built but rollout-gated. AI pipeline internals: `08-ai-pipeline.md`.

### 2.6 Usage / spend reporting

`postUsageBatch` (§2.2) is driven by the persisted, crash-safe **`createUsageReporter`** (`packages/shared/src/hub/usage-reporter.ts:121`). One event (`hubUsageEventSchema`, `client.ts:408`): `{ clientEventId, feature(HUB_USAGE_FEATURES), model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, conversationId?, durationMs?, isCacheHit, isRegeneration, completedAt(ISO) }`. Features enum (`HUB_USAGE_FEATURES`, `:386`): `fast-reply, improve-draft, help-me, fan-summary, chat-review, scan, ping, hi-greeting` (the desktop-only `'compare'` maps to `'fast-reply'` at enqueue, `usage-reporter.ts:257`).

Reporter behavior (normative constants, `usage-reporter.ts:16-18`): 1 s debounce, 100/batch, retry 5 s/15 s, drop after 3rd failed attempt; HTTP-400 → quarantine (never blind-retried); `completedAt` clamped to server time so Core's ">5 min future" 400 cannot trigger (`clampCompletedAt`, `:165`). Backed by the `usage_events` table via a store seam (`hub/index.ts:69`). The Activity spend read-model uses `getOfapiCreditsSummary` (`hubOfapiCreditsSummarySchema`, `client.ts:196`): `{enabled, scope:{pageIds[], pageCount}, today, last7d, limitations[]}` with each window `{from, to, restCredits, webhook:{eventCount, estimatedCredits}, totalEstimatedCredits}`. Metering/ledger: `11-hub-monetization-activity.md`.

### 2.7 Page resolution (`acct_…` ↔ Core page)

`createPageLabelResolver` (`apps/desktop/src/main/hub/page-resolver.ts:24`): manual override `settings.accountPageLabels[accountId]` wins; else the account's OnlyFans username is matched against a cached `GET /api/v1/pages` (TTL 5 min, `PAGE_LIST_CACHE_TTL_MS`). Matching is the pure shared helper `matchPageLabelForUsername` (`packages/shared/src/hub/page-mapping.ts:44`): `platform==='onlyfans'` + normalized-username equality in strength tiers `username → modelSlug → label`, requiring **exactly one** match — zero/ambiguous → `null` (never guess). Override setting: `accountPageLabels: z.record(string,string)` (`store.ts:187`).

### 2.8 Real-time event stream (SSE) + snapshot recovery

`createHubSync` (`apps/desktop/src/main/sync/hub-sync.ts:194`) is a fetch-streaming SSE consumer.

| Aspect | Value / anchor |
|---|---|
| Stream endpoint | `GET /api/v1/events/stream` (`HUB_SSE_PATH`, `:22`), `Accept: text/event-stream` |
| Resume | `?lastEventId=<fanout_seq>` (`streamUrl`, `:222`); checkpoint **after** handling each frame (`:249-252`) |
| Frame format | `id: <seq>\nevent: sync\ndata: <SyncEvent JSON>\n\n` — parsed by `SseFrameParser` (`:49`) |
| Keep-alive / watchdog | `: keep-alive` every 30 s; 45 s byte-silence aborts (`HUB_WATCHDOG_MS`, `:28`) |
| Reconnect | server `retry: 3000`; 15-min server close is the **normal** resume path (`:412-415,440-445`); backoff cap 30 s |
| Auth failure | 401/403 → permanent stop, status `auth-failed` (`:362-364`) |
| Snapshot required | 409 → `syncSnapshotRequiredSchema` (`protocol/index.ts:322`), triggers snapshot recovery |
| Snapshot endpoint | `GET /api/v1/events/snapshot?accountId&afterSeq&pageCursor&limit&snapshotCursor` → `syncSnapshotResponseSchema` (`protocol/index.ts:364`) |
| Statuses | `connecting`/`live`/`degraded`/`auth-failed`/`stopped` (`:131`) |

Frames are validated by `parseSyncEvent` and filtered to `allowedAccountIds` (`:244`). Consumption/fallback logic (enriched-message ingest, id-only fallback, tombstones, polling suspension) is in `createHubAwareSync` (`apps/desktop/src/main/sync/hub-provider.ts:168`) and owned by `06-sync-and-reads.md`; here it matters that the same `SyncEvent`/snapshot **protocol schemas** describe both this SSE boundary and the internal IPC bus.

### 2.9 Protocol schemas (`packages/shared/src/protocol/index.ts`)

The wire vocabulary shared across the hub SSE boundary and Electron IPC. Ids are strings; loose objects allow forward-compatible extension (`protocol/index.ts:1-8`).

**Operation lifecycle (renderer↔main IPC):** commands `operation:start` (`:107`), `operation:cancel` (`:117`) → `operationCommandSchema` (`:123`). Events `operation:progress` (`:131`), `operation:chunk` (`:146`), `operation:complete` (`:153`), `operation:error` (`:163`), `operation:discarded` (`:171`), `operation:debugPrompt` (`:181`) → `operationEventSchema` (`:189`). Supporting: `userFacingErrorSchema` (`:45`), `featureResultSchema` (`:56`), `llmSpendSummarySchema` (`:63`), `profilingSnapshotSchema` (`:89`), `operationParamsSchema` (`:97`), phases `OPERATION_PHASES` (`:18`).

**Sync events (`syncEventSchema`, `:308`)** — discriminated union of: `chatListUpdated` (`:201`), `messageReceived` (`:239`), `messageSent` (`:247`), `ppvUnlocked` (`:255`), `tipReceived` (`:262`, `amountUsd` optional — never fabricated), `presence` (`:271`), `typing` (`:279`), `accountAuthChanged` (`:285`), `readStateChanged` (`:301`), `messageDeleted` (`:291`, `chatId` optional — recovered locally). Enriched payload `normalizedSyncMessageSchema` (`:220`) with nested `…MessageMediaSchema` (`:206`) and `…MessageReplyToSchema` (`:214`); `messageReceived/Sent.message` use a **tolerant** variant that catches to `undefined` on parse failure (`:237`).

**Snapshot recovery:** `syncSnapshotRequiredSchema` (`:322`, the 409 body: `statusCode:409`, `requestedSeq`, `oldestAvailableSeq`, `currentSeq`, `snapshotPath`), `syncSnapshotMessageSchema` (`:339`), `syncSnapshotThreadSchema` (`:349`), `syncSnapshotResponseSchema` (`:364`, with `page`, `coverage.durableDomains`, `threads[]`, `unresolvedTombstones[]`, `nextPageCursor`). Parse helpers `parseOperationCommand/Event` and `parseSyncEvent` return `null` on rejection (`:401-414`).

### 2.10 Hub error taxonomy

`HubError extends CgError` (`client.ts:106`): reason `'auth'` → `CG-HUB-01`; every other reason (`bad-request`, `http`, `timeout`, `network`, `invalid-response`) → `CG-HUB-02` (`:110`). `bad-request` covers both server 400 and client-side contract validation and is **never blind-retried** (`:99-104`).

---

## 3. AI Providers (Direct)

Direct provider transport (`apps/desktop/src/main/ai/providers/*`), selected when `AiGatewayRequest.transport === 'direct'` (`ai/gateway.ts:131`). Keys are read from the keychain at call time inside `createDirectGateway` (`ai/gateway.ts:47,71-78`) — never held in coordinator state.

### 3.1 Anthropic

| Aspect | Value / anchor |
|---|---|
| Endpoint | `POST https://api.anthropic.com/v1/messages` — `ANTHROPIC_MESSAGES_URL`, `providers/anthropic.ts:20` |
| Auth headers | `x-api-key: <anthropicKey>`, `anthropic-version: 2023-06-01` (`:66-69`); key from keychain `anthropicKey` |
| Body | `{ model, stream:true, max_tokens, thinking?, output_config?, system:[blocks], messages:[{role:'user',content:[blocks]}], temperature? }` (`:45-54`) |
| Cache control | `toCacheControlBlocks` (`providers/transport.ts:154`): `'1h'`→`{type:'ephemeral',ttl:'1h'}`, `'5m'`→`{type:'ephemeral'}`, `'none'`→no marker |
| Tuning | temperature/thinking mutually exclusive; sampling-params-removed models get neither (`resolveAnthropicRequestTuning`, shared `llm/capabilities`) |
| Errors | `classifyAnthropicHttpError` (shared) + `Retry-After` parse (`:76-78`) |

### 3.2 OpenRouter

| Aspect | Value / anchor |
|---|---|
| Endpoint | `POST https://openrouter.ai/api/v1/messages` (Anthropic-Messages-compatible) — `OPENROUTER_MESSAGES_URL`, `providers/openrouter.ts:21` |
| Auth headers | `Authorization: Bearer <openRouterKey>`, `x-openrouter-title: ChatGoose` (`:57-61`); key from keychain `openRouterKey` |
| Body | like Anthropic but `temperature` always sent, and cache hints **stripped** (`toPlainTextBlocks`, `transport.ts:164`) |
| Errors | `classifyOpenRouterHttpError` (shared) |

### 3.3 SSE parsing & retry (shared)

Both providers pump the response body through `pumpSseStream` (`providers/transport.ts:184`) over the shared incremental `MessagesSseParser` (`packages/shared/src/llm/sse.ts:378`). The parser (dialect `'anthropic'`|`'openrouter'`) turns Anthropic Messages stream events (`message_start`, `message_delta`, `content_block_delta`, etc.) into semantic `LlmStreamEvent`s: `progress`, `text-delta`, `reasoning-observed`, `reasoning-delta`, `usage`, `stop-reason`, `stream-error`, `unsupported-chunk` (`sse.ts:212-220`). It normalizes OpenAI-shaped usage (`prompt_tokens` + `prompt_tokens_details`) into Anthropic-shaped `LlmUsageMetrics` without double-counting (`normalizeOpenRouterUsage`, `:331`). `runWithLegacyRetry` (`transport.ts:250`) auto-retries only before the first text chunk, once per kind: 429 when `Retry-After ≤ 60 s` (`CG-API-01`), and 503 after a fixed delay (`CG-API-05`).

### 3.4 Key probes (Settings → Test)

`key-probe.ts` — free bearer-only validations: Anthropic `GET https://api.anthropic.com/v1/models` (`ANTHROPIC_MODELS_URL`, `:13`) and OpenRouter `GET https://openrouter.ai/api/v1/key` (`OPENROUTER_KEY_URL`, `:14`); 10 s timeout; 401/403 → `CG-AUTH-02`, offline → `CG-NET-*`.

### 3.5 Hub AI gateway as alternative

The same coordinator can route through Core instead (§2.5) via `createHubAiGateway` — same prompt blocks, same `LlmUsageMetrics` out, but the provider call happens server-side. Selected by transport flag; see `08-ai-pipeline.md`.

---

## 4. Auto-update feed

`electron-updater` generic provider over HTTPS (Windows packaged builds only — `shouldAutoUpdate` = `platform==='win32' && isPackaged`, `apps/desktop/src/main/platform/updater.ts:19`).

| Aspect | Value / anchor |
|---|---|
| Feed URL | `https://45-8-230-111.sslip.io/u/bffe2540bd2b7e87bd9b88e3/` — `apps/desktop/electron-builder.yml:60-62` (`publish.provider: generic`) |
| Host | agency VPS `45.8.230.111` (nginx site `chatgoose-updates`); random path segment keeps it off scanners |
| Contract | electron-updater generic layout: `latest.yml` (version + sha512 + file list) + the NSIS `.exe` installer + `.blockmap` (delta) — consumed by `AppUpdaterLike.checkForUpdates()` (`updater.ts:33`) |
| Trust anchor | builds are **unsigned** (`electron-builder.yml:5-6`, `identity: null`), so "the feed host being ours **is** the trust anchor" |
| Policy | background auto-download + install-on-quit (`autoDownload=true`, `autoInstallOnAppQuit=true`, `updater.ts:79-80`); check at launch then every 4 h (`UPDATE_CHECK_INTERVAL_MS`, `:131`); failed checks silent for the auto path |
| Phases | `idle/checking/up-to-date/available/downloading/downloaded/error` (`UpdateStatus`, `:46`) surfaced to IPC for the manual "check now"/"Restart & install" button |

Release mechanics (a `v*` tag → `windows-build.yml` publishes to this feed) are in `01-overview-build-release.md`.

---

## 5. OS / Platform boundaries

### 5.1 OS keychain (secrets)

`apps/desktop/src/main/secrets/keychain.ts` — Electron **safeStorage** (macOS Keychain / Windows DPAPI) encrypts each secret; one file per secret under `userData/secrets` (`fileFor`, `:57`; dir mode `0o700`, files `0o600`). `SECRET_NAMES` (`:10`): `ofapiKey`, `anthropicKey`, `openRouterKey`, `hubApiKey`, `dbKey`, `mediaCacheKey`. `dbKey`/`mediaCacheKey` are locally generated 32-byte random keys (`generateDbKey`, `:43`; created once via `getOrCreateGeneratedKey`, `:93`). `setSecret` refuses to persist when `isEncryptionAvailable()` is false (`:74`). Plaintext exists only in main-process memory (SPEC §15). IPC surface for the renderer: `04-main-bootstrap-ipc-settings.md`.

### 5.2 OS notifications

`apps/desktop/src/main/notifications.ts` exposes only `messageNotificationBody(locale, event)` — derives a notification body from a `messageReceived` sync event: tip → localized "tip" string, else `htmlToPlainText(message.text)`, else media/generic fallback (`:5-24`). The actual `Notification` construction happens in the composition root (e.g. budget warnings at `index.ts:468-473`). This module is the plain-text/localization boundary that fixed the raw-HTML-notification bug (project memory "Empty push body diagnosis").

### 5.3 Dock / taskbar badge

`apps/desktop/src/main/platform/badge.ts` — cross-platform unread badge. macOS uses a string (`app.dock.setBadge`); Windows needs an overlay **image**, so this module rasterizes a clay disc + white count in a 5×7 pixel font and encodes a minimal PNG via `node:zlib` (`renderBadgeRgba` `:48`, `encodePng` `:138`). `badgeText(count)` → `''`/`'1'…'99'`/`'99+'` (`:11`); `badgePng(count)` returns a cached `Buffer|null` (`:168`). Composition root feeds it to `nativeImage.createFromBuffer` / `win.setOverlayIcon`.

### 5.4 Single-instance lock

`apps/desktop/src/main/platform/single-instance.ts` — `focusExistingWindow(win)` (`:19`) surfaces the existing window (restore→show→focus) when a duplicate launch is forwarded. The composition root takes `app.requestSingleInstanceLock()` and routes `'second-instance'` here; prevents two processes racing the one encrypted DB / doubling credits (`:1-6`).

### 5.5 Custom `media://` protocol (main → renderer)

`apps/desktop/src/main/media/protocol.ts` — the renderer references OnlyFans media only as opaque tokens `media://<sha256-hex>` (`MEDIA_SCHEME`, `:14`). This is a **trust boundary**: renderer-controlled input reaches `createMediaRequestHandler` (`:128`).

- **Minting** (`createToMediaUrl`, `:59`): only https OnlyFans/FansAPI hosts pass `isAllowedMediaUrl` (`:30`, host-or-subdomain of `onlyfans.com`/`fansapi.com`); the newest signed URL registers into `media_urls` keyed by the token = `hashRemoteUrl` (sha256 of the query-stripped URL, `cache.ts:55`).
- **Serving** (`:131`): `parseMediaToken` accepts only 64-hex tokens (`:78`); unknown token or off-allowlist registry row → 404 **without any network**; else serve from encrypted cache (§6) or `fetchRemote`. The allowlist is re-checked before any fetch (defense in depth, `:138`).
- **Fetch policy** (`FetchRemote`, wired at `index.ts:915-940`): direct `fetch` of the signed URL (0 credits); 404/410 → `null`; other non-ok → throw. The OFAPI download-endpoint fallback is a noted future follow-up (`index.ts:912-914`). Re-checks `isAllowedMediaUrl` even on a poisoned row (`index.ts:918`). Privilege registration `MEDIA_SCHEME_PRIVILEGES` = `{supportFetchAPI:true, stream:true}`, deliberately non-`standard` (`:19`).

### 5.6 External-navigation guard

`apps/desktop/src/main/platform/navigation.ts` — pure URL policy the composition root enforces on the `BrowserWindow`. `isAllowedDevRendererUrl` (`:14`): only http/https on loopback hosts (`localhost`/`127.0.0.1`/`::1`) — the dev renderer. `isAllowedExternalOpenUrl` (`:28`): only `http/https/mailto` may open externally (via the OS), everything else is refused. Prevents the renderer from navigating main out to arbitrary schemes.

---

## 6. Local persistence boundary

### 6.1 Encrypted SQLite (SQLCipher)

`apps/desktop/src/main/db/database.ts` opens an encrypted handle via **better-sqlite3-multiple-ciphers** with the SQLCipher-compatible cipher: `PRAGMA cipher='sqlcipher'` then `PRAGMA key=<encryptionKey>` **before any other statement** (`database.ts:47-49`), then WAL + `synchronous=NORMAL` + `busy_timeout=5000` + `foreign_keys=ON` (`:54-57`). The first read throws `SQLITE_NOTADB` on a wrong/missing key (`:51`). The key is `dbKey` — a keychain-held generated 32-byte hex (`index.ts:830`, `getOrCreateGeneratedKey('dbKey')`) — **never stored in the DB**. The native module is `asarUnpack`-ed (`electron-builder.yml:25-26`). Schema/migrations/queries: `09-data-model-storage.md`.

### 6.2 Encrypted on-disk media cache

`apps/desktop/src/main/media/cache.ts` — each blob is **AES-256-GCM**-encrypted (`iv ‖ authTag ‖ ciphertext`, `encryptBlob` `:19`) with the keychain-held `mediaCacheKey` (32 bytes, `index.ts:831,936`) before touching disk; files under `userData/media-cache` (mode `0o600`). LRU-evicted by `last_accessed_at` with a **2 GiB** cap (`MEDIA_CACHE_MAX_BYTES = 2 * 1024³`, `:11`). A decrypt failure (tamper / rotated key) drops the row and refetches (`:163-167`). Row metadata lives in the `media_cache` table (`MediaCacheRow`, `:61`; columns ensured at `:247`).

---

## 7. Inbound OFAPI webhooks (received by Core, not desktop)

OFAPI delivers webhooks to **Core's** receiver, not to the desktop. The desktop observes their effects only via the hub SSE stream (§2.8) as `SyncEvent`s and via read-gateway reconciliation. This section documents the event vocabulary the system models, captured live during the Phase-0 spike and pinned as fixtures.

### 7.1 Delivery contract (from `tests/fixtures/webhooks/README.md`)

- Envelope: `{ event, account_id, payload }` — **no event-id field in the body**.
- **Dedupe key:** header `x-ofapi-idempotency-key`, format `evt_<40 hex>`. At-least-once, ≤5 retries, 15 s response timeout.
- **Signature:** header `signature` = hex `HMAC-SHA256(rawJsonBody, signing_secret)` — verify against **raw** bytes (re-serializing breaks the MAC).
- `User-Agent: OnlyFansAPI.com/Webhook-Client`, `Content-Type: application/json`.
- `users.typing` fires ~every 3 s while typing (no "stopped" event; ~5 s client decay); `users.online/offline` are polled vendor-side.

### 7.2 Event types (fixture inventory, `tests/fixtures/webhooks/*.json`)

| `event` | Fixture | Key payload | Desktop-observed as |
|---|---|---|---|
| `messages.received` | `messages_received.json` | full message object | SyncEvent `messageReceived` |
| `messages.sent` | `messages_sent.json`, `messages_sent_own_api_send.json` | full message; fires for our own API sends ~0.2 s after POST | `messageSent` |
| `messages.deleted` | `messages_deleted.json` | `{ id }` only — **no chat id** | `messageDeleted` (chatId recovered locally, `hub-provider.ts:381`) |
| `messages.ppv_unlocked` | `messages_ppv_unlocked.json` | message + unlock | `ppvUnlocked` |
| `transactions.new` | `transactions_new.json` | transaction | (spend/tip reconciliation) |
| `subscriptions.new` | `subscriptions_new.json` | subscription | (chat-head refresh) |
| `subscriptions.renewed` | `unverified_subscriptions_renewed.json` (`verified:false`) | subscription renewal | — |
| `tips.received` | `unverified_tips_received.json` (`verified:false`) | tip | `tipReceived` |
| `users.online` | `users_online.json` | `{ fan:{id,username,name,spending{…}}, observed_at, status_changed_at, last_seen_online_at }` | `presence {online:true}` |
| `users.offline` | `users_offline.json` | same fan/presence shape | `presence {online:false}` |
| `users.typing` | `users_typing.json` | `{ fan, … }` | `typing` |

Fixture ids/names are anonymized but cross-consistent; `_meta` in each file is capture provenance, not wire format. These fixtures are the primary brief for Core's webhook receiver (they live in this repo but describe Core's inbound contract). The `SyncEvent` schemas the desktop parses on the hub SSE side (§2.9) are the desktop's view of these same events after Core normalizes and fans them out.
