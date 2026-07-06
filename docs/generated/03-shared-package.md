> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — The Shared Package (`packages/shared/src`)

`@chatgoose/shared` is the **platform-pure** TypeScript core, consumed **from source**
(no build artifact — `build` is `echo 'shared is consumed from source'`). Its only
dependencies are the vendored `@kernel/sdk` and `zod`. It has **no LLM vendor SDK and no
prompt text** — both the old `prompts/` and `llm/` directories were removed in the kernel
cutover; only the usage vocabulary (`usage-metrics.ts`) survived.

- `package.json`: name `@chatgoose/shared`, `type: module`, exports `"."` →
  `./src/index.ts` and `"./*"` → `./src/*` (every module reachable by subpath). tsconfig
  `types: []` (no DOM/node globals — hence structural fetch/AbortSignal shims in the hub
  client). Vitest node env.
- **Barrel** (`src/index.ts:1-26`) re-exports the pure modules; it deliberately **omits**
  `hub/client`, `hub/usage-reporter` (network/persistence — main-only), `theme.ts`, and
  `diagnostics/log.ts` (reachable only by subpath). Two ambiguity resolutions: root
  `constants.ts` wins the `PING_*` names over `transcript/ping-segment.ts`; `errors/`
  `userFacingErrorSchema` wins over the `protocol/` one.

## `hub/*` — the Agency Hub client cluster (most load-bearing)

Barrel `hub/index.ts` re-exports `client, usage-reporter, page-mapping, mode`.

### `hub/client.ts` (718 lines) — thin delegation to `@kernel/sdk`

Since Stage 24 the hub operations are thin delegations to the pinned SDK; SDK typed
operations + runtime validation replace hand-mirrored schemas. Platform-pure (fetch +
AbortSignal only), instantiated in the Electron main process only.

- **Auth:** every call uses `auth:{ mode:'bearer', token: () => apiKey }` → header
  `authorization: Bearer <apiKey>`; also injects `x-client-version` when set
  (`client.ts:365-366,440-447`). No device token is used *by the shared client* — the
  device token is minted by `main/hub/device-token.ts` and passed in as the `apiKey`.
- **Endpoints** (client method → SDK op → method+path):
  `listPages`→`pages`→`GET /api/v1/pages`; `getFanProfile`/`putFanProfile`→
  `pageFanProfile`/`upsertFanProfile`→`GET`/`PUT /api/v1/pages/:pageLabel/fans/
  :platformUserId/profile`; `postUsageBatch`→`aiUsageBatch`→`POST /api/v1/ai-usage/batch`
  (deprecated); `postIngestObservations`→`ingestObservations`→
  `POST /api/v1/ingest/observations`; `getOfapiCreditsSummary`→
  `ofapiCreditsChatterSummary`→`GET /api/v1/ofapi/credits/summary`; `createOfapiCommand`/
  `getOfapiCommand`/`cancelOfapiCommand`→`/api/v1/ofapi/commands…`;
  `listAiPersonas`/`upsertAiPersona`/`archiveAiPersona`→`/api/v1/ai/personas…`;
  `streamAiGateway`→`POST /api/v1/ai/gateway/stream` (SSE);
  `streamAiFeature`→`POST /api/v1/ai/features/:feature` (SSE) (`client.ts:477-647`).
- **Timeouts** (`client.ts:37-48`): profile get 5s / put 10s, usage batch 15s, list-pages
  10s, credits 5s, command 10s; stream methods pass no timeout (the stream owns its
  abort). Caps: `HUB_PROFILE_MAX_CHARS = 50_000`, `HUB_USAGE_BATCH_MAX_EVENTS = 100`.
- **SSE frame handling** (`client.ts:579-693`): the discriminated `aiGatewayStreamFrame`
  union — `meta` (maps to `onMeta({requestId, clientRequestId})`, requestId = generation
  ref), `content_delta`→`onText`, `reasoning_delta`→`onReasoningDelta`,
  `usage`→`mapGatewayUsage`→`LlmUsageMetrics` (cost from the gateway's `cost_micro_usd`),
  `error`→`HubError('http')`, `done`→`onStopReason`. Missing `done` → invalid-response;
  caller abort → plain `Error('Operation aborted')`.
- **Error taxonomy** (`client.ts:112-188`): `HubError extends CgError`, reason
  `auth|bad-request|http|timeout|network|invalid-response`; `auth`→`CG-HUB-01`, everything
  else→`CG-HUB-02`. `toHubError` maps `KernelApiError.category`. A **server-time offset**
  derived from the `Date` header (`client.ts:368-379`) feeds the usage `completedAt` clamp
  and the 24h unsend countdown.
- **Closed enums:** `HUB_OFAPI_COMMAND_STATES` (`queued,in_flight,confirmed,
  failed_retryable,failed_terminal,indeterminate,cancelled`); `HUB_USAGE_FEATURES`
  (`fast-reply,improve-draft,help-me,fan-summary,chat-review,scan,ping,hi-greeting` — note
  it includes core's `scan` and omits `compare`).

### `hub/usage-reporter.ts` (355 lines)

A persisted, crash-safe AI-usage upload queue over an injected `UsageEventStore` seam
(backed by better-sqlite3). Debounce 1s; retry delays `[5s,15s,60s,5m,15m,1h]`; HTTP-400
**quarantine** (never blind-retry); after 3 failed attempts a row moves to a **dead-letter
tier** (retried on start + hourly, never deleted); removal only on 2xx or wire-contract
failure at load. `'compare'` is mapped to `'fast-reply'` at enqueue. `completedAt` is
clamped to server time. (Owner detail in `11`.)

### `hub/page-mapping.ts` (82 lines) & `hub/mode.ts`

Pure `platform==='onlyfans'` + normalized-username equality with **exactly-one-match**
required; match tiers in strength order `username → modelSlug → label`, ambiguity within a
tier → null (never guess). `AccountMatchCandidate.id` is the OFAPI `acct_…` id.
`hub/mode.ts` is just `HUB_MODE_OVERRIDE_SETTINGS = ['auto','polling','hub']`.

## `protocol/index.ts` (568 lines) — the wire protocol (IPC + hub SSE)

zod-validated at every trust boundary; documents the two ID namespaces (`acct_…` vs raw
OnlyFans numeric id).

- **Operation commands (renderer→main):** `operation:start` (operationId/feature/accountId/
  chatId/params), `operation:cancel`; `operationParamsSchema`
  (replyTone/replyMode/draftText/forceRegenerate).
- **Operation events (main→renderer):** discriminated union `operation:progress`,
  `operation:chunk`, `operation:complete` (`featureResultSchema`), `operation:error`
  (`userFacingErrorSchema` looseObject variant), `operation:discarded`,
  `operation:debugPrompt` (`snapshot: z.record(string, unknown)` — an **opaque** debug slot;
  **no prompt text is defined in this package**).
- **Sync events (SPEC §6; same union over IPC + hub SSE):** 10-member
  `syncEventSchema` — `chatListUpdated, messageReceived, messageSent, ppvUnlocked,
  tipReceived, presence, typing, accountAuthChanged, readStateChanged, messageDeleted`.
  `tipReceived.amountUsd` is **dollars**.
- **Sync snapshot v1** (`syncSnapshotRequiredSchema`, version 1, statusCode 409,
  `snapshotPath:'/api/v1/events/snapshot'`).
- **Kernel event stream v2** (`:416-568`): `domainEventFrameSchema` (accountId, accountSeq,
  open `type`, occurredAt, data, fanRef?, conversationRef?, messageRef?, accountRef?,
  payload?), `domainSnapshotRequiredSchema` (**version 2**, statusCode 409), and
  **`mapDomainFrame`** (`:487-563`) — the canonical v2 `type` → local `SyncEvent` mapping
  (`message.received/sent/deleted/ppv_unlocked`, `tip.received`, `presence.online/offline`,
  `subscription.started`→`chatListUpdated`, `account.auth_changed`; default → null). Requires
  `accountRef` (non-OFAPI pages dropped). Boundary parsers `parseOperationCommand/Event`,
  `parseSyncEvent`, `parseDomainEventFrame`.

## `errors/index.ts` (563 lines) — the `CG-*` taxonomy

34 codes in `CG_ERROR_CODES` (auth/api/net/flow/fan/ui/app/of/hub/guard families; the hub
family restarts at `CG-HUB-01/02`). `CG_ERROR_REGISTRY` gives each code `{message,
recovery, settingsLink?}` with exact user-facing wording (e.g. `CG-OF-06` "Send could not
be confirmed" — indeterminate, never auto-retried; `CG-OF-07` unsend window passed 24h;
`CG-GUARD-01/02`). `CgError extends Error` carries code + detail (`guardSpans`,
`retryAfterMs`, etc.). The canonical **strict** `userFacingErrorSchema` lives here.
Provider-classification helpers (`classifyAnthropicHttpError`/`classifyOpenRouterHttpError`
+ phrase lists, `providerWordingOverrides`) are string-pattern classifiers — **not** vendor
SDK calls.

## `features.ts` (198 lines) — the feature policy registry

`OPERATION_FEATURES` = the 7 operation features (`fast-reply, improve-draft, help-me,
fan-summary, chat-review, ping, hi-greeting`); `compare` is a `FeatureType` but not an
operation feature (it orchestrates fast-reply per model card). `FEATURE_POLICIES`
(`:53-159`) is the per-feature table: `surface` (ai-dock/panel-tab), `resultKind`
(reply/single-reply/xml), `promptMode`, `timeoutBucket` (quick/deep), `messageCountBucket`,
`modelFeature`, `minMessages`, `rerunAction` (regenerate/refresh), `supportsReplyMode/Tone`,
`requiresDraft`, `usesPingSegment`. Helpers `getFeaturePolicy`, `isDeepFeature`,
`resolveFeatureMessageCount`, etc.

## `constants.ts` (164 lines) — product constants (values normative)

Operation timeouts (`QUICK 60s`; deep `prep 180s / ttfb 45s / idle 45s / max-stream 300s`),
LLM auto-retry bounds, message counts (quick 100/5/200, improve 25/5/200, deep 1500/100/3000,
`HI_GREETING_MESSAGE_COUNT=25`), feature thresholds (`MIN_MESSAGES_FOR_DEEP=30`,
`HI_GREETING_MAX_TRANSCRIPT=10`, `PING_ACTIVE_WINDOW_MS=5d`, `PING_MIN_FAN_MESSAGES=3`),
`STREAM_CHUNK_FLUSH_MS=50`, OFAPI pacing (`MESSAGES_PAGE_LIMIT=100`,
`OFAPI_INTER_PAGE_DELAY_MS=300`, `OFAPI_REQUEST_TIMEOUT_MS=30s`, retry delays, page caps,
`FAN_DATA_CACHE_TTL_MS=5m`), and `DEFAULT_AGENCY_HUB_BASE_URL='https://gosling-agency.ru'`.
It **also** still carries legacy residue the kernel cutover left inert: `AGENCY_HUB_*`
constants, `DEFAULT_MODEL_ID='anthropic:claude-sonnet-4-6'` /
`DEFAULT_FAN_SUMMARY_MODEL_ID='anthropic:claude-opus-4-6'`, `MAX_TOKENS`/
`FEATURE_TEMPERATURES`, and `Settings.{claudeApiKey, openRouterApiKey}` — the hub client no
longer uses these model/temperature constants (they are settings-anchor residue; core now
owns model choice and pricing).

## `types.ts` / `usage-metrics.ts` / `theme.ts`

- `types.ts` (44): cross-module enums (`FeatureType` (8), `ModelSelectableFeature`,
  `ReasoningEffort`, `ReplyTone/Mode`, `PromptMode`, `PingSegment`, `PpvState`, interface
  `Personality`).
- `usage-metrics.ts` (40): `LlmUsageMetrics` (legacy Anthropic field names; relocated from
  the dead `llm/sse.ts` in Stage 31 — the surviving vocabulary of the removed `llm/`
  package), `formatCompactTokens`.
- `theme.ts` (19): `UiTheme`/`UiThemeSetting` + `resolveUiTheme` only — **no color/design
  tokens live here** (those are CSS variables in the renderer, `10`).

## `message-guard/*` — off-platform content guard pipeline

Pipeline `normalize → compile → match (with structural detectors)`. `types.ts`/`schema.ts`
define categories (`off_platform/red/yellow/custom`), actions, decisions, and zod
strictObject schemas (rules ≤2000, whitelist ≤1000). `normalize.ts` does homoglyph/leet/
zero-width folding with source-offset mapping. `matcher.ts` `scanText` merges structural +
trie term spans, drops whitelisted, ranks `allow<warn<block`. `detectors.ts` holds the
structural detectors (url/domain/email/obfuscated-email/wallet(ETH/BTC/TRON/SOL)/platform-
handle/alt-pay-terms/phone), all → `off_platform`/`block`.

- **Kill switch (defaults.ts):** `MESSAGE_GUARD_ENFORCEMENT_ENABLED = false` (owner,
  2026-06-24). `effectiveMessageGuardPolicy(policy)` returns the **disabled** policy
  whenever enforcement is off — so **the guard is currently a runtime no-op**. The full
  detector/trie machinery exists and is tested but not enforced. `BUILTIN_MESSAGE_GUARD_
  POLICY`'s only real rules are two disabled owner-TODO placeholders + one `onlyfans.com`
  whitelist entry.

## `output/*` — reply sanitization (runs on every LLM reply)

`reply-output.ts` (124): `sanitizeReplyPart` strips think blocks, prompt-leak lines
(`META_LEAK_PATTERNS`), reply prefixes, bracket-garbage ("stray JSON-array framing Gemini
emits"), normalizes dashes, unwraps quotes; empty result = "AI output unusable" signal.
`split.ts`: `splitByNext` on `[NEXT]` (sequential parts), `splitByVariant` on `[VARIANT]`
(alternative greetings) — case-sensitive, applied only after the stream completes.
`xml.ts`: lenient `parseHelpMeXml` / `parseChatReviewXml` (rating must be a bare integer
1–10) with a `valid` flag → caller falls back to raw view.

## `transcript/*` & `context/*` — prompt-adjacent formatting (data only)

`transcript/*` turns OFAPI messages into a normalized transcript: `ofapi-message.ts`
(boundary zod, price/tipAmount in **dollars**), `html.ts` (`htmlToPlainText`, no DOM),
`normalize.ts` (`TranscriptMessage`, dedupe+sort, media/PPV/tip labels;
`OFAPI_MESSAGES_PAGE_SIZE=100`), `format.ts` (`[HH:MM] Sender: {labels} {text}`, time in
**UTC for everyone**), `ping-segment.ts` (`analyzePingSegment` → segment-a/segment-b/active).
`context/spending.ts` + `context/subscription.ts` build the "FAN SPENDING DATA" /
"FAN SUBSCRIPTION DATA" text blocks — **all amounts dollars, never divide by 1000**; UTC
dates; `resolveAutoRenew` derives churn risk from OF `cancelDate` (there is no OF auto-renew
boolean). These are data-formatting helpers; they hold no system-prompt text, and — post
cutover — the LLM path that would have consumed them lives in core.

## `activity/*`, `spenders/*`, `summary/validity.ts` — pure domain math

- `activity/purposes.ts`: `OFAPI_PURPOSES` (14 credit-spend tags: hot-poll, deep-sweep,
  unread-reconcile, hydration, message-tail, chat-refresh, media, scan-deep-fetch, send,
  vault, spend-sweep, spenders, spenders-refresh, online). `activity/credit-ledger.ts`:
  merges credit rows, `estimateCreditDaysLeft`. `activity/ai-spend.ts`: costs in integer
  **micro-USD** (`microToUsd`), `AI_FEATURE_LABELS` (fan-summary → "Scan (fan summary)"),
  `buildAiSpendLedger` aggregates the durable `ai_spend_log` (NOT `usage_events`).
- `spenders/index.ts` (299): the Spenders board domain — silence buckets (warm ≥8d, hot
  ≥22d), OnlyMonster tier-label parsing, tier assignment (first shelf wins), in-shelf
  ordering by silence, shelf presentation constants, stats-series math, and freshness
  (`THREAD_FETCH_TTL_MS=5m`, `OFAPI_USD_PER_CREDIT = 69/20000`, `refreshCostUsd`). Amounts
  are dollars.
- `summary/validity.ts` (139): fan-summary cache validity/eviction — stale unless same
  persona + unedited + equivalent model id + both verification flags strictly true (Stage
  31 uses a `'kernel'` model sentinel locally).

## `i18n/*` & `diagnostics/log.ts`

- `i18n/index.ts`: `UiLocale='en'|'ru'`, `resolveUiLocale`, `uiMessage` with `{name}`
  interpolation, CLDR plural helpers. **AI prompts are never localized** — interface
  language never touches the LLM path. `i18n/catalog.ts` (1238 lines): `UI_MESSAGES`, ~657
  keys with EN+RU parity (test-enforced); technical badge words (POLLING, HUB LIVE, LIVE,
  OFF) and product names stay English in both locales.
- `diagnostics/log.ts` (254, subpath-only): the logging core + the **secret redactor** —
  `TOKEN_PATTERNS` mask secret shapes (`sk-ant-…`, `sk-or-…`, `ofapi_…`,
  `agency_hub_core_…`, `Bearer …`), `redactValue` deep-masks (bounded), `RingBuffer`. No
  Node/Electron imports — a review-blocking guarantee that logs/exports never carry key
  material.

## Vendored SDK pin (in this package's tests)

`packages/shared/tests/kernel-sdk-vendor.test.ts` asserts the `kernel-sdk.vendor.json`
`contractHash` equals the SDK's exported `KERNEL_CONTRACT_HASH` — one of the two drift
gates (the other is `pnpm typecheck`; see `02`).
