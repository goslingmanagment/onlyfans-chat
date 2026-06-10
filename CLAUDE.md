# CLAUDE.md — ChatGoose Desktop

Desktop chat client for OnlyFans agency chatters with built-in AI assistance (reply generation, coaching, fan summaries, reactivation pings). Successor to the ChatGoose Firefox extension for Fansly. We cannot inject into OnlyFans (accounts are accessed via OnlyMonster), so this app renders its own chat interface on top of the third-party OnlyFans API (onlyfansapi.com, "OFAPI").

**Current state: documentation/planning phase. No application code yet.** Start any implementation work from the plan's current phase.

## Read these before designing or building anything

| Doc | What it answers |
|---|---|
| `docs/PRD.md` | What we're building, for whom, feature requirements, UX principles, risks |
| `docs/SPEC.md` | Architecture, stack, security model, sync/send/AI design, invariants (§15) |
| `docs/PLAN.md` | Phase order, exit criteria, current next actions |
| `docs/research/legacy-chatgoose.md` | Complete behavioral inventory of the predecessor (features, prompts, exact constants/timeouts, lessons). Normative for ported behavior |
| `docs/research/onlyfansapi.md` | OFAPI capability map, real-time strategy, credits/pricing, gotchas, key docs URLs |
| `docs/research/agency-hub-core.md` | Capability map of the Agency Hub "core" backend (`~/code/core`) — the live ChatMuse contract, auth model, what P6 adds there |
| `docs/vendor/onlyfansapi/` | Vendored API docs: `openapi.json` (field-level source of truth — query with `jq`), `llms-full.txt` (grep, don't read whole), see its README |

## Hard rules

- **Verify OFAPI shapes against `docs/vendor/onlyfansapi/openapi.json` or fresh `.mdx` pages — never from memory.** Per-page docs: append `.mdx` to any `docs.onlyfansapi.com` URL.
- **Before implementing any OFAPI subsystem, read its primary docs** — grep `docs/vendor/onlyfansapi/llms-full.txt` and/or fetch the curated `.mdx` URLs listed in `docs/research/onlyfansapi.md` §8. The research summary is for planning; it is not sufficient detail for implementation.
- **Do NOT look at `~/code/chatgoose_desktop`** — abandoned incorrect implementation, explicitly excluded by the owner.
- The central backend is the **existing Agency Hub "core"** repo (`~/code/core`, in production: Fastify + Postgres + React dashboard). It already exposes the fan-profile / ai-usage / chatter-API-key endpoints this app consumes (there the product is called **"ChatMuse"**). Server-side hub work (OFAPI webhooks, SSE fanout, AI gateway) happens in that repo, not here — this repo only consumes the contract in SPEC §9. Core's OpenAPI snapshot: `~/code/core/reference/agency-hub.openapi.json`.
- The legacy repo `~/code/chatgoose` is a **read-only reference and the porting ground truth**. When porting any behavior, read the actual legacy source and its tests — `docs/research/legacy-chatgoose.md` is the map (start from its "Essential Files Reference" table), the code is the truth. Never copy Fansly-specific parts (DOM injection, session capture, Fansly endpoints) — the split is documented in that doc's §10.
- SPEC §15 invariants are review-blocking: secrets/network only in Electron main; `packages/core` stays platform-pure; zod at every trust boundary; `escapeForPrompt` + safety preamble + output sanitizer on every LLM path; never auto-retry an indeterminate send; AI never sends without explicit human action.
- Prompt templates port verbatim (Fansly→OnlyFans wording only) until the prompt regression harness exists (PLAN P4). The anti-AI-slop work is the most valuable asset — don't "improve" prompts casually.
- Keep PRD/SPEC/PLAN current: when a decision changes during implementation, update the doc in the same change.

## Conventions (once code exists)

- pnpm monorepo: `apps/desktop` (Electron + React + TS strict + Tailwind), `packages/shared` (pure TS; named to avoid collision with the "core" repo). No `apps/hub` here. Layout: SPEC §3.
- `pnpm check` = typecheck + lint + unit tests + build — must pass before any commit (legacy discipline: 783 tests on the predecessor).
- Tests: Vitest; pure functions in `packages/core` get the densest coverage; OFAPI client tested against recorded fixtures in `tests/fixtures/`.
- UI is designed from scratch (PRD §7 principles); use the frontend-design skill for new surfaces; dark theme default, keyboard-first.
- All amounts: OFAPI returns dollars; legacy Fansly used mills — don't port mills→USD conversions into OFAPI code paths.
- Two ID namespaces: OFAPI `acct_…` vs raw OnlyFans numeric ids (`chat_id === fan.id`). Never mix.
