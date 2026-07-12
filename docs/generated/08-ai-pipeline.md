> Generated 2026-07-12 from docs/project-kernel/prompt-1-map.md at commit 8aaf3ea.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.
> Working-tree note: this map includes the uncommitted hardening changes present
> above `8aaf3ea`; it describes the current working tree, not that commit alone.

# ChatGoose Desktop — AI Pipeline

This is the current end-to-end AI path: renderer initiation, typed IPC, the main
coordinator, core's feature stream, result handling, debug prompt input, spend,
and acceptance correlation.

Generation is kernel-only. The desktop sends account/conversation references and
explicit controls (`tone`, `mode`, `draftText`, regeneration), not a locally
assembled prompt, transcript, dossier, model choice, or provider credential.
Core assembles the prompt for `POST /api/v1/ai/features/:feature`. In debug mode,
core may return that assembled prompt in the opposite direction as a
`debug_input_v1` SSE frame; the desktop bounds it before renderer IPC
(`apps/desktop/src/main/ai/gateway.ts`, `packages/shared/src/hub/client.ts`,
`apps/desktop/src/main/ai/coordinator.ts`).

## End-to-end boundary

1. Renderer actions call `startAiFeature` or `startAiFromGlobal`, then invoke
   `ai:start` through the preload bridge (`apps/desktop/src/renderer/src/features/ai/aiStore.ts`,
   `globalStart.ts`, `apps/desktop/src/preload/contract.ts`).
2. `registerIpcHandlers` validates renderer-controlled args and calls the current
   coordinator (`apps/desktop/src/main/ipc/handlers.ts`).
3. `createAiCoordinator` reserves the conversation, applies local draft/cache
   behavior, and calls `AiFeatureGateway` (`apps/desktop/src/main/ai/coordinator.ts`).
4. `createFeatureAiGateway` resolves local `accountId` to core `pageLabel`, then
   delegates to `HubClient.streamAiFeature` (`apps/desktop/src/main/hub/ai-feature-gateway.ts`,
   `apps/desktop/src/main/hub/page-resolver.ts`).
5. The shared client validates the request with the vendored kernel contract and
   maps SDK SSE frames to coordinator callbacks (`packages/shared/src/hub/client.ts`,
   `packages/kernel-sdk`).
6. The coordinator emits typed `OperationEvent`s. `attachEventForwarding` sends
   `ai:event`; the renderer validates it and routes by `operationId`
   (`apps/desktop/src/main/ipc/events.ts`, `packages/shared/src/protocol/index.ts`,
   `apps/desktop/src/renderer/src/bridge/events.ts`).
7. Copy/insert invokes `cmd:ai.feedback`; a later explicit send is observed for
   `sent`/`edited` telemetry. Completion itself never calls the send engine
   (`apps/desktop/src/main/hub/acceptance-reporter.ts`).

## Features and results

`packages/shared/src/features.ts` is the common policy table. `compare` remains a
`FeatureType` but is not an `OperationFeature`; main rejects it with `CG-FLOW-P4`.

| Feature | Surface | Result | Timeout | Distinguishing behavior |
|---|---|---|---|---|
| `fast-reply` | dock | reply parts | quick | Tone/mode; `[NEXT]` sequential parts. |
| `improve-draft` | dock | single reply | quick | Non-empty `draftText` required. |
| `help-me` | panel | XML | quick | Invalid XML remains raw with `valid:false`. |
| `fan-summary` | panel | single reply | deep | Local/hub cache; refresh removes local entry. |
| `chat-review` | panel | XML | deep | No summary cache; refresh regenerates. |
| `ping` | dock | reply parts | quick | Kernel enforces active-conversation gate. |
| `hi-greeting` | dock | variants | quick | `[VARIANT]`; kernel enforces greeting gate. |

`buildFeatureResult` sanitizes only the completed raw response using
`packages/shared/src/output/*`; empty usable output becomes `CG-API-06`. Reply
features expose sanitized `parts`; XML features expose `rawText` plus the parse.

## Renderer and coordinator lifecycle

`apps/desktop/src/renderer/src/features/ai/aiStore.ts` stores jobs by operation id
and conversation key. It permits three concurrent generations, keeps 24 terminal
jobs, and keeps background jobs alive across chat switches. Starting again in
one conversation invokes `ai:cancel` for the prior job and removes it locally
before creating its replacement. Hidden completion/error produces a toast.
Chunks use per-operation imperative splitters/batchers rather than per-chunk React
state. Malformed `ai:event` frames are ignored by `parseOperationEvent`.

Insertion behavior is in `aiStore.ts` and `dockLogic.ts`: index `0` means all
parts joined by `\n[NEXT]\n`; `1..N` selects one part. A messageable chat inserts
into the draft, otherwise the action degrades to copy. `globalStart.ts` applies
cached UI gates; main/core remains authoritative for operation errors.

`apps/desktop/src/main/ai/coordinator.ts` validates requests and synchronously
reserves `accountId|chatId` before its first await. Duplicate running operation
ids are ignored; a busy conversation gets `CG-FLOW-04`. Navigation callbacks are
no-ops; only cancel/dispose discards. Settings resolve only the account-to-persona
mapping (`CG-FLOW-02` when absent).

The coordinator calls its gateway with `{ feature, clientRequestId:operationId,
accountId, chatId, tone?, mode?, draftText?, personaKey?, isRegeneration,
debugPromptEcho? }`. The adapter sends core `{ clientRequestId, pageLabel,
platform:'onlyfans', conversationRef:chatId, replyTone?, replyMode?, draftText?,
personaKey?, isRegeneration }`. Text is relayed in 50 ms batches. Gateway meta
sets the core generation `requestId` and remaining daily quota; first text fires
the `shown` acceptance event.

Only `fan-summary` consults `data.summaries` before core: valid local row, then a
best-effort hub prefetch. A cache hit completes without a feature stream. A
generated verified summary is persisted and hub-pushed best-effort; cache identity
uses `modelId='kernel'` and `personalityUpdatedAt=0` because model/persona content
is not local.

## Core feature stream and errors

`apps/desktop/src/main/hub/ai-feature-gateway.ts` owns an `AbortController`, page
resolution, request adaptation, and terminal `CgError` mapping. The shared client
in `packages/shared/src/hub/client.ts` maps:

- `debug_input_v1` → prompt debug input;
- `meta` → request ids and quota;
- `content_delta` → accumulated raw text and text callback;
- `reasoning_delta` / `usage` → reasoning / kernel-priced token-cost metrics;
- `error` → `HubError('http')` with structural `kernelCode` and optional retry;
- `done` → stop reason and successful termination.

Closing without `done` is an invalid response. Structural gate codes
`gate_min_messages`, `gate_hi_greeting_limit`, `gate_ping_active`, and
`gate_draft_required` map to existing `CG-FLOW-*`/`CG-APP-01` cards; message
matching remains as an older-kernel fallback. Hub timeout/network reasons become
`CG-NET-02`/`CG-NET-01`; unclassified failures become `CG-HUB-02`.

## D9 debug input

Debug input is inbound observability, not a locally assembled generation payload.
Its typed main seam is `apps/desktop/src/main/ai/gateway.ts`; its open IPC event is
`operation:debugPrompt` in `packages/shared/src/protocol/index.ts`.

### Enablement and terminal behavior

- `settings.debugMode` enables the real profiler and passes
  `debugPromptEcho:true` to `sdkStreamAiFeature`; the SDK owns wire encoding.
- A real echo contains `systemBlocks`, `userBlocks` (`{text, cache}`), and nullable
  `contextManifest`, all under the generation's operation id.
- If an echo was requested but not received, successful or failed settlement emits
  `{echo:'unavailable'}` before the terminal frame. A fan-summary cache hit emits
  `{echo:'cache-hit'}`. An already received echo suppresses the sentinel; explicit
  cancellation/discard does not synthesize one.

### Main-process bounds

`boundDebugPromptInput` in `coordinator.ts` runs before `ai:event`:

- `DEBUG_PROMPT_BLOCK_CHAR_BUDGET = 500_000` is shared across system then user
  block text. A partial last block gets `[desktop debug preview truncated]` and
  later blocks are omitted.
- `DEBUG_PROMPT_MANIFEST_CHAR_BUDGET = 100_000` is measured on serialized
  manifest data. Oversize data becomes `{desktopTruncated, originalChars, preview}`.
- `desktopTruncation` records block/manifest flags and original/retained counts.
  These are JavaScript string-length bounds, not byte limits.

### Renderer retention and rendering

`aiStore.ts` retains prompt snapshots only in memory. `replaceRetainedDebugPrompt`
keeps the newest snapshot across all running and terminal jobs and clears every
older job's snapshot, so job history does not multiply the payload. The data is
not persisted to SQLite, settings, diagnostics, or acceptance telemetry.

`AiDock.tsx` leaves the snapshot opaque while collapsed. On explicit open,
`boundPromptBlocksForDisplay` (`dockLogic.ts`) limits block text materialized in
the DOM to `PROMPT_INSPECTOR_DISPLAY_CHAR_BUDGET = 100_000`. COPY uses the larger,
already main-bounded snapshot. The UI identifies main truncation and gives
`unavailable`/`cache-hit` dedicated cards. Tests pin this in
`tests/ai/feature-lane.test.ts`, `tests/renderer-ai/ai-store.test.ts`, and
`tests/renderer-ai/dock-logic.test.ts` under `apps/desktop`.

## Timeouts, completion, and spend

`apps/desktop/src/main/ai/timeouts.ts` uses a 60-second total for quick features.
Deep features use 180-second prep, 45-second TTFB, 45-second idle, and 300-second
max-stream timers. Provider activity clears TTFB and starts/re-arms stream idle;
max-stream is armed once. Timeout becomes `CG-NET-02`.

`apps/desktop/src/main/ai/profiler.ts` is a no-op outside debug mode. Current live
stages are identity, summary cache, TTFB, and stream; its label registry retains
unused names from the deleted local context/prompt pipeline.

Stream completion flushes chunks, builds the result, records spend and acceptance
context, then emits `operation:complete`. Error settlement drops buffered partial
text, aborts the stream, and emits `operation:error`. Gateway `cost_micro_usd` is
authoritative. Despite its name, coordinator `recordUsageEvent` writes only
`ai_spend_log`, never a new `usage_events` row; cache hits record a zero-cost run.
`usage_events` is now a compatibility/drain queue for pre-cutover rows.

## Durable acceptance correlation

The current hardening tree adds schema v17 table `ai_acceptance_ops`
(`apps/desktop/src/main/db/schema.ts`, `apps/desktop/src/main/db/migrations.ts`,
`apps/desktop/src/main/db/queries/ai-acceptance.ts`). It stores authoritative
operation/feature/day, optional generation/account/conversation ids, sanitized
result parts as JSON, `known_at`, and nullable `accepted_at`.

- First text records `shown` metadata and enqueues hub telemetry. Completion calls
  `onCompletedOperation` before `operation:complete`, filling generation ids and
  sanitized parts before renderer feedback can run (`apps/desktop/src/main/index.ts`).
- The coordinator retains a cap-50 live completed-operation map, but kernel-lane
  dedup is the database `acceptOnce` transaction: claim `accepted_at` while null
  and increment `ai_spend_log.inserted` together. Its older
  `markOperationAccepted` method remains exported but is not used by this IPC path.
- `cmd:ai.feedback` rejects unknown ids, reports capture/insertion only for the
  first accepted claim, and reconstructs context from the durable row after a
  coordinator replacement. Renderer `feature` is not trusted for kernel
  accounting. The legacy `usage_events` branch uses its stored feature/flag.
- The table has no query-level TTL/prune, is excluded from history harvest, and
  remains until local database purge.

The separate capture transport (`main/hub/acceptance-reporter.ts`) is a settings-KV
FIFO: cap 500, batches 100, one-second debounce, five attempts. It uploads
`shown|copied|inserted|sent` metadata to ingest observations; generated parts and
debug input are not in the wire event. An in-memory per-conversation tracker keeps
inserted text only until the next explicit send, then emits `sent` with `edited`.
The observer has no send-engine capability and telemetry failure cannot block send.

## Downstream boundary and removed local AI

AI output reaches the outbox only after explicit insertion and send. The send
engine still calls main-process message guard, although current shared defaults
set `MESSAGE_GUARD_ENFORCEMENT_ENABLED=false`, yielding the disabled policy
(`apps/desktop/src/main/send/engine.ts`, `apps/desktop/src/main/message-guard/runtime.ts`,
`packages/shared/src/message-guard/defaults.ts`).

There is no local prompt/provider module, vendor AI SDK/host, or local model/key
selection. `apps/desktop/tests/security/ai-cutover-gates.test.ts` pins those
deletions. Remaining AI code is lifecycle, kernel adaptation, output parsing,
renderer state, and accounting/telemetry.
