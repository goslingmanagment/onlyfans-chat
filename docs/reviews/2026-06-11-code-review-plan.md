# Application Review Plan - 2026-06-11

Goal: run a sequence of focused reviews across every part of ChatGoose Desktop, not a single shallow pass. The plan is based on the current repository state: P1/P2 code exists, while P3-P5 are still ahead. `CLAUDE.md`, `docs/PRD.md`, `docs/SPEC.md`, `docs/PLAN.md`, and `docs/DESIGN.md` are normative. If code and docs disagree, the review should record both facts.

## 0. Review Output Format

Each pass should end with a short report in `docs/reviews/` or a findings section in a shared report:

- `P1` - blocker before pilot, or risk of data loss, money loss, account damage, secret leakage, or double-send.
- `P2` - should fix before the next phase or before broadening the pilot.
- `P3` - improvement, test gap, or documentation issue.

Each finding must include:

1. Claim: what the code or docs promise.
2. Evidence: file/line, test, fixture, spec, or live observation.
3. Impact: what user-facing or operational bug can happen.
4. Fix: concrete change in code, tests, or docs.

## 1. First Layer: Invariants And High-Cost Bug Classes

These checks come first and should be repeated inside every module review.

### 1.1 Electron Security Boundary

Check:

- Renderer does not import `electron`, `fs`, `path`, `process`, OFAPI/LLM clients, keychain, or DB driver.
- All network I/O lives only in main or future hub/core contexts.
- Preload exposes only a typed bridge; no raw `ipcRenderer`, no arbitrary invoke channel.
- IPC request/response payloads are validated with zod at the trust boundary.
- Renderer never receives API keys, auth headers, raw OFAPI headers, or local media-cache paths.
- CSP, `contextIsolation: true`, `nodeIntegration: false`, and no remote content.

Primary files:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/contract.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/renderer/src/bridge/*`

Bug classes to hunt: secret leakage into renderer, typed IPC bypass, XSS through OF HTML, remote script/media bypass.

### 1.2 AI Safety And Human-In-The-Loop

Check:

- Every fan-derived text path goes through `escapeForPrompt` before prompt inclusion: messages, fan name, username, bio/about, custom name, tip text, and future notes/summary facts.
- Safety preamble is present on every LLM path.
- Every insertable output passes the sanitizer.
- AI operations cannot call send directly; P2 copy mode and P3 insert mode preserve "AI never sends".
- Stale chunks are discarded on conversation switch or `operationId` mismatch.
- Prompt templates remain byte-compatible, except for the allowed Fansly-to-OnlyFans wording change.

Primary files:

- `packages/shared/src/prompts/*`
- `packages/shared/src/output/*`
- `packages/shared/src/transcript/*`
- `apps/desktop/src/main/ai/*`
- `apps/desktop/src/renderer/src/features/ai/*`

Bug classes to hunt: prompt injection, meta-leak in model output, Gemini-style garbage insertion, bad `[NEXT]` splitting, AI output reaching the composer without sanitizer.

### 1.3 Send Correctness Readiness

P3 is still ahead, but review should already protect the foundations it will use.

Check:

- No helper or placeholder automatically retries non-idempotent POSTs.
- OFAPI client can distinguish definite failure from indeterminate failure.
- UI/protocol has room for `failed` vs `unconfirmed`, not a single generic error state.
- Future multi-part send must abort on first failed part.
- `canSendMessage=false` and `canNotSendReason` are preserved in view models.

Primary files:

- `apps/desktop/src/main/ofapi/client.ts`
- `apps/desktop/src/main/ofapi/errors.ts`
- `apps/desktop/src/main/ipc/viewmodels.ts`
- `apps/desktop/src/renderer/src/features/conversation/*`
- future P3 files under `outbox/*` and `composer/*`

Bug classes to hunt: silent duplicate send, retry after timeout/5xx, draft loss, wrong disabled state.

## 2. Second Layer: Module Reviews

### 2.1 `packages/shared`: Behavioral Core

Review order:

1. `prompts/escape.ts`, `output/reply-output.ts`, `output/split.ts`, `output/xml.ts`
2. `transcript/html.ts`, `transcript/format.ts`, `transcript/ofapi-message.ts`, `transcript/ping-segment.ts`
3. `context/spending.ts`, `context/subscription.ts`, `summary/validity.ts`
4. `features.ts`, `constants.ts`, `llm/model-registry.ts`, `llm/cost.ts`, `llm/sse.ts`
5. `protocol/index.ts`, `errors/index.ts`

Prove:

- Legacy behavior is locked by tests, especially edge cases from `docs/research/legacy-chatgoose.md`.
- Transcript/spending/subscription formats are byte-stable and use UTC.
- PPV labels use `price`/`isOpened`; tips use `tipAmount` plus stripped `tipText`.
- Model capabilities and cost logic do not produce invalid provider payloads.
- Zod protocols are not too broad and do not allow impossible states.

Mandatory test gaps to look for:

- Unicode/emoji/HTML entities in names and `tipText`.
- Fan name/bio as prompt-injection payload.
- Empty/deleted messages, media-only messages, mixed PPV bundles.
- Client clock skew for summary validity and future usage events.

### 2.2 OFAPI Client Layer

Review order:

1. `schemas.ts` and generated `ofapi.gen.ts` usage.
2. `client.ts` request construction, path safety, per-operation unwrap.
3. `pagination.ts` boundary inclusion/dedupe.
4. `rate-limiter.ts` and retry policy.
5. `credit-meter.ts`, `fixture-capture.ts`, `sanitize.ts`, `errors.ts`.

Prove:

- No ad-hoc fetch exists outside the client layer.
- Every account-scoped call goes through the credit meter.
- `POST send-message` and other future mutation calls are never retried automatically.
- 429 respects `Retry-After`; 5xx retries only idempotent GETs.
- Envelope parsing handles bare arrays/objects and `{data,_meta,_pagination}`.
- Fixture capture never writes PII, keys, or raw auth headers.

Special edge cases:

- Pagination cursors: `last_id + order=asc` for new tail, `first_id` only for scrollback.
- 401/revoked key mid-shift, credits exhausted, malformed 400 with/without `textHighLight`.
- Account id namespace `acct_*` vs raw fan/chat ids.

### 2.3 SQLite, Encryption, Media Cache

Review order:

1. `db/database.ts`, `db/driver.ts`, `db/migrations.ts`, `db/schema.ts`
2. Query modules: accounts/chats/messages/fans/summaries/settings/credit-log
3. `media/cache.ts`, `media/protocol.ts`
4. Tests under `apps/desktop/tests/db` and `apps/desktop/tests/media`

Prove:

- SQLCipher is actually enabled; DB cannot silently open in plaintext fallback mode.
- Key is stored in keychain/safeStorage, not settings/env/logs.
- Upsert keys match `(account_id, chat_id, message_id)`.
- Raw JSON can be retained for debug/reconcile, but renderer receives narrow view models.
- Migrations are sequential, repeatable, and safe for existing DBs.
- Media cache stores encrypted blobs and does not expose raw signed OF CDN URLs to renderer.

Special edge cases:

- Duplicate webhook/poll delivery.
- Deleted/tombstoned messages.
- Media `isMediaReady=false` polling cap.
- 5k+ messages per chat, pruning/retention.
- Purge local data deletes DB, media cache, and derived state.

### 2.4 Sync Engine

Review order:

1. `sync/provider.ts`, `sync/polling-sync.ts`, `sync/mappers.ts`, `sync/budget-guard.ts`
2. DB change bus interaction.
3. Renderer subscriptions and status-bar freshness.
4. Future HubSync seam readiness.

Prove:

- No overlapping polls per account/chat under high OFAPI latency.
- Delta rule fetches only changed chats and dedupes the boundary id.
- Hidden-window behavior slows but still supports notifications in P1/P2.
- Read-state sweep is conditional, not a credit runaway.
- Budget guard slows gracefully at 80/100% and never lies about freshness.
- Events reconcile through SQLite, not direct renderer state mutation.

Special edge cases:

- 500 during list poll, partial account failure, one account `authenticated=false`.
- Fan changed name/avatar; chat row updates without losing messages.
- Poll event races with optimistic/future sent message.
- SSE reconnect/replay design when HubSync lands.

### 2.5 AI Coordinator And Providers

Review order:

1. `ai/coordinator.ts`, `ai/timeouts.ts`, `ai/profiler.ts`
2. `ai/context-loader.ts`
3. `ai/gateway.ts`, `ai/providers/*`
4. Renderer AI dock/store interactions.

Prove:

- One operation per conversation context; concurrent start returns the expected `CG-FLOW-*`.
- Cancellation propagates to provider transport and stops streaming.
- Timeout stages match SPEC/legacy constants.
- 429/503 retry policy is bounded and safe.
- Cost accounting handles cache hits, reasoning settings, and unknown models.
- Provider payloads do not include unsupported sampling params for models that reject them.
- Usage events can be quarantined on hub 400 instead of blind retry/drop.

Special edge cases:

- Personality deleted/edited while operation is running.
- Conversation switched during stream.
- Provider sends malformed SSE, partial JSON, or `[DONE]` variants.
- XML result missing fields, duplicate fields, or huge output.

### 2.6 Renderer Workspace

Review order:

1. App shell and state: `App.tsx`, `app/*`, `state/*`, `bridge/*`
2. Inbox/account rail: `features/inbox/*`
3. Conversation/message list/composer placeholder: `features/conversation/*`
4. Fan panel: `features/fan-panel/*`
5. AI dock: `features/ai/*`
6. Settings: `features/settings/*`
7. Design primitives and CSS.

Prove:

- No renderer network/secrets/import boundary violations.
- Virtualization is used for long lists; keys are stable and row layout does not thrash.
- AI streaming batches updates and does not re-render the whole tree per chunk.
- Error/empty/loading states exist for every surface.
- Data age and stale/fallback states are visible.
- Hotkeys are centralized and do not conflict with text input.
- Copy/Insert actions cannot target the wrong conversation after switch.
- Settings writes go through typed IPC and secrets go to the keychain path.

Special edge cases:

- Long fan names, long usernames, Russian/English mixed text, emoji-heavy messages.
- Narrow window/collapsed panels, text not overflowing buttons/chips.
- `canSendMessage=false`, locked PPV, purchased/not-purchased badges.
- Search fuzziness with transliteration/empty results.
- Notification sound permissions and hidden-window behavior.

### 2.7 Tests, Fixtures, And CI

Review order:

1. `pnpm check` baseline.
2. Unit test coverage by module.
3. Fixture provenance and anonymization.
4. Missing integration/e2e tests for phase gates.

Prove:

- Existing tests cover negative and adversarial cases, not only happy paths.
- Fixtures preserve real OFAPI shapes and mark unverified examples.
- Generated OFAPI types are reproducible from the vendored spec.
- No test uses live mutation endpoints by accident.
- Renderer has logic tests for hotkeys, filters, AI dock, and message formatting.
- P3 needs a new integration harness before code expands: outbox state machine, restart reconciliation, restricted words, app restart, multi-part abort.

## 3. Third Layer: Workflow Reviews

After module reviews, run user workflows end to end. Many bugs live between modules.

### 3.1 P1 Read-Only Shift

Scenario:

1. App starts with cached DB.
2. Accounts list loads.
3. Chat list polls and updates.
4. Conversation opens from cache, then reconciles network tail.
5. Fan panel loads spending/subscription.
6. Incoming message triggers toast/sound while the window is hidden.
7. Credits/status freshness remain honest.

Critical bugs: stale UI without warning, wrong PPV state, lost tip amount, credit runaway, renderer fetch bypass.

### 3.2 P2 AI Companion

Scenario:

1. Personality mapping gate blocks unmapped account.
2. Fast Reply/Improve/Help stream into the dock.
3. Copy/copy-part actions are tracked as acceptance.
4. Regenerate marks the previous suggestion as rejected.
5. Prompt inspector shows escaped context blocks.
6. Provider failure/cancel leaves UI recoverable.

Critical bugs: unsafe prompt context, wrong-conversation copy/insert, missing cost, cancellation leak, unacceptable AI output not sanitized.

### 3.3 P3 Sending Readiness

Scenario for future review before merge:

1. Draft persists per chat.
2. Outbox row persists before POST.
3. Optimistic bubble reconciles with returned/message-tail id.
4. Timeout/5xx becomes `unconfirmed`, never auto-retry.
5. Restricted-word 400 preserves text and highlights `textHighLight`.
6. App restart reconciles pending rows before offering resend.
7. `[NEXT]` sequence aborts on first failure.

Critical bugs: lost send, duplicate send, manual retry without diff, sequence continues after failure.

### 3.4 Hub/Core Mode

Scenario:

1. SSE connects with chatter key.
2. Events are ACL-filtered by assigned pages.
3. `Last-Event-ID` replay fills gaps.
4. Polling fallback runs slowed and marks degraded state.
5. Read-state remains conditional polling.

Critical bugs: cross-page event leak, replay duplicate, reconnect storm, false real-time UI.

## 4. Recommended Review Order

1. Static boundary audit: imports, IPC, zod, fetch/process/env usage.
2. Shared AI safety audit: prompt escaping, sanitizer, transcript/context formats.
3. OFAPI/sync/DB audit: cache correctness, pagination, retries, credit meter, encryption.
4. Renderer audit: UI state, virtualization/perf, hotkeys, wrong-conversation races.
5. Test audit: compare expected coverage vs actual test files and fixtures.
6. Workflow audit: P1 and P2 end to end on current code.
7. Pre-P3 design audit before sending implementation starts.

## 5. Useful Search Probes

Run these at the start of each review and investigate every hit:

```sh
rg -n "\bfetch\(|https?://|Authorization|Bearer|process\.env|localStorage|sessionStorage" apps packages
rg -n "ipcRenderer|ipcMain|contextBridge|invoke|send\(" apps/desktop/src
rg -n "\bas\b|as unknown|as any|JSON\.parse|z\.any|z\.unknown" apps packages
rg -n "retry|backoff|setTimeout|setInterval|AbortController" apps packages
rg -n "sendMessage|messages|price|isOpened|isNew|textHighLight|canSendMessage" apps packages
rg -n "escapeForPrompt|sanitize|safety|UNTRUSTED|prompt|personality|fan" apps packages
rg -n "TODO|FIXME|HACK|throw new Error|console\." apps packages
```

These probes are not findings by themselves; they are entry points.

## 6. Immediate Review Notes From Reconnaissance

- `CLAUDE.md` still says "No application code yet", while the repo has substantial `apps/desktop` and `packages/shared` code and `PLAN.md` says P1/P2 work exists. Treat this as a documentation consistency issue to fix or explicitly ignore during review.
- Existing `docs/reviews/2026-06-10-plan-review.md` was a planning review. Do not reopen its already-applied findings unless the applied fix is wrong in code.
- The riskiest upcoming boundary is P3 sending. Before reviewing polish, prioritize anything that could create double-send, lost-send, or false confirmed-send behavior.
- Key custody is still strategically sensitive: OFAPI keys have no scopes. Any desktop-side key path is pilot-only; review should flag accidental scale assumptions.
