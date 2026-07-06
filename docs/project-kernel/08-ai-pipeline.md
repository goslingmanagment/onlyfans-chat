> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# AI Generation Pipeline

## Scope

This doc maps the desktop AI generation engine end to end: from an `ai:start` IPC frame in the renderer, through the main-process coordinator that assembles context, builds a prompt, dispatches an LLM stream, and streams sanitized drafts back to the renderer as `ai:event` frames. It covers the reply/coach/summary/ping engine — the `apps/desktop/src/main/ai/**` subsystem, the alternative Hub AI transport (`apps/desktop/src/main/hub/ai-gateway.ts`), and the banned-content **message-guard runtime** (`apps/desktop/src/main/message-guard/runtime.ts` + `db/queries/message-guard-events.ts`).

It defers:
- The `packages/shared` internals it consumes — prompt builder/templates/personalities/escape, `llm/**` (model registry, capabilities/tuning, cost, SSE parser), `output/**` sanitizers, `message-guard/**` detectors/matcher/compile, `context/**` formatters, `transcript/**` — to **03-shared-package.md** (this doc pins *where* they are called, not how they work internally).
- The wire contracts to Anthropic/OpenRouter and the core hub AI/summary/usage endpoints to **02-external-boundaries.md**.
- The Direct OFAPI HTTP client the context loader reads through to **05-ofapi-client.md**, and read/sync semantics (auto-read) to **06-sync-and-reads.md**.
- The write path where message-guard authoritatively blocks sends (`send/engine.ts`) to **07-send-engine-outbox.md**.
- Encrypted SQLite tables (`usage_events`, `ai_spend_log`, `summaries`, `message_guard_events`) to **09-data-model-storage.md**.
- The renderer AI store, dock, streaming UI, and client-side guard highlighting to **10-renderer-ui.md**.
- Usage/spend metering to core (credit ledger, page resolution, usage reporter) to **11-hub-monetization-activity.md** — this doc only marks the *emit points*.

Every claim below is grounded in current source, not prose specs.

---

## 1. File inventory (owned)

| File | Lines | Role |
|---|---|---|
| `apps/desktop/src/main/ai/coordinator.ts` | 1094 | Orchestrator: operation lifecycle, concurrency, context→prompt→stream→result, cancellation, streaming to renderer, usage/spend emit, fan-summary caching. |
| `apps/desktop/src/main/ai/context-loader.ts` | 551 | Assembles transcript + fan spending/subscription/bio context from local DB + fetch-through OFAPI. |
| `apps/desktop/src/main/ai/gateway.ts` | 135 | `AiGateway` seam: `createDirectGateway` (keychain→providers), `createSelectableAiGateway` (direct vs hub by `req.transport`). |
| `apps/desktop/src/main/ai/providers/index.ts` | 58 | `routeStream`: picks provider from model registry, checks key, dispatches. |
| `apps/desktop/src/main/ai/providers/anthropic.ts` | 95 | Anthropic Messages streaming client (raw fetch + shared SSE parser). |
| `apps/desktop/src/main/ai/providers/openrouter.ts` | 87 | OpenRouter (Anthropic-Messages-compatible) streaming client. |
| `apps/desktop/src/main/ai/providers/transport.ts` | 290 | Shared plumbing: Retry-After parse, abortable delay, error-body zod, block→wire mapping, SSE pump, legacy pre-first-chunk retry loop. |
| `apps/desktop/src/main/ai/providers/key-probe.ts` | 71 | Free key-validity probes (Settings → Test): Anthropic `GET /v1/models`, OpenRouter `GET /api/v1/key`. |
| `apps/desktop/src/main/ai/providers/types.ts` | 66 | Provider streaming type contract (`LlmStreamRequest`, `StreamCallbacks`, `FetchImpl`, keys). |
| `apps/desktop/src/main/ai/timeouts.ts` | 119 | Staged operation timers (quick-total vs deep prep→ttfb→idle/max-stream). |
| `apps/desktop/src/main/ai/profiler.ts` | 137 | Debug-only per-stage profiler (NO-OP in production). |
| `apps/desktop/src/main/ai/index.ts` | 31 | AI-layer barrel + composition-root wiring comment. |
| `apps/desktop/src/main/hub/ai-gateway.ts` | 90 | Alternative AI transport streaming the provider call through core (Hub-AI). |
| `apps/desktop/src/main/message-guard/runtime.ts` | 203 | Banned-content scan/assert/audit runtime (policy compile, `scan`, `assertAllowed`). |
| `apps/desktop/src/main/db/queries/message-guard-events.ts` | 198 | `message_guard_events` insert/prune/count/report. |

The whole subsystem is **main-process only** (SPEC §15.1 invariant: secrets/network never reach the renderer). The provider files, gateway, and key-probe all comment this explicitly.

---

## 2. End-to-end trace: one fast reply

This is the concrete happy path so the reviewer sees the full pipeline. Anchors are `file:line` or symbol.

1. **Renderer start.** `startAiFeature('fast-reply', …)` in `apps/desktop/src/renderer/src/features/ai/aiStore.ts:365` mints `crypto.randomUUID()` as `operationId`, builds `params` (tone = override ?? default, mode = `preferSplit`/`default`), and calls `getBridge().invoke('ai:start', {operationId, feature, accountId, chatId, params})`. A per-conversation concurrency cap of `MAX_RUNNING_JOBS = 3` is enforced renderer-side (`aiStore.ts:97,305`); re-running the same chat cancels the existing running job first (`aiStore.ts:318-324`).
2. **IPC into main.** `ipcMain.handle('ai:start', …)` at `apps/desktop/src/main/ipc/handlers.ts:814` zod-parses the args (`aiStartSchema`), rejects if no coordinator is wired ("configure an LLM API key"), rebuilds the `AiStartRequest`, and calls `deps.coordinator.start(req)` (`handlers.ts:833`).
3. **Coordinator admission (synchronous, pre-await).** `start(req)` (`coordinator.ts:992`) re-validates with `aiStartRequestSchema` (`coordinator.ts:158`, trust boundary — IPC args may be anything). It rejects: `compare` → deferred error frame (`coordinator.ts:1010`), duplicate `operationId` → silent no-op (`coordinator.ts:1006`), a conversation that already has an in-flight op → `CG-FLOW-04` error frame (`coordinator.ts:1016`). It builds `OperationState` (`coordinator.ts:1021`), then **synchronously reserves** `byConversation` + `byId` and arms timers *before* the first await (`coordinator.ts:1050-1052`, legacy TOCTOU guard). Finally it launches `runPipeline(op)` and attaches a catch that funnels any throw to `settleError` (`coordinator.ts:1054`).
4. **Settings + identity.** `runPipeline` (`coordinator.ts:712`) awaits `settingsStore.get()`, swaps in a live profiler if `debugMode` (`coordinator.ts:717`), resolves the account's **personality** (`resolvePersonality`, `coordinator.ts:650` — reads the saved list from the `personalities` settings key or falls back to `createBundledPersonalities()`; `CG-FLOW-01` if empty list, `CG-FLOW-02` if the account has no/invalid mapping), resolves `modelId` and `reasoningEffort` from `settings.featureModels`/`featureReasoning` with `DEFAULT_FEATURE_MODELS`/`DEFAULT_FEATURE_REASONING` fallbacks (`coordinator.ts:724-727`), records `op.aiGatewayTransport = settings.aiGatewayTransport` (`coordinator.ts:729`), and `checkProviderKey` (`coordinator.ts:679`) — for Direct transport, `CG-API-03` if the model is unknown and `CG-AUTH-01` if the provider secret is absent in the keychain; hub transport skips the local key check.
5. **Context — transcript.** Emits `operation:progress phase=loading-messages`, then `loader.loadTranscript(...)` (`coordinator.ts:788`, loader at `context-loader.ts:390`). `resolveMessageCount` picks the window (fast-reply → `settings.quickMessageCount`). `allowFetchThrough = settings.autoReadChats` — **auto-read OFF suppresses any OFAPI body read** so AI never marks a fan read (`coordinator.ts:794`, loader `needed=0` at `context-loader.ts:404`). Gates: `minMessages` → `CG-FLOW-03` (0 for fast-reply, so no gate).
6. **Context — earnings/subscription.** fast-reply's policy has `includesEarnings: true`, so it emits `loading-earnings` and calls `loader.loadSpendingBlock` + `loader.loadSubscriptionBlock` (`coordinator.ts:850-880`). These are optional/degrading stages (fetch failure → unverified DB fallback, never throws — see §5).
7. **Prompt build.** Emits `generating`, resolves `replyTone`/`replyMode` from policy + params, and calls `buildPrompt({feature, personality, transcript, fanSpendingData, fanSubscriptionData, fanDisplayName, …})` (`coordinator.ts:888`, builder `packages/shared/src/prompts/builder.ts:319`). If `!settings.promptCachingEnabled`, cache markers are stripped via `stripPromptCache` (`coordinator.ts:903`). In debug mode it emits an `operation:debugPrompt` frame with the exact blocks (`coordinator.ts:909`). **The safety preamble, `escapeForPrompt`, and cache anchoring all happen inside `buildPrompt` — see §6.**
8. **LLM dispatch.** `op.timeouts.llmRequestStarted()` (`coordinator.ts:933`) and `gateway.stream(request, callbacks)` (`coordinator.ts:935`). The request carries `feature, modelId, systemBlocks, userBlocks, reasoningEffort, clientRequestId=operationId, accountId, chatId, isRegeneration, transport`.
9. **Gateway → provider.** `createSelectableAiGateway` routes by `req.transport` (`gateway.ts:128`). Direct: `createDirectGateway.stream` (`gateway.ts:47`) reads both provider keys from the keychain at call time (`gateway.ts:71`), then `routeStream` (`providers/index.ts:30`) resolves the model registry entry, picks `streamAnthropic`/`streamOpenRouter`, and drives the SSE pump.
10. **Streaming callbacks.** As deltas arrive, the provider SSE pump (`transport.ts:184` `pumpSseStream`) fires `onText`/`onProgress`/`onReasoningObserved`/`onUsage`/`onStopReason`. The coordinator's `onText` (`coordinator.ts:959`) closes the TTFB profiler stage on the first chunk, arms streaming timeouts, and **batches** chunks in a 50 ms buffer (`STREAM_CHUNK_FLUSH_MS`, `bufferChunk`/`flushChunks` at `coordinator.ts:379-402`) that emits `operation:chunk` frames.
11. **Completion.** Provider resolves the full raw text → `DirectGateway` fires `onComplete(rawText)` (`gateway.ts:99`) → coordinator `settleComplete` (`coordinator.ts:432`): flushes remaining chunks, runs the **output sanitizer pipeline** `buildFeatureResult` (`coordinator.ts:285`) — for reply features this is `normalizeReplyParts` (see §7). Empty result → `CG-API-06`. Then computes spend (`trySpendSummary`), records the usage event + spend ledger (`recordUsageEvent`, §9), snapshots the profiler, and emits `operation:complete` with `result`, optional `llmSpend`, optional `profiling`.
12. **Renderer render.** `bridge.on('ai:event', …)` (`apps/desktop/src/renderer/src/bridge/events.ts:209`) parses the frame and dispatches `handleAiOperationEvent`; on `operation:complete` it invalidates the sync-status/activity/ai-cost query keys (`events.ts:214`). The dock renders the sanitized parts; the operator explicitly inserts/sends (AI never auto-sends — SPEC §15 invariant).

---

## 3. Task types (features) and per-task policy

The coordinator handles the seven `OperationFeature`s; `compare` is admitted but short-circuited to a deferred error (`coordinator.ts:1010`, `compareDeferredError`). Policy is data-driven from `FEATURE_POLICIES` in `packages/shared/src/features.ts` (owned by 03), read via `getFeaturePolicy`.

| Feature | Result kind | Prompt mode | Timeout bucket | Msg-count bucket | Earnings | Min msgs | Notes |
|---|---|---|---|---|---|---|---|
| `fast-reply` | `reply` (`[NEXT]` split) | reply | quick | `quick` | yes | 0 | Tone + split-mode supported. Golden: `tipper`, `rich-spender`. |
| `improve-draft` | `single-reply` | reply | quick | `improve` | yes | 0 | `requiresDraft`; `CG-APP-01` if draft blank (`coordinator.ts:736`). |
| `help-me` (coaching) | `xml` (`<coaching>/<engaging>/<flirty>`) | analysis | quick | `quick` | yes | 0 | Parsed by `parseHelpMeXml`; invalid XML falls back to raw. |
| `fan-summary` | `single-reply` (rendered raw) | analysis | **deep** | `deep` | yes | 30 (`MIN_MESSAGES_FOR_DEEP`) | Cache-first + hub prefetch/push (§8); the **only cached** feature. |
| `chat-review` | `xml` (`<rating>/<evaluation>/<recommendations>`) | analysis | **deep** | `deep` | yes | 30 | Never cached. `refresh` rerun action. Golden: `rich-spender`. |
| `ping` (reactivation) | `reply` | reply | quick | `ping` | yes | 0 | Runs `analyzePingSegment`; **active fan → `CG-FLOW-05`** (`coordinator.ts:819-826`). Golden: `rich-spender/reference-ping.md`. |
| `hi-greeting` | `reply` (`[VARIANT]` split, 3 alternatives) | reply | quick | `hi` (fixed `HI_GREETING_MESSAGE_COUNT=25`) | no | 0 | Also loads fan **bio** (`loadFanBio`); `>HI_GREETING_MAX_TRANSCRIPT(10)` msgs → `CG-FLOW-09`. |

`resolveMessageCount` (`coordinator.ts:268`) maps the bucket to a settings field; `hi` is hard-fixed. `isDeepFeature` (`features.ts`) drives cache-first transcript paging and the deep timeout ladder. `resolveFeatureModelFeature` collapses `improve-draft`+`hi-greeting` onto the `fast-reply` model slot (`features.ts`).

**Golden fixtures** (`tests/fixtures/golden/{tipper,rich-spender,short-convo}/`): each has an anonymized `input.json` (live OFAPI capture), a locked `context-blocks.txt`, and `reference-<feature>.md` reviewed outputs. `tipper` = medium history with tip messages (exercises the tipText transcript substitution). `rich-spender` = 100-msg $582 lifetime spender whose user-details endpoint 404s (exercises the spending fail-open/unverified path). `short-convo` = below-deep-threshold case. The generator `apps/desktop/tests/golden-gen/generate.test.ts` runs the *real* shared pipeline (normalizer → formatters → `buildPrompt` → real provider stream → `buildFeatureResult`) behind `GOLDEN_GEN=1 + ANTHROPIC_API_KEY`; a structural-check `describe` always runs in CI to validate committed references.

---

## 4. Coordinator internals

### Operation state & lifecycle
`OperationState` (`coordinator.ts:212`) holds `abort: AbortController`, `cancelStream: CancelFn | null`, `timeouts`, `profiler`, `settled`, `usage`, chunk buffer/timer, `startedAtMs`, `aiGatewayTransport`, and (fan-summary only) `summarySeed`. Two registries key it: `byConversation` (`accountId|chatId`) and `byId` (`operationId`).

**Concurrency model:** at most **one operation per conversation** enforced by the synchronous `byConversation` reservation in `start` (`coordinator.ts:1016,1050`); a second start on the same conversation gets `CG-FLOW-04`. Cross-conversation concurrency is otherwise unbounded in main; the renderer imposes the 3-job global cap. `conversationOpened`/`conversationClosed` are deliberate **no-ops** (`coordinator.ts:1068-1077`): navigation no longer owns the AI lifecycle — background generations keep running while the operator moves between fans; only explicit `ai:cancel`/`dispose` discards an op.

**Settlement (single terminal path via `beginSettle`, `coordinator.ts:407`):** flips `settled`, clears all timers, and removes both registry entries; returns `false` when already settled so stale provider events are silently dropped. Terminal variants: `settleComplete` (`coordinator.ts:432`), `settleCachedSummary` (`coordinator.ts:517`, zero-spend cache hit), `settleError` (`coordinator.ts:535`), `discard` (`coordinator.ts:549`, emits `operation:discarded`). Every op-mutating callback re-checks `op.settled` before acting.

**Cancellation:** `cancel(operationId)` (`coordinator.ts:1061`) → `discard(op, 'cancelled')`. `discard`/`settleError` call `stopStream` (`coordinator.ts:420`) which `abort.abort()` + best-effort `cancelStream()`. `dispose()` (`coordinator.ts:1086`) discards every live op and clears listeners. Aborts are silent (no error frame) — the provider layer rejects an aborted stream without firing `onError` (`gateway.ts:99-104`, `transport.ts` abort handling).

**Chunk batching:** `bufferChunk` accumulates deltas and schedules a single `setTimeout(STREAM_CHUNK_FLUSH_MS=50)` flush (`coordinator.ts:392`); `flushChunks` emits one coalesced `operation:chunk`. This is the legacy 50 ms relay-buffer behavior — the sanitizer never runs on partials, only on the terminal raw text (`coordinator.ts:284` comment, and `output/split.ts:1`).

**Events emitted** (`OperationEvent`, shared protocol): `operation:progress`, `operation:chunk`, `operation:debugPrompt`, `operation:complete`, `operation:error`, `operation:discarded`. A faulty subscriber cannot break the pipeline — `emit` swallows listener throws (`coordinator.ts:334`). Subscription is wired to `webContents.send('ai:event', …)` in `apps/desktop/src/main/ipc/events.ts:87`.

### Staged timeouts (`timeouts.ts`)
`createStagedTimeouts` keys off the feature's `timeoutBucket`. **Quick** features run under a single `quick-total` timer (`QUICK_OPERATION_TIMEOUT_MS=60_000`). **Deep** features stage: `deep-prep` (`180_000`) until the LLM request is dispatched, then `llm-ttfb` (`45_000`), then on first activity `llm-idle` (`45_000`, reset per chunk) + `llm-max-stream` (`300_000`). Critical detail (`timeouts.ts:2-5`, legacy 1.3.10): **TTFB clears on the first provider *activity* signal (`providerActivity`), not the first text chunk** — Claude thinking blocks arrive before text and must not trip a false TTFB timeout. Any timer firing → `settleError(op, CG-NET-02 {providerMessage: key})` (`coordinator.ts:1032`). `clearAll` sets a `dead` flag so a late timer never re-arms.

### Profiler (`profiler.ts`)
Active only in debug mode; otherwise `NO_OP_PROFILER` (`profiler.ts:44`) so production ops pay nothing. Stage keys map to legacy labels (`PROFILER_STAGE_LABELS`, `profiler.ts:8`): resolve-identity, summary-cache-check, load-messages, ping-analysis, account-name-lookup, earnings, subscription-lookup, prompt-build, llm-ttfb, llm-stream. `snapshot()` returns `elapsedMs`, active label, log entries, and per-stage records; `failActive` marks any still-running stage failed on the error/discard path. The snapshot rides on `operation:complete`/`error`/`discarded` frames.

---

## 5. Context loader (`context-loader.ts`)

`createContextLoader({data, client})` (`context-loader.ts:279`). Sources are **local DB first, fetch-through the metered OFAPI client second** (GET-only; P3 is read-only toward OFAPI). All block text is produced by the shared legacy-locked formatters and values are passed **RAW** — escaping happens inside the prompt builder, never here (`context-loader.ts:1-7` explicitly warns escaping here would double-escape).

**`loadTranscript`** (`context-loader.ts:390`): pages the local `messages` table, then optionally fetch-throughs. Fetch-through is gated on `allowFetchThrough` (= `settings.autoReadChats`) because `GET /messages` marks the chat read on OnlyFans; when off, `needed=0` and the transcript is served purely from cached rows. **Quick** features re-fetch the whole window from the top; **deep** features are cache-first and fetch only the *gap* older than the oldest cached row, cursoring by `firstId` (`context-loader.ts:404-450`). Paging is capped at `min(estimateTargetPages(needed), DEEP_FETCH_MAX_PAGES=30)` with `MESSAGES_PAGE_LIMIT=100` per page and `OFAPI_INTER_PAGE_DELAY_MS=300` pacing. Fetch failures **fail open** onto whatever is local (except the empty-local-and-empty-fetched case, which rethrows). Purpose tag is `scan-deep-fetch` (deep) or `message-tail` (quick) for the metering ledger. Tip rows substitute `tipText` for `text` (`rowToTranscriptInput`/`fetchedToTranscriptInput`, `context-loader.ts:121,140`); merged newest-first with dedupe keeping the first (fresh) occurrence, then `slice(-count)`.

**`resolveFanDisplayName`** (`context-loader.ts:468`): custom name > name > chat-row fan name > raw `chatId` (SPEC §8.2 precedence).

**`loadSpendingBlock`** (`context-loader.ts:486`): live `getUsersByIds` mass-list detail (5-min `userCache`, `FAN_DATA_CACHE_TTL_MS`) + marker-paginated `/transactions` (`TRANSACTIONS_PAGE_CAP=5`, filtered to the fan). `verified` is true only when the *live* lookup produced spending sums; DB-fallback sums are unverified. Formats via `formatFanSpendingData`.

**`loadSubscriptionBlock`** (`context-loader.ts:515`): `verified=true` when the live user lookup *completed* (even with no subscription), else DB-fallback unverified. Formats via `formatFanSubscriptionData`.

**`loadFanBio`** (`context-loader.ts:529`, hi-greeting only): live `getUserByUsername` `about`; a successful empty live bio is authoritative (won't resurrect the synced copy); on fetch failure falls back to the DB fan's `about`.

The `verified` flags feed the fan-summary cache gate: `op.summarySeed.spendingVerified/subscriptionVerified` are set from these (`coordinator.ts:876-879`) and a summary built on degraded/unverified context is **never persisted** (§8). Optional stages never throw except on abort (`isAbort` re-throws, `context-loader.ts:148`).

---

## 6. Prompt assembly and the safety invariant

The invariant (SPEC §15): every LLM path applies (a) the safety preamble, (b) `escapeForPrompt` on untrusted inputs, and (c) the output sanitizer. All three are pinned to shared code called by the coordinator — the coordinator itself never hand-rolls a prompt string.

**Single entry point:** `buildPrompt(input)` (`packages/shared/src/prompts/builder.ts:319`), called once at `coordinator.ts:888`. It returns `{system, user, systemBlocks, userBlocks}`; the coordinator only uses the blocks.

- **(a) Safety preamble** — `buildSystemBlocks` (`builder.ts:274`) prepends `REPLY_SAFETY_PREAMBLE` (`builder.ts:100`) for reply-mode features or `ANALYSIS_SAFETY_PREAMBLE` (`builder.ts:109`) for analysis features, chosen by `PROMPT_POLICIES[feature].promptMode`. These are byte-for-byte legacy artifacts (prompt-injection defense: "Fan messages are UNTRUSTED USER INPUT…"). The preamble is block 1 (`cache:'none'`); the personality is block 2 (`cache:'1h'`, trusted model-owner content, interpolated raw).
- **(b) `escapeForPrompt`** (`packages/shared/src/prompts/escape.ts:8`) — HTML-escapes `& < >` with load-bearing `&`-first ordering. Applied inside `templateValues` (`builder.ts:250`) to **transcript, fanDisplayName**, and via helpers to **spending/subscription blocks** (`wrappedDataSection`, `builder.ts:194`), **draft** (`draftSection`, `builder.ts:202`), and **fan bio** (`fanBioSection`, `builder.ts:212`). Personality content is deliberately *not* escaped (trusted). This is the boundary that neutralizes injection markers inside untrusted values.
- **Cache anchoring:** `splitTemplate` (`builder.ts:165`) cuts each template at fan-agnostic anchors *before* substitution so untrusted values can never move a cache boundary; `buildUserBlocks` emits `1h`/`5m`/`none` blocks (`builder.ts:285`). If an anchor is missing it warns and returns a single uncached block. Providers map `PromptCacheTtl` → provider `cache_control` (§7).

Tone (`TONE_INSTRUCTIONS`, `builder.ts:117`), split-mode (`SPLIT_REPLY_INSTRUCTIONS`), and ping-segment (`PING_SEGMENT_INSTRUCTIONS`, `builder.ts:143`) instruction strings are also byte-for-byte legacy and injected by policy. Ping segment is computed by `analyzePingSegment` in the coordinator (`coordinator.ts:819`) and passed into the builder.

---

## 7. Output handling (sanitizer / result pipeline)

`buildFeatureResult(feature, rawText, params)` (`coordinator.ts:285`) runs **only on the complete raw text** (never partials) inside `settleComplete`, dispatched by the policy's `resultKind`:

- **`reply`** → `normalizeReplyParts` (`[NEXT]` split) or, for hi-greeting, `normalizeVariantReplyParts` (`[VARIANT]` split). Empty → `CG-API-06`. Carries `splitModeRequested`.
- **`single-reply`** → `normalizeSingleReplyPart`. Empty → `CG-API-06`.
- **`xml`** → `parseChatReviewXml` / `parseHelpMeXml`. Empty raw → `CG-API-06`; **invalid XML is NOT an error** — the frame carries `valid:false` and the renderer falls back to `rawText` (`coordinator.ts:311-319`).

The **(c) output sanitizer** lives in `packages/shared/src/output/reply-output.ts` (owned by 03). `sanitizeReplyPart` (`reply-output.ts:91`) chains: `stripThinkBlocks` → `removeMetaLeakLines` (the `META_LEAK_PATTERNS` set, `reply-output.ts:13`, defends against system-prompt / "as an AI" / Gemini-leak lines) → `stripReplyPrefix` → `stripWrappingQuotes` → `normalizeDashes` (em/en-dash → comma, an AI tell). `isInsertableReplyPart` drops empty parts and Gemini JSON-array bracket garbage. Splitting is in `output/split.ts` (case-sensitive markers, empty parts discarded). XML extraction is lenient tag matching (`output/xml.ts`). An empty sanitized array is the "AI output unusable" signal → `CG-API-06`.

**Provider request building & model selection** (`anthropic.ts`/`openrouter.ts`): `getProviderModelId(req.modelId)` resolves the wire model id from the registry (03); temperature = `req.temperature ?? getFeatureTemperature(req.feature)` (`FEATURE_TEMPERATURES`, e.g. fast-reply 0.65, chat-review 0.25); `resolveAnthropicRequestTuning`/`resolveOpenRouterRequestTuning` (shared `llm/capabilities`) resolve `max_tokens`, thinking config, and the temperature/thinking exclusivity (legacy 1.3.6 incident — Anthropic drops temperature when thinking is on; OpenRouter always sends temperature). Anthropic maps blocks with `toCacheControlBlocks` (preserves cache hints); OpenRouter strips them via `toPlainTextBlocks` (`transport.ts:154,164`).

---

## 8. Fan-summary caching + hub summary hooks

Fan-summary is the only feature with a cache. Order (`coordinator.ts:742-782`), consulted **before** any context loading:
1. `forceRegenerate` → delete the cached entry and regenerate (`summaries.remove`).
2. Else read local `summaries.get`; if `isValidSummaryCacheEntry(entry, personality.id, personality.updatedAt, modelId)` → `settleCachedSummary` (zero-spend complete frame with `cached:true`).
3. Else `tryPrefetchSummary` (hub) — a non-null hub body is adopted as a verified cache entry and settled cached.
4. Else seed `op.summarySeed` with `spendingVerified/subscriptionVerified = false` (filled in later by the loader).

On generation completion, `persistFanSummary` (`coordinator.ts:474`) writes the entry **only when both verification flags are true** (a summary built on degraded context must not be cached authoritatively), and `pushFanSummary` fires the fire-and-forget hub push. `chat-review` is never cached.

The hooks are optional seams on `AiCoordinatorDeps` (`SummaryHubHooks`, `coordinator.ts:79`). In production they are supplied by `apps/desktop/src/main/hub/summary-hooks.ts` via `createSummaryHubHooks` (owned/detailed by 11). Key behaviors relevant here: prefetch owns a 5 s budget and only adopts a hub profile *newer* than local cache (`summary-hooks.ts:78-128`); push enforces a 50 KB `HUB_PROFILE_MAX_BYTES` gate and a 10 s budget; both are no-throw. The hub module (`hub/index.ts:83`) wraps them as stable delegators that resolve null / no-op when the hub is unconfigured.

---

## 9. Spend/cost accounting hook points (emit only — owned by 11)

On every terminal completion the coordinator calls `recordUsageEvent` (`coordinator.ts:585`), which writes to **two** stores:

1. **`usage_events`** (pending hub-flush queue) — an `INSERT … ON CONFLICT (client_event_id) DO NOTHING` keyed on `operationId` (`coordinator.ts:609`). **Skipped when `op.aiGatewayTransport === 'hub'`** (hub-AI reports usage server-side, so desktop must not double-count — `coordinator.ts:607`). Then `deps.onUsageEvent?.(payload)` fires the delivery hook (also hub-transport-gated, `coordinator.ts:639`), wired to `nextHub.onUsageEvent` (`index.ts:669`).
2. **`ai_spend_log`** (durable daily counters the Activity panel aggregates) — `deps.data.aiSpendLog.recordRun(...)` (`coordinator.ts:625`), written for **all** transports. Cost in `costMicroUsd` from `buildLlmSpendSummary(modelId, usage)` (`trySpendSummary`, `coordinator.ts:569` — unknown-model pricing yields `undefined`, never fatal).

Cache-hit summaries record a usage event with `isCacheHit:true` and zero spend (`settleCachedSummary` → `recordUsageEvent(op, undefined, {isCacheHit:true})`, `coordinator.ts:521`). `isRegeneration` rides `params.forceRegenerate`. Both writes are wrapped so bookkeeping never fails a completed operation. The `spend` object also rides the `operation:complete` frame as `llmSpend`. Acceptance-rate feedback (copy/insert) is recorded separately via `cmd:ai.feedback` (`handlers.ts:844`). The full metering/reporting/credit-ledger chain is **11-hub-monetization-activity.md**.

---

## 10. Hub AI gateway path (alternative transport)

`createSelectableAiGateway` (`gateway.ts:128`) picks `hub` vs `direct` from `req.transport` (= `settings.aiGatewayTransport`). Direct is the default; Hub-AI is behind the rollout flag. The composition root wires both (`index.ts:664-667`).

`createHubAiGateway` (`hub/ai-gateway.ts:30`) keeps **prompt/context construction in desktop** and streams only the provider call through core: it resolves `accountId → pageLabel` (`resolvePageLabel`; null → `HubError bad-request`), then `client.streamAiGateway({request:{clientRequestId, feature, pageLabel, platform:'onlyfans', platformUserId/conversationId=chatId, model, reasoningEffort, temperature?, maxTokens?, isRegeneration, prompt:{systemBlocks, userBlocks}}}, callbacks)`. `toHubFeature` maps `compare → fast-reply` (`ai-gateway.ts:15`). Callbacks forward `onProgress/onReasoningDelta/onStopReason/onUsage/onText`; on full resolve fires `onComplete(rawText)`, errors wrapped as `CG-HUB-02`. The `hub/index.ts` `aiGateway` delegator errors with `HubError bad-request` if the hub is unconfigured (`index.ts:89-101`). The gateway interface is transport-agnostic, so the coordinator's lifecycle is identical for both; the only coordinator-visible difference is the usage-event double-count guard (§9).

---

## 11. Message-guard runtime (banned-content scanning)

Important actual behavior vs. what the assignment framing might suggest: **the AI coordinator does NOT run message-guard over generated drafts.** Guard scanning is orthogonal to generation and runs at two other points:

1. **Authoritative block at send time** — `send/engine.ts:200` calls `messageGuard.assertAllowed({accountId, chatId, text, surface, transport: HUB_WRITE_TRANSPORT, mediaCount?, price?})` before a message is enqueued to the outbox (detailed in 07). A `block` verdict throws `CG-GUARD-01` and audits; `warn` audits but proceeds.
2. **Client-side display/pre-send highlighting** — the renderer runs a compiled copy of the policy locally (`renderer/src/features/conversation/guardLogic.ts`) to highlight spans and pre-check drafts (`scanDraftForDisplay`, `scanDraftPartsForSend`), and can call the main runtime on demand via `query:guard.scan` IPC (`handlers.ts:536` → `runtime.scan`). These are advisory; the send-engine assert is the enforcement point.

**Runtime** (`message-guard/runtime.ts`, `createMessageGuardRuntime`): reads `messageGuardPolicy` from settings (falls back to `BUILTIN_MESSAGE_GUARD_POLICY`), validates with `messageGuardPolicySchema`, applies `effectiveMessageGuardPolicy`, and **compiles once and caches** keyed on `version|builtInVersion|JSON(policy)` (`runtime.ts:93-116`); an invalid/uncompilable policy keeps the last-known compiled policy or throws `CG-GUARD-02`. `timedScan` (`runtime.ts:118`) truncates input to 20 000 chars, runs shared `scanText`, and logs when `>= LONG_SCAN_MS (16ms)` or in debug mode. Detection logic (`detectors`/`matcher`/`normalize`/`compile`) lives in `packages/shared/src/message-guard/**` — owned by 03. Public surface: `getPolicy`, `updatePolicy` (persists + publishes a `guard` bus event), `scan`, `assertAllowed`, `blocks`, `pruneExpired`.

**Audit** (`runtime.ts:133` `audit`): for each verdict span it inserts a `message_guard_events` row (SHA-256 `messageHash` of the raw text, plus decision `blocked`/`warned`, category, ruleId, ruleLabel, matched original/normalized, span offsets, media/price), then prunes rows older than `TTL_MS` (90 days). Composed by the runtime; `assertAllowed` audits on both block and warn.

**Persistence queries** (`db/queries/message-guard-events.ts`): `insert` (publishes a `guard` bus event scoped to account/chat), `pruneOlderThan`, `count`, and `report` — the last returns aggregate counts `byDecision`/`byCategory`/`byRule` plus a recent list (limit clamped 1–200, default 50), scoped optionally by `accountId`. Every read is zod-validated at the DB boundary. `report`/`blocks` feed the Settings guard-audit panel and diagnostics (`index.ts:1105`). Table schema/migration is 09.

---

## 12. Provider transport, retry, and SSE plumbing

`providers/transport.ts` is the shared engine under both providers:

- **SSE pump** `pumpSseStream` (`transport.ts:184`): drives the shared `MessagesSseParser` (03) over the response body, dispatching `progress`/`text-delta`/`reasoning-observed`/`reasoning-delta`/`usage`/`stop-reason` to callbacks and throwing on `stream-error`/`unsupported-chunk`. The reader is always released (including mid-stream throw/abort). A consumer abort cancels the pending `read()` even for mocked transports.
- **Dialects:** `SseDialect` is `'anthropic' | 'openrouter'` (`packages/shared/src/llm/sse.ts:222`); Anthropic passes `dialect:'anthropic'`, OpenRouter `dialect:'openrouter'` (handles OpenAI-shaped usage + `reasoning_delta`).
- **Legacy pre-first-chunk retry** `runWithLegacyRetry` (`transport.ts:250`): retries **only before the first text chunk** and **at most once per kind** — `CG-API-01` (429) when `retryAfterMs <= AUTO_RETRY_RATE_LIMIT_MAX_MS (60_000)` waits Retry-After; `CG-API-05` (503/service-unavailable) waits a fixed `AUTO_RETRY_SERVICE_UNAVAILABLE_MS (5_000)`. This lives **inside** the providers — the coordinator must not add a second retry layer (`coordinator.ts:10-12`). Terminal `CgError`s fire `onError` exactly once before rejecting; aborts reject without `onError`.
- **Error classification:** HTTP non-2xx → `classifyAnthropicHttpError`/`classifyOpenRouterHttpError` (03) with parsed error body (zod, `transport.ts:68`) and Retry-After; transport failures → `CG-NET-01` (`fetchProvider`, `transport.ts:114`).
- **`routeStream`** (`providers/index.ts:30`): unknown model → `CG-API-03`; missing provider key → `CG-AUTH-01` with `{provider}` detail (drives per-provider wording).

**Key probes** (`key-probe.ts`): free GET endpoints with a 10 s `AbortSignal.timeout`; reuse the same HTTP-error classifiers (401/403 → `CG-AUTH-02`, offline → `CG-NET-01/02`). Wired to `cmd:keys.test` (`handlers.ts:551`).

---

## 13. Error taxonomy touchpoints

CG-coded errors surface as `operation:error` frames via `toWireError(toUserFacing(error))` (`coordinator.ts:242,344`). Notable coordinator-raised codes: `CG-APP-01` (bad request / missing draft / keychain read fail), `CG-AUTH-01` (no provider key), `CG-API-03` (unknown model), `CG-API-06` (unusable output), `CG-FLOW-01/02` (personality unset/unmapped), `CG-FLOW-03` (too few messages for deep), `CG-FLOW-04` (concurrent op on conversation), `CG-FLOW-05` (ping on an active fan), `CG-FLOW-09` (hi-greeting transcript too long), `CG-FLOW-P4` (compare deferred, a synthetic frame outside the shared registry, `coordinator.ts:259`), `CG-NET-01/02` (transport/timeout), `CG-GUARD-01/02` (guard block / unavailable). Definitions are in `packages/shared/src/errors` (03).

---

## 14. Tests (skim)

- `apps/desktop/tests/ai/coordinator.test.ts` — lifecycle, reservation/CG-FLOW-04, cancellation, chunk batching, settlement, usage-event/spend.
- `apps/desktop/tests/ai/context-loader.test.ts` — transcript paging, fetch-through gating, spending/subscription verified flags, tip substitution.
- `apps/desktop/tests/ai/deep-features.test.ts` — fan-summary cache/prefetch, deep timeouts, chat-review.
- `apps/desktop/tests/ai/gateway.test.ts` — direct vs hub selection, keychain read, onError/onComplete discipline, abort silence.
- `apps/desktop/tests/renderer-ai/**` — bridge event routing, streaming, dock/insert/send-controller logic, global start cap.
- `apps/desktop/tests/message-guard/runtime.test.ts` — compile cache, scan truncation, assert block/warn audit, prune TTL.
- `apps/desktop/tests/golden-gen/generate.test.ts` — real-pipeline golden generation + always-on structural checks against committed references.
- Shared-side: `packages/shared/tests/golden-context.test.ts` (context-blocks fidelity) and the prompt/output/sse suites (03).

---

## 15. Notable actual-vs-implied behaviors & ambiguities

- **Message-guard is not part of the generation pipeline.** Despite living adjacent to AI, `assertAllowed` is only called by the send engine (07) and `scan` by renderer/on-demand IPC. Generated drafts are streamed to the renderer un-guarded; enforcement happens when the operator sends. (Renderer-side highlighting is advisory.)
- **`conversationOpened`/`conversationClosed` are no-ops** — closing a chat does not cancel a running generation; only `ai:cancel`/`dispose` do. The names imply lifecycle coupling that the code deliberately removed.
- **Auto-read couples to AI context.** With `autoReadChats` off, deep features work only from cached transcript (`allowFetchThrough=false` → `needed=0`), so a summary/review can silently run on a shorter window than the configured deep count. This is intentional (never mark a fan read for AI) but is a non-obvious data-completeness consequence.
- **Hub-AI usage double-count guard.** `usage_events` insert and `onUsageEvent` are skipped for hub transport, but `ai_spend_log` is written for *all* transports — so the durable daily counter still reflects hub generations while the hub-flush queue does not. Verify against 11 that this matches the intended ledger.
- **`compareDeferredError` emits `CG-FLOW-P4`**, a code intentionally outside the shared error registry (`coordinator.ts:254-266`) — it will disappear when compare orchestration lands.
- **`buildLlmSpendSummary` failure is swallowed** (`trySpendSummary`) so an unknown model yields a completed operation with no spend recorded rather than an error — cost under-reporting is possible for models missing from the pricing table.
