# Code Review - Boundaries, AI Safety, Send Readiness - 2026-06-11

Scope: first high-risk pass from `docs/reviews/2026-06-11-code-review-plan.md`.

Reviewed:
- Static boundary audit: renderer/main/preload imports, IPC, zod validation, network/secrets boundaries.
- AI safety audit: prompt escaping, safety preambles, output sanitizer, stale operation handling.
- Send-correctness readiness: duplicate-send, false-confirmed send, lost-send, unsafe retry foundations.
- Limited OFAPI/sync/DB follow-up where it affected the above.

## Findings

### [P1] `media://` exposes signed OF media URLs and lets the renderer trigger arbitrary main-process HTTP fetches

**Claim.** SPEC §4 says the renderer never holds OF CDN URLs because they carry expiring signatures, and SPEC §15.1 says renderer network access must stay behind main.

**Evidence.**
- `apps/desktop/src/main/sync/mappers.ts:51` and `apps/desktop/src/main/sync/mappers.ts:52` convert OF media URLs into renderer-facing `media://` URLs.
- `apps/desktop/src/main/media/protocol.ts:22` to `apps/desktop/src/main/media/protocol.ts:23` implement `toMediaUrl()` as reversible base64url of the full remote URL.
- `apps/desktop/src/main/media/protocol.ts:31` to `apps/desktop/src/main/media/protocol.ts:55` accept any decoded `http:` or `https:` URL, not only known OF media hosts or known DB rows.
- `apps/desktop/src/main/media/protocol.ts:100` to `apps/desktop/src/main/media/protocol.ts:110` call `fetchRemote(remoteUrl)` on cache miss, and `apps/desktop/src/main/index.ts:163` to `apps/desktop/src/main/index.ts:164` implement that as `fetch(remoteUrl)`.
- `apps/desktop/tests/media/protocol.test.ts:17` to `apps/desktop/tests/media/protocol.test.ts:23` explicitly prove a non-OF `https://x.test/...` URL round-trips through the scheme.

**Impact.** Routine renderer view models contain reversible signed OF CDN URLs. A compromised renderer, XSS, devtools snippet, or log of `media://...` can recover private media URLs. The same scheme also acts as an SSRF-style network bypass: renderer code can construct `media://<base64url("http://127.0.0.1:...")>` and make main fetch and return arbitrary HTTP(S) resources, bypassing the intended renderer network boundary.

**Concrete fix.** Make `media://` opaque. Use `media://<media-id-or-hash>` where main resolves only URLs already present in trusted DB/cache rows for known account/chat/message media. Reject unknown tokens and non-OF media hosts. Add tests that `https://x.test`, `localhost`, and private-network URLs are rejected, and that renderer-facing media URLs are not reversible encodings of signed remote URLs.

### [P2] Preload exposes a runtime-arbitrary `ipcRenderer.invoke` bridge

**Claim.** The review plan and SPEC §4 require a typed preload bridge with no raw/arbitrary invoke channel.

**Evidence.**
- `apps/desktop/src/preload/index.ts:10` to `apps/desktop/src/preload/index.ts:11` expose `invoke(channel, args)` and pass the renderer-provided `channel` straight into `ipcRenderer.invoke`.
- `apps/desktop/src/preload/index.ts:4` to `apps/desktop/src/preload/index.ts:8` define an event-channel allowlist, but there is no equivalent invoke-channel allowlist.
- `apps/desktop/src/preload/contract.ts:236` to `apps/desktop/src/preload/contract.ts:243` provide TypeScript channel typing only; this does not protect runtime calls from a compromised renderer.
- `apps/desktop/src/main/ipc/handlers.ts:263` already registers a destructive `cmd:data.purge` handler, and P3 will add send-related mutation handlers.

**Impact.** Any renderer compromise or devtools script can call any registered IPC handler by string, including destructive and future mutation endpoints. Main-side zod validation still protects payload shapes, but the preload boundary does not prevent invoking channels that the UI did not intentionally expose.

**Concrete fix.** Add a runtime `INVOKE_CHANNELS` allowlist in preload and throw before calling `ipcRenderer.invoke` for unknown channels, or expose one method per supported operation instead of a generic channel string. Add a preload unit test proving unknown invoke channels are rejected and never reach `ipcRenderer.invoke`.

### [P2] The OFAPI request executor will auto-retry future send POSTs unless P3 adds a separate guard

**Claim.** SPEC §7 and SPEC §15.5 require send-message to never auto-retry indeterminate failures.

**Evidence.**
- `apps/desktop/src/main/ofapi/rate-limiter.ts:123` to `apps/desktop/src/main/ofapi/rate-limiter.ts:151` define `createRequestExecutor.execute(accountKey, doFetch)` with no method/idempotency parameter.
- `apps/desktop/src/main/ofapi/rate-limiter.ts:144` to `apps/desktop/src/main/ofapi/rate-limiter.ts:148` retry every `status >= 500` up to three times.
- The safety comment at `apps/desktop/src/main/ofapi/rate-limiter.ts:1` to `apps/desktop/src/main/ofapi/rate-limiter.ts:4` says this is safe because the layer is GET-only today.
- Current tests enforce that read-only surface at `apps/desktop/tests/ofapi/client.test.ts:311` to `apps/desktop/tests/ofapi/client.test.ts:323`, but there is no executor-level guard preventing P3 send code from reusing the same retry behavior.

**Impact.** When P3 adds `POST /{account}/chats/{chat_id}/messages`, a straightforward reuse of this executor would retry 5xx/gateway responses automatically. Those are indeterminate send outcomes, so this can duplicate messages or continue a multi-part sequence after a part might already have been delivered.

**Concrete fix.** Change the executor API to require an explicit retry policy, for example `{ retry5xx: boolean, retry429: boolean }` or an `idempotency: 'idempotent' | 'non-idempotent'` flag. Default to no 5xx retry. Existing GET methods opt in. Send methods must opt out and map timeout/5xx/connection-reset-after-write to `unconfirmed`. Add regression tests proving a fake send POST with 500 or timeout is attempted exactly once.

### [P2] `canNotSendReason` is persisted but dropped before the renderer

**Claim.** The review plan's send-readiness check requires both `canSendMessage=false` and `canNotSendReason` to be preserved in view models.

**Evidence.**
- `apps/desktop/src/main/sync/mappers.ts:120` to `apps/desktop/src/main/sync/mappers.ts:124` map OFAPI `canSendMessage` and `canNotSendReason` into the DB upsert.
- `apps/desktop/src/main/db/schema.ts:34` to `apps/desktop/src/main/db/schema.ts:35` and `apps/desktop/src/main/db/queries/chats.ts:11` to `apps/desktop/src/main/db/queries/chats.ts:14` include the reason column.
- `apps/desktop/src/preload/contract.ts:31` to `apps/desktop/src/preload/contract.ts:44` expose `ChatListItemVM.canSendMessage` but no `canNotSendReason`.
- `apps/desktop/src/main/ipc/viewmodels.ts:89` to `apps/desktop/src/main/ipc/viewmodels.ts:102` return `canSendMessage` only.

**Impact.** P3 composer and AI Insert cannot show the platform-provided block reason from the data they receive. The UI can disable sending generically, but it cannot explain why, and future code may be tempted to recover the reason through a raw OFAPI JSON path or another IPC query.

**Concrete fix.** Add `canNotSendReason: string | null` to `ChatListItemVM`, map it in `chatToVM`, and render it in the composer disabled state and AI Insert-to-Copy downgrade. Add a mapping test for a chat with `canSendMessage=false` and a non-empty reason.

### [P2] Initial sync emits historical messages as live `messageReceived` / `messageSent` events

**Claim.** New-message events and notifications should represent live arrivals, not historical cache hydration.

**Evidence.**
- `apps/desktop/src/main/sync/polling-sync.ts:141` to `apps/desktop/src/main/sync/polling-sync.ts:149` treat any uncached chat as changed.
- `apps/desktop/src/main/sync/polling-sync.ts:177` to `apps/desktop/src/main/sync/polling-sync.ts:195` collect those uncached chats as deltas before writing them to the DB.
- `apps/desktop/src/main/sync/polling-sync.ts:197` to `apps/desktop/src/main/sync/polling-sync.ts:208` emit `messageReceived` or `messageSent` for every freshly fetched historical message.
- The test at `apps/desktop/tests/sync/polling-sync.test.ts:134` to `apps/desktop/tests/sync/polling-sync.test.ts:148` currently expects initial poll to emit one received and one sent event from history.
- Main-process notifications are triggered from `messageReceived` at `apps/desktop/src/main/index.ts:225` to `apps/desktop/src/main/index.ts:236`; renderer toasts/sound are triggered at `apps/desktop/src/renderer/src/bridge/events.ts:96` to `apps/desktop/src/renderer/src/bridge/events.ts:119`.

**Impact.** On a fresh install, after a purge, or when a previously unseen chat enters the top 50, the app can emit stale notifications for historical messages. In the P1/P2 pilot this can look like a burst of new fan messages and erode trust in the app's freshness indicators.

**Concrete fix.** Suppress message-level sync events during first hydration of an uncached chat. For a brand-new chat discovered after the first account poll, emit at most the list `lastMessage` when it is from the fan and newer than the account loop's previous success timestamp. Update the initial-poll test to expect only `chatListUpdated`, and add a separate new-arrival test.

## Areas With No Findings In This Pass

### AI Safety

No P1/P2 AI safety finding in the implemented P2 features (`fast-reply`, `improve-draft`, `help-me`).

Evidence checked:
- Prompt builder escapes transcript, spending, subscription, fan display name, fan bio, and draft text at `packages/shared/src/prompts/builder.ts:245` to `packages/shared/src/prompts/builder.ts:267`.
- Reply and analysis safety preambles are present at `packages/shared/src/prompts/builder.ts:100` to `packages/shared/src/prompts/builder.ts:115` and selected in `buildSystemBlocks` at `packages/shared/src/prompts/builder.ts:274` to `packages/shared/src/prompts/builder.ts:282`.
- Insertable reply outputs are normalized/sanitized in main before completion frames at `apps/desktop/src/main/ai/coordinator.ts:212` to `apps/desktop/src/main/ai/coordinator.ts:241`.
- Renderer only offers copy chips for sanitized parts through `apps/desktop/src/renderer/src/features/ai/dockLogic.ts:75` to `apps/desktop/src/renderer/src/features/ai/dockLogic.ts:103`.
- Stale AI frames are correlated by `operationId` in renderer at `apps/desktop/src/renderer/src/features/ai/aiStore.ts:253` to `apps/desktop/src/renderer/src/features/ai/aiStore.ts:299`, and main discards in-flight operations on conversation switch at `apps/desktop/src/main/ai/coordinator.ts:750` to `apps/desktop/src/main/ai/coordinator.ts:765`.

Residual risks:
- P4 features are still disabled by `P2_FEATURES` at `apps/desktop/src/main/ai/coordinator.ts:111` to `apps/desktop/src/main/ai/coordinator.ts:116`; review their live pipelines when implemented.
- Debug prompt inspector intentionally exposes full escaped prompt context in debug mode. That is useful, but it remains sensitive transcript data and should stay debug-gated.

### Static Import Boundary

No direct renderer imports of Electron, Node built-ins, the DB driver, keychain, OFAPI client, or LLM providers were found. No renderer `fetch` / websocket / axios path was found. The media protocol finding above is the boundary exception.

### Secrets And Local Storage

No P1/P2 finding in this pass. Settings patches are zod-strict and route API keys to `safeStorage` files, not the settings table. File DB encryption refuses missing keys and has tests proving wrong-key/no-key opens fail and plaintext probes do not appear in DB/WAL/SHM bytes.

## Commands Run

- `sed -n ...` on `CLAUDE.md`, `docs/PRD.md`, `docs/SPEC.md`, `docs/PLAN.md`, `docs/DESIGN.md`, `docs/reviews/2026-06-11-code-review-plan.md`, and `docs/reviews/2026-06-10-plan-review.md`.
- `rg` boundary scans for renderer/main/preload imports, network calls, IPC usage, sanitizer/prompt paths, and send-readiness fields.
- `pnpm check` - passed.
  - Typecheck passed.
  - ESLint passed with two warnings from TanStack Virtual / React Compiler incompatible-library diagnostics.
  - Tests passed: `packages/shared` 561/561, `apps/desktop` 424 passed, 7 skipped.
  - Build passed.

