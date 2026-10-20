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

## Code signing — repository ready, credentials not configured

Pilot builds ship **unsigned**:

- **Windows:** SmartScreen interjects on install; the helper checklist
  (`docs/WINDOWS-VERIFICATION.md`) walks through it («Подробнее» → «Выполнить в
  любом случае»). The release workflow is prepared for electron-builder's
  standard `CSC_LINK` path: it maps the `WINDOWS_CSC_LINK` and
  `WINDOWS_CSC_KEY_PASSWORD` secrets into the build, rejects a half-configured
  pair, and verifies Authenticode on both `ChatGoose.exe` and the installer.
  `verifyUpdateCodeSignature: true` also makes a signed build embed its
  certificate publisher so electron-updater rejects a different signer. Until
  credentials exist, the workflow explicitly logs unsigned pilot mode. Once
  signing is operational, set the repository variable
  `WINDOWS_SIGNING_REQUIRED=true`; every later build then fails closed if the
  credentials or valid signatures are absent.
- **macOS:** `mac.identity: null` skips signing; first open is right-click →
  Open. A Developer ID + notarization removes that.

External owner/admin work is still required: obtain an OV/EV certificate (or a
compatible managed signing identity), store its material as GitHub secrets,
validate the certificate chain on a Windows runner, and enable the required
flag. A protected GitHub environment with release-only approvers should own
those secrets; wiring the job to that environment must happen only after an
administrator creates it and moves the secrets, otherwise today's unsigned
pilot builds would be blocked. Hardware-token or cloud-only EV products may
require their vendor's signing action instead of `CSC_LINK` and are not
pretended to be configured here.

There is one unavoidable bootstrap boundary: already-installed unsigned builds
do not contain a trusted publisher and therefore cannot authenticate the first
signed update. Distribute and verify that first signed installer out of band (or
explicitly accept the existing one-time feed trust); signature pinning protects
updates only after users are running a signed build.

## userData

The packaged app stores its data under `appData/ChatGoose` (set explicitly in
`main/index.ts`). Without that override Electron derives the dir from
package.json's `name` (`@chatgoose/desktop`) — nesting userData under
`appData/@chatgoose/` and **colliding with the dev profile**, which the item-11
packaged smoke run caught as a failed `dbKey` decrypt (different binary ⇒
Keychain/DPAPI refuses). Dev keeps the historical dir; packaged installs start
clean.

## Update checks (Windows automatic, macOS manual)

Installed Windows apps update themselves: `electron-updater` checks the feed at
launch and every 4 h, downloads in the background, installs **on quit** (never
prompts mid-shift; a quiet "installs when you quit" toast is the only signal).
Policy lives in `src/main/platform/updater.ts`.

Packaged macOS builds cannot self-install because the app is unsigned
(Squirrel.Mac requirement). They instead poll the public page's
`version-mac.json` at launch and every 4 h. A newer stable version produces a
native notification and a **Download** action in Settings → Updates; the user
then reinstalls from the DMG. Development and other unsupported builds do not
contact an update feed.

**Manual control — Settings → Updates (added 2026-06-13):** a "Check for
updates" button drives the same controller on demand (`createUpdateController`
+ the `query:updates.status` / `cmd:updates.check` / `cmd:updates.install`
IPC). On Windows it shows live download progress and, once a build is
downloaded, a **Restart & install** button (`quitAndInstall`). On packaged
macOS it reports a newer version as `manual` and opens the public download page.
Unsupported builds render the unsupported note; in plain-vite dev the mock
bridge simulates the Windows check → download → install flow so the UX is
demoable without a real feed.

> **macOS bootstrap:** deployed v0.1.47 predates the notify-only D21 client.
> Distribute the first D21-enabled DMG out of band and have mac users install it
> manually. Only that build and later ones can discover subsequent releases
> through `version-mac.json`.

**Release ritual:**

> **Credential-origin migration (historical, lifecycle-v2 release).** Builds
> through v0.1.41 stored their hub credential without a durable origin+digest
> binding, so the lifecycle-v2 build quarantines that custody rather than risk
> sending a restored credential to the production address. Such an install
> recovers with **Forget locally** followed by a fresh sign-in, and the owner
> ends the old sign-in on their side; the status bar shows **HUB CREDENTIAL**
> until it is done.
>
> **D35 (0.1.55) supersedes the other half of this note.** There is no key to
> re-paste any more: humans sign in with a login and a password, and an install
> that held only the retired key lands on the first-run sign-in screen. A
> credential bound by 0.1.42+ is NOT invalidated by the upgrade — nobody on the
> fleet re-signs in. Publish only after the kernel side of the D35 contract is
> deployed: the build gate compares production's contract hash with the vendored
> one.

1. Bump `version` in `apps/desktop/package.json`, run `pnpm check`, and commit on
   `main`.
2. Push `main` and wait for the `pnpm check` CI job to pass on that exact
   commit. Windows path, line-ending and native-toolchain regressions surface
   in step 4, where `windows-build` reruns `pnpm check` on Windows before it
   builds anything. The tag/publish workflow also rejects the vendored SDK unless
   `kernel-sdk.vendor.json.sourceCommit` is exactly a clean 40-character
   lowercase commit SHA; a `-dirty` SDK snapshot may be tested locally but must
   never enter an installer. GitHub plan restrictions prevent protected required checks on
   this private repository, so `windows-build` also queries Actions and refuses
   to build or publish unless the exact tag SHA already has a successful CI run.
   Every feed publication—all `v*` tags and a manual run with `publishFeed=true`,
   including an emergency higher-semver roll-forward—also reads the canonical
   production Core health response at `https://gosling-agency.ru/api/v1/health`,
   requires `desktop-lifecycle-v2`, and requires its `contractHash` to equal
   `packages/kernel-sdk/kernel-sdk.vendor.json.contractHash`. The hash comparison
   is the deployed wire-contract proof; it makes no claim that the vendored SDK
   source commit is an ancestor of the deployed Core commit. This is
   intentionally not a lifecycle-release selector: no installer can publish
   while Core is on the old reserve/activate or snapshot contract. The persona
   rollout is Core-first as well: an old strict feature schema rejects
   `expectedPersonaDefinitionId`, and an old catalog cannot supply the required
   `definitionId`; the capability/hash fence must pass before Desktop ships.
   The shipped Desktop must also take the immutable local legacy backup before
   its first catalog read, expose the JSON export, preserve raw mappings, and
   contain no client persona write/replay path. Client-side
   persona CAS/editor support is no longer a release prerequisite because
   global definitions are owner-managed in Core. Until fan-profile responses
   carry the exact persona key and opaque `definitionId`, the packaged Desktop
   must not adopt profile prefetch as a summary cache hit or stamp its body with the current
   catalog version. Summary push/replay stays enabled and must preserve the
   original `generatedAtMs` across retries.
3. `git tag v<version> && git push origin v<version>`. Publication rejects a
   tag whose commit is not an ancestor of `origin/main`.
4. The serialized `windows-build` workflow reruns the full `pnpm check`, builds
   the installer on Windows, **smoke-launches
   the packaged binary** (`ChatGoose.exe --smoke` on a throwaway profile must
   exit 0 only after the committed renderer completes a real settings IPC round
   trip; main navigation failure, preload failure, or a renderer crash exits
   non-zero — the D8 dead-on-launch
   class still fails by timeout, and nothing reaches the feed), and uploads
   `ChatGoose-Setup-<version>.exe` + `.blockmap` + `latest.yml` directly to the
   feed from the Windows runner (blockmaps make updates differential — clients
   download only changed chunks). Publication stages a complete release under
   `.incoming`, takes a process-owned server-side lock, rejects a version that
   is not strictly newer than the served version (an identical same-version
   retry after an ambiguous acknowledgement is a verified no-op), verifies the
   staged installer SHA-512, moves
   versioned assets into place, and atomically renames `latest.yml` last. The
   same lock protects feed maintenance: before testing free space it removes
   abandoned `.incoming` stages older than 180 minutes (beyond the workflow's
   130-minute hard timeout), then retains three installer EXEs total (always
   protecting the EXE referenced by the current `latest.yml`), keeps all
   historical `.blockmap` files because old clients can use them for
   differential downloads, and requires at least 5 GiB free. Publication checks
   that floor again after scp and before moving any candidate asset, so a disk
   race cannot switch the manifest.
   The
   postcheck uses normal TLS verification and downloads the served installer to
   prove its SHA-512 equals this run's manifest. If SSH acknowledgement is lost
   after the rename, the same workflow run verifies those already-built exact
   bytes and continues; it does not rebuild an equal version. Transient served
   feed checks retry for up to one minute. The Actions artifact upload is best-effort
   only, with short retention, so GitHub artifact quota cannot block feed
   publication. Done — apps pick it up within 4 h or on next launch.

**Feed infrastructure:** builds poll `https://ext.gosling-agency.ru/u/<token>/`.
The URL is baked in via `electron-builder.yml` → `publish` and frozen into each
installed build's `resources/app-update.yml`, the only place `electron-updater`
reads it from: an installed build can never be pointed at another URL. It
therefore stays on a host name of ours that follows DNS, and `windows-build`
fails when the packaged file carries anything else (D45).

The feed directory is `/srv/chatgoose-updates` on `agency-de`
(`152.53.191.242`), served by a `location /u/` in the `ext.gosling-agency.ru`
nginx site. `windows-build` builds a release only while that URL answers with
the feed, and passes only when it serves the release afterwards. Files are
owned by the unprivileged `cgupdates` user; CI uploads over scp with the
`UPDATES_SSH_KEY` repo secret (set 2026-06-13) and a pinned host key. Builds
are unsigned, so the feed host being ours is the trust anchor — rotate the
token path (nginx dir + `publish.url`) if it ever leaks somewhere noisy.

Builds up to 0.1.65 poll `https://45-8-230-111.sslip.io/u/<token>/` instead.
sslip.io is wildcard DNS over the IP in the name, so that URL can only ever
reach the old agency VPS `45.8.230.111`, where the nginx site
`chatgoose-updates` serves that server's own copy of the directory. The copy
stays as it was when uploads moved: its `latest.yml` is the last release
published there, which already carries the new URL, and that is all those
builds need from it. It has to keep answering, with a valid certificate (a
normal Let's Encrypt one, renewed by certbot on that VPS), until its access
log shows no more polls: whoever holds the IP afterwards can obtain a
certificate for the name and serve an update to any build still asking.

**Moving the feed to another server** (D45; how the feed came to `agency-de`).
Who polls what fixes the order:

1. The first release with a new feed URL goes out where the older builds look,
   through the unchanged upload path: they have no other way to receive it.
   The new URL must already answer from that same directory.
2. Then, in one step and with no desktop release in between, the feed
   directory is copied to the new server, the upload target in
   `windows-build.yml` and `publish-mac.sh` moves there, and
   `ext.gosling-agency.ru` is switched. A release uploaded to one server while
   the name shows the other reaches no build that polls the name; the
   served-feed assertion fails the run when that happens.
3. The old URL keeps serving that first release from its own directory until
   its access log shows no more polls. Nothing is published there after step
   2: a build that lags behind updates to that release first, and from the new
   URL to the current one next.

**Public download page (D20, built 2026-07-18):** first installs come from
`https://ext.gosling-agency.ru/desktop/` — a static page in
`/var/www/ext/desktop` on the feed's server (the ext site's nginx vhost already
serves the whole dir; no separate config). It offers both platforms:

- **Windows**: `ChatGoose-Setup-latest.exe` is a symlink into the feed's
  current installer, plus `version-win.json` (`{"version","size"}`). Both are
  refreshed automatically by `publish-feed.sh` on every publication (the
  workflow passes `PUBLIC_DL_DIR` as the third argument), including the
  lost-acknowledgement retry path. Manual repair: stream the script to the
  feed host with `--refresh-public <feed-dir> <public-dir>`. The page never
  exposes the feed's token path — the symlink resolves server-side only.
- **macOS**: no CI leg builds mac, and unsigned builds have no auto-update, so
  the page IS the mac channel. Installed mac builds DO notice new versions
  (D21): the app polls the page's `version-mac.json` and shows a notification
  plus a Download button in Settings → Updates — publishing a mac DMG is what
  makes that fire. After a release mac users should get, run
  `apps/desktop/scripts/publish-mac.sh` from the repo root on the owner's Mac:
  it requires a clean checkout at the exact local `v<version>` tag, builds
  (or `--skip-build` to reuse only the byte-identical DMG plus provenance
  record created by an earlier safe run), mounts the DMG at a unique temporary
  mountpoint, and runs the packaged `--smoke` gate fail-closed. It
  uploads a uniquely staged DMG and invokes a locked server-side publisher
  that rejects downgrades and conflicting same-version bytes, atomically
  replaces each public pointer, and retains 3 versioned DMGs without deleting
  the selected artifact. The local script then postchecks the exact JSON and
  the full served DMG SHA-512 over HTTPS. The symlink and JSON replacements are
  individually atomic: JSON is authoritative and moves first, and the page
  derives its download href from JSON's immutable versioned artifact. A later
  run repairs a lagging symlink from that validated JSON after a process death.

The two `version-*.json` files are deliberately separate — each writer owns
its file outright, so no shared JSON is ever parsed or raced on. The page
source is `docs/download-page/index.html`; redeploy it with
`scp docs/download-page/index.html root@152.53.191.242:/var/www/ext/desktop/index.html`.

Feed retention can be inspected without deleting anything by streaming
`publish-feed.sh --maintain <feed-dir> --dry-run` on the feed host. The locked
script accepts `CHATGOOSE_FEED_KEEP_INSTALLERS` (default `3`, minimum `2`) and
`CHATGOOSE_FEED_MIN_FREE_KIB` (default `5242880`). Maintenance deletes only
stable `ChatGoose-Setup-X.Y.Z.exe` files outside the retention set and stale
one-level `.incoming` directories; dry-run deletes neither. It never deletes
blockmaps, the current manifest, or its referenced installer.

**Recovery / rollback:** Never point `latest.yml` at a lower version. The updater
rejects downgrades, and an older binary may also reject a database migrated by a
newer release. Roll forward instead: build a **higher-semver** rescue release
from the last known-good code plus the required forward-compatible migrations,
run the complete release ritual above, and let normal auto-update install it.
The production capability gate still applies to this emergency publication. If
Core has lost `desktop-lifecycle-v2`, restore or roll Core forward first; do not
bypass the gate, publish from an untagged SHA, or use a lower Desktop binary as
an emergency escape hatch.
In particular, never rebuild or republish 0.1.30/0.1.31 — both are dead-on-launch
(D8).

**Provisioned & verified 2026-06-13** on the agency VPS `45.8.230.111`: a
liveness probe at `https://45-8-230-111.sslip.io/u/<token>/ping.txt` (returns
`feed-ok`), trusted TLS from a client machine, the `cgupdates` deploy key can
write to the feed dir, and every non-token path 404s. That provisioning (nginx
site `chatgoose-updates`, the `cgupdates` user + its authorized deploy key, the
Let's Encrypt cert) is reproduced by `tmp/updates-deploy/setup-feed.sh`
(gitignored — it embeds the host specifics). **Moved to `agency-de`** (D45):
the feed directory, the download page and the `cgupdates` user with the same
deploy key were copied there, and the same probe answers at
`https://ext.gosling-agency.ru/u/<token>/ping.txt`.

## Smoke checklist for a new build (any platform)

1. Install/launch from the artifact (not `pnpm dev`).
2. App opens; `userData/chatgoose.db` + `-wal` appear ⇒ the encrypted db opened
   through the asar-unpacked native module.
3. Launch the app a second time while it runs ⇒ no second window; the existing
   one is focused (single-instance lock).
4. Windows additionally: full helper checklist in `docs/WINDOWS-VERIFICATION.md`.

## Post-publish assert (Stage 35)

The windows-build workflow's publish path ends with a checked step: the served
`latest.yml` version, artifact filename, and SHA-512 must equal this run, and the
downloaded served installer must hash to that same SHA-512. The package version
must also equal the `v*` tag. Any mismatch fails the run. Recovery is another
strictly higher-semver roll-forward release; never repair the feed by pointing
it backward or by copying `latest.yml` outside the locked publisher.
