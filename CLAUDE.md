# CLAUDE.md — ChatGoose Desktop

Desktop chat client for OnlyFans agency chatters with built-in AI assistance (reply generation, coaching, fan summaries, reactivation pings). Successor to the ChatGoose Firefox extension for Fansly. We cannot inject into OnlyFans, so this app renders its own chat interface on top of the third-party OnlyFans API (onlyfansapi.com, "OFAPI") — OnlyFans accounts are connected through OFAPI, and the desktop reaches OFAPI through the Agency Hub "core" (reads proxied via the hub read-gateway, writes via the command outbox).

**Current state (2026-07-07): post-kernel-migration, in production via auto-update (fleet on 0.1.30). The app is a kernel client: ALL platform reads go through the core read-gateway and ALL writes (text/typing/unsend/mark-read/media) through the command outbox — both via the vendored `@kernel/sdk` (`packages/kernel-sdk`), authenticated with per-device tokens. AI is kernel-only (decision D4 / core #111): this repo holds NO vendor AI SDKs, NO API keys, and NO prompts — every generation streams from core's AI gateway; the local LLM clients, prompt files, and key settings were deleted in the Stage 31 sweep. The 0.1.31 release (the kernel-AI cutover reaching users) is owner-gated on 0.1.30 fleet adoption (Stage 31 Task 5). PR CI runs `pnpm check` (Stage 35).** For any remaining phase work, the per-phase status notes in `docs/PLAN.md` are the source of truth, not this line.

## Read these before designing or building anything

| Doc | What it answers |
|---|---|
| `docs/decisions.md` | This repo's decision log (D1–D5 quick-ref) + the family law; cross-repo rulings live in core's log and are referenced by number |
| `docs/generated/` | Regenerated post-migration codebase maps (Stage 35) — machine-generated, banner says how to regenerate; the Pass 1 originals in `docs/project-kernel/` are superseded history |
| `docs/PRD.md` | What we're building, for whom, feature requirements, UX principles, risks |
| `docs/SPEC.md` | Architecture, stack, security model, sync/send/AI design, invariants (§15) — §6.2 and §8.6 carry SUPERSEDED banners (stream v2 + kernel-only AI shipped); when SPEC and `docs/decisions.md`/`docs/generated/` disagree, the latter win |
| `docs/PLAN.md` | Phase order, exit criteria, current next actions |
| `docs/DESIGN.md` | UI/UX brief: workspace anatomy, hotkeys, **performance-engineering checklist (review-blocking for renderer PRs)**, visual direction |
| `docs/research/legacy-chatgoose.md` | Complete behavioral inventory of the predecessor (features, prompts, exact constants/timeouts, lessons). Normative for ported behavior |
| `docs/research/onlyfansapi.md` | OFAPI capability map, real-time strategy, credits/pricing, gotchas, key docs URLs |
| `docs/research/agency-hub-core.md` | Capability map of the Agency Hub "core" backend (`~/code/core`) — the live ChatMuse contract, auth model, what P6 adds there |
| `docs/research/reactivation-guide.md` | Agency reactivation playbook — ping templates (A1–A11 / B1–B5) byte-for-byte + normative tone rules for any reactivation-message generation |
| `docs/SESSIONS.md` | Session runbook — restartable per-phase session prompts, the "one session per repo" rule |
| `docs/RELEASE.md` | How to build/ship the desktop installer: a `v*` tag → auto-update reaching all users (hands off to `WINDOWS-GUIDE.html`) |
| `docs/vendor/onlyfansapi/` | Vendored API docs: `openapi.json` (field-level source of truth — query with `jq`), `llms-full.txt` (grep, don't read whole), see its README |

## Hard rules

- **Verify OFAPI shapes against `docs/vendor/onlyfansapi/openapi.json` or fresh `.mdx` pages — never from memory.** Per-page docs: append `.mdx` to any `docs.onlyfansapi.com` URL.
- **Before implementing any OFAPI subsystem, read its primary docs** — grep `docs/vendor/onlyfansapi/llms-full.txt` and/or fetch the curated `.mdx` URLs listed in `docs/research/onlyfansapi.md` §8. The research summary is for planning; it is not sufficient detail for implementation.
- **Do NOT look at `~/code/chatgoose_desktop`** — abandoned incorrect implementation, explicitly excluded by the owner.
- The central backend is the **Agency Hub "core"** repo (`~/code/core`, in production: Fastify + Postgres). Everything privileged lives there: the read-gateway, the command outbox, the AI gateway, money, device-token auth. Server-side work (OFAPI webhooks, SSE fanout, gateway features) happens in that repo, not here — this repo consumes the contract through the vendored SDK (see "Kernel SDK" below). Core's OpenAPI snapshot: `~/code/core/reference/agency-hub.openapi.json`.
- **Core edits: same session is OK when needed** (owner decision 2026-06-21 — a separate session per core change was too inconvenient). `~/code/core` is the central backend (production: Fastify + Postgres + React dashboard); default to consuming its contract (SPEC §9) read-only, but when desktop work genuinely needs a core-side change you MAY patch core in this same session. When you do: (1) keep both sides of the contract in sync — SPEC §9.2 here ↔ core's OpenAPI (`~/code/core/reference/agency-hub.openapi.json`); (2) run core's own checks before committing there, since it's live; (3) commit core separately from desktop (one commit still touches one repo). For larger core-side tracks (P6 etc.), still record them in `docs/PLAN.md`. Core reads this repo's SPEC §9.2, `docs/research/onlyfansapi.md` §4, and the Phase-0 webhook fixtures as its brief.
- The legacy repo `~/code/chatgoose` is a **read-only behavioral reference — do NOT copy its code** (owner decision 2026-06-10: it was written for/by weaker models; write everything fresh). What carries over literally is exactly three things: **prompts byte-for-byte**; **product constants/data** (timeouts, temperatures, message counts, ping thresholds, model registry, `CG-*` error taxonomy — tuned config, catalogued in `docs/research/legacy-chatgoose.md`); and **test cases as behavior facts** (re-express legacy test cases in fresh test code, but never drop cases — they encode production-found edge cases: Gemini leak patterns, escape ordering, cache-staleness matrix). When unsure what the exact behavior is, read the legacy source to learn it — then implement your own. Never reproduce Fansly-specific parts (DOM injection, session capture, Fansly endpoints) — the split is in that doc's §10.
- SPEC §15 invariants are review-blocking: secrets/network only in Electron main; `packages/shared` stays platform-pure; zod at every trust boundary; never auto-retry an indeterminate send; AI never sends without explicit human action; local DB/media cache encrypted at rest.
- **This repo assembles no prompts and holds no vendor AI anything** (decision D4 / core #111). The prompt library was byte-migrated INTO core (core Stage 30, sha256-pinned manifest) and is frozen there; generations send refs + `clientContext` to core's feature lane and stream the result. Any prompt work happens in `~/code/core`, gated by its manifest pin — never here.
- Keep PRD/SPEC/PLAN current: when a decision changes during implementation, update the doc in the same change.

## Kernel SDK: versioning and pinning

- The kernel contract is consumed ONLY through the vendored compiled SDK at
  `packages/kernel-sdk` (dist + `kernel-sdk.vendor.json` recording the
  `contractHash`, SDK version, and the core commit it was cut from). **Never
  hand-edit anything under it.**
- Re-vendor only when this app needs new operations: in `~/code/core`, run
  `node scripts/vendor-sdk.mjs ../chatgoose_desktop_fable/packages/kernel-sdk`
  (after `pnpm contracts:generate` there), then commit the vendor directory
  here as its own change.
- Two gates protect the pin (drill-proven 2026-07-07): the vendor test
  (`packages/shared/tests/kernel-sdk-vendor.test.ts` — manifest hash must equal
  the SDK's exported `KERNEL_CONTRACT_HASH`) catches a partial/hand-edited
  vendor, and `pnpm typecheck` catches a breaking contract change (a renamed
  op fails compilation at every call site). Both run inside `pnpm check` on
  every PR.

## Conventions

- pnpm monorepo: `apps/desktop` (Electron + React + TS strict + Tailwind), `packages/shared` (pure TS; named to avoid collision with the "core" repo). No `apps/hub` here. Layout: SPEC §3.
- `pnpm check` = typecheck + lint + unit tests + build — must pass before any commit (legacy discipline: 783 tests on the predecessor).
- Tests: Vitest; pure functions in `packages/shared` get the densest coverage; OFAPI client tested against recorded fixtures in `tests/fixtures/`.
- UI is designed from scratch against `docs/DESIGN.md` (PRD §7 principles + DESIGN §3 perf checklist are review-blocking; the §5 mockup is the binding visual reference); use the frontend-design skill for new surfaces; warm professional theme — light by default plus an optional dark theme (owner 2026-06-13), implemented as a pure CSS-variable swap (`.dark` on `<html>`, never per-component dark styling); keyboard-first.
- All amounts: OFAPI returns dollars; legacy Fansly used mills — don't port mills→USD conversions into OFAPI code paths.
- Two ID namespaces: OFAPI `acct_…` vs raw OnlyFans numeric ids (`chat_id === fan.id`). Never mix.
