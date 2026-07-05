// Composition root (SPEC §4): keychain → encrypted db → settings → media://
// protocol → OFAPI client → PollingSync → AI coordinator → IPC. All secrets
// and network I/O live here in main; the renderer only ever sees typed IPC.

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  protocol,
  safeStorage,
  shell,
} from 'electron';
import { join, resolve } from 'node:path';
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { resolveUiLocale, uiMessage, type UiLocale } from '@chatgoose/shared/i18n/index';
import { errorToFields } from '@chatgoose/shared/diagnostics/log';
import { createKeychain, type Keychain, type SecretName } from './secrets/keychain';
import { createDataLayer, readSchemaVersion, type DataLayer } from './db/index';
import { SCHEMA_VERSION } from './db/migrations';
import { createHarvestModule, type HarvestModule } from './harvest/index';
import { createHubClient } from '@chatgoose/shared/hub/index';
import { createLogger, type Logger } from './diagnostics/logger';
import { buildDiagnosticsReport } from './diagnostics/report';
import { auditOutbox } from './send/audit';
import { createSettingsStore, type SettingsStore } from './settings/store';
import {
  createToMediaUrl,
  isAllowedMediaUrl,
  MEDIA_SCHEME_PRIVILEGES,
  registerMediaProtocol,
  type FetchRemote,
} from './media/protocol';
import { createSqliteMediaCacheQueries } from './media/cache';
import {
  createOfApiClient,
  type OfApiClient,
  type OfApiClientOptions,
  type OfApiRequestEvent,
} from './ofapi/client';
import { createCreditMeter } from './ofapi/credit-meter';
import {
  buildHubOfApiReadBaseUrl,
  createOfApiTransportClient,
} from './ofapi/transport';
import { createSendEngine, type SendEngine } from './send/engine';
import { createMessageGuardRuntime, type MessageGuardRuntime } from './message-guard/runtime';
import { createVaultService, type VaultService } from './media/vault';
import { createSpendersService, type SpendersService } from './spenders/service';
import { createOnlineService, type OnlineService } from './online/service';
import { createSpendersRefresh, type SpendersRefreshService } from './spenders/refresh';
import { createPollingSync, syncAccounts } from './sync/polling-sync';
import { createBudgetGuard } from './sync/budget-guard';
import { createHubSync } from './sync/hub-sync';
import { createHubAwareSync, type HubAwareSync } from './sync/hub-provider';
import { registerIpcHandlers } from './ipc/handlers';
import { runKeyTest } from './diagnostics/key-tests';
import { createAiCoordinator, createDirectGateway, createSelectableAiGateway, type AiCoordinator } from './ai/index';
import { createHubModule, type HubModule } from './hub/index';
import { hostname } from 'node:os';
import { issueHubDeviceToken, resolveHubCredential } from './hub/device-token';
import { attachEventForwarding } from './ipc/events';
import { focusExistingWindow } from './platform/single-instance';
import { badgePng } from './platform/badge';
import {
  createUpdateController,
  shouldAutoUpdate,
  startAutoUpdater,
  type AppUpdaterLike,
  type UpdateController,
} from './platform/updater';
import {
  appendSearchToUrl,
  isAllowedDevRendererUrl,
  isAllowedExternalOpenUrl,
} from './platform/navigation';
import { messageNotificationBody } from './notifications';
import type { UnreadReconcileSettingsVM, UpdateStatusVM } from '../preload/contract';

protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_PRIVILEGES]);

const HUB_OFAPI_READ_TIMEOUT_MS = 75_000;

let mainWindow: BrowserWindow | null = null;

// Stage 12: retention prunes freeze while a harvest is incomplete (history
// must reach the kernel before it may die locally). Bound in boot() once the
// harvest module exists; polling loops read it through this indirection
// because rebuildOfapiRuntime can run before AND after boot creates it.
let harvestIsIncomplete: () => boolean = () => false;
/** Diagnostics logger — created first thing in boot() so even early failures land. */
let logger: Logger | null = null;
/** Live secret values, mirrored to the logger redactor and the export's final pass. */
let redactionSecrets: string[] = [];
let data: DataLayer | null = null;
let sync: HubAwareSync | null = null;
let client: OfApiClient | null = null;
let coordinator: AiCoordinator | null = null;
let sendEngine: SendEngine | null = null;
let messageGuard: MessageGuardRuntime | null = null;
let vaultService: VaultService | null = null;
let spendersService: SpendersService | null = null;
let onlineService: OnlineService | null = null;
let spendersRefresh: SpendersRefreshService | null = null;
let hub: HubModule | null = null;
let disposeEventForwarding: (() => void) | null = null;
let disposeRuntimeSettingsWatcher: (() => void) | null = null;
let rebuildOfapiRuntimeInFlight: Promise<void> | null = null;
/** Set once electron-updater is dynamic-imported (win32 packaged only); null
 *  everywhere else — the IPC layer then reports phase 'unsupported'. */
let updateController: UpdateController | null = null;
/** Set by initOfapi; lets cmd:settings.update trigger a hub-config recheck. */
let recheckHubConfig: (() => Promise<void>) | null = null;
/** UI prefs mirrored from settings by boot()'s bus watcher — read by window
 *  creation (zoom) and main-side notifications (locale). */
let uiScale = 1;
let uiLocale: UiLocale = 'en';
let notificationPrefs = {
  notificationsEnabled: true,
  soundEnabled: true,
};

/** Pre-paint window background per resolved theme — must equal the CSS
 *  --color-bg0 values in renderer/src/styles/index.css or reload/resize
 *  flashes the wrong color. The theme itself rides nativeTheme.themeSource
 *  (set from the uiTheme setting by refreshUiPrefs). */
const WINDOW_BG = { light: '#efece4', dark: '#1b1a17' } as const;

function windowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BG.dark : WINDOW_BG.light;
}

/** Stamp the running app version onto a controller snapshot (or report
 *  `unsupported` when there is no controller — macOS / dev). */
function updateStatusVM(status: ReturnType<UpdateController['status']> | null): UpdateStatusVM {
  const currentVersion = app.getVersion();
  if (status === null) {
    return { phase: 'unsupported', version: null, percent: null, message: null, currentVersion };
  }
  return { ...status, currentVersion };
}

function flushLogger(): Promise<void> {
  return logger?.flush() ?? Promise.resolve();
}

let exitingAfterFatal = false;

function exitAfterFatalException(error: unknown): void {
  logger?.error('process', 'uncaughtException', errorToFields(error));
  if (exitingAfterFatal) {
    return;
  }
  exitingAfterFatal = true;
  const timer = setTimeout(() => app.exit(1), 1_000);
  timer.unref();
  void flushLogger().finally(() => app.exit(1));
}

function startPackagedAutoUpdater(): void {
  // Auto-update (platform/updater.ts policy: win32 packaged only, install on
  // quit, silent failures). electron-updater drags Electron in at import time,
  // so it is dynamic-imported after the boot logger exists.
  // The controller is shared by the background loop and the Settings -> Updates
  // "Check now / Restart & install" button (via the IPC updates delegate).
  if (!shouldAutoUpdate(process.platform, app.isPackaged) || updateController !== null) {
    return;
  }
  void import('electron-updater')
    .then((mod) => {
      // CJS<->ESM interop: under Node ESM the CJS module surfaces as `default`.
      const interop = mod as unknown as {
        default?: { autoUpdater: AppUpdaterLike };
        autoUpdater?: AppUpdaterLike;
      };
      const autoUpdater = interop.default?.autoUpdater ?? interop.autoUpdater;
      if (autoUpdater === undefined) {
        logger?.warn('updates', 'electron-updater did not expose autoUpdater');
        return;
      }
      updateController = createUpdateController({
        updater: autoUpdater,
        onReady: (version) => {
          if (Notification.isSupported()) {
            new Notification({
              title: uiMessage(uiLocale, 'notif.updateTitle'),
              body: uiMessage(uiLocale, 'notif.updateBody', { version }),
              silent: true,
            }).show();
          }
        },
      });
      startAutoUpdater({ controller: updateController });
    })
    .catch((error: unknown) => {
      logger?.warn('updates', 'failed to initialize auto-updater', errorToFields(error));
    });
}

/**
 * Custom application menu. Electron's DEFAULT menu shadows three product
 * hotkeys (DESIGN §2) with higher-priority accelerators: ⌘R (View → Reload vs
 * Fast Reply), ⌘H (Hide vs Help Me), ⌘0 (Actual Size vs insert-all-parts) —
 * menu accelerators fire before the renderer keymap ever sees the key. So:
 * Hide moves to ⌃⌘H, Reload exists only unpackaged on ⇧⌘R (a chatter must
 * never reload mid-shift), zoom roles are dropped (UI scale is a setting).
 * Edit roles stay — clipboard shortcuts depend on them.
 */
function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, accelerator: 'Control+Command+H' },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(!app.isPackaged
          ? [
              { role: 'reload' as const, accelerator: 'Shift+CommandOrControl+R' },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : []),
        { role: 'togglefullscreen' as const },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function loadWindowContent(win: BrowserWindow): void {
  // Dev convenience: CHATGOOSE_OPEN_VIEW=settings|spenders|online boots straight
  // into that view (e.g. documenting a live run). No effect packaged.
  const openView = !app.isPackaged ? process.env['CHATGOOSE_OPEN_VIEW'] : undefined;
  const search =
    openView === 'settings' || openView === 'spenders' || openView === 'online'
      ? `view=${openView}`
      : null;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && isAllowedDevRendererUrl(rendererUrl)) {
    void win.loadURL(appendSearchToUrl(rendererUrl, search));
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'), {
      ...(search !== null ? { search } : {}),
    });
  }
}

function createWindow(options: { load?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: windowBackgroundColor(),
    title: 'ChatGoose',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload scripts cannot be sandboxed (Electron limitation; electron-vite
      // ESM project). contextIsolation + no nodeIntegration remain the boundary —
      // the preload exposes only the typed bridge. SPEC §4 updated accordingly.
      sandbox: false,
      // DESIGN §3.9: hidden-window polling timers must keep firing in main;
      // renderer timers may throttle, but don't let Chromium suspend the page.
      backgroundThrottling: false,
    },
  });
  win.on('ready-to-show', () => win.show());
  // Settings → Behavior → UI scale; re-applied on every load (zoom does not
  // survive navigation) and reactively by boot()'s settings watcher.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(uiScale);
  });
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalOpenUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  if (options.load ?? true) {
    loadWindowContent(win);
  }
  return win;
}

async function initOfapi(
  keychain: Keychain,
  dataLayer: DataLayer,
  settingsStore: SettingsStore,
): Promise<void> {
  if (rebuildOfapiRuntimeInFlight !== null) {
    try {
      await rebuildOfapiRuntimeInFlight;
    } catch {
      // A new call should validate the latest persisted settings instead of
      // being permanently blocked by the previous failed candidate.
    }
  }
  const rebuild = rebuildOfapiRuntime(keychain, dataLayer, settingsStore);
  rebuildOfapiRuntimeInFlight = rebuild;
  try {
    await rebuild;
  } finally {
    if (rebuildOfapiRuntimeInFlight === rebuild) {
      rebuildOfapiRuntimeInFlight = null;
    }
  }
}

async function rebuildOfapiRuntime(
  keychain: Keychain,
  dataLayer: DataLayer,
  settingsStore: SettingsStore,
): Promise<void> {
  const [initialSettings, hubApiKey] = await Promise.all([
    settingsStore.get(),
    // Stage 24: device token preferred; chatter key = fallback.
    resolveHubCredential(keychain),
  ]);
  const hadActiveRuntime = client !== null;
  const creditMeter = createCreditMeter();
  const onError =
    (transport: 'hub'): NonNullable<OfApiClientOptions['onError']> =>
    (error, context): void =>
      logger?.warn('ofapi', `${context.purpose} ${error.code}`, {
        code: error.code,
        transport,
        url: context.url,
        ...errorToFields(error),
      });
  const onRequestEvent =
    (transport: 'hub'): NonNullable<OfApiClientOptions['onRequestEvent']> =>
    (event: OfApiRequestEvent): void => {
      const match = /^\/([^/]+)\/chats\/([^/]+)\/messages$/.exec(event.path);
      if (!match) return;
      const accountId = decodeURIComponent(match[1] ?? event.accountKey);
      const chatId = decodeURIComponent(match[2] ?? '');
      const fields: Record<string, unknown> = {
        transport,
        accountId,
        chatId,
        purpose: event.purpose,
        method: event.method,
        order: event.query['order'] ?? null,
        limit: event.query['limit'] ?? null,
        firstId: event.query['first_id'] ?? null,
        lastId: event.query['last_id'] ?? null,
        skipUsers: event.query['skip_users'] ?? null,
        priority: event.priority,
        retry: event.retry,
        attempt: event.attempt,
      };
      if (event.phase === 'started') {
        fields['queueWaitMs'] = event.queueWaitMs;
      }
      if (event.phase === 'response') {
        fields['status'] = event.status;
        fields['elapsedMs'] = event.elapsedMs;
        fields['willRetry'] = event.willRetry;
        fields['retryKind'] = event.retryKind ?? null;
        fields['retryDelayMs'] = event.retryDelayMs ?? null;
      }
      logger?.info(
        'diag',
        event.phase === 'queued'
          ? 'diag ofapi.requestQueued'
          : event.phase === 'started'
            ? 'diag ofapi.requestStarted'
            : 'diag ofapi.requestResponse',
        fields,
      );
    };

  // Stage 24 / DP 8: reads are hub-only — the direct construction branch and
  // its team-wide key are gone. Break-glass during a kernel outage is an ops
  // runbook (owner issues a temporary key); reads meanwhile come from the
  // local SQLite cache.
  if (
    initialSettings.hubBaseUrl === null ||
    hubApiKey === null ||
    hubApiKey.length === 0
  ) {
    logger?.warn('ofapi', 'hub read transport not configured', {
      transport: 'hub',
      hasHubBaseUrl: initialSettings.hubBaseUrl !== null,
      hasHubKey: hubApiKey !== null && hubApiKey.length > 0,
    });
    if (hadActiveRuntime) {
      throw new Error('Hub read transport is not configured');
    }
    return;
  }
  const readClient = createOfApiClient({
    apiKey: hubApiKey,
    baseUrl: buildHubOfApiReadBaseUrl(initialSettings.hubBaseUrl),
    authErrorCode: 'CG-HUB-01',
    requestTimeoutMs: HUB_OFAPI_READ_TIMEOUT_MS,
    creditMeter,
    onError: onError('hub'),
    onRequestEvent: onRequestEvent('hub'),
  });
  const nextClient = createOfApiTransportClient(readClient);
  logger?.info('ofapi', 'read transport selected', { transport: 'hub' });

  const utcDay = new Date().toISOString().slice(0, 10);
  nextClient.creditMeter.hydrate({
    utcDay,
    usedToday: dataLayer.creditLog.usedOn(utcDay),
    usedTodayByPurpose: Object.fromEntries(
      dataLayer.creditLog
        .byPurposeOn(utcDay)
        .map((row) => [row.purpose, { requests: row.requests, credits: row.credits }]),
    ),
  });

  const budgetGuard = createBudgetGuard({
    getBudget: () => settingsCache?.creditBudgetPerShift ?? null,
    getUsedToday: () => nextClient.creditMeter.snapshot().usedToday,
    onWarning: (used, budget) => {
      if (Notification.isSupported()) {
        new Notification({
          title: uiMessage(uiLocale, 'notif.budgetTitle'),
          body: uiMessage(uiLocale, 'notif.budgetBody', { used, budget }),
        }).show();
      }
    },
  });
  // Per-purpose delta flush: the meter holds the day's running tallies; only
  // the increment since the last write hits credit_log (same pattern as the
  // pre-v7 single counter, now keyed by purpose).
  let persistedDay = utcDay;
  const persistedByPurpose = new Map(
    dataLayer.creditLog
      .byPurposeOn(utcDay)
      .map((row) => [row.purpose, { requests: row.requests, credits: row.credits }]),
  );
  const unsubscribeCreditMeter = nextClient.creditMeter.subscribe((snapshot) => {
    if (snapshot.utcDay !== persistedDay) {
      persistedDay = snapshot.utcDay;
      persistedByPurpose.clear();
    }
    for (const [purpose, tally] of Object.entries(snapshot.usedTodayByPurpose)) {
      const prev = persistedByPurpose.get(purpose) ?? { requests: 0, credits: 0 };
      const creditsDelta = tally.credits - prev.credits;
      const requestsDelta = tally.requests - prev.requests;
      if (creditsDelta > 0 || requestsDelta > 0) {
        dataLayer.creditLog.add(
          snapshot.utcDay,
          purpose,
          Math.max(0, creditsDelta),
          Math.max(0, requestsDelta),
        );
        persistedByPurpose.set(purpose, { requests: tally.requests, credits: tally.credits });
      }
    }
    budgetGuard.check();
  });

  let settingsCache: {
    creditBudgetPerShift: number | null;
    autoReadChats: boolean;
    ofapiWriteTransport: 'hub';
    hubModeOverride: 'auto' | 'polling' | 'hub';
    spendSweepRollbackToLegacy: boolean;
    unreadReconcile: UnreadReconcileSettingsVM;
    notificationsEnabled: boolean;
    soundEnabled: boolean;
  } | null = initialSettings;

  // Hub config fingerprint: reconfigure the SSE connection only when the base
  // URL or the chatter key actually changed — NOT on every settings write
  // (HubSync itself persists hubSync.lastEventId into the settings table, so a
  // naive resubscribe-on-settings-change would loop the stream forever).
  async function hubConfigFingerprint(): Promise<string> {
    const vm = await settingsStore.get();
    settingsCache = vm;
    const hubKey = await resolveHubCredential(keychain);
    return `${vm.hubBaseUrl ?? ''}\n${hubKey ?? ''}\n${vm.hubModeOverride}\n${vm.hubSyncProtocol}`;
  }
  let hubFingerprint = await hubConfigFingerprint();

  // Minting registers the remote URL in media_urls; only registered tokens
  // resolve through the media:// handler (SPEC §4).
  const toMediaUrl = createToMediaUrl(dataLayer.mediaUrls);
  const polling = createPollingSync({
    client: nextClient,
    data: dataLayer,
    toMediaUrl,
    // DIAGNOSTIC (temporary — empty-thread investigation 2026-06-23): scope 'diag'.
    onLog: (level, message, fields) => logger?.log(level, 'diag', message, fields),
    isBudgetExhausted: () => budgetGuard.isExhausted(),
    // Default OFF: no automatic message-body reads (poll deltas, sweeps, media
    // polling) so OnlyFans never marks a chat read without an explicit open.
    autoReadEnabled: () => settingsCache?.autoReadChats ?? false,
    spendSweepRollbackToLegacy: () => settingsCache?.spendSweepRollbackToLegacy ?? false,
    unreadReconcileSettings: () => settingsCache?.unreadReconcile,
    readTransport: () => initialSettings.ofapiReadTransport,
    // Stage 12: retention prunes freeze while a harvest is incomplete so the
    // walk never races row deletion (history must reach the kernel first).
    isPruneFrozen: () => harvestIsIncomplete(),
  });

  const lastEventIdSchema = z.number().int().nonnegative();
  const v2CursorSchema = z.string().min(1);
  const nextSync = createHubAwareSync({
    polling,
    data: dataLayer,
    onLog: (level, message, fields) => logger?.log(level, 'sync', message, fields),
    hubModeOverride: () => settingsCache?.hubModeOverride ?? 'auto',
    // Resolved per (re)connect attempt so settings edits take effect on
    // reconfigureHub without re-running OFAPI init. Null = hub mode off.
    createHub: async (
      { onEvent, onStatusChange, onSnapshot, onSnapshotRequired, onV2GapRecovered },
      accountIds,
    ) => {
      const vm = await settingsStore.get();
      const hubKey = await resolveHubCredential(keychain);
      if (vm.hubBaseUrl === null || hubKey === null || hubKey.length === 0) {
        return null;
      }
      return createHubSync({
        baseUrl: vm.hubBaseUrl,
        apiKey: hubKey,
        // Stage 24: v2 by default; 'v1' is the rollout-window-only fallback
        // (settings-file flip, no UI).
        protocol: vm.hubSyncProtocol,
        accountIds,
        onEvent,
        onSnapshot,
        onSnapshotRequired,
        onV2GapRecovered,
        onStatusChange,
        onWarn: (message, fields) => logger?.warn('hub-sse', message, fields),
        // v1 resume checkpoint is global per chatter key (core fanout_seq);
        // the v2 cursor is opaque and lives under its own key — lastEventId
        // is retained untouched for the fallback window.
        getLastEventId: () =>
          dataLayer.settings.getParsed('hubSync.lastEventId', lastEventIdSchema) ?? null,
        setLastEventId: (id) => dataLayer.settings.set('hubSync.lastEventId', id),
        getV2Cursor: () =>
          dataLayer.settings.getParsed('hubSync.v2Cursor', v2CursorSchema) ?? null,
        setV2Cursor: (cursor) => dataLayer.settings.set('hubSync.v2Cursor', cursor),
      });
    },
  });

  // Hub REST cluster (SPEC §8.5/§8.6): summary prefetch/push + usage reporter.
  // Inert until hub config exists; rebuilt by recheckHubConfig on changes.
  const nextHub = createHubModule({
    data: dataLayer,
    settingsStore,
    keychain,
    // Stage 4 / Proposal 4.1: every hub request carries x-client-version, the
    // fleet-version exit signal (and Stage 11's producer version upstream).
    clientVersion: app.getVersion(),
    onWarn: (message, fields) => logger?.warn('hub', message, fields),
  });
  await nextHub.reconfigure();

  const recheckNextHubConfig = async (): Promise<void> => {
    const next = await hubConfigFingerprint();
    if (next !== hubFingerprint) {
      hubFingerprint = next;
      await Promise.all([nextSync.reconfigureHub(), nextHub.reconfigure()]);
    }
  };
  const attachRuntimeSettingsWatcher = (): (() => void) =>
    dataLayer.bus.subscribe((events) => {
      if (events.some((event) => event.scope === 'settings')) {
        void settingsStore.get().then((vm) => {
          settingsCache = vm;
        });
      }
    });

  // Hub-supported writes (text, typing, unsend, mark-read, media/PPV) are the
  // only app write path. The local OFAPI key may still back Direct reads, but it
  // is never passed to the send engine.
  const engine = createSendEngine({
    client: nextClient,
    hubCommandClient: nextHub.commandClient,
    data: dataLayer,
    messageGuard: messageGuard ?? createMessageGuardRuntime({ data: dataLayer }),
    toMediaUrl,
    getSettings: () => settingsStore.get(),
  });
  // Vault & PPV (PRD F7): vault/gallery thumbs are OF CDN URLs — minted into
  // media:// tokens through the same registering toMediaUrl seam as sync.
  const nextVaultService = createVaultService({
    client: nextClient,
    toMediaUrl,
  });
  // Spenders board (PLAN item 12): OM tier lists read-only via the metered
  // client; all spend/counter joins stay on the local DB.
  const nextSpendersService = createSpendersService({
    client: nextClient,
    data: dataLayer,
    toMediaUrl,
    getMappedListIds: async (accountId) =>
      (await settingsStore.get()).spendersListMappings[accountId] ?? [],
  });
  // Online-now surface (variant C, flat): explicit-refresh-only /fans/active
  // reads through the metered client (purpose 'online'); local joins reuse the
  // Spenders machinery. NO background polling (owner: «автопарс жрёт кредиты»).
  const nextOnlineService = createOnlineService({ client: nextClient, data: dataLayer, toMediaUrl });
  // Spenders freshness (PLAN item 13): quick-look hydrate TTL guard + the
  // scoped refresh queue — the lowest-priority OFAPI consumer, pauses first
  // on budget exhaustion, resumes persisted queues after sync starts.
  const spendersSvc = nextSpendersService;
  const hubAwareSync = nextSync;
  const nextSpendersRefresh = createSpendersRefresh({
    data: dataLayer,
    refreshChat: (accountId, chatId, purpose) =>
      hubAwareSync.refreshChat(accountId, chatId, purpose),
    readChatTailForUserOpen: (accountId, chatId, purpose) =>
      hubAwareSync.readChatTailForUserOpen(accountId, chatId, purpose),
    ensureChat: (accountId, chatId, hint) => hubAwareSync.ensureChat(accountId, chatId, hint),
    scopeChatIds: (accountId, scope) => spendersSvc.scopeChatIds(accountId, scope),
    getMappedListIds: async (accountId) =>
      (await settingsStore.get()).spendersListMappings[accountId] ?? [],
    isBudgetExhausted: () => budgetGuard.isExhausted(),
    // Default OFF: skip the per-fan refreshChat body read so a Spenders refresh
    // never marks fans read on OnlyFans (ensureChat/listChats stay, they don't).
    getAutoRead: () => settingsCache?.autoReadChats ?? false,
  });
  const unsubscribeSendSync = nextSync.subscribe((event) => engine.handleSyncEvent(event));
  const nextCoordinator = createAiCoordinator({
    data: dataLayer,
    client: nextClient,
    settingsStore,
    keychain,
    gateway: createSelectableAiGateway({
      direct: createDirectGateway({ keychain }),
      hub: nextHub.aiGateway,
    }),
    summaryHub: nextHub.summaryHub,
    onUsageEvent: (event) => nextHub.onUsageEvent(event),
  });

  let committed = false;
  try {
    // Awaited on purpose (adversarial review 2026-06-11): the "reconciliation
    // before any send" guarantee must hold even for a fast first user action.
    // reconcileOnBoot swallows network errors internally, so this never blocks
    // startup on connectivity.
    await engine.reconcileOnBoot();

    const accountIds = await syncAccounts(nextClient, dataLayer, toMediaUrl);

    disposeEventForwarding?.();
    disposeEventForwarding = null;
    disposeRuntimeSettingsWatcher?.();
    disposeRuntimeSettingsWatcher = null;
    sync?.stop();
    spendersRefresh?.dispose();
    sendEngine?.dispose();
    coordinator?.dispose();
    hub?.dispose();

    client = nextClient;
    sync = nextSync;
    hub = nextHub;
    sendEngine = engine;
    coordinator = nextCoordinator;
    vaultService = nextVaultService;
    spendersService = nextSpendersService;
    onlineService = nextOnlineService;
    spendersRefresh = nextSpendersRefresh;
    recheckHubConfig = recheckNextHubConfig;
    disposeRuntimeSettingsWatcher = attachRuntimeSettingsWatcher();

    nextSync.start(accountIds);
    // A refresh interrupted by quit/crash continues here; the per-fan TTL skip
    // makes the replayed tail of the persisted queue free.
    nextSpendersRefresh.resume(accountIds);
    committed = true;

    logger?.info('ofapi', 'runtime activated', {
      transport: initialSettings.ofapiReadTransport,
      accounts: accountIds.length,
    });
  } finally {
    if (!committed) {
      unsubscribeSendSync();
      unsubscribeCreditMeter();
      nextSpendersRefresh.dispose();
      engine.dispose();
      nextCoordinator.dispose();
      nextHub.dispose();
    }
  }
}

function emitSyncStatusFrame(): void {
  const win = mainWindow;
  if (win === null || win.isDestroyed()) {
    return;
  }
  win.webContents.send('sync:event', { type: 'syncStatus' });
}

function reattachEventForwarding(): void {
  const liveData = data;
  if (liveData === null) {
    return;
  }
  disposeEventForwarding?.();
  disposeEventForwarding = attachEventForwarding({
    window: () => mainWindow,
    bus: liveData.bus,
    sync,
    creditMeter: client?.creditMeter ?? null,
    coordinator,
    spendersRefresh,
    onSyncEvent: (event) => {
      if (event.type === 'chatListUpdated') {
        const total = liveData.accounts.list().reduce((sum, account) => sum + account.unreadTotal, 0);
        if (process.platform === 'darwin') {
          app.dock?.setBadge(total > 0 ? String(total) : '');
        } else if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
          // Taskbar parity for the dock badge (PLAN item 11): overlay icon
          // with the count drawn in main (platform/badge.ts), null to clear.
          const png = badgePng(total);
          mainWindow.setOverlayIcon(
            png === null ? null : nativeImage.createFromBuffer(png),
            png === null ? '' : `${total} unread`,
          );
        }
      }
      if (
        event.type === 'messageReceived' &&
        mainWindow &&
        (!mainWindow.isVisible() || !mainWindow.isFocused()) &&
        notificationPrefs.notificationsEnabled &&
        Notification.isSupported()
      ) {
        const chat = liveData.chats.get(event.accountId, event.chatId);
        new Notification({
          title: chat?.fanName ?? uiMessage(uiLocale, 'notif.newMessage'),
          body: messageNotificationBody(uiLocale, event),
          silent: true,
        }).show();
      }
    },
  });
  emitSyncStatusFrame();
}

async function boot(): Promise<void> {
  const userData = app.getPath('userData');

  // Logger FIRST — so a failure anywhere in boot is captured (and rides along in
  // the diagnostics export). Packaged builds keep info+; dev sees debug + console.
  logger = createLogger({
    dir: join(userData, 'logs'),
    minLevel: app.isPackaged ? 'info' : 'debug',
    mirrorConsole: !app.isPackaged,
  });
  logger.info('boot', 'starting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  });
  // Catch-all nets: an uncaught throw / rejected promise that would otherwise
  // vanish becomes a log record the user can send us.
  process.on('uncaughtException', exitAfterFatalException);
  process.on('unhandledRejection', (reason) => {
    logger?.error('process', 'unhandledRejection', errorToFields(reason));
    void flushLogger();
  });
  startPackagedAutoUpdater();

  const keychain = createKeychain({
    safeStorage,
    secretsDir: join(userData, 'secrets'),
  });

  // Stage 24 / DP 8: the team-wide direct-read OFAPI key is decommissioned —
  // deleted on boot, deliberately unrecoverable by version rollback.
  await keychain.deleteDecommissionedSecrets();

  // Mirror the live secret values into the log redactor + the export's final
  // pass. Refreshed on every settings write (a key save also writes its keyMeta
  // fingerprint, so it fires the settings bus event below).
  const refreshRedactionSecrets = async (): Promise<void> => {
    const names: SecretName[] = ['anthropicKey', 'openRouterKey', 'hubApiKey', 'hubDeviceToken'];
    const values = await Promise.all(names.map((name) => keychain.getSecret(name)));
    redactionSecrets = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
    logger?.setRedactionSecrets(redactionSecrets);
  };
  await refreshRedactionSecrets();

  const dbKey = await keychain.getOrCreateGeneratedKey('dbKey');
  const mediaKeyHex = await keychain.getOrCreateGeneratedKey('mediaCacheKey');

  data = createDataLayer({
    driverPath: 'better-sqlite3-multiple-ciphers',
    filePath: join(userData, 'chatgoose.db'),
    encryptionKey: dbKey,
  });
  messageGuard = createMessageGuardRuntime({
    data,
    ...(logger !== null ? { logger } : {}),
  });
  messageGuard.pruneExpired();

  const settingsStore = createSettingsStore({ queries: data.settings, secrets: keychain });

  // Stage 12: one-time local-history harvest to the kernel capture lane.
  // The uploader is built per run (its own client instance so x-client-version
  // is 'harvest-<version>' → core stamps producer='desktop-harvest@<version>').
  const harvestModule: HarvestModule = createHarvestModule({
    data,
    createUploader: async () => {
      const vm = await settingsStore.get();
      const hubApiKey = await resolveHubCredential(keychain);
      if (!vm.hubBaseUrl || !hubApiKey) {
        throw new Error('Hub is not configured — set the hub base URL and API key first.');
      }
      return createHubClient({
        baseUrl: vm.hubBaseUrl,
        apiKey: hubApiKey,
        clientVersion: `harvest-${app.getVersion()}`,
      });
    },
    appVersion: app.getVersion(),
    schemaVersion: SCHEMA_VERSION,
    manifestDir: userData,
    ...((): { log?: (message: string, detail?: Record<string, unknown>) => void } => {
      const harvestLogger = logger;
      return harvestLogger !== null
        ? { log: (message, detail) => harvestLogger.log('info', 'harvest', message, detail) }
        : {};
    })(),
  });
  harvestIsIncomplete = () => harvestModule.isIncomplete();

  // Runtime seed for local/prod evidence builds. The secret is supplied by the
  // launcher and then persisted through the normal encrypted keychain path.
  const hubBaseUrlEnv = process.env['CHATGOOSE_HUB_BASE_URL']?.trim();
  const hubApiKeyEnv = process.env['CHATGOOSE_HUB_API_KEY']?.trim();
  if (hubBaseUrlEnv || hubApiKeyEnv) {
    await settingsStore.update({
      ...(hubBaseUrlEnv ? { hubBaseUrl: hubBaseUrlEnv.replace(/\/+$/, '') } : {}),
      ...(hubApiKeyEnv ? { hubApiKey: hubApiKeyEnv } : {}),
    });
    await refreshRedactionSecrets();
  }

  // Dev convenience (same spirit as the spike-key import): seed the Spenders
  // list→shelf mapping once from CHATGOOSE_SPENDERS_MAP="acct_…=id1,id2,…"
  // so a live evidence run needs no manual settings entry. Never overwrites.
  if (!app.isPackaged && process.env['CHATGOOSE_SPENDERS_MAP']) {
    const raw = process.env['CHATGOOSE_SPENDERS_MAP'];
    const eq = raw.indexOf('=');
    const acct = eq > 0 ? raw.slice(0, eq) : '';
    const ids = eq > 0 ? raw.slice(eq + 1).split(',').filter(Boolean) : [];
    if (acct !== '' && ids.length > 0) {
      const vm = await settingsStore.get();
      if ((vm.spendersListMappings[acct] ?? []).length === 0) {
        await settingsStore.update({
          spendersListMappings: { ...vm.spendersListMappings, [acct]: ids },
        });
      }
    }
  }

  // UI prefs (zoom + interface language for main-side notifications + theme):
  // seed before the window loads, then track every settings-table write.
  const refreshUiPrefs = async (): Promise<void> => {
    const vm = await settingsStore.get();
    uiScale = vm.uiScale;
    uiLocale = resolveUiLocale(vm.uiLocale, app.getLocale());
    notificationPrefs = {
      notificationsEnabled: vm.notificationsEnabled,
      soundEnabled: vm.soundEnabled,
    };
    // Steers prefers-color-scheme in the renderer (the .dark applier) AND
    // native chrome (menus/dialogs). 'system' | 'light' | 'dark' map 1:1.
    nativeTheme.themeSource = vm.uiTheme;
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(uiScale);
      mainWindow.setBackgroundColor(windowBackgroundColor());
    }
  };
  await refreshUiPrefs();
  // Covers OS scheme flips while uiTheme='system' (no settings write involved).
  nativeTheme.on('updated', () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(windowBackgroundColor());
    }
  });
  data.bus.subscribe((events) => {
    if (events.some((event) => event.scope === 'settings')) {
      void refreshUiPrefs();
      // A key save writes its keyMeta fingerprint to the settings table, so this
      // fires on key changes too — keep the redactor's secret set current.
      void refreshRedactionSecrets();
    }
  });

  mainWindow = createWindow({ load: false });

  // Media: direct fetch of the signed URL first (Phase-0: hosts not IP-locked,
  // 0 credits). OFAPI download-endpoint fallback is a P3 follow-up — P1 media
  // is avatars/thumbs, which fetch directly.
  const fetchRemote: FetchRemote = async (remoteUrl) => {
    // Defense in depth (SPEC §15.1): even a poisoned registry/cache row must
    // never make main fetch a non-OF or non-https URL.
    if (!isAllowedMediaUrl(remoteUrl)) {
      return null;
    }
    const response = await fetch(remoteUrl);
    if (response.status === 404 || response.status === 410) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`media fetch failed: ${response.status}`);
    }
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  };
  const media = registerMediaProtocol({
    session: mainWindow.webContents.session,
    cacheDir: join(userData, 'media-cache'),
    encryptionKey: Buffer.from(mediaKeyHex, 'hex'),
    queries: createSqliteMediaCacheQueries(data.db),
    registry: data.mediaUrls,
    fetchRemote,
  });

  await initOfapi(keychain, data, settingsStore);

  const rebuildOfapiRuntimeFromSettings = async (): Promise<void> => {
    if (data === null) {
      return;
    }
    try {
      await initOfapi(keychain, data, settingsStore);
      reattachEventForwarding();
      emitSyncStatusFrame();
    } catch (error) {
      logger?.error('ofapi', 'runtime activation failed', errorToFields(error));
      throw error;
    }
  };

  let purging = false;
  registerIpcHandlers({
    data,
    settingsStore,
    // OFAPI-lifecycle services are built lazily by initOfapi, which can run
    // AFTER this registration — a key configured on a keyless boot routes
    // cmd:settings.update → onOfapiKeyConfigured → initOfapi and reassigns the
    // module-level bindings below. Pass them as getters over those bindings so
    // handlers always read the LIVE instance, not the null captured at boot
    // (otherwise cmd:spenders.hydrate, send, vault, … silently no-op until the
    // app is restarted).
    get sync() {
      return sync;
    },
    get creditMeter() {
      return client?.creditMeter ?? null;
    },
    get coordinator() {
      return coordinator;
    },
    get send() {
      return sendEngine;
    },
    get messageGuard() {
      return messageGuard;
    },
    get vault() {
      return vaultService;
    },
    get spenders() {
      return spendersService;
    },
    get online() {
      return onlineService;
    },
    get spendersRefresh() {
      return spendersRefresh;
    },
    purge: async () => {
      // Re-entry guard: a double-fired cmd:data.purge would otherwise call
      // app.relaunch() twice before exit — Electron then spawns TWO instances
      // racing on the same encrypted db (no single-instance lock).
      if (purging) {
        return;
      }
      // Stage 12 ordering rule (insurance before surgery): once a harvest has
      // STARTED, local history must reach the kernel before it may die here.
      if (harvestModule.isIncomplete()) {
        throw new Error(
          'A history harvest is incomplete — finish uploading to the kernel before purging local data.',
        );
      }
      purging = true;
      disposeEventForwarding?.();
      disposeEventForwarding = null;
      disposeRuntimeSettingsWatcher?.();
      disposeRuntimeSettingsWatcher = null;
      sync?.stop();
      spendersRefresh?.dispose();
      sendEngine?.dispose();
      hub?.dispose();
      data?.close();
      await media.cache.clear().catch(() => undefined);
      await rm(join(userData, 'chatgoose.db'), { force: true });
      await rm(join(userData, 'chatgoose.db-wal'), { force: true });
      await rm(join(userData, 'chatgoose.db-shm'), { force: true });
      await rm(join(userData, 'media-cache'), { recursive: true, force: true });
      app.relaunch();
      app.exit(0);
    },
    onOfapiRuntimeConfigChanged: rebuildOfapiRuntimeFromSettings,
    onOfapiKeyConfigured: rebuildOfapiRuntimeFromSettings,
    onHubConfigChanged: async () => {
      await recheckHubConfig?.();
      emitSyncStatusFrame();
    },
    getCoreCreditsSummary: () => hub?.getOfapiCreditsSummary() ?? Promise.resolve(null),
    ...(logger !== null ? { logger } : {}),
    // Reads the update controller lazily — it is created asynchronously after
    // the electron-updater dynamic import, which may resolve after this call.
    updates: {
      status: () => updateStatusVM(updateController?.status() ?? null),
      check: async () =>
        updateStatusVM(updateController ? await updateController.check() : null),
      install: () => updateController?.install(),
    },
    testKey: (provider) => runKeyTest(provider, { keychain, settingsStore }),
    // Stage 24: one-time device-token sign-in (Settings → Hub). The token
    // lands in the keychain; the config recheck swings every hub consumer
    // (REST, SSE, read gateway) onto it without a restart.
    hubAuth: {
      issueDeviceToken: async ({ username, password }) => {
        const vm = await settingsStore.get();
        if (vm.hubBaseUrl === null) {
          throw new Error('Set the hub base URL first.');
        }
        const issued = await issueHubDeviceToken({
          baseUrl: vm.hubBaseUrl,
          username,
          password,
          label: hostname(),
          keychain,
        });
        // The fingerprint includes the resolved credential, so this recheck
        // reconfigures both the REST module and the SSE connection.
        await recheckHubConfig?.();
        emitSyncStatusFrame();
        return issued;
      },
    },
    harvest: {
      start: () => harvestModule.run(),
      pause: () => harvestModule.pause(),
      status: () => harvestModule.status(),
    },
    localData: {
      stats: async () => {
        const sizeOf = async (path: string): Promise<number> => {
          try {
            return (await stat(path)).size;
          } catch {
            return 0;
          }
        };
        const dbBytes = (
          await Promise.all([
            sizeOf(join(userData, 'chatgoose.db')),
            sizeOf(join(userData, 'chatgoose.db-wal')),
            sizeOf(join(userData, 'chatgoose.db-shm')),
          ])
        ).reduce((sum, n) => sum + n, 0);
        let mediaBytes = 0;
        let mediaFiles = 0;
        try {
          // Flat dir of encrypted files (media/cache.ts never nests).
          for (const name of await readdir(join(userData, 'media-cache'))) {
            mediaBytes += await sizeOf(join(userData, 'media-cache', name));
            mediaFiles += 1;
          }
        } catch {
          // Dir does not exist until the first media write.
        }
        return { dbBytes, mediaBytes, mediaFiles };
      },
      openFolder: async () => {
        await shell.openPath(userData);
      },
      exportDiagnostics: async () => {
        const vm = await settingsStore.get();
        // SettingsVM carries no secrets by construction, but the diagnostics
        // file is MEANT to leave the machine — so even the last4 fingerprints
        // are stripped (SPEC §15: no key material, partial included, exits main).
        const { keyMeta: _keyMeta, ...settingsForExport } = vm;

        // Local DB shape — counts only (no message text / PII), plus schema version.
        const countRows = (table: string): number => {
          try {
            const row = data?.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
              | { n?: number }
              | undefined;
            return typeof row?.n === 'number' ? row.n : 0;
          } catch {
            return 0;
          }
        };
        let schemaVersion: number | null;
        try {
          schemaVersion = data ? readSchemaVersion(data.db) : null;
        } catch {
          schemaVersion = null;
        }
        // Outbox audit: COUNTS of each anomaly class only — the audit arrays
        // carry message text, which must not leave the machine. Guarded: a sick
        // DB must not make the export (the thing you run WHEN sick) throw.
        let audit: ReturnType<typeof auditOutbox> | null;
        try {
          audit = data ? auditOutbox(data) : null;
        } catch {
          audit = null;
        }
        let guardAudit: ReturnType<MessageGuardRuntime['blocks']> | null;
        try {
          guardAudit = messageGuard?.blocks({ limit: 50 }) ?? null;
        } catch {
          guardAudit = null;
        }
        // Stage 4: quarantined usage events (HTTP-400 rejections) are never
        // resent — export count + payloads so nothing is silently lost. Usage
        // telemetry carries no message text; read straight from the table so
        // the section is present even while the hub module is off.
        let usageQuarantine: { count: number; events: unknown[] } | null;
        try {
          const rows = (data?.db
            .prepare('SELECT client_event_id AS id, payload, attempts FROM usage_events ORDER BY rowid ASC')
            .all() ?? []) as Array<{ id?: unknown; payload?: unknown; attempts?: unknown }>;
          const events: unknown[] = [];
          for (const row of rows) {
            if (typeof row.payload !== 'string') {
              continue;
            }
            try {
              const json = JSON.parse(row.payload) as unknown;
              if (
                typeof json === 'object' &&
                json !== null &&
                (json as Record<string, unknown>)['quarantined'] === true
              ) {
                events.push({ id: row.id, attempts: row.attempts, payload: json });
              }
            } catch {
              // Corrupt payloads fail wire validation at load; not a quarantine row.
            }
          }
          usageQuarantine = { count: events.length, events };
        } catch {
          usageQuarantine = null;
        }
        // Flush then read the DURABLE on-disk log so a crash from a PRIOR
        // session is in the export even though the in-memory ring restarted.
        await logger?.flush();
        const fileLog = logger ? await logger.readFileTail() : [];
        const coreCredits = await hub?.getOfapiCreditsSummary().catch((error) => {
          logger?.warn('diag', 'core OFAPI credit summary unavailable for diagnostics', {
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        }) ?? null;

        const report = buildDiagnosticsReport(
          {
            generatedAt: new Date().toISOString(),
            app: {
              version: app.getVersion(),
              electron: process.versions.electron,
              chrome: process.versions.chrome,
              node: process.versions.node,
              platform: process.platform,
              arch: process.arch,
            },
            runtime: {
              uptimeMs: Math.round(process.uptime() * 1000),
              locale: app.getLocale(),
              uiLocale,
            },
            settings: settingsForExport,
            sync: sync?.status() ?? null,
            hub: sync?.hubStatus?.() ?? null,
            hubActivity: sync?.hubActivity?.() ?? null,
            credits: client?.creditMeter.snapshot() ?? null,
            coreCredits,
            db: {
              schemaVersion,
              counts: {
                accounts: countRows('accounts'),
                chats: countRows('chats'),
                messages: countRows('messages'),
                summaries: countRows('summaries'),
                outbox: countRows('outbox'),
                messageGuardEvents: countRows('message_guard_events'),
              },
            },
            outboxAudit: audit
              ? {
                  totals: audit.totals,
                  cleanSends: audit.cleanSends,
                  doubleClaims: audit.doubleClaims.length,
                  suspectDuplicates: audit.suspectDuplicates.length,
                  staleUnconfirmed: audit.staleUnconfirmed.length,
                  sentMissingFromMessages: audit.sentMissingFromMessages.length,
                }
              : null,
            messageGuardAudit: guardAudit,
            usageQuarantine,
            errorCounts: logger?.errorCounts() ?? {},
            logs: logger?.snapshot() ?? [],
            fileLog,
          },
          redactionSecrets,
        );

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = join(userData, `chatgoose-diagnostics-${stamp}.json`);
        await writeFile(file, JSON.stringify(report, null, 2), 'utf8');
        logger?.info('diag', 'diagnostics exported', {
          file,
          logRecords: logger.snapshot().length,
        });
        shell.showItemInFolder(file);
        return { path: file };
      },
    },
  });

  reattachEventForwarding();

  // Dev-only evidence hook: CHATGOOSE_CAPTURE=/path/prefix captures the window
  // every 10 s (prefix-1.png, prefix-2.png, …) so a live run can be documented
  // without manual interaction. No effect in packaged builds.
  if (!app.isPackaged && process.env['CHATGOOSE_CAPTURE']) {
    const prefix = process.env['CHATGOOSE_CAPTURE'];
    let shot = 0;
    setInterval(() => {
      const win = mainWindow;
      if (!win || win.isDestroyed()) {
        return;
      }
      shot += 1;
      void win.webContents.capturePage().then(async (image) => {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(`${prefix}-${shot}.png`, image.toPNG());
      });
    }, 10_000);
  }

  mainWindow.on('focus', () => sync?.setWindowVisible(true));
  mainWindow.on('show', () => sync?.setWindowVisible(true));
  mainWindow.on('hide', () => sync?.setWindowVisible(false));
  mainWindow.on('minimize', () => sync?.setWindowVisible(false));

  loadWindowContent(mainWindow);
}

// Dev-only smoke hook: run a keyless Hub profile without touching the real dev
// userData. Packaged builds ignore env overrides so production profile custody
// stays stable.
const devUserDataDir = !app.isPackaged ? process.env['CHATGOOSE_USER_DATA_DIR']?.trim() : undefined;
if (devUserDataDir !== undefined && devUserDataDir.length > 0) {
  app.setPath('userData', resolve(devUserDataDir));
}

// Packaged builds get their own userData dir named after the product.
// Electron derives the app name from package.json ("@chatgoose/desktop"),
// which would nest userData under "appData/@chatgoose/" and COLLIDE with the
// dev profile — the packaged-app smoke run (PLAN item 11) found it reading
// dev's dbKey.secret and failing to decrypt (different binary, Keychain/DPAPI
// denies). Dev keeps the historical path unless CHATGOOSE_USER_DATA_DIR was
// provided for an isolated smoke run; packaged installs start clean.
if (app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'ChatGoose'));
}

// Single-instance lock (PLAN item 11): a second process on the same encrypted
// db would double polling/credits and race the SQLite WAL. macOS masks this
// (dock launches re-activate the running app) but on Windows every shortcut
// click is a fresh process — the loser exits, the winner surfaces its window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusExistingWindow(mainWindow));

  // Windows toasts only fire when the process AUMID matches the Start-menu
  // shortcut's; electron-builder stamps shortcuts with the appId, so use it
  // verbatim (electron-builder.yml). No-op outside Windows.
  app.setAppUserModelId('com.chatgoose.desktop');

  app.whenReady().then(() => {
    buildAppMenu();
    // A failed boot used to die as an unhandled rejection behind a blank
    // window; surface it (PLAN item 11 — a non-developer runs verification).
    boot().catch((err: unknown) => {
      logger?.error('boot', 'fatal startup error', errorToFields(err));
      void logger?.flush();
      dialog.showErrorBox(
        'ChatGoose failed to start',
        err instanceof Error ? err.message : String(err),
      );
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  logger?.info('app', 'quit');
  void logger?.flush();
  disposeRuntimeSettingsWatcher?.();
  sync?.stop();
  sendEngine?.dispose();
  coordinator?.dispose();
  hub?.dispose();
  data?.close();
});
