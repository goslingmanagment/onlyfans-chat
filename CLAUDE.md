# CLAUDE.md — ChatGoose Desktop

Electron desktop chat client for OnlyFans agency chatters with built-in AI
(replies, coaching, fan summaries, pings, supporters board). OnlyFans can't
be injected into, so the app renders its own chat UI over the third-party
OnlyFans API (onlyfansapi.com, "OFAPI"). It is a client of the Agency Hub
(`~/code/goose/hub`, "core" / "the kernel"): every platform read goes
through the hub read gateway and every write (text, typing, unsend,
mark-read, media) through its command outbox, via the vendored
`@kernel/sdk`; AI is kernel-only (no vendor SDKs, keys or prompts here).
Sign-in: one account per chatter, login + password, device token (D35).
Sibling for Fansly: `~/code/goose/fansly-ext`.

## Where the truth is

- `docs/decisions.md` — decision log (quick-ref table + entries);
  cross-repo rulings live in the hub's log and are referenced by number.
- Hub `docs/error-handling.md` — family-wide error taxonomy.
- `docs/followers.md`, `docs/spenders.md`, `docs/ofapi-composer.md` —
  current operator docs for those surfaces (composer partly reverted, D33).
- `docs/RELEASE.md` — build and ship: a `v*` tag → Windows build →
  auto-update for all users. Version is `apps/desktop/package.json` + tags.
- `docs/vendor/onlyfansapi/` — vendored OFAPI docs: `openapi.json` is the
  field-level truth (query with `jq`), `llms-full.txt` (grep, don't read).
  Per-page docs: append `.mdx` to any `docs.onlyfansapi.com` URL.
- `docs/research/onlyfansapi.md` — OFAPI capability map and gotchas;
  `docs/research/reactivation-guide.md` — ping templates, byte-for-byte;
  `docs/research/legacy-chatgoose.md` — behaviors ported from the predecessor.
- `docs/DESIGN.md` — §3 perf checklist and the §5 mockup are the visual
  reference.
- Historical, read on demand, never as current truth: `docs/PRD.md`,
  `SPEC.md`, `PLAN.md`, `SESSIONS.md`, `docs/generated/` (maps from July),
  `docs/research/agency-hub-core.md`.

## Layout and checks

pnpm monorepo: `apps/desktop` (Electron + React + TS strict + Tailwind),
`packages/shared` (pure TS, densest tests), `packages/kernel-sdk` (vendored:
never hand-edit; re-vendor from the hub with its `scripts/vendor-sdk.mjs`
when new operations are needed; the vendor test + typecheck pin the
contract hash).

- `pnpm check` = typecheck + lint + test + build, green before a commit; CI
  runs it on Linux and Windows.
- Running the app for real: skill `run-desktop`
  (`.claude/skills/run-desktop`), isolated keyless profile.
- Hub-side changes may be made in the same session: keep the contract in
  sync, run the hub's own checks, commit the two repos separately.

## Things that bite

- Product scope: SDK or API support does not authorize new UI. Add
  user-facing capabilities only when the owner asks; don't expose raw
  provider IDs, screening modes or command journals (D33).
- Verify OFAPI shapes against `openapi.json` or a fresh `.mdx`, never from
  memory; read the endpoint's docs before implementing a subsystem.
- Secrets and network only in Electron main; `packages/shared` stays
  platform-pure; zod at every trust boundary; local DB and media cache
  encrypted at rest (SPEC §15).
- AI never sends without explicit human action; never auto-retry an
  indeterminate send. Live test sends only to the owner's test fan
  (`P3_SEND_TEST_FAN_ID` in `.env`); without it, no live send at all.
- Amounts from OFAPI are dollars; the Fansly predecessor used mills, don't
  port mills→USD conversions here.
- Two ID namespaces: OFAPI `acct_…` vs raw OnlyFans numeric ids
  (`chat_id === fan.id`). Never mix.
- Theme is a CSS-variable swap (`.dark` on `<html>`), never per-component
  dark styling. Use the frontend-design skill for new surfaces.
- Never roll back to 0.1.30/0.1.31 (dead on launch; D8, `docs/RELEASE.md`).
