# CLAUDE.md — ChatGoose Desktop

Desktop chat client for OnlyFans agency chatters with built-in AI assistance (reply generation, coaching, fan summaries, reactivation pings). Successor to the ChatGoose Firefox extension for Fansly. We cannot inject into OnlyFans (accounts are accessed via OnlyMonster), so this app renders its own chat interface on top of the third-party OnlyFans API (onlyfansapi.com, "OFAPI").

**Current state: documentation/planning phase. No application code yet.** Start any implementation work from the plan's current phase.

## Read these before designing or building anything

| Doc | What it answers |
|---|---|
| `docs/PRD.md` | What we're building, for whom, feature requirements, UX principles, risks |
| `docs/SPEC.md` | Architecture, stack, security model, sync/send/AI design, invariants (§15) |
| `docs/PLAN.md` | Phase order, exit criteria, current next actions |
| `docs/DESIGN.md` | UI/UX brief: workspace anatomy, hotkeys, **performance-engineering checklist (review-blocking for renderer PRs)**, visual direction |
| `docs/research/legacy-chatgoose.md` | Complete behavioral inventory of the predecessor (features, prompts, exact constants/timeouts, lessons). Normative for ported behavior |
| `docs/research/onlyfansapi.md` | OFAPI capability map, real-time strategy, credits/pricing, gotchas, key docs URLs |
| `docs/research/agency-hub-core.md` | Capability map of the Agency Hub "core" backend (`~/code/core`) — the live ChatMuse contract, auth model, what P6 adds there |
| `docs/vendor/onlyfansapi/` | Vendored API docs: `openapi.json` (field-level source of truth — query with `jq`), `llms-full.txt` (grep, don't read whole), see its README |

## Hard rules

- **Verify OFAPI shapes against `docs/vendor/onlyfansapi/openapi.json` or fresh `.mdx` pages — never from memory.** Per-page docs: append `.mdx` to any `docs.onlyfansapi.com` URL.
- **Before implementing any OFAPI subsystem, read its primary docs** — grep `docs/vendor/onlyfansapi/llms-full.txt` and/or fetch the curated `.mdx` URLs listed in `docs/research/onlyfansapi.md` §8. The research summary is for planning; it is not sufficient detail for implementation.
- **Do NOT look at `~/code/chatgoose_desktop`** — abandoned incorrect implementation, explicitly excluded by the owner.
- The central backend is the **existing Agency Hub "core"** repo (`~/code/core`, in production: Fastify + Postgres + React dashboard). It already exposes the fan-profile / ai-usage / chatter-API-key endpoints this app consumes (there the product is called **"ChatMuse"**). Server-side hub work (OFAPI webhooks, SSE fanout, AI gateway) happens in that repo, not here — this repo only consumes the contract in SPEC §9. Core's OpenAPI snapshot: `~/code/core/reference/agency-hub.openapi.json`.
- **One session = one repo.** Sessions in this repo may READ `~/code/core` (contracts, OpenAPI) but must NEVER edit it. If desktop work surfaces a needed core-side change, record it as a task in `docs/PLAN.md` (parallel track / P6 sections) for a separate session in the core repo — which in turn reads this repo's SPEC §9.2, `docs/research/onlyfansapi.md` §4, and the Phase-0 webhook fixtures as its brief.
- The legacy repo `~/code/chatgoose` is a **read-only reference and the porting ground truth**. When porting any behavior, read the actual legacy source and its tests — `docs/research/legacy-chatgoose.md` is the map (start from its "Essential Files Reference" table), the code is the truth. Never copy Fansly-specific parts (DOM injection, session capture, Fansly endpoints) — the split is documented in that doc's §10. **Legacy code is a behavioral reference, not a style guide** (it was written for/by weaker models): restructure freely while porting, as long as the behavior and the ported tests survive. The byte-for-byte rule applies to **prompts only**.
- SPEC §15 invariants are review-blocking: secrets/network only in Electron main; `packages/shared` stays platform-pure; zod at every trust boundary; `escapeForPrompt` + safety preamble + output sanitizer on every LLM path; never auto-retry an indeterminate send; AI never sends without explicit human action; local DB/media cache encrypted at rest.
- **Prompts are copied byte-for-byte** from `~/code/chatgoose/prompts/*.md` and the prompt-builder strings in `~/code/chatgoose/src/shared/prompts.ts` (safety preambles, tone instructions, ping segment instructions). The ONLY permitted edit is platform wording (Fansly→OnlyFans). Any other change requires the regression harness (PLAN P4) + explicit owner approval — the prompts already work in production and the anti-AI-slop tuning is the most valuable asset.
- Keep PRD/SPEC/PLAN current: when a decision changes during implementation, update the doc in the same change.

## Conventions (once code exists)

- pnpm monorepo: `apps/desktop` (Electron + React + TS strict + Tailwind), `packages/shared` (pure TS; named to avoid collision with the "core" repo). No `apps/hub` here. Layout: SPEC §3.
- `pnpm check` = typecheck + lint + unit tests + build — must pass before any commit (legacy discipline: 783 tests on the predecessor).
- Tests: Vitest; pure functions in `packages/shared` get the densest coverage; OFAPI client tested against recorded fixtures in `tests/fixtures/`.
- UI is designed from scratch against `docs/DESIGN.md` (PRD §7 principles + DESIGN §3 perf checklist are review-blocking; the §5 mockup is the binding visual reference); use the frontend-design skill for new surfaces; light professional theme (only theme v1), keyboard-first.
- All amounts: OFAPI returns dollars; legacy Fansly used mills — don't port mills→USD conversions into OFAPI code paths.
- Two ID namespaces: OFAPI `acct_…` vs raw OnlyFans numeric ids (`chat_id === fan.id`). Never mix.
