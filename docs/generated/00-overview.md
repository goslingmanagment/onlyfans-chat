> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Codebase Map (overview & index)

This is the regenerated Pass-1 map of **ChatGoose Desktop**, one of three projects
a downstream reviewer is stitching together (the other two — the **core** hub and
**OnlyFans/OFAPI** — get their own passes). It is strictly descriptive: it makes the
territory legible and anchors claims to `path:line`, but forms no judgments.

The tree is mapped **as it is at commit `d044790`**, after the Project-Kernel
migration. The historical Pass-1 originals in `docs/project-kernel/` (files
`01-*.md … 11-*.md`) describe the pre-migration codebase and carry superseded
banners; they were used only as a territory checklist. Every claim here was
re-verified against current code.

## What this project is

ChatGoose Desktop is an **Electron desktop chat workspace** for OnlyFans agency
chatters, with built-in AI assistance (reply generation, coaching, fan summaries,
reactivation pings). It renders its own chat UI on top of OnlyFans, which it reaches
through a third-party API (**OFAPI**, `app.onlyfansapi.com`) — but always **through
the backend hub "core"** (Agency Hub), never directly in production.

### Post-migration shape (the load-bearing facts)

After the kernel migration the desktop is a thin **kernel client**:

- **All platform reads go through core's read-gateway** (`/api/v1/ofapi/read/*`) and
  **all platform writes go through core's command outbox** (`/api/v1/ofapi/commands`),
  both via the vendored **`@kernel/sdk`** (`packages/kernel-sdk`). The direct-to-OFAPI
  network path survives only as dead default constants + env-gated live tests
  (`apps/desktop/src/main/ofapi/transport.ts:35-78`, `apps/desktop/src/main/ofapi/client.ts:60`).
- **The live event feed is core's SSE stream v2** (`/api/v1/events/v2/stream`), with a
  v1 fallback retained only for the rollout window
  (`apps/desktop/src/main/sync/hub-sync.ts:26-31`).
- **AI is kernel-only** (decision D4 / core #111): this repo holds **no vendor AI SDKs,
  no API keys, and no prompts** — every generation streams from core's AI feature lane
  (`/api/v1/ai/features/:feature`). The local LLM clients, prompt files, and key
  settings were deleted in the Stage 31 sweep and are pinned out by CI gates
  (`apps/desktop/tests/security/ai-cutover-gates.test.ts`).
- **Auth is per-device bearer tokens** (`hubDeviceToken`, `agency_hub_device_…`),
  preferred over a legacy chatter key (`hubApiKey`)
  (`apps/desktop/src/main/hub/device-token.ts:70-78`).

Money units that cross boundaries: **OFAPI/platform amounts are dollars** (never
mills — the legacy Fansly unit); **AI spend is integer micro-USD**
(`packages/shared/src/activity/ai-spend.ts:2-4`).

Two ID namespaces cross the boundaries and are never mixed: the OFAPI account id
`acct_…` versus the raw OnlyFans numeric id (`chat_id === fan.id`, serialized as a
string); core adds its own `pageLabel` (`packages/shared/src/protocol/index.ts:6-8`).

## Monorepo layout

A **pnpm workspace** (`pnpm-workspace.yaml`: `apps/*` + `packages/*`; pnpm `10.33.1`,
Node `>=22`, ESM everywhere, TS strict):

| Workspace | Package | Role |
|---|---|---|
| `apps/desktop` | `@chatgoose/desktop` (v`0.1.30`) | The Electron app: `main` (Node/privileged), `preload` (context bridge), `renderer` (React 19 + TS + Tailwind v4). |
| `packages/shared` | `@chatgoose/shared` (v`0.0.1`) | Platform-pure TypeScript consumed **from source** (protocol schemas, hub client, errors, i18n, message-guard, transcript/context, activity math, features registry). |
| `packages/kernel-sdk` | `@kernel/sdk` (v`0.1.0`) | The **vendored, compiled** kernel API client — `dist` + `kernel-sdk.vendor.json`. Never hand-edited; re-vendored from core. |

There is no `apps/hub` and no `apps/dashboard` here — those live in the `core` repo.

## The three-project boundary (read `01` first)

The complete wire-level view of every boundary — described from this side — is
**[01-external-boundaries.md](01-external-boundaries.md)**, the doc to read first for
the cross-project stitch. The single privileged counterparty is **core**, reached
only through **`@kernel/sdk`** (**[02-kernel-sdk.md](02-kernel-sdk.md)**).

## Reading order / file index

Start with `00` (here) and `01` (boundaries); `02` describes the SDK that mediates the
main boundary. The rest can be read in any order; each states its scope and
cross-references its neighbors.

| # | Doc | What it maps |
|---|---|---|
| 00 | this file | Orientation, monorepo layout, versions, the 3-process model, build/release + CI, the test harness. |
| 01 | [01-external-boundaries.md](01-external-boundaries.md) | **The contract catalog** — every wire boundary from this side: the kernel via `@kernel/sdk` (read-gateway, command outbox, AI feature lane, usage/acceptance ingest, fan-profile, credits, SSE stream v2 + snapshot, device-token auth), the auto-update feed, OS integration, local encrypted storage, and inbound OFAPI webhooks (which land on core, not here). |
| 02 | [02-kernel-sdk.md](02-kernel-sdk.md) | The vendored `@kernel/sdk`: dist structure, the operation→method/path map, the contract-hash pin + its two drift gates, the stream helpers, and the exact request/frame schemas. |
| 03 | [03-shared-package.md](03-shared-package.md) | `packages/shared/src` — the platform-pure core: the `protocol` wire schemas, the hub client cluster, the `CG-*` error taxonomy, the features registry, constants, message-guard, output sanitizers, transcript/context, activity/spenders math, i18n, the diagnostics redactor. |
| 04 | [04-main-bootstrap-ipc-settings.md](04-main-bootstrap-ipc-settings.md) | The Electron main shell: bootstrap/composition root, window hardening + CSP, the full renderer↔main **IPC channel catalog** + pushed events, the `window.chatgoose` preload bridge, the settings store + transport invariants, the `safeStorage` keychain, device-token, platform integration (updater/badge/navigation/single-instance), notifications, diagnostics. |
| 05 | [05-ofapi-read-client.md](05-ofapi-read-client.md) | The OFAPI HTTP client — now **hub-transported** (base URL = core's `/ofapi/read`, writes fail closed): request composition, rate-limiter, retry policy, error mapping, sanitizer, pagination, credit metering, response schemas, send-outcome classification, fixture capture, and the ~52k-line generated types. |
| 06 | [06-sync-and-reads.md](06-sync-and-reads.md) | The read/sync subsystem — the polling loop, the hub-aware orchestrator (`createHubAwareSync`), the SSE stream-v2 loop + snapshot/cursor recovery, the mappers, the budget guard, and the auto-read (GET-marks-read) semantics. |
| 07 | [07-send-engine-outbox.md](07-send-engine-outbox.md) | The write path — the send-engine state machine, the core command outbox (the `*_v1` command kinds), the verifier, the send audit log, and the two safety invariants (no auto-retry on indeterminate; AI never sends without explicit human action). |
| 08 | [08-ai-pipeline.md](08-ai-pipeline.md) | The AI generation pipeline end-to-end — now **kernel-only**: coordinator lifecycle/queueing, the feature-gateway lane, staged timeouts, the profiler, the message-guard runtime, and the confirmation that no prompt/context leaves the desktop. |
| 09 | [09-data-model-storage.md](09-data-model-storage.md) | The encrypted SQLite database — driver/cipher, the 16-version migration history, the table catalog, the change-invalidation bus, the encrypted media cache / vault / `media://` protocol, and the one-time local-history **harvest** to the kernel capture lane. |
| 10 | [10-renderer-ui.md](10-renderer-ui.md) | The React renderer — app shell + chrome, the bridge → react-query seam (query-key ↔ IPC-channel map), the design system, every feature surface (conversation, AI dock, inbox, spenders, online, vault, fan panel, settings), the zustand stores, `lib/` utilities, and the dev mock bridge. |
| 11 | [11-hub-monetization-activity.md](11-hub-monetization-activity.md) | The main-process hub module + the money/usage side — the two ledgers (`usage_events` upload queue vs `ai_spend_log` durable counters), usage/acceptance reporting to core, page resolution (`acct_…` ↔ core `pageLabel`), the credits summary, and the spenders + online-presence services. |

## The 3-process model

The Electron app is three processes joined only by typed IPC:

- **main** (`apps/desktop/src/main`) — Node/privileged. Holds all secrets and all
  network I/O (composition root `apps/desktop/src/main/index.ts:1-3`).
- **preload** (`apps/desktop/src/preload`) — the `contextBridge`. Exposes exactly one
  global, `window.chatgoose`, gated by two runtime channel allowlists
  (`apps/desktop/src/preload/index.ts:35`).
- **renderer** (`apps/desktop/src/renderer/src`) — React 19 + TanStack Query + zustand
  + Tailwind v4. Never sees `ipcRenderer`, Node, secrets, or raw OFAPI JSON; it reads
  narrow view-models and `media://` tokens only.

The boundary invariants (secrets/network only in main; `packages/shared` platform-pure;
zod at every trust boundary) are enforced by ESLint `no-restricted-imports`
(`eslint.config.mjs`) and pinned by tests (`04`, `03`).

## Build & release

- **Bundler:** `electron-vite` with three targets (main/preload/renderer);
  `externalizeDepsPlugin` on main/preload, `react()` + `tailwindcss()` on renderer;
  aliases `@chatgoose/shared`→`packages/shared/src`, `@main`, `@renderer`
  (`apps/desktop/electron.vite.config.ts`). `apps/desktop/vite.standalone.config.ts`
  is a deletable browser-only dev server (port 5199) that strips the CSP meta so the
  full UI runs against the dev mock bridge.
- **Packager:** `electron-builder` (`apps/desktop/electron-builder.yml`), `appId
  com.chatgoose.desktop`, `productName ChatGoose`; win target `nsis` (one-click
  per-user, `ChatGoose-Setup-<version>.exe`); mac `dmg`+`zip` arm64, **unsigned**
  (`identity: null`). The whole `better-sqlite3-multiple-ciphers` module is
  `asarUnpack`ed (native dlopen).
- **Auto-update:** electron-updater **generic** feed
  `https://45-8-230-111.sslip.io/u/bffe2540bd2b7e87bd9b88e3/`; builds are unsigned so
  the feed host is the trust anchor. Auto-update is **Windows packaged only**
  (`apps/desktop/src/main/platform/updater.ts:19-21`), checked at launch + every 4h.
- **Native ABI:** `better-sqlite3-multiple-ciphers` ships no prebuilds, so the
  Electron-ABI `.node` must be compiled **on Windows** — hence `windows-build.yml`
  runs on `windows-latest`. `apps/desktop/scripts/assert-win32.mjs` blocks a mac
  cross-pack.

### CI

- `.github/workflows/ci.yml` — on PR + push to `main`; ubuntu; `pnpm install
  --frozen-lockfile` then **`pnpm check`** (= typecheck + lint + vitest node-env +
  electron-vite build). This is the Stage-35 CI floor.
- `.github/workflows/windows-build.yml` — `workflow_dispatch` (with a `publishFeed`
  input) or a `v*` tag; builds `pnpm dist:win`, uploads the installer artifact, and on
  a tag / `publishFeed` scp's the installer + blockmap then `latest.yml` **last** to
  the update feed host.

### Root scripts (`scripts/`)

- `codegen-ofapi.mjs` — `openapi-typescript` regenerates
  `apps/desktop/src/main/ofapi/ofapi.gen.ts` from `docs/vendor/onlyfansapi/openapi.json`
  (`pnpm codegen:ofapi`).
- `make-icon.mjs` — macOS-only icon rasterization (committed output).
- `make-ofapi-fixtures.mjs` + `spikes/*` — anonymize live OFAPI/webhook probes into the
  committed contract-test fixtures; Phase-0 latency / webhook smoke spikes.

## Test harness

- **Vitest**, node environment, `tests/**/*.test.ts`
  (`apps/desktop/vitest.config.ts`; `packages/shared/vitest.config.ts`). `pnpm check`
  runs them; there is no Docker/Testcontainers requirement in this repo.
- Desktop suites live under `apps/desktop/tests/` (≈114 files) grouped by subsystem:
  `ofapi` (12), `renderer` (13), `db` (10), `hub` (9), `renderer-ai` (9), `send` (6),
  `sync` (5), `platform` (5), plus `ai`, `media`, `vault`, `spenders`, `online`,
  `ipc`, `secrets`, `security`, `message-guard`, `diagnostics`, `settings`, `preload`,
  and env-gated `live`. `packages/shared/tests/` holds ≈28 pure-logic suites.
- **Security/gate tests** pin the migration invariants:
  `apps/desktop/tests/security/ai-cutover-gates.test.ts` (no vendor AI hosts/imports,
  no prompt/provider modules), `apps/desktop/tests/security/csp.test.ts` (the renderer
  CSP), and `packages/shared/tests/kernel-sdk-vendor.test.ts` (the SDK contract-hash
  pin).
- **Fixtures** are committed at repo root: `tests/fixtures/{ofapi,golden,webhooks}`
  (anonymized OFAPI exchanges, the golden AI-context set, captured OFAPI webhook
  deliveries).
