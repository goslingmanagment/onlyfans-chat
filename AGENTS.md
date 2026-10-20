# AGENTS.md — ChatGoose Desktop

Electron desktop chat client for OnlyFans agency chatters with built-in AI
(replies, coaching, fan summaries, pings, spenders board). OnlyFans can't be
injected into, so the app renders its own chat UI over the OnlyFans API
(onlyfansapi.com, "OFAPI"). A client of the Agency Hub
(`~/code/1-platform/hub`): every read goes through the hub read gateway,
every write (text, typing, unsend, mark-read, media) through its outbox, via
the vendored `@kernel/sdk`; AI is hub-only. Sign-in: login + password,
device token. Sibling for Fansly: `~/code/1-platform/fansly-chat`.

## Running and checks

- pnpm monorepo: `apps/desktop` (Electron + React + TS strict + Tailwind),
  `packages/shared` (pure TS, most of the tests), `packages/kernel-sdk` and
  `packages/chatgoose-hotkeys` (vendored, see below).
- Locally: typecheck, lint and the tests of the package/file you touched.
  The full `pnpm check` (typecheck + lint + test + build) is CI's job: ready
  PRs on Linux, pushes to `main` on Linux + Windows. On the PC runners the
  Linux job goes through `scripts/ci-parallel-check.mjs`; tests write only to
  temp dirs.
- A PR touching native modules, paths, the installer or the updater: run
  `windows-build` manually (workflow_dispatch, `publishFeed=false`) before
  merging.

## How to look at it

Skill `run-desktop` (`.claude/skills/run-desktop`): the built app, an
isolated keyless profile, offline.

## Release

Pushing a `v*` tag → `windows-build.yml` re-checks and builds on Windows →
auto-update for everyone. Version: `apps/desktop/package.json`. Details:
`docs/RELEASE.md`.

## Dangerous

- Never roll back to 0.1.30/0.1.31 (they crash on launch).
- AI never sends without explicit human action; never retry an
  indeterminate send. Live test sends go only to the owner's test fan
  (`P3_SEND_TEST_FAN_ID` in `.env`); without it, no live sends at all.
- Secrets and network only in Electron main; `packages/shared` stays
  platform-pure; zod at every trust boundary; the local DB and media cache
  are encrypted.
- Product: SDK or API support is no reason for new UI. New user-facing
  capabilities only when the owner asks; never show raw provider IDs,
  screening modes or command journals.

## Things that bite

- Check OFAPI shapes against `docs/vendor/onlyfansapi/openapi.json` (`jq`)
  or a fresh `.mdx` (append `.mdx` to a `docs.onlyfansapi.com` URL), never
  from memory; `llms-full.txt` is for grep only. Capability map:
  `docs/research/onlyfansapi.md`.
- OFAPI amounts are dollars; don't port mills from the Fansly client here.
- Two ID namespaces: OFAPI `acct_…` and numeric OnlyFans ids
  (`chat_id === fan.id`). Never mix them.
- `packages/kernel-sdk`: re-vendor from the hub (`scripts/vendor-sdk.mjs`),
  never hand-edit; the test and typecheck pin the contract hash.
  `packages/chatgoose-hotkeys`: from the hub (`scripts/vendor-hotkeys.mjs`)
  into BOTH clients from one commit; the manifest sha256 must match.
- Hub-side changes may be made in the same session: keep the contract in
  sync, run the hub's checks, commit the two repos separately.
- Theme is a CSS-variable swap (`.dark` on `<html>`), no per-component dark
  styling.
- `docs/decisions.md` (D1–D45) is frozen since 2026-10-20 as a reference for
  history; new decisions go in the PR description. `docs/PRD.md`,
  `docs/SPEC.md`, `docs/PLAN.md`, `docs/SESSIONS.md`, `docs/generated/` are
  history, not current truth.
