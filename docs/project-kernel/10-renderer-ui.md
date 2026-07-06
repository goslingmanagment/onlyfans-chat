> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# 10 — Renderer (React UI)

## Scope

This doc maps `apps/desktop/src/renderer/src/**` — the React UI that runs in Electron's renderer process (or in a plain browser during dev). It covers the entry/shell, the bridge → `@tanstack/react-query` seam, the design system, every feature surface (conversation, AI dock, inbox, spenders, online, vault, fan panel, settings), the zustand state stores, the `lib/` utilities, and the dev mock bridge. It is a structural + data-flow map, not a visual critique.

Boundaries deferred to neighbor docs:
- The **preload contract** (`window.chatgoose`, the `InvokeChannels`/`EventChannels` types, all the `*VM` view-model shapes) is owned by **04-main-bootstrap-ipc-settings.md**. This doc treats the contract as a given and enumerates which channels each surface calls.
- What happens **behind** an IPC channel — the send engine/outbox (07), sync/read selection (06), AI pipeline/coordinator (08), OFAPI client (05), storage (09), hub/usage/spenders-main/online-main (11) — is out of scope. This doc stops at the `getBridge().invoke(...)` / `bridge.on(...)` call.
- The `@chatgoose/shared` modules the renderer imports (i18n catalog, message-guard, protocol parsers, output/reply-output, features policy, theme, constants, activity/spenders helpers) are owned by **03-shared-package.md**.
- Build tooling / the standalone-vite dev harness that boots the mock bridge is owned by **01-overview-build-release.md**.

Every non-trivial claim below is anchored to a repo-relative path and a symbol or line number.

---

## 1. Process/render model and entry

- **Entry**: `apps/desktop/src/renderer/index.html` loads `src/main.tsx`. `main.tsx` imports fonts + `styles/index.css`, calls `bootstrapTheme()` (pre-React paint from a localStorage echo — see §8), calls `installGlobalErrorCapture()` (window-error/unhandledrejection → main log, `lib/clientLog.ts`), then mounts `<App/>` inside `<React.StrictMode>` into `#root` (`main.tsx:21`).
- **App root**: `src/App.tsx` creates one `QueryClient` (`makeQueryClient`, `App.tsx:9`) configured with `staleTime: Infinity`, `refetchOnWindowFocus: false`, `retry: 1` — the deliberate "no polling loops in the renderer; invalidation is event-driven" posture. It wires the event subscription with `useEffect(() => attachBridgeEvents(queryClient), [queryClient])` (`App.tsx:24`) and nests providers: `ErrorBoundary → QueryClientProvider → KeymapProvider → AppShell`.
- **Shell layout**: `src/app/AppShell.tsx`. A flex column: `Titlebar` (top) / a `min-h-0 flex-1` row / `StatusBar` (bottom), plus the always-mounted overlays `CommandPalette`, `HotkeyCheatsheet`, `ToastHost`. The row always renders `AccountRail` (left), then branches on `useUiStore(s => s.view)`:
  - `settings` → `<SettingsSurface/>`
  - `spenders` → `<SpendersSurface/>` (separate full-screen page, no chat list)
  - `online` → `<OnlineSurface/>` (separate flat page)
  - default (`workspace`) → `ChatListPane` (unless `listCollapsed`) + `ConversationPane` + `FanPanel` (unless `panelCollapsed`)
- **Shell-level effects in AppShell** (`AppShell.tsx:34-61`): default-account selection once accounts+settings load (`firstOrderedId`, selection only — never a view switch); mirror notification-relevant settings into `settingsCache`; push the selected account to main via `cmd:sync.focusAccount`; apply the color theme via `applyThemeSetting(uiTheme)` (skipped until settings load to avoid a dark→light→dark flash).

The renderer is one of three processes; it never touches secrets or the network directly (SPEC §15 invariant). All I/O goes through the bridge (§3).

### 1.1 App-shell chrome (Titlebar, StatusBar, ToastHost)

The three chrome pieces `AppShell` mounts around the working area:

- **`src/app/Titlebar.tsx`** — a 46px header. Left: the `Chat`·`Goose` wordmark. Centre: the **only** app-wide search affordance — a `flex-1 max-w-[400px]` button that opens the command palette (`setPaletteOpen(true)`, labelled with the `⌘/Ctrl+K` `Kbd`); it is deliberately elastic (`min-w-0` + truncated placeholder) so it shrinks under width pressure instead of pushing the right badges off-edge (`Titlebar.tsx:19-29`). Right: when an account is selected, its `displayName` badge, appended with a red `· RE-AUTH` marker when `!account.isAuthenticated` (`Titlebar.tsx:31-36`); then a static localized "companion mode" caption. Reads `useAccounts()` + `useUiStore(selectedAccountId)`.
- **`src/app/StatusBar.tsx`** — a 30px footer that is a one-line activity summary (owner-approved 2026-06-11 activity-panel mockup). Its sole data source is `useSyncStatus()` (`query:sync.status` → `SyncStatusVM`). Left→right segments: a **mode pill** (`statusBarMode(...)` → `POLLING` / `HUB LIVE` / `DEGRADED` / `OFFLINE` word + tone dot), an optional **override pill** (`FORCED POLL` / `FORCED HUB` when `hubModeOverride !== 'auto'`), an optional **`HUB AUTH`** pill (when `status.hub === 'auth-failed'`), **credits today + balance** (`creditsUsedToday` / `creditsBalance`), **AI today** (`aiTodayUsd`, `$` fixed-2), **sends** (`sendsToday.sent · sendsToday.unconfirmed`), and right-aligned **freshness** (from `selectStatusAge`, rendered via `<DataAge/>`) plus a `? shortcuts` button opening the cheatsheet (`setCheatsheetOpen(true)`). Every segment is a `<button>` that clicks through to Settings→Activity via `setView('settings')` (`StatusBar.tsx:63`). Labels localize through `useT()`; the mode words stay English in both locales (they are status codes pinned by the mockup test). Tooltips per segment are the Russian `STATUS_BAR_TIPS`.
- **`src/app/statusBarTips.ts`** — two pure exports consumed by `StatusBar`: `STATUS_BAR_TIPS` (the byte-for-byte Russian hover tooltips, sourced from `docs/mockups/experiments/activity-panel.html`, "do not edit without owner sign-off"), and `statusBarMode(state, hub, override)` which maps sync state → `{word, tone, tip}` with precedence **hub `live` → `offline` → forced-`hub` (DEGRADED) → `degraded` → POLLING** (`statusBarTips.ts:43-61`).
- **`src/app/statusAge.ts`** — `selectStatusAge(status, selectedAccountId)`, the pure selector choosing which freshness stamp is primary: in hub `live` mode the primary age is `hubLastEventAt` (kind `'push'`) with the account's list-verified age shown alongside; otherwise the account's `listVerifiedAt` (falling back to `freshness[account]`) is the primary `'list'` age (`statusAge.ts:10-34`). This is the logic locked by the `status-bar` renderer unit test (§11).
- **`src/app/ToastHost.tsx`** — renders `useUiStore(s => s.toasts)` bottom-right (`z-40`, pointer-events gated), auto-dismissing each after `TOAST_TTL_MS = 6_000` via per-toast `setTimeout`s tracked in a ref map; a toast carrying both `accountId` and `chatId` is clickable and calls `selectChat(accountId, chatId)` then dismisses (`ToastHost.tsx:42-53`). Toasts are pushed into the store by the event layer (§3.3 / notification events).

---

## 2. Keyboard-first model, command palette, hotkeys

The renderer is keyboard-first with a single global keymap registry (no scattered listeners).

- **Pure keymap engine**: `src/lib/keymap.ts`. `parseCombo` splits `'mod+k'` etc.; `mod` = metaKey OR ctrlKey (so matching is platform-agnostic). `eventMatchesCombo` compares key/mod/alt/shift (shift is ignored for punctuation via `SHIFT_AGNOSTIC`). `createKeymap(bindings).resolve(ev)` returns the first matching action, applying editable-gating: while focus is in an input/textarea/contenteditable, only bindings with `allowInEditable`, a mod-combo, or Escape fire (`keymap.ts:71-74`).
- **The binding table**: `src/app/keymapBindings.ts`. `buildKeyBindings(platform)` builds the full list; `KEY_BINDINGS = buildKeyBindings(appPlatform())`. Labels are per-platform (`modCombo`), matching is identical. Actions include palette, next/prev/next-unread chat, focus-composer, send, dismiss, toggle-panel/list, cheatsheet, settings, the seven `ai-*` actions + `ai-tone`/`ai-cancel`, `ai-part-0` (⌘0 insert-all), `chat-jump-1..9` (⌘1..9, `hideFromCheatsheet`), and the board-scope keys `board-preview`/`board-open-chat`/`board-back`/`board-stats` (SPACE/O/←/S). `CMD_DESC_KEY` maps each action to a localized catalog key for the cheatsheet; the English `description` strings are left intact so the win==mac description-equality test stays green (`keymapBindings.ts:127-131`).
- **The single listener**: `src/app/KeymapProvider.tsx`. One `useEffect` attaches window `keydown`/`keyup`/`blur` and document `visibilitychange`. `toEventLike` computes `inEditable`. On keydown it (1) updates `navOverlayStore.setModHeld(e.metaKey||e.ctrlKey)` from the live modifier flags (self-healing ⌘1..9 overlay); (2) resolves an action; (3) when an overlay is open, swallows everything except palette/cheatsheet/dismiss; (4) dispatches. It has three dispatch scopes:
  - **Global**: palette, cheatsheet, settings, dismiss (`dismiss` is a priority cascade: close palette → close cheatsheet → close board preview → dismiss AI dock → leave settings/board → blur active element, `KeymapProvider.tsx:105-116`).
  - **Board scope** (`isBoardView` = spenders|online): resolves the active board store via `boardStoreForView` and drives J/K cursor, SPACE preview, O open-chat, ←/back, focus-composer, send (through `sendCurrentDraft`), the three preview AI pills + improve (through `startAiFromPreview`), ai-cancel, and S stats toggle (`KeymapProvider.tsx:144-223`).
  - **Workspace scope**: `chat-jump-N` (jumps via `nthChatId`), next/prev/next-unread chat, toggle panel/list, focus-composer (focuses `COMPOSER_TEXTAREA_ID`), send (`sendCurrentDraft` with the chat's `canSendMessage`), the AI actions (through `startAiFromGlobal`), ai-tone (`cycleDockTone`), ai-cancel.
  - `ai-part-0` (⌘0) is handled before the scope branches: it reads the DB-backed singular chat cache `qk.chat(...)` (not the list cache) for `canSendMessage` and calls `activateDockPart(0, {canSend})` — inserting all parts as a `[NEXT]` sequence, degrading to copy when the chat can't be messaged (`KeymapProvider.tsx:124-140`).
- **Chat data for navigation** is read straight from the react-query cache via `queryClient.getQueryData` (`chatItems`/`findChat`, `KeymapProvider.tsx:55-70`) — paged list first, falling back to the non-paged `qk.chats`.
- **Command palette**: `src/app/CommandPalette.tsx`. The only search surface (there is no list search box). `PaletteBody` builds entries in three sections — Chats (from `useChatSearch` when there's a query, else the first 6 of `useChats(accountId,'all')`), Accounts (`fuzzyFilter` over accounts), and Actions (AI starts routed through `startAiFromGlobal`, plus spenders/online/settings/force-refresh/toggle-panel/toggle-list/show-shortcuts, `CommandPalette.tsx:100-116`). Arrow/Enter navigate a `cursor`; clicking a scrim closes it.
- **Cheatsheet**: `src/app/HotkeyCheatsheet.tsx` renders `KEY_BINDINGS` (minus `hideFromCheatsheet`), the `CHEATSHEET_EXTRAS` collapsed rows (⌘1..9, board keys), and any `UPCOMING_BINDINGS` (currently empty).

---

## 3. The bridge layer

### 3.1 `bridge/bridge.ts` — the accessor

`getBridge()` (`bridge.ts:39`) memoizes a single bridge: `window.chatgoose ?? createMockBridge()`, wrapped by `withFailureLogging`. The wrapper side-observes every `invoke` rejection and mirrors it into the main log via `logClient` (skipping the `CLIENT_LOG_CHANNEL` itself to avoid a logging loop, `bridge.ts:26`). This is the single chokepoint that surfaces IPC failures in the diagnostics export. In plain-vite dev (no `window.chatgoose`) the mock bridge is used (§10).

### 3.2 `bridge/queries.ts` — the query/mutation catalog

All reads flow through `@tanstack/react-query`; keys live in the `qk` object (`queries.ts:42-72`). This is the seam between UI and main. The table below maps each hook → query key → IPC channel. `*` = infinite query; `(m)` = mutation.

| Hook | Query key (`qk.*`) | IPC channel | Notes |
|---|---|---|---|
| `useAccounts` | `accounts` | `query:accounts.list` | |
| `useChats` | `chats(acct,filter)` | `query:chats.list` | `limit:500`, single-page |
| `usePagedChats` * | `chatsPaged(acct,filter)` | `query:chats.list` | page size 500, offset paging |
| `useChat` | `chat(acct,chat)` | `query:chats.get` | |
| `useChatSendability` | `chat(acct,chat)` | `query:chats.get` | **same key as `useChat`**, `select` narrows to `{canSendMessage, canNotSendReason}` |
| `useChatSearch` | `chatsSearch(acct,q)` | `query:chats.search` | `staleTime 10s`, enabled only on non-empty query |
| `useMessages` * | `messages(acct,chat)` | `query:messages.page` | `beforeId` paging; `getNextPageParam` = oldest loaded id |
| `useLoadOlderMessages` (m) | — | `cmd:conversation.loadOlder` | invalidates `qk.messages` on success |
| `useOutbox` | `outbox(acct,chat)` | `query:outbox.list` | optimistic-send rows |
| `useFan` | `fan(acct,fan)` | `query:fan.get` | |
| `useSettings` | `settings` | `query:settings.get` | |
| `usePersonalities` | `personalities` | `query:personalities.list` | |
| `useSyncStatus` | `syncStatus` | `query:sync.status` | |
| `useActivitySummary` | `activity` | `query:activity.summary` | |
| `useGuardConfig` | `guardConfig` | `query:guard.config` | returns `MessageGuardPolicy` |
| `useGuardBlocks` | `guardBlocks(acct?)` | `query:guard.blocks` | `limit 50` |
| `useAiFeatureCosts` | `aiFeatureCosts` | `query:ai.featureCosts` | |
| `useLocalDataStats` | `localDataStats` | `query:localData.stats` | `staleTime 30s` |
| `useKeyTest` (m) | — | `cmd:keys.test` | |
| `useOpenDataFolder` (m) | — | `cmd:localData.openFolder` | |
| `useExportDiagnostics` (m) | — | `cmd:localData.exportDiagnostics` | |
| `useUpdateStatus` | `updateStatus` | `query:updates.status` | **self-polls** `refetchInterval 1000ms` while phase ∈ {checking,available,downloading} (`queries.ts:333-343`) |
| `useCheckUpdates` (m) | — | `cmd:updates.check` | `setQueryData(updateStatus)` |
| `useInstallUpdate` (m) | — | `cmd:updates.install` | |
| `useSpenderLists` | `spendersLists(acct)` | `query:spenders.lists` | `staleTime 5min` (matches main TTL) |
| `useSpenderRoster` | `spendersRoster(acct,list)` | `query:spenders.roster` | |
| `useSpenderUntiered` | `spendersUntiered(acct)` | `query:spenders.untiered` | |
| `useSpenderStats` | `spendersStats(acct)` | `query:spenders.stats` | local-join, 0 credits |
| `useSpendersFreshness` | `spendersFreshness(acct)` | `query:spenders.freshness` | per-scope stamps + active queue |
| `useOnlineSnapshot` | `online(acct,spendersOnly)` | `query:online.snapshot` | `staleTime Infinity` — only changes on explicit refresh |
| `useRefreshOnline` (m) | — | `cmd:online.refresh` | `setQueryData(online(...))` |
| `useVaultMedia` * | `vault(acct,album,q)` | `query:vault.list` | `staleTime 30s` |
| `useVaultAlbums` | `vaultAlbums(acct)` | `query:vault.albums` | `staleTime 60s` |
| `useChatGallery` * | `gallery(acct,chat)` | `query:chat.gallery` | `staleTime 15s` |
| `useUpdateSettings` (m) | — | `cmd:settings.update` | `setQueryData(settings)` + invalidates `syncStatus`,`activity` |
| `useSavePersonality` (m) | — | `cmd:personalities.save` | `setQueryData(personalities)` |
| `useDeletePersonality` (m) | — | `cmd:personalities.delete` | |
| `useSetMapping` (m) | — | `cmd:mappings.set` | invalidates `accounts`,`settings` |
| `usePurgeData` (m) | — | `cmd:data.purge` | invalidates **all** queries |
| `useForceRefresh` (m) | — | `cmd:sync.forceRefresh` | |
| `useReconcileUnread` (m) | — | `cmd:sync.reconcileUnread` | |
| `useRefreshConversation` (m) | — | `cmd:conversation.refresh` | in-chat ↻ |

Feature-local query hooks (defined outside `queries.ts`):

| Hook | Key | Channel | File |
|---|---|---|---|
| `usePingGate` | `['ai-ping-gate',acct,chat]` (`pingGateKey`) | `query:ai.pingGate` | `features/ai/pingGate.ts` |
| (inline `useQueries`) | `spendersRoster(acct,list)` | `query:spenders.roster` | `features/spenders/SpendersSurface.tsx:91-104` (one query per mapped shelf) |

**Direct (non-react-query) invokes** — fire-and-forget commands and one-shot reads not cached by react-query:

| Channel | Caller |
|---|---|
| `cmd:sync.focusAccount` | `AppShell.tsx:48` |
| `cmd:conversation.open` / `cmd:conversation.close` | `ConversationPane.tsx:69,86` |
| `cmd:chat.markRead` | `ConversationPane.tsx:93,95` (open + window-focus) |
| `cmd:chat.typingActive` | `ComposerBar.tsx:110` (throttled) |
| `cmd:message.unsend` | `ThreadRows.tsx:70` |
| `cmd:send.message` | `sendController.ts:45` |
| `cmd:send.ppv` | `ppvSendController.ts:32` |
| `cmd:send.dismiss` / `cmd:send.retry` / `cmd:send.verifyNow` | `OutboxRows.tsx:60,73,88` |
| `cmd:send.cancelSequence` | `ComposerBar.tsx:120` |
| `ai:start` / `ai:cancel` | `aiStore.ts:365,320/395` |
| `cmd:draft.set` / `query:draft.get` | `aiStore.ts:424,471` (per-chat draft persistence) |
| `cmd:ai.feedback` | `aiStore.ts:540,565` (insert/copy instrumentation) |
| `cmd:spenders.hydrate` | `previewActions.ts:49,60` |
| `cmd:spenders.refreshScope` / `cmd:spenders.refreshStop` | `SpendersSurface.tsx:431,433` |
| `query:outbox.audit` | `ActivitySettings.tsx:347` |
| `cmd:localData.exportDiagnostics` | `ErrorBoundary.tsx:46` |
| `cmd:diag.logClient` | `lib/clientLog.ts:21` |

### 3.3 `bridge/events.ts` — main → renderer fan-out

`attachBridgeEvents(queryClient)` (`events.ts:34`) is the single subscription point. It validates every frame with zod (SPEC §15 trust boundary) and **batches invalidations** through `queueInvalidate` with a `FLUSH_MS = 50` debounce (`events.ts:39-52`) — the legacy stream-batching lesson to keep high-frequency typing/presence from thrashing react-query. It subscribes to three channels (defined in the preload contract as `db:changed`, `sync:event`, `ai:event`, `preload/index.ts:8-11`):

- **`db:changed`** → `dbChangedSchema.safeParse` → `dbChangedInvalidationKeysForEvent` (§3.4).
- **`sync:event`** → handles several frame types before the shared `SyncEvent`:
  - `creditBalance` / `syncStatus` frames → invalidate `syncStatus`+`activity`.
  - `spendersRefresh` frames → push live progress into `useSpendersStore.setRefresh`; on terminal `done`/`stopped` it synchronously clears the cached `active` queue via `setQueryData` (so a stale "running" can't flicker back through the 50ms batch) then invalidates `spendersFreshness` (`events.ts:99-125`).
  - Otherwise `parseSyncEvent` (shared) and a big switch (`events.ts:136-206`): `chatListUpdated`, `messageReceived` (invalidates messages/chats/accounts + the ping gate; and if the chat isn't the focused visible one and notifications are on, pushes a toast built from the cached chat list + plays a blip via `lib/sound.ts`), `messageSent`/`ppvUnlocked`/`tipReceived`, `readStateChanged`, `messageDeleted` (only when the frame carries a chatId), `presence` (writes `uiStore.setPresence` with a `PRESENCE_TTL_MS = 5min` expiry + invalidates the fan), `typing` (writes `uiStore.setTyping` with `TYPING_TTL_MS = 5s`), `accountAuthChanged`.
  - Every `SyncEvent` also runs `syncStatusInvalidationKeysForEvent` (§3.4).
- **`ai:event`** → `parseOperationEvent` → `handleAiOperationEvent` (in `aiStore`) first, then on `operation:complete` invalidates `syncStatus`+`activity`+`aiFeatureCosts` (`events.ts:209-220`).

The returned cleanup unsubscribes all three and clears the flush timer.

### 3.4 `dbInvalidation.ts` / `syncInvalidation.ts` — event → key translation (pure)

- `bridge/dbInvalidation.ts` — `dbChangedInvalidationKeysForEvent(event)` maps a scope (`accounts|chats|messages|fans|summaries|settings|outbox|guard`) to the exact query-key prefixes to invalidate. Notable couplings: a `chats` change also invalidates `chat`, `accounts`, and the three spenders keys (roster/untiered/stats) for that account; a `messages`/`fans` change also invalidates spenders; `outbox` also invalidates `sync-status`+`activity`; `settings` invalidates settings+personalities+guard-config; `guard` invalidates guard-config+guard-blocks+activity. Pure and unit-tested.
- `bridge/syncInvalidation.ts` — `syncStatusInvalidationKeysForEvent` currently returns a constant `[['sync-status'],['activity']]` for any sync event type (`syncInvalidation.ts:8-12`). The parameter is typed but unused; the comment explains hub clocks/counters move on every event.

---

## 4. State stores (zustand)

Three shell-level stores plus feature-local stores. The convention (DESIGN §3.6) is **per-field selectors only** — no whole-store subscriptions.

- **`state/uiStore.ts`** — the main UI slice: `view` (`workspace|settings|spenders|online`, boot value from a `?view=` URL param for the dev hook, `uiStore.ts:69`), `selectedAccountId`/`selectedChatId`, `chatFilter`, `listCollapsed`/`panelCollapsed`, `paletteOpen`/`cheatsheetOpen`, `fanPanelTab`, `conversationTab`, transient `typing` and `presence` (TTL'd; `setPresence` sweeps expired entries on write, `uiStore.ts:119-129`), and `toasts` (capped at last 4, `pushToast`). `selectAccount` resets the chat and keeps account-scoped views (spenders/online) but drops others to workspace (`uiStore.ts:95-100`); `setDefaultAccount` is boot-only selection that never navigates; `selectChat` forces `view:'workspace'`.
- **`state/settingsCache.ts`** — a tiny synchronous zustand mirror of the four settings the non-React event layer needs outside react-query (`notificationsEnabled`, `soundEnabled`, `debugMode`, `uiLocale`). Source of truth stays the react-query cache; `AppShell` keeps this in sync via `setFromSettings` (`AppShell.tsx:44`). Read by `events.ts` (toast/sound gating + locale) and `AiDock` (`debugMode`).
- **`state/navOverlayStore.ts`** — a single boolean `modHeld` isolated in its own store so only `NavNumberOverlay` re-renders on modifier hold/release (never `ChatRow`). `setModHeld` returns the same object when unchanged so zustand skips notifying (`navOverlayStore.ts:24`).
- **Feature-local stores**: `features/ai/aiStore.ts` (§5), `features/spenders/spendersStore.ts` + `features/online/onlineStore.ts` (§7, both instances of `createBoardStore`), `features/vault/vaultStore.ts` (§8). Their component-local ephemeral state (dropdown open, drag state, hydrate clocks) lives in `useState` inside the components.

---

## 5. AI dock and generation surfaces (`features/ai/`)

The AI subsystem is the most involved. It is a **per-conversation job model** with an imperative streaming path.

### 5.1 `aiStore.ts` — the store + controller

`useAiStore` (`aiStore.ts:159`) holds a per-operation job registry: `jobsById` (keyed by `operationId`), `jobsByConversation` (`accountId/chatId` → operationId), a `visibleConversationKey`, and a set of mirrored "visible" fields (`op`, `status`, `phase`, `view`, `error`, `spend`, etc.) that reflect the job for the currently visible conversation — kept in sync by `withVisibleFields` (`aiStore.ts:140-148`) so existing component selectors keep working. Plus dock UI state (`toneOverride`, `toneMenuOpen`, `preferSplit`, `partFeedback`, `scanFlashSeq`) and the shared composer `draftText`.

- **Controller entry** `startAiFeature(feature, ctx, opts)` (`aiStore.ts:294`): enforces `MAX_RUNNING_JOBS = 3`, refuses `improve-draft` with an empty draft, cancels/removes any existing job for the same conversation, builds params (`tone`/`mode` for fast-reply, `draftText` for improve, `forceRegenerate`), creates an imperative stream, inserts the job, and fires `ai:start`. `regenerateActiveOperation` re-runs with `forceRegenerate` when the feature's policy `rerunAction === 'refresh'` (Scan/Review). `dismissDock`/`cancelActiveOperation` send `ai:cancel` while running and remove the job.
- **Imperative streaming** (`aiStore.ts:171-229`): each operation gets a `StreamState` (splitter + chunk batcher + a `renderOps` buffer + a `sinkApply`). `createChunkBatcher` batches text at `STREAM_FLUSH_MS = 50` (dockLogic) and feeds `createStreamSplitter` which cuts on `[NEXT]`. `registerStreamSink(operationId, apply)` (`aiStore.ts:220`) lets a component attach a DOM sink and replays the buffer — this is how `StreamingDrafts` renders without React re-rendering per chunk.
- **Frame routing** `handleAiOperationEvent(event)` (`aiStore.ts:575`) — called from `events.ts`. `progress`/`debugPrompt` patch the job; `chunk` pushes into the batcher (never touches React state); `complete` finalizes the stream, derives the view (`deriveDockView`), records spend/profiling, evicts old terminal jobs (`MAX_TERMINAL_JOBS = 24`), and — if the finished op is `fan-summary` and was visible — flashes the Scan tab; hidden completions push a toast (`pushHiddenCompletionToast`). `error`/`discarded` handled similarly.
- **Conversation switch** `handleConversationChange(accountId, chatId)` (`aiStore.ts:445`) — called by both `ConversationPane` and `QuickLook`. Sets `visibleConversationKey` (which job the dock renders), resets `toneOverride`, and swaps the persisted draft: saves the outgoing chat's draft (`cmd:draft.set`, debounced `DRAFT_SAVE_DEBOUNCE_MS = 500` while typing, immediate on switch) and loads the incoming (`query:draft.get`), guarding against stale loads with a `draftLoadSeq`. It does **not** cancel AI — generations keep running across chat switches.
- **Dock part actions** `activateDockPart`/`copyDockPart` (`aiStore.ts:533-571`) — insert (primary) vs copy (secondary / the `canSend===false` degrade), both report `cmd:ai.feedback`.

### 5.2 `dockLogic.ts` — pure dock logic

No DOM/store/IPC. Owns: tone cycling (`cycleTone`/`toggleTone`/`effectiveReplyTone`, `DOCK_TONES`), insert/copy payload selection (`copyPayload`/`insertPayload` with the `[NEXT]` joiner, `resolveDockPartAction`), `deriveDockView` (result → a discriminated `DockView`: `drafts|help|review|scan-pointer|raw`, parsing `parseHelpMeXml`/`parseChatReviewXml` from shared, normalizing reply parts, falling to `raw`), `copyablePartsOf`, `shouldAutoInsertCompactDraft` (compact-dock auto-insert predicate), the AI **gate logic** (`evaluateAiGate` → unmapped/no-key; `hasConfiguredAiTransport` reading direct-vs-hub AI transport; `evaluatePingGate`/`evaluateHiGate`/`deriveHiLocked` deep-pill gates; `PillGate` reason codes), the progress label, `DOCK_FEATURE_LABELS`, the debug-prompt snapshot extractor (`extractPromptBlocks`), and the streaming primitives (`createChunkBatcherWith`/`createChunkBatcher`, `createStreamSplitter`). Densely unit-tested.

### 5.3 Dock UI components

- **`AiDock.tsx`** — `AiDockMount` mounts the dock only while `op !== null`. Two variants: `FullDock` (workspace: header with feature label + progress + cost + ✕, body with `StreamingDrafts` while running or `CompletedView`/`ErrorCard`, footer with tone pills/split toggle + regenerate/cancel + insert-all, and a `debugMode` prompt inspector) and `CompactDock` (spenders preview: one-line strip that **auto-inserts** a single insertable draft into the composer when `shouldAutoInsertCompactDraft` and `completedWhileVisible`, else renders clickable variant chips). Both read the op's chat sendability via `useChatSendability` (unknown chat → defaults to insert). The prompt inspector (`DebugSection`/`PromptDebugBody`/`StageTable`/`TranscriptDebugCard`) renders only under `settingsCache.debugMode`.
- **`StreamingDrafts.tsx`** — the DESIGN §3.4 hot path. A `memo` component that owns only an empty container `<div ref>`; `createDomAppender` builds bubble divs and appends chunk text via direct `Text.appendData` mutation, moving a blinking caret to the live bubble. `[NEXT]` breaks open a new bubble. React never re-renders per chunk.
- **`AiPillRow.tsx`** — the always-visible composer pill row (Reply/Improve/Help/Ping/Hi, order and membership chosen by the `pills` prop from `conversationFeatures`). Reply is a split control (`ReplySplitPill` + `TonePopover`) when `replyTone`, else a plain ⌘R button. Reads accounts+settings+messages to compute the account gate (`evaluateAiGate`), the ping gate (`usePingGate`), the hi gate (`deriveHiLocked` over the loaded message pages), and an external `disabledReason` (preview hydrate block). A blocked account gate renders a "→ Settings" CTA.
- **`AiHeaderMenu.tsx`** — the ✳ AI menu in the conversation header: the rare/deep actions Scan (⌘S → fan-summary) and Chat review (⌘E); Compare is permanently disabled (`P4-STRETCH`). Same account gate + a `messagesLoaded` gate.
- **`TonePopover.tsx`** — pure upward popover for the Reply split menu; picking a tone immediately starts a toned fast-reply via `activateToneFromMenu`. Esc + outside-click close (the parent owns the ref boundary).
- **`gateText.ts`** — resolves the locale-free `PillGateReason` codes from `dockLogic` to localized strings (keeps the AI/LLM path locale-free).
- **`globalStart.ts`** — `startAiFromGlobal(feature, queryClient)`: the single gated entry for AI starts that originate off the pill row/menu (keymap + palette). Reads the caches (settings/accounts/messages/pingGate) directly and applies the SAME gates as the visible buttons; gated invocations are silent no-ops (the coordinator's CG-FLOW-* checks stay authoritative).
- **`pingGate.ts`** — `usePingGate(acct, chat, lastMessageId)`: `query:ai.pingGate`; an effect invalidates the gate whenever `lastMessageId` changes (event-driven refetch, no polling). `pingGateKey` is message-id-free so keymap/palette can read the cached gate.

---

## 6. Conversation surface (`features/conversation/`)

### 6.1 The one shared conversation

The workspace chat and the spenders/online quick-look preview render the **same** `ConversationView` body, parameterized by a `ConversationFeatures` flag map — never `if (preview)` branches scattered in JSX.

- **`conversationFeatures.ts`** — `ConversationFeatures` = `{galleryTab, vault, pills, replyTone, typingIndicator, dock}`. Two presets: `FULL_CHAT_FEATURES` (everything, `pills:[reply,improve,help,ping,hi]`, `dock:'full'`) and `PREVIEW_FEATURES` (galleryTab off, vault on, `pills:[ping,reply,hi,improve]`, `replyTone` off, `dock:'compact'`).
- **`ConversationView.tsx`** — renders body chrome only (tabs / thread / typing indicator / vault / AI dock / pill row / composer). It runs **no** conversation-open side effects (no poll, no mark-read) — that lifecycle is shell-owned. When `chat` is not yet loaded it still mounts the dock + pills (so a running op stays visible) but shows a disabled composer placeholder (`ConversationView.tsx:68-101`). The THREAD/GALLERY tab switch and `showGallery` branch are here; `ThreadRegion` overlays `threadOverlay` (the preview hydrate overlay) on top of the thread.
- **`ConversationPane.tsx`** — the workspace shell. Owns the open/close lifecycle: `cmd:conversation.open` (recording a `historyLoadState` of loading/ready/error from `localCountAfter`) and `cmd:conversation.close` on unmount, `cmd:chat.markRead` on open + window-focus, plus `handleConversationChange` + `resetVaultForConversation` on chat switch. Renders `ConversationHeader`, the unmapped-account gate banner, and `ConversationView(FULL_CHAT_FEATURES)`. Shows loading/empty `EmptyState`s.
- **`ConversationHeader.tsx`** — shell-owned full-chat header: avatar + online dot (live hub presence from `uiStore.presence` wins while fresh, else `isOnline(fan.lastSeen)`), fan name, last-seen, value chips (lifetime/subscription/fan-for, progressively hidden via container-query `@max-[...]:hidden`), the ↻ refresh button (`useRefreshConversation`, in-flight guard scoped to this chat), and `AiHeaderMenu`.
- **`MessageList.tsx`** — a thin shell over `Thread` (stick mode, comfortable density) for the workspace chat.

### 6.2 The virtualized thread

- **`Thread.tsx`** — the shared virtualized thread, used by both surfaces via `scrollMode` (`stick` vs `paged`) and `density` (`comfortable`/`compact`). Uses `@tanstack/react-virtual` (`useVirtualizer`, `Thread.tsx:119`) with per-density `estimateSize` tables and `measureElement` for real heights. `useConversationThread` merges `useMessages` (flattened via `useFlatMessages`) with `useOutbox` through `mergeOutboxRows`+`buildThreadRows`. Behaviors: initial jump-to-latest, a `jumpToLatestKey` re-snap (preview hydrate), scrollback anchoring after older pages prepend, bottom-stick on new tail, and a `ResizeObserver` re-stick when the footer (AI dock / vault) grows and shrinks the thread (`Thread.tsx:219-229`). Scroll-driven older-page loading in stick mode calls `fetchNextPage` then `loadOlderAsync` (`useLoadOlderMessages` → `cmd:conversation.loadOlder`); paged mode uses a button. Empty/loading/error states include a history-load failure card with retry.
- **`ThreadRows.tsx`** — memoized row renderers: `DayDivider`, `TipLedgerRow` (money-green ledger pill), `MessageRow` (asymmetric bubbles, reply-to quote, media count label, PPV chip via `ppvChip`, send-state labels via `sendState`, tombstones, and a two-step inline unsend confirm firing `cmd:message.unsend`). Uses the `--cv-*` density CSS vars.
- **`OutboxRows.tsx`** — `OutboxRow` renders optimistic send bubbles from `deriveOutboxRow` (`sendLogic`): terminal micro-labels QUEUED/SENDING/FAILED/UNCONF. FAILED offers Edit (reload text into composer via `setDraftText`+`appendToDraft`) / Retry (`cmd:send.retry`) / Dismiss (`cmd:send.dismiss`); UNCONF offers Check-now (`cmd:send.verifyNow`) / Dismiss and **never** a resend. CG-OF-05 restricted-word rows highlight substrings via `restrictedSegments`.
- **`MediaThumb.tsx`** — lazy media thumb with skeleton/locked/processing states (used inside message rows; note: `MessageRow` currently renders a text media-count label rather than mounting `MediaThumb` in the bubble — `MediaThumb` is the standalone thumb component).

### 6.3 Composer + send path

- **`ComposerBar.tsx`** — the real send surface. Reads the shared `aiStore.draftText`, `useOutbox` (for the active `[NEXT]` sequence chip via `activeSequence`), `useGuardConfig` (compiled to a `RendererGuardState`), and `useVaultStore` (attach state). Runs a debounced (140ms) guard scan for display highlighting; disables send when `!canSend`, blank, PPV-compose active, or guard-blocked. Fires the throttled `cmd:chat.typingActive` beacon (`createTypingThrottle`, ≤1/3s, 4s idle). 📎 toggles the vault panel; the send button (and ⌘↵) call `sendCurrentDraft`.
- **`DraftTextarea.tsx`** — the textarea (`COMPOSER_TEXTAREA_ID`) with the `GuardHighlightOverlay` behind it.
- **`GuardHighlightOverlay.tsx`** — a transparent, `aria-hidden` overlay that paints category-colored underlines under matched guard spans (`GuardSegment`s), aligned to the textarea text.
- **`composerDom.ts`** — the leaf module exporting `COMPOSER_TEXTAREA_ID` and `focusComposer()` so the keymap layer and aiStore can focus the composer without importing each other.
- **`sendController.ts`** — `sendCurrentDraft`: the shared send path for the button and ⌘↵. Guards: returns if `!canSend`, if vault media is attached (PPV must go through the explicit confirm), if an in-flight send for this chat exists (`inFlight` set — the renderer's one guard against a double-⌘↵ before the invoke resolves), if the draft splits to 0 parts, if `> MAX_SEND_PARTS (10)` (toasts), or if the guard scan of the parts blocks. Then fires `cmd:send.message` with the split parts; clears the draft only if unchanged since accept; never retries (SPEC §15.5).
- **`sendLogic.ts`** — pure: `splitDraftParts` (`[NEXT]` split), `createTypingThrottle`, `restrictedSegments` (CG-OF-05 highlight), `deriveOutboxRow` (state → label/tone/actions), `visibleOutboxItems`/`mergeOutboxRows` (thread merge; optimistic bubbles always below the real thread), and `activeSequence` (the cancel chip). Unit-tested.
- **`guardLogic.ts`** — renderer-side message-guard glue over `@chatgoose/shared/message-guard`: `compileRendererGuardPolicy` (compile the effective policy, `ready`/`unavailable`), a module-level `currentGuard` singleton set by `ComposerBar`/`VaultPanel` and read by the send controllers via `scanDraftPartsForSend`/`scanTextForSend`, plus `verdictToSegments`/`verdictBlocks`/`verdictCategories` for display.
- **`AiDockSlot.tsx`** — the mount point wrapper that gives the full dock its inset margins (renders nothing without children).

---

## 7. Inbox, spenders, online (list surfaces)

### 7.1 Inbox (`features/inbox/`)

- **`AccountRail.tsx`** — the 64px left rail. Reads `useAccounts` + the `accountOrder` setting; `applyOrder` sorts. Drag-to-reorder writes `cmd:settings.update{accountOrder}` via `computeReorder`; refs keep handlers stable so `AccountTile` memoization holds. Renders account tiles (avatar/initials, unread badge, auth-state dot), the online-page button (badge = `useOnlineSnapshot(...).counts.online`, 0 credits), the spenders `$` button, and the settings ⚙ button.
- **`ChatListPane.tsx`** — the ~340px chat list. `usePagedChats` (virtualized, `ROW_HEIGHT = 64`, `useVirtualizer`) with infinite scroll (`fetchNextPage` near bottom); `useChats(acct,'all')` supplies filter-chip counts via `chatFilterCounts`. Filter chips (all/unread/with_tips) drive `uiStore.chatFilter`. An effect auto-fires `reconcileUnread({trigger:'unread-tab'})` when the unread tab opens and the setting enables it. Mounts `NavNumberOverlay` as a sibling of the virtual rows.
- **`ChatRow.tsx`** — memoized 64px row: avatar, fan name + waiting dot + lifetime figure/chip (per `spendStyle`), last-message preview (tone signals who wrote last — no «вы:» label), timestamp (`formatListTime`), an AI-status pill (`selectConversationJob` from aiStore → AI/OK/!), 30-day green inflow, unread badge.
- **`NavNumberOverlay.tsx`** — the ⌘1..9 badge layer. The ONLY subscriber to `navOverlayStore.modHeld`; renders one neutral ink chip over each of the first ≤9 rows while the mod key is held, sharing the virtualizer's scrolled coordinate space. Unmounts entirely on release — the N memoized rows never re-render.

### 7.2 Spenders (`features/spenders/`)

A separate full-screen board page (owner v2). Read-only viewing surface — AI runs only on explicit action inside the quick-look.

- **`spendersStore.ts`** — `createBoardStore()` factory producing a board store (chip filter, expanded shelves, cursor/preview fan, `previewAiBlocked`, `visibleRows`, `statsRows`, `statsExpanded`, live `refresh` progress). `useSpendersStore` is one instance. `previewRow(state)` resolves the open preview's VM (visible rows first, then stats-queue rows). Same shape reused by Online.
- **`boardStores.ts`** — `boardStoreForView(view)`/`activeBoardStore()`/`isBoardView` resolve the active board store by `ui.view`, so the shared keymap/QuickLook/previewActions drive either surface without hard-binding.
- **`boardModel.ts`** — pure view-model. `buildAllView` (tier sections with per-shelf previews, collapsed big tiers, an `UNTIERED_ID` "Без тира" section) and `buildFlatView` (single tier). Produces `BoardItem[]` + a flat `fanRows` J/K pool. Uses shared `shelfPresentation`/`splitTierLabel`.
- **`SpendersSurface.tsx`** — the page. Reads `useSpenderLists` + the account's `spendersListMappings` to build ordered shelves, lazily loads each shelf's roster with an inline `useQueries` (only enabled when the shelf is on-screen with rows), plus `useSpenderUntiered`, `useSpenderStats`, `useSpendersFreshness`. Virtualized item list (`useVirtualizer`, `estimateItem`), publishes `model.fanRows` to the store for the keymap, keeps the cursor on-screen, and renders `StatsPanel` (right column) + `QuickLook` (overlay). `RefreshControls` shows the per-scope freshness line + the pre-click credit cost and drives `cmd:spenders.refreshScope`/`cmd:spenders.refreshStop`; live progress reads the store's `refresh` (fed by `spendersRefresh` frames) plus the freshness query's `active` as a mount-time fallback; a 2px hairline bar shows progress.
- **`SpenderRowItem.tsx`** — memoized spender row (lifetime, 30d green inflow, author-prefixed preview, silence dot + МОДЕЛЬ/ФАН day counters). An `onlineLabel` prop swaps the right column for «онлайн N мин» — the only per-row difference vs Online.
- **`StatsPanel.tsx`** — the stats column (compact 300px default, or a full 2-col grid when `statsExpanded`). All from `useSpenderStats` (one local-join query, 0 credits): revenue KPIs + a daily bar chart, by-shelf revenue, reactivation radar (warm/hot counts), waiting/new-spender fan lines. Publishes its queue rows to `store.setStatsRows` so a preview opened from a queue resolves. Clicking a tier sets the board chip; clicking a fan opens the preview. Loading renders skeletons mirroring the final layout.
- **`QuickLook.tsx`** — the quick-look overlay (modal chrome + read-only lifecycle). The body is the shared `ConversationView(PREVIEW_FEATURES, density:compact, scrollMode:paged)`. It is the active conversation while open (draft load/persist + visible AI job via `handleConversationChange`) but runs no aggressive poll and no mark-read. On open it hydrates one read-only tail via `hydratePreviewFan` → `cmd:spenders.hydrate` (main's per-fan 5-min TTL is the spend ceiling), tracking a hydrate phase/clock and deriving overlay + AI-block reasons via `previewHydrateStatus.ts`. Refresh (`useRefreshConversation`) and "open full chat" (`ensureAndOpenPreviewChat`) live here. `PreviewStatusChips` reuses the same presence/subscription source as the full header.
- **`previewActions.ts`** — quick-look helpers: `hydratePreviewFan`/`ensureAndOpenPreviewChat` (`cmd:spenders.hydrate`), `focusPreviewComposer` (shared composer id), and `startAiFromPreview(feature, queryClient)` — the gated preview-AI entry (same gate logic as the pill row; blocked when `previewAiBlocked` matches the fan).
- **`previewHydrateStatus.ts`** — pure: `deriveHydrateStatus` (overlay visibility + i18n keys from phase/messageCount/ttl/local-history) and `derivePreviewAiBlockReason` (why the preview AI pills are blocked during hydrate/refresh).

### 7.3 Online (`features/online/`)

- **`onlineStore.ts`** — a second `createBoardStore()` instance (`useOnlineStore`); the tier-only fields lie dormant.
- **`onlineModel.ts`** — pure `sortOnlineRows(rows, 'spend'|'recent')` (client-side reorder of the cached snapshot, 0 credits).
- **`OnlineSurface.tsx`** — the flat online page. `useOnlineSnapshot` (staleTime ∞, only changes on explicit refresh); `useRefreshOnline` (`cmd:online.refresh`, 1 credit/page) is the only OFAPI call. A "Только спендеры" toggle and spend/recent sort tabs write settings (`onlineOnlySpenders`/`onlineSort`). Virtualized flat list of `SpenderRowItem` (with `online` + `onlineLabel`), publishes `fanRows` to the store, reuses `QuickLook` with `useOnlineStore`. A render-only `UpdatedAgo` clock ticks without triggering any query (no-poll invariant).

---

## 8. Vault / gallery, fan panel, settings

### 8.1 Vault (`features/vault/`)

- **`vaultStore.ts`** — per-conversation UI slice (open, album, search, ordered `selection`, `priceInput`). `resetVaultForConversation()` resets it on chat switch (called by `ConversationPane`/`QuickLook`).
- **`vaultLogic.ts`** — pure PPV compose logic: ordered multi-select with a `previews ⊆ selection` invariant (`toggleSelect`/`togglePreview`/`selectionOrder`), price parsing/validation (`parsePpvPrice`, whole dollars 3–200 mirroring the engine, `PPV_PRICE_MIN/MAX`), the mandatory `deriveComposeSummary` misprice guard, `mergeGalleryPages` (dedupe by messageId), `galleryBadge`, `chunkRows`.
- **`VaultPanel.tsx`** — the dock-style attach panel above the composer (not a modal). Album chips + search, a virtualized 6-col thumb grid (`useVirtualizer`, `useVaultMedia`/`useVaultAlbums`), ordered select with FREE/🔒 preview toggles, a live guard scan, and the mandatory PPV compose-summary strip whose confirm button restates the price in words. Confirm calls `sendPpvCompose`.
- **`ppvSendController.ts`** — `sendPpvCompose`: the only caller of `cmd:send.ppv`. Same in-flight guard as `sendController`; re-derives the summary, runs the guard scan, sends, clears the draft (if unchanged) + resets the vault.
- **`GalleryTab.tsx`** — the chat media gallery (replaces the thread when the GALLERY tab is active): `useChatGallery` infinite query → merged pages → virtualized 4-col grid of `GalleryCell` with PPV badges.

### 8.2 Fan panel (`features/fan-panel/`)

- **`FanPanel.tsx`** — the collapsible right panel with Info / Scan tabs. `useFan` supplies data. `InfoTab` shows identity, spending stats, subscription (with churn-risk badge), about, and a `DataAge` stamp. `ScanTab` is the home of the AI fan dossier: renders `fan.summary` (Russian body split by `splitSummaryParagraphs`), a generated-at/model line, a refresh action (`startAiFeature('fan-summary', …, {forceRegenerate})`), and a quiet stale hint (`isScanStale`). `useScanFlash` briefly highlights the tab when a Scan completes (driven by `aiStore.scanFlashSeq`).
- **`scanLogic.ts`** — pure `splitSummaryParagraphs` + `isScanStale`.

### 8.3 Settings (`features/settings/`)

- **`SettingsSurface.tsx`** — a modal-free own-view page with a sticky scrollspy nav (`SettingsNav`, rAF-throttled scanline, click-pin) and card sections. Exports `Section`, `MESSAGE_COUNT_FIELDS`, `REASONING_EFFORTS`, `PatchFn`. `SettingsBody` wires each section with a shared `patch` (`useUpdateSettings` + a saved-flash toast). Sections rendered in order: Activity, Keys, Hub, Models, Personalities, Behavior, Spenders, Local data (DangerZone), Updates.
- **`sections/ActivitySettings.tsx`** — the read-only activity dashboard (`useActivitySummary` → `ActivityVM`): a data-flow block (Messages/Hub/AI/Sends rows with ticking ages), a "Run outbox audit" action (`query:outbox.audit` → `AuditReport`), a credits ledger (incl. a core-credits line), and an AI-spend ledger. All copy via i18n; status badges stay English.
- **`sections/KeySettings.tsx`** — set-only key inputs (OFAPI/Anthropic/OpenRouter). Keys never round-trip to the renderer; shows non-secret `{last4,setAt}` fingerprints and a per-row Test (`useKeyTest` → `cmd:keys.test`, localized by CG-* code).
- **`sections/HubSettings.tsx`** — hub base URL + chatter key (one combined patch), the OFAPI **reads** transport toggle (direct/hub), the AI-gateway transport toggle (direct/hub), a **writes** row that is a fixed "hub" badge (Direct write path removed), per-account page-label overrides, live stream status, and a Test (`cmd:keys.test('hub')`, locked while the form is dirty).
- **`sections/ModelSettings.tsx`** — per-feature model + reasoning-effort selects (`MODEL_GROUPS` from the shared registry), each row showing its trailing-7-day cost (`useAiFeatureCosts`), plus the context message-count fields with valid ranges and token hints.
- **`sections/PersonalitySettings.tsx`** — personalities CRUD (`usePersonalities`/`useSavePersonality`/`useDeletePersonality`) + account→personality mapping (`useSetMapping`); unmapped accounts get an "AI disabled" badge.
- **`sections/BehaviorSettings.tsx`** — toggles (notifications/sound/auto-read/prompt-caching), language (`UI_LOCALE_SETTINGS`), UI scale (`0.9|1|1.1|1.25` — the renderer only persists the value; **main** applies it via `webContents.setZoomFactor`, `main/index.ts:286`), theme (`UI_THEME_SETTINGS`), spend-style previews (real `ChatRow` markup), and an Advanced block (debug mode, the full `unreadReconcile` matrix, and — shown only when already non-default — the `hubModeOverride` debug control + `spendSweepRollbackToLegacy`).
- **`sections/SpendersSettings.tsx`** — per-account ordered mapping of OnlyMonster user-lists → board shelves (`useSpenderLists`, gated on OFAPI read access), with add/remove/reorder writing `spendersListMappings`.
- **`sections/UpdateSettings.tsx`** — manual "check now" / live download progress / "restart & install" (`useUpdateStatus`/`useCheckUpdates`/`useInstallUpdate`); off packaged win32 the phase is `unsupported` and shows a note.
- **`sections/DangerZone.tsx`** — cache footprint (`useLocalDataStats`), open-folder / export-diagnostics shortcuts, and the arm→type-"purge"→confirm purge flow (`usePurgeData`).

---

## 9. Design system, styles, theme, i18n, lib

### 9.1 `design/` — the component kit

Small presentational primitives, all reading CSS-variable color tokens (never per-component dark styling): `Avatar` (initials/img with broken-image fallback + online dot), `Badge` (`BadgeTone` variants incl. `green-filled`/`seen`), `Button` (`primary|ghost|subtle|danger`), `Chip` (ink-on-ivory inversion), `DataAge` (ticking "UPDATED 12S AGO" leaf — 1s interval re-renders only itself), `EmptyState`, `Kbd` (styled `<kbd>` via base CSS), `ListRow` (palette/settings rows), `Skeleton`/`SkeletonRows`/`SkeletonThread`, `Toast`, `Tooltip` (pure CSS hover bubble). `cx` is the class-join helper.

### 9.2 `styles/index.css` + theme

- `styles/index.css` — imports Tailwind v4, defines the design tokens in `@theme` (surfaces/text/clay/green/amber/semantics/bubbles/typography/radii/shadows), the `.dark` override block (a pure variable swap; the `.dark` class lands on `<html>`), the conversation `--cv-*` density tokens (`:root` comfortable, `[data-density='compact']` compact), base element styling (kbd, scrollbars), and the `@utility` classes `cap`/`num`/`media-stripes`/`ai-caret` plus the `ai-caret-blink`/`tone-pop` keyframes.
- `lib/theme.ts` — `bootstrapTheme()` paints from a localStorage echo (`chatgoose.uiTheme.resolved`) before React mounts (avoids a light flash for dark users); `applyThemeSetting(setting)` resolves via `resolveUiTheme` (shared) + `matchMedia`, toggles the `dark` class, writes the echo, and (for `'system'`) subscribes to OS scheme flips. No component reads the theme directly. `AppShell` drives `applyThemeSetting`; **main** also sets `nativeTheme.themeSource` (04).

### 9.3 `lib/` utilities

- **`i18n.ts`** — the renderer binding for the shared UI catalog: `useLocale` (resolves `settings.uiLocale` against `navigator.language`), `useT` (memoized `makeTranslator`), `currentLocale` (for non-React consumers, reads `settingsCache`), `localeTag`, `localizedErrorText` (CG-* code → catalog or wire fallback).
- **`money.ts`** — `formatDollars`/`formatWholeDollars`/`formatLedgerAmount` (OFAPI amounts are dollars, never mills).
- **`time.ts`** — pure, deterministic (explicit `now`): `formatClock`, `formatListTime`, `formatDayLabel`, `dayKey`, `formatAgeShort`, `formatLastSeen`/`isOnline` (5-min online window), `onlineMinutes`. Human labels take an injected translator.
- **`messages.ts`** — thread shaping: `buildThreadRows` (day dividers + tip/message rows), `ppvChip`, `sendState`, `canUnsend` (24h window), `mediaCountLabel`, `initialsOf`. Pure, unit-tested.
- **`filters.ts`** — chat filter + keyboard-nav selectors: `chatMatchesFilter`/`applyChatFilter`/`chatFilterCounts`, `sortChatsByRecency`, `nextChatId`/`nthChatId`/`nextUnreadChatId`. Reused by the mock bridge for parity.
- **`fuzzy.ts`** — subsequence `fuzzyScore`/`fuzzyFilter` for the palette.
- **`order.ts`** — account-rail ordering: `applyOrder`/`firstOrderedId`/`arrayMove`/`computeReorder`. Pure, unit-tested.
- **`modKey.ts`** — the label platform seam: `appPlatform()` (reads `window.chatgoose.platform`, else `navigator.platform`, else darwin), `modKeyLabel`, `modCombo` (⌘K on darwin, Ctrl+K elsewhere). Matching stays platform-agnostic in `keymap.ts`.
- **`sound.ts`** — `playNotificationBlip` (synthesized WebAudio blip, no assets/network, self-silencing).
- **`cx.ts`** — class join.
- **`clientLog.ts`** — `logClient` (fire-and-forget → `cmd:diag.logClient`, self-silencing) and `installGlobalErrorCapture` (window error + unhandledrejection → the main log).

---

## 10. Dev mock bridge (`dev/mockBridge.ts`)

`createMockBridge()` (1805 lines, `mockBridge.ts:624`) is the fallback bridge used when `window.chatgoose` is undefined (plain-vite dev / browser UI verification). It returns a `ChatGooseBridge` with `platform`, an `async invoke(channel,args)` that sleeps 30–100ms (to exercise skeletons) then dispatches to a `handlers` map covering the full `InvokeChannels` surface, and an `on(channel,listener)` backed by a per-channel `Set` of listeners with `emit` (`mockBridge.ts:635`). It builds a deterministic fixture corpus (seeded `mulberry32` RNG, `buildStore`), inline-SVG media data-URIs (no network), and drives periodic `emit` of `db:changed`/`sync:event`/`ai:event` frames via `setInterval` (`pollTick` 8s, `syntheticIncoming`) so live UI behaviors (freshness ticks, toasts, typing, unread churn, streaming AI ops with the `[NEXT]` splitter, outbox state transitions) run without Electron. It reuses `lib/filters` and `lib/fuzzy` so dev filtering/search matches real semantics. It also runs the shared message-guard (`assertMockGuardAllowed`) on `cmd:send.message`/`cmd:send.ppv`. See 01 for how the standalone vite config boots this.

---

## 11. Tests (`apps/desktop/tests/renderer/`)

Vitest unit tests cover the pure renderer logic (not components): `filters`, `fuzzy`, `guard-logic`, `keymap-bindings`, `keymap`, `messages`, `mod-key`, `nav-overlay-store`, `order`, `send-logic`, `status-bar`, `sync-invalidation`, `time`. (Additional AI/vault logic tests live under sibling `tests/renderer-ai/` and `tests/vault/`, referenced by `dockLogic`/`scanLogic`/`vaultLogic` comments.)

---

## 12. Cross-cutting notes and name/behavior discrepancies

- **`useChat` and `useChatSendability` share the query key `qk.chat(acct,chat)`** (`queries.ts:132,222`) — `useChatSendability` only differs by a `select`. Both are populated by whichever mounts first; the keymap's ⌘0 handler deliberately reads this DB-backed singular cache (not the chat-list cache) for `canSendMessage` because the spenders-preview fan is often absent from the list cache (`KeymapProvider.tsx:130-139`).
- **`syncInvalidation.ts` ignores its event argument** — it always returns `[['sync-status'],['activity']]` regardless of the sync event type (`syncInvalidation.ts:9`). The `_event` parameter is vestigial; every sync event refreshes the same two aggregates.
- **`AiDockSlot.tsx` comment says "P2 … Renders nothing until given children"** — accurate, but the dock has since grown (streaming, compact variant); the slot is now just the margin wrapper for the full dock, while `AiDockMount` chooses full vs compact.
- **UI scale is set in the renderer but applied in main** — `BehaviorSettings` persists `uiScale`, and `main/index.ts` applies it via `webContents.setZoomFactor`; the renderer itself does not scale (04).
- **`db:changed` scope `guard` and `settings` overlap** — a `settings` change invalidates `guard-config` (among others), and a dedicated `guard` scope also exists; both paths keep the composer's compiled guard fresh (`dbInvalidation.ts:77-84`).
- **"No polling loops in the renderer" has two deliberate exceptions**: `useUpdateStatus` self-polls at 1s while an update is in flight (no db signal drives it, `queries.ts:340`), and several leaf "age" clocks (`DataAge`, `RefreshControls`, `UpdatedAgo`, activity ticks) run 1–30s `setInterval`s that re-render only themselves and never trigger a query/IPC call.
- **`MessageRow` renders a text media-count label, not `MediaThumb`** — `MediaThumb.tsx` exists as the standalone lazy-thumb component but the thread bubble currently shows `mediaCountLabel(...)` text (`ThreadRows.tsx:103-114`); the actual media grids live in `VaultPanel`/`GalleryTab`.
