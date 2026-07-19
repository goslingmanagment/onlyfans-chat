---
name: run-desktop
description: Build, run, and drive the ChatGoose Desktop Electron app. Use when asked to run or start the desktop app, take a screenshot of its UI, verify a change in the real running app, or interact with it programmatically.
---

ChatGoose Desktop is the Electron app in `apps/desktop`. Agents drive it
via the Playwright REPL at `.claude/skills/run-desktop/driver.mjs`: it
launches the **built** app (`apps/desktop/out`) with an **isolated
keyless profile** (`CHATGOOSE_USER_DATA_DIR` → a fresh temp dir per run,
removed on quit), so the real dev profile, hub credentials, and
encrypted DB are never touched. The driver also strips all `CHATGOOSE_*`/`ELECTRON_*` vars from
the child env (the app persists `CHATGOOSE_HUB_API_KEY`/`_HUB_BASE_URL`
into the profile if present), so a stray shell export can't put the
profile online. The app boots OFFLINE into Settings; that's expected and
safe — nothing reaches the hub or OFAPI.

All paths are relative to the repo root. Authored and verified on the
owner's macOS (arm64) host; the Linux branch in the driver (binary path,
`--no-sandbox`) is untested.

## Prerequisites

macOS host with `pnpm`, `node`, `tmux` (all via Homebrew, already
present on the owner's machine), and Xcode CLT for the native-module
rebuild below.

## Setup + Build

```bash
pnpm install
pnpm --filter @chatgoose/desktop rebuild:native   # REQUIRED in a fresh worktree — see Gotchas
pnpm --filter @chatgoose/desktop build
npm ci --prefix .claude/skills/run-desktop        # playwright-core for the driver (pinned via lockfile)
```

## Run (agent path)

Run the driver inside tmux; drive with `send-keys`, read with
`capture-pane`. Launch takes ~5–10 s.

```bash
pnpm --filter @chatgoose/desktop build   # ALWAYS rebuild first — the driver runs out/, not src
S=goose-$$                               # unique session — parallel worktrees must not share one
tmux new-session -d -s "$S" -x 200 -y 50 -c "$PWD" 'node .claude/skills/run-desktop/driver.mjs'
sleep 3; tmux send-keys -t "$S" 'launch' Enter
sleep 10; tmux capture-pane -t "$S" -p | grep -v '^$' | tail -5   # expect "launched. 1 windows:"
tmux send-keys -t "$S" 'ss landing' Enter
sleep 2; tmux capture-pane -t "$S" -p | grep screenshot
# ...work... then always:
tmux send-keys -t "$S" 'quit' Enter; sleep 2; tmux kill-session -t "$S" 2>/dev/null || true
```

Screenshots → a fresh per-run subdirectory under
`$TMPDIR/chatgoose-run/shots/` (exact path printed at startup; override:
`SCREENSHOT_DIR`).
Profile → a fresh temp dir per driver run (path printed at startup;
auto-removed on `quit`). Set `CHATGOOSE_RUN_PROFILE` to reuse one
deliberately. App dir override: `CHATGOOSE_APP_DIR`; a stale build
refuses to launch unless `CHATGOOSE_RUN_ALLOW_STALE=1`.

**Always open the screenshot and look at it.** A keyless profile boots
into Settings; `press Escape` closes them and shows the main three-column
chat surface.

| command | what it does |
|---|---|
| `launch` | launch the built app on the isolated profile |
| `ss [name]` | screenshot → shots dir |
| `click <css-sel>` | DOM click (via evaluate, not coordinates) |
| `click-text <text>` | click button/link/tab containing text |
| `type <text>` / `press <key>` | keyboard input (`press Meta+KeyK` opens the palette) |
| `wait <css-sel>` | wait for element, 10 s timeout |
| `eval <js>` / `text [sel]` | evaluate JS / print innerText |
| `buttons` | list clickable elements — find `click-text` targets |
| `windows` | list windows |
| `quit` | close app, exit driver |

Verified flow: `launch` → `ss` (Settings) → `click-text Agency Hub` →
`press Escape` (main surface) → `press Meta+KeyK` (⌘K palette with AI
actions) → `quit`.

Useful app dev hooks (main/index.ts, dev-only): `CHATGOOSE_OPEN_VIEW=settings|spenders|online`
boots straight into a view; `CHATGOOSE_CAPTURE=/path/prefix` auto-captures
the window every 10 s.

## Run (human path)

```bash
pnpm --filter @chatgoose/desktop dev   # electron-vite dev, REAL dev profile + real hub creds. Ctrl-C to quit.
```

Don't use this for agent verification — it touches the owner's real
profile.

## Test

```bash
pnpm check   # typecheck + lint + unit tests + build — required before any commit
```

## Gotchas

- **Fresh worktree/clone hangs or dies at boot: `rebuild:native` first.**
  pnpm installs the npm-prebuilt `better-sqlite3-multiple-ciphers`
  binding (Node ABI); Electron needs its own ABI. Symptom pair:
  `--smoke` exits 1 with `ERR_DLOPEN_FAILED … NODE_MODULE_VERSION 141 …
  requires … 145`, while a normal launch hangs after the
  `[boot] starting` log line with **no window** — the driver reports it
  as `LAUNCH FAILED: … firstWindow: Timeout 30000ms exceeded`, cleans up,
  and `launch` can be retried after the fix. The canonical checkout works
  only because it was rebuilt long ago — every fresh tree needs
  `pnpm --filter @chatgoose/desktop rebuild:native`.
- **Quick boot sanity check without Playwright:** `apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron apps/desktop --smoke`
  → exits 0 on a throwaway profile, prints the real stack on failure.
- **macOS has no `timeout`** — the classic tmux polling one-liners from
  Linux docs fail with `command not found: timeout`. Use short `sleep` +
  `capture-pane` instead (as above).
- **`capture-pane` output looks empty** — the pane is mostly blank
  lines; filter with `grep -v '^$'`.
- **Verifying a code change? Rebuild first.** The driver launches
  `apps/desktop/out` — editing `src` changes nothing until
  `pnpm --filter @chatgoose/desktop build`. Launch refuses on a missing
  or incomplete build and on a stale one (inputs: desktop src, shared
  src, kernel-sdk dist, vite config; `CHATGOOSE_RUN_ALLOW_STALE=1`
  overrides deliberately).
- **The single-instance lock is profile-scoped** (`SingletonLock` lives
  inside the userData dir, which is switched to the isolated profile
  before the lock is taken) — the driver coexists with the real running
  ChatGoose app; no need to quit it.
- **Commands are serialized and args pass verbatim**: a queued `ss` waits
  for a slow `launch` instead of racing it, and everything after the
  command word (multiple spaces included) reaches `type`/`eval` as-is.
  If the app dies (⌘Q, crash) or the window is closed (⌘W — on macOS
  the app would otherwise keep running windowless), the driver tears the
  session down, prints it, and `launch` works again.
- **Keyless profile shows skeleton placeholders forever** in the chat
  list (no explicit "no accounts" empty state) and status bar says
  OFFLINE. That's the expected look, not a broken launch.
- **Click via DOM, not coordinates** — the driver's `click`/`click-text`
  use `page.evaluate(el.click())`; Playwright's coordinate-based
  `locator.click()` is not exposed on purpose.
