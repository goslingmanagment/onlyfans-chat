# ChatGoose Desktop

Standalone desktop workspace for OnlyFans agency chatters: a from-scratch chat interface on top of [onlyfansapi.com](https://docs.onlyfansapi.com) with the proven ChatGoose AI assistant suite built in — fast replies in the creator's voice, draft improvement, coaching, deep fan summaries, performance reviews, and reactivation pings.

Successor to the ChatGoose Firefox extension for Fansly. OnlyFans accounts are accessed through OnlyMonster, which leaves no injection surface — so instead of overlaying the platform UI, this app **is** the chatter's interface: inbox, conversations, PPV sending, fan intelligence, and AI assistance in one keyboard-first tool.

## Status

**Documentation/planning phase — no application code yet.**

| | |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements: users, features, UX principles, economics, risks |
| [docs/SPEC.md](docs/SPEC.md) | Technical spec: Electron + React + TS monorepo, sync engine, send pipeline, AI layer, hub relay |
| [docs/PLAN.md](docs/PLAN.md) | Phased plan with exit criteria; Phase 0 validation spikes are the immediate next step |
| [docs/research/](docs/research/) | Deep research: legacy product inventory + OnlyFans API analysis |
| [docs/vendor/onlyfansapi/](docs/vendor/onlyfansapi/) | Vendored API docs + OpenAPI spec for offline/AI-agent development |
| [CLAUDE.md](CLAUDE.md) | Working agreement for AI-driven development in this repo |

## Architecture in one paragraph

An Electron desktop app (TypeScript end-to-end) renders the chat workspace and talks to OFAPI (REST, polling at first) and LLM providers directly; all secrets and network I/O live in the main process, with a local SQLite cache making every surface instant. Central pieces ride on the agency's existing **Agency Hub backend ("core")**: fan summaries and AI-usage accounting sync there from the deep-AI phase (its API for this already exists), and in the real-time phase core gains an OFAPI-webhook→SSE bridge plus a hub-owned AI gateway with per-chatter limits. Shared, platform-pure `packages/shared` carries the ported prompt stack and parsers from the Fansly extension — the part of the product that's already proven.
