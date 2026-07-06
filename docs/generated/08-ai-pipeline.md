> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — AI Pipeline (main/ai + the feature lane)

The AI generation pipeline end-to-end, **kernel-only** after Stage 31. There are no local
vendor providers, no prompt assembly, and no model/key/context resolution in this repo:
every generation streams from **core's AI feature lane** (`POST /api/v1/ai/features/:feature`).
The desktop sends **refs + client-side draft/tone only**; prompts, models, provider keys, and
context are core config.

## `ai/gateway.ts` (55 lines) — the streaming seam (types only)

The direct/hub-proxy gateways and provider clients died with the cutover; this module is now
pure types (`gateway.ts:1-5`). `AiFeatureGatewayRequest` = `{ feature, clientRequestId,
accountId, chatId, tone?, mode?, draftText?, personaKey?, isRegeneration }`;
`AiFeatureGateway.stream(req, cb): CancelFn`. Callbacks: `onText, onUsage, onProgress,
onReasoningObserved, onReasoningDelta, onStopReason, onError, onComplete(rawText),
onGenerationRef(requestId)`.

## `ai/coordinator.ts` (927 lines) — the operation lifecycle

**Features** (`FEATURE_TYPES`, `coordinator.ts:157-166`): `fast-reply, improve-draft,
help-me, fan-summary, chat-review, ping, hi-greeting, compare`. `compare` is **gated off** —
`start()` immediately emits `compareDeferredError` (CG-FLOW-P4). The seven active are the
`OperationFeature`s; their policies come from `@chatgoose/shared/features` (`03`).

- **Queueing / concurrency:** one operation per conversation (`byConversation` keyed
  `accountId|chatId` + `byId`); a synchronous reservation before the first await; a second
  start on a busy conversation → `CG-FLOW-04`; a duplicate operationId is a no-op. `cancel`
  → discard; `dispose` discards all. Navigation does **not** own lifecycle —
  `conversationOpened`/`conversationClosed` are intentional no-ops, so a background generation
  keeps running when you switch chats.
- **Streaming to the renderer:** the coordinator only `emit()`s `OperationEvent`s to
  subscribers; `attachEventForwarding` forwards them onto the `ai:event` IPC channel. Frame
  types: `operation:progress`, `operation:chunk` (text batched every `STREAM_CHUNK_FLUSH_MS=50`),
  `operation:complete`, `operation:error`, `operation:discarded` (plus a debug-only
  `operation:debugPrompt`).
- **Pipeline (`runPipeline`, `coordinator.ts:662-755`):** loads settings (real profiler only
  in `debugMode`); `resolvePersonaKey` resolves ONLY the persona **mapping**
  (`settings.accountMappings[accountId]`), unmapped → `CG-FLOW-02` — **no local prompt/model/
  key/context resolution** (comment `:670-674`); draft gate (`requiresDraft` + empty →
  `CG-APP-01`); a `fan-summary` cache short-circuit BEFORE any kernel call (checks the local
  `summaries` cache with sentinels `KERNEL_MODEL_ID='kernel'`/`KERNEL_PERSONA_UPDATED_AT=0`,
  then a best-effort hub prefetch).
- **What the desktop sends to the kernel** (`coordinator.ts:741-754`): `featureGateway.stream({
  feature, clientRequestId: op.operationId, accountId, chatId, tone (only if
  supportsReplyTone; defaults to settings.defaultReplyTone), mode (only if supportsReplyMode),
  draftText, personaKey, isRegeneration }, streamCallbacks(op))`. **No context/prompt payload —
  refs only.** `apps/desktop/tests/ai/feature-lane.test.ts` pins exactly this request object
  and asserts **zero `usage_events` rows** written.
- **Stream callbacks:** `onGenerationRef` stores `op.generationRef`; the first `onText`
  completes TTFB, arms the first-chunk timeout, and fires the `shown` acceptance event via
  `deps.onAcceptanceEvent`; `onUsage` stores metrics; `onError`→`settleError`;
  `onComplete`→`settleComplete`.
- **Completion (`settleComplete`):** runs the sanitizer/XML `buildFeatureResult` (reply splits
  `[NEXT]`/`[VARIANT]`; xml via `parseChatReviewXml`/`parseHelpMeXml`; empty → CG-API-06),
  persists + hub-pushes fan-summaries, and records spend from the **gateway usage frame**
  (`cost_micro_usd/1e6`) into **`ai_spend_log` only — no `usage_events` row** (the gateway
  ledger is authoritative).

## `ai/timeouts.ts` (119) — staged timeouts

Quick features: one `quick-total` = 60s. Deep features stage: `deep-prep=180s` → on
`llmRequestStarted` clears prep and arms `llm-ttfb=45s` → first *provider activity* clears
TTFB (so Claude thinking blocks don't false-trip) and arms `llm-idle=45s` (reset per chunk)
+ `llm-max-stream=300s` (values from `packages/shared/src/constants.ts`). A timeout →
`CG-NET-02`.

## `ai/profiler.ts` (137) & `ai/index.ts`

`NO_OP_PROFILER` in production; a real profiler only under `debugMode`, with stage labels
(`resolve-identity`, `summary-cache-check`, `llm-ttfb`, `llm-stream`, plus retained-but-unused
legacy stages). `ai/index.ts` re-exports the coordinator, gateway types, timeouts, profiler.

## The feature lane — `hub/ai-feature-gateway.ts` (107)

`createFeatureAiGateway` resolves the page label (null → HubError "needs a mapped core page
label"), then calls `client.streamAiFeature({ feature, signal, request: { clientRequestId,
pageLabel, platform:'onlyfans', conversationRef: chatId, replyTone?, replyMode?, draftText?,
personaKey?, isRegeneration } }, {onProgress,onReasoningDelta,onStopReason,onUsage,onMeta→
onGenerationRef(meta.requestId),onText})` — endpoint `POST /api/v1/ai/features/:feature`.
`mapKernelGateError` maps the kernel's 400 messages back to legacy `CG-*` codes ("requires
at least"→CG-FLOW-03, "at most"+"hi-greeting"→CG-FLOW-09, "blocked while the conversation is
active"→CG-FLOW-05, "requires draftText"→CG-APP-01; else CG-HUB-02). No prompt/context leaves
the desktop. The shared client and the SSE frame schema are owned by `03`/`02`.

## The message-guard runtime — `main/message-guard/runtime.ts` (205)

The main-side loader/enforcer for the guard pipeline (the pure pipeline is in `03`).

- **Loading/compiling:** policy read from settings KV `messageGuardPolicy` (else
  `BUILTIN_MESSAGE_GUARD_POLICY`), validated by `messageGuardPolicySchema`, resolved via
  `effectiveMessageGuardPolicy`, then `compileGuard` — **cached** by a key of
  `version|builtInVersion|JSON`; an invalid compile keeps the last-known-good or throws
  `CG-GUARD-02`. `updatePolicy` persists + recompiles + publishes DB-bus scope `guard`.
- **Scan:** `scanText` on `text.slice(0,20_000)`; timing logged when `debugMode` or ≥16ms.
- **assertAllowed:** `block` → audit `'blocked'` + throw `CG-GUARD-01` (carries `guardSpans`);
  `warn` → audit `'warned'` (no throw).
- **Events recorded** (`message_guard_events`, one row per span, `runtime.ts:135-165`):
  full `messageText` (local-only) + `messageHash` + span/rule/category detail; retention
  effectively permanent (Stage-4 stop-loss TTL, kept as the send-safety evidence trail).
- **Current effect:** because `MESSAGE_GUARD_ENFORCEMENT_ENABLED = false` (`03`,
  `packages/shared/src/message-guard/defaults.ts:59`), `effectiveMessageGuardPolicy` returns
  the disabled policy, so the guard is a **runtime no-op today** — the machinery loads,
  compiles, and scans, but nothing blocks or warns.

## No vendor SDK / no prompts — confirmed & CI-pinned

No `@anthropic-ai/sdk`/`openai` package import exists in `apps/desktop/src` or
`packages/shared/src`; there are no prompt files (no `prompts/` or `llm/` directory). Vendor
names survive only as string literals (model-id defaults, error wording, redaction regexes).
`apps/desktop/tests/security/ai-cutover-gates.test.ts` fails CI on any `api.anthropic.com`/
`openrouter.ai` reference, any import of a prompt/provider module, or any legacy gateway
factory (`createDirectGateway`/`createSelectableAiGateway`/`createHubAiGateway`). The
`@chatgoose/desktop` dependencies are only `@kernel/sdk`, `better-sqlite3-multiple-ciphers`,
`electron-updater`, and `zod`.

## Acceptance & spend hook points (cross-ref `11`)

The coordinator's `shown` event and the renderer's `copied`/`inserted`/`sent` actions feed
the **acceptance capture lane** (`main/hub/acceptance-reporter.ts` → `POST /api/v1/ingest/
observations`), and gateway usage frames feed the durable `ai_spend_log` ledger — both owned
by `11-hub-monetization-activity.md`.
