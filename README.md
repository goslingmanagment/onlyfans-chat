# ChatGoose Desktop

Standalone desktop workspace for OnlyFans agency chatters: a from-scratch chat interface on top of [onlyfansapi.com](https://docs.onlyfansapi.com) with the proven ChatGoose AI assistant suite built in — fast replies in the creator's voice, draft improvement, coaching, deep fan summaries, performance reviews, and reactivation pings.

Successor to the ChatGoose Firefox extension for Fansly. OnlyFans accounts are accessed through OnlyMonster, which leaves no injection surface — so instead of overlaying the platform UI, this app **is** the chatter's interface: inbox, conversations, PPV sending, fan intelligence, and AI assistance in one keyboard-first tool.

## Status

**In pilot/rollout — shipping to real users via auto-update (desktop v0.1.25).** The Electron app is code-complete through Phases 0–6 and runs Hub-first by default. What remains is owner/pilot validation, not new engineering — see [docs/PLAN.md](docs/PLAN.md) for the current phase.

| | |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements: users, features, UX principles, economics, risks |
| [docs/SPEC.md](docs/SPEC.md) | Technical spec: Electron + React + TS monorepo, sync engine, send pipeline, AI layer, hub relay |
| [docs/PLAN.md](docs/PLAN.md) | Phased plan with exit criteria and per-phase status — the source of truth for what's done vs pending |
| [docs/DESIGN.md](docs/DESIGN.md) | UI/UX brief: workspace anatomy, hotkeys, performance checklist, visual direction |
| [docs/research/](docs/research/) | Deep research: legacy product inventory + OnlyFans API analysis |
| [docs/vendor/onlyfansapi/](docs/vendor/onlyfansapi/) | Vendored API docs + OpenAPI spec for offline/AI-agent development |
| [CLAUDE.md](CLAUDE.md) | Working agreement for AI-driven development in this repo |

## Architecture in one paragraph

An Electron desktop app (TypeScript end-to-end) renders the chat workspace; all secrets and network I/O live in the main process, with a local SQLite cache making every surface instant. By default it runs **Hub-first** against the agency's existing **Agency Hub backend ("core")**: OFAPI reads are proxied through core's read-gateway and writes (text/typing/unsend/mark-read/media) ride core's command outbox/executor, and core runs the OFAPI-webhook→SSE bridge plus a proxy-routed AI gateway. **Direct** mode — a local OFAPI key with LLM providers called directly — remains the Settings rollback for reads and AI (desktop AI still runs Direct by default until Hub-AI rollout is accepted). Fan summaries and AI-usage accounting also sync to core. Shared, platform-pure `packages/shared` carries the ported prompt stack and parsers from the Fansly extension — the part of the product that's already proven.
