> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# Project Kernel — ChatGoose Desktop

A complete, factual map of the **ChatGoose Desktop** codebase, written so a downstream
architecture reviewer can understand the project in full without re-discovering it from
source. It is **strictly descriptive** — no ratings, no recommendations. Where a name or
comment disagrees with what the code actually does, the docs describe the actual behavior
and flag the discrepancy.

**Provenance:** generated from the source tree at commit `84038b8` (desktop `v0.1.27`,
2026-07-02). Every non-trivial claim is anchored to a repo-relative `path:line` or symbol
so you can jump straight to code. Line numbers are as of that commit.

---

## What this project is

ChatGoose Desktop is an **Electron desktop chat workspace** for OnlyFans agency chatters,
with built-in AI assistance (reply generation, coaching, fan summaries, reactivation
pings). It renders its own chat UI on top of OnlyFans, which it reaches through a
third-party API (**OFAPI**, `onlyfansapi.com`), and it can route reads/writes/AI through a
backend hub (**"core"** / Agency Hub / "ChatMuse").

It is a **pnpm monorepo** with two workspaces:
- `apps/desktop` — the Electron app: `main` (Node/privileged), `preload` (context bridge),
  `renderer` (React 19 + TypeScript + Tailwind).
- `packages/shared` (`@chatgoose/shared`) — platform-pure TypeScript consumed from source
  (prompts, LLM/SSE, message-guard, the wire protocol schemas, errors, i18n, transcript,
  activity/spend math).

### The three-project ecosystem

This is **one of three projects** the reviewer is stitching together; the other two get
their own passes. From this side:
1. **ChatGoose Desktop** (this repo).
2. **core** (Agency Hub / "ChatMuse") — a Fastify + Postgres backend, *not in this repo*.
   Desktop reads fan data via its read-gateway, writes via its command outbox, reports AI
   usage/spend to it, subscribes to its SSE event stream, and can route AI through its
   gateway.
3. **OnlyFans**, reached through **OFAPI**. Desktop can call OFAPI **directly** (reads/AI
   only) or via core. **All OnlyFans writes are core-only** (Direct writes are structurally
   disabled).

The complete wire-level view of these boundaries — every endpoint, auth, and data shape —
is **[02-external-boundaries.md](02-external-boundaries.md)**, the doc to read first for
the cross-project stitch.

---

## Reading order

Start with **01** for orientation and **02** for the boundary catalog; the rest can be read
in any order (each states its scope and cross-references its neighbors).

| # | Doc | What it maps |
|---|---|---|
| 01 | [01-overview-build-release.md](01-overview-build-release.md) | Monorepo layout, versions, the 3-process model, build tooling (electron-vite / electron-builder), CI + auto-update feed, scripts, and the Vitest test harness + fixture inventory. **Read first.** |
| 02 | [02-external-boundaries.md](02-external-boundaries.md) | **The contract catalog** — every wire boundary described from this side: OFAPI Direct, core hub (REST read-gateway / command-outbox / AI-gateway / usage / SSE + snapshot), AI providers, the auto-update feed, OS integration, local encrypted storage, and inbound OFAPI webhooks. Endpoints, auth, and zod-schema-anchored data shapes. **Read first for the cross-project stitch.** |
| 03 | [03-shared-package.md](03-shared-package.md) | `packages/shared/src` — the platform-pure core: prompts, llm (model registry / cost / SSE), message-guard, the `protocol` wire schemas, the `CG-*` error taxonomy, i18n (EN/RU), context, activity, transcript, spenders, summary, output. |
| 04 | [04-main-bootstrap-ipc-settings.md](04-main-bootstrap-ipc-settings.md) | The Electron main-process shell: bootstrap/composition root, the full renderer↔main **IPC channel catalog** + pushed events, the `window.chatgoose` preload bridge, the settings store + transport invariants, the `safeStorage` keychain, platform integration (updater/badge/navigation/single-instance), notifications, diagnostics. |
| 05 | [05-ofapi-client.md](05-ofapi-client.md) | The Direct OFAPI HTTP client subsystem — request composition, transport, rate-limiter, retry policy, error mapping, sanitizer, pagination, credit metering, response schemas, send-outcome classification, fixture capture. |
| 06 | [06-sync-and-reads.md](06-sync-and-reads.md) | The read/sync subsystem — the polling loop, the hub read-gateway provider, the hub SSE-driven sync + snapshot recovery, the mappers, the budget guard, Direct-vs-Hub read selection, and the auto-read (GET-marks-read) semantics. |
| 07 | [07-send-engine-outbox.md](07-send-engine-outbox.md) | The write path — the send engine state machine, the core command outbox (enqueue/poll/confirm), the send audit log, and the two safety invariants (no auto-retry on indeterminate; AI never sends without explicit human action). |
| 08 | [08-ai-pipeline.md](08-ai-pipeline.md) | The AI generation pipeline end-to-end — coordinator, context loader, provider/hub-gateway dispatch, streaming, the prompt-assembly + safety-preamble/escape/output-sanitizer invariants, the message-guard runtime, timeouts/profiling, and spend hook points. |
| 09 | [09-data-model-storage.md](09-data-model-storage.md) | The encrypted SQLite database — driver/cipher, schema + 16-version migration history, the **table catalog** (columns, writers/readers), the change-invalidation bus, and the encrypted media cache / vault / `media://` protocol. |
| 10 | [10-renderer-ui.md](10-renderer-ui.md) | The React renderer — app shell + chrome, the bridge → react-query seam (query-key ↔ IPC-channel map), the design system, every feature surface (conversation, AI dock, inbox, spenders, online, vault, fan panel, settings), the zustand stores, `lib/` utilities, and the dev mock bridge. |
| 11 | [11-hub-monetization-activity.md](11-hub-monetization-activity.md) | The main-process hub module + the money/usage side — the two ledgers (`usage_events` upload queue vs `ai_spend_log` durable counters), usage reporting to core, page resolution (`acct_…` ↔ core page), the credits summary, and the spenders + online-presence surfaces. |

---

## How the docs are partitioned

- **One primary owner per subsystem.** Each file/subsystem is described in depth in exactly
  one doc; other docs that touch it describe it only from their own perspective and link to
  the owner. Boundary artifacts (e.g. the hub client, the OFAPI client) are intentionally
  seen from two angles: **02** gives the wire contract, the subsystem doc gives the
  implementation.
- **Anchored to code.** Claims cite `path:line` or a symbol. `apps/desktop/src/main/ofapi/ofapi.gen.ts`
  (~52k generated lines from the vendored OpenAPI spec) is characterized, not enumerated.
- **Actual behavior over intent.** The docs call out places where behavior diverges from a
  name/comment/older doc — e.g. `PRAGMA foreign_keys=ON` with no declared FK constraints
  (09), or the not-yet-implemented OFAPI media download-endpoint fallback (02/`media/protocol`).

## Boundary quick-map

| Counterparty | Direction | Where | Primary doc |
|---|---|---|---|
| OFAPI (`onlyfansapi.com`) Direct | desktop → OFAPI (reads/AI only) | `main/ofapi/*` | 02 §1, 05 |
| Core hub — REST (pages, fan-profile, usage, credits, commands, AI) | desktop → core | `shared/hub/client.ts`, `main/hub/*` | 02 §2, 11 |
| Core hub — SSE event stream + snapshot | core → desktop | `main/sync/hub-sync.ts`, `hub-provider.ts` | 02 §2.8, 06 |
| Core command outbox (OnlyFans writes) | desktop → core → OnlyFans | `main/send/*`, `client.createOfapiCommand` | 02 §2.4, 07 |
| AI providers (Anthropic, OpenRouter) Direct | desktop → provider | `main/ai/providers/*`, `shared/llm/sse.ts` | 02 §3, 08 |
| Auto-update feed | feed → desktop | `main/platform/updater.ts`, `electron-builder.yml` | 02 §4, 01 |
| OS keychain / notifications / badge / `media://` / nav | desktop ↔ OS/renderer | `main/secrets`, `main/platform`, `main/media` | 02 §5, 04, 09 |
| Local encrypted SQLite + media cache | desktop ↔ disk | `main/db/*`, `main/media/*` | 02 §6, 09 |
| Inbound OFAPI webhooks | OFAPI → **core** (not desktop) | `tests/fixtures/webhooks/*` | 02 §7 |

_Two ID namespaces cross these boundaries and are never mixed: OFAPI account id `acct_…`
vs raw OnlyFans numeric id (`chat_id === fan.id`); core adds its own integer `pageId` /
string `pageLabel`. OFAPI amounts are dollars, never mills. (02, opening section.)_
