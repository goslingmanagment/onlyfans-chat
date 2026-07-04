# 04 — Main Bootstrap, IPC Bridge & Settings

## Scope

This doc maps the Electron "shell" of `apps/desktop`: the main-process bootstrap and composition root (`apps/desktop/src/main/index.ts`), the full renderer↔main IPC contract (channel catalog, pushed events, view-models, activity aggregation), the `contextBridge` preload surface (`window.chatgoose`), the settings store and its transport invariants, the OS-keychain secret store, the platform-integration modules (auto-updater, unread badge, external-navigation guard, single-instance lock), OS notifications, and diagnostics (logger, export report, key self-tests).

It describes only these files. It touches neighbor subsystems where the composition root wires them and defers their internals to their owner docs:
- OFAPI Direct client → **05-ofapi-client.md** (`ofapi/transport.ts` `createOfApiTransportClient`, `createOfApiClient`, `creditMeter`).
- Read/sync selection, polling, hub SSE, budget guard → **06-sync-and-reads.md** (`sync/*`).
- Send engine / outbox / audit → **07-send-engine-outbox.md** (`send/*`).
- AI coordinator/gateway → **08-ai-pipeline.md** (`ai/*`).
- Encrypted SQLite / media protocol / vault → **09-data-model-storage.md** (`db/*`, `media/*`).
- React renderer that consumes this contract → **10-renderer-ui.md**.
- Hub REST module, usage/spend metering, spenders/online services → **11-hub-monetization-activity.md** (`hub/*`, `spenders/*`, `online/*`).
- Every external wire boundary (OFAPI, core hub, AI providers, update feed, OS integration) → **02-external-boundaries.md**.
- Shared pure-TS types/protocol/i18n consumed here → **03-shared-package.md** (`@chatgoose/shared/*`).

---

## 1. Process bootstrap & lifecycle (`main/index.ts`)

The file is the SPEC-§4 composition root: keychain → encrypted db → settings → `media://` protocol → OFAPI client → sync → AI coordinator → IPC. All secrets and network I/O live in main; the renderer only sees typed IPC.

### 1.1 Module-load-time work (before `app.whenReady`)

Top-level statements run at import time, before the app is ready:

- **`protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_PRIVILEGES])`** (`index.ts:79`). Must run before ready; the `media://` scheme is registered non-`standard` with `{ supportFetchAPI: true, stream: true }` (privileges defined in `media/protocol.ts:19`, owned by doc 09). This is the only custom scheme.
- **userData redirection** (`index.ts:1216`–`1230`): dev builds may relocate userData via `CHATGOOSE_USER_DATA_DIR` (ignored when packaged); packaged builds force `userData = appData/ChatGoose` (`index.ts:1229`) to avoid the `@chatgoose/desktop` package-name nesting that once collided the packaged app with the dev profile and failed DB decrypt.
- **Single-instance lock** (`index.ts:1236`): `app.requestSingleInstanceLock()`; the loser calls `app.quit()`. The winner registers `second-instance` → `focusExistingWindow(mainWindow)` (`platform/single-instance.ts`), sets `app.setAppUserModelId('com.chatgoose.desktop')` (must match the electron-builder shortcut AUMID or Windows toasts never fire), then `app.whenReady().then(...)`.
- There is **no deep-link / custom-protocol registration** — no `setAsDefaultProtocolClient`, no `open-url` handler. "Navigation" is purely the in-window guard (§1.4).

### 1.2 `whenReady` and app-level events

- On ready (`index.ts:1246`): `buildAppMenu()` then `boot()` with a catch that logs, flushes the logger, and shows `dialog.showErrorBox` (a failed boot used to die behind a blank window). `app.on('activate')` recreates the window on macOS when none exist.
- `window-all-closed` (`index.ts:1266`): quit except on darwin.
- `quit` (`index.ts:1272`): logs, flushes logger, disposes the runtime settings watcher, stops sync, disposes send engine / coordinator / hub, closes the DB.
- Fatal-error nets are installed in `boot()`: `process.on('uncaughtException', exitAfterFatalException)` (`index.ts:142`, logs then `app.exit(1)` after a 1 s flush timer, re-entry-guarded) and `unhandledRejection` (logs + flush, does not exit).

### 1.3 Window creation & security flags (`createWindow`, `index.ts:260`)

`BrowserWindow` options:
- `width: 1440, height: 900, minWidth: 1100, minHeight: 680` (`index.ts:261`–`265`); `show: false` then shown on `ready-to-show`.
- `backgroundColor` pre-painted per resolved theme via `windowBackgroundColor()` (`index.ts:122`; `WINDOW_BG = { light:'#efece4', dark:'#1b1a17' }`, must equal renderer CSS `--color-bg0`).
- `webPreferences`: `preload: ../preload/index.mjs`, **`contextIsolation: true`**, **`nodeIntegration: false`**, **`sandbox: false`**, **`backgroundThrottling: false`**.
  - **Discrepancy vs SPEC §15 "sandbox":** sandbox is deliberately `false` (`index.ts:276`) — the ESM preload cannot be sandboxed under the electron-vite ESM project. The comment states the boundary is instead `contextIsolation` + no `nodeIntegration` + the narrow typed bridge. `backgroundThrottling:false` keeps renderer timers alive when hidden (main-side polling always runs regardless).
- Navigation/zoom listeners are attached per window (§1.4).

### 1.4 In-window navigation guard

All wired on `win.webContents` in `createWindow` and enforced by `platform/navigation.ts`:
- `will-navigate`, `will-redirect`, `will-attach-webview` → `event.preventDefault()` (`index.ts:288`–`296`): the SPA can never navigate away or attach a webview.
- `setWindowOpenHandler` (`index.ts:297`): always returns `{ action: 'deny' }`; if `isAllowedExternalOpenUrl(url)` (http/https/mailto only, `navigation.ts:28`) it hands the URL to `shell.openExternal`.
- Content load (`loadWindowContent`, `index.ts:242`): dev uses `ELECTRON_RENDERER_URL` only when `isAllowedDevRendererUrl` passes (http/https on a loopback host, `navigation.ts:14`); otherwise `loadFile('../renderer/index.html')`. `CHATGOOSE_OPEN_VIEW=settings|spenders|online` (dev only) injects a `view=` query via `appendSearchToUrl`.
- **CSP** is declared as a `<meta http-equiv>` in `apps/desktop/src/renderer/index.html:7`, **not** via `onHeadersReceived` in main: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' media: data:; font-src 'self' data:; connect-src 'self'; navigate-to 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'`. `img-src` admits the `media:` scheme and `data:`; `connect-src 'self'` — the renderer makes no direct network calls (all I/O goes through IPC).
- Custom app menu (`buildAppMenu`, `index.ts:202`) strips accelerators that would shadow product hotkeys: Hide→`Ctrl+Cmd+H`, Reload only unpackaged on `Shift+Cmd+R`, zoom roles dropped (UI scale is a setting). Edit roles kept for clipboard.

### 1.5 `boot()` composition order (`index.ts:781`)

1. `createLogger` **first** (`index.ts:786`) so early failures are captured; min level `info` packaged / `debug` dev, console mirror in dev.
2. Install `uncaughtException` / `unhandledRejection` handlers; `startPackagedAutoUpdater()` (§7.1).
3. `createKeychain({ safeStorage, secretsDir: userData/secrets })`. Dev-only: import `ONLYFANSAPI_API_KEY` env into `ofapiKey` once if unset.
4. `refreshRedactionSecrets()` (`index.ts:822`): loads `ofapiKey/anthropicKey/openRouterKey/hubApiKey` plaintext values and hands them to `logger.setRedactionSecrets` — re-run on every settings-bus event (a key save writes `keyMeta`, which fires the bus).
5. `getOrCreateGeneratedKey('dbKey')` and `('mediaCacheKey')` → generated 32-byte hex keys.
6. `createDataLayer({ driverPath:'better-sqlite3-multiple-ciphers', filePath: userData/chatgoose.db, encryptionKey: dbKey })` (doc 09).
7. `createMessageGuardRuntime({ data, logger })` + `pruneExpired()` (doc 08).
8. `createSettingsStore({ queries: data.settings, secrets: keychain })` (§5).
9. Env seeds (evidence builds): `CHATGOOSE_HUB_BASE_URL` / `CHATGOOSE_HUB_API_KEY` persist through the normal settings/keychain path; dev-only `CHATGOOSE_SPENDERS_MAP="acct_…=id1,id2"` seeds `spendersListMappings` once.
10. `refreshUiPrefs()` (`index.ts:878`): reads `uiScale`, resolves `uiLocale` (`resolveUiLocale(vm.uiLocale, app.getLocale())`), mirrors notification prefs, sets `nativeTheme.themeSource = vm.uiTheme`. Subscribed to the settings bus + `nativeTheme.on('updated')` for OS scheme flips.
11. `mainWindow = createWindow({ load:false })` — created but not yet loaded.
12. `registerMediaProtocol(...)` bound to `mainWindow.webContents.session` with a `fetchRemote` that re-checks `isAllowedMediaUrl` and refuses non-OF/non-https URLs (doc 09).
13. `await initOfapi(keychain, data, settingsStore)` (§1.6).
14. `registerIpcHandlers({...})` (§2, §1.7).
15. `reattachEventForwarding()` (§1.8) then finally `loadWindowContent(mainWindow)`.
16. Window visibility listeners (`focus`/`show`/`hide`/`minimize`) drive `sync.setWindowVisible(...)`. Dev-only `CHATGOOSE_CAPTURE=prefix` screenshots every 10 s.

### 1.6 OFAPI runtime (re)build (`initOfapi` / `rebuildOfapiRuntime`, `index.ts:309` / `:333`)

`initOfapi` serializes concurrent rebuilds via `rebuildOfapiRuntimeInFlight`. `rebuildOfapiRuntime` constructs an entire OFAPI-lifecycle runtime as a **prepared-then-committed transaction** (a `committed` flag; the `finally` block disposes the candidate on failure so a half-built runtime is never installed):

- Reads current settings + `ofapiKey`/`hubApiKey` from the keychain.
- Builds a `directClient` (`createOfApiClient`) only if `ofapiKey` is present; picks the **read client** by `ofapiReadTransport`: `hub` builds a second client pointed at `buildHubOfApiReadBaseUrl(hubBaseUrl)` with `authErrorCode:'CG-HUB-01'`; `direct` uses `directClient`. Missing config throws only if a runtime was already active (`hadActiveRuntime`), else returns silently (keyless boot). Read requests use `HUB_OFAPI_READ_TIMEOUT_MS = 75_000` (`index.ts:81`).
- Wraps the read client with `createOfApiTransportClient` (doc 05) — the seam that **fails all direct writes closed** (`CG-HUB-02`).
- Hydrates the credit meter from `creditLog`, subscribes a per-purpose delta flush into `credit_log`, and builds a `createBudgetGuard` that fires an OS budget notification (`notif.budget*`).
- Builds `createPollingSync`, `createHubAwareSync` (with a `createHub` factory that resolves hub base URL + key per reconnect and persists `hubSync.lastEventId`), `createHubModule` (+`reconfigure()`), `createSendEngine` (given `hubCommandClient: nextHub.commandClient`), `createVaultService`, `createSpendersService`, `createOnlineService`, `createSpendersRefresh`, and `createAiCoordinator` (gateway = `createSelectableAiGateway({ direct: createDirectGateway(...), hub: nextHub.aiGateway })`).
- On commit: disposes the previous event-forwarding/runtime-settings watcher/sync/spendersRefresh/sendEngine/coordinator/hub, then assigns the module-level singletons (`client`, `sync`, `hub`, `sendEngine`, `coordinator`, `vaultService`, `spendersService`, `onlineService`, `spendersRefresh`, `recheckHubConfig`), starts sync, resumes the persisted spenders-refresh queue.
- A `settingsCache` object + `attachRuntimeSettingsWatcher` keep the live runtime reading current `creditBudgetPerShift`, `autoReadChats`, `hubModeOverride`, `spendSweepRollbackToLegacy`, `unreadReconcile`, notification prefs. **Note:** `readTransport` passed to polling captures `initialSettings.ofapiReadTransport` (the snapshot at build time, `index.ts:545`), not the live cache — a read-transport change triggers a full rebuild anyway.
- `recheckNextHubConfig` resubscribes the SSE stream only when a fingerprint of `hubBaseUrl + hubKey + hubModeOverride` changes (`hubConfigFingerprint`, `index.ts:522`) — avoids the resubscribe loop that `hubSync.lastEventId` settings writes would otherwise cause.

### 1.7 IPC deps as live getters + lifecycle hooks

`registerIpcHandlers` (`index.ts:959`) receives OFAPI-lifecycle services as **getters** over the module-level singletons (`get sync()`, `get send()`, `get coordinator()`, `get vault()`, `get spenders()`, `get online()`, `get spendersRefresh()`, `get creditMeter()`), because a key configured on a keyless boot rebuilds those bindings after registration. It also passes:
- `purge` (§1.9), `onOfapiRuntimeConfigChanged` / `onOfapiKeyConfigured` (both → `rebuildOfapiRuntimeFromSettings`, which reruns `initOfapi` + `reattachEventForwarding` + `emitSyncStatusFrame`), `onHubConfigChanged` (→ `recheckHubConfig` + status frame).
- `getCoreCreditsSummary` → `hub.getOfapiCreditsSummary()`.
- `logger`, `updates` (lazy read of `updateController`), `testKey` (→ `runKeyTest`), and the `localData` capability object (`stats` / `openFolder` / `exportDiagnostics`, since paths/shell live only in the composition root).

### 1.8 Event forwarding + badges + notifications (`reattachEventForwarding`, `index.ts:734`)

Rebinds `attachEventForwarding` (§3) each time the runtime changes. Its `onSyncEvent` callback:
- On `chatListUpdated`: recomputes total unread; macOS `app.dock.setBadge(String(total)|'')`; Windows `mainWindow.setOverlayIcon(nativeImage.createFromBuffer(badgePng(total)), '${total} unread')` or clears (`platform/badge.ts`, §6).
- On `messageReceived` while the window is hidden/unfocused and `notificationsEnabled`: shows an OS `Notification` titled with the fan name and body from `messageNotificationBody` (§8).
- `emitSyncStatusFrame()` sends a bare `{ type:'syncStatus' }` on `sync:event`.

### 1.9 Purge (`cmd:data.purge`, `index.ts:996`)

Re-entry-guarded (a double fire would `app.relaunch()` twice and race two processes on the encrypted DB). Disposes watchers/sync/spendersRefresh/sendEngine/hub, closes the DB, clears the media cache, `rm`s `chatgoose.db{,-wal,-shm}` and `media-cache/`, then `app.relaunch()` + `app.exit(0)`.

### 1.10 Diagnostics export (inline in `localData.exportDiagnostics`, `index.ts:1070`)

Gathers versions, `settingsStore.get()` with `keyMeta` stripped, sync/hub/hubActivity status, credit snapshot, `coreCredits`, DB row **counts** (never message text), `auditOutbox` **counts** only, `messageGuard.blocks({limit:50})`, `errorCounts`, in-memory log ring, and the durable on-disk log tail (`logger.readFileTail`). Passes everything to `buildDiagnosticsReport(inputs, redactionSecrets)` (§9.2), writes `chatgoose-diagnostics-<stamp>.json` under userData, and reveals it. Every gather step is individually try/guarded so a sick DB cannot make the export throw.

---

## 2. IPC channel catalog

The contract is defined in `apps/desktop/src/preload/contract.ts` as `InvokeChannels` (request/response types) + `EventChannels` (pushed). `INVOKE_CHANNEL_REGISTRY` (`contract.ts:1019`) is an exhaustive `Record<InvokeChannelName, true>` that both the preload allowlist and the compiler use to keep the set closed. All 65 invoke handlers are registered in `main/ipc/handlers.ts` `registerIpcHandlers` (`handlers.ts:403`).

### 2.1 Trust boundary & validation

Every renderer-supplied argument is a trust boundary. Handlers call `<schema>.parse(rawArgs)` (zod) at the top; a parse failure throws and rejects the `invoke` promise. Void-arg queries (`accounts.list`, `settings.get`, `sync.status`, `personalities.list`, `activity.summary`, `ai.featureCosts`, `localData.stats`, `updates.status`, `guard.config`) validate nothing because they take no input. Optional-arg handlers parse `rawArgs ?? {}`. Two special cases route validation into the callee: `cmd:settings.update` validates via `settingsPatchSchema` inside `SettingsStore.update` (§5); `cmd:guard.config.update` parses `messageGuardPolicySchema` (shared). Schemas are defined near the top of `handlers.ts` (`idSchema = z.string().min(1).max(64)`, `convSchema`, `chatsListSchema`, `aiStartSchema`, `sendMessageSchema`, `sendPpvSchema`, etc.). A second allowlist gate lives in preload (§4).

### 2.2 Reads — `query:*`

| Channel | Request schema | Response VM | Handler / source |
|---|---|---|---|
| `query:accounts.list` | *(void)* | `AccountVM[]` | `data.accounts.list` + settings mappings → `accountToVM` |
| `query:chats.list` | `chatsListSchema` `{accountId, filter, limit?, offset?}` | `{items: ChatListItemVM[], hasMore}` | `data.chats.list` → `chatToVM` |
| `query:chats.get` | `chatGetSchema` `{accountId, chatId}` | `ChatListItemVM \| null` | `data.chats.get` → `chatRowToVM` |
| `query:chats.search` | `chatsSearchSchema` `{accountId, query≤200}` | `ChatListItemVM[]` | `data.chats.search` |
| `query:messages.page` | `messagesPageSchema` `{accountId, chatId, beforeId?, limit≤200}` | `{items: MessageVM[], hasMore}` | `data.messages.page` → `messageToVM` |
| `query:fan.get` | `fanGetSchema` `{accountId, fanId}` | `FanPanelVM \| null` | `data.fans` + `data.summaries` → `fanToVM` |
| `query:settings.get` | *(void)* | `SettingsVM` | `settingsStore.get` |
| `query:personalities.list` | *(void)* | `Personality[]` | `loadPersonalities(data)` (reconciles bundled) |
| `query:sync.status` | *(void)* | `SyncStatusVM` | `sync` + `creditMeter` + `data` (§3.1) |
| `query:activity.summary` | *(void)* | `ActivityVM` | `buildActivitySummary` (§3.3) |
| `query:outbox.audit` | `{accountId?}` | `OutboxAuditReportVM` | `auditOutbox(data)` (doc 07) |
| `query:outbox.list` | `convSchema` `{accountId, chatId}` | `OutboxItemVM[]` | `data.outbox.listForChat` → `outboxToVM` |
| `query:guard.config` | *(void)* | `MessageGuardPolicy` | `messageGuard.getPolicy` |
| `query:guard.scan` | `guardScanSchema` `{text≤20000}` | `GuardVerdict` | `messageGuard.scan` |
| `query:guard.blocks` | `guardBlocksSchema` `{accountId?, limit≤200}` | `MessageGuardBlocksReportVM` | `messageGuard.blocks` |
| `query:ai.featureCosts` | *(void)* | `AiFeatureCostsVM` | `buildFeatureCosts(data)` (§3.3) |
| `query:ai.pingGate` | `convSchema` | `PingGateVM` `{segment, blocked}` | `data.messages.page` + `analyzePingSegment` (shared) |
| `query:localData.stats` | *(void)* | `LocalDataStatsVM` | `localData.stats` (composition root) |
| `query:updates.status` | *(void)* | `UpdateStatusVM` | `updates.status` (§7) |
| `query:draft.get` | `convSchema` | `{text}` | `data.settings` key `draft.<acct>.<chat>` |
| `query:spenders.lists` | `spendersListsSchema` `{accountId}` | `{lists, fetchedAt}` | `spenders.lists` (doc 11) |
| `query:spenders.roster` | `spendersRosterSchema` `{accountId, listId}` | `{rows, truncated, fetchedAt}` | `spenders.roster` |
| `query:spenders.untiered` | `spendersListsSchema` | `{rows, fetchedAt}` | `spenders.untiered` |
| `query:spenders.stats` | `spendersListsSchema` | `SpenderStatsVM` | `spenders.stats` |
| `query:spenders.freshness` | `spendersListsSchema` | `SpendersFreshnessVM` | `spendersRefresh.freshness/status` (null-safe) |
| `query:online.snapshot` | `onlineSnapshotSchema` `{accountId, spendersOnly}` | `OnlineSnapshotVM` | `online.snapshot` (returns empty snapshot if no service) |
| `query:vault.list` | `vaultListSchema` `{accountId, albumId?, query?, offset?}` | `{items, hasMore, nextOffset}` | `vault.listVault` |
| `query:vault.albums` | `vaultAlbumsSchema` `{accountId}` | `VaultAlbumVM[]` | `vault.listAlbums` |
| `query:chat.gallery` | `chatGallerySchema` `{accountId, chatId, offset?}` | `{items, hasMore, nextOffset}` | `vault.chatGallery` |

### 2.3 Commands — `cmd:*` (+ `ai:*`)

| Channel | Request schema | Response | Handler / source |
|---|---|---|---|
| `cmd:settings.update` | `settingsPatchSchema` (strictObject, in store) | `SettingsVM` | `settingsStore.update` + runtime hooks (§2.4) |
| `cmd:guard.config.update` | `messageGuardPolicySchema` | `MessageGuardPolicy` | `messageGuard.updatePolicy` |
| `cmd:keys.test` | `keysTestSchema` `{provider}` | `KeyTestResultVM` | `testKey` → `runKeyTest` (§9.3) |
| `cmd:localData.openFolder` | *(void)* | `void` | `shell.openPath(userData)` |
| `cmd:localData.exportDiagnostics` | *(void)* | `{path}` | inline diagnostics export (§1.10) |
| `cmd:diag.logClient` | `logClientSchema` `{level, scope≤120, message≤4000, fields?}` | `void` | `logger.log('renderer:<scope>', …)` |
| `cmd:updates.check` | *(void)* | `UpdateStatusVM` | `updates.check` |
| `cmd:updates.install` | *(void)* | `void` | `updates.install` (`quitAndInstall`) |
| `cmd:conversation.open` | `convSchema` | `ConversationOpenResultVM` | `sync.openConversation` (+ diag logging) |
| `cmd:conversation.close` | `convSchema` | `void` | `sync.closeConversation` |
| `cmd:conversation.refresh` | `convSchema` | `void` | `sync.readChatTailForUserOpen(…, 'chat-refresh')` |
| `cmd:conversation.loadOlder` | `convSchema` | `{returned, fresh, hasOlder}` | `sync.loadOlderMessagesForUserOpen` |
| `cmd:sync.forceRefresh` | `forceRefreshSchema` `{accountId?}` | `void` | `sync.forceRefresh` |
| `cmd:sync.reconcileUnread` | `reconcileUnreadSchema` `{accountId?, trigger?}` | `void` | `sync.reconcileUnread` |
| `cmd:sync.focusAccount` | `focusAccountSchema` `{accountId: string\|null}` | `void` | `sync.setFocusedAccount` |
| `cmd:personalities.save` | `personalitySchema` | `Personality[]` | `data.settings` key `personalities` |
| `cmd:personalities.delete` | `personalityDeleteSchema` `{id}` | `Personality[]` | drops personality + cascades account mappings |
| `cmd:mappings.set` | `mappingSchema` `{accountId, personalityId\|null}` | `void` | `settingsStore.update({accountMappings})` |
| `cmd:data.purge` | *(void)* | `void` | `purge()` (§1.9) |
| `ai:start` | `aiStartSchema` `{operationId(uuid), feature, accountId, chatId, params}` | `void` | `coordinator.start` (throws if no coordinator) |
| `ai:cancel` | `aiCancelSchema` `{operationId(uuid)}` | `void` | `coordinator.cancel` |
| `cmd:ai.feedback` | `aiFeedbackSchema` `{operationId, action:'copied'\|'inserted', partIndex?, feature?}` | `void` | updates `usage_events` payload + `aiSpendLog.markInserted` |
| `cmd:send.message` | `sendMessageSchema` `{accountId, chatId, parts[1..10]}` | `{localIds, sequenceId}` | `send.sendParts` |
| `cmd:send.retry` | `sendRetrySchema` `{accountId, localId, text}` | `{localId}` | `send.retry` |
| `cmd:send.dismiss` | `sendRowRefSchema` `{accountId, localId}` | `void` | `send.dismiss` |
| `cmd:send.cancelSequence` | `sendSequenceSchema` `{accountId, sequenceId}` | `void` | `send.cancelSequence` |
| `cmd:send.verifyNow` | `convSchema` | `void` | `send.verifyChat` |
| `cmd:send.ppv` | `sendPpvSchema` `{…, price 0–200, mediaFiles[1..40], previews≤40}` | `{localId}` | `send.sendPpv` (engine validates invariants) |
| `cmd:chat.typingActive` | `convSchema` | `void` | `send?.typingActive` (advisory; no-op if no engine) |
| `cmd:chat.markRead` | `convSchema` | `void` | `send?.markRead` (advisory; debounced/gated in engine) |
| `cmd:message.unsend` | `messageRefSchema` `{accountId, chatId, messageId}` | `void` | `send.unsend` |
| `cmd:draft.set` | `draftSetSchema` `{accountId, chatId, text≤20000}` | `void` | `data.settings` (removes row when text `''`) |
| `cmd:spenders.hydrate` | `spendersHydrateSchema` `{accountId, chatId, username?}` | `{hasChat, fetched, messageCount, skippedByTtl, error?}` | `spendersRefresh.hydrateIfStale` (local-only fallback) |
| `cmd:spenders.refreshScope` | `spendersScopeSchema` `{accountId, scope}` | `void` | `spendersRefresh.start` |
| `cmd:spenders.refreshStop` | `spendersListsSchema` | `void` | `spendersRefresh.stop` |
| `cmd:online.refresh` | `onlineSnapshotSchema` | `OnlineSnapshotVM` | `online.refresh` |

**Capability guards.** `requireSend` / `requireSpenders` / `requireSpendersRefresh` / `requireOnline` / `requireVault` / `requireMessageGuard` / `requireLocalData` / `requireUpdates` throw a specific English error when the (lazily built) service is null. `cmd:chat.typingActive`, `cmd:chat.markRead`, `cmd:conversation.close` and the two snapshot/freshness reads instead **degrade silently** when the service is absent.

**`cmd:ai.feedback` behavior detail** (`handlers.ts:844`): it reads the pending `usage_events` payload, `json_set`s `$.accepted=1`/`$.acceptedPart`, and — only if not already accepted and the day matches `^\d{4}-\d{2}-\d{2}$` — increments the durable `ai_spend_log` inserted counter. This is the acceptance-rate instrumentation the Activity panel reads.

### 2.4 `cmd:settings.update` side-effect fan-out (`handlers.ts:743`)

After `settingsStore.update` persists, the handler diff-triggers runtime hooks by inspecting the raw patch keys:
- `ofapiKey` / `hubApiKey` / `hubBaseUrl` / `ofapiReadTransport` present → `onOfapiRuntimeConfigChanged()` (full runtime rebuild).
- else, if `hasOfapiKey` flipped false→true → `onOfapiKeyConfigured()` (rebuild after a keyless boot).
- `hubModeOverride` present → `onHubConfigChanged()` (SSE recheck).
- `messageGuardPolicy` / `guardConfigTransport` present → `data.bus.publish({scope:'guard'})`.

---

## 3. Main → renderer pushes, view-models, activity

### 3.1 Pushed events (`main/ipc/events.ts`)

`attachEventForwarding` (`events.ts:33`) wires four sources onto three channels and returns a disposer:
- **`db:changed`** — each `DbChangeBus` event forwarded individually (`DbChangedEvent`: `scope ∈ accounts|chats|messages|fans|summaries|settings|outbox|guard`, optional `accountId`/`chatId`).
- **`sync:event`** — union of the shared `SyncEvent`, plus two additive status frames not in that union: `CreditBalanceEvent` (`{type:'creditBalance', balance, usedToday, rpmRemaining}`, from `creditMeter.subscribe`) and `SpendersRefreshEvent` (`{type:'spendersRefresh', accountId, scope, state, done, total}`, from `spendersRefresh.subscribe`). A bare `{type:'syncStatus'}` frame is also pushed on status changes (`subscribeStatus`) and from `emitSyncStatusFrame`. Renderers that only run frames through `parseSyncEvent` drop the additive frames harmlessly.
- **`ai:event`** — the coordinator's `OperationEvent` stream.
Every send checks `win && !win.isDestroyed()` before `webContents.send`.

### 3.2 View-models (`main/ipc/viewmodels.ts`)

Pure row→VM mappers; the renderer never sees raw OFAPI JSON (DESIGN §3.3). Key guarantees:
- **Media tokenization** (`toRendererMediaUrl`, `viewmodels.ts:30`): a stored value passes through only if `parseMediaToken` recognizes it; anything else (raw remote URL, reversible legacy token, `data:`/`file:`, garbage) maps to `null`. Minting `media://<sha256>` tokens happens at sync time (doc 09) — this pure layer never hands the renderer a fetchable/reversible URL. Applied via `mediaItemToVM` to `thumbUrl`/`fullUrl`.
- **PPV state** (`derivePpvState`): `price>0` only; `purchased`/`not_purchased` only for our own sent messages with a definite `isOpened`, else `unknown`.
- **Fan-waiting** (`deriveFanWaiting`): `unreadCount>0 && !lastMessageIsSentByMe && lastMessageAt!==null`.
- `messageToVM`, `chatToVM` (list-row, carries `lifetimeSpend`/`spend30d`), `chatRowToVM` (single-row, spends null), `accountToVM` (`isAuthenticated = authState !== 'unauthenticated'`), `fanToVM`, `summaryToVM` (`modelLabel` via `getModelDisplayName`), `transcriptForPing`.

### 3.3 Activity aggregation (`main/ipc/activity.ts`)

`buildActivitySummary` (`activity.ts:115`) is the SQL + composition glue for `query:activity.summary` (`ActivityVM`), delegating pure math to `@chatgoose/shared/activity` (`buildCreditLedger`, `buildAiSpendLedger`, `estimateCreditDaysLeft`). It aggregates per-account poll freshness, hub liveness/telemetry (`hubActivity`), pending/quarantined `usage_events`, pending/synced `summaries`, the per-purpose `credit_log`, and the durable `ai_spend_log` (7-day window, `TRAILING_DAYS = 7`). Also exports `sendsToday`, `aiTodayUsd`, `buildFeatureCosts`, `utcDayOf` used by `query:sync.status` and `query:ai.featureCosts`. `mode`/`syncState` treat a `hub === 'live'` status as `hub-live`/`live` regardless of the polling state.

---

## 4. Preload bridge (`main/preload/index.ts` + `contract.ts`)

The preload exposes exactly one object, `window.chatgoose`, via `contextBridge.exposeInMainWorld('chatgoose', bridge)` (`preload/index.ts:35`). `ChatGooseBridge` (`contract.ts:996`) has three members:
- **`platform: string`** — `process.platform`, used only for hotkey *labels* in the renderer.
- **`invoke(channel, args)`** — checks `INVOKE_CHANNELS.has(channel)` (a `Set` of `INVOKE_CHANNEL_NAMES`) and throws `Unknown invoke channel` before calling `ipcRenderer.invoke`. This is the runtime allowlist (SPEC §15.1) preventing a compromised renderer from reaching arbitrary channel strings; it is kept exhaustive at compile time by `INVOKE_CHANNEL_REGISTRY`.
- **`on(channel, listener)`** — checks membership in `EVENT_CHANNELS` (`sync:event`, `ai:event`, `db:changed`), wraps to strip the Electron event object, registers `ipcRenderer.on`, and returns an unsubscribe that calls `removeListener`.

Nothing else is exposed: no `ipcRenderer` handle, no Node primitives, no `send`/`sendSync`, no `removeAllListeners`. Types are shared between main/preload/renderer purely as `type` imports (`contract.ts` is import-free of runtime main code except the channel-name array).

---

## 5. Settings store (`main/settings/store.ts`)

Non-secret settings persist one JSON row per field in the `settings(key, value)` table (doc 09); API keys route to the keychain and never enter the DB or any VM.

### 5.1 Schema, defaults, validation

- **Per-field zod schemas** live in `persistedFieldSchemas` (`store.ts:151`); `PERSISTED_SETTINGS_KEYS` (`store.ts:70`) enumerates the 33 persisted fields; `PERSISTED_DEFAULTS` (`store.ts:215`) gives every default (largely sourced from `@chatgoose/shared` `DEFAULT_SETTINGS`).
- **Read path** (`readField`, `store.ts:376`): reads the row, `safeParse`s it, and on any failure (missing, corrupt, legacy shape) returns a `structuredClone` of the default. This graceful-degradation-per-field is the store's only "migration" mechanism — there is **no versioned settings migration**.
- **Patch path** (`update`, `store.ts:480`): `settingsPatchSchema.parse(patch)` — a **`z.strictObject`** (`store.ts:270`), so any unknown key is rejected. (This is the mechanism behind the "restart dev after settings-schema edits" gotcha: `electron-vite` dev does not reliably restart main, so a newly added field is rejected by the still-loaded strictObject until a full dev restart.)
- **VM shape** (`buildVm`, `store.ts:447`): the persisted fields plus `hasOfapiKey/hasAnthropicKey/hasOpenRouterKey/hasHubKey` (from `secrets.hasSecret`) and `keyMeta` (non-secret fingerprints). `SettingsVM`/`SettingsPatch`/`KeyMetaVM` are defined in `contract.ts:332`/`:494`/`:433`.

### 5.2 Transport / mode flags (SPEC-§9 custody bridge)

| Field | Schema | Default | Meaning |
|---|---|---|---|
| `ofapiReadTransport` | `z.enum(['direct','hub'])` | `'hub'` | OFAPI GET transport; `hub` routes reads through core. Rollback for reads. |
| `ofapiWriteTransport` | **`z.literal('hub')`** (`store.ts:178`) | `'hub'` | **Hard invariant** — the only accepted value is `hub`; all writes go through Hub commands. The direct-write path is fail-closed in `createOfApiTransportClient` (doc 05). |
| `aiGatewayTransport` | `z.enum(['direct','hub'])` | `'direct'` | AI generation transport; `direct` = local provider keys, `hub` = core AI gateway with DirectGateway rollback. |
| `hubModeOverride` | `z.enum(HUB_MODE_OVERRIDE_SETTINGS)` (`auto`/`polling`/`hub`) | `'auto'` | Dev/support-only sync override. |
| `hubBaseUrl` | `hubBaseUrlSchema` | `DEFAULT_AGENCY_HUB_BASE_URL` | Normalized to origin; accepts only the prod hub origin (https) or a loopback dev host (`store.ts:120`). `null` = hub off. |
| `autoReadChats` / `markAsReadOnOpen` | `z.boolean()` | `false` / `false` | Off = the only message-body read is a deliberate open (each OFAPI GET marks the chat read on OnlyFans). |
| `spendSweepRollbackToLegacy` | `z.boolean()` | `false` | Forces the legacy 10-min desktop fan-spend sweep. |
| `unreadReconcile` | `unreadReconcileSettingsSchema` (strict) | see `store.ts:241` | Body-free unread reconcile knobs. |
| `guardConfigTransport` | `z.enum(['local','hub'])` | `'local'` | Guard-policy source seam. |
| `uiLocale`/`uiScale`/`uiTheme` | enums/`0.9|1|1.1|1.25`/theme enum | `'system'`/`1`/`'light'` | UI prefs consumed by `refreshUiPrefs`. |

### 5.3 Secret routing & keyMeta

`SettingsPatch` also carries `ofapiKey`/`anthropicKey`/`openRouterKey`/`hubApiKey` (write-only). `applySecret` (`store.ts:464`) trims, deletes on empty else `setSecret`, and always writes a non-secret `keyMeta` fingerprint (`{last4, setAt}`) into the reserved `keyMeta` settings row via `recordKeyMeta`. Because `queries.set` publishes a settings-bus event that the bare keychain write lacks, this is what drives the redactor/UI-pref refreshes. Special case: if `hubBaseUrl` changes and no `hubApiKey` is supplied in the same patch, the stored hub key is cleared (`store.ts:490`).

---

## 6. Secrets — keychain (`main/secrets/keychain.ts`)

The keychain uses **Electron `safeStorage`** (Keychain on macOS / DPAPI on Windows), **not** keytar. Layout: one encrypted file per secret under `userData/secrets/<name>.secret`, dir mode `0o700`, file mode `0o600` (`keychain.ts:77`). Plaintext exists only in main-process memory.

- **Secret names** (`SECRET_NAMES`, `keychain.ts:10`): the four user-entered keys `ofapiKey`, `anthropicKey`, `openRouterKey`, `hubApiKey`, plus two locally generated keys `dbKey`, `mediaCacheKey`. Names are an allowlisted enum (`secretNameSchema.parse` in `fileFor`, `keychain.ts:57`) so the joined path cannot escape `secretsDir`.
- **API** (`Keychain`): `getSecret` (ENOENT → `null`, else `safeStorage.decryptString`), `setSecret` (throws if `isEncryptionAvailable()` is false — refuses to persist unencrypted), `deleteSecret`, `hasSecret` (non-empty), and `getOrCreateGeneratedKey` (creates a `generateDbKey()` = 32 random bytes as 64 hex chars exactly once, serialized per-name via a `pendingCreates` map so concurrent callers cannot race two different keys).
- **Service/account naming:** there is no OS-service/account tuple — safeStorage is a raw encrypt/decrypt primitive and the "namespace" is the file name. (Cross-ref doc 02 for how these keys map to the external boundaries: `ofapiKey`→OFAPI, `hubApiKey`→core chatter key, `anthropicKey`/`openRouterKey`→AI providers, `dbKey`/`mediaCacheKey`→local at-rest encryption.)

---

## 7. Platform integration (`main/platform/*`)

### 7.1 Auto-updater (`platform/updater.ts`)

- **Policy:** `shouldAutoUpdate(platform, isPackaged)` = `win32 && packaged` only. macOS/dev report `unsupported` in the VM (Squirrel.Mac refuses unsigned updates). The feed is electron-updater's generic HTTPS provider (`electron-builder.yml publish`; ops in `docs/RELEASE.md`) — builds are unsigned, so the feed host being ours is the trust anchor (doc 01/02).
- **Wiring** (`index.ts:startPackagedAutoUpdater`, `:153`): electron-updater is **dynamic-imported** (it drags Electron in at import time) after the boot logger exists, with CJS/ESM interop to find `autoUpdater`. `createUpdateController` is built and `startAutoUpdater` begins the background loop.
- **Controller** (`createUpdateController`, `updater.ts:74`): sets `autoDownload=true`, `autoInstallOnAppQuit=true`, and mirrors the updater event stream (`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`) into a single `UpdateStatus` snapshot (`phase`, `version`, `percent`, `message`). `onReady` fires the quiet "installs when you quit" OS notification. `check()` is used by both the launch/interval loop (`UPDATE_CHECK_INTERVAL_MS = 4h`, `updater.ts:131`) and the Settings "Check now" button; offline/feed failures are captured as the `error` phase (silent for the auto path, surfaced by the manual button). `install()` = `quitAndInstall()`. The IPC layer stamps `currentVersion` onto the snapshot via `updateStatusVM` (`index.ts:128`), reporting `phase:'unsupported'` when no controller exists.

### 7.2 Unread badge (`platform/badge.ts`)

Windows has no dock-badge string API and Electron main has no canvas, so the taskbar overlay is drawn from scratch: `badgeText(count)` → `''`/`'1'..'99'`/`'99+'`; `renderBadgeRgba` rasterizes an anti-aliased clay disc (`--color-clay-deep`) with a white 5×7 pixel-font count; `encodePng` is a minimal hand-rolled RGBA8 PNG encoder (CRC32 + `deflateSync`); `badgePng(count)` caches encoded PNGs (≈101 distinct) and returns `null` to clear. The composition root feeds the buffer to `nativeImage.createFromBuffer` + `win.setOverlayIcon` (Windows) or uses `app.dock.setBadge` with the plain count string (macOS) — see §1.8.

### 7.3 External-link guard (`platform/navigation.ts`)

Pure URL predicates used by `createWindow`/`loadWindowContent`: `isAllowedDevRendererUrl` (http/https on a loopback host — dev renderer only), `isAllowedExternalOpenUrl` (http/https/mailto — the only URLs `shell.openExternal` will receive), and `appendSearchToUrl` (dev `view=` injection). Malformed URLs parse to `null` → denied.

### 7.4 Single-instance (`platform/single-instance.ts`)

`focusExistingWindow(win)` restores-if-minimized then shows + focuses the lock-holding window when a second launch is forwarded (`second-instance`). The lock itself is taken in the composition root (§1.1).

---

## 8. OS notifications (`main/notifications.ts`)

`messageNotificationBody(locale, event)` builds the body for the "new message while hidden" toast: tip → `notif.tip`; otherwise `htmlToPlainText(message.text)` (from `@chatgoose/shared/transcript`) if non-empty; else `notif.media` when media is attached; else `notif.sentYou`. Using `htmlToPlainText` here is the fix for the raw-HTML/empty-body notification bug. All titles/bodies are localized via `uiMessage(uiLocale, …)`. The three notification emitters — new-message (§1.8), credit-budget warning (`budgetGuard.onWarning`, `index.ts:467`), and update-ready (`onReady`, §7.1) — all live in `index.ts` and are gated on `Notification.isSupported()`; new-message additionally on `notificationPrefs.notificationsEnabled` and window not visible/focused.

---

## 9. Diagnostics (`main/diagnostics/*`)

### 9.1 Logger (`diagnostics/logger.ts`)

`createLogger` maintains an in-memory `RingBuffer` (default 1000, drives the export) plus a rotating redacted file `userData/logs/app.log` → `app.1.log` at 2 MB (`logger.ts:105`). Behavior:
- Every record passes through `redactEntry(entry, secrets)` (shared) **before** it is kept or written; `setRedactionSecrets` filters to values ≥6 chars and is refreshed from live key plaintext (§1.5).
- A `code` field of the form `CG-*` is lifted into a dedicated column (`errorCounts` groups error-level records by code / `'uncoded'`).
- Writes are serialized on a promise chain and **swallow all errors** — logging must never throw into a hot path or block on a full/read-only disk.
- `readFileTail` returns the durable on-disk log (rotated file then current, oldest→newest, ≤4000 lines) so a crash from a *prior* session survives into the export. `flush()` awaits the write chain (shutdown/tests). Min level is `info` packaged / `debug` dev with console mirror in dev.

### 9.2 Export report (`diagnostics/report.ts`)

`buildDiagnosticsReport(inputs, secrets)` is pure (no Electron/fs) so shape + redaction are unit-testable. It deep-redacts the assembled `DiagnosticsInputs` (versions, settings-with-keyMeta-stripped, sync/hub/credit status, DB counts, outbox audit counts, guard audit, error counts, log ring, and the on-disk `fileLog`) against the live secret values with `redactValue` (shared) — a final belt-and-suspenders pass because the JSON is meant to leave the machine. The composition root does the gathering and file write (§1.10).

### 9.3 Key self-tests (`diagnostics/key-tests.ts`)

`runKeyTest(provider, deps)` backs the Settings "Test" buttons (`cmd:keys.test`). It reads the **stored** key (never accepting one over IPC), runs a cheap probe, and maps failures through the shared CG-* registry (`toUserFacing`) so the renderer can localize by code; it never returns key material. Per provider: `ofapi` → a throwaway `createOfApiClient().whoami({purpose:'hydration'})` (team-level, uncharged), reporting `team`; `anthropic`/`openrouter` → `probeAnthropicKey`/`probeOpenRouterKey` (doc 08); `hub` → requires `hubBaseUrl` + `hubApiKey` then `probeHubConnection` (returns `username`/`role`/`pages` from `/api/v1/auth/me`, doc 11), else `HUB_NOT_CONFIGURED`. Missing keys return `NOT_CONFIGURED`. Result type `KeyTestResultVM` (`contract.ts:443`).

---

## 10. Cross-cutting notes for the reviewer

- **Trust-boundary validation is layered:** preload channel allowlist (`Set` membership) → main per-handler `zod.parse` → settings `strictObject` → keychain name enum → media-token recognition in view-models. Void-arg handlers skip zod because there is nothing to validate.
- **Lazy-service getters** (§1.7) mean many `cmd:*`/`query:*` handlers can be called before an OFAPI runtime exists; they either throw a specific capability error (`require*`) or degrade to a local-only/empty shape.
- **Actual-vs-name discrepancies noted above:** `sandbox:false` despite SPEC §15 wording (§1.3); CSP lives in the renderer HTML meta, not main headers (§1.4); no deep-link handler despite the task's "deep-link/navigation" framing — navigation is only the in-window guard (§1.1/§1.4); settings has no versioned migration, only per-field default fallback (§5.1); `polling`'s `readTransport` reads a captured snapshot rather than the live settings cache (§1.6).
