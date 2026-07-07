# 2026-07-07 — External review findings: verification verdicts + fix plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every *confirmed* finding from the three external review batches (ranges `145260a..e8e7b93`, `e8e7b93..91d3c2d`, `91d3c2d..5d8047d`), and record which findings were verified as stale, incorrect, or working-as-designed so nobody "fixes" them later.

**Architecture:** Verification was done at HEAD `5d8047d` (v0.1.32) by five independent read-only passes; every claim below carries a verdict and re-checked file:line anchors. Fixes are grouped into 10 tasks ordered by urgency: docs that could brick the fleet first, then production-path code (runtime rebuild, hub credentials), then telemetry/UX seams, then hygiene.

**Tech stack:** pnpm monorepo, Electron main (`apps/desktop/src/main`), React renderer, `packages/shared` (platform-pure), vendored `packages/kernel-sdk` (never hand-edit), Vitest.

## Global constraints

- `pnpm check` must pass before **every** commit (repo rule).
- SPEC §15 invariants are review-blocking; the runtime-rebuild task must not violate "never auto-retry an indeterminate send".
- All line anchors were verified at `5d8047d` but WILL drift — `Read` every target region before editing; do not apply edits blind.
- Parallel sessions happen in this repo: stage only your own hunks; a transient red check may belong to the other session.
- Never modify anything under `packages/kernel-sdk` (vendored, hash-pinned).
- When a fix changes a documented decision/behavior, update PRD/SPEC/PLAN in the same commit.
- Repo docs are English; user-facing copy changes need both `en` and `ru` catalog entries.
- Recommended: execute code tasks in a git worktree to avoid fusing with parallel-session edits.

---

## Verdict table

| # | Finding (source batch) | Verdict at 5d8047d | Real severity | Action |
|---|---|---|---|---|
| A1 | settings.update persists bad config before validation; next launch fatal | **CONFIRMED** (worse: offline launch with *valid* config also fatals; zombie windowless process) | P1 | Task 4a, 4b |
| A2 | candidate runtime runs outbox recovery before validation | **CONFIRMED** facts; remote-write risk overstated (idempotent intake). Adjacent NEW bug found: settings-driven rebuild cancels live queued sends | P1 (via lost sends) | Task 4c |
| A3 | settings edits during rebuild window lost | **CONFIRMED** (self-heals for hub keys; `autoReadChats` etc. silently lost) | P2 | Task 4d |
| A4 | deleted review docs still referenced | **PARTIAL** — doc refs real; the `generate.test.ts` ref is FALSE (file deleted in a5ca0a0 before the review ran) | P3 | Task 9 |
| B1 | usage batch deleted despite `invalidCount > 0` | **PARTIAL, demoted** — lane is deprecated + drain-only; the only per-item invalid cause is >5 min clock skew before first server-time sync | P3 | Task 8a (conditional) |
| B2 | diagnostics export misses pending/dead-letter usage rows | **CONFIRMED, demoted** — loss is explicitly disclosed in the purge warning; harvest is the real preservation tool | P3 | Task 8b (conditional) |
| B3 | `x-client-version` missing from raw hub transports | **CONFIRMED** + 2 extra paths (device-token sign-in fetch, SDK static headers) | P2 (feeds the fleet release gate) | Task 3 |
| B4 | retention docs cite old horizons | **CONFIRMED narrow** — only 2 live spots need fixing; project-kernel copies are banner-frozen; docs/generated already correct | P3 | Task 9 |
| C1 | purge deletes never-uploaded history when harvest never started | **WORKING-AS-DESIGNED** — guard scope is a reviewed decision (a639876: stronger guard permanently wedged purge); loss disclosed in red copy | — | No action (optional nudge, see below) |
| C2 | device-token recovery broken (shadowing + token-only looks unconfigured) | **CONFIRMED post-D7** — D7 fixed the registry string + probe honesty; shadow with no clear path, misdirecting `hub.authFailedBody` (EN+RU), RU CG-HUB-01 recovery, and the `configured` predicate all remain | P1-operational | Task 2 |
| C3 | rollback docs point at dead-on-launch builds | **CONFIRMED** — `decisions.md` names 0.1.30 as rollback; republishing it would windowless-brick the fleet; no D8 records the DOA incident | **P0-docs** | Task 1 |
| C4 | kernel gate 400s lose actionable message | **CONFIRMED** — `toHubError` drops `.message` for validation; `mapKernelGateError` is dead code; 429/404/persona errors also flattened to generic CG-HUB-02 | P2 | Task 5 |
| C5 | local inserted/copied metrics dead for kernel-lane ops | **CONFIRMED** — kernel ops never create a `usage_events` row, so `markInserted` never fires; Activity panel reads "0 / N"; the designed `feature` escape hatch is parsed but ignored | P2 | Task 6 |
| C6 | `x-client-version` (duplicate of B3) | duplicate | — | Task 3 |
| C7 | direct-AI residue in copy/exports | **CONFIRMED** for `aidock.gate.noKey` (live, both locales, impossible instruction); **PARTIAL** for constants (dead fields, inert) | P3 | Task 7 |
| C8 | no packaged-launch smoke gate | **CONFIRMED** — 0.1.32 fix added zero tests; CI/release never launch the app | P2-process | Task 10 |
| C9 | vendor test no-op loop | **CONFIRMED, immaterial** — and the loop iterates HubClient method names, NOT SDK op names; a naive "assert callable" fix would break the suite | P3 | Task 9 |

**New findings surfaced during verification (not in the inbox):**

- **N1 (P1):** on a settings-driven rebuild, the candidate's `reconcileOnBoot` mutates the LIVE outbox under the still-active engine — cancels all `queued` rows (multi-part sequences sit queued 2–5 s between parts) and flips `sending` → `unconfirmed` with a false "app restarted" note. A mere hub-key save can silently kill pending sends. Fixed by Task 4c.
- **N2 (P2):** `store.ts` wipes `hubApiKey` on a `hubBaseUrl` change but leaves `hubDeviceToken` — the old hub's token is then presented to the new hub. Fixed by Task 2b.
- **N3 (P1):** hub unreachable at launch ⇒ fatal error box + lingering windowless process, even with a perfectly valid config. Fixed by Task 4b.
- **N4 (P3):** the Settings surface has zero error surfacing (no `isError` handling) — a failed hub-key save shows nothing. Noted as optional follow-up in Task 4a.
- **N5 (P3):** the device-token sign-in flow itself sends no `x-client-version` — machines mid-onboarding are invisible to the fleet log. Fixed by Task 3.
- **N6 (P3):** `docs/PLAN.md:161` still instructs `GOLDEN_GEN=1 npx vitest run tests/golden-gen` — that harness was deleted in a5ca0a0. Fixed by Task 9.

**Explicit no-action list** (do NOT "fix" these):

- **C1 purge guard:** blocking purge for never-started harvests re-introduces the a639876 wedge (purge is also the corrupt-DB recovery tool). Optional Low-priority UX nudge: when harvest state is `idle` and the DB is non-empty, show an "upload history to kernel first" line in the arming panel — owner's call, not in this plan's tasks.
- **A4 `generate.test.ts` reference:** file no longer exists; nothing to fix.
- **Golden fixture headers** (`tests/fixtures/golden/*/reference-*.md`) mentioning the deleted rubric: byte-frozen reference artifacts — leave untouched.
- **Banner-frozen `docs/project-kernel/*` retention numbers:** superseded history with SUPERSEDED banners — leave untouched.
- **`anthropicKey.secret`/`openRouterKey.secret` strings in `keychain.ts:52-56`:** intentional boot-time decommission purge list, not residue.

---

## Task 1: Rollback/release docs truth (C3) — do this first

Docs-only; the current text is an operational hazard: following `decisions.md`'s rollback line during an incident would auto-update the whole fleet onto a windowless build.

**Files:**
- Modify: `docs/decisions.md` (D6 rollback line ~:69; append D8 entry)
- Modify: `CLAUDE.md:5` (current-state paragraph)
- Modify: `docs/RELEASE.md` (add a rollback note; it currently has none)

**Truth being encoded:** 0.1.30 and 0.1.31 shipped with `@kernel/sdk` externalized out of the main bundle and crashed at load before creating a window (packaged builds swallow the error). v0.1.29 is the last pre-incident working release; v0.1.32 bundles the SDK and is the current release. The D6 verification window (real chatter workday on kernel AI → then vendor-key revocation) never ran on 0.1.31 and must restart against 0.1.32.

- [ ] **Step 1: Fix the D6 rollback line** in `docs/decisions.md` (~:69):

Old: `Rollback: republish 0.1.30 latest.yml.`
New: `Rollback: republish 0.1.29 latest.yml — 0.1.30/0.1.31 are dead-on-launch (D8); prefer rolling forward from 0.1.32.`

- [ ] **Step 2: Append a D8 entry** to `docs/decisions.md`, matching the existing entry format:

> **D8 (2026-07-07): 0.1.30/0.1.31 dead-on-launch; SDK must be bundled.** Both releases shipped with `@kernel/sdk` externalized from the main bundle (`ERR_MODULE_NOT_FOUND` before window creation; packaged builds swallow the error — the app sits windowless). 0.1.32 fixes it by bundling (`externalizeDepsPlugin({ exclude: ['@kernel/sdk'] })` in `electron.vite.config.ts`) — the dep must never be externalized again. Last pre-incident working release: 0.1.29; the only safe rollback target below 0.1.32. D6's §5 verification window and the vendor-key revocation gate restart against 0.1.32 (producer `desktop@0.1.32`).

- [ ] **Step 3: Rewrite the stale claims in `CLAUDE.md:5`** (two edits inside the bold paragraph):

Old: `post-kernel-migration, in production via auto-update (fleet on 0.1.30).`
New: `post-kernel-migration, in production via auto-update. 0.1.30/0.1.31 shipped dead-on-launch (externalized @kernel/sdk — D8); 0.1.32 (SDK bundled) is the current release; the last pre-incident working build was 0.1.29.`

Old: `The 0.1.31 release (the kernel-AI cutover reaching users) is owner-gated on 0.1.30 fleet adoption (Stage 31 Task 5).`
New: `The kernel-AI cutover reaches users in 0.1.32; the D6 verification window (a real chatter workday on kernel AI, then vendor-key revocation) restarts against 0.1.32 (Stage 31 Task 5).`

- [ ] **Step 4: Add a "Rollback" note to `docs/RELEASE.md`** (short section near the publish steps):

> ## Rollback
> Auto-update rolls the fleet to whatever `latest.yml` points at. Safe targets: **0.1.32+**, or **0.1.29** (last pre-incident build). **Never republish 0.1.30/0.1.31** — both are dead-on-launch (D8).

- [ ] **Step 5: Verify and commit**

Run: `grep -rn "republish 0.1.30" docs/ CLAUDE.md` → no hits; `grep -n "fleet on 0.1.30" CLAUDE.md` → no hits. Run `pnpm check`. Commit: `docs: D8 — record 0.1.30/0.1.31 DOA, fix rollback target to 0.1.29`.

---

## Task 2: Hub credential recovery (C2 + N2)

The credential model is deliberate (Stage 24 / core #116): device token is primary, chatter key is legacy fallback — **do not flip precedence** (`device-token.ts:70-78`). Fix the recovery affordances around it.

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/settings/sections/HubSettings.tsx` (:60 predicate; sign-out control near the sign-in row)
- Modify: `apps/desktop/src/main/settings/store.ts` (~:491-497 hubBaseUrl-change block)
- Modify: `apps/desktop/src/main/ipc/handlers.ts`, `apps/desktop/src/preload/contract.ts` (new `cmd:hub.signOutDevice`)
- Modify: `packages/shared/src/i18n/catalog.ts` (:143-146 `hub.authFailedBody` EN+RU; RU `err.CG-HUB-01`)
- Tests: settings-store tests (token clear), renderer/dockLogic-style test (predicate), handler test (sign-out deletes the secret)

- [ ] **Step 1 (test first): predicate test.** Add a test that a token-only VM (`hubBaseUrl` set, `hasHubKey: false`, `hasHubDeviceToken: true`) yields an enabled Test Connection / configured state. Mirror the e50f2a0 pattern already applied in `renderer/features/ai/dockLogic.ts:261-262` and its tests. Run it — must FAIL.

- [ ] **Step 2: one-line predicate fix** at `HubSettings.tsx:60`:

```ts
// old
const configured = settings.hubBaseUrl !== null && settings.hasHubKey;
// new
const configured = settings.hubBaseUrl !== null && (settings.hasHubKey || settings.hasHubDeviceToken);
```

`settings.hasHubDeviceToken` already exists in the VM (`preload/contract.ts:385`, built at `store.ts:457-463`). Run the Step-1 test — PASS. Also confirm the footer "not configured" label (~:228) and page-label override (~:191) now behave for token-only installs.

- [ ] **Step 3 (test first): hub-switch token hygiene.** Settings-store test: an update patch that changes `hubBaseUrl` deletes **both** `hubApiKey` and `hubDeviceToken`. Must FAIL (today only the key is wiped, `store.ts:491-497`). Then extend that block to also delete the `hubDeviceToken` secret. Test PASSES.

- [ ] **Step 4: "Sign out device" control.** New IPC `cmd:hub.signOutDevice`: deletes the `hubDeviceToken` secret via the keychain module, then triggers the same runtime-rebuild path a hub-credential change uses (`onOfapiKeyConfigured` route in `handlers.ts:845-851`). Add a button in `HubSettings.tsx` next to the sign-in row, visible when `hasHubDeviceToken`. Zod-validate the (empty) payload at the IPC boundary like sibling commands. Handler test: after the command, the secret is gone and a rebuild was requested.

- [ ] **Step 5: fix the misdirecting copy.** `hub.authFailedBody` (`catalog.ts:143-146`, EN **and** RU) currently says "paste a fresh key … and save" — following it does nothing while a revoked device token shadows the key. Reword both locales to lead with re-sign-in (mirroring a08a251's registry copy), keep paste-a-key as the fallback for key-based installs. Add a recovery sentence to the RU `err.CG-HUB-01` catalog entry (RU users currently never see the fixed registry recovery — `localizedErrorText` short-circuits to the catalog).

- [ ] **Step 6: owner decision (record it, don't guess):** should saving a non-empty `hubApiKey` ALSO clear the device token? Safer default = no (sign-out button covers the recovery); if the owner wants yes, it's one more branch in the same `store.ts` block. Note the decision in `docs/decisions.md` when made.

- [ ] **Step 7:** `pnpm check`; commit: `fix(hub): token-only installs are configured; device sign-out + hub-switch token hygiene; recovery copy`.

---

## Task 3: `x-client-version` on every hub-facing transport (B3/C6 + N5)

Core records the header via a global Fastify `onRequest` hook (`~/code/core/apps/runtime/src/api/server.ts:162-168`) and that log **is** the fleet-adoption release gate (Stage 31 Task 5). Today an idle-but-running machine (SSE + background reads only) is invisible.

**Files:**
- Modify: `apps/desktop/src/main/sync/hub-sync.ts` (v2 snapshot ~:350-357, v1 snapshot ~:404-408, SSE connect ~:479-486; add `clientVersion?` to `createHubSync` options)
- Modify: `apps/desktop/src/main/ofapi/client.ts` (`requestHeaders` ~:439-443; add `clientVersion?` to `OfApiClientOptions` ~:93-107)
- Modify: `apps/desktop/src/main/hub/test-connection.ts` (~:42-46, add optional `clientVersion` param; caller in diagnostics passes it)
- Modify: `apps/desktop/src/main/hub/device-token.ts` (login fetch ~:34-38; SDK client static headers ~:51-55 → `{ cookie, 'x-client-version': v }`)
- Modify: `apps/desktop/src/main/index.ts` (pass `app.getVersion()` at the `createHubSync` call ~:555 and the OFAPI read-client construction ~:427-435)
- Tests: each transport already has an injectable fetch seam (`HubSseFetch`, `fetchImpl`, `HubProbeFetch`) — extend the existing recorded-call tests to assert the header, mirroring `packages/shared/tests/hub-client.test.ts:161`.

- [ ] **Step 1 (test first):** for each seam, add/extend a test asserting `init.headers['x-client-version']` equals the injected version on: v2 snapshot, v1 snapshot, SSE connect, read-gateway request, `/auth/me` probe, sign-in login POST. Run — all FAIL.
- [ ] **Step 2:** thread `clientVersion` through the options types and stamp the header at each of the six sites (merge into the existing `authorization`/`accept` header objects; do not touch `packages/kernel-sdk` — the static-headers seam already exists for the device-token SDK client).
- [ ] **Step 3:** run the tests — PASS. `pnpm check`. Commit: `fix(hub): stamp x-client-version on snapshot/SSE/read-gateway/probe/sign-in transports`.

Non-goal: renaming the header or adding it to the media CDN fetch (`main/index.ts:944` is not hub-facing).

---

## Task 4: Runtime rebuild safety (A1 + A2 + A3 + N1 + N3) — own session; most careful task

All anchors verified at 5d8047d: persist-first at `handlers.ts:843` → rebuild trigger `:845-851`; boot fatal path `index.ts:965` → error box `:1359-1366`; candidate flow `index.ts:493-719` (snapshot :493-502, fingerprint refresh :508-514, old-watcher disposal :681-682, reconcile :675, validate :677, swap/commit :705, watcher attach :699, `!committed` cleanup :712-719); rebuild serialization `:325-341`; engine destructive transitions `engine.ts:815-827`; hub POST `engine.ts:379-382`.

### 4a. Validate before persisting (A1, first half)

- [ ] **Step 1 (test first):** handler-level test: `cmd:settings.update` with `{hubApiKey: 'bad'}` while the account-sync validation stub rejects (401) ⇒ the call rejects AND the keychain + settings table are unchanged. FAILS today (persist happens at `handlers.ts:843` before the rebuild at :845-851).
- [ ] **Step 2:** for hub-affecting keys (`hubApiKey`, `hubBaseUrl`), invert the order: build + validate the candidate runtime with the **patch values as overrides** (extend `rebuildOfapiRuntime` to accept an optional settings/credential override instead of re-reading disk), and call `settingsStore.update(rawPatch)` only after the candidate commits. Non-hub keys keep the current persist-then-return path.
- [ ] **Step 3:** run the test — PASS. Note (N4, optional follow-up, not this task): the renderer settings surface still shows no error state on a rejected save; at minimum the handler now rejects so a future `isError` binding has something to show.

### 4b. Boot activation must not be fatal (A1 second half + N3)

- [ ] **Step 1 (test first):** boot-level test: persisted config + failing `listAccounts` fixture ⇒ `boot()` resolves, window content loads, `cmd:settings.update` remains callable, no fatal dialog. FAILS today (uncaught rejection from `initOfapi` at `index.ts:965` reaches the catch at :1359 → `dialog.showErrorBox` → windowless zombie).
- [ ] **Step 2:** wrap the boot-time `initOfapi` in try/catch: log, continue to `loadWindowContent` with a null runtime (the keyless-boot path already tolerates null services via the getter-based `IpcDeps`, `index.ts:985-1033`), and surface CG-HUB-01 through the existing hub-status/banner channel. Keep the fatal box for DB/keychain init failures only.
- [ ] **Step 3:** test PASSES. This also fixes offline-at-launch with a valid config.

### 4c. Reconcile after validation; never touch the live outbox on settings rebuilds (A2 + N1)

- [ ] **Step 1 (tests first):** (i) rebuild with failing `syncAccounts` stub + an unconfirmed outbox row lacking `coreCommandId` ⇒ `createOfapiCommand` never called, no outbox row changes state. (ii) settings-driven rebuild while a 3-part sequence has `queued` rows ⇒ parts survive and send. Both FAIL today.
- [ ] **Step 2:** reorder inside the candidate try-block: run `syncAccounts` (validation) first, then `reconcileOnBoot`, both still before the swap at :705 — the "reconciliation before any send" guarantee (comment `index.ts:671-674`) only requires reconcile to finish before the new engine becomes reachable at swap time.
- [ ] **Step 3:** pass an `isBoot` flag into the rebuild (true from `boot()` at :965, false from `rebuildOfapiRuntimeFromSettings`); in `reconcileOnBoot`, gate the destructive transitions (`queued`→cancelled `engine.ts:815-817`, `sending`→`unconfirmed` `:819-827`) on `isBoot`. Remote verification of already-`unconfirmed` rows keeps working on both paths (it reschedules via `scheduleVerify`). This preserves SPEC §15 (no auto-retry of indeterminate sends) — we only stop *falsely marking* live rows.
- [ ] **Step 4:** tests PASS.

### 4d. Candidate must observe settings changes during bootstrap (A3)

- [ ] **Step 1 (test first):** rebuild with a slow `syncAccounts` stub; mid-flight `settingsStore.update({autoReadChats: …})`; after activation the polling module's gate observes the new value without a further settings write. FAILS today (watcher attaches at :699, after the swap; snapshot taken at :493-514).
- [ ] **Step 2:** attach `attachRuntimeSettingsWatcher` at candidate creation (right after the :508-514 fingerprint block) and add its disposer to the `!committed` cleanup at :712-719, symmetric with other candidate resources. (Fallback one-liner if the early-attach ordering fights something: re-read `settingsCache = await settingsStore.get()` immediately after the swap, before `nextSync.start` at :700 — closes most of the window, not all.)
- [ ] **Step 3:** test PASSES.

- [ ] **Final step:** `pnpm check` + a manual dev smoke (save a bad hub key → error, no persist; save a good one mid-multi-part-send → parts survive; launch with hub down → window opens with a banner). Commit per sub-task or as one change: `fix(runtime): validate-before-persist, non-fatal boot activation, boot-only outbox recovery, candidate settings watcher`.

---

## Task 5: Kernel gate errors reach the user (C4)

Wire path today: core pre-stream 400 (`{error:'bad_request', message:'<gate text>'}`) → SDK `KernelApiError` **with** the message (`sdk-runtime.js:302`, category `validation`) → `toHubError` **drops** it (`packages/shared/src/hub/client.ts:148-149` builds `HubError('bad-request', { detail })` with no `message`) → `ai-feature-gateway.ts:40-41` maps from `.message` only → user sees generic CG-HUB-02 "Agency Hub request failed / sync retries automatically" for a deterministic 400. `mapKernelGateError` is dead code; 429 quota / 404 / unknown-persona flatten the same way.

**Files:**
- Modify: `packages/shared/src/hub/client.ts` (:148-149)
- Modify: `apps/desktop/tests/ai/feature-lane.test.ts` (:256-258 — currently constructs the synthetic shape `new HubError('http', { message })` that hides the bug)
- Test: `packages/shared/tests/hub-client-ai-gateway.test.ts` (new non-2xx case)

- [ ] **Step 1 (test first, client level):** stub a 400 JSON `{error:'bad_request', message:'fan-summary requires at least 30 messages in the conversation'}` on `streamAiFeature` via the existing `stubFetch` seam; assert `HubError.reason === 'bad-request'` AND `error.message` contains the gate text. FAILS.
- [ ] **Step 2 (test first, desktop level):** drive `createFeatureAiGateway` with a client built from `createHubClient` + the same stub; assert the emitted error code is `CG-FLOW-03` (not CG-HUB-02). FAILS.
- [ ] **Step 3:** one-line fix in `toHubError`:

```ts
case 'validation':
  return new HubError('bad-request', { message: error.message, detail });
```

(mirrors the `network` case at :150-153).

- [ ] **Step 4:** repair `feature-lane.test.ts:256-258` to build its error through the real `toHubError` path (or at least `reason: 'bad-request'` with the wire message) so the synthetic shape can't mask a regression again.
- [ ] **Step 5:** both new tests PASS; `pnpm check`. Commit: `fix(ai): kernel gate/quota 4xx messages survive toHubError so CG-FLOW mapping works`.

Non-goal (owner-optional follow-up): machine-readable gate codes from core instead of message-substring mapping — that's a core-repo contract change; record in `docs/PLAN.md` if wanted.

---

## Task 6: Local inserted/copied counters for kernel-lane ops (C5)

`cmd:ai.feedback` (`handlers.ts:957-977`) gates `aiSpendLog.markInserted` on finding a `usage_events` row; kernel ops never create one, so the Activity panel's insert-rate column reads "0 / N" forever. The contract already documents the fix: `AiFeedbackRequest.feature` "lets main increment the durable ai_spend_log inserted counter even after the usage_events row drained" (`preload/contract.ts:548-556`) — it is zod-parsed (`handlers.ts:207-218`) and then ignored.

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts` (:957-977)
- Modify: `apps/desktop/src/main/ai/coordinator.ts` (completed-ops registry `:416-440` — add a per-op `accepted` dedup flag)
- Test: `apps/desktop/tests/send/handlers.test.ts` (sibling of :235-293)

- [ ] **Step 1 (test first):** feedback for an `operationId` with **no** `usage_events` row but a registered coordinator completed-op context ⇒ `aiSpendLog.rowsSince(today)[0].inserted === 1`; a second identical feedback ⇒ still 1 (dedup). FAILS today (the only existing test pre-seeds a legacy row — `handlers.test.ts:235-293`).
- [ ] **Step 2:** in the handler, when the `usage_events` lookup misses: resolve the feature from the coordinator's completed-op context (preferred — it knows the real feature) falling back to `args.feature`; use today's UTC day; call `markInserted`. Dedup once-per-operation via an `accepted` flag on the completed-op registry entry (accept the registry's existing cap-50/in-memory semantics — the legacy row's `accepted` flag was exactly this dedup before).
- [ ] **Step 3:** update the now-stale wording in `preload/contract.ts:548-556` to describe the honored behavior. Tests PASS; `pnpm check`. Commit: `fix(ai): insert/copy feedback increments ai_spend_log for kernel-lane ops`.

---

## Task 7: Direct-AI residue in copy and dead settings fields (C7)

- [ ] **Step 1:** reword `aidock.gate.noKey` (`catalog.ts:1142-1145`, EN+RU). The corrected wording already exists as the English fallback at `dockLogic.ts:277`: "Connect Agency Hub in Settings (sign in or add the hub key)" — align both catalog locales with it. It renders in `AiPillRow.tsx` (3 sites), `AiHeaderMenu.tsx:94`, `FanPanel.tsx:258`.
- [ ] **Step 2:** grep-first, then delete the dead direct-era i18n block `hub.aiGateway.*` (~`catalog.ts:121-131`) if still unreferenced by any component.
- [ ] **Step 3:** delete `claudeApiKey` / `openRouterApiKey` from the `Settings` interface + `DEFAULT_SETTINGS` in `packages/shared/src/constants.ts` (~:131-136) and their pins in `constants.test.ts` (they are referenced by nothing else in app source). Leave `DEFAULT_MODEL_ID`/`featureModels`/`featureReasoning` alone for now (persisted-settings ballast; deleting touches the store schema — separate decision).
- [ ] **Step 4:** add a cheap guard test: no catalog string contains "direct AI key" / «прямой AI-ключ». `pnpm check`; commit: `chore(ai): retire direct-key copy and dead settings fields post-D4`.

---

## Task 8: Usage-spool hygiene (B1 + B2) — conditional; check the drain first

**Precondition:** the `/api/v1/ai-usage/batch` lane is `deprecated: true` and the desktop side is drain-only (no producers since Stage 31; `hub/index.ts:241-244`). Before implementing anything here, check core's fleet drain counters: if the fleet's parked rows have drained to zero, the planned **lane removal** supersedes both fixes — delete instead of improving. Only proceed if the drain is still live.

### 8a. Don't delete locally what the server called invalid (B1)

- [ ] **Step 1 (test first)** in `packages/shared/tests/hub-usage-reporter.test.ts`: stub `postUsageBatch` to resolve `{receivedCount: 2, insertedCount: 1, invalidCount: 1, dedupedCount: 0}` ⇒ batch NOT removed from the store; next flush (server-time offset now known, so `clampCompletedAt` corrects the skew) resolves `{invalidCount: 0, dedupedCount: 1, insertedCount: 1}` ⇒ rows removed. Plus: `invalidCount` still >0 after 2 resends ⇒ batch quarantined via the existing `markQuarantined` path. FAIL today (`usage-reporter.ts:231-233` ignores the response).
- [ ] **Step 2:** capture the `postUsageBatch` result; when `invalidCount > 0`, skip `queue.splice`/`store.remove` and leave the batch for retry (resend is free — core dedupes on `(userId, clientEventId)`, that's what `dedupedCount` is for); after 2 persistent invalid resends, quarantine. No server contract change needed — the response cannot identify which rows were invalid, so whole-batch retry-then-quarantine is the right client-side shape.
- [ ] **Step 3:** tests PASS.

### 8b. Diagnostics export covers the whole spool (B2)

- [ ] **Step 1 (test first):** seed three `usage_events` rows (attempts 0; attempts 3; `quarantined: true`); run the diagnostics export; assert all three payloads present with `{id, attempts, quarantined}`. FAILS (export at `index.ts:1182-1212` filters `payload.quarantined === true`).
- [ ] **Step 2:** widen the export section (rename `usageQuarantine` → `usageSpool`, keep `quarantined` as a per-row field, not a filter). Payloads carry no message text (already asserted at `index.ts:1183-1184`) — no PII change. Note: "dead-letter" is an in-memory tier (`attempts >= 3`, non-quarantined) — key off `quarantined` + `attempts`, there is no dead-letter flag in the DB.
- [ ] **Step 3:** tests PASS; `pnpm check`. Commit: `fix(usage): honor invalidCount on flush; export the full usage spool in diagnostics`.

Optional (owner call, not required): a pre-purge `flushNow()` attempt and a live undelivered-rows count in the purge warning.

---

## Task 9: Doc/comment/test hygiene (A4 + B4 + N6 + C9)

- [ ] **Step 1: dangling doc refs** (annotate, don't delete — tombstone style, recovery via git):
  - `docs/SESSIONS.md:22`: the optional between-stages review instruction points at deleted `docs/reviews/review-prompt.md` — rewrite to note it was retired in 996fcbb (recover: `git show 996fcbb^:docs/reviews/review-prompt.md`) or drop the line.
  - `docs/PLAN.md:114` and `:170` (`ai-slop-rubric.md`) and `:244` (`2026-06-19-webhook-architecture-gates.md`): append "(deleted in 996fcbb / D2; recover via `git show 996fcbb^:docs/reviews/<name>.md`)".
  - `docs/PLAN.md:161`: the `GOLDEN_GEN=1 npx vitest run tests/golden-gen` instruction targets a harness deleted in a5ca0a0 — annotate that golden generation moved kernel-side and the frozen references live in `tests/fixtures/golden/`.
- [ ] **Step 2: retention truth** (only the two live spots):
  - `apps/desktop/src/main/db/queries/messages.ts:3` header comment: `5000/chat` → `50,000/chat (Stage 4 stop-loss, D1)` — it contradicts line 15 of the same file.
  - `docs/SPEC.md:268`: → `- Retention: messages pruned per chat beyond 50,000 (Stage 4 stop-loss ×10, D1); spend rows 310 d; guard-audit TTL 3,650 d (effectively disabled); summaries/outbox kept.`
  - Do NOT touch the banner-frozen `docs/project-kernel/*` copies or the golden fixtures.
- [ ] **Step 3: vendor test no-op loop** (`packages/shared/tests/kernel-sdk-vendor.test.ts:16-18`): the loop iterates **HubClient method names, not SDK op names** — either delete it (hash pin + op count + typecheck are the real gates) or replace with a real assertion against actual SDK op names:

```ts
for (const op of ['pages', 'pageFanProfile', 'upsertFanProfile', 'aiUsageBatch', 'createOfapiCommand'] as const) {
  expect(op in kernelOperations).toBe(true);
}
```

(verify the exact op names against `kernelOperations` keys before committing — do NOT reuse the current loop's names).
- [ ] **Step 4:** no CI docs-link-checker (this repo's docs are dense with deliberate point-in-time references — a naive checker drowns in false positives). Instead, if desired, add one line to the D2 convention in `docs/decisions.md`: "before tombstone-deleting a doc, grep the repo for its name and annotate the referrers".
- [ ] **Step 5:** `pnpm check`; commit: `docs/tests: tombstone-annotate deleted-doc refs, fix retention numbers, real vendor-op assertions`.

---

## Task 10: Packaged-launch smoke gate (C8)

Two consecutive DOA releases; the 0.1.32 fix (5d8047d) added zero automated coverage. The incident class is packaged-only (dev worked; a workspace-symlinked dep externalized out of the bundle), so the gate must exercise the packaged artifact.

**Files:**
- Modify: `apps/desktop/src/main/index.ts` (add a `--smoke` branch)
- Modify: `.github/workflows/windows-build.yml` (step between `pnpm dist:win` ~:53 and the feed upload)
- Optional: `.github/workflows/ci.yml` (PR-level `xvfb-run` smoke on the unpackaged build)

- [ ] **Step 1:** implement `--smoke`: after `app.whenReady()` + window creation succeed, `app.quit()` with exit code 0; any main-process load/init error exits non-zero. Respect `CHATGOOSE_USER_DATA_DIR` (already exists, `main/index.ts:1322-1328`) so the smoke run uses a temp profile.
- [ ] **Step 2:** windows-build.yml step after the installer build, before publishing to the feed: run the unpacked exe (verify the exact path/name from the electron-builder config — expected `apps/desktop/release/win-unpacked/*.exe`) with `--smoke` and a temp `CHATGOOSE_USER_DATA_DIR`, 90 s timeout, assert exit 0. A failed smoke must fail the workflow **before** `latest.yml` is updated.
- [ ] **Step 3 (proof):** locally revert the `exclude: ['@kernel/sdk']` line in `electron.vite.config.ts`, build, run the smoke — it must fail; restore the line.
- [ ] **Step 4 (optional):** PR-level cheap gate in ci.yml: `xvfb-run -a pnpm exec electron apps/desktop --smoke` after `pnpm build` (~20-30 s; catches top-level main-bundle throws, would NOT have caught this specific incident — complement, not replacement).
- [ ] **Step 5:** `pnpm check`; commit: `ci: packaged --smoke launch gate before feed publish`. Update `docs/RELEASE.md` (smoke step is now part of the pipeline) in the same commit.

---

## Suggested execution order and sessions

| Session | Tasks | Why together |
|---|---|---|
| 1 (immediately) | Task 1 | Pure docs, removes the fleet-brick hazard; no code risk |
| 2 | Tasks 2 + 3 | Hub-facing, small, share test seams; both feed fleet recovery/visibility |
| 3 (careful) | Task 4 | Production-critical main-process surgery; own session, worktree, manual smoke |
| 4 | Tasks 5 + 6 + 7 | AI-lane UX seams, small and independent |
| 5 | Tasks 9 + 10 (+8 if drain still live) | Hygiene + process gate |

Verification note for executors: the external reviews' DB-backed test failures were an artifact of their worktrees (unbuilt `better-sqlite3-multiple-ciphers` native binding under pnpm's ignored-build-scripts), not a repo defect — a normal `pnpm install` + `pnpm check` here runs the full suite.
