> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Main Shell: Bootstrap, IPC, Preload, Settings, Secrets, Platform

The Electron main process (`apps/desktop/src/main`) holds all secrets and all network
I/O; the renderer only ever sees typed IPC. This maps the shell: the composition root,
window hardening, the full IPC channel catalog, the preload bridge, the settings store,
the keychain + device-token, and the platform integration.

## Composition root — `main/index.ts` (1390 lines)

Header describes the chain "keychain → encrypted db → settings → media:// protocol →
OFAPI client → PollingSync → AI coordinator → IPC" (`index.ts:1-3`).

**Process setup (before app-ready):** `protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_
PRIVILEGES])` (`index.ts:84`); userData redirection (dev override
`CHATGOOSE_USER_DATA_DIR`, packaged forces `appData/ChatGoose`); single-instance lock
(loser quits; winner routes `second-instance`→`focusExistingWindow`, sets AUMID
`com.chatgoose.desktop`).

**`boot()` ordering (`index.ts:778-1320`):** logger first → uncaught-exception handlers →
`startPackagedAutoUpdater()` → `createKeychain` + `deleteDecommissionedSecrets()` (deletes
retired vendor/OFAPI keys) → `refreshRedactionSecrets()` → generated `dbKey`/`mediaCacheKey`
→ `createDataLayer` (encrypted SQLite at `userData/chatgoose.db`) → message-guard runtime +
prune → settings store → `createHarvestModule` → env seeds → `refreshUiPrefs` (uiScale,
locale, notification prefs, `nativeTheme`) → `createWindow({load:false})` →
`registerMediaProtocol` → **`await initOfapi(...)`** (builds the whole OFAPI/hub/sync/AI
runtime) → `registerIpcHandlers({...})` → `reattachEventForwarding()` → window-visibility
wiring → `loadWindowContent` **last**. Teardown on `app.on('quit')` stops sync and disposes
sendEngine/coordinator/hub, then closes the DB.

**`initOfapi` / `rebuildOfapiRuntime` (`index.ts:320-721`):** the reconfigurable runtime,
serialized via `rebuildOfapiRuntimeInFlight`. Reads are hub-only: it builds the OFAPI read
client against `buildHubOfApiReadBaseUrl(hubBaseUrl)` with `authErrorCode:'CG-HUB-01'` and a
75s timeout (`index.ts:427-435`); wraps it in the fail-closed transport client; wires the
credit meter/budget guard, polling sync, hub-aware sync, hub module, send engine, vault/
spenders/online services, and the AI coordinator (`createAiCoordinator({... featureGateway:
nextHub.aiFeatureGateway, summaryHub, onAcceptanceEvent})`, `index.ts:661-667`). If
`hubBaseUrl` or the credential is missing it logs "hub read transport not configured" and
returns inert.

### Window hardening + CSP

`createWindow` (`index.ts:271-318`): 1440×900, `show:false`, preload
`../preload/index.mjs`, `contextIsolation:true`, `nodeIntegration:false`, `sandbox:false`
(ESM preload can't be sandboxed — the contextIsolation + no-nodeIntegration boundary is the
security line), `backgroundThrottling:false`. Navigation is locked down: `will-navigate`,
`will-redirect`, `will-attach-webview` all `preventDefault()`; `setWindowOpenHandler` denies
all and opens only `isAllowedExternalOpenUrl` via `shell.openExternal`. The **CSP** is a
`<meta http-equiv>` in `apps/desktop/src/renderer/index.html` (`default-src 'self';
script-src 'self'; img-src 'self' media: data:; connect-src 'self'; navigate-to 'none';
form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'`), pinned by
`apps/desktop/tests/security/csp.test.ts`. `connect-src 'self'` means the renderer makes no
outbound network requests — everything goes through IPC.

## IPC surface — `main/ipc/`

### `handlers.ts` (1219 lines) — every `ipcMain.handle` channel (all args zod-validated)

The channel names below are the trust-boundary contract, grouped:

- **Query (reads):** `query:accounts.list`, `query:chats.list/get/search`,
  `query:messages.page`, `query:fan.get`, `query:settings.get`,
  `query:personalities.list` (kernel-first, local-KV fallback), `query:sync.status`,
  `query:activity.summary`, `query:outbox.audit/list`, `query:draft.get`,
  `query:ai.featureCosts`, `query:ai.pingGate`, `query:guard.config/scan/blocks`,
  `query:localData.stats`, `query:harvest.status`, `query:updates.status`,
  `query:spenders.lists/roster/untiered/stats/freshness`, `query:online.snapshot`,
  `query:vault.list/albums`, `query:chat.gallery`.
- **Command (writes/actions):** `ai:start`, `ai:cancel`, `cmd:ai.feedback`,
  `cmd:guard.config.update`, `cmd:keys.test` (only `provider:'hub'` accepted),
  `cmd:hub.issueDeviceToken`, `cmd:conversation.open/close/refresh/loadOlder`,
  `cmd:sync.forceRefresh/reconcileUnread/focusAccount`, `cmd:settings.update`
  (fires `onOfapiRuntimeConfigChanged` on hubApiKey/hubBaseUrl and `onHubConfigChanged` on
  hubModeOverride), `cmd:personalities.save/delete`, `cmd:mappings.set`, `cmd:data.purge`,
  `cmd:send.message/retry/dismiss/cancelSequence/verifyNow/ppv`, `cmd:chat.typingActive/
  markRead`, `cmd:message.unsend`, `cmd:draft.set`, `cmd:spenders.hydrate/refreshScope/
  refreshStop`, `cmd:online.refresh`, `cmd:localData.openFolder/exportDiagnostics`,
  `cmd:harvest.start/pause`, `cmd:diag.logClient`, `cmd:updates.check/install`.
- `IpcDeps` (`handlers.ts:346-416`) documents each service as nullable/lazy; the composition
  root passes live-getter accessors so lazily-rebuilt services stay reachable.

### `events.ts` (95 lines) — main→renderer push (exactly three channels)

`attachEventForwarding` sends on `db:changed` (per DB-change-bus event), `sync:event`
(SyncEvents plus additive `{type:'syncStatus'}`, `{type:'creditBalance',...}`, and
spenders-refresh frames), and `ai:event` (coordinator `OperationEvent`s). A side `onSyncEvent`
channel drives dock badges/notifications.

### `viewmodels.ts` (195) & `activity.ts` (243)

`viewmodels.ts` are pure row→VM functions — the renderer never sees raw OFAPI JSON or CDN
URLs; `toRendererMediaUrl` passes only `media://<sha256>` tokens; `summaryToVM.modelLabel`
is the raw model id or `'kernel'` (the model registry died). `activity.ts` assembles
`query:activity.summary` from per-purpose `credit_log`, `ai_spend_log`, outbox transitions,
hub liveness, and the usage/summary queues; AI readiness = `{gatewayConfigured: hubBaseUrl
!== null && hasHubKey}`.

## The preload bridge — `main/../preload/`

- `preload/index.ts:35` exposes exactly one global via `contextBridge.exposeInMainWorld`:
  `window.chatgoose`, with three members — `platform` (labels only), `invoke(channel,args)`
  (checks `INVOKE_CHANNELS.has(channel)`, throws before touching `ipcRenderer`), and
  `on(channel,listener)` (checks the event allowlist, forwards only `args[0]`, returns an
  unsubscribe closure). Two runtime allowlists gate everything: `INVOKE_CHANNELS` (from the
  contract registry) and `EVENT_CHANNELS = Set(['sync:event','ai:event','db:changed'])`. A
  compromised renderer cannot reach an unregistered channel (pinned by
  `apps/desktop/tests/preload/bridge.test.ts`).
- `preload/contract.ts` (1128) is the type contract + the runtime `INVOKE_CHANNEL_REGISTRY`
  (a `Record<InvokeChannelName, true>`, exhaustive both ways at compile time). It defines all
  the narrow view-models (`AccountVM, ChatListItemVM, MessageVM, FanPanelVM, SettingsVM,
  SpenderRowVM, OnlineRowVM, VaultItemVM, ...`), the `DbChangedEvent.scope` enum, and the
  additive `sync:event` sub-frames. `SettingsPatch` omits read-only `hasHubKey`/
  `hasHubDeviceToken`/`keyMeta` and adds write-only `hubApiKey?` (keychain-bound, never read
  back). Money fields are annotated dollars.

## Settings store — `main/settings/store.ts` (508)

Non-secret fields persist one `settings`-table row per key; secret material routes to the
keychain and never enters the DB. Every field validated on read; corrupt/legacy rows fall
back to defaults. Notable defaults and the transport invariants:

- `notificationsEnabled`/`soundEnabled` default **true**; `autoReadChats`/`markAsReadOnOpen`
  default **false**; `defaultReplyTone` `'casual'`; `creditBudgetPerShift` null;
  `uiTheme` `'light'`; `uiLocale` `'system'`.
- `hubBaseUrl` — custom-validated, nullable, default `'https://gosling-agency.ru'`; accepts
  only the prod origin or a loopback dev URL, empty path.
- **Transport literals (the migration invariants):** `ofapiReadTransport: z.literal('hub')`,
  `ofapiWriteTransport: z.literal('hub')`, `aiGatewayTransport: z.literal('feature')` — any
  stored legacy `'direct'`/`'v1'` value fails the literal and coerces to the default on load.
  `aiGatewayTransport` is marked for removal next release.
- `hubModeOverride` (`'auto'`, dev/support), `hubSyncProtocol` (`'v2'` default, `'v1'`
  fallback, no UI), `spendSweepRollbackToLegacy` (false, D6 rollback guard), `unreadReconcile`
  (full config object), spenders/online prefs, `messageGuardPolicy`, `guardConfigTransport`.
- **Secrets vs plain:** the only secret the patch schema accepts is `hubApiKey` (routed to the
  keychain); the strict patch schema **rejects the removed vendor keys**
  (`anthropicKey`/`openRouterKey`). `keyMeta` stores only non-secret fingerprints
  `{last4,setAt}` and now has only a `hub` entry; `buildVm` exposes `hasHubKey` and
  `hasHubDeviceToken` booleans.

## Secrets — `main/secrets/keychain.ts` (136) + `main/hub/device-token.ts`

- `SECRET_NAMES`: active `hubApiKey`/`hubDeviceToken`, encrypted transition custody
  (`hubApiKeyStaged`, `hubDeviceTokenStaged`, `hubDeviceTokenRevoking`), and locally-generated
  `dbKey`/`mediaCacheKey`. **No OFAPI or vendor (anthropic/openRouter) keys exist** — they are
  actively `rm`'d on every boot (`keychain.ts:49-56`). safeStorage-encrypted, one file per
  secret (dir `0o700`, file `0o600`); **no plaintext fallback** — `setSecret` throws if
  encryption is unavailable. Secret replacement writes and flushes a temporary file, atomically
  renames it, then best-effort flushes the directory. This protocol guarantees recovery from a
  **process crash after an awaited write**; it does **not** claim full sudden-power-loss durability
  on Windows filesystems where directory fsync is unavailable.
- `device-token.ts`: sign-in reserves a distinct `agency_hub_pending_device_…` credential that
  cannot authenticate ordinary Core routes, writes encrypted custody plus a hash-bound non-secret
  SQLite journal, then activates it and only afterward promotes it to `hubDeviceToken`. Boot/retry
  replays lost activation responses idempotently. Sign-out similarly journals encrypted exact-token
  custody before remote revoke; 401 is idempotent success, while offline failures keep the token
  quarantined and use the chatter-key fallback. Terminal activation 401 clears only hash-matching
  custody so an expired reservation cannot wedge future sign-ins; 404/5xx remain deferred for
  rolling deploys/outages. If the user signs out while activation is deferred, that cancellation
  bit is persisted in the activation journal; recovery atomically converts it to exact-token
  revocation before clearing activation, so a restart cannot turn the requested sign-out back into
  a signed-in runtime.
- `SettingsStore.getHubConnection()` resolves Hub URL, VM, lifecycle journal, device token and
  chatter key under one serialized queue. Runtime construction, diagnostics, and Settings "Test"
  consume this snapshot, so they cannot pair coordinates from opposite sides of a transition and
  never select staged/revoking custody as a bearer.

## Platform — `main/platform/*` + `main/notifications.ts`

- **updater.ts:** electron-updater (dynamic-imported), `shouldAutoUpdate = win32 &&
  isPackaged`; `autoDownload/autoInstallOnAppQuit=true`; check at launch + every
  `UPDATE_CHECK_INTERVAL_MS=4h`; failures silent for the auto path; manual "Restart & install"
  only from the `downloaded` phase. Feed URL is the generic sslip host in
  `electron-builder.yml`.
- **badge.ts:** Windows overlay-icon badge drawn from scratch (`''`|`1`…`99`|`99+`, clay disc
  + white 5×7 font → PNG via `node:zlib`); macOS uses `app.dock.setBadge`.
- **navigation.ts:** `isAllowedExternalOpenUrl` allows only `http/https/mailto`;
  `isAllowedDevRendererUrl` loopback-only.
- **single-instance.ts:** `focusExistingWindow` (restore+show+focus) — two processes on one
  encrypted DB would double polling/credits and race the WAL.
- **notifications.ts:** only a **body formatter** (`messageNotificationBody`); the composition
  root fires a silent notification on a `messageReceived` sync event when the window isn't
  visible/focused and notifications are enabled, plus an update-ready notification. **No click
  handler exists** — clicking a notification does not focus/route the window.

## Diagnostics — `main/diagnostics/*`

- `logger.ts`: `<userData>/logs/app.log`, single-file rotation at 2 MB → `app.1.log`; a 1000-
  entry in-memory ring; **every record is run through the shared secret redactor** before
  ring/write; packaged minLevel `info`, dev `debug`.
- `report.ts`: `buildDiagnosticsReport` assembles the export bundle and **deep-redacts every
  string leaf one last time**; contents include app/runtime/settings (keyMeta stripped), sync/
  hub/credits, db counts, outbox audit, optional message-guard audit + usage quarantine,
  error counts, and the on-disk log tail. Pure (no Electron/fs).
- `key-tests.ts`: drives the Settings "Test" button; only the `'hub'` provider remains; probes
  `hubApiKey` + `hubBaseUrl` via `probeHubConnection` (`GET /api/v1/auth/me`), returns
  `{username, role, pages}` or a mapped `CG-*` code; never returns key material.
