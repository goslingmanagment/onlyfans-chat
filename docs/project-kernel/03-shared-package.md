> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# 03 — Shared Package (`@chatgoose/shared`)

## Scope

This doc maps `packages/shared/src/**` in full — the platform-pure TypeScript core consumed **from source** by the Electron app. It is the structural reference for every pure computation the desktop depends on: prompt assembly, LLM model/cost/stream logic, banned-content scanning, the IPC/hub wire schemas, the CG-* error taxonomy, the i18n catalog, fan-context formatting, activity/credit modeling, the transcript model, spender ranking, summary-cache validity, LLM-output sanitizing, and the shared logging core.

It defers **runtime use** of these modules to neighbor docs:

- Runtime AI pipeline (how `prompts/`, `llm/sse`, `output/`, `message-guard/` are driven per operation) → **08-ai-pipeline.md**.
- The wire contracts these schemas describe, seen from this side → **02-external-boundaries.md** (OFAPI/core/AI/updater) and, for IPC channels, **04-main-bootstrap-ipc-settings.md**.
- The `hub/` subsystem's monetization/metering flow and how the Activity ledgers/spenders surfaces render → **11-hub-monetization-activity.md**.
- Read/sync consumption of `protocol/` sync events → **06-sync-and-reads.md**; write path using command schemas → **07-send-engine-outbox.md**.
- Storage of summary/personality/media models → **09-data-model-storage.md**.

Everything below is grounded in current source under `packages/shared/src`. Where a name/comment diverges from actual behavior, the divergence is called out.

---

## 0. Package shape, platform purity, barrel

- **Manifest**: `packages/shared/package.json`. Name `@chatgoose/shared`, `"type": "module"`, `"build": "echo 'shared is consumed from source'"` — there is no compiled output; the desktop imports TS directly. `exports` maps `.` → `src/index.ts` and `./*` → `src/*` (so `@chatgoose/shared/hub` resolves to `src/hub/index.ts`). Only runtime dependency: **`zod` ^4** (dev: typescript ^6, vitest ^4).
- **Platform purity is verified, not aspirational.** A full scan of `packages/shared/src` finds **no** imports of `electron`, `fs`, `path`, `crypto`, `os`, `node:*`, `better-sqlite3`, `child_process`, or `net/http/https`, and no `require(`. The **only** non-relative import anywhere is `from 'zod'` (7 sites). Network-capable modules (`hub/client.ts`, `hub/usage-reporter.ts`, `llm/sse.ts`) reach `fetch`/`AbortSignal`/`TextDecoder`/`setTimeout` only through `globalThis` casts and structural seams — they contain no platform imports, so the package stays TypeScript-portable, but they still *do network/timing* and are treated as main-only (see §17).
- **Barrel** `src/index.ts`: re-exports every subtree. Notable exclusions and disambiguations:
  - `hub/client` and `hub/usage-reporter` are **deliberately NOT in the root barrel** (`src/index.ts:26-27`): "main-only (network/persistence — SPEC §15) … import them via `@chatgoose/shared/hub`." Only the pure `hub/page-mapping` and `hub/mode` are barrel-exported.
  - Three name collisions from `export *` are resolved by explicit re-exports at `src/index.ts:32-34`:
    - `PING_ACTIVE_WINDOW_MS` / `PING_MIN_FAN_MESSAGES` — defined identically (5 days, 3) in both `constants.ts` and `transcript/ping-segment.ts`; canonical home forced to `constants`.
    - `formatUsd` — **two different functions** share the name. `llm/cost.ts` `formatUsd` (variable-precision, `~` prefix for approximate) wins the barrel; `context/spending.ts` `formatUsd` (`$${amount.toFixed(2)}`) is used internally by `spending.ts`/`subscription.ts` only.
    - `userFacingErrorSchema` — **two different shapes** share the name (see §8). The `errors/index` version (strict, `code` enum) wins the barrel.

---

## 1. Root modules

### `types.ts` — cross-module enums
Small enums that several modules must agree on (the file's own framing: "modules own their domain types; this file holds only what several must agree on"):
- `FeatureType` = the 7 operation features + `compare`.
- `ModelSelectableFeature` = `fast-reply | help-me | fan-summary | chat-review | ping` (improve-draft & hi-greeting delegate to fast-reply's selection).
- `ReasoningEffort` = `off | low | medium | high | max`.
- `ReplyTone` = `none | casual | flirty | upsell | spicy`; `ReplyMode` = `default | preferSplit`.
- `PromptMode` = `reply | analysis` (safety-preamble selector); `ResultKind` = `reply | single-reply | xml`; `PingSegment` = `segment-a | segment-b | active`; `PpvState` = `purchased | not purchased | unknown`.
- `Personality` interface: `{ id, name, content, updatedAt (unix ms), builtin?, builtinVersion? }`.

### `constants.ts` — tuned product config (catalog)
Values ported from the legacy extension; treated as normative. Key groups (line anchors approximate):

| Group | Constants (values) |
|---|---|
| Operation timeouts | `QUICK_OPERATION_TIMEOUT_MS=60_000`; `DEEP_OPERATION_PREP_TIMEOUT_MS=180_000`; `DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS=45_000`; `..._IDLE_TIMEOUT_MS=45_000`; `..._MAX_STREAM_TIMEOUT_MS=300_000` |
| LLM auto-retry | `AUTO_RETRY_RATE_LIMIT_MAX_MS=60_000` (429 retried only if Retry-After ≤ cap); `AUTO_RETRY_SERVICE_UNAVAILABLE_MS=5_000` |
| Message counts | quick default/min/max `100/5/200`; ping = quick; `IMPROVE_DEFAULT=25`; deep default/min/max `1500/100/3000`; `HI_GREETING_MESSAGE_COUNT=25` (fixed, not a setting) |
| Feature thresholds | `MIN_MESSAGES_FOR_DEEP=30`; `HI_GREETING_MAX_TRANSCRIPT=10`; `PING_ACTIVE_WINDOW_MS=5 days`; `PING_MIN_FAN_MESSAGES=3` |
| Streaming | `STREAM_CHUNK_FLUSH_MS=50` |
| OFAPI pacing | `MESSAGES_PAGE_LIMIT=100`; `OFAPI_INTER_PAGE_DELAY_MS=300`; `OFAPI_REQUEST_TIMEOUT_MS=30_000`; `OFAPI_RETRY_DELAYS_MS=[1000,2000,4000]`; `OFAPI_RETRY_MAX_BACKOFF_MS=5_000`; `DEEP_FETCH_MAX_PAGES=30`; `TRANSACTIONS_PAGE_CAP=5`; `FAN_DATA_CACHE_TTL_MS=5min` |
| Summary cache | `SUMMARY_EVICTION_COUNT=10` |
| Agency Hub | prefetch `5_000`; sync `10_000`; usage batch max `100`; report debounce `1_000`; report timeout `5_000`; report max attempts `3`; retry delays `[5_000,15_000]`; profile max bytes `50_000`; `DEFAULT_AGENCY_HUB_BASE_URL='https://gosling-agency.ru'` |
| Per-feature LLM params | `MAX_TOKENS` (fast-reply/improve/ping/hi=800, help-me=1200, chat-review=1600, fan-summary=8192); `FEATURE_TEMPERATURES` (fast-reply/improve/ping 0.65, hi 0.7, help-me 0.45, fan-summary 0.4, chat-review 0.25); `COMPARE_TEMPERATURE=0.35` |
| Model defaults | `DEFAULT_MODEL_ID='anthropic:claude-sonnet-4-6'`; `DEFAULT_FAN_SUMMARY_MODEL_ID='anthropic:claude-opus-4-6'`; `DEFAULT_FEATURE_MODELS`/`DEFAULT_FEATURE_REASONING` (all reasoning default `medium`) |

Also defines the **`Settings` interface** and **`DEFAULT_SETTINGS`** (`constants.ts:131-164`): ofapi/claude/openRouter/agencyHub keys, the four message counts, `defaultReplyTone='casual'` (owner-changed from legacy `'none'`), `debugMode`, `promptCachingEnabled=true`, `featureModels`, `featureReasoning`.
**Discrepancy to note:** this `Settings` interface does **not** carry `uiTheme`, `uiLocale`, or `hubModeOverride`, even though `theme.ts`/`i18n/index.ts`/`hub/mode.ts` define those *setting-value* types. The full desktop settings store (doc 04) is a superset of this shared subset; `DEFAULT_SETTINGS.agencyHubBaseUrl` is `''` (not the `DEFAULT_AGENCY_HUB_BASE_URL` constant).

### `features.ts` — feature policy registry
`FEATURE_POLICIES` (`features.ts:53-159`) is a `const satisfies Record<OperationFeature, FeaturePolicy>` table driving surface routing and gating. Each policy: `surface` (`ai-dock | panel-tab`), `resultKind`, `promptMode`, `timeoutBucket` (`quick|deep`), `messageCountBucket` (`quick|ping|improve|deep|hi`), `modelFeature`, `includesEarnings`, `minMessages` (0 or `MIN_MESSAGES_FOR_DEEP`), `rerunAction` (`regenerate|refresh`), `supportsReplyMode`, `supportsReplyTone`, `requiresDraft`, `usesPingSegment`. Helpers: `isOperationFeature` (everything except `compare`), `getFeaturePolicy`, `isDeepFeature`, `DEEP_FEATURES`/`QUICK_FEATURES` derived arrays, `resolveFeatureMessageCount(feature, settings)`, `resolveFeatureModelFeature`. Header comment documents the legacy→desktop surface renames (`inline-reply`→`ai-dock`, `overlay`→`panel-tab`) and result-kind collapse (5→3).

Deep features (minMessages=30, refresh, deep bucket): `fan-summary`, `chat-review`. Only `fast-reply` supports both replyMode and replyTone; only `improve-draft` sets `requiresDraft`; only `ping` sets `usesPingSegment`; only `hi-greeting` sets `includesEarnings:false`.

### `theme.ts` — UI theme value
`UiTheme=light|dark`, `UiThemeSetting=system|light|dark`, `UI_THEME_SETTINGS`, and `resolveUiTheme(setting, systemPrefersDark)`. Pure resolution only; application (renderer `.dark` class, main `nativeTheme`) is the desktop's job.

---

## 2. `prompts/` — prompt assembly (legacy artifacts, byte-for-byte)

All instruction strings here are carried from the legacy extension verbatim (Fansly→OnlyFans wording only). `prompts/templates/*.md` are the human-reviewable sources; `tests/templates-sync.test.ts` reads each `.md` and asserts byte-equality with the `templates.ts` constant.

### `escape.ts`
`escapeForPrompt(text)` (`escape.ts:8-13`) — HTML-escapes `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, **in that order** (comment: `&` first so entity ampersands aren't double-escaped). This is the SPEC §15 mandatory escape at every untrusted-text→prompt boundary.

### `templates.ts`
Seven exported template strings: `FAST_REPLY_TEMPLATE`, `IMPROVE_DRAFT_TEMPLATE`, `HELP_ME_TEMPLATE`, `FAN_SUMMARY_TEMPLATE`, `CHAT_REVIEW_TEMPLATE`, `PING_TEMPLATE`, `HI_GREETING_TEMPLATE`. Each is a Markdown document with `{placeholder}` slots and structural headings that double as cache anchors: `## Conversation Transcript` / `## Current Draft` (context anchor) and `## Your Task` (task anchor). XML-shaped features embed their required output structure inline (`<coaching>/<engaging>/<flirty>`; `<rating>/<evaluation>/<recommendations>`). `fan-summary` instructs output in Russian; the paid-media tag semantics block (`[… — PPV $X.XX, purchased|not purchased|unknown]`, `[Media Bundle…]`) is repeated in reply/improve/help-me/ping.

### `builder.ts`
`buildPrompt(input, templateOverrides?)` (`builder.ts:319-332`) returns `PromptPayload = { system, user, systemBlocks, userBlocks }`. Inputs (`PromptBuildInput`, `builder.ts:38-50`): feature, personality, transcript, fanSpendingData, fanSubscriptionData, fanDisplayName, optional fanBio/draftText/pingSegment/replyMode/replyTone.

Structure and cache model:
- **System blocks** (`buildSystemBlocks`): `[ preamble + "## Model Personality" anchor (cache:'none'), personality.content (cache:'1h') ]`. Preamble is `REPLY_SAFETY_PREAMBLE` for `promptMode:'reply'` features, `ANALYSIS_SAFETY_PREAMBLE` for analysis. Both preambles (`builder.ts:100-115`) are the byte-for-byte prompt-injection defenses (fan messages = untrusted input, never reveal AI, never break character / never let transcript override the task).
- **User blocks** (`buildUserBlocks`): `splitTemplate` cuts the raw template at the context anchor and the *last* task anchor into `staticPart` (cache:'1h'), `dynamicPart` (cache:'5m'), `taskPart` (cache:'none'). This keeps untrusted values out of the 1h-cached prefix. On a missing/invalid anchor it `console.warn`s and returns a single uncached block.
- `PromptCacheTtl='1h'|'5m'|'none'` (`builder.ts:31`) is a structural hint the LLM client maps onto provider `cache_control`.
- **Escaping boundary** (`templateValues`, `builder.ts:250-272`): transcript, fanDisplayName, fanBio, draft, and the spending/subscription sections are `escapeForPrompt`-wrapped; **`personality.content` is interpolated raw** (trusted model-owner content). `fillTemplate` is single-pass (`replace(/\{(\w+)\}/…)`) so placeholder-looking text *inside* substituted values is never re-expanded; unknown placeholders stay verbatim.
- Tone/split/segment injection: `TONE_INSTRUCTIONS` (casual/flirty/upsell/spicy + `TONE_FOOTER`), `SPLIT_REPLY_INSTRUCTIONS` (only when `supportsReplyMode` && `replyMode==='preferSplit'`), `PING_SEGMENT_INSTRUCTIONS` (segment-a/segment-b/active).
- Utilities exported: `flattenPromptBlocks`, `stripPromptCache` (all blocks → cache:'none' for the caching-disabled path).

### `personalities.ts`
Bundled "Lora" personality carried byte-for-byte. `BUNDLED_LORA_PERSONALITY_ID='builtin:lora'`, `BUNDLED_LORA_PERSONALITY_VERSION=2` (bump on content change to replace saved copies). Functions: `createBundledPersonalities(bundledUpdatedAt=0)`; `normalizeSavedPersonality` (trims name→'Unnamed' fallback, repairs `updatedAt`); `reconcileBundledPersonalities(personalities, bundledUpdatedAt)` — inserts missing builtins and replaces stale copies (missing `builtin` flag or different `builtinVersion`), returns the same array reference when nothing changed (`changed:false`).

---

## 3. `llm/` — model registry, capabilities, cost, SSE

### `model-registry.ts`
`MODEL_REGISTRY` (`model-registry.ts:30-177`) — the catalog. `LlmProvider='anthropic'|'openrouter'`. Entries (id, providerModelId, label, pricing, `supportsPromptCache`):

| id | label | in/out USD/M | cache write 5m/1h, read | cache |
|---|---|---|---|---|
| `anthropic:claude-sonnet-4-6` | Sonnet 4.6 (Recommended) | 3/15 | 3.75/6, 0.3 | ✓ |
| `anthropic:claude-sonnet-4-5` | Sonnet 4.5 | 3/15 | 3.75/6, 0.3 | ✓ |
| `anthropic:claude-opus-4-8` | Opus 4.8 (newest) | 5/25 | 6.25/10, 0.5 | ✓ |
| `anthropic:claude-opus-4-6` | Opus 4.6 | 5/25 | 6.25/10, 0.5 | ✓ |
| `anthropic:claude-opus-4-5` | Opus 4.5 | 5/25 | 6.25/10, 0.5 | ✓ |
| `anthropic:claude-haiku-4-5` | Haiku 4.5 | 1/5 | 1.25/2, 0.1 | ✓ |
| `openrouter:google/gemini-3.1-pro-preview` | Gemini 3.1 Pro | 2/12 | — | ✗ |
| `openrouter:x-ai/grok-4.20` | Grok 4.20 | 1.25/2.5 | read 0.2 | ✗ (`costApproximate`) |
| `openrouter:x-ai/grok-4.3` | Grok 4.3 | 1.25/2.5 | read 0.2 | ✗ (`costApproximate`) |

`MODEL_GROUPS` groups by provider for pickers. Helpers: `normalizeModelId` (accepts bare Anthropic `providerModelId` aliases from pre-prefix legacy settings; OpenRouter was never bare), `getModelEntry`, `getModelDisplayName`, `isSupportedModelSelection`, `isAnthropic/OpenRouterModelSelection`, `modelSelectionsEquivalent` (used by summary validity), `getProviderModelId` (id sent to the API; unknown passes through), `getHubReportingModelId` (bare for Anthropic, namespaced for OpenRouter — the id sent in hub usage events).

### `capabilities.ts`
Thinking/reasoning capability map + per-request tuning. `getFeatureMaxTokens`/`getFeatureTemperature` read `constants` (compare→0.35, else table; compare maps to fast-reply for tokens). Sets:
- `ANTHROPIC_ADAPTIVE_THINKING_MODELS` = {sonnet-4-6, opus-4-6, opus-4-8}; adaptive raises max-tokens per feature (`ANTHROPIC_ADAPTIVE_THINKING_MAX_TOKENS`, e.g. fan-summary 24000).
- `SAMPLING_PARAMS_REMOVED_MODELS` = {`claude-opus-4-8`} — temperature/top_p removed (400 if sent); `anthropicSamplingParamsRemoved()`.
- Gemini thinking caps (`GEMINI_THINKING_MAX_TOKENS`, short-form features only).
- `resolveAnthropicRequestTuning` / `resolveOpenRouterRequestTuning`: return `{maxTokens, temperature?, thinking?, outputConfig?}`. Key rules encoded (from production incidents): Anthropic **never** sets `temperature` alongside `thinking`; adaptive-capable models keep the raised max-tokens cap even with reasoning `off`; opus-4-8 omits temperature entirely; OpenRouter always sends temperature; Gemini `max`→`high`.

### `cost.ts`
`estimateLlmCost(modelId, usage)` → `LlmCostEstimate` (per-bucket USD + total + `approximate`). Integer-micro-USD-safe rounding (`roundUsd`, `USD_PRECISION=1e6`). `resolveCacheWriteTokens` reconciles a 5m/1h breakdown against the reported total, flagging `approximate` when it can't be squared. `buildLlmSpendSummary` computes `LlmSpendSummary` incl. an uncached baseline and `cacheEffectKind` (`saved`/`overhead`/`neutral`). `createZeroLlmSpendSummary`. Formatters: `formatCompactTokens` (k/M), `formatUsd` (2/4/6 digits by magnitude, `~` for approximate — **this is the barrel `formatUsd`**), `formatSpendPrimary/Secondary`, `formatCacheEffectInline`, `formatLlmCostSummary`, `formatModelUsageLog`, `formatModelCostLog`.

### `sse.ts` — incremental SSE parser (also cited by 02/08)
Pure, no network. Owns the streaming token/text types: `LlmUsageMetrics`, `LlmCacheCreationUsage`, `LlmReasoningSignal`, `LlmStreamEvent` (`progress | text-delta | reasoning-observed | reasoning-delta | usage | stop-reason | stream-error | unsupported-chunk`), `SseDialect='anthropic'|'openrouter'`.
- `parseSseEventBlock(block)` — one blank-line-delimited block → `{event,data}` or null.
- `mergeUsage`/`usageEquals` — accumulate partial usage across `message_start`/`message_delta`.
- `usagePayloadSchema`/`streamPayloadSchema` (zod) validate each JSON frame; non-numeric tokens `.catch(undefined)`; tolerates OpenAI-shaped fields (`prompt_tokens`, `prompt_tokens_details.cached_tokens/cache_write_tokens`).
- `normalizeOpenRouterUsage` maps OpenAI-shaped usage to Anthropic-shaped without double-counting (subtracts cached/cache-write from input).
- `class MessagesSseParser(dialect)` — `push(chunk)` returns `LlmStreamEvent[]`; buffers on `/\r?\n\r?\n/` (CRLF-tolerant); after a fatal `stream-error`/`unsupported-chunk` the parser latches `terminated` and returns `[]`. Reasoning detection covers Anthropic thinking blocks and OpenRouter `reasoning` deltas across `delta`/top-level/`choices[]`.

---

## 4. `message-guard/` — banned-content scanning (runtime in 08)

Pure Aho-Corasick-style scanner over normalized text. Files:

- **`types.ts`** — domain types. `GuardCategory=off_platform|red|yellow|custom`, `GuardAction=block|warn|allow`, `GuardDecision=allow|warn|block`, `GuardPolicySource=builtin+local|core`, `GuardRuleKind=term|phrase|regex|structural`, `GuardWhitelistKind=term|domain|email|phone|handle|regex`. `MessageGuardPolicy` (version, builtInVersion, source, yellowMode, customDefaultAction, blockBareHandles, `structural` toggles, rules[], whitelist[]). `GuardSpan`, `GuardVerdict`, `GuardAuditEvent` (the persisted/reportable audit row), and compiled forms (`CompiledGuardRule`, `TrieNode`, `CompiledMessageGuardPolicy`, `MappedText`/`MappedChar` for source-offset mapping).
- **`schema.ts`** — zod `strictObject` mirrors of every type (`messageGuardPolicySchema` caps rules ≤2000, whitelist ≤1000; `guardVerdictSchema`; `guardAuditEventSchema`). Trust-boundary validation for stored/received policies.
- **`defaults.ts`** — `MESSAGE_GUARD_BUILTIN_VERSION='mg-builtin-2026-06-23'`; `BUILTIN_MESSAGE_GUARD_POLICY` (all structural toggles on, yellowMode `block`, two **disabled placeholder** seed rules, one `onlyfans.com` whitelist). **Kill switch (owner 2026-06-24):** `MESSAGE_GUARD_ENFORCEMENT_ENABLED=false` and `DISABLED_MESSAGE_GUARD_POLICY` (all structural off, everything `allow`); `effectiveMessageGuardPolicy(policy)` returns the disabled policy while the flag is false — **actual current behavior is a runtime no-op** regardless of the saved policy.
- **`normalize.ts`** — `normalizeWithMap(raw, aggressive)` → `MappedText` preserving source offsets. Folds NFKC, strips zero-width/bidi ranges, maps a Cyrillic/Greek `HOMOGLYPHS` table to ASCII, and (aggressive/"skeleton") applies `LEET` substitution with letter-context guards + collapses 3+ char repeats. `normalizeForGuard` returns both `canonical` (non-aggressive) and `skeleton` (aggressive) views.
- **`detectors.ts`** — structural detectors gated by `policy.structural.*`: URL/domain (`COMMON_TLDS` list + skeleton-domain + `linktree`/`onlyfto` terms), email (+obfuscated "x at y dot z"), phone (context-signal-gated, 8–15 digits), crypto wallets (ETH/BTC/TRON/SOL regexes), platform handles/URLs, bare `@handle` (when `blockBareHandles`), alt-pay term list (cashapp/paypal/venmo/…/usdt). All emit `off_platform`/`block` spans with source offsets.
- **`compile.ts`** — `compileGuard(policy)`: zod-parses, builds a char trie of enabled non-structural rules over skeleton-normalized terms, applies `effectiveAction` (yellow→block when `yellowMode==='block'`; custom `allow`→`customDefaultAction`), compiles the whitelist. Returns `CompiledMessageGuardPolicy`.
- **`matcher.ts`** — `scanText(compiled, raw)` → `GuardVerdict`. Trie walk over skeleton text yields term spans (with `rawBoundaryOk` word-boundary check unless `allowInsideWords`), merged with structural spans, filtered through `whitelisted()`, overlaps resolved by `mergeSpans` (highest decision rank wins), final `decision` = max span decision.
- **`index.ts`** — re-exports the whole subtree.

---

## 5. `protocol/` — IPC + hub wire schemas (cited by 02/04/06/07)

Single file `protocol/index.ts`. Zod schemas reused over Electron IPC today and hub SSE later; `looseObject` where owning modules extend payloads. Two ID namespaces are documented in the header (`acct_…` vs raw numeric `chat_id===fan.id`, serialized as strings).

**Enums**: `operationFeatureSchema` (from `OPERATION_FEATURES`), `OPERATION_PHASES` (`idle|loading-messages|loading-earnings|generating|completed|cancelled|error`), `replyModeSchema`, `replyToneSchema`, `OPERATION_DISCARD_REASONS` (`chat_changed|cancelled|superseded`).

**Shared fragments**: `userFacingErrorSchema` (**a looseObject with `key`+`code`+`message` — distinct from the errors-module schema**, see §8), `featureResultSchema` (`rawText`, optional `parts`, `splitModeRequested`), `llmSpendSummarySchema` (mirror of `cost.LlmSpendSummary`), `profilingStageSchema`/`profilingSnapshotSchema`, `operationParamsSchema` (`replyTone/replyMode/draftText/forceRegenerate`).

**Operation commands (renderer→main)** — `operationCommandSchema` discriminated union: `operation:start` (operationId, feature, accountId, chatId, params?), `operation:cancel`.

**Operation events (main→renderer)** — `operationEventSchema` union: `operation:progress` (phase, page counters, statusCode, retryAtMs, llmSpend, profiling), `operation:chunk` (streaming text), `operation:complete` (result + llmSpend + profiling), `operation:error` (userFacingError), `operation:discarded` (reason + optional error), `operation:debugPrompt` (debug-mode prompt snapshot).

**Sync events (`syncEventSchema` union)** — the same union rides IPC and hub SSE: `chatListUpdated`, `messageReceived`, `messageSent`, `ppvUnlocked`, `tipReceived` (amountUsd optional — dollars, never fabricated), `presence` (online + lastSeenAt), `typing`, `accountAuthChanged`, `readStateChanged`, `messageDeleted` (chatId optional — upstream omits it, main enriches). The message payload type `NormalizedSyncMessage` (id, text, createdAt, isSentByMe, price, isOpened?, isNew?, isTip?, tipAmountUsd?, tipText?, mediaCount?, media[], replyTo?) is validated `.optional().catch(undefined)` inside received/sent events (tolerant).

**Snapshot/resume** (for the hub read-gateway): `syncSnapshotRequiredSchema` (409 with seq gap), `syncSnapshotMessageSchema`, `syncSnapshotThreadSchema`, `syncSnapshotResponseSchema` (version, cursors, `page`, `coverage` durable/omitted domains, `threads[]`, `unresolvedTombstones[]`, `nextPageCursor`).

**Boundary parse helpers**: `parseOperationCommand`/`parseOperationEvent`/`parseSyncEvent` return the parsed value or `null` (reject) — the "null = reject" legacy guard convention.

---

## 6. `errors/` — CG-* error taxonomy

Single file `errors/index.ts`. `CG_ERROR_CODES` (36 codes) with `CG_ERROR_REGISTRY` giving each a user-facing `message`, `recovery`, and optional `settingsLink`:

| Family | Codes | Meaning (message summary) |
|---|---|---|
| AUTH | `CG-AUTH-01/02` | Claude key not configured / invalid |
| API | `CG-API-01`..`06` | Rate limit / balance / model unavailable / prompt too large / service unavailable / **AI reply unusable (meta/incomplete)** |
| NET | `CG-NET-01/02` | Network failed / timed out |
| FLOW | `CG-FLOW-01`..`09` | No personalities / none mapped / not enough history (≥30) / op already running / fan still active (ping) / conversation changed / app reloaded / compare needs 2 cards / too many messages for greeting |
| FAN | `CG-FAN-02` | OnlyFans session expired (auto-recovers) |
| UI/APP | `CG-UI-01`, `CG-APP-01` | Could not insert / generic fallback |
| OF (OFAPI, new for desktop) | `CG-OF-01`..`08` | Invalid OFAPI key / account auth failed / rate limit / credits exhausted / OF-restricted words / **send could not be confirmed (indeterminate — never auto-retried)** / unsend window passed (24h) / media processing |
| HUB | `CG-HUB-01/02` | Hub auth failed / hub request failed |
| GUARD | `CG-GUARD-01/02` | Message Guard blocked / policy unavailable |

Header notes legacy `CG-FAN-01/03` and `CG-HUB-01..08` were **not** ported; OFAPI gets the new `CG-OF-*` family and hub restarts at `CG-HUB-01`.

Machinery:
- `class CgError extends Error` — carries `code`, `detail?` (`CgErrorDetail`: status/provider/providerMessage/retryAfterMs/retryAtMs/policyVersion/guardSpans), `isOptional`, `retryAtMs`/`retryAfterMs`.
- `userFacingErrorSchema` (**zod strictObject: `code` enum + message + recovery + optional settingsLink/retry** — the barrel-canonical one).
- `createUserFacing`/`describeError`; `toUserFacing(error)` handles CgError, structured-clone copies that lost their prototype over IPC, pre-built user-facing objects, and unknowns (→`CG-APP-01`); applies `providerWordingOverrides` (OpenRouter re-wording of AUTH/API codes so the user fixes the right provider). `formatUserFacing`, `toDebugPayload`.
- `classifyAnthropicHttpError` / `classifyOpenRouterHttpError` — ported decision order + phrase lists (balance/model/context phrase sets) mapping HTTP status+provider info → the right `CG-API-*`/`CG-AUTH-*` code. Comment flags the intentionally-excluded bare phrases ("billing", "not found").

---

## 7. `i18n/` — UI string catalog (EN/RU)

- **`catalog.ts`** — `UI_MESSAGES`, a flat map of ~650 dotted keys, **each key carrying `{ en, ru }`** (a parity test enforces both locales are present). EN values are the shipped UI strings; RU is the owner's chatter-facing interface language. Key prefixes span the whole UI surface: `common`, `settings`, `keys`, `hub`, `models`, `context`, `behavior`, `conv`, `aidock`, `fan`, `vault`, `sp`/`spenders`, `online`, `activity`, `purpose`, `inbox`, `cmd`, `palette`, `danger`, `guard`, `outbox`, `update`, `err.CG-*`, `notif`, `toast`, `mapping`, `crash`, `cheat`, `sb`, `personalities`, `titlebar`. Header documents the convention that technical badge words (POLLING, HUB LIVE, DIRECT, AUTH) and product feature names (Fast Reply, Scan, Ping) stay English in both locales. Prompts are **not** localized.
- **`index.ts`** — `UiLocale='en'|'ru'`, `UiLocaleSetting='system'|UiLocale`, `resolveUiLocale(setting, systemTag)` (BCP-47 `ru*`→ru else en). `uiMessage(locale, key, params?)` interpolates `{name}` placeholders (unknown stay verbatim); `makeTranslator(locale)` → bound `UiTranslator`. Russian/English pluralization: `pluralRu` (CLDR one/few/many), `pluralEn`, `pluralWord`.

---

## 8. `context/` — fan-context blocks fed to prompts

Text shapes are "legacy-locked" (a golden test, `tests/golden-context.test.ts`, asserts byte-stability against committed `context-blocks.txt`). **All amounts are dollars** (no mills conversion).

- **`spending.ts`** — the `FAN SPENDING DATA:` block. Inputs: `SpendingSums` (all-time from OFAPI `subscribedOnData`), `FanTransactionRow[]` (from `/transactions`). `deriveMonthlyTotals`/`deriveMonthlyBreakdowns` bucket rows by **UTC** year-month (unparseable dates skipped); `formatFanSpendingData(data)` emits total, all-time type breakdown (subs/tips/paid messages/paid posts/streams, sorted desc, zero-filtered), monthly totals, monthly breakdown-by-type, and a `(some months could not be fetched)` line when partial. Local `formatUsd`=`$X.XX`, `monthWindowMs`, `transactionLabel` (with `Unknown (type X)` fallback). Empty when `sums` is null.
- **`subscription.ts`** — the `FAN SUBSCRIPTION DATA:` block, UTC dates. Inputs mirror the OFAPI fan object (`subscribedOn`, `subscribedOnExpiredNow`, `subscribedOnData` with prices/promo/`subscribes[]` history). `resolveAutoRenew(data)` (`subscription.ts:53-59`) — documents that OnlyFans exposes **no** boolean auto-renew flag; renew state is derived from the current history entry's `cancelDate` (null⇒renewing, set⇒cancelled/churn-risk), null when unknown. `formatFanSubscriptionData(input, now)` builds status (Active/Expired/Not subscribed), price, promo pricing, "current period ends / period lapsed" (handles the `subscribedOnExpiredNow===false` + past `expiredAt` data-lag case), auto-renew + next renewal, promo details, unsubscribe reason. Does **not** escape (the builder does).

---

## 9. `activity/` — credit + AI-spend modeling (surfaces in 11)

Pure aggregation for the Activity panel; costs stored as integer micro-USD.

- **`purposes.ts`** — `OFAPI_PURPOSES` (14: `hot-poll, deep-sweep, unread-reconcile, hydration, message-tail, chat-refresh, media, scan-deep-fetch, send, vault, spend-sweep, spenders, spenders-refresh, online`) — the compiler-forced tag on every OFAPI call site. `UNTAGGED_PURPOSE='untagged'` (pre-migration rows). `OFAPI_PURPOSE_LABELS` (display strings) + `purposeLabel`.
- **`credit-ledger.ts`** — `buildCreditLedger(entries)` merges (day,purpose) counters into canonical-order rows (zero rows dropped) + totals. `estimateCreditDaysLeft(balance, dailyTotals)` — balance ÷ mean of non-zero recent daily totals; null when no balance/history.
- **`ai-spend.ts`** — `buildAiSpendLedger(rows, today)` over up to 7 days of `AiSpendDayRow` (per UTC day, per feature). Produces today's rows in `FEATURE_ORDER`, `totals` (runs/inserted/`insertableRuns`/tokens/costUsd), `cacheReadShare` (0..1 or null), `topRun`, and `sevenDayUsd` (trailing total across all passed rows). `isInsertableFeature` — true only for `ai-dock` surfaces + `compare` (analysis outputs render read-only → their "inserted" cell is an em dash, not zero). `AI_FEATURE_LABELS` (note "Scan (fan summary)" is the team name for fan-summary), `aiFeatureLabel`.
- **`index.ts`** — curated re-exports of the above.

---

## 10. `transcript/` — OFAPI/hub messages → prompt transcript

- **`ofapi-message.ts`** — zod `looseObject` schemas for the OFAPI chat-message fields the transcript needs (`ofapiChatMessageSchema`: id, text (OF HTML), giphyId, price (dollars), isOpened, isTip, mediaCount, media[], isSentByMe, createdAt (ISO, refined parseable), `tipAmount`). `parseOfapiChatMessages(raw)` validates the `data` array at the boundary.
- **`html.ts`** — `htmlToPlainText(html)`: strips comments, `<br>`/`</p>`→newline, removes other tags, decodes entities **last** in a single pass (`&amp;lt;` stays literal `&lt;`), NBSP→space, trims. No DOM.
- **`normalize.ts`** — `normalizeTranscriptMessages(messages, options)` → ascending `TranscriptMessage[]` (dedupe by id first-wins; sort by createdAt then id). Builds paid-media labels: `ppvStateOf` only trusts the model's own sent messages for purchase state (else `unknown`); single vs bundle media labels (`[Photo]`, `[Media Bundle: N Photos, M Videos — PPV $X.XX, purchased]`), locked-text PPV, `[GIF]`, and tips via a 3-step amount ladder (message `tipAmount` → joined `tipAmountsByMessageId` → bare `[Tip]`; never fabricated). Also: `OFAPI_MESSAGES_PAGE_SIZE=100`, `TRANSCRIPT_EMPTY_WINDOW_MS=90d`, `estimateTargetPages`, `extractOldestMessageId` (next-page cursor), `transcriptWindowStartMs`.
- **`ping-segment.ts`** — `analyzePingSegment(messages, nowMs)`/`resolvePingSegment` implement the exact legacy segmentation: latest fan text within `PING_ACTIVE_WINDOW_MS`(5d, inclusive)⇒`active`; else ≥`PING_MIN_FAN_MESSAGES`(3) fan texts⇒`segment-a`; else `segment-b`. (Re-exports the two ping constants — deduped by the barrel to `constants`.)
- **`format.ts`** — `formatTranscript(messages)` → legacy line shape `[HH:MM] Sender: {labels} {text}` joined by `\n`, **UTC** time (deliberate change from legacy machine-local, for byte-stable shared context). `EMPTY_TRANSCRIPT_TEXT='No conversation history.'`.
- **`index.ts`** — re-exports the subtree.

---

## 11. `spenders/` — spenders board math (surface in 11)

Single file `spenders/index.ts`, pure. `DAY_MS`. Staleness buckets keyed to **fan silence** (`daysSince`, `fanSilenceBucket`: ≤7 none, 8–21 warm, ≥22 hot; null⇒none). `splitTierLabel(rawName)` parses OnlyMonster tier-list names (strips `_OM`/`_ОМ` marker, splits a spend band like `600+`/`(350-600)`). `assignSpenderTiers` maps owner-ordered list ids → fan shelves (first mapped list wins a fan; unmapped spenders → `untiered`). In-shelf ordering `compareBySilence`/`sortBySilence` (longest fan silence first, unknown sinks, ties by lifetime spend then id). Shelf presentation (`SHELF_COLLAPSED_MIN_COUNT=50`, preview 4 first/2 rest). Stats-panel day math (`enumerateDays`, `buildDailySeries`, `periodDelta`, `isNewSpender` with `NEW_SPENDER_EPSILON_USD=1`). Freshness: `THREAD_FETCH_TTL_MS=5min`, `OFAPI_USD_PER_CREDIT=69/20000`, `refreshCostUsd`, `countPendingRefresh`, `isWithinFetchTtl`, `splitUpdateStamp` (today/yesterday/date in **local** calendar). The header records the owner metric decisions (day counters from the local DB, staleness burns until the fan replies even after a ping).

---

## 12. `summary/` — fan-summary cache validity

Single file `summary/validity.ts`. `SUMMARY_EVICTION_BATCH=10`. `SummaryCacheEntry` shape (body, personalityId, `personalityUpdatedAt`, `generatedAt`, optional `spendingVerified`/`subscriptionVerified`/`modelId`/`hubSyncState`). `normalizeSummaryCacheEntry(value)` zod-tolerantly parses a row (drops wrong-typed optional fields rather than rejecting). `isValidSummaryCacheEntry(entry, personalityId, personalityUpdatedAt, modelId)` — the **legacy staleness matrix**: valid only if same personality, personality unedited since generation, `modelSelectionsEquivalent` model (legacy bare ids normalize), **and both verification flags strictly `true`**. Eviction helpers: `collectSummaryCacheEntries`, `invalidSummaryCacheKeys` (corrupt rows), `oldestSummaryCacheKeys`, `selectSummaryEvictionKeys` (corrupt-first then oldest by `generatedAt`, capped).

---

## 13. `output/` — LLM output parsing/sanitizing (runtime in 08)

- **`split.ts`** — `splitByNext` (`[NEXT]` → sequential parts) and `splitByVariant` (`[VARIANT]` → alternative variants); case-sensitive markers, empty parts discarded. Comment: splitting runs only on completed streams, never partial text.
- **`xml.ts`** — lenient tag extraction. `parseHelpMeXml` → `{coaching, engaging, flirty, raw, valid}`; `parseChatReviewXml` → `{rating, evaluation, recommendations, raw, valid}` where `rating` must be a bare integer 1–10 (7.5/"8/10"/negatives fail). `valid:false` signals the caller to fall back to `raw`.
- **`reply-output.ts`** — the SPEC §15 **sanitizer pipeline for every insertable reply**. `sanitizeReplyPart` composes: `stripThinkBlocks` (`<think>`/fenced reasoning) → `removeMetaLeakLines` (drops lines matching the narrow `META_LEAK_PATTERNS` set — "system prompt", "ignore previous instructions", "as an ai", etc., deliberately narrow around "instructions" to avoid stripping in-character JOI lines) → `stripReplyPrefix` ("Here's a reply:") → `stripWrappingQuotes` → `normalizeDashes` (em/en dashes: numeric ranges→`-`, prose→`,`; an explicit anti-AI-tell measure). `isInsertableReplyPart` rejects empty/meta/`BRACKET_GARBAGE` (Gemini stray `[`,`]`,`["`…). `normalizeReplyParts`/`normalizeVariantReplyParts`/`normalizeProvidedReplyParts`/`normalizeSingleReplyPart` map+filter; **an empty result array is the "AI output unusable" signal** (the caller raises `CG-API-06`).

---

## 14. `diagnostics/` — shared logging core

Single file `diagnostics/log.ts`. Pure model shared by the main-process file logger and the diagnostics-export builder. `LOG_LEVELS`/`LogLevel`, `levelRank`, `meetsLevel`. `LogEntry` (`t`, level, scope, msg, optional code + fields). **Secret redaction** (the review-blocking guarantee that logs never carry key material): `redactSecrets(text, secrets)` masks exact live secret values (literal replace, len ≥6) plus token-shaped patterns (`sk-ant-`, `sk-or-`, generic `sk-`, `ofapi_`, `agency_hub_core_`, `Bearer …`) and labelled `key:/token=/authorization:` values; `redactValue`/`redactEntry` deep-redact with depth/array/key/string bounds and circular guards. `errorToFields(error)` flattens thrown values (name/message/stack/`.code`/`.detail`/cause) — surfaces `CgError.code` without importing the errors module. `formatLogLine` (one-line record, newlines→`⏎`). `class RingBuffer<T>` (fixed-capacity FIFO).

---

## 15. `hub/` — Agency Hub client cluster (primary owner: 11; boundary: 02)

Present under `packages/shared/src` but **primarily documented by 11-hub-monetization-activity.md** (metering/spend flow) and **02-external-boundaries.md** (the core wire contract). Structurally:

- **`mode.ts`** — `HUB_MODE_OVERRIDE_SETTINGS=['auto','polling','hub']`, `HubModeOverrideSetting`. Barrel-exported (pure).
- **`page-mapping.ts`** — pure OFAPI-account → core-page-label resolver. `normalizeHubUsername` (trim/strip `@`/lowercase), `matchPageLabelForUsername(username, pages)` (onlyfans-platform pages, strength-ordered tiers username→modelSlug→label, exactly-one-match-per-tier or null — never guesses), `matchAccountToPage`. Barrel-exported (pure; used in settings-mapping UI).
- **`client.ts`** (971 lines) — `createHubClient(options)` REST client for core. **Not barrel-exported; main-process only** (does network via `globalThis.fetch`, structural `HubFetch`/`HubResponseLike` seams for tests). Zod at every response boundary. Surface: `listPages`, `getFanProfile` (404⇒null), `putFanProfile`, `postUsageBatch`, `getOfapiCreditsSummary`, `createOfapiCommand`/`getOfapiCommand`/`cancelOfapiCommand` (the OFAPI command outbox — `HUB_OFAPI_COMMAND_STATES`, discriminated `send_text/send_media/typing/unsend/mark_read` request schemas with price/media validation), `streamAiGateway` (SSE-framed AI gateway, reuses `parseSseEventBlock`), `getServerTimeOffsetMs` (from response `Date` header, feeds the unsend countdown). `class HubError extends CgError` maps `auth`→CG-HUB-01, else CG-HUB-02; `HubFailureReason` distinguishes `bad-request` (deterministic 400 — never blind-retry). `HUB_USAGE_FEATURES` is core's closed enum (`scan` present, `compare` absent).
- **`usage-reporter.ts`** — `createUsageReporter(options)`. **Not barrel-exported; main-process only** (timers via `globalThis`). Persisted, crash-safe usage-event queue (`UsageEventStore` seam) with 1s debounce, 100/batch, retry 5s/15s, drop-after-3, HTTP-400 quarantine, and `completedAt` clamped to server time. Maps `compare`→`fast-reply` at enqueue.
- **`index.ts`** — re-exports all four (this is what `@chatgoose/shared/hub` resolves to).

---

## 16. Tests (invariants locked)

Tests live in `packages/shared/tests/` (sibling to `src`, **not** co-located), run by Vitest. Notable invariants:

- `templates-sync.test.ts` — byte-equality of each `templates.ts` constant with its `prompts/templates/*.md` source (prompts are byte-for-byte).
- `golden-context.test.ts` — byte-stable `formatTranscript` + spending/subscription blocks against committed golden `context-blocks.txt` (regen only via `UPDATE_GOLDEN=1`).
- `escape.test.ts`, `prompt-builder.test.ts`, `personalities.test.ts` — escape order, cache-anchor splitting/fallback, bundled-personality reconcile.
- `model-registry.test.ts`, `capabilities.test.ts`, `llm-cost.test.ts`, `sse.test.ts` — id normalization, thinking/sampling rules, cost math + cache reconciliation, streaming parser (incl. OpenRouter dialect + termination).
- `message-guard.test.ts`, `errors.test.ts`, `protocol.test.ts` — guard scan/normalize/whitelist behavior, CG-* classification + IPC-clone tolerance, schema round-trips.
- `i18n.test.ts` (locale parity + pluralization), `spending.test.ts`/`subscription.test.ts`, `activity.test.ts`, `transcript-*.test.ts`, `ping-segment.test.ts`, `spenders.test.ts`, `summary-validity.test.ts`, `reply-output.test.ts`/`split.test.ts`/`xml.test.ts`, `diagnostics-log.test.ts`, `theme.test.ts`, `constants.test.ts`, `features.test.ts`, and the three `hub-*.test.ts` (client/usage-reporter/page-mapping).

---

## 17. Cross-cutting notes & discrepancies (for the reviewer)

1. **Purity is real but nuanced.** Zero Node/Electron imports package-wide; only `zod`. But `hub/client.ts`, `hub/usage-reporter.ts`, and `llm/sse.ts` perform network/timing via `globalThis` — the barrel excludes the two hub network modules and their headers mark them main-only. `llm/sse.ts` is barrel-exported but is a pure parser (bytes in, events out); it only touches `globalThis` for `TextDecoder`.
2. **Message Guard is currently a no-op.** `MESSAGE_GUARD_ENFORCEMENT_ENABLED=false` (`message-guard/defaults.ts:59`) means `effectiveMessageGuardPolicy` returns the fully-permissive `DISABLED_MESSAGE_GUARD_POLICY` regardless of saved policy — actual runtime behavior differs from what the rich detector/matcher code suggests.
3. **`userFacingErrorSchema` is defined twice with different shapes** — `protocol/index.ts` (looseObject, has a `key` field) vs `errors/index.ts` (strictObject, `code` enum, `recovery`). The barrel exports the errors-module one; the protocol one is used only inside operation-event payloads.
4. **Two `formatUsd`, same name, different output** (`llm/cost.ts` variable-precision-with-`~` vs `context/spending.ts` fixed `$X.XX`); barrel resolves to the cost one. A caller importing `formatUsd` from the package root gets the cost formatter, not the spending one.
5. **Shared `Settings` is a subset** of the desktop's real settings — no `uiTheme`/`uiLocale`/`hubModeOverride`, and `DEFAULT_SETTINGS.agencyHubBaseUrl=''` despite the `DEFAULT_AGENCY_HUB_BASE_URL` constant. Reconcile against doc 04's settings store.
6. **UTC vs local is deliberate and mixed by design**: transcript/context formatting is UTC (byte-stability); spenders stats + `splitUpdateStamp` are the user's local calendar (the caller passes `YYYY-MM-DD`). Not an inconsistency — each is documented at its site.
