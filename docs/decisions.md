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
| D14 | 2026-07-13 | Harvest custody is revision-aware; Core ids bind natural key plus content hash |
| D15 | 2026-07-13 | Cross-transport state is monotonic; generated AI parts have a current-session bound |
| D16 | 2026-07-13 | Replay-gap state snapshots page every durable row through a bounded opaque cursor |
| D17 | 2026-07-13 | Global personas are a read-only metadata catalog; legacy client data is preserved and exportable |
| D18 | 2026-07-15 | Notification frames never block the stream cursor; SSE transitions never initiate paid reads; deterministic poison frames trip a breaker |

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

**D14 (2026-07-13).** Local-history harvest completion is a revision checkpoint,
not a rowid high-water mark. Schema v19 installs persistent INSERT/UPDATE/DELETE
triggers for every harvested source table and retains every successfully uploaded
`(table, natural key, content hash)` fingerprint. Dirty tables are scanned in
full; only unseen content revisions receive deterministic v2 observation ids,
and fingerprints plus cumulative manifest counters commit atomically only after
the covering Core 2xx. A table becomes stable only when its trigger revision is
unchanged across the full scan, so same-row updates, rowid reuse, and mutations
during an upload cannot be hidden by an old completion marker. Historical
fingerprints are never discarded: reverting to previously uploaded content
does not re-upload or inflate reconciliation totals. Completed v1 harvests must
perform one v2 full rescan, and a later desktop schema version forces another
content-hashed scan before completion can be trusted. A harvest that was never started still does not block
purge, preserving the reviewed corrupt-DB recovery path. Timestamped manifests
are audit snapshots; reconciliation must use the atomically replaced
`chatgoose-harvest-manifest-<machine>-latest.json` named by each snapshot's
`reconcileUsing` field, because later revisions intentionally increase the
machine's cumulative Core observation count.

**D15 (2026-07-13).** Cross-transport state is monotonic and newer interactive
intent wins. Per-persona Core mutations are serialized so an already-started
cached bootstrap PUT settles before a later save/archive, and a retired
generation is rechecked before starting another PUT. Remote persona-list cache
commits are fenced by a local mutation revision, so a response captured before
a newer save/archive cannot roll that intent back or be pushed to Core after a
restart. Persona cache rows, durable pending intents, and account mappings are
scoped by the normalized persisted Hub origin. The pre-scope global rows are
claimed to one origin before any copy and copied idempotently, so a crash cannot
resume them into a newly configured Hub; switching A -> B -> A preserves each
origin's independent state. The Stage-31 legacy cache migration is one-time and
remote-first over Core's full active/archived state. Every migration create is
create-only (`expectedVersion: null`), so a list/create race or tombstone can
never fall back to an unconditional last-write-wins PUT. Client timestamps have
no conflict-resolution authority: an identical active row is already migrated,
an archived key is preserved only in the local recovery record, and divergent
active content is copied to a deterministic `Recovered` key while the original
Core row remains authoritative. Core revisions serialize numeric CAS updates.
A legacy omitted-version PUT may create an absent row or confirm byte-identical
active content, but divergent content returns 409; reconnecting v0.1.41
therefore cannot overwrite a newer writer. Post-upgrade Desktop cache rows and
pending journals round-trip the Core revision, and every interactive or replayed PUT sends an explicit
`expectedVersion` (`null` is create-only when no revision is known). A CAS 409
has finite reconciliation: an archived original is removed from cache and
mappings after its payload is durably quarantined; divergent active content
stays authoritative while the stale local edit is preserved under a
deterministic create-only recovery key. Neither path retries the stale write or
falls back to an omitted-version PUT. An authoritative active list also prunes
mappings to remotely archived personas before committing the local cache.
Archive is revision-CAS as well: Desktop sends the revision captured with the
exact editor payload, and Core refuses stale or omitted-version deletes of an
active row. Replaying an already committed archive is idempotent. A create whose
success response was lost may be archived only after the full active payload
matches the durable local base and Desktop retries against the observed numeric
revision. Desktop also completes the revision-bearing lifecycle-state preflight
before DELETE, so an old Core cannot strip an unknown query field and archive
unconditionally before its legacy response fails validation. The editor keeps
an immutable base token while open; a live list
refresh never rebases an older draft or delete onto a newer revision.
Indeterminate same-key saves carry a bounded set of predecessor payload
digests plus their exact possible committed revisions. If Core proves it is at
one of those predecessors, Desktop persists the observed revision before one
CAS attempt for the latest successor; crash, lost-response, and P2 -> P3 -> P4
chains therefore keep the original key instead of manufacturing a recovered
copy. A 409 refresh is bounded and falls back to the normal foreign-writer
reconciliation. While save/delete owns a draft, editor navigation, New, Cancel,
and draft inputs stay locked so its late completion cannot discard another
unsaved editor session.
This Desktop contract requires revision-bearing persona responses and the full
active/archived state route, so Core must deploy before Desktop. Core continues
to accept v0.1.41's absent-key creates and identical replays, but deliberately
rejects its divergent active-row PUTs and active-row DELETEs. Old Desktop keeps
the edit in its local cache but cannot mutate shared Core state until upgraded;
this is a fail-closed compatibility degradation, not full write compatibility.
Persona reads/background work are drained and origin-fenced across runtime
retirement. A REST chat-list snapshot
may refresh non-head metadata but cannot replace a newer locally durable Hub
head, preview, direction, or unread tuple. Once command intake has durably
stored `core_command_id`, status/auth uncertainty belongs to the verifier and
never becomes a retryable `failed` row; pre-intake auth/config rejection remains
retryable because Core accepted no command. Durable AI acceptance rows keep
correlation/accounting metadata, but full generated parts are bounded to the
newest 24 completed operations in the current process (matching the renderer's
terminal-job cap) and scrubbed at the next app session because renderer job
state does not survive restart.

**D16 (2026-07-13).** Replay-gap recovery uses Core #146's additive
`pageMode=bounded_v1` state cursor. Each response carries at most 100 durable
message/tombstone rows by default; repeated thread metadata is applied
idempotently. After each successful page application, Desktop durably stores
the next page/state cursor, sticky snapshot cursor, account index and ordered
grant set under a Hub-origin+bearer-scoped key. The progress schema is v2 and
also pins `cursorContract=bounded_v1` plus `messageLimit=100`, so a stored
cursor is never replayed under different paging semantics. A restart resumes that next
request only when scope, protocol, account set, rejected source cursor and
`afterSeq` still match; otherwise it discards the walk and starts a new
snapshot. For v2, the record also pins the original fresh target cursor: a
newer auth handshake may validate the retry, but cannot be paired with an older
state walk because that would skip intervening events. The stream cursor is
persisted only after every account reaches terminal `nextStateCursor=null`, and
only then is page progress cleared. The first request also sends legacy
`limit=1`. If an old or rolled-back Core strips the additive fields and omits
`nextStateCursor`, the desktop switches to its returned thread cursor and
persists the next one-thread legacy page rather than truncating recovery or
clearing the stale stream cursor. If Core returns a typed 400 (`bad_request`
from the service or Fastify's `Bad Request`) for the exact persisted
`stateCursor`, Desktop compare-clears only that unchanged progress record and
performs one fresh bounded restart. A concurrent newer record is never erased;
a 400 from the fresh walk or from a cursor minted during the current run is a
contract failure and surfaces without another restart. An authenticated v1 gap
with an explicit
empty assigned-account set has no state pages, so it checkpoints Core's
non-regressing `currentSeq`; an omitted account allowlist still fails closed.
Core must deploy before the Desktop release. A single retained row remains
indivisible, so the contract bounds rows rather than silently truncating text or
media to advertise a byte ceiling it cannot guarantee.

**D17 (2026-07-13).** Core #148 makes global persona definitions owner-admin
content. Desktop consumes only the Hub-origin-scoped metadata catalog
`{key, displayName, version, status, definitionId}` and may mutate only its local
account-to-persona mappings. It has no create, edit, archive, definition-sync,
CAS, migration-write, or pending-write replay path. The transitional legacy
Core routes do not authorize Desktop to call them. Archived and unknown mapped
keys remain stored verbatim for recovery and export, but resolve as disabled
and cannot start AI; only an active catalog entry is an effective mapping.

Before the first catalog request, Desktop transactionally creates one immutable
JSON snapshot of every legacy persona-related settings row, including definition
text, aliases, caches, journals, recovery records, and mappings. That snapshot
uses a separate key, is never rewritten—even if corrupt—and can be exported
locally as complete JSON. Catalog refreshes likewise use a separate cache key
and never overwrite, prune, reinterpret, or delete the source rows. Existing
legacy rows remain in place after snapshot/export so downgrade and manual
recovery do not depend on the backup path.

Catalog refresh starts with Hub runtime activation and continues on a bounded
cadence; it does not depend on opening Settings. HubModule is the only catalog
writer. Every request receives a per-runtime start generation, and only the
latest-started response may atomically replace the complete snapshot; an older
response that settles later cannot commit. Missing keys and lower numeric
versions are accepted, with a loud diagnostic and dependent query invalidation,
when they belong to that latest-started full response: Core may have been
restored to another catalog incarnation, while per-key max merging would
resurrect removed tombstones. `definitionId`, derived by Core from the exact
definition, is the restore-safe catalog incarnation and prevents cache reuse
after an observed definition change; numeric `version` remains
display/lifecycle metadata and is never a monotonic acceptance guard. It is not
by itself proof of which definition Core applied if an owner edit races between
catalog GET and feature generation. Therefore every Desktop feature request
carries `expectedPersonaDefinitionId`; Core rejects a changed definition before
context/quota/provider work and echoes `personaDefinitionId` in the first meta
frame. Desktop accepts no text, usage, completion or summary cache write until
that echo equals the expected opaque id. A 409 precondition rejection or a
missing/mismatched echo terminates only that operation and triggers a full
catalog refresh; it never retries generation or patches/max-merges one key. A
catalog metadata change invalidates persona, account and affected fan views,
while main's per-operation persona fence rejects a result after a locally
observed mapping/definition change.

Core fan-profile versions do not yet carry the exact persona key and revision
that generated their body. Desktop therefore does not invoke or adopt profile
prefetch as a fan-summary cache hit—even when the remote body is newer—and
never stamps an unproven body with the current catalog version. Local cache
misses and persona-version mismatches run the feature gateway. Post-generation
profile push and pending replay remain enabled for dashboard sync; both send the
summary's original `generatedAtMs`, not the later Core append/retry time. Profile
prefetch may be re-enabled only after the response contract supplies persona
provenance that can be checked against the active catalog.

This entry supersedes only D15's Desktop client-authoring portions: editor
ownership, persona PUT/DELETE CAS, migration creates, conflict recovery writes,
write journals/replay, and authoritative-list mapping pruning. D15's unrelated
runtime-retirement, cross-transport monotonicity, command-verifier, chat-list,
and generated-parts rules remain binding. Historical local data described by
D15 is preservation input, not deletion authorization.

**D18 (2026-07-15).** Incident ruling (the PPV poison-loop credit burn:
~14k credits in one night, one device, 00:00–07:00 MSK). Three invariants are
now review-blocking on the sync path. (1) Notification-shaped frames
(`ppvUnlocked`, `tipReceived`) are ADVISORY toward the stream cursor: their
durable local fact applies via the monotonic `markOpened` merge before any
network work, the preview refresh is fire-and-forget without
`expectedMessageId` (an unlocked PPV is historical and legitimately absent
from the cached tail window; OFAPI itself reports `isOpened` on any later body
read), and a refresh failure records `hub-notification-refresh-failed` instead
of rejecting `onEvent`. Only message-body carriers may reject to force replay.
(2) SSE status transitions change the polling scheduler mode only; the
degraded-transition `forceRefresh` (uncapped 5-page deep sweep × every account
per flap — the incident's cost amplifier) is deleted, and automatic deep
sweeps exist solely under the poll loop's 5-minute `deepDue` cap. Manual
refresh via the explicit user IPC path remains the only cap bypass. (3) A v2
frame whose handler rejects on `HUB_POISON_FRAME_MAX_REJECTIONS` (3)
consecutive cycles trips a poison breaker: snapshot-covered types
(`message.received/sent/deleted`) rebaseline through the D10/D16 fresh-cursor
state recovery (skips the frame without losing its state); all other types
park SSE for `HUB_POISON_BACKOFF_MS` (15 min) with a loud warning — never a
silent skip, polling covers the surface meanwhile. Root cause was core-side
(canonicalizer shipped the recipient creator's id as `conversationRef` on
`message.ppv_unlocked`; fixed in core the same day plus a temporary serve-time
frame suppression that unwedges fielded clients); the desktop invariants stand
regardless because they close the whole class. Remaining waves (ledger repair
via superseding events, `message_state_facts` overlay, budget gate) are
tracked in the incident plan, not here.
