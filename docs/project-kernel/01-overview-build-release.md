# 01 — Overview, Build & Release

## Scope

This is the orientation doc for the `chatgoose_desktop_fable` repository. It maps the **monorepo shape**, the **3-process Electron model** (map + entry points only), the **build tooling** (electron-vite, the standalone renderer, the four tsconfigs, ESLint), **packaging** (`electron-builder.yml`), the **release / auto-update mechanics** (`.github/workflows/windows-build.yml` → static feed → `electron-updater`), the **scripts** (`scripts/**`, `apps/desktop/scripts/**`), the **test harness** (Vitest configuration, directory map, counts, fixtures), and **config/environment** (`.env`, `.gitignore`, versions). It does **not** describe subsystem internals: the Electron main bootstrap and IPC are owned by `04-main-bootstrap-ipc-settings.md`; the renderer by `10-renderer-ui.md`; `packages/shared` by `03-shared-package.md`; the updater *code* (as opposed to the release *pipeline*) by `04`; every external wire boundary (OFAPI, core hub, AI, the auto-update feed, OS integration, local storage) by `02-external-boundaries.md`. Cross-references point at the owning doc rather than duplicating.

---

## 1. Monorepo shape

A pnpm workspace with exactly two workspace packages. `pnpm-workspace.yaml:1-3` globs `apps/*` and `packages/*`; today that resolves to:

| Package | Path | `name` | `version` | Role |
|---|---|---|---|---|
| Desktop app | `apps/desktop` | `@chatgoose/desktop` | **0.1.27** | Electron main + preload + React renderer; the shipped artifact |
| Shared core | `packages/shared` | `@chatgoose/shared` | 0.0.1 | Platform-pure TS (prompts, transcript, context, llm, output, protocol, errors, i18n, message-guard, spenders, hub client) — see `03-shared-package.md` |

The **repo root** (`package.json:2`) is `chatgoose-desktop` version **0.0.1**, `private: true`, `type: module`. There is no `apps/hub` — the Agency Hub "core" backend lives in a separate repo (`~/code/core`) and is documented here only as an external boundary (`02-external-boundaries.md`, `11-hub-monetization-activity.md`).

**Version state to be aware of:** the root manifest and `packages/shared` both read `0.0.1`; only `apps/desktop/package.json:4` carries the real shipped version (`0.1.27`, the auto-update identity). The doc-set task brief mentioned `0.1.27` as the shipped version — confirmed here; README.md:9 still says `v0.1.25` (stale prose, not code).

**Node / package manager pinning:** root `engines.node` is `>=22` (`package.json:7-9`); no `packageManager` field is pinned in any manifest. CI (`.github/workflows/windows-build.yml:31-38`) uses `pnpm/action-setup@v4` with `version: 10` and `actions/setup-node@v4` with `node-version: 22`. `pnpm-workspace.yaml:5-8` declares `onlyBuiltDependencies: [electron, esbuild, better-sqlite3-multiple-ciphers]` — only these three are permitted to run install-time build scripts.

### Repo tree (top two levels, source-relevant)

```
chatgoose_desktop_fable/
├─ package.json                # root scripts: typecheck/lint/test/build/check/dist/codegen
├─ pnpm-workspace.yaml         # apps/* packages/* + onlyBuiltDependencies
├─ pnpm-lock.yaml              # 5606 lines, ~615 resolved packages (characterized, not read)
├─ tsconfig.base.json          # strict TS base, extended by every package tsconfig
├─ eslint.config.mjs           # flat config; trust-boundary import restrictions
├─ .env / .env.example         # ONLYFANSAPI_API_KEY, P3_SEND_TEST_FAN_ID (.env gitignored)
├─ .gitignore
├─ README.md / AGENTS.md / CLAUDE.md / TODO.md
├─ .github/workflows/windows-build.yml
├─ .claude/settings.local.json
├─ scripts/                    # codegen-ofapi, make-icon, make-ofapi-fixtures, spikes/*
├─ tests/fixtures/             # ofapi/ webhooks/ golden/ — shared regression fixtures
├─ tmp/                        # gitignored scratch (live probes, PII) — not in the build
├─ docs/                       # PRD/SPEC/PLAN/DESIGN/research/vendor/project-kernel/…
├─ apps/desktop/
│  ├─ package.json  electron.vite.config.ts  vite.standalone.config.ts  vitest.config.ts
│  ├─ electron-builder.yml
│  ├─ tsconfig.node.json  tsconfig.web.json  tsconfig.test-web.json
│  ├─ build/            # icon.svg, icon.png (electron-builder buildResources)
│  ├─ scripts/          # assert-win32.mjs
│  ├─ src/
│  │  ├─ main/          # Electron main process (see §2, doc 04–09,11)
│  │  ├─ preload/       # contextBridge contract (see §2, doc 04)
│  │  └─ renderer/      # React app (see §2, doc 10)
│  ├─ tests/            # 99 *.test.ts across 23 subsystem dirs (§6)
│  ├─ out/              # electron-vite build output (gitignored)
│  └─ release/          # electron-builder output (gitignored)
└─ packages/shared/
   ├─ package.json  tsconfig.json  vitest.config.ts
   ├─ src/            # 20 subsystems (see doc 03)
   └─ tests/          # 34 *.test.ts (§6)
```

---

## 2. The 3-process Electron model (map + entry points)

electron-vite splits the app into three build targets, each with its own Rollup input (`apps/desktop/electron.vite.config.ts:12-38`). Internals are deferred to the subsystem docs; here is the wiring map.

| Process | Entry point | Built to | Owner doc |
|---|---|---|---|
| **main** | `src/main/index.ts` (1281 lines) | `out/main/index.js` (also `package.json:8` `"main"`) | `04` (bootstrap/IPC), `05`–`09`, `11` |
| **preload** | `src/preload/index.ts` (35 lines) | `out/preload/index.mjs` | `04` (window.chatgoose contract) |
| **renderer** | `src/renderer/index.html` → `src/renderer/src/main.tsx` | `out/renderer/` | `10` |

- **main/index.ts** is the composition root (its header comment, `src/main/index.ts:1-3`, states "keychain → encrypted db → settings → media:// protocol → OFAPI client → PollingSync → AI coordinator → IPC"). It imports every main-process subsystem: `secrets/keychain`, `db`, `settings/store`, `media/protocol` + `media/cache` + `media/vault`, `ofapi/*`, `send/engine`, `message-guard/runtime`, `spenders/*`, `online/service`, `sync/*`, `ipc/handlers`, `ai/*`, `hub`, `platform/*` (updater/badge/single-instance), `diagnostics/*`, `notifications`. Full catalog in doc `04`. Main-process subdirs present under `src/main/`: `ai db diagnostics hub ipc media message-guard ofapi online platform secrets send settings spenders sync` plus `index.ts` and `notifications.ts`.
- **preload/index.ts** exposes a single `window.chatgoose` bridge via `contextBridge.exposeInMainWorld` (`src/preload/index.ts:35`). It whitelists invoke channels from `INVOKE_CHANNEL_NAMES` and three event channels — `sync:event`, `ai:event`, `db:changed` (`src/preload/index.ts:7-11`) — rejecting any unknown channel. The typed contract itself lives in `src/preload/contract.ts` (1087 lines; owned by doc `04`).
- **renderer** boots from `index.html` (which carries the production CSP `<meta>`, `src/renderer/index.html:5-8`) → `src/renderer/src/main.tsx`, which bootstraps theme before first paint, installs a global error capture, and renders `<App/>` under `React.StrictMode` (`src/renderer/src/main.tsx:15-25`). Renderer feature dirs: `ai conversation fan-panel inbox online settings spenders vault` under `src/renderer/src/features/`, plus `app bridge design dev lib state styles` (doc `10`). A dev-only mock bridge lives at `src/renderer/src/dev/mockBridge.ts` (doc `10`), used when `window.chatgoose` is undefined (browser verification).

**Aliases** (shared by `electron.vite.config.ts:6-10` and `vitest.config.ts`): `@chatgoose/shared` → `packages/shared/src`, `@main` → `apps/desktop/src/main`, `@renderer` → `apps/desktop/src/renderer/src`. `packages/shared` is consumed **from source** (no build step; see §3).

---

## 3. TypeScript layout

`tsconfig.base.json` is the strict base every package extends. Notable flags (`tsconfig.base.json:2-18`): `target/lib ES2023`, `module ESNext`, `moduleResolution bundler`, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `noEmit` (type-checking only — emit is Vite/Rollup's job).

Four project tsconfigs split what gets type-checked with which lib and against which globals:

| tsconfig | Extends | `lib` / `types` | Includes | Purpose |
|---|---|---|---|---|
| `apps/desktop/tsconfig.node.json` | base | `types:["node"]` | `electron.vite.config.ts`, `src/main`, `src/preload`, `tests`, `vitest.config.ts`, shared src — **excludes** `tests/renderer-ai/*.test.ts` | Main/preload + most tests (Node ambient) |
| `apps/desktop/tsconfig.web.json` | base | `lib:+DOM`, `jsx:react-jsx`, `types:[]` | `src/renderer/src`, `src/preload`, shared src | Renderer (DOM, no Node globals) |
| `apps/desktop/tsconfig.test-web.json` | tsconfig.web.json | (inherits DOM) | same as web **plus** `tests/renderer-ai/*.test.ts` | The renderer-AI tests transitively touch DOM types, so they are checked under the web lib rather than the node project |
| `packages/shared/tsconfig.json` | base | `types:[]` | `src`, `tests`, `vitest.config.ts` | Platform-pure package (no Node, no DOM ambient types) |

The desktop `typecheck` script runs `tsc --noEmit` against all three desktop tsconfigs in sequence (`apps/desktop/package.json:12`); shared runs a single `tsc --noEmit` (`packages/shared/package.json:12`). Path mappings for `@chatgoose/shared`, `@main/*`, `@renderer/*` are declared per-tsconfig (`tsconfig.node.json:5-9`, `tsconfig.web.json:7-11`).

The renderer-ai split is the one non-obvious point: `tsconfig.node.json:19-21` explicitly **excludes** `tests/renderer-ai/*.test.ts`, and `tsconfig.test-web.json:6` re-adds them — this is deliberate, not an accident (the `ai-store.test.ts` header, `tests/renderer-ai/ai-store.test.ts:8`, explains it: "aiStore transitively references DOM types").

---

## 4. ESLint

`eslint.config.mjs` is a flat config (`typescript-eslint` + `@eslint/js` recommended + `eslint-plugin-react-hooks`). Ignores `node_modules/dist/out/coverage`, `tmp/**`, `docs/**`, and `**/*.gen.ts` (`eslint.config.mjs:6-16`). Key rules:

- `@typescript-eslint/no-explicit-any: 'error'` and `consistent-type-imports: 'error'` globally (`:35-40`); unused vars allowed only with `^_` prefix.
- **Renderer import firewall** (`:48-64`, files `apps/desktop/src/renderer/**`): `no-restricted-imports` bans `@chatgoose/shared/llm/clients/*` and `@chatgoose/shared/hub/*` (network-capable, main-only) and any `electron` / `node:*` import (sandboxed renderer). React-hooks recommended rules also enabled here.
- **Shared purity** (`:66-78`, files `packages/shared/**`): bans `electron` / `electron/*` imports so the package stays platform-pure.
- Scripts/config files (`**/scripts/**/*.mjs`, `**/*.config.*`) get Node globals injected (`:19-32`) since they're not type-checked with `types:["node"]`.

These lint rules are the machine-enforcement of the SPEC §15 trust-boundary invariants that the comments cite.

---

## 5. Build tooling

### 5.1 electron-vite (the production build)

`apps/desktop/electron.vite.config.ts` defines the three targets. **main** and **preload** use `externalizeDepsPlugin()` (`:14,23`) so `dependencies` from `package.json` are left as runtime `require`s rather than bundled (this is why `zod`, `electron-updater`, `better-sqlite3-multiple-ciphers` must ship as real `node_modules`, not inlined). **renderer** uses `@vitejs/plugin-react` + `@tailwindcss/vite` (`:31`). `pnpm build` (root) → `pnpm -r build` → shared's build is a no-op `echo` (`packages/shared/package.json:14`, "shared is consumed from source") and desktop's is `electron-vite build` (`apps/desktop/package.json:14`), emitting `out/main/index.js`, `out/preload/index.mjs`, `out/renderer/`.

Dev loop: `pnpm --filter @chatgoose/desktop dev` → `electron-vite dev`. `start` → `electron-vite preview`.

### 5.2 Standalone renderer (`:5199`, browser verification)

`apps/desktop/vite.standalone.config.ts` is a **separate, throwaway** Vite server (its own header: "TEMP … Safe to delete — not part of the build", `:1-5`) that serves `src/renderer` with no Electron on `http://localhost:5199` (`strictPort`, `:30`). It reuses the same three aliases and adds a `strip-csp-for-dev` plugin (`:14-21`) that removes the production CSP `<meta>` so Vite's inline React-refresh preamble isn't blocked. When `window.chatgoose` is absent the renderer falls back to the dev mock bridge (doc `10`), which is what lets a plain browser + Playwright exercise the full UI.

### 5.3 Native SQLite driver injection (build-relevant)

The encrypted DB driver (`better-sqlite3-multiple-ciphers`) is **never imported statically**. `src/main/db/driver.ts:5-27` uses `createRequire(import.meta.url)` to `require` a driver module **by name given by the caller**, narrowing the result to a constructor at runtime (`loadSqliteDriver`, `driver.ts:39+`). The app injects the Electron-ABI build at runtime; tests inject a **Node-ABI alias** `bsqlite3-mc-node` (an npm alias `npm:better-sqlite3-multiple-ciphers@12.9.0` in `apps/desktop/package.json:32`) via `TEST_DRIVER = 'bsqlite3-mc-node'` in the test helpers (`tests/db/helpers.ts:2,10`, `tests/ai/helpers.ts:24`, `tests/send/helpers.ts:15`, `tests/hub/helpers.ts:26`, `tests/sync/*`). So there are two versions of the same native module on purpose: `dependencies` `^12.10.0` (Electron ABI, shipped) and the `bsqlite3-mc-node` dev alias `12.9.0` (Node ABI, tests only). Detailed schema/queries live in doc `09`.

---

## 6. Test harness

Vitest, two workspace projects, both `environment: 'node'` — there is **no jsdom/happy-dom test environment and no `@testing-library`**; every test is pure logic or a mocked-bridge test (renderer tests import `lib/filters`, `lib/fuzzy`, Zustand stores, etc., not React render trees). `jsdom` appears twice in the lockfile but only transitively; it is not wired into any vitest config.

| Project | Config | `include` | Env |
|---|---|---|---|
| desktop | `apps/desktop/vitest.config.ts` | `tests/**/*.test.ts` | node, `passWithNoTests` |
| shared | `packages/shared/vitest.config.ts` | `tests/**/*.test.ts` | node, `passWithNoTests` |

The desktop vitest config re-declares the `@chatgoose/shared` and `@main` aliases (`apps/desktop/vitest.config.ts:6-9`) — note it does **not** declare `@renderer`, so tests reach renderer code via relative paths (e.g. `tests/renderer/filters.test.ts:10` imports `../../src/renderer/src/lib/filters`). Shared's vitest config declares **no** aliases; every shared test imports via relative `../src/...` paths (verified across all 34 files).

**Counts:** 133 `*.test.ts` files total — **99 in `apps/desktop/tests`**, **34 in `packages/shared/tests`**. Shared tests are *not* co-located with source (they all live under `packages/shared/tests/`, flat; `packages/shared/src` contains zero `.test.ts`). (The doc-set brief's phrasing "packages/shared **/*.test.ts co-located" does not match the tree — they are in a sibling `tests/` dir.)

### 6.1 Desktop test directory map (file counts)

Grouped by subsystem under `apps/desktop/tests/`:

| Dir | # | Dir | # | Dir | # |
|---|---|---|---|---|---|
| `ofapi` | 12 | `renderer` | 13 | `db` | 10 |
| `renderer-ai` | 9 | `hub` | 8 | `send` | 6 |
| `platform` | 5 | `ai` | 4 | `ai-providers` | 4 |
| `sync` | 4 | `spenders` | 3 | `diagnostics` | 3 |
| `media` | 3 | `live` | 3 | `online` | 2 |
| `ipc` | 2 | `vault` | 2 | `settings` | 1 |
| `secrets` | 1 | `security` | 1 | `message-guard` | 1 |
| `preload` | 1 | `golden-gen` | 1 | | |

Sub-suites relevant here: `tests/security/csp.test.ts` (validates the renderer CSP), `tests/preload/bridge.test.ts` (channel whitelisting), `tests/platform/*` (updater/badge/single-instance/nav), `tests/ai-providers/*` (`anthropic`, `openrouter`, `route`, `key-probe` — doc `08`). `tests/live/` (`hub-read-live`, `send-live`, `spenders-live`) are network-gated live tests (env-guarded; `send-live.test.ts:30` also injects `bsqlite3-mc-node`).

### 6.2 Golden reference generation

`apps/desktop/tests/golden-gen/generate.test.ts` (the only file in that dir, 24.9 KB) is a two-mode file:
- A **generation** `describe` that runs **only** when `GOLDEN_GEN=1` and an `ANTHROPIC_API_KEY` is present (`:69`), makes real Claude calls through the app's own prompt pipeline, and writes `tests/fixtures/golden/<case>/reference-<feature>.md` for human review. It **skips any case whose reference already exists** unless `UPDATE_GOLDEN=1` (`:70`, `:439-442`) so reviewed artifacts are never silently clobbered. The reproducible "now" for pings is derived from the fixture's own last-message timestamp, not the wall clock (`:18`).
- A **structural-check** `describe` (`:483+`) that **always runs in CI** (no env flag): it validates the committed reference files' wiring (deep-analysis prompts, earnings blocks, model defaults, ping segment-a) and cleanly skips cases with no committed reference. Several assertions are executable "N/A" facts (e.g. `:537`, `:544`).

A parallel structural check lives in shared: `packages/shared/tests/golden-context.test.ts` verifies that the `context-blocks.txt` artifacts generated from the golden fixtures are byte-stable (regenerate with `UPDATE_GOLDEN=1`).

### 6.3 Fixture inventory (`tests/fixtures/`)

Shared regression fixtures consumed by both packages. Provenance is documented in per-dir READMEs (`tests/fixtures/ofapi/README.md`, `tests/fixtures/webhooks/README.md`) — all live-captured 2026-06-10/11 then anonymized.

- **`tests/fixtures/ofapi/`** (REST contract fixtures, anonymized via `scripts/make-ofapi-fixtures.mjs`): `list-chats.json`, `list-messages.json`, `user-details.json`, `user-list-users.json`, `user-lists.json`, `chat-media-gallery.json`, `send-message-success.json`, `send-message-restricted-400.json`, `delete-message-success.json`, `upload-status-completed.json`, `upload-status-processing.json`, `vault-lists.json`, `vault-list-media.json`, `vault-upload-sync-200.json`, `vault-upload-async-202.json`, plus `README.md`. Each carries a `_fixture` provenance marker (not part of the wire shape).
- **`tests/fixtures/webhooks/`** (OFAPI webhook payloads, anonymized via `scripts/spikes/anonymize-webhooks.mjs`): `messages_received/sent/deleted/ppv_unlocked`, `messages_sent_own_api_send`, `transactions_new`, `subscriptions_new`, `users_typing/online/offline`, `unverified_tips_received`, `unverified_subscriptions_renewed`, plus `README.md`. The two `unverified_*` files are documented example payloads (never fired during capture; marked `verified:false`). Each has a `_meta` provenance block; envelope is `{event, account_id, payload}`.
- **`tests/fixtures/golden/`** (LLM golden set, built by `scripts/spikes/build-golden-fixtures.mjs`): three cases — `rich-spender/`, `tipper/`, `short-convo/`. Each has `input.json` (anonymized OFAPI messages + fan object + optional user-details), `context-blocks.txt` (byte-stable formatter output), and per-feature `reference-*.md` (`fast-reply`, `improve-draft`, `help-me`, `fan-summary`, `chat-review`, `ping` — present per case, e.g. `rich-spender` has all six).

---

## 7. Root scripts & the `check` gate

Root `package.json:10-21`:

| Script | Command | Notes |
|---|---|---|
| `typecheck` | `pnpm -r --no-bail typecheck` | Runs each package's `typecheck` (desktop = 3 tsc passes, shared = 1) |
| `lint` | `eslint .` | Flat config, whole repo |
| `test` | `pnpm -r --no-bail test` | Each package's `vitest run` |
| `build` | `pnpm -r build` | shared no-op echo + desktop `electron-vite build` |
| **`check`** | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | The pre-commit gate |
| `dist` / `dist:mac` / `dist:win` | `pnpm --filter @chatgoose/desktop dist*` | Package installers |
| `codegen:ofapi` | `node scripts/codegen-ofapi.mjs` | §9 |
| `make:icon` | `node scripts/make-icon.mjs` | §9 |

Desktop-level scripts (`apps/desktop/package.json:9-18`) add `dev`, `start`, `rebuild:native` (`electron-rebuild -f -w better-sqlite3-multiple-ciphers`), and `dist:win` which first runs the OS guard `node scripts/assert-win32.mjs` (§9) before `electron-vite build && electron-builder --win`.

---

## 8. Packaging (`apps/desktop/electron-builder.yml`)

- `appId: com.chatgoose.desktop`, `productName: ChatGoose` (`:8-9`).
- `directories.buildResources: build`, `directories.output: release` (`:12-14`) — hence `apps/desktop/build/` (icons) is the resource dir and `apps/desktop/release/` (gitignored) is the output the CI uploads.
- `files: [out/**]` (`:18-19`) — only the electron-vite bundles ship; `package.json` + production `node_modules` (`zod`, `better-sqlite3-multiple-ciphers`) are added by electron-builder itself (it rebuilds the native module for the target Electron ABI at package time, `npmRebuild` default).
- `asarUnpack: **/node_modules/better-sqlite3-multiple-ciphers/**` (`:25-26`) — the native `.node` cannot `dlopen` from inside `app.asar`, so the whole module is unpacked (the comment ties this to `main/db/driver.ts`'s `createRequire` load).
- **Windows** (`:28-32`): `nsis`, `arch:[x64]`. `nsis` block (`:34-40`): `oneClick: true`, `perMachine: false` (per-user install, no admin), `artifactName: ${productName}-Setup-${version}.${ext}` → `ChatGoose-Setup-0.1.27.exe`, `deleteAppDataOnUninstall: false`.
- **macOS** (`:42-51`): `dmg` + `zip`, `arch:[arm64]` **only** (Apple-silicon-only decision — the comment "mac target arm64-only" is enforced here), `category: public.app-category.business`, `identity: null` (ad-hoc/unsigned — pilot machines open via right-click → Open).
- Global `artifactName: ${productName}-${version}-${os}-${arch}.${ext}` (`:53`) for the mac artifacts.
- **`publish`** (`:60-62`): `provider: generic`, `url: https://45-8-230-111.sslip.io/u/bffe2540bd2b7e87bd9b88e3/`. This block is baked into the packaged `app-update.yml` and is what `electron-updater` polls. The random path segment (`bffe2540bd2b7e87bd9b88e3`) is obscurity-only; the comment (`:57-59`) notes builds are unsigned so **the feed host being ours is the trust anchor**.
- **Code signing is intentionally absent** on both platforms (header comment `:4-6`; `identity: null` for mac). Windows installs walk past SmartScreen.

`apps/desktop/build/` contains only `icon.svg` and `icon.png` (1024²) — **no entitlements file** (mac is ad-hoc/unsigned, so none is referenced). `.icns`/`.ico` are derived from `icon.png` by electron-builder at package time.

---

## 9. Scripts

### `scripts/` (repo root)

| Script | What it does |
|---|---|
| `codegen-ofapi.mjs` | Runs `openapi-typescript` over `docs/vendor/onlyfansapi/openapi.json` → writes `apps/desktop/src/main/ofapi/ofapi.gen.ts` (committed, `/* eslint-disable */`, so builds never depend on codegen). Invoked by `pnpm codegen:ofapi`. Doc `05` owns the generated client. |
| `make-icon.mjs` | **macOS-only** (uses `qlmanage`). Rasterizes `apps/desktop/build/icon.svg` → `icon.png` (1024²). PNG is committed so Windows/CI never run it. |
| `make-ofapi-fixtures.mjs` | Sanitizes the uncommitted live probes (`tmp/probe-*.json`, PII) into `tests/fixtures/ofapi/{list-chats,list-messages,user-details}.json` using the **app's own** `src/main/ofapi/sanitize.ts` (single source of truth), via Node type-stripping. Consistent fake ids across files. |

### `scripts/spikes/` (Phase-0 investigation tools, mostly read-only)

| Script | What it does |
|---|---|
| `anonymize-lib.mjs` | Shared structure-preserving anonymization walker (stable id/acct/name maps; `variedText` mode for transcripts). Imported by `build-golden-fixtures.mjs`. |
| `anonymize-webhooks.mjs` | Turns captured webhook deliveries (`tmp/webhooks/*.json`, PII) into `tests/fixtures/webhooks/*.json`; picks the richest sample per event type; emits the `_meta` provenance block. |
| `build-golden-fixtures.mjs` | Builds the three golden `input.json` files from `tmp/golden/*` + `tmp/probe-chats.json`; three hard-coded cases (`rich-spender` 100 msgs/$582 with a 404 user-details fail-open path, `tipper`, `short-convo`). |
| `latency.mjs` | **Read-only GET-only** OFAPI latency/credit-burn spike (~200 calls); p50/p95 for list-chats/list-messages/user-details, media-host reachability, tip-field hunt. Requires `ONLYFANSAPI_API_KEY`; writes all raw output to `tmp/` (gitignored). |
| `webhook-listener.mjs` | Local HTTP listener (token path + HMAC-SHA256 verify against raw bytes) that journals OFAPI webhook deliveries to `tmp/webhooks/`. Env: `HOOK_TOKEN`, `SIGNING_SECRET`, `PORT`. |

### `apps/desktop/scripts/`

| Script | What it does |
|---|---|
| `assert-win32.mjs` | Guard for `dist:win`: exits non-zero unless `process.platform === 'win32'`, because the native SQLite ABI can only be compiled on Windows (a cross-build from mac would pack the wrong `.node`). |

---

## 10. Release & auto-update mechanics

The full pipeline: **git `v*` tag → GitHub Actions builds an unsigned Windows installer → scp to a static feed → `electron-updater` polls the feed → users auto-update.** (The updater *code* is in `src/main/platform/updater.ts`, owned by doc `04`; the feed as a *wire boundary* is doc `02`.)

### 10.1 CI (`.github/workflows/windows-build.yml`)

- **Triggers** (`:14-23`): `workflow_dispatch` (with a `publishFeed` boolean input) or `push` of a `v*` tag.
- **Runner**: `windows-latest` — chosen because `better-sqlite3-multiple-ciphers` ships no prebuilds and the team has no Windows dev box; the runner has VS Build Tools (header `:3-7`).
- **Steps** (`:28-45`): checkout → `pnpm/action-setup@v4` v10 → `setup-node@v4` node 22 (pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm dist:win` (which runs `assert-win32` → `electron-vite build` → `electron-builder --win`).
- **Publish step** (`:46-65`, runs only on a `v*` tag or `publishFeed==true`): if the `UPDATES_SSH_KEY` secret is set, writes the key, **pins the feed server host key** for `45.8.230.111` (`:60`), then `scp`s the `.exe` + `.blockmap` to `cgupdates@45.8.230.111:/srv/chatgoose-updates/u/bffe2540bd2b7e87bd9b88e3/`, and **uploads `latest.yml` last** (`:63-64`) so a client polling mid-upload never sees a manifest pointing at a not-yet-uploaded installer. If the secret is absent the step no-ops with a notice.
- **Artifacts** (`:67-76`): the installer, its blockmap, and `latest.yml` are also uploaded as a 3-day GitHub artifact (`continue-on-error`, `if-no-files-found: error`).

**Feed identity:** host `45.8.230.111` (served publicly as `https://45-8-230-111.sslip.io/...` per `electron-builder.yml:62`), server path `/srv/chatgoose-updates/u/bffe2540bd2b7e87bd9b88e3/`, nginx site `chatgoose-updates`. The CI writes to the raw IP over SSH; `electron-updater` reads over HTTPS via the sslip.io hostname — same path segment `bffe2540bd2b7e87bd9b88e3` both ends.

### 10.2 How the client consumes it (cross-ref doc 04)

`src/main/platform/updater.ts` uses `electron-updater`'s generic provider (the `publish` block baked into `app-update.yml`). `shouldAutoUpdate` returns true **only for `win32` packaged builds** (`updater.ts:19-21`) — macOS is excluded because Squirrel.Mac refuses unsigned updates. Default behavior is background (silent download, install on quit, never a surprise restart); a Settings "check now" button drives the same `createUpdateController`. The module is dependency-free by design (interfaces only, `AppUpdaterLike` at `updater.ts:24-35`); the real `electron-updater` instance is dynamic-imported by the composition root and a fake is injected in `tests/platform/`. Signatures/versioning detail is doc `04`.

---

## 11. Runtime dependency inventory

Production `dependencies` (shipped) vs `devDependencies` (build/test-time), per `apps/desktop/package.json` and `packages/shared/package.json`. Key runtime deps and their role:

| Dependency | Where | Purpose |
|---|---|---|
| `better-sqlite3-multiple-ciphers` `^12.10.0` | desktop `dependencies` | Encrypted (SQLCipher) local SQLite — the offline cache/vault. Loaded dynamically via `db/driver.ts`; unpacked from asar. Doc `09`. |
| `electron-updater` `^6.8.9` | desktop `dependencies` | Consumes the generic HTTPS feed for auto-update (§10, doc `04`). |
| `zod` `^4.4.3` | desktop **and** shared `dependencies` | Runtime validation at every trust boundary (IPC, OFAPI responses, settings, webhooks). Doc `03`/`04`. |
| `react` / `react-dom` `^19` | desktop `devDependencies` | Renderer UI (bundled into `out/renderer` — hence dev, not runtime). Doc `10`. |
| `@tanstack/react-query` `^5` | desktop `devDependencies` | Renderer server-state cache over the IPC bridge. Doc `10`. |
| `@tanstack/react-virtual` `^3` | desktop `devDependencies` | Virtualized chat/inbox lists (DESIGN perf checklist). Doc `10`. |
| `zustand` `^5` | desktop `devDependencies` | Renderer local UI state (e.g. the AI/reply stores tested in `tests/renderer-ai`). Doc `10`. |
| `tailwindcss` `^4` + `@tailwindcss/vite` | desktop `devDependencies` | Styling; CSS-variable theme swap (`.dark` on `<html>`). Doc `10`. |
| `@fontsource*` (hanken-grotesk, source-serif-4, ibm-plex-mono) | desktop `devDependencies` | Self-hosted fonts imported in `main.tsx` (CSP forbids remote fonts). |
| `electron` `^41` / `electron-vite` `^5` / `vite` `^7` / `@vitejs/plugin-react` | desktop `devDependencies` | The runtime shell + build toolchain. |
| `electron-builder` `^26` + `@electron/rebuild` `^4` | desktop `devDependencies` | Packaging + native-module rebuild. |
| `bsqlite3-mc-node` (alias → `better-sqlite3-multiple-ciphers@12.9.0`) | desktop `devDependencies` | Node-ABI SQLite for tests (§5.3). |
| `vitest` `^4` | root + desktop + shared | Test runner. |
| `openapi-typescript` `^7` | root `devDependencies` | OFAPI type codegen (§9). |
| `typescript` `^6` / `typescript-eslint` `^8` / `eslint` `^10` / `eslint-plugin-react-hooks` `^7` / `prettier` `^3` | root/desktop/shared | Type-check + lint + format. |

`packages/shared` declares only `zod` as a runtime dependency (`packages/shared/package.json:20-22`) — consistent with its platform-purity mandate. `pnpm-lock.yaml` (~5606 lines, ~615 resolved packages) is characterized here, not read line-by-line.

---

## 12. Config & environment

- **`.env` / `.env.example`**: two variables (`.env.example:1-9`) — `ONLYFANSAPI_API_KEY` (Bearer key starting `ofapi_`, dev/test only) and `P3_SEND_TEST_FAN_ID` (an owner-controlled test-fan id gating live send checks; empty forbids any live test send). `.env` exists at repo root (gitignored) and holds the real dev key; `.env.example` is the committed template.
- **`.gitignore`** (`:1-33`): ignores `node_modules`, all build output (`dist/out/release/*.tsbuildinfo`), `.env*` (except `.env.example`), `tmp/`, `coverage/`, `.playwright-mcp/`, and `docs/mockups/experiments/`. The `tmp/` dir at repo root is the gitignored scratch space every Phase-0 spike writes PII to.
- **`README.md`**: product overview + a doc-index table; its status line reads `v0.1.25` (stale relative to the shipped `0.1.27`).
- **`AGENTS.md`**: a two-line pointer to `CLAUDE.md` (the single working agreement) to prevent instruction-file drift.
- **`.claude/`**: contains only `settings.local.json` (local Claude Code settings; no project skills/hooks committed here).
- **`CLAUDE.md` / `TODO.md`**: working agreement and idea inbox (orientation only; not build inputs).

---

## 13. Name-vs-behavior notes (discrepancies to flag for the reviewer)

1. **Version skew.** Only `apps/desktop/package.json` (0.1.27) is authoritative; root and `packages/shared` are frozen at 0.0.1, and `README.md:9` still advertises `v0.1.25`. Three different numbers describe "the version."
2. **Shared tests are not co-located.** All 34 shared tests are in `packages/shared/tests/` (flat, relative imports), not next to source, despite the common "co-located" phrasing.
3. **No DOM test environment.** All 133 tests run under `environment:'node'`; the renderer/renderer-ai suites are pure-logic + mocked-bridge tests, not React render tests. `jsdom` in the lockfile is transitive and unused.
4. **`vite.standalone.config.ts` is not part of the build.** It is a developer-only browser-verification server (its own header says "Safe to delete"); nothing in `pnpm build`/`dist` references it.
5. **`golden-gen/generate.test.ts` is dual-mode.** Its name suggests a test, but the generation half only runs behind `GOLDEN_GEN=1` + an API key and costs real tokens; only the structural-check half runs in CI.
6. **Two copies of the SQLite native module by design** (runtime Electron-ABI `^12.10.0` + test Node-ABI alias `12.9.0`) — not a dependency mistake; the version numbers differ.
7. **macOS is a build target but not an update target.** `electron-builder.yml` produces mac `dmg`/`zip` (arm64, unsigned), yet `updater.ts` restricts auto-update to `win32` packaged builds — mac users must reinstall manually.
