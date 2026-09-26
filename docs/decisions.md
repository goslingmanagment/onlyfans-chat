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
| D19 | 2026-07-16 | Hub settings are device-token-first: no key input for humans, bound token suppresses/auto-decommissions quarantined legacy keys, persisted device identity |
| D20 | 2026-07-18 | Public download page on the ext site: Windows refreshed automatically by feed publication via a server-side symlink (feed token never exposed), macOS published manually via a smoke-gated script |
| D21 | 2026-07-18 | macOS packaged builds notify about updates from the page's version-mac.json (phase `manual`, install = open the page) — no self-install while builds are unsigned |
| D22 | 2026-07-21 | Only user-initiated backward history advertises pure DB-readable pages (core #158/#162) |
| D23 | 2026-07-22 | Account grants are distinct from vendor auth: authoritative reconciliation hides revoked identities without deleting cache |
| D24 | 2026-07-22 | SSE replay restores state without toast, sound, or OS notifications; live alerts use core's control-lane marker plus a fail-quiet epoch fallback, with cross-source alert dedup and suspend re-arm |
| D25 | 2026-07-24 | Kernel provider failures map to exact CG-HUB-04..08 cards by structural kernelCode; unknown provider* degrades to CG-HUB-10, stream truncation gets CG-HUB-09; dead direct-provider classifiers removed (family: core #182/#183, ext E57) |
| D26 | 2026-07-24 | Registry cleanup is producer-complete; dead codes are permanently reserved, replayable codes require read-only tombstones, and all recovery copy names only real actions (family: ext E58; core error-handling canon) |

| D27 | 2026-09-06 | OFAPI rich composer persists integer cents and exact payloads; explicit unchanged recovery and closed actions use Hub command custody (core #268) |
| D28 | 2026-09-07 | Review #27 rulings: a refused reuse-key recovery returns the original to unconfirmed (never Retry); hidden chats resurface on newer activity (migration 22); v2 only for rich options, default text stays v1 |
| D29 | 2026-09-11 | Spenders shows two contact-age columns and one author-prefixed message; the chatter chooses when to Ping (core #294) |
| D30 | 2026-09-12 | Spenders adds local search and neutral filters; errors and refresh outcomes remain distinct from empty data and source freshness; AI insertion is consumed once per job |

| D32 | 2026-09-15 | New followers uses explicit paced Hub reads, conservative origin evidence and atomic OF command outreach custody (core #339) |

| D33 | 2026-09-15 | Remove the unsolicited API options panel and optional chat controls from Desktop; keep stored payload recovery and the original reply/like/name requirements |
| D34 | 2026-09-15 | New follower enumeration uses date-bounded latest subscriptions and explicit provider continuation (core #342) |
| D35 | 2026-09-15 | One account per chatter: first-run sign-in screen, password sign-in without cookies, the legacy chatter key retired, self-healing on a reasoned 401, and the account cache bound to an identity (core unified-account plan §9) |
| D36 | 2026-09-16 | New followers: a delivered welcome is recognised by `queueId` equal to the welcome-template id and no longer blocks ready (amends D32) |
| D37 | 2026-09-20 | SDK re-vendored from deployed core 82571f3c; New Followers asks for `variantCount: 1` and the deprecated `greetingMode` alias leaves this client (core #379) |
| D38 | 2026-09-26 | Fresh list at launch: page 1 first and page by page, hub frames commit state + durable sync intents + the v2 cursor in one transaction and never await the network, `platform=onlyfans`, SYNCING + one list banner, toast age/provenance gate; SDK re-vendored from deployed core a51e687d (H3, core #265) |

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

**D19 (2026-07-16).** Hub settings are device-token-first (core Decision
#116: humans = password + device token, API keys = robots). Trigger: after
the v0.1.41→v0.1.44 update Maxim's machine showed a permanent red
"paste the key again" line for a legacy chatter key that (a) the runtime
already ignored (quarantined `unbound`), (b) the server had already revoked,
and (c) the UI could not delete — an empty key field is omitted from the
patch and the URL-switch clearing path is blocked while a device token
exists. Rulings: (1) The chatter-key input is REMOVED from settings; the
runtime dual-acceptance fallback for already-stored BOUND keys survives
until the D116(c) fleet gate, but no UI ever asks a human to paste a key —
every credential CTA is the device sign-in. (2) Auto-decommission: with a
provably bound device token, a PROVABLY non-bound (unbound/mismatch) legacy
key is dead weight by construction (connection resolution selects bound
credentials only, and key revocation lives in the dashboard, so local
custody is not the revocation handle) — main deletes it silently at boot and
after activation commit. Bound keys are never touched, and neither is an
'unreadable' one: that classification is a transient read failure
(DPAPI/keychain hiccup, likeliest at boot), not proof of non-binding — it
stays for the explicit-abandonment/purge paths, invisible while the token
is bound (review round 1 ruling revised in round 2). (3) A bound device
token suppresses the legacy-key branch of `hubCredentialNeedsAttention`.
(4) Non-secret `hubDeviceIdentity.v1` ({username, label, tokenLast4,
issuedAt, expiresAt}) is written/removed atomically with the device-token
binding so the connected card ("Подключено как Maxim · устройство Kevin")
survives restart; it is display metadata and fails OPEN, never gating
credentials. Crash recovery rebuilds it with NULL dates (the true
issue/expiry moments are unknowable there) and the UI omits the dates
rather than invent them. Tokens bound BEFORE this build get a boot-time
backfill ({username: null, label: hostname(), last-4 from the stored
bearer, null dates}) so the existing fleet's card is not blank; the full
record arrives with the next re-sign-in. (5) Display correction: an activated sign-in bearer KEEPS the
`agency_hub_pending_device_` prefix by 0092 design (rollback guard) — the
UI shows only the last-4 fingerprint and the literal "pending" never
reaches copy; renaming the prefix core-side was considered and rejected.
Phase 2 (full key-path deletion, two-release drain-then-delete order, CI
fleet gate, extension E9 parity, core service-account split) is outlined in
`docs/superpowers/specs/2026-07-16-hub-settings-rework-design.md` and stays
gated on D116(c).

**D20 (2026-07-18).** First installs are distributed from a public download
page at `https://ext.gosling-agency.ru/desktop/` (static files in
`/var/www/ext/desktop` on the agency VPS, served by the existing ext vhost).
Windows: `publish-feed.sh` refreshes a `ChatGoose-Setup-latest.exe` symlink
into the feed plus `version-win.json` on every publication (including the
lost-ack retry) — the page never exposes the feed's token URL, and installed
apps auto-update afterwards, so a slightly stale page is onboarding-only
damage. macOS: no signing → no auto-update, so the page IS the mac channel;
`apps/desktop/scripts/publish-mac.sh` (owner-run) builds, mounts and
`--smoke`-gates the DMG fail-closed from a clean exact release tag, then hands
the uniquely staged artifact to a locked server-side publisher. That publisher
rejects downgrades and conflicting same-version bytes, atomically replaces each
of the `latest` symlink and `version-mac.json`, and retains 3 DMGs without
deleting the selected artifact; the client verifies exact metadata plus the
full served SHA-512. JSON is authoritative and the page links its immutable
versioned artifact directly; a later locked run repairs a lagging `latest`
symlink after a process death. The per-platform
`version-*.json` files are separate so each writer owns its file — no shared
JSON parse/race, no python dependency on the feed host. Operator doc:
`docs/RELEASE.md` §Public download page.

**D21 (2026-07-18).** macOS packaged builds get a notify-only update flow:
`createManualUpdateController` (main/platform/updater.ts) polls the download
page's `version-mac.json` on the win cadence (launch + 4 h), zod-validates it,
and reports phase `manual` when a strictly newer stable semver is served. The
Settings → Updates section shows a Download button and `install()` opens the
download page; a silent OS notification fires once per version per run and its
click opens the page too. No self-replacement of the .app is attempted —
electron-updater refuses unsigned builds (Squirrel.Mac), and a DIY
self-replacing updater is the 0.1.30 DOA risk class for zero fleet (mac ≈
owner). Failed checks surface only through the manual button (`error` phase),
same policy as the win path. Extends D20.

Bootstrap caveat: deployed v0.1.47 predates this controller, so the first
D21-enabled DMG must be distributed manually; notify-only discovery works only
after users have installed that build.

**D22 (2026-07-21; protocol agreed 2026-07-16).** Core #158/#162's first
DB-readable surface is user-initiated backward history only. `backfillOlder`
marks its `first_id + order=desc` request, using Core's currently verified
exclusive cursor semantics, with
`x-agency-hub-read-intent: deep-history-v1`; the client refuses that intent
without a backward cursor. The initial conversation open/tail request, live tail, poll delta,
media hydration, and all other message reads omit the header and retain their
current vendor behavior, including the open-read mark-as-read side effect. Core
may serve the marked page from DB only under its independent head,
continuous-coverage, proof-policy, range, and projection-watermark gates;
otherwise the same request takes one capture-first vendor fallback. This is a
protocol split, not permission for `db_only`: that cutover remains blocked on
the fleet/coverage gates in core #158.

**D23 (2026-07-22).** The account list returned by the authenticated Core
read gateway is the complete grant set for the active Desktop credential, not
an append-only discovery feed. Incident trigger: replacing an OFAPI team
changed both `acct_…` ids while preserving the OnlyFans usernames; v0.1.47
upserted the two new rows but retained the two old rows as authenticated, so
the account rail showed four tiles and continued issuing doomed 404 reads for
the stale ids after restart. Authentication health and credential membership
are separate facts. Schema v20 therefore adds `accounts.grant_state`
(`granted|revoked`), defaulting existing rows to `granted` so an offline upgrade
does not hide the last known workspace before validation. Only a successful
full `listAccounts` response may transactionally replace that set: returned
rows are upserted/re-granted; every absent row is marked `revoked` and
`unauthenticated`. An error or malformed response changes nothing, and an empty
successful response revokes all rows. Revoked account/chat/message cache,
drafts, audit rows, and persona mappings remain local; renderer account and
activity lists expose only granted rows. A granted account with
`is_authenticated=false` remains visible with the existing re-auth affordance.
Late auth events cannot reanimate a revoked row, and a live grant change moves
or clears stale renderer selection without changing the current surface.

**D24 (2026-07-22).** SSE replay never alerts: hub catch-up frames apply
state but are stamped `live: false` and produce no toast/sound/OS
notification. Live/replay boundary = core's v2 replay-completion marker,
delivered on a dedicated `event: control` SSE lane (`{"type":
"replay_completed"}`) — NOT as a domain frame: the published DomainEventFrame
contract requires positive accountId/accountSeq and the vendored SDK kills the
subscription on any invalid domain frame, while unknown event names are
skipped by every consumer (the `ephemeral` precedent). The signal is sticky
until the sleep detector re-arms the gate: a >5 min wall-clock gap since the
last 30 s heartbeat tick means the machine suspended (or the process froze) —
the session was not watching, so the wake backlog replays silently like a
cold start. The gap check runs both in the tick and inline at every gate
evaluation (suspended timers may not be overdue at wake, and the SSE resume
can beat the first post-resume tick); the detector's timer lives strictly
between provider start and stop (a never-committed candidate runtime must
not leak it).
Message arrival gaps are deliberately NOT a re-arm signal: a quiet chat or an
SSE outage with the app awake keeps live mode, so outage backlog still alerts
(review 2026-07-22 killed the interval-between-messages heuristic for exactly
that false positive). Fallback for marker-less streams is a provider-start
epoch minus 60 s grace over message.createdAt/occurredAt, then the local
row's createdAt (id-only frames and polling events are durably applied
before they emit); with no resolvable time the polling lane fails open (it
only emits ids it just read back from the DB) and the hub lane fails quiet
only within a bounded 5-min settle window after the epoch (one warn per
session for diagnosability), then fails open — a live v1 id-only message
must not lose its alert for lacking a body. Polling rides the SAME gate
and alert registry (bounded 500) — its baseline sweep covers the cold-start
backlog, the epoch covers its auto-read wake backlog, and the shared
registry stops either source from re-alerting the other's id. Matches the polling provider's
long-standing "history is not news" baseline (its first sweep swallows the
downtime backlog); D10 cursor semantics untouched — no replayed state is ever
skipped, and control frames never advance the cursor.


**D25 (2026-07-24).** The desktop adopts the family provider-error
classification emitted by the Agency Hub feature lane (core Decisions
#182/#183; extension twin E57). Known kernel codes map by exact structural
`kernelCode` — `provider_billing`→CG-HUB-04, `provider_auth`→CG-HUB-05
(kernel-side provider credential, distinct from the chatter's CG-HUB-01),
`provider_rate_limited`→CG-HUB-06 (retryAfterMs becomes one absolute
localized deadline, display-only, no automatic retry),
`provider_unavailable`→CG-HUB-07, `provider_proxy_unreachable`→CG-HUB-08.
`provider_stream_failed` and unknown future `provider*` codes degrade to one
generic manager-action card (CG-HUB-10); a structural code always beats the
compatibility message matcher. An AI stream that closes without `done`
reports the dedicated interrupted-generation card (CG-HUB-09) and remains
fail-closed. The uncalled direct-provider classifiers
(`classifyAnthropicHttpError`/`classifyOpenRouterHttpError`) and their phrase
tables are removed; local CG codes are presentation aliases — the canonical
failure identity is the kernel wire code. No SDK re-vendor, no retry-policy,
send, persona-proof, or provenance changes.

**D26 (2026-07-24).** The desktop registry is a live contract, not a catalog
of historical possibilities. A static source walk over production TypeScript
under `apps/` and `packages/` (excluding tests, the dev mock, the registry and
catalog themselves, generated sources, and the vendored SDK) requires every
non-tombstone registry code to have at least one literal producer. It also
requires every permanently retired code to have none. This is the desktop twin
of extension E58 and follows the family canon in core's
`docs/error-handling.md`.

Retirement has a persistence law. Before deleting a key, inspect live
producers and every durable or replayable carrier. If an outbox row, job
history, diagnostics/cache record, IPC queue, or other upgraded state can
reconstruct a stored `UserFacingError`/`CgError`, the code stays as a minimal,
honestly worded read-only tombstone (English registry and Russian catalog where
that surface localizes), appears in the consistency test's explicit tombstone
allowlist, and is rejected by all live producer paths. If replay is impossible,
the definition and live type member are removed outright. Either way, the code
is permanently reserved and MUST NOT be reused.

The D26 audit found no desktop replay tombstones: AI jobs/coordinator state and
IPC forwarding are process-only; diagnostics replay strings rather than
registry objects; outbox history re-renders its stored send message/code
without registry reconstruction; summary sync state contains only delivery
state/reason; and durable unsend lineage contains identifiers only. Therefore
CG-AUTH-01/02, CG-API-01..05, CG-FLOW-01/06/07/08, CG-FAN-02, CG-UI-01, and
CG-OF-07 leave the live enum/registry and enter the permanent reservation
ledger. The old OpenRouter provider-wording and generic kernel-rate-limit
overrides leave with their unreachable inputs. The current tombstone allowlist
is deliberately empty.

Surviving copy is action-honest: no card asks a chatter to edit provider or
OFAPI keys in Settings; Agency Hub recovery uses device sign-in; page/account
and credit problems name manager action; surfaced rate limits say to retry
manually and never promise an AI retry. The local account-to-active-persona
assignment is still a real Settings flow, so CG-FLOW-02 remains live with that
specific recovery. No retry, send-outcome, persona-proof, provenance, sync, or
storage behavior changes.


**D27 (2026-09-06).** The composer consumes core's `send_message_v2` and closed
conversation commands through the generated SDK (core decision #268; source
commit and contract hash in `packages/kernel-sdk/kernel-sdk.vendor.json`).
Existing queued v1 rows remain v1. New renderer sends persist exact integer cents,
reply/GIF/release references, preview IDs, screening selection and an explicit
caption-lock choice before Hub intake. The default caption remains visible.
Dictionary preview reads Hub's stored dictionary, treats vendor strings literally,
and neither rewrites drafts nor claims complete coverage for a missing dictionary.

A provider 422 retains the complete outbox draft and bounded explanation. An
indeterminate v2 send cannot be confirmed by similar local message text. Only the
user's explicit unchanged-recovery action asks Hub to reuse the original provider
operation key; Hub owns eligibility, scope, body equality and expiry checks. There
is no timer or automatic replay. Editing a rich failed draft requires a clear
composer so another draft's attachments cannot be silently replaced.

Closed actions persist client identity before intake, survive lost responses, and
coalesce repeated clicks. Check status uses the retained identity; an uncertain
action blocks changing the same setting. Local name, unread and hide state changes
only after confirmation. Hide retains local chat history. Confirmed like/pin/mute
states remain queryable beyond the bounded recent action history. All privileged
calls and credentials stay in Electron main; IPC and generated contracts validate
payloads. Forward SQLite migration 21 preserves existing rows.

Current behavior, rollout and validation: `docs/ofapi-composer.md`. The earlier
historical SPEC's blanket no-recovery wording is superseded only for explicit v2
unchanged recovery; legacy v1 and automatic retry behavior are unchanged.

**D28 (2026-09-07).** Three review rulings on the D27 composer, each pinned by
tests. (1) A reuse-key recovery child inherits the original's provider key, so
a Hub refusal — dispatch-time `local_precondition`, a `409` or any definite 4xx
on the create call, or a request still queued at boot — proves nothing about the
original's delivery: the child is retained as a cancelled audit row and the
original returns from cancelled to unconfirmed carrying `CG-OF-09` and the Hub
reason. The row is a manual check (Check now / Dismiss); Edit and Retry are
never offered, because a Retry mints a fresh key and is the one path to a
duplicate DM. Only a vendor rejection of the replayed payload itself
(`ofapi_response` 400/422) may settle the child as failed with Retry. This is
the single deliberate backward step in the outbox state machine; unconfirmed
never sends. (2) `hide_chat_v1` records the hide moment (`locally_hidden_at`,
forward-only migration 22, existing hidden rows stamped with their last write);
the chats upsert clears the flag once the head advances past it, mirroring
OnlyFans, and an unchanged or older head keeps the chat hidden. (3)
`send_message_v2` is sent only when a rich option or media/price is in use
(`needsComposerV2`); a plain text with default options stays on the v1
`{ text }` command, so everyday sends neither depend on a v2-capable Hub nor
exercise an untested plain-text v2 shape, and keep local-match verification.
Current behavior: `docs/ofapi-composer.md`.

**D29 (2026-09-11).** Owner-approved Spenders redesign: show how long ago each
side wrote, who sent the latest message, and that message's preview. Use two
aligned columns, «Мы писали» / «Фан писал», beside one message preview prefixed
«Мы:» / «Фан:». Keep the avatar, tier emoji/count, lifetime spend beside the
name, and separate 30-day inflow. The board describes contact history; it does
not prescribe when to message, display urgency dots, or automate outreach.

Exact nullable timestamps come from local non-deleted messages plus the latest
known chat-list head. A newer known head supplies its own author and preview
together. Invalid dates and deleted heads cannot become current facts; queued,
failed or unconfirmed outbox rows do not advance a contact date. Unknown is «—»;
known zero spend is $0. The display clock updates locally, without network reads.
Sorting a date column compares exact timestamps inside each tier before clipping
its preview; unknown dates stay last in either direction. Default is oldest fan
message first. The open mini-chat is anchored by fan ID through sorting and
refresh, including when that fan moves outside a shelf preview.

Ping remains an explicit AI action with a separate human send action. Recency
alone no longer disables it in the Desktop composer, mini-chat or keyboard
actions. Hub Decision **#295** makes this possible on the OnlyFans feature lane
and defines its manual-outreach wording; the real active/segment classification
is retained. Existing authentication, personality, history-loading and send
gates still apply. SDK operations and public contracts are unchanged.

This supersedes only the Spenders row anatomy, urgency colouring, and OnlyFans
Ping age gate in the historical DESIGN/legacy descriptions. The approved visual
reference is `docs/mockups/spenders-contact-columns.html`; current behavior and
rollout dependency are recorded in `docs/spenders.md`. Hub support must ship
before or with the Desktop release. This decision records local implementation,
not a deployment.

**D30 (2026-09-12).** Follow-up to the owner's approved Spenders work: add a
single search field and a compact Filters popover for the last message's author
and available history. Search matches name, username and fan ID across loaded
rows, including rows beyond shelf previews. Matching loaded rows are shown
without clipping; unloaded tiers retain an explicit load action. Typing and
filtering initiate no history or roster reads. Counts describe loaded fans,
and the statistics panel retains its account-wide scope. Unknown message
history is not classified as a fan-authored message from a default boolean.
Filters never prescribe outreach timing. Account changes clear their chip,
expansion, filters and preview before another account can load using them.

Errors loading settings, lists, rosters or statistics are visible with manual
retry. Cached results remain visible on failed refresh. A failed initial read
cannot be presented as zero spend, an empty roster or perpetual loading.

History freshness is based on per-fan source fetch stamps. An all-TTL run keeps
the oldest verified stamp; policy skips, partial failures and stops have separate
outcomes and do not manufacture freshness. Auto-read policy and read-state
behavior are unchanged. Legacy completion-time stamps and queues cannot serve
as coverage evidence in the new state format. FanPanel shows the source fan
record's fetchedAt rather than React Query's delivery timestamp.

Completed AI drafts carry an insertion receipt on their operation. Opening the
same mini-chat again cannot reinsert an already consumed draft after sending,
clearing or editing. Explicit insertion remains repeatable; a new generation
has a new receipt. Account, conversation and operation identity fence insertion.
AI does not send messages. Current behavior and validation: `docs/spenders.md`.

**D31 (2026-09-12).** Release 0.1.52 includes D29–D30 after the owner authorized
deployment. Hub manual Ping is Decision 295 on the production-preserving release
branch; Decision 294 belongs to Fansly C1 diagnostics. The SDK is generated
from clean Hub revision `9597d931511185a5c571ea2d56dcf8302aa5bb72`, preserving
its current production contract hash. This compatibility refresh adds no new
Desktop operation. Publish Hub first, then the Windows installer and macOS DMG
through the existing cross-platform CI, packaged smoke, and served-artifact
verification gates. The final local full check passes 2,286 tests with five
existing skips and eight existing lint warnings.


**D32 (2026-09-15).** The new-followers workflow is freshly implemented for
OnlyFans in a dedicated rail/palette surface. The Fansly extension is a behavioral
reference only. Explicit consent precedes paid history reads, which can mark
chats read. A run fixes both time bounds at start, pages the newest-first fan
list, and keeps completed rows/drafts across pause/resume. Missing subscription
dates and incomplete/ambiguous evidence remain visible and cannot enable send.
Queue origin alone does not prove mass messaging: the OFAPI queue also accepts
one recipient. Current welcome-template matches likewise cannot prove origin.
These cases stay unknown pending stronger provider evidence. See
[the workflow and validation contract](followers.md).

All reads use the existing metered Hub client. A separate account FIFO spaces
requests after completion and retains 429 cooldown across pause/recheck/history
and send preflight. Cancellation is checked again after the ordinary limiter.
Renderer reads cached, bounded VMs and receives batched main events; there is no
renderer polling. History is shown in chronological order from already-fetched
messages. Older history is an explicit action, with a visible finite cap.

Generation reuses the existing coordinator and persona proof with core's
new-follower Hi mode and one reviewed text result. Sending rechecks the full
negative history and fresh sendability, compares the reviewed content revision,
fences local outbox changes, then enqueues one standard v1 text command.
SQLite v23 persists outreachPurpose independently of composer options. Generic
inbox Retry cannot bypass fresh follower checks. Indeterminate sends are never
automatically repeated or confirmed by loose local text matching. Core Decision
339 adds atomic per-page/fan command custody across feature users; it does not
lock native or ordinary chats while a command is waiting for delivery.

Debug mode retains eight run journals (100000 events / 20M characters per run),
with millisecond timestamps, page parameters, per-fan verdicts and explicit
truncation. Journals persist at pause/completion/action/shutdown checkpoints in
the encrypted local database; unexpected process termination can lose the
unfinished checkpoint. Export never includes credentials, headers, prompts or
message bodies. Normal transcript/draft storage follows the existing local
cache policy. This change prepares code only: no deployment or release. Hub
must ship first and the normal release contract-hash gate must pass.


**D33 (2026-09-15).** Owner rejected the unsolicited Desktop functionality
shown in the Message options panel and requested its removal in the next release.
API coverage is not approval to expose that API as a product workflow. This
supersedes D27's user-facing expansion and the operator instructions in
`docs/ofapi-composer.md`; D27/D28's durable send and recovery contracts remain.

For 0.1.54 remove the entire options panel: caption-lock creation, provider
screening selection, GIF/release-form/taggable-user lookup, manual creator,
partner and guest IDs, and automatic banned-word preview. Remove both Desktop
lookup/preview IPC channels and their Hub client plumbing, not just the markup.
The same scope audit removes new pin/unpin, mark-unread, mute/unmute and hide
controls plus the completed-command journal. These were expansion candidates in
Hub's coverage plan, not original Desktop requirements. Reply-to, like/unlike and
custom-name editing have explicit original requirements in PRD F4/F5 and remain.

No migration removes saved outbox payloads, action identities, hidden-chat state,
provider metadata or the generated Hub SDK. Older failed drafts retain every
option exactly; a compact selection summary appears only for those restored
options and lets the user explicitly clear them. Fresh drafts expose no options
workbench. Previously unresolved actions retain status checking without exposing
internal command names or a history of successful commands. Ordinary send and
PPV defaults, decimal pricing, guards and duplicate-send protections remain.

The source version is prepared as 0.1.54. Publication still uses the normal
release checks/tag/feed ritual; this decision is not a claim that an installer
has shipped.

**D34 (2026-09-15).** The 0.1.53 incident on LoraVie FREE returned 18 old,
chronologically unordered records from `/fans/all` and completed with zero fans
after two successful requests. The export omitted hasMore/next_page, so it cannot
establish which stop branch fired. Both assumptions were invalid: an old page
cannot terminate an unordered roster, and returned row count is not a cursor.
The new-follower workflow now uses `/fans/latest`, `type=new`, padded calendar
dates plus exact fixed local time bounds, strict `users`/pagination/source
validation and only the provider's validated next offset. It preserves pacing,
no hidden retries, and a bounded 250-page/5000-row scan. Journal page/stop/error
metadata makes completeness decisions reviewable. See [operator contract](followers.md).

Hub #342 classifies this roster as core audience, preserving explicit audience
policy and legacy explicitly selected collection jobs. Deploy that support before
shipping this client. The fix is included in the 0.1.54 release candidate; fixture checks do not
claim a live Lora test. Ordinary roster/spender consumers are unchanged.

**D35 (2026-09-15).** The desktop adopts the family's unified chatter account
(core's unified-account plan, §9). Five rulings, all in one release:

1. **One sign-in protocol, no cookie.** Issuance is a single public call,
   `authIssueDeviceTokenWithPassword` in `pending` mode. The raw `/auth/login`
   POST, the hand-parsed `set-cookie`, the cookie-carried reservation and the
   logout are gone; the desktop never holds a session. Everything downstream of
   the reservation — encrypted staging, the non-secret journal, the idempotent
   activation and every crash-recovery branch — is unchanged, so existing
   credentials keep working and nobody on the fleet re-signs in.

2. **The first run is a sign-in screen.** It appears only when this machine
   holds no device custody at all. A settling activation/revocation keeps the
   workspace behind a banner, a quarantined credential keeps the Account
   section's recovery, and an unreachable hub stays a status — none of them is
   a sign-out. Sign-in answers with an outcome envelope
   (CG-HUB-20 wrong login/password, CG-HUB-21 unreachable, CG-HUB-22 did not
   finish, CG-HUB-23 the owner must reset the password) because an Electron
   invoke rejection cannot carry a code the screen can localize.

3. **The legacy chatter key is retired here, not "one release later"** (D19
   phase 2 without the pause). The `hubApiKey`/`hubApiKeyStaged` slots, their
   binding journal, the two-store credential-transition protocol they required,
   `keyMeta`, the VM/patch fields, the env seed and the paste-a-key recovery are
   all gone; the secret files are deleted once at boot like every other
   decommissioned lane. An install that had only a key lands on the sign-in
   screen. Production holds no such install.

4. **A reasoned 401 heals itself.** The kernel's `reason`
   (`token_revoked` | `token_expired`) is lifted into typed detail on all three
   hub transports — the SDK lane, the OFAPI read gateway (the one a cold start
   hits first, which used to wedge on "HUB AUTH" with no SDK request in sight)
   and the connection probe — and all three report into ONE dispatcher. The SDK
   lane is wired to the SDK's own `onAuthError` hook rather than to a catch
   block, because the chatter's actual work (Fast Reply and every other
   generation) rides two SSE paths that no typed-call catch would see. It wipes
   local custody only with a reason the kernel actually sent, only when the
   rejected bearer is still the stored one (digest compare), only inside the
   credential FIFO, and never while a durable transition owns that custody. A
   reasonless 401 still fails closed, exactly as before.

5. **The account cache belongs to an identity.** Every authoritative reconcile
   stamps whose identity produced it; `query:accounts.list` hands rows only to
   that identity. This closes "A signs out, B signs in, B's first listAccounts
   fails offline → B opens A's workspace", which D23's own rule made possible
   (grants change only on a successful listAccounts). Nothing is deleted:
   D23/#145 still hold, and A's workspace returns on A's next sign-in. An
   install from before the stamp is unknown, not foreign.

Vocabulary (plan §2) is now pinned, not merely intended: user-facing strings and
the shipped guides may not name tokens, keys, APIs, bearers, activations,
reservations or prefixes. Technical detail survives only in Diagnostics.
`packages/shared/tests/copy-vocabulary.test.ts` fails on a violation — in the
catalog, in the error registry, in the three guides AND in the main-process
messages the Account section renders verbatim (a shipped "using the chatter-key
fallback and will retry automatically" is what made that last scope necessary)
— and `documentation-cutover.test.ts` is inverted to match. Settings' "Agency Hub"
section becomes "Account": who you are signed in as, the account page on the
hub, sign out of this device, help signing in.

The source version is prepared as 0.1.55. Publication still uses the normal
release checks/tag/feed ritual, and the kernel side of the contract must be
deployed first; this decision is not a claim that an installer has shipped.

**D36 (2026-09-16).** On LoraVie FREE every new fan receives the OF welcome
template within seconds of subscribing, so under D32 every not-yet-contacted fan
was `unknown` («Не удалось проверить») and the feature could never offer a
greeting (operator report 2026-09-15, journal run 1e4a58aa). Hub-journaled
provider bodies of that run showed the missing origin proof: all 12 delivered
welcome copies carried `queueId` equal to the welcome-template id
(31662501628) with `isFromQueue:false`, while personal DMs carried unrelated
queue ids. A sent message whose `queueId` equals the current template id is now
`automatic`; a complete history of only automatic messages is `ready` («В
истории только автоматическое welcome-сообщение»). Everything else keeps the
D32 reading: `isFromQueue:true`, a missing flag, an unavailable template, or a
bare text/media match without the id remain ambiguous and hold the fan at
`unknown`. A template re-created under a new id turns its earlier deliveries
into contacted/unknown, never ready — the safe direction. Fixture checks cover
the id match, id-with-edited-text, foreign-id text match, incomplete history
and the service-level ready path.

**D37 (2026-09-20).** The vendored `@kernel/sdk` moves from core `579b0e34`
(contract hash `8e9dda0b…`) to the deployed core `82571f3c` (hash
`2620650e…`), which is what production answers on `/api/v1/health` today, so
`apps/desktop/scripts/assert-release-sdk-vendor.mjs` passes again. Three core
decisions accumulated in that span — the API-key lane retired (#370), thirteen
`workboardV2*` operations removed (#376), the hi-greeting parameters added
(#379) — and none of them removed anything this client calls: typecheck and
the full unit suite were green on the re-vendor alone. `HUB_USAGE_FEATURES`
remains a subset of the SDK's `aiUsageFeatures`; `workboard-closing` left that
enum, so the only source change was the usage-mapper comment that named it.

New Followers now asks the kernel for `variantCount: 1` (core #379) instead of
the deprecated `greetingMode: "new-follower"` alias; `fanRef` still rides with
it, so the kernel keeps persisting an explicit fan ref on the generation row.
The client-side rule that split three chat-Hi alternatives by `[VARIANT]` is
keyed on the requested count instead of the mode, and the queue's "exactly one
message" guard is unchanged.

The alias did one thing beyond the count: it skipped `gate_hi_greeting_limit`
(kernel `apps/runtime/src/modules/ai/features/index.ts`, `assertHiGreetingFreshness`,
limit 10). Without it the kernel counts every message in its OnlyFans archive
window for that conversation — there is no automation evidence on this lane, so
#379's personal-message count does not apply here. That gate cannot reach a
follower this queue would greet: `generate()` refuses anything but `ready`
(`src/main/followers/service.ts`), and `ready` (`src/main/followers/evidence.ts`,
`assessHistory`) means a complete history with no incoming message, no personal
outgoing one and nothing ambiguous — welcome deliveries only. Measured on
production `dm_message_archive` on 2026-09-20: of 6 301 OnlyFans conversations
with zero incoming messages, the largest holds 6 messages and none exceeds ten.
The kernel's 400 for the gate was already mapped to CG-FLOW-09
(`src/main/hub/ai-feature-gateway.ts`), because the chat Hi button has always
been subject to it.

Tests pin the wire shape: the gateway adapter sends `variantCount: 1` with
`fanRef` and no `greetingMode` for the queue and neither field for chat Hi
(`tests/ai/feature-lane.test.ts`), `buildFeatureResult` splits by `[VARIANT]`
only when no count was requested (`tests/ai/coordinator.test.ts`), and
`generateFollowerGreeting` starts the operation with `params: { variantCount: 1 }`
(`tests/followers/generation.test.ts`). Not verified here: prompt quality — the
unified template changes generations on both surfaces, and core #379 leaves
that sampling to the owner.

**D38 (2026-09-26).** Owner-approved plan «OF Desktop: PPV purchases and the
stale startup list», stage D1 (`_docs/2026-09-26-of-desktop-purchases-and-startup-plan.md`).
For ~80 s after launch the desktop showed yesterday's list: the first poll
walked five pages per account and wrote rows only after the whole walk, hub
list reads could hang 60 s, the v2 stream replayed every granted platform
(~17.6k Fansly frames ahead of OnlyFans at the 2026-09-25 launch), and a
`subscription.started` handler awaited a list read that waited on the hung
sweep until the 45 s SSE watchdog dropped the connection — while the status
bar already said HUB LIVE on the stream's first byte.

1. **SDK re-vendored** from the deployed core `a51e687d` (contract `21a767b8…`,
   = production `/api/v1/health`). The desktop keeps parsing v2 frames with
   its own schema (`packages/shared/src/protocol`), not the SDK's
   `subscribeDomainEvents`: H3's `provenance` is a closed enum there and an
   unknown value would be `frame_validation_failed`. Here `provenance` is read
   open (`frameProvenance`: anything but `live | redelivery | repair` is
   `unknown` = not live); malformed `transactionRef` / `thread` degrade to
   absent instead of rejecting the durable frame.
2. **`platform=onlyfans`** on the v2 stream (every connect, cursorless too)
   and on the v2 snapshot; the H3 cursors it mints are bound to it. A
   client-side filter stays, because an older Core ignores the parameter on a
   cursorless request: a frame whose `accountRef` is not an OnlyFans OFAPI
   ref (`acct_…`) is checkpointed past, never mistaken for grant drift.
3. **One transaction per frame.** `handleHubEvent` is synchronous and never
   awaits the network. HubSync runs it and the v2 cursor write (a `settings`
   row of the same DB) inside one SQLite transaction; emits, notifications and
   detached reads run only after the commit. A crash between local state and
   checkpoint is impossible; an async handler is refused.
4. **Sync intents** (`sync_intents`, schema v24) carry every read a frame
   still owes, committed with the frame: `account_list` «list not older than
   T» (subscription nudges, an enriched message for an unknown chat) is closed
   by any successful page-1 read that started at T + 2 s or later, with at
   most one intent-driven read per account per 30 s; `chat_message` (thin
   frames, D13) needs the exact row with auto-read and a head at or past M in
   list-only mode, and closes when M arrives from any source or is deleted;
   `delete_head` asks for an authoritative read and then clears a cached head
   that still shows the deleted message. Failed reads back off 5/10/20 s and
   close with a warning after three. Nothing re-reads a given-up obligation on
   a schedule for every account: the FOCUSED account gets its 5-minute safety
   read; any other account catches up only with its next hub event, the next
   re-verification (an outage over 60 s, a 409, a restart) or its next safety
   read once the chatter focuses it — the paid-read budget is not widened for
   it. T is the frame's `occurredAt` for replayed frames (converted to the
   local clock through the hub clock offset) — the startup read proves them
   for free — and the local receipt time for live ones. Intents wait while
   their account's verification is pending and survive restarts; those of an
   account the runtime no longer handles close as `account-gone` at start, on
   a grant shrink and whenever the worker meets them. The worker cannot spin:
   a chat intent is never re-read within 5 s of its previous read, an account
   list never within 30 s, and every outcome without progress closes the
   intent or moves its next attempt forward (review of #36: an intent for an
   account without a polling loop looped in microtasks and froze the main
   process on every launch).
5. **Startup.** Each account's first poll IS its verification: page 1 is
   written, painted and reported the moment it arrives, in parallel with the
   replay; deeper pages and hydration are written page by page with the local
   head preserved; a failed page-1 read retries after 5, 10 and 20 s and then
   gives up. `chats.sync_baseline_message_id` is now the delta detector, apart
   from the UI head: the head is published at once, the detector advances only
   after the automatic body delta reached it (auto-read) or at once
   (list-only), so an unfinished delta is re-detected instead of lost. An
   authoritative page 1 still moves a head backwards (a missed deletion) but
   keeps a newer head written within 10 s before the read or during it
   (`HEAD_WRITE_PROTECT_MS`): the list endpoint lags the webhook, and a safety
   read one second after a hub message would otherwise put the old preview
   back and clear its unread for up to five minutes.
6. **Timeouts and retries.** Chat-list reads are `retry: 'none'` (every caller
   owns its schedule). Client timeouts follow the hub's (core #262): 25 s for
   chats, chat messages and transactions, 65 s for explicit deep history;
   other gateway reads keep 75 s.
7. **Double unread on replay** fixed: a hub message raises `unread_count` only
   when it is newer than the current head (the list's count already includes
   the head and everything before it).
8. **Safety net.** While the stream is live (hidden window included), page 1
   of the focused account every 5 minutes, skipped when any successful page-1
   read of it happened in the last 5 minutes; one check after the OS resumes
   (Electron `powerMonitor` and the existing sleep detector both signal a
   wake; one check runs, the other joins it), same skip rule.
9. **Toast gate.** A v2 frame alerts only with provenance `live`, an
   `occurredAt` at most 9 minutes old (`NOTIFICATION_MAX_AGE_MS`) and the
   existing replay_completed rule; `redelivery`, `repair` and unknown never
   alert. 9 minutes sits below Core's 10-minute auto-redelivery quiet period
   and above OFAPI's own delivery delays: on pages 8/9 over 30 days, 88
   ordinary incoming messages arrived 3–10 minutes late (e.g. 2026-09-25
   04:18–04:54 UTC, 181–277 s) and 0.1.56 notified them. The age is measured
   on the hub's clock — the offset comes from the `Date` header of every
   stream (re)connect and v2 snapshot, median of the last five, local clock as
   the fallback — so a PC clock minutes off neither mutes nor admits alerts;
   the D24 epoch rule uses the same offset. v1 frames and polling keep their
   D24 rules. The first message of a chat the list does not have yet is
   announced without waiting for the list read: with the fan's name from the
   local fans cache, else as «Новый чат» (`notif.newChat`).
10. **SYNCING and re-verification.** A verification epoch starts at session
    start, after a stream outage longer than 60 s and after a replay gap
    (409 / grant rebaseline); the planned 15-minute reconnect never leaves
    LIVE. Status `SYNCING` (amber, `sb.syncingTip` — the owner-approved text)
    lasts until Core's replay marker AND a page-1 read (or exhausted retries)
    of every account; without a marker for 60 s of live stream it fails open.
    The word shows only while the stream is live: an unreachable hub cycles
    connecting/degraded on every retry, and the polling state speaks then
    (no SYNCING↔DEGRADED flicker).
    Re-verification is paid work started by a transition, so it is coalesced
    to at most one epoch per 5 minutes (incident 2026-07-15: a flapping stream
    must not scale reads). «ПУШ» counts only live frames (after the
    connection's marker, provenance `live`).
11. **One banner** above the chat list (D33-approved; no other UI):
    «Список от чт 16:07, обновляется…» for the selected account when the
    current epoch has not verified it yet and its list is older than 5
    minutes, when SYNCING lasts over 10 s while it is still unverified, or when
    the stream is live but its list is older than 12 minutes. The time is the
    durable «list verified» clock (start of the last successful page-1 read,
    persisted at most once a minute).

Acceptance instrumentation (desktop log): `[diag] list page1 painted`
(`sinceLaunchMs` from process start, `readMs`, `trigger`), `[diag] list
verified` / `list verification retry scheduled` / `list verification gave up`,
`[diag] safety read` / `safety read skipped`, `[sync] hub replay completed`
(`framesByAccount` by Core page id, `offPlatformFrames`), `[sync] list sync
started` / `list sync complete`, `[sync] sync intent opened` / `closed` /
`gave up` / `read`, `[sync] local clock differs from the hub` (once, with
`offsetMs`). D2 builds on the same frame meta (`provenance`,
`transactionRef`, `thread`) and effect list; the detached PPV/tip
`refreshChat` stays until D2 removes it. Not verified here: the p95 paint
target and the credit rate on real OFAPI — both need the release and its logs.
