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
