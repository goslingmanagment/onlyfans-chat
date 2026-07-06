> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Renderer UI (apps/desktop/src/renderer)

The React 19 renderer. It holds no secrets, makes no direct network calls (CSP
`connect-src 'self'`), and never sees raw OFAPI JSON or CDN URLs — it reads narrow
view-models and `media://` tokens over the `window.chatgoose` bridge (`04`). Reads flow
through TanStack Query; live push arrives on three IPC channels and is turned into query
invalidations; UI state lives in per-field zustand stores. Tailwind v4 with a CSS-variable
theme.

## Composition — `main.tsx → App.tsx → AppShell.tsx`

- `main.tsx` imports fonts + `styles/index.css`, calls `bootstrapTheme()` before first paint
  and `installGlobalErrorCapture()`, renders `<StrictMode><App/></StrictMode>` into `#root`.
- `App.tsx` builds one `QueryClient` (`staleTime: Infinity`, `refetchOnWindowFocus: false`,
  `retry: 1` — event-driven, no refetch loops); tree `ErrorBoundary > QueryClientProvider >
  KeymapProvider > AppShell`; `attachBridgeEvents(queryClient)` wires the single event
  subscription.
- `AppShell.tsx` reads `view`/collapse flags/`selectedAccountId` from `uiStore`; the middle row
  is `AccountRail` + a **surface switch on `view`**: `'settings'`→`SettingsSurface`,
  `'spenders'`→`SpendersSurface`, `'online'`→`OnlineSurface`, default `'workspace'`→
  `{ChatListPane} + ConversationPane + {FanPanel}`. There is **no router library** — `AppView
  = 'workspace'|'settings'|'spenders'|'online'` is pure `uiStore.view`. Floating chrome:
  `CommandPalette`, `HotkeyCheatsheet`, `ToastHost`.

## State layer — `bridge/` + `state/`

- **`bridge/bridge.ts`:** `getBridge()` caches `withFailureLogging(window.chatgoose ??
  createMockBridge())` — the real preload bridge in Electron, the dev mock in plain vite. Every
  failed invoke is logged via `logClient` (the single chokepoint mirroring renderer IPC
  failures into the exported diagnostics), skipping the log channel to avoid a loop.
- **`bridge/queries.ts`:** all reads via TanStack Query; a `qk` key factory; most hooks
  `staleTime: 0` (event-driven), with exceptions (`useChatSearch` 10s, `useSpenderLists` 5min =
  the main TTL, `useOnlineSnapshot` **Infinity**, vault 30/60/15s). The **only** `refetchInterval`s
  are `useHarvestStatus` (2s while running) and `useUpdateStatus` (1s while checking/available/
  downloading). Mutations do optimistic `setQueryData` + targeted invalidations.
- **`bridge/events.ts`:** `attachBridgeEvents(queryClient)` — the single event subscription,
  zod-validating frames and **batching invalidations ≤1 flush / 50ms**. Subscribes all three
  channels: `db:changed`→`dbChangedInvalidationKeysForEvent`; `sync:event`→additive
  `creditBalance`/`syncStatus`/`spendersRefresh` frames first, else `parseSyncEvent`→a switch on
  the 10 SyncEvent types (`messageReceived` also refreshes the ping gate and, if the chat isn't
  focused, pushes a toast + sound; presence/typing write TTL'd `uiStore` entries); `ai:event`→
  `parseOperationEvent`→`handleAiOperationEvent`, then invalidates status/activity/featureCosts
  on complete.
- **`bridge/dbInvalidation.ts`:** the pure map from a `db:changed` scope to query keys — this is
  how push events keep renderer data fresh (**invalidation on push, never polling**); a `chats`
  change fans out to chat-list + chat + accounts + all spenders keys + online, etc.
- **`state/uiStore.ts`:** the main UI slice (`view`, selection, `chatFilter`, collapse flags,
  palette/cheatsheet, `fanPanelTab`, `conversationTab`, TTL'd `typing`/`presence`, capped
  `toasts`); `selectChat` forces `workspace`+`info`+`thread`; `setDefaultAccount` never
  navigates. `state/settingsCache.ts` is a tiny synchronous mirror of notification/sound/debug/
  locale for the non-React event layer. `state/navOverlayStore.ts` is one `modHeld` boolean so
  ⌘/Ctrl hold re-renders only the nav overlay.

## Feature surfaces (`features/`)

### Inbox
- **AccountRail** (64px): drag-reorders accounts (persists `accountOrder`), an online-now button
  (green dot + count from the cached snapshot), a `$` Spenders button, a `⚙` Settings button;
  `AccountTile` shows initials/avatar, unread badge, auth-state dot.
- **ChatListPane** (340px): filter chips `all|unread|with_tips`; virtualized (`ROW_HEIGHT=64`,
  `@tanstack/react-virtual`) with infinite paging (page 500); fires `reconcileUnread` when the
  unread tab opens; footer hints `J/K`, `⌘U`, `⌘1–9`.
- **ChatRow** (memoized 64px): lifetime spend beside the name (figure or chip per `spendStyle`,
  only when >0), 30-day net `+$N` green, whose-turn tone signal, and an AI/OK/! badge from the
  conversation job. **NavNumberOverlay** paints ≤9 nav chips only while `modHeld`.

### AI (`features/ai/`)
- **aiStore.ts** — per-conversation job lifecycle (a generation keeps running when you switch
  chats; the dock renders the visible conversation's job). Caps `MAX_RUNNING_JOBS=3`,
  `MAX_TERMINAL_JOBS=24` (LRU). **Per-chunk frames never touch React state** — each op has an
  imperative stream buffer. Controller: `startAiFeature` (crypto.randomUUID op id → `ai:start`),
  `regenerateActiveOperation` (`forceRegenerate`), `cancelActiveOperation` (`ai:cancel`). Draft
  persistence: `cmd:draft.set` debounced 500ms + `query:draft.get` on chat load. `activateDockPart`/
  `copyDockPart` do insert-vs-copy + `cmd:ai.feedback` instrumentation.
- **dockLogic.ts** — pure: tone cycle (`none→casual→flirty→upsell→spicy`); insert is primary
  (`INSERT_SEQUENCE_JOINER='\n[NEXT]\n'`, inserts when `canSend` else copies); `deriveDockView`
  → drafts/help/review/scan-pointer/raw; gating `hasConfiguredAiTransport = hubBaseUrl !== null
  && hasHubKey`; ping/hi gate reasons; a `[NEXT]` stream splitter.
- **AiDock.tsx / AiPillRow.tsx / AiHeaderMenu.tsx** — the floating/compact dock, the composer
  pill row (`reply/improve/help/ping/hi` with `⌘R/I/H/P/G` and the tone popover on reply), and
  the header ✳ menu (Scan `⌘S` fan-summary, Chat review `⌘E`; Compare gated). **StreamingDrafts**
  is the DESIGN §3.4 hot path — chunk flushes append via direct text-node mutation inside
  imperatively-created bubbles; React owns only the empty container.

### Conversation (`features/conversation/`)
- **ConversationView** is the ONE shared conversation body for both the full chat and the
  Spenders/Online quick-look preview; the difference is a single `features` flag
  (`conversationFeatures.ts`: `FULL_CHAT_FEATURES` vs `PREVIEW_FEATURES`) and an orthogonal
  `density` axis. It mounts the AI dock + pills even when `chat===null`.
- **ConversationPane** owns the full-chat lifecycle (`cmd:conversation.open/close/refresh/
  loadOlder`, aggressive poll on open, `cmd:chat.markRead` on open + focus). **Thread** is the
  virtualized thread (stick-to-bottom + scroll-driven older-page pagination). **OutboxRows** show
  optimistic send bubbles with QUEUED/SENDING/FAILED/UNCONF labels — failed rows Edit/Retry/
  Dismiss, unconfirmed rows Check-now/Dismiss, **never a resend**.
- **ComposerBar** — the real send surface: `DraftTextarea` bound to `aiStore.draftText`, a typing
  beacon (`cmd:chat.typingActive`), debounced guard scanning + block banner, send disabled when
  `!canSend || blank || ppvComposeActive || guardBlocked`; send via `sendController.sendCurrentDraft`
  (an `inFlight` set prevents double-send; `splitDraftParts` on `[NEXT]`, `MAX_SEND_PARTS=10`).
  **guardLogic.ts** is the renderer wrapper over `@chatgoose/shared/message-guard`.

### Fan panel / online / spenders / vault
- **FanPanel** (328px, `]`): Info/Scan tabs; the Scan tab is the AI fan dossier (`fan-summary`)
  with Russian serif body, model label, refresh, and a gated run button (`⌘S`).
- **OnlineSurface** (variant C) — a separate flat-list page, populated **on demand** by
  `cmd:online.refresh` (one read-only `/fans/active` GET); reads `useOnlineSnapshot` (0 credits,
  staleTime ∞); «Только спендеры» toggle + `spend`/`recent` sort; reuses `QuickLook` with
  `useOnlineStore`.
- **SpendersSurface** — a separate page; tier-section vs flat views; lazy roster loading; a
  0-credit local `StatsPanel` (revenue/by-shelf/reactivation radar/waiting/new); `RefreshControls`
  drive `cmd:spenders.refreshScope/refreshStop` with a cost-on-button and per-scope age.
  **QuickLook** is the shared `ConversationView` (`PREVIEW_FEATURES`, compact/paged/read-only) —
  the preview IS the active conversation while open but runs no aggressive poll and no mark-read;
  every open hydrates via `cmd:spenders.hydrate`.
- **Vault & PPV** (`features/vault/`) — **VaultPanel** is a dock-style attach panel above the
  composer (album chips + search → 6-col thumb grid → PPV compose summary → confirm restating the
  price in words); **vaultLogic.ts** validates whole-dollar PPV prices 3–200; **ppvSendController**
  is the ONLY caller of `cmd:send.ppv`. **GalleryTab** is the chat media gallery.

### Settings (`features/settings/`)
`SettingsSurface` is a modal-free own view with a scrollspy nav; sections `activity, hub,
personalities, behavior, spenders, data (Danger Zone), updates`. **ActivitySettings** shows the
read-only data-flow / OFAPI-credit / AI-spend ledgers + the outbox audit (mode badges
POLLING/HUB LIVE/KERNEL/OFF stay English). **HubSettings** collects base URL + chatter key
(write-only `hubApiKey`), the one-time device-token sign-in (`cmd:hub.issueDeviceToken`),
per-account page-label overrides, and "Test connection" (`cmd:keys.test`). **PersonalitySettings**
does personas CRUD + account→personality mapping. **BehaviorSettings** holds toggles, language/
scale/theme chips, and a dev-only Advanced block (`unreadReconcile`, `hubModeOverride`,
`spendSweepRollbackToLegacy`). **DangerZone** holds cache stats, export-diagnostics, the Stage-12
harvest controls, and the arm→type-`purge`→confirm data purge. **UpdateSettings** is the manual
update control (`unsupported` on non-win32).

## App chrome (`app/`)
- **CommandPalette** (`⌘K`) — the only search surface (Chats via `query:chats.search`, Accounts
  fuzzy, Actions incl. AI starts).
- **KeymapProvider** — the ONE window-level keydown listener (`createKeymap(KEY_BINDINGS)`),
  driving `navOverlayStore.modHeld`; an editable-input gate; a board scope (spenders+online share
  J/K/SPACE/O/S) and a workspace scope (`⌘1–9` chat-jump, `J/K`, `⌘U`, `⌘↵` send, AI hotkeys).
  **keymapBindings.ts** is the single hotkey table.
- **StatusBar** — one-line activity summary (mode word POLLING/HUB LIVE/DEGRADED/OFFLINE, credits,
  AI-today `$`, sends/unconfirmed, data-age); every segment has a Russian tooltip and clicks
  through to Settings→Activity. **Titlebar**, **ToastHost** (`TOAST_TTL_MS=6000`, click selects
  chat), **HotkeyCheatsheet** (`?`), **ErrorBoundary** (class component; export-diagnostics card).

## Design system (`design/`) & lib (`lib/`)
- `design/*`: `Avatar, Badge, Button, Chip, DataAge, EmptyState, Kbd, ListRow, Skeleton, Toast,
  Tooltip` — small, memoized, token-styled primitives (Tooltip is CSS-only).
- `lib/*`: `filters` (chat filter + keyboard nav selectors), `fuzzy` (⌘K), `i18n` (`useT`,
  `localizedErrorText`), `messages` (`buildThreadRows`, `sendState`, `canUnsend` 24h), **`money`**
  (dollars, never mills — `formatWholeDollars` `$1,284`, `formatLedgerAmount` `+$25.00`), `order`
  (account-rail reorder), `sound` (WebAudio blip, **no network**), `theme` (`bootstrapTheme`/
  `applyThemeSetting`, toggles `.dark` on `<html>`), `time` (UTC-safe formatters), `modKey`
  (platform label only; matching is platform-agnostic — reads `window.chatgoose.platform`, else
  navigator, else darwin), `clientLog` (`logClient` → `cmd:diag.logClient` + global error
  capture).

## Styles & theming (`styles/index.css`)
Tailwind v4 `@theme` block defines all design tokens as CSS variables (surfaces, ink, terracotta
`clay`, money `green`, semantics, bubbles, fonts Hanken Grotesk / Source Serif 4 / IBM Plex Mono,
radii, shadows). **`.dark` on `<html>`** is a pure CSS-variable swap — no component reads the
theme directly, so a theme flip re-renders zero components. Conversation `--cv-*` density tokens
power the compact quick-look via `[data-density='compact']`.

## Dev harness (`dev/mockBridge.ts` + `vite.standalone.config.ts`)
`dev/mockBridge.ts` (1807 lines) is a full standalone preview harness: an in-memory simulation of
the main process implementing every `InvokeChannels` handler + scripted `sync:event`/`ai:event`/
`db:changed` emissions (deterministic RNG, inline-SVG thumbs, scripted AI ops, a mocked send
pipeline with `fail!`/`unconf!` triggers). Used **only** when `window.chatgoose` is undefined.
`vite.standalone.config.ts` is its deletable dev server (port 5199) that strips the production CSP
meta so react-refresh works.

## Renderer boundary facts (verified)
- **No direct network I/O in the renderer** — all I/O routes through `getBridge().invoke(...)`;
  the only "fetch" tokens are TanStack pagination helpers; `sound.ts` uses local WebAudio; media
  are `media://` tokens minted in main.
- **The renderer never holds secrets** — keys are write-only inputs passed straight to
  `cmd:settings.update`/`cmd:hub.issueDeviceToken`; the VM only ever exposes non-secret metadata
  (`hasHubKey`, `hasHubDeviceToken`, `keyMeta:{hub:{last4,setAt}}`).

## Name/behavior observations (flagged)
- `MessageList.tsx` is a thin re-export shell; the live full-chat path is `ConversationPane →
  ConversationView → Thread` directly.
- `SettingsVM.markAsReadOnOpen` exists in the contract but the Behavior UI exposes `autoReadChats`
  instead; `markAsReadOnOpen` is a main-side mark-read gate (`07`), not surfaced in renderer
  settings.
- Individual AI part hotkeys are gone (⌘1–9 now jump chats); only `⌘0` (insert-all) reaches the
  `ai-part-*` handler; dock bubbles are click-only.
- `hubSyncProtocol`/`spendSweepRollbackToLegacy`/`ofapiReadTransport` are contract-level rollback/
  transport seams with no dedicated renderer UI (only `spendSweepRollbackToLegacy` shows in the
  dev-only Advanced block when non-default).
