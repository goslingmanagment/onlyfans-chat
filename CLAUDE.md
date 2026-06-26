# CLAUDE.md — ChatGoose Desktop

Desktop chat client for OnlyFans agency chatters with built-in AI assistance (reply generation, coaching, fan summaries, reactivation pings). Successor to the ChatGoose Firefox extension for Fansly. We cannot inject into OnlyFans, so this app renders its own chat interface on top of the third-party OnlyFans API (onlyfansapi.com, "OFAPI") — OnlyFans accounts are connected through OFAPI, and the desktop reaches OFAPI through the Agency Hub "core" (reads proxied via the hub read-gateway, writes via the command outbox).

**Current state (2026-06-26): in pilot/rollout, not greenfield. The Electron app (`apps/desktop`) is code-complete through Phases 0–6 (`pnpm check` green) and ships to real users via auto-update. It runs Hub-first by default — reads via the core read-gateway, writes (text/typing/unsend/mark-read/media) are **Hub-only** via the command outbox. Direct (local OFAPI key) is the Settings rollback **for reads and AI only**; the Direct *write* path was removed as a hard invariant (`ofapiWriteTransport` is `z.literal('hub')`, commit 872c750). Core's read, command, and AI gateways are deployed and production-enabled; Desktop AI still runs Direct by default until Hub-AI rollout is accepted (core M7 open). What remains is owner/pilot evidence to close the PRD §12 gates, not new engineering.** Start any implementation work from the plan's current phase — the per-phase status notes in `docs/PLAN.md` are the source of truth, not this line.

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
- **Core edits: same session is OK when needed** (owner decision 2026-06-21 — a separate session per core change was too inconvenient). `~/code/core` is the central backend (production: Fastify + Postgres + React dashboard); default to consuming its contract (SPEC §9) read-only, but when desktop work genuinely needs a core-side change you MAY patch core in this same session. When you do: (1) keep both sides of the contract in sync — SPEC §9.2 here ↔ core's OpenAPI (`~/code/core/reference/agency-hub.openapi.json`); (2) run core's own checks before committing there, since it's live; (3) commit core separately from desktop (one commit still touches one repo). For larger core-side tracks (P6 etc.), still record them in `docs/PLAN.md`. Core reads this repo's SPEC §9.2, `docs/research/onlyfansapi.md` §4, and the Phase-0 webhook fixtures as its brief.
- The legacy repo `~/code/chatgoose` is a **read-only behavioral reference — do NOT copy its code** (owner decision 2026-06-10: it was written for/by weaker models; write everything fresh). What carries over literally is exactly three things: **prompts byte-for-byte**; **product constants/data** (timeouts, temperatures, message counts, ping thresholds, model registry, `CG-*` error taxonomy — tuned config, catalogued in `docs/research/legacy-chatgoose.md`); and **test cases as behavior facts** (re-express legacy test cases in fresh test code, but never drop cases — they encode production-found edge cases: Gemini leak patterns, escape ordering, cache-staleness matrix). When unsure what the exact behavior is, read the legacy source to learn it — then implement your own. Never reproduce Fansly-specific parts (DOM injection, session capture, Fansly endpoints) — the split is in that doc's §10.
- SPEC §15 invariants are review-blocking: secrets/network only in Electron main; `packages/shared` stays platform-pure; zod at every trust boundary; `escapeForPrompt` + safety preamble + output sanitizer on every LLM path; never auto-retry an indeterminate send; AI never sends without explicit human action; local DB/media cache encrypted at rest.
- **Prompts are copied byte-for-byte** from `~/code/chatgoose/prompts/*.md` and the prompt-builder strings in `~/code/chatgoose/src/shared/prompts.ts` (safety preambles, tone instructions, ping segment instructions). The ONLY permitted edit is platform wording (Fansly→OnlyFans). Any other change requires the regression harness (PLAN P4) + explicit owner approval — the prompts already work in production and the anti-AI-slop tuning is the most valuable asset.
- Keep PRD/SPEC/PLAN current: when a decision changes during implementation, update the doc in the same change.

## Conventions

- pnpm monorepo: `apps/desktop` (Electron + React + TS strict + Tailwind), `packages/shared` (pure TS; named to avoid collision with the "core" repo). No `apps/hub` here. Layout: SPEC §3.
- `pnpm check` = typecheck + lint + unit tests + build — must pass before any commit (legacy discipline: 783 tests on the predecessor).
- Tests: Vitest; pure functions in `packages/shared` get the densest coverage; OFAPI client tested against recorded fixtures in `tests/fixtures/`.
- UI is designed from scratch against `docs/DESIGN.md` (PRD §7 principles + DESIGN §3 perf checklist are review-blocking; the §5 mockup is the binding visual reference); use the frontend-design skill for new surfaces; warm professional theme — light by default plus an optional dark theme (owner 2026-06-13), implemented as a pure CSS-variable swap (`.dark` on `<html>`, never per-component dark styling); keyboard-first.
- All amounts: OFAPI returns dollars; legacy Fansly used mills — don't port mills→USD conversions into OFAPI code paths.
- Two ID namespaces: OFAPI `acct_…` vs raw OnlyFans numeric ids (`chat_id === fan.id`). Never mix.
