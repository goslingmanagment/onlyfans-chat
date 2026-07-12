# Decision log — ChatGoose Desktop

Append-only. Numbered entries, newest last. Cross-repo decisions live in
core's `docs/decisions.md` and are REFERENCED here, never copied.

## Family law (recorded per kernel Stage 35; binding in this repo)

- **Anti-deletion rule:** removing or superseding any hand-curated document
  requires a tombstone entry in this log; deprecated specs get a banner,
  never deletion. Generated docs (`docs/generated/`) are exempt — they are
  regenerated, not curated.
- **Updated-in-change:** hand-curated docs are updated in the same change
  that invalidates them.
- **Cross-repo decisions** are recorded in core's log; this log points at
  them by number.

## Quick reference

| # | Date | Decision |
|---|---|---|
| D1 | 2026-07-05 | Stage 4 stop-loss shipped (dead-letter spool, prune ×10, x-client-version) |
| D2 | 2026-07-05 | Review-doc deletions resolved by tombstone (commit 996fcbb); Pass 1 maps committed (5d298d4) |
| D3 | 2026-07-06 | Stage 24: SDK client, stream v2, direct reads dead, device tokens (core #95/#101) |
| D4 | 2026-07-06 | Stage 31: kernel-only AI — local prompt library/providers/vendor keys deleted (core #111) |
| D5 | 2026-07-06 | Kernel model sentinel: summary cache pins modelId='kernel'; pre-cutover entries invalidate once |
| D6 | 2026-07-07 | 0.1.31 RELEASED (kernel-AI cutover live); §5 watch, then owner revokes vendor keys |
| D7 | 2026-07-07 | Test Connection probes the actual bearer (device token preferred) — token-only installs verifiable; core #116 |
| D8 | 2026-07-07 | 0.1.30/0.1.31 dead-on-launch; 0.1.32 fixes SDK bundling |
| D9 | 2026-07-11 | Debug prompt inspector restored through the gated kernel debug-input echo |
| D10 | 2026-07-12 | Stream-v2 rebaseline is fail-closed: refresh grants, exhaust durable state, then checkpoint |
| D11 | 2026-07-12 | Update recovery is forward-only; feed publication is serialized, monotonic, and atomic |
| D12 | 2026-07-12 | Runtime custody handoff is quiescent; unsend commands keep durable idempotent lineage |
| D13 | 2026-07-12 | Replay/telemetry obligations become durable before one-way claims or later awaits |

## Entries

**D1 (2026-07-05).** Stage 4 desktop stop-loss: outbox dead-letter spool
(no deletions), prune horizons ×10, purge warning, `x-client-version` on
every hub call. Spec: core `docs/project-kernel/pass3/stages/stage-04-*`.

**D2 (2026-07-05).** Six stale review docs under `docs/reviews/` were
deleted WITH tombstones (commit 996fcbb) — the owner chose deletion over
restore; the tombstone commit is the record. The untracked Pass 1 maps and
`pass3-migration.md` were committed (5d298d4).

**D3 (2026-07-06).** Stage 24 migration: the hand-written hub client became
SDK delegation (vendored `@kernel/sdk`, contract-hash pinned); sync rides
stream v2 (opaque cursors, client-owned reconnect); direct OFAPI reads are
DEAD (transport literal 'hub'; ofapiKey decommissioned on boot); device
tokens are the preferred hub credential (chatter key = dual-accepted
fallback). Core decisions #95/#101.

**D4 (2026-07-06).** Stage 31 AI cutover: the kernel feature lane is the
only AI path. Deleted: shared prompt library (byte-migrated kernel-side in
Stage 30), llm/ (price tables, model registry, provider SSE), both legacy
gateway lanes, context loader, key probes, model settings UI. Vendor keys
left SECRET_NAMES and are deleted on boot (unrecoverable by rollback).
Spend is gateway-priced (`cost_micro_usd`). Acceptance lifecycle
(shown/copied/inserted/sent+edited) rides the capture lane. Core #111.

**D5 (2026-07-06).** The summary cache pins its model to the 'kernel'
sentinel; entries cached under vendor model ids invalidate once after the
cutover — a recorded trade (one-time regeneration) for deleting the model
registry.

**D6 (2026-07-07 ~22:55 UTC).** 0.1.31 RELEASED — the kernel-AI cutover
reaches users. Merge of `kernel/stage-31-ai-cutover` → main, tag v0.1.31,
windows-build run 28828374142 SUCCESS; the feed serves latest.yml 0.1.31
(the new pre-build tag assert and post-upload served==tag==package assert
both ran). Ships the GPT-5.5 audit fixes: the device token alone now
configures AI (gate accepted only the legacy key before), stale
direct-key copy replaced. §5 verification window from here: a real
chatter workday on 0.1.31 (kernel-AI generations, acceptance telemetry
under producer desktop@0.1.31), THEN the owner revokes the retired vendor
keys at Anthropic/OpenRouter. Rollback: republish 0.1.29 latest.yml — 0.1.30/0.1.31 are dead-on-launch (D8); prefer rolling forward from 0.1.32.

**D7 (2026-07-07).** Settings → Test Connection now probes with the ACTUAL
hub bearer via `resolveHubCredential` (device token preferred, legacy key
fallback) instead of `hubApiKey` only — the documented "no device-token
probe exists" gap. A token-only install (the #116 end state: humans =
password + device tokens, robots = API keys) can finally verify its
connection; the not-configured message names both credential paths. Pinned
in tests/diagnostics/key-tests.test.ts. Part of core decision #116 (family
credential ruling; client key-fallback deletion gate).

**D8 (2026-07-07).** 0.1.30/0.1.31 dead-on-launch; SDK must be bundled. Both releases shipped with `@kernel/sdk` externalized from the main bundle (`ERR_MODULE_NOT_FOUND` before window creation; packaged builds swallow the error — the app sits windowless). 0.1.32 fixes it by bundling (`externalizeDepsPlugin({ exclude: ['@kernel/sdk'] })` in `electron.vite.config.ts`) — the dep must never be externalized again. Last pre-incident working release: 0.1.29; the only safe rollback target below 0.1.32. D6's §5 verification window and the vendor-key revocation gate restart against 0.1.32 (producer `desktop@0.1.32`).

**D9 (2026-07-11).** The debug prompt inspector is REAL again. Since the kernel
cutover the desktop sends refs only, so `operation:debugPrompt` had no producer
in the main process at all — only the dev mock emitted it, and in a packaged
build debug mode showed nothing but stage timings. The persona, the templates and
the fan dossier the kernel injects (core #136) were invisible precisely to the
person debugging a bad reply. Now, in debug mode, the feature request advertises
`x-kernel-ai-capabilities: debug-input-v1`; if the owner has opened a
time-bounded window naming this chatter (core #140), the kernel answers with a
`debug_input_v1` frame and the coordinator republishes it as the debug snapshot
the inspector already knew how to render. The capability rides a HEADER, not the
request body, so an old kernel simply ignores it — a kernel rollback after a
desktop release can never 400 a generation.

Two silences are now spoken aloud rather than left as an empty panel: the window
being shut (`echo: 'unavailable'`) and a cached Scan that never called a model
(`echo: 'cache-hit'`). The inspector also renders the kernel's `contextManifest`
as a typed card — dossier version/age/chars/dropped sections plus the
transcript-union counts — which is the fastest way to tell a STALE dossier from a
MISSING one. Failed debug generations emit the same explicit unavailable state.

The echo lives in the in-memory job store only: never persisted, never logged.
Desktop bounds retained prompt-block text to 500,000 characters and a serialized
context-manifest preview to 100,000 characters, with explicit truncation metadata.
The renderer retains only the newest prompt snapshot, keeps it opaque while the
inspector is collapsed, and caps opened DOM text at 100,000 characters; COPY uses
the larger already-bounded snapshot. (The Fansly extension takes the same echo
but may not show it in the page — see its E28; a desktop renderer is app-origin,
so inline is fine.)

**D10 (2026-07-12).** Stream-v2 rebaseline is fail-closed. A cursor-bearing
stream 401/403 or a 409 first authenticates through the fresh-cursor endpoint,
but that cursor stays unpersisted while the desktop refreshes the read-gateway
account grants, replaces its hub allowlist, reconciles polling-loop membership,
and exhausts every durable state-snapshot page for every refreshed account.
Shrink-to-zero is a valid grant state; revoked account caches remain local but
are marked unauthenticated. Any missing account (including a single 404 among otherwise
successful accounts), partial/malformed page, apply failure, or grant-refresh
failure keeps the old cursor for retry. The client never clears a stale cursor
to reconnect cursorless, because cursorless v2 starts at the current high-water
mark and would skip the missed interval. V2 cursors are additionally scoped to
the credential that earned them. The retained immediate head-reconcile seam
claims PollingSync's per-account single-flight guard, and a queued reconcile
exits if that account is revoked before it acquires the guard.

**D11 (2026-07-12).** Desktop update recovery is a strictly higher-semver
roll-forward release. `electron-updater` does not accept a lower version by
default, and forward-only database migrations make arbitrary binary rollback
unsafe. This supersedes only the rollback instructions in D6/D8 that proposed
repointing `latest.yml`; their incident and release facts remain historical.
The repository release path now requires the full check, a `v*` tag whose
commit is on `origin/main`, serialized publication, a server-side lock and
strict version increase (except an identical equal-version retry, which is a
verified no-op after an ambiguous acknowledgement), versioned assets before one same-filesystem manifest
rename, normal TLS verification, and a served-installer SHA-512 match. The
workflow resolves an ambiguous SSH acknowledgement by verifying the exact
same-run bytes already served; it never treats an equal-version rebuild as the
same artifact. Production publication fails closed unless kernel-owned `flock`
is available.
packaged smoke gate requires navigation plus a committed renderer settings-IPC
round trip, not `did-finish-load` alone. Authenticode remains an owner/admin key
custody decision and is not implied by these feed-integrity controls.

**D12 (2026-07-12).** Credential/runtime ownership transfers only after the
outgoing generation is quiescent. `SyncProvider.stop()` is an awaited barrier:
PollingSync stops timers, rejects undurable Hub reconciliation obligations,
waits every accepted network/DB continuation, and prevents media callbacks from
re-arming. Normal Electron quit is held at `before-quit` until this runtime
drain completes; purge keeps its separate awaited close/delete sequence.
Auxiliary unsend commands now use schema v18 `unsend_commands`: the logical
message key owns one durable `clientCommandId`, the accepted Core command id is
persisted before polling, and boot/rebuild recovery resumes the same lineage.
Queued/in-flight automatic recovery is bounded to ten minutes from the original
intent; an indeterminate
outcome is retained but never resubmitted or polled forever, and the renderer
surfaces the uncertainty. The before-quit path cancels bounded retries and
atomically seals the runtime mutation queue before its final deactivation, so
no late producer can publish a replacement behind the drain. Purge uses the
same terminal seal before closing or deleting SQLite. Typing remains
intentionally lossy under the existing Core contract.

**D13 (2026-07-12).** A replayable obligation must be durable before a
one-way claim or a later fallible await. AI copy/insert feedback enters the KV
spool in the same SQLite transaction that claims `accepted_at`, increments the
metric, and clears generated parts; a
process-scoped tracker survives credential-runtime swaps. Summary pushes mark
the exact body `pending` before page resolution or network I/O, and disposed
generations cannot overwrite the replacement's result. Initial transaction
backfills persist each valid page plus its continuation marker before fetching
the next page. Multi-chat polling emits a message event immediately after that
chat's rows are durable, so failure in a later chat cannot erase the earlier
event on retry. These are ordering rules, not best-effort telemetry hints.
Thin Hub message frames also carry a proof obligation into `refreshChat`: with
automatic reads enabled the exact message row must be present, while list-only
mode must reach that numeric platform head or a newer one before the stream
cursor may checkpoint.
