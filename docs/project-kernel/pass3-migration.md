> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# ChatGoose Desktop — Pass 3 migration overview

**Written 2026-07-04 by Pass 3c** (`core:docs/project-kernel/prompts/prompt-3c-stage-specs-clients.md`).
This is the desktop repo's index into the ecosystem migration plan. **The full,
hand-off-ready specifications live in core** — `core:docs/project-kernel/pass3/stages/` —
and the master plan is `core:docs/project-kernel/pass3/roadmap.md`. This file orients a
session working in THIS repo: which stages touch it, in what order, and what each one holds
this repo to. Where this file and a core-side spec disagree, the core spec wins; where a
spec and the code disagree, stop and report drift.

## The desktop's role in the target

A **pure kernel client** (target architecture §10.1): keeps its custody model (SQLCipher,
keychain, media token indirection), its outbox/verifier send discipline, and its UI; loses
every lane that bypasses the kernel (direct OFAPI reads, direct vendor AI, lossy self-
reported telemetry) and every locally-drifting copy of product logic (prompts, cost tables,
model registry).

## Stages touching this repo, in execution order

| Stage | Core spec | What happens in this repo |
|---|---|---|
| 4 | `stage-04-desktop-stop-loss-release.md` | Release 0.1.29: usage spool never self-deletes (drop-after-3 dies, `packages/shared/src/hub/usage-reporter.ts`), prune caps ×10 (messages 5,000→50,000; spend 31 d→310 d; guard-audit TTL 90 d→3,650 d), `cmd:data.purge` warning, `x-client-version` header on all hub calls (Proposal 4.1), Q5 artifact-diff before publishing. |
| 11 | `stage-11-client-capture-lane.md` (core side; wire contract §2 is binding verbatim) | The Stage 4 spool generalizes into the capture uploader: batches ≤100, uuid `clientEventId`, resend-until-2xx, `Retry-After` honored, 400 → exportable quarantine; `cmd:data.purge` becomes upload-`data_purge_notice`-then-wipe. |
| 12 | `stage-12-desktop-local-db-harvest.md` | One-time harvest of the local DB (messages, fan_transactions, outbox, guard events, usage/spend/credit ledgers) through the Stage 11 lane; deterministic event ids; per-machine manifest; owner-triggered; local prunes stay frozen until manifests reconcile. |
| 24 | `stage-24-desktop-migration-sdk-stream-v2-direct-read-removal.md` | Hand-written hub client → pinned `@kernel/sdk`; SSE v1 → v2 (opaque cursor, per-account snapshots; rollout-window-only v1 fallback flag); device-token login; **Direct-OFAPI read mode removed** (DP 8 — `ofapiReadTransport` collapses to `z.literal('hub')`, the write path's precedent; `ofapiKey` keychain secret decommissioned). Outbox/verifier semantics are a byte-for-byte keep. |
| 31 | `stage-31-desktop-ai-cutover.md` | AI dock calls kernel feature services (NOT the current proxy hub-AI mode); local prompt library / cost tables / model registry / vendor provider clients deleted; `anthropicKey`/`openRouterKey` decommissioned; acceptance lifecycle (shown/copied/inserted/sent+edited) reported on the capture lane with generation refs. |
| 35 | `stage-35-redocumentation-family-standard.md` | CLAUDE.md updated to post-migration truth; `docs/decisions.md` bootstrapped; PR CI added (`pnpm check` — the zero-PR-CI era ends); maps regenerated into `docs/generated/` from the committed prompt; release-hygiene assert (feed == tag == package.json). |

Stages 20/21/22 are kernel-side but fix the contracts this repo consumes (SDK + drift CI,
stream v2 shape, device tokens); read their specs before executing 24.

## Standing constraints while migrating (from the master's §3/§14)

- **Crown jewels:** chat freshness and the send path. No stage may weaken the outbox
  one-attempt/fail-closed/verifier discipline (`apps/desktop/src/main/send/engine.ts`,
  `db/queries/outbox.ts`); Stage 24's exit explicitly re-verifies a week of chat freshness.
- **Auto-update feed continuity:** same URL, same generic provider, same unsigned-trust
  model, for every release in this plan (`apps/desktop/electron-builder.yml:60-62`);
  auto-update applies to Windows packaged builds only (`updater.ts:19-21`) — every rollout
  plan carries a manual macOS step.
- **Chatter bearer keys keep working** until the kernel declares retirement after Stages
  24 + 32 confirm fleet migration (device tokens are adopted, keys are not broken).
- **Custody is a keep**: SQLCipher local DB, keychain secrets, media token indirection —
  no stage moves or re-mechanizes credentials; specs reference the keychain seam
  (`src/main/secrets/keychain.ts`) by interface only.
- **Prompt freeze** (Stage 30 window): no prompt tuning in this repo between the kernel's
  inventory snapshot and parity sign-off; after sign-off, all tuning is kernel-side forever.

## Repo-local facts the specs pinned (verified 2026-07-04)

Version 0.1.27 committed (`apps/desktop/package.json:4`) vs 0.1.28 on the feed — Q5,
owner-accepted, artifact-diff mitigation in stage-04. No hub telemetry exists today (no
version header, no heartbeat) — stage-04/12 handle it. Acceptance metadata is local-only and
stripped from the wire (`hub/usage-mapper.ts:3-5`) until Stage 31 closes the loop.
`docs/project-kernel/` (this folder) was untracked until Pass 3c — commit it with this file.
