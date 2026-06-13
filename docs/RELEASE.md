# RELEASE — building installable ChatGoose Desktop

Packaging pipeline built 2026-06-13 (PLAN item 11). Everything below runs from
`apps/desktop` via root scripts; config lives in `apps/desktop/electron-builder.yml`.

## Commands

| Command (repo root) | What it does |
|---|---|
| `pnpm dist` | `electron-vite build` + electron-builder for the **current** platform |
| `pnpm dist:mac` | macOS DMG + zip (arm64) → `apps/desktop/release/ChatGoose-<version>-mac-arm64.{dmg,zip}` |
| `pnpm dist:win` | NSIS installer (x64) → `apps/desktop/release/ChatGoose-Setup-<version>.exe`. **Refuses to run off-Windows** (`scripts/assert-win32.mjs`) — see below |
| `pnpm make:icon` | regenerate `build/icon.png` from `build/icon.svg` (macOS qlmanage) |

Artifacts are versioned from `apps/desktop/package.json` `version`. `release/` is gitignored.

## Why dist:win only runs on Windows

`better-sqlite3-multiple-ciphers` ships **no prebuilds** — the Electron-ABI
`.node` binary is compiled at package time by electron-builder's
`@electron/rebuild` step, and a Windows binary can only be compiled on Windows.
A cross-"build" from macOS would silently pack the mac binary and the installed
app would crash opening the encrypted db; the guard makes that path fail loudly.

Two ways to produce the Windows installer:

1. **GitHub Actions (recommended — the team has no Windows dev machine):** the
   `windows-build` workflow (`.github/workflows/windows-build.yml`) runs on
   `windows-latest` (VS Build Tools preinstalled). Trigger: Actions →
   windows-build → Run workflow, or push a `v*` tag. Download
   `chatgoose-windows-installer` from the run's artifacts.
2. **A real Windows machine:** Node ≥22, pnpm 10, Visual Studio 2022 Build
   Tools with the "Desktop development with C++" workload (includes Python).
   Then `pnpm install` (compiles the node-ABI binary — needs the toolchain
   already at install time) and `pnpm dist:win`.

## Native module / ABI matrix

| Context | ABI | How it gets built |
|---|---|---|
| `pnpm dev` / packaged app | Electron | `pnpm dist*` rebuilds automatically (electron-builder); for dev after a fresh install or an Electron bump run `pnpm --filter @chatgoose/desktop rebuild:native` |
| `pnpm test` (vitest, node) | Node | the `bsqlite3-mc-node` devDependency alias — a second copy of the same package that stays node-ABI, so dist/dev rebuilds never break tests |

## Icons

`build/icon.svg` is the source (flat goose mark in the app palette); committed
`build/icon.png` (1024²) is what electron-builder consumes, deriving `.icns`
(mac) and `.ico` (Windows) at package time. Regenerate the PNG with
`pnpm make:icon` (macOS-only — uses qlmanage; CI never needs it).

## Code signing — not configured (owner/admin task)

Pilot builds ship **unsigned**:

- **Windows:** SmartScreen interjects on install; the helper checklist
  (`docs/WINDOWS-VERIFICATION.md`) walks through it («Подробнее» → «Выполнить в
  любом случае»). Buying an OV/EV code-signing cert later → configure
  `win.certificateFile`/`CSC_LINK` and the warning goes away (EV: immediately;
  OV: after reputation accrues).
- **macOS:** `mac.identity: null` skips signing; first open is right-click →
  Open. A Developer ID + notarization removes that.

## userData

The packaged app stores its data under `appData/ChatGoose` (set explicitly in
`main/index.ts`). Without that override Electron derives the dir from
package.json's `name` (`@chatgoose/desktop`) — nesting userData under
`appData/@chatgoose/` and **colliding with the dev profile**, which the item-11
packaged smoke run caught as a failed `dbKey` decrypt (different binary ⇒
Keychain/DPAPI refuses). Dev keeps the historical dir; packaged installs start
clean.

## Smoke checklist for a new build (any platform)

1. Install/launch from the artifact (not `pnpm dev`).
2. App opens; `userData/chatgoose.db` + `-wal` appear ⇒ the encrypted db opened
   through the asar-unpacked native module.
3. Launch the app a second time while it runs ⇒ no second window; the existing
   one is focused (single-instance lock).
4. Windows additionally: full helper checklist in `docs/WINDOWS-VERIFICATION.md`.
