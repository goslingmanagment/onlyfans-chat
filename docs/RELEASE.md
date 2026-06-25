# RELEASE — building installable ChatGoose Desktop

Packaging pipeline built 2026-06-13 (PLAN item 11). Everything below runs from
`apps/desktop` via root scripts; config lives in `apps/desktop/electron-builder.yml`.

> Owner-facing walkthrough of the whole Windows flow (build → hand off → verify
> → revoke), in Russian, sendable to the helper: **`docs/WINDOWS-GUIDE.html`**.

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

## Auto-update (Windows only; built 2026-06-13)

Installed Windows apps update themselves: `electron-updater` checks the feed at
launch and every 4 h, downloads in the background, installs **on quit** (never
prompts mid-shift; a quiet "installs when you quit" toast is the only signal).
Policy lives in `src/main/platform/updater.ts`; macOS has no auto-update —
unsigned builds can't (Squirrel.Mac requirement), and the mac side runs dev.

**Manual control — Settings → Updates (added 2026-06-13):** a "Check for
updates" button drives the same controller on demand (`createUpdateController`
+ the `query:updates.status` / `cmd:updates.check` / `cmd:updates.install`
IPC). It shows live download progress and, once a build is downloaded, a
**Restart & install** button (`quitAndInstall`). Off win32-packaged builds the
section renders an "auto-update runs in the installed Windows app" note (phase
`unsupported`); in plain-vite dev the mock bridge simulates the whole
check → download → install flow so the UX is demoable without a real feed.

**Release ritual:**

1. Bump `version` in `apps/desktop/package.json`, commit.
2. `git tag v<version> && git push origin main --tags`.
3. The `windows-build` workflow builds the installer on Windows and uploads
   `ChatGoose-Setup-<version>.exe` + `.blockmap` + `latest.yml` directly to the
   feed from the Windows runner (blockmaps make updates differential — clients
   download only changed chunks). The Actions artifact upload is best-effort
   only, with short retention, so GitHub artifact quota cannot block feed
   publication. Done — apps pick it up within 4 h or on next launch.

**Feed infrastructure:** static nginx site `chatgoose-updates` on the agency
VPS `45.8.230.111`, serving `/srv/chatgoose-updates` at
`https://45-8-230-111.sslip.io/u/<token>/` (the URL is baked into builds via
`electron-builder.yml` → `publish`; sslip.io is wildcard DNS over the IP, the
cert is a normal Let's Encrypt one auto-renewed by certbot). Files are owned by
the unprivileged `cgupdates` user; CI uploads over scp with the
`UPDATES_SSH_KEY` repo secret (set 2026-06-13) and a pinned host key. Builds
are unsigned, so the feed host being ours is the trust anchor — rotate the
token path (nginx dir + `publish.url`) if it ever leaks somewhere noisy.

**Provisioned & verified 2026-06-13.** The feed is live: a liveness probe sits
at `https://45-8-230-111.sslip.io/u/<token>/ping.txt` (returns `feed-ok`).
Verified end-to-end: trusted TLS from a client machine, the `cgupdates` deploy
key can write to the feed dir, and every non-token path 404s. The server-side
provisioning (nginx site `chatgoose-updates`, the `cgupdates` user + its
authorized deploy key, the Let's Encrypt cert) is reproduced by
`tmp/updates-deploy/setup-feed.sh` (gitignored — it embeds the host specifics).

## Smoke checklist for a new build (any platform)

1. Install/launch from the artifact (not `pnpm dev`).
2. App opens; `userData/chatgoose.db` + `-wal` appear ⇒ the encrypted db opened
   through the asar-unpacked native module.
3. Launch the app a second time while it runs ⇒ no second window; the existing
   one is focused (single-instance lock).
4. Windows additionally: full helper checklist in `docs/WINDOWS-VERIFICATION.md`.
