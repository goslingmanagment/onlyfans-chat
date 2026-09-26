import { createFollowersService, type FollowersService } from './followers/service';
import { generateFollowerGreeting } from './followers/generation';
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
  powerMonitor,
  protocol,
  safeStorage,
  shell,
} from 'electron';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { resolveUiLocale, uiMessage, type UiLocale } from '@chatgoose/shared/i18n/index';
import { errorToFields } from '@chatgoose/shared/diagnostics/log';
import { createKeychain, type Keychain, type SecretName } from './secrets/keychain';
import { createDataLayer, readSchemaVersion, type DataLayer } from './db/index';
import { SCHEMA_VERSION } from './db/migrations';
import {
  createHarvestModule,
  finishHarvestDeltaBeforePurge,
  type HarvestModule,
} from './harvest/index';
import { createHubClient, type HubClient } from '@chatgoose/shared/hub/index';
import { createLogger, type Logger } from './diagnostics/logger';
import { buildDiagnosticsReport, settingsForDiagnosticsExport } from './diagnostics/report';
import { runKeyTest } from './diagnostics/key-tests';
import { auditOutbox } from './send/audit';
import { createSettingsStore, settingsPatchSchema, type SettingsStore } from './settings/store';
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
import {
  createMessageGuardRuntime,
  createPrunedMessageGuardRuntime,
  type MessageGuardRuntime,
} from './message-guard/runtime';
import { createVaultService, type VaultService } from './media/vault';
import { createSpendersService, type SpendersService } from './spenders/service';
import { createOnlineService, type OnlineService } from './online/service';
import { createSpendersRefresh, type SpendersRefreshService } from './spenders/refresh';
import {
  applyAccountGrantSnapshot,
  createPollingSync,
} from './sync/polling-sync';
import { createBudgetGuard } from './sync/budget-guard';
import {
  createHubSync,
  HUB_SNAPSHOT_CURSOR_CONTRACT,
  HUB_SNAPSHOT_MESSAGE_LIMIT,
  type HubSnapshotRecoveryProgress,
} from './sync/hub-sync';
import { createHubAwareSync, type HubAwareSync } from './sync/hub-provider';
import { registerIpcHandlers } from './ipc/handlers';
import { createAiCoordinator, type AiCoordinator } from './ai/index';
import { createHubModule, type HubModule } from './hub/index';
import {
  acceptanceDestinationIdentity,
  createAcceptanceTracker,
  enqueueAcceptanceEvent,
  type AcceptanceTracker,
} from './hub/acceptance-reporter';
import { summarizeUsageSpool } from './hub/usage-store';
import { hostname, tmpdir } from 'node:os';
import { deviceTokenDigest } from './hub/credential-journal';
import { hubAuthReasonOf, recoverFromHubAuthFailure } from './hub/auth-recovery';
import {
  abandonHubDeviceTokenCustody,
  beginHubDeviceTokenRevocation,
  issueHubDeviceToken,
  recoverHubDeviceTokenLifecycle,
  requestHubDeviceTokenActivationCancellation,
} from './hub/device-token';
import { attachEventForwarding } from './ipc/events';
import { focusExistingWindow } from './platform/single-instance';
import { badgePng } from './platform/badge';
import {
  createManualUpdateController,
  createUpdateController,
  MANUAL_DOWNLOAD_PAGE_URL,
  shouldAutoUpdate,
  shouldNotifyManualUpdate,
  startAutoUpdater,
  type AppUpdaterLike,
  type UpdateController,
} from './platform/updater';
import {
  appendSearchToUrl,
  isAllowedDevRendererUrl,
  isAllowedExternalOpenUrl,
} from './platform/navigation';
import {
  messageNotificationBody,
  messageNotificationTitle,
  purchaseNotification,
  shouldShowOsNotification,
} from './notifications';
import { awaitRendererLoad } from './window-load';
import { createRendererReadiness } from './renderer-readiness';
import {
  createWindowVisibilityTracker,
  isWindowBackgrounded,
  wireWindowLifecycle,
} from './window-lifecycle';
import {
  activateStoredCredentialWithRetry,
  createBoundedRetry,
  createBeforeQuitBarrier,
  createRuntimeMutationQueue,
  createSerializedCredentialLifecycle,
  drainRuntimeThenFinishCustody,
  exitAfterFatalBoot,
  exposeUiBeforeRuntimeActivation,
  finishPurgeCustody,
  hubCredentialNeedsAttention,
  prepareAndCommitRuntimeAccounts,
  probeHubReadCredential,
  requireSettledDeviceCredentialCustody,
  runFailClosedTerminalPurge,
  sealRuntimeForTerminalOperation,
  settleDeviceCredentialBeforePurge,
  stopRuntimeServices,
  subscribeSettingsScope,
} from './runtime-activation';
import type {
  OpenChatEvent,
  UnreadReconcileSettingsVM,
  UpdateModeVM,
  UpdateStatusVM,
} from '../preload/contract';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';

protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_PRIVILEGES]);

const HUB_OFAPI_READ_TIMEOUT_MS = 75_000;
/** D38 instrumentation: process start (launch → first page-1 paint). */
const PROCESS_LAUNCHED_AT_MS = Date.now() - Math.round(process.uptime() * 1000);

let mainWindow: BrowserWindow | null = null;
const rendererReadiness = createRendererReadiness();
const windowVisibility = createWindowVisibilityTracker(false);

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
let followersService: FollowersService | null = null;
let spendersRefresh: SpendersRefreshService | null = null;
let hub: HubModule | null = null;
/** Process-scoped so inserted→sent correlation survives runtime rebuilds for
 * the same destination actor. Credential/principal swaps clear it at commit. */
let acceptanceTracker: AcceptanceTracker | null = null;
/** Exact Hub origin + credential/principal fingerprint owning acceptance state. */
let activeAcceptanceDestinationIdentity: string | null = null;
let disposeEventForwarding: (() => void) | null = null;
let disposeRuntimeSettingsWatcher: (() => void) | null = null;
let disposeRuntimeCreditMeter: (() => void) | null = null;
const ofapiRuntimeMutations = createRuntimeMutationQueue();
let cancelRuntimeRetries: (() => void) | null = null;
/** Set once a packaged Windows/macOS updater controller is ready; null in dev
 *  and on unsupported platforms. */
let updateController: UpdateController | null = null;
let updateMode: UpdateModeVM = 'unsupported';
/** Set by initOfapi; lets cmd:settings.update trigger a hub-config recheck. */
let recheckHubConfig: (() => Promise<void>) | null = null;
/** I116-2 (W4.1): boot-time runtime activation failed AUTH (CG-HUB-01).
 *  While set, query:sync.status reports hub:'auth-failed' even though sync is
 *  null — the existing banner + sign-out UI engage instead of a false
 *  "not configured". Cleared by any successful initOfapi. */
let bootHubAuthFailed = false;
/** Raw credential custody exists but its Hub origin/digest binding is absent or
 * invalid. Kept separate from auth failure because no network request is made. */
let hubCredentialAttention = false;
/** D35 §9 п.4: the ONE self-healing funnel every hub transport reports into.
 *  Boot installs it; the bearer digest identifies the runtime generation whose
 *  credential was rejected, so a late failure from a retired client can never
 *  delete a newer sign-in. Null before boot wires it (and in the smoke run). */
let hubAuthSelfHeal: ((error: unknown, bearerDigest: string) => void) | null = null;

/** OfApiError and HubError both carry code CG-HUB-01 for hub auth rejections. */
function isHubAuthFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'CG-HUB-01'
  );
}

/**
 * Stop and unpublish every credential-bound runtime service. Runtime swaps and
 * token-only sign-out share this path, so a missing replacement credential can
 * never leave old authenticated clients reachable. The send-engine quiesce
 * barrier is awaited before disposal/publishing a replacement engine.
 */
async function deactivateOfapiRuntime(): Promise<void> {
  const previousFollowers = followersService;
  const previousSync = sync;
  const previousSpendersRefresh = spendersRefresh;
  const previousSendEngine = sendEngine;
  const previousCoordinator = coordinator;
  const previousHub = hub;
  const previousEventForwarding = disposeEventForwarding;
  const previousSettingsWatcher = disposeRuntimeSettingsWatcher;
  const previousCreditMeter = disposeRuntimeCreditMeter;

  // Unpublish first: IPC getters immediately stop handing out the outgoing
  // runtime while its pumps are draining.
  client = null;
  sync = null;
  hub = null;
  sendEngine = null;
  coordinator = null;
  vaultService = null;
  spendersService = null;
  onlineService = null;
  followersService = null;
  spendersRefresh = null;
  recheckHubConfig = null;
  disposeEventForwarding = null;
  disposeRuntimeSettingsWatcher = null;
  disposeRuntimeCreditMeter = null;

  await previousFollowers?.dispose();
  await stopRuntimeServices({
    disposeEventForwarding: previousEventForwarding,
    disposeSettingsWatcher: previousSettingsWatcher,
    disposeCreditMeter: previousCreditMeter,
    sync: previousSync,
    spendersRefresh: previousSpendersRefresh,
    sendEngine: previousSendEngine,
    coordinator: previousCoordinator,
    hub: previousHub,
  });
}
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

/** Stamp platform capability + running version onto a controller snapshot. */
function updateStatusVM(status: ReturnType<UpdateController['status']> | null): UpdateStatusVM {
  const currentVersion = app.getVersion();
  if (status === null) {
    return {
      mode: 'unsupported',
      phase: 'unsupported',
      version: null,
      percent: null,
      message: null,
      currentVersion,
    };
  }
  return { ...status, mode: updateMode, currentVersion };
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
  if (updateController !== null) {
    return;
  }
  // macOS packaged builds can't self-install (unsigned — Squirrel.Mac refuses),
  // so they get the notify-only controller (D21): poll the download page's
  // version-mac.json, report phase `manual`, and `install()` opens the page.
  if (shouldNotifyManualUpdate(process.platform, app.isPackaged)) {
    const manualController = createManualUpdateController({
      currentVersion: app.getVersion(),
      fetchManifest: async () => {
        const res = await fetch(`${MANUAL_DOWNLOAD_PAGE_URL}version-mac.json`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`version-mac.json HTTP ${res.status}`);
        }
        return (await res.json()) as unknown;
      },
      openDownloadPage: () => void shell.openExternal(MANUAL_DOWNLOAD_PAGE_URL),
      onAvailable: (version) => {
        if (Notification.isSupported()) {
          const n = new Notification({
            title: uiMessage(uiLocale, 'notif.updateManualTitle'),
            body: uiMessage(uiLocale, 'notif.updateManualBody', { version }),
            silent: true,
          });
          n.on('click', () => void shell.openExternal(MANUAL_DOWNLOAD_PAGE_URL));
          n.show();
        }
      },
    });
    updateMode = 'manual';
    updateController = manualController;
    startAutoUpdater({ controller: manualController });
    return;
  }
  if (!shouldAutoUpdate(process.platform, app.isPackaged)) {
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
      updateMode = 'automatic';
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

function loadWindowContent(win: BrowserWindow): Promise<void> {
  // Dev convenience: CHATGOOSE_OPEN_VIEW=settings|spenders|online boots straight
  // into that view (e.g. documenting a live run). No effect packaged.
  const openView = !app.isPackaged ? process.env['CHATGOOSE_OPEN_VIEW'] : undefined;
  const search =
    openView === 'settings' || openView === 'spenders' || openView === 'online'
      ? `view=${openView}`
      : null;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const webContentsId = win.webContents.id;
  const rendererReady = rendererReadiness.waitForNext(webContentsId);
  let loaded: Promise<void>;
  if (!app.isPackaged && isAllowedDevRendererUrl(rendererUrl)) {
    loaded = awaitRendererLoad(
      win.webContents,
      () => win.loadURL(appendSearchToUrl(rendererUrl, search)),
      rendererReady,
    );
  } else {
    loaded = awaitRendererLoad(
      win.webContents,
      () =>
        win.loadFile(join(import.meta.dirname, '../renderer/index.html'), {
          ...(search !== null ? { search } : {}),
        }),
      rendererReady,
    );
  }
  return loaded.finally(() => rendererReadiness.cancel(webContentsId));
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
  const webContentsId = win.webContents.id;
  wireWindowLifecycle(win, {
    setWindowVisible: (visible) => windowVisibility.update(visible, sync),
    onClosed: (closedWindow) => {
      rendererReadiness.cancel(webContentsId, new Error('Window closed before renderer readiness'));
      if (mainWindow === closedWindow) {
        mainWindow = null;
      }
    },
  });
  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });
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
    void loadWindowContent(win).catch((error: unknown) => {
      logger?.error('renderer', 'window content load failed', errorToFields(error));
    });
  }
  return win;
}

/** Caller already owns ofapiRuntimeMutations; never re-enter the queue here. */
async function activateOfapiRuntimeInsideMutation(
  keychain: Keychain,
  dataLayer: DataLayer,
  settingsStore: SettingsStore,
  isBoot: boolean,
): Promise<void> {
  await rebuildOfapiRuntime(keychain, dataLayer, settingsStore, isBoot);
  // I116-2 (W4.1): a successful (re)build clears the boot-auth latch — the
  // credential now works (or was deliberately cleared to a keyless state).
  bootHubAuthFailed = false;
}

async function rebuildOfapiRuntime(
  keychain: Keychain,
  dataLayer: DataLayer,
  settingsStore: SettingsStore,
  isBoot: boolean,
): Promise<void> {
  const classifyCredentialAttention = hubCredentialNeedsAttention;
  const attentionSettings = await settingsStore.get();
  hubCredentialAttention = classifyCredentialAttention(attentionSettings);
  let initialConnection: Awaited<ReturnType<SettingsStore['getHubConnection']>>;
  try {
    initialConnection = await settingsStore.getHubConnection();
  } catch (error) {
    // A second keychain read can fail after buildVm already classified custody
    // (DPAPI/profile mutation). Refresh the visible latch before propagating the
    // fail-closed activation error so Settings is not the only recovery surface.
    try {
      hubCredentialAttention = classifyCredentialAttention(await settingsStore.get());
    } catch {
      hubCredentialAttention = hubCredentialAttention
        || attentionSettings.hasHubDeviceToken;
    }
    throw error;
  }
  const initialSettings = initialConnection.settings;
  // getHubConnection performs its own keychain reads after buildVm. Surface a
  // credential that became unreadable or mismatched during that second read;
  // otherwise the connection correctly fails closed but the global recovery
  // indicator can remain stale until Settings is opened.
  hubCredentialAttention = hubCredentialAttention
    || classifyCredentialAttention(initialSettings);
  const hubBearer = initialConnection.bearer;
  // One reporter per runtime generation, bound to the exact bearer it uses.
  const activeBearerDigest = hubBearer === null ? null : deviceTokenDigest(hubBearer);
  const noteHubAuthFailure = (error: unknown): void => {
    if (activeBearerDigest === null) return;
    hubAuthSelfHeal?.(error, activeBearerDigest);
  };
  const nextAcceptanceDestinationIdentity =
    initialSettings.hubBaseUrl !== null && hubBearer !== null
      ? acceptanceDestinationIdentity(initialSettings.hubBaseUrl, hubBearer)
      : null;
  const creditMeter = createCreditMeter();
  const onError =
    (transport: 'hub'): NonNullable<OfApiClientOptions['onError']> =>
    (error, context): void => {
      logger?.warn('ofapi', `${context.purpose} ${error.code}`, {
        code: error.code,
        transport,
        url: context.url,
        ...errorToFields(error),
      });
      // D35: the read gateway is the transport a cold start hits FIRST — a
      // revoked credential used to wedge here with no SDK request in sight.
      noteHubAuthFailure(error);
    };
  const onRequestEvent =
    (transport: 'hub'): NonNullable<OfApiClientOptions['onRequestEvent']> =>
    (event: OfApiRequestEvent): void => {
      followersService?.onRequestEvent(event);
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
    hubBearer === null ||
    hubBearer.length === 0
  ) {
    logger?.warn('ofapi', 'hub read transport not configured', {
      transport: 'hub',
      hasHubBaseUrl: initialSettings.hubBaseUrl !== null,
      hasHubBearer: hubBearer !== null && hubBearer.length > 0,
    });
    await deactivateOfapiRuntime();
    return;
  }
  const readClient = createOfApiClient({
    apiKey: hubBearer,
    baseUrl: buildHubOfApiReadBaseUrl(initialSettings.hubBaseUrl),
    authErrorCode: 'CG-HUB-01',
    requestTimeoutMs: HUB_OFAPI_READ_TIMEOUT_MS,
    creditMeter,
    onError: onError('hub'),
    onRequestEvent: onRequestEvent('hub'),
    // Stage 4 / Proposal 4.1: every hub request carries x-client-version, the
    // fleet-version exit signal — this is the read-gateway lane.
    clientVersion: app.getVersion(),
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
  let disposeCandidateCreditMeter: (() => void) | null = nextClient.creditMeter.subscribe((snapshot) => {
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

  // Hub Sync config fingerprint: reconfigure the SSE connection only when the base
  // URL or the chatter key actually changed — NOT on every settings write
  // (HubSync itself persists hubSync.lastEventId into the settings table, so a
  // naive resubscribe-on-settings-change would loop the stream forever).
  async function hubSyncConfigFingerprint(): Promise<string> {
    const connection = await settingsStore.getHubConnection();
    const vm = connection.settings;
    settingsCache = vm;
    const hubKey = connection.bearer;
    return `${vm.hubBaseUrl ?? ''}\n${hubKey ?? ''}\n${vm.hubModeOverride}\n${vm.hubSyncProtocol}`;
  }
  let hubSyncFingerprint = await hubSyncConfigFingerprint();

  // 4d: attach the runtime settings watcher at CANDIDATE creation — before the
  // (possibly slow) account bootstrap below — so a settings write DURING the
  // rebuild is folded into settingsCache instead of being missed until the next
  // write. Its disposer is adopted by the module-level binding on commit, or
  // released in the !committed cleanup (symmetric with the other candidate
  // resources). While the candidate builds, the outgoing runtime's own watcher
  // stays live too; each updates its independent settingsCache closure.
  let disposeCandidateSettingsWatcher: (() => void) | null = subscribeSettingsScope(
    dataLayer.bus,
    () => {
      void settingsStore.get().then((vm) => {
        settingsCache = vm;
      });
    },
  );

  // Minting registers the remote URL in media_urls; only registered tokens
  // resolve through the media:// handler (SPEC §4).
  const toMediaUrl = createToMediaUrl(dataLayer.mediaUrls);
  // D38: PollingSync reports list reads to the hub-aware provider built right
  // after it (SYNCING state, sync intents) — late-bound on purpose.
  let listReadSink: HubAwareSync | null = null;
  const polling = createPollingSync({
    client: nextClient,
    data: dataLayer,
    toMediaUrl,
    // DIAGNOSTIC (temporary — empty-thread investigation 2026-06-23): scope 'diag'.
    onLog: (level, message, fields) => logger?.log(level, 'diag', message, fields),
    launchedAtMs: PROCESS_LAUNCHED_AT_MS,
    onListRead: (record) => listReadSink?.handleListRead(record),
    onListVerificationFailed: (accountId, reason) =>
      listReadSink?.handleListVerificationFailed(accountId, reason),
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
  const snapshotRecoveryProgressSchema: z.ZodType<HubSnapshotRecoveryProgress> = z.strictObject({
    version: z.literal(2),
    scope: z.string().min(1),
    protocol: z.enum(['v2', 'v1']),
    cursorContract: z.literal(HUB_SNAPSHOT_CURSOR_CONTRACT),
    messageLimit: z.literal(HUB_SNAPSHOT_MESSAGE_LIMIT),
    afterSeq: z.number().int().nonnegative(),
    accountIds: z.array(z.string().min(1)).max(1_000),
    accountIndex: z.number().int().nonnegative(),
    snapshotCursor: z.number().int().nonnegative(),
    pageMode: z.enum(['probe', 'bounded', 'legacy']),
    pageCursor: z.number().int().nonnegative(),
    stateCursor: z.string().min(1).nullable(),
    boundedStateAt: z.string().datetime().nullable(),
    sourceV2Cursor: z.string().min(1).nullable(),
    targetV2Cursor: z.string().min(1).nullable(),
  });
  // D39: the money-facts catch-up reads Core's ledger through the SDK client
  // with the stream's own credential, resolved per call (a key or URL change
  // reconfigures the stream and gets a fresh client here).
  let moneyFactsClient: { key: string; client: HubClient } | null = null;
  async function currentMoneyFactsClient(): Promise<HubClient> {
    const connection = await settingsStore.getHubConnection();
    const baseUrl = connection.settings.hubBaseUrl;
    const bearer = connection.bearer;
    if (baseUrl === null || bearer === null || bearer.length === 0) {
      throw new Error('hub is not configured');
    }
    const key = `${baseUrl}\n${bearer}`;
    if (moneyFactsClient === null || moneyFactsClient.key !== key) {
      moneyFactsClient = {
        key,
        client: createHubClient({
          baseUrl,
          apiKey: bearer,
          clientVersion: app.getVersion(),
          onAuthFailure: noteHubAuthFailure,
        }),
      };
    }
    return moneyFactsClient.client;
  }
  const nextSync = createHubAwareSync({
    polling,
    data: dataLayer,
    onLog: (level, message, fields) => logger?.log(level, 'sync', message, fields),
    hubModeOverride: () => settingsCache?.hubModeOverride ?? 'auto',
    autoReadEnabled: () => settingsCache?.autoReadChats ?? false,
    moneyFacts: async ({ hubAccountId, afterSeq, limit }) =>
      (await currentMoneyFactsClient()).listMoneyFacts({ accountId: hubAccountId, afterSeq, limit }),
    // Resolved per (re)connect attempt so settings edits take effect on
    // reconfigureHub without re-running OFAPI init. Null = hub mode off.
    createHub: async (
      {
        onEvent,
        onCaughtUp,
        onStatusChange,
        onSnapshot,
        onSnapshotRequired,
        onV2GapRecovered,
        onServerDate,
        onAccountPages,
      },
      accountIds,
    ) => {
      const connection = await settingsStore.getHubConnection();
      const vm = connection.settings;
      const hubKey = connection.bearer;
      if (vm.hubBaseUrl === null || hubKey === null || hubKey.length === 0) {
        return null;
      }
      // D1-N1 (W4.2) hardening: the v2 cursor encodes the bearer's account
      // grants, so it is scoped to the credential that earned it — a key
      // paste or re-sign-in gets a fresh cursor handshake instead of a dead
      // stream. The un-suffixed legacy key is left unread (wiped on hub
      // switch by the settings store).
      const v2CursorKey = `hubSync.v2Cursor.${createHash('sha256').update(hubKey).digest('hex').slice(0, 16)}`;
      // Replay-gap page progress is doubly scoped: the settings row key and
      // its validated payload both bind the normalized Hub origin + bearer.
      // This prevents a re-sign-in (or the same token string on another Hub)
      // from resuming a state cursor earned under different grants.
      const snapshotProgressScope = createHash('sha256')
        .update(`${vm.hubBaseUrl}\n${hubKey}`)
        .digest('hex');
      const snapshotProgressKey = `hubSync.snapshotProgress.${snapshotProgressScope}`;
      return createHubSync({
        baseUrl: vm.hubBaseUrl,
        apiKey: hubKey,
        // Stage 24: v2 by default; 'v1' is the rollout-window-only fallback
        // (settings-file flip, no UI).
        protocol: vm.hubSyncProtocol,
        // Stage 4 / Proposal 4.1: an idle-but-connected SSE-only install must
        // still show up in the fleet-adoption release gate.
        clientVersion: app.getVersion(),
        accountIds,
        // D38: one SQLite transaction per frame — local state, sync intents
        // and the v2 cursor (a settings row of this same DB) commit together.
        runInTransaction: (fn) => dataLayer.db.transaction(fn),
        platform: 'onlyfans',
        onServerDate,
        onEvent,
        onCaughtUp,
        onSnapshot,
        onSnapshotRequired,
        onV2GapRecovered,
        onAccountPages,
        onStatusChange,
        onWarn: (message, fields) => logger?.warn('hub-sse', message, fields),
        // v1 resume checkpoint is global per chatter key (core fanout_seq);
        // the v2 cursor is opaque and lives under its own key — lastEventId
        // is retained untouched for the fallback window.
        getLastEventId: () =>
          dataLayer.settings.getParsed('hubSync.lastEventId', lastEventIdSchema) ?? null,
        setLastEventId: (id) => dataLayer.settings.set('hubSync.lastEventId', id),
        getV2Cursor: () =>
          dataLayer.settings.getParsed(v2CursorKey, v2CursorSchema) ?? null,
        setV2Cursor: (cursor) => dataLayer.settings.set(v2CursorKey, cursor),
        clearV2Cursor: () => dataLayer.settings.remove(v2CursorKey),
        snapshotProgressScope,
        getSnapshotProgress: () =>
          dataLayer.settings.getParsed(
            snapshotProgressKey,
            snapshotRecoveryProgressSchema,
          ) ?? null,
        setSnapshotProgress: (progress) =>
          dataLayer.settings.set(snapshotProgressKey, progress),
        clearSnapshotProgress: () => dataLayer.settings.remove(snapshotProgressKey),
      });
    },
  });

  listReadSink = nextSync;

  // Hub REST cluster (SPEC §8.5/§8.6): summary push + usage reporter. It stays
  // alive for this candidate runtime's whole lifetime. URL/bearer changes
  // replace the complete runtime; a mode-only SSE reconnect must not retire it
  // underneath an already-streaming AI operation.
  const nextHub = createHubModule({
    data: dataLayer,
    settingsStore,
    keychain,
    // The SDK lane reports into the same funnel as the read gateway.
    onAuthFailure: noteHubAuthFailure,
    // Stage 4 / Proposal 4.1: every hub request carries x-client-version, the
    // fleet-version exit signal (and Stage 11's producer version upstream).
    clientVersion: app.getVersion(),
    onWarn: (message, fields) => logger?.warn('hub', message, fields),
  });
  await nextHub.reconfigure();

  const recheckNextHubSyncConfig = async (): Promise<void> => {
    const next = await hubSyncConfigFingerprint();
    if (next !== hubSyncFingerprint) {
      hubSyncFingerprint = next;
      await nextSync.reconfigureHub();
    }
  };
  // Hub-supported writes (text, typing, unsend, mark-read, media/PPV) are the
  // only app write path. The local OFAPI key may still back Direct reads, but it
  // is never passed to the send engine.
  const engine = createSendEngine({
    client: nextClient,
    hubCommandClient: nextHub.commandClient,
    data: dataLayer,
    messageGuard: messageGuard ?? createMessageGuardRuntime({
      data: dataLayer,
      isPruneFrozen: () => harvestIsIncomplete(),
    }),
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
    scopeChatIds: (accountId, scope, mappedListIds) => spendersSvc.scopeChatIds(accountId, scope, mappedListIds),
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
    settingsStore,
    featureGateway: nextHub.aiFeatureGateway,
    summaryHub: nextHub.summaryHub,
    onAcceptanceEvent: (event) => {
      try {
        dataLayer.aiAcceptance.remember({
          operationId: event.operationId,
          requestId: event.requestId,
          feature: event.feature,
          accountId: event.accountId,
          conversationId: event.conversationId,
          parts: [],
          day: event.at.slice(0, 10),
          knownAt: event.at,
        });
      } catch (error) {
        logger?.warn('ai', 'failed to persist acceptance operation correlation', errorToFields(error));
      }
      nextHub.onAcceptanceEvent(event);
    },
    onCompletedOperation: (context) => {
      const completedAt = new Date().toISOString();
      try {
        dataLayer.aiAcceptance.remember({
          operationId: context.operationId,
          requestId: context.requestId,
          feature: context.feature,
          accountId: context.accountId,
          conversationId: context.chatId,
          parts: context.parts,
          day: completedAt.slice(0, 10),
          knownAt: completedAt,
        });
      } catch (error) {
        logger?.warn('ai', 'failed to persist completed acceptance context', errorToFields(error));
      }
    },
  });

  const nextFollowers = createFollowersService({
    client: nextClient, data: dataLayer, toMediaUrl,
    isDebug: () => dataLayer.settings.get('debugMode') === true,
    onChanged: (accountId) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('followers:changed', { accountId }); },
    generate: (accountId, fanId, signal) => generateFollowerGreeting(nextCoordinator, accountId, fanId, signal),
    enqueue: (accountId, fanId, text) => {
      const id = engine.sendParts({ accountId, chatId: fanId, parts: [text], outreachPurpose: 'new-follower' }).localIds[0];
      if (!id) throw new Error('Greeting was not queued');
      return id;
    },
  });
  let committed = false;
  try {
    // Load without DB writes; commit grants only after the old runtime drains.
    const accountIds = await prepareAndCommitRuntimeAccounts({
      loadSnapshot: () => nextClient.listAccounts({ purpose: 'hydration' }),
      reconcile: (boot) => engine.reconcileOnBoot(boot),
      deactivateOutgoing: deactivateOfapiRuntime,
      applySnapshot: (snapshot) =>
        applyAccountGrantSnapshot(snapshot, dataLayer, toMediaUrl),
      isBoot,
    });

    const aiDestinationChanged =
      activeAcceptanceDestinationIdentity !== nextAcceptanceDestinationIdentity;
    if (aiDestinationChanged) {
      acceptanceTracker?.clear();
      dataLayer.aiAcceptance.discardUnaccepted();
    }

    client = nextClient;
    sync = nextSync;
    hub = nextHub;
    sendEngine = engine;
    coordinator = nextCoordinator;
    vaultService = nextVaultService;
    spendersService = nextSpendersService;
    onlineService = nextOnlineService;
    followersService = nextFollowers;
    spendersRefresh = nextSpendersRefresh;
    activeAcceptanceDestinationIdentity = nextAcceptanceDestinationIdentity;
    if (aiDestinationChanged) {
      // Covers background device-token activation/recovery as well as direct
      // Settings mutations: renderer results from the old actor are no longer
      // actionable once the credential-bound runtime commits.
      dataLayer.bus.publish({ scope: 'settings', settingsKeys: ['runtime.aiContext'] });
    }
    recheckHubConfig = recheckNextHubSyncConfig;
    // Adopt the candidate watcher attached at creation (4d) as the live one.
    disposeRuntimeSettingsWatcher = disposeCandidateSettingsWatcher;
    disposeCandidateSettingsWatcher = null;
    disposeRuntimeCreditMeter = disposeCandidateCreditMeter;
    disposeCandidateCreditMeter = null;

    // Subscribe before the batched grant invalidation flushes.
    reattachEventForwarding();

    // The native window may have been hidden before this replacement existed;
    // transfer the last state before scheduling its first polling cadence.
    windowVisibility.apply(nextSync);
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
      await nextFollowers.dispose();
      disposeCandidateSettingsWatcher?.();
      unsubscribeSendSync();
      disposeCandidateCreditMeter?.();
      nextSpendersRefresh.dispose();
      engine.dispose();
      nextCoordinator.dispose();
      await nextHub.quiesce();
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
        // The type check narrows for messageNotificationBody below; the
        // actual decision (including it) lives in the tested helper.
        event.type === 'messageReceived' &&
        shouldShowOsNotification({
          event,
          windowBackgrounded: isWindowBackgrounded(mainWindow),
          notificationsEnabled: notificationPrefs.notificationsEnabled,
          notificationsSupported: Notification.isSupported(),
        })
      ) {
        const chat = liveData.chats.get(event.accountId, event.chatId);
        new Notification({
          title: messageNotificationTitle(uiLocale, event, chat?.fanName, 'os'),
          body: messageNotificationBody(uiLocale, event),
          silent: true,
        }).show();
      }
      if (
        (event.type === 'ppvUnlocked' || event.type === 'tipReceived') &&
        shouldShowOsNotification({
          event,
          windowBackgrounded: isWindowBackgrounded(mainWindow),
          notificationsEnabled: notificationPrefs.notificationsEnabled,
          notificationsSupported: Notification.isSupported(),
        })
      ) {
        showPurchaseNotification(event, liveData.chats.get(event.accountId, event.chatId)?.fanName);
      }
    },
  });
  emitSyncStatusFrame();
}

/** Purchase notifications stay referenced until they close: a collected
 * Electron Notification loses its click handler. */
const livePurchaseNotifications = new Set<Notification>();

/**
 * D39 quiet purchase alert, OS side: always silent (no sound, owner
 * decision); a click brings the window forward and opens the fan's chat.
 */
function showPurchaseNotification(
  event: Extract<SyncEvent, { type: 'ppvUnlocked' | 'tipReceived' }>,
  chatFanName: string | undefined,
): void {
  const { title, body } = purchaseNotification(uiLocale, event, chatFanName);
  const notification = new Notification({ title, body, silent: true });
  const release = (): void => {
    livePurchaseNotifications.delete(notification);
  };
  notification.on('click', () => {
    release();
    focusExistingWindow(mainWindow);
    const win = mainWindow;
    if (win !== null && !win.isDestroyed()) {
      win.webContents.send('sync:event', {
        type: 'openChat',
        accountId: event.accountId,
        chatId: event.chatId,
      } satisfies OpenChatEvent);
    }
  });
  notification.on('close', release);
  notification.on('failed', release);
  livePurchaseNotifications.add(notification);
  notification.show();
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
  const keychain = createKeychain({
    safeStorage,
    secretsDir: join(userData, 'secrets'),
  });

  // Stage 24 / DP 8: the team-wide direct-read OFAPI key; Stage 31: the local
  // anthropic/openrouter vendor keys (generation rides the kernel gateway);
  // D35: the legacy chatter key and its staging slot. Deleted on boot,
  // deliberately unrecoverable by version rollback.
  await keychain.deleteDecommissionedSecrets();

  // Mirror the live secret values into the log redactor + the export's final
  // pass. Refreshed on every sign-in/sign-out transition.
  const refreshRedactionSecrets = async (): Promise<void> => {
    const names: SecretName[] = [
      'hubDeviceToken',
      'hubDeviceTokenStaged',
      'hubDeviceTokenRevoking',
    ];
    const values = await Promise.all(names.map(async (name) => {
      try {
        return await keychain.getSecret(name);
      } catch (error) {
        // An unreadable encrypted credential must not prevent the Settings UI
        // (and its native-confirmed recovery action) from opening. Bearer
        // resolution still fails closed when it attempts to read the secret.
        logger?.warn('hub', 'credential could not be decrypted for redaction', {
          secretName: name,
          ...errorToFields(error),
        });
        return null;
      }
    }));
    redactionSecrets = values.flatMap((value) => {
      if (typeof value !== 'string' || value.length === 0) return [];
      try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === 'object'
          && parsed !== null
          && 'token' in parsed
          && typeof parsed.token === 'string'
          ? [value, parsed.token]
          : [value];
      } catch {
        return [value];
      }
    });
    logger?.setRedactionSecrets(redactionSecrets);
  };

  const dbKey = await keychain.getOrCreateGeneratedKey('dbKey');
  const mediaKeyHex = await keychain.getOrCreateGeneratedKey('mediaCacheKey');

  data = createDataLayer({
    driverPath: 'better-sqlite3-multiple-ciphers',
    filePath: join(userData, 'chatgoose.db'),
    encryptionKey: dbKey,
  });
  acceptanceTracker = createAcceptanceTracker();

  const settingsStore = createSettingsStore({
    queries: data.settings,
    secrets: keychain,
    appVersion: app.getVersion(),
    machineLabel: hostname(),
    osPlatform: process.platform,
  });
  await refreshRedactionSecrets();
  let deviceCredentialRecoveryRequiresUserAction = false;
  const recoverDeviceCredentialJournals = async (): Promise<boolean> => {
    deviceCredentialRecoveryRequiresUserAction = false;
    let deferred = false;
    let requiresUserAction = false;
    const currentHubBaseUrl = (await settingsStore.get()).hubBaseUrl;
    const journalStillPending = await settingsStore.runCredentialMutation(() => recoverHubDeviceTokenLifecycle({
      keychain,
      settings: bootData.settings,
      currentHubBaseUrl,
      clientVersion: app.getVersion(),
      onDeferred: (kind, error) => {
        deferred = true;
        logger?.warn('hub', `device-token ${kind} recovery deferred`, errorToFields(error));
      },
      onCustodyRecovery: (kind, outcome) => {
        requiresUserAction = requiresUserAction
          || outcome.endsWith('-requires-abandonment');
        logger?.warn('hub', 'device-token custody journal recovery outcome', {
          kind,
          outcome,
          remoteRevocationUncertain: outcome.startsWith('unrecoverable-'),
          requiresUserAction: outcome.endsWith('-requires-abandonment'),
        });
      },
    }));
    await refreshRedactionSecrets();
    deviceCredentialRecoveryRequiresUserAction = requiresUserAction;
    // A missing/corrupt custody file intentionally keeps its journal as a
    // user-visible security latch without a network error callback. Treat that
    // state as unsettled too, so terminal purge cannot erase the only warning.
    return deferred || journalStillPending;
  };

  // Stage 12: one-time local-history harvest to the kernel capture lane.
  // The uploader is built per run (its own client instance so x-client-version
  // is 'harvest-<version>' → core stamps producer='desktop-harvest@<version>').
  const harvestModule: HarvestModule = createHarvestModule({
    data,
    createUploader: async () => {
      const connection = await settingsStore.getHubConnection();
      const vm = connection.settings;
      const hubBearer = connection.bearer;
      if (!vm.hubBaseUrl || !hubBearer) {
        throw new Error('Not signed in — sign in on this device first.');
      }
      return createHubClient({
        baseUrl: vm.hubBaseUrl,
        apiKey: hubBearer,
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

  // Bind the harvest guard before any boot-time retention runs. Otherwise an
  // incomplete prior harvest can lose old guard-audit rows during startup,
  // before the composition root has installed the freeze predicate.
  messageGuard = createPrunedMessageGuardRuntime({
    data,
    isPruneFrozen: () => harvestModule.isIncomplete(),
    ...(logger !== null ? { logger } : {}),
  });

  // Runtime seed for local/prod evidence builds: the hub address only. D35
  // removed the credential seed with the legacy key — every install, including
  // an evidence build, signs in on the first-run screen.
  const hubBaseUrlEnv = process.env['CHATGOOSE_HUB_BASE_URL']?.trim();
  if (hubBaseUrlEnv) {
    await settingsStore.update({ hubBaseUrl: hubBaseUrlEnv.replace(/\/+$/, '') });
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
  // The launch check may synchronously produce a one-shot native notification;
  // start only after the persisted locale is available.
  startPackagedAutoUpdater();
  // Covers OS scheme flips while uiTheme='system' (no settings write involved).
  nativeTheme.on('updated', () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(windowBackgroundColor());
    }
  });
  data.bus.subscribe((events) => {
    for (const event of events) if (event.scope === 'outbox' && event.accountId) followersService?.onOutboxChanged(event.accountId);
    if (events.some((event) => event.scope === 'settings')) {
      void refreshUiPrefs();
      // A key save writes its keyMeta fingerprint to the settings table, so this
      // fires on key changes too — keep the redactor's secret set current.
      void refreshRedactionSecrets();
    }
  });

  const bootWindow = createWindow({ load: false });
  mainWindow = bootWindow;

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
    session: bootWindow.webContents.session,
    cacheDir: join(userData, 'media-cache'),
    encryptionKey: Buffer.from(mediaKeyHex, 'hex'),
    queries: createSqliteMediaCacheQueries(data.db),
    registry: data.mediaUrls,
    fetchRemote,
  });

  const bootData = data;
  const onBootRuntimeActivationFailure = (error: unknown): void => {
    // I116-2 (W4.1): a boot-auth failure used to be invisible — sync stayed
    // null, query:sync.status said hub:'off', and Activity claimed "not
    // configured" (false). Latch the auth class so the status reports
    // 'auth-failed' and the existing banner + sign-out UI engage.
    bootHubAuthFailed = isHubAuthFailure(error);
    logger?.error(
      'ofapi',
      'boot read-runtime activation failed; continuing with no runtime',
      { ...errorToFields(error), bootHubAuthFailed },
    );
    // A valid stored credential can fail ordinary boot solely because the Hub
    // is offline. The UI is already available, but without this re-arm the
    // runtime would remain null until a manual settings/sign-in mutation.
    if (!bootHubAuthFailed) {
      postSignInRuntimeRetry?.start();
    }
  };

  let postSignInRuntimeRetry: ReturnType<typeof createBoundedRetry> | null = null;
  let deviceCredentialRecoveryRetry: ReturnType<typeof createBoundedRetry> | null = null;
  // D19: fire-and-forget display hygiene — the identity backfill covers
  // device custody bound BEFORE that build (D35 removed the legacy-key
  // decommission pass that used to run alongside it: the key itself is gone,
  // and its files are deleted once by deleteDecommissionedSecrets at boot).
  const backfillHubDeviceIdentityBestEffort = (): void => {
    void settingsStore.backfillHubDeviceIdentity(hostname()).then((written) => {
      if (written) {
        logger?.info('hub', 'device identity backfilled for a pre-D19 token');
      }
    }).catch((error: unknown) => {
      logger?.warn('hub', 'device identity backfill deferred', errorToFields(error));
    });
  };
  const rebuildOfapiRuntimeFromSettingsInsideMutation = async (
    options: { cancelPendingRetry?: boolean } = {},
  ): Promise<void> => {
    const liveData = data;
    if (liveData === null) {
      return;
    }
    try {
      if (await recoverDeviceCredentialJournals()) {
        deviceCredentialRecoveryRetry?.start();
      }
      backfillHubDeviceIdentityBestEffort();
      // 4c: a settings-driven rebuild — isBoot=false keeps the outgoing engine's
      // live queued/sending rows intact (reconcileOnBoot skips its destructive
      // transitions on this path).
      await activateOfapiRuntimeInsideMutation(keychain, liveData, settingsStore, false);
      reattachEventForwarding();
      emitSyncStatusFrame();
      if (options.cancelPendingRetry ?? true) {
        postSignInRuntimeRetry?.cancel();
      }
    } catch (error) {
      logger?.error('ofapi', 'runtime activation failed', errorToFields(error));
      throw error;
    }
  };
  const rebuildOfapiRuntimeFromSettings = (
    options: { cancelPendingRetry?: boolean } = {},
  ): Promise<void> => ofapiRuntimeMutations.run(
    () => rebuildOfapiRuntimeFromSettingsInsideMutation(options),
  );

  // D35 §9 п.4: install the ONE self-healing funnel. Every hub transport — the
  // read gateway, the SDK lane and the connection probe — reports its auth
  // rejections here; `recoverFromHubAuthFailure` owns every predicate. A wipe
  // then rebuilds the runtime signed-out, which is what flips the renderer to
  // the sign-in screen (SettingsVM custody is gone, the reason remains).
  let hubAuthRecoveryInFlight: Promise<void> | null = null;
  hubAuthSelfHeal = (error: unknown, bearerDigest: string): void => {
    if (hubAuthRecoveryInFlight !== null) return;
    const liveData = data;
    if (liveData === null) return;
    const recovery = recoverFromHubAuthFailure({
      error,
      bearerDigest,
      keychain,
      settings: liveData.settings,
      runCredentialMutation: (task) => settingsStore.runCredentialMutation(task),
    }).then(async (outcome) => {
      if (outcome !== 'wiped') return;
      logger?.warn('hub', 'sign-in ended by the hub; local credential wiped', {
        reason: hubAuthReasonOf(error),
      });
      cancelRuntimeRetries?.();
      bootHubAuthFailed = false;
      await refreshRedactionSecrets();
      // Signed-out now: the rebuild deactivates the credential-bound runtime,
      // and the settings-scope event moves the renderer to the sign-in screen.
      await rebuildOfapiRuntimeFromSettings({ cancelPendingRetry: true });
      liveData.bus.publish({ scope: 'settings' });
      emitSyncStatusFrame();
    }).catch((recoveryError: unknown) => {
      logger?.warn('hub', 'hub auth self-healing deferred', errorToFields(recoveryError));
    }).finally(() => {
      hubAuthRecoveryInFlight = null;
    });
    hubAuthRecoveryInFlight = recovery;
  };

  deviceCredentialRecoveryRetry = createBoundedRetry({
    task: () => ofapiRuntimeMutations.run(async () => {
      if (await recoverDeviceCredentialJournals()) {
        if (deviceCredentialRecoveryRequiresUserAction) {
          // Permanent local-attention state: keep purge fail-closed, but do not
          // spin connectivity retries until the user explicitly abandons it.
          return;
        }
        throw new Error('Finishing the sign-in change is still waiting for a connection.');
      }
      await rebuildOfapiRuntimeFromSettingsInsideMutation();
    }),
    delaysMs: [5_000, 30_000, 2 * 60_000, 10 * 60_000],
    // Credential activation/revocation is a durable idempotent obligation, not
    // an indeterminate command. Keep retrying in bounded, observable series so
    // an outage longer than the first ~12.6 minutes does not require restart.
    repeatAfterExhaustionMs: 60_000,
    onAttemptFailure: (error, attempt) => {
      logger?.warn('hub', 'device-token lifecycle retry deferred', {
        attempt,
        ...errorToFields(error),
      });
    },
    onExhausted: (error) => {
      logger?.error(
        'hub',
        'device-token lifecycle retry series exhausted; re-arming',
        errorToFields(error),
      );
    },
    onSuccess: (attempt) => {
      if (deviceCredentialRecoveryRequiresUserAction) {
        logger?.warn('hub', 'device-token lifecycle awaits explicit local recovery', { attempt });
      } else {
        logger?.info('hub', 'device-token lifecycle recovery succeeded', { attempt });
      }
    },
  });

  postSignInRuntimeRetry = createBoundedRetry({
    task: () => rebuildOfapiRuntimeFromSettings({ cancelPendingRetry: false }),
    delaysMs: [1_000, 5_000, 15_000],
    repeatAfterExhaustionMs: 60_000,
    onAttemptFailure: (error, attempt) => {
      if (isHubAuthFailure(error)) {
        bootHubAuthFailed = true;
        // cancel() advances the retry generation; createBoundedRetry therefore
        // refuses to schedule the next attempt after this callback returns.
        postSignInRuntimeRetry?.cancel();
        emitSyncStatusFrame();
      }
      logger?.warn('hub', 'automatic post-sign-in runtime retry failed', {
        attempt,
        ...errorToFields(error),
      });
    },
    onExhausted: (error) => {
      logger?.error('hub', 'runtime retry series exhausted; re-arming', errorToFields(error));
      emitSyncStatusFrame();
    },
    onSuccess: (attempt) => {
      logger?.info('hub', 'post-sign-in runtime retry succeeded', { attempt });
    },
  });
  cancelRuntimeRetries = () => {
    postSignInRuntimeRetry?.cancel();
    deviceCredentialRecoveryRetry?.cancel();
  };

  const hubCredentialLifecycle = createSerializedCredentialLifecycle<
    { username: string; password: string },
    Awaited<ReturnType<typeof issueHubDeviceToken>>
  >({
    queue: ofapiRuntimeMutations,
    readStoredCredential: async () => {
      const connection = await settingsStore.getHubConnection();
      if (
        connection.settings.hasHubDeviceToken
        && connection.settings.hubDeviceTokenBindingState !== 'bound'
      ) {
        return 'quarantined-unbound';
      }
      return connection.deviceToken
        ?? (connection.deviceTokenTransition === null ? null : 'quarantined-transition');
    },
    issueAndStore: async ({ username, password }) => {
      const connection = await settingsStore.getHubConnection();
      if (connection.hubBaseUrl === null) {
        throw new Error('Set the hub base URL first.');
      }
      const issued = await settingsStore.runCredentialMutation(() => issueHubDeviceToken({
          baseUrl: connection.hubBaseUrl!,
          username,
          password,
          // Р7: one label convention across clients — the owner's device list
          // reads "Desktop · <machine>" next to the extension's "Firefox · <OS>".
          label: `Desktop · ${hostname()}`,
          keychain,
          settings: bootData.settings,
          // Stage 4 / Proposal 4.1 (N5): a machine mid-onboarding must not be
          // invisible to the fleet-adoption release gate.
          clientVersion: app.getVersion(),
          onActivationDeferred: (error) => {
            logger?.warn(
              'hub',
              'device-token activation settlement deferred; retry scheduled',
              errorToFields(error),
            );
            deviceCredentialRecoveryRetry?.start();
          },
        }));
      await refreshRedactionSecrets();
      return issued;
    },
    activateStoredCredential: async () => {
      // This callback already owns ofapiRuntimeMutations through the lifecycle;
      // use the inside-mutation activation seam to avoid a nested-queue deadlock.
      await activateStoredCredentialWithRetry({
        activate: rebuildOfapiRuntimeFromSettingsInsideMutation,
        scheduleRetry: () => postSignInRuntimeRetry?.start(),
        shouldRetry: (error) => !isHubAuthFailure(error),
        onFailure: (error) => {
          bootHubAuthFailed = isHubAuthFailure(error);
          logger?.error(
            'hub',
            'post-sign-in runtime rebuild failed; device token remains stored',
            errorToFields(error),
          );
          emitSyncStatusFrame();
        },
      });
      emitSyncStatusFrame();
    },
    signOutTransition: async () => {
      // A sign-out requested while issuance was in flight reaches this point
      // only after that complete transition settles. Cancel any retry it armed.
      postSignInRuntimeRetry?.cancel();
      deviceCredentialRecoveryRetry?.cancel();
      const liveData = data;
      let connection = await settingsStore.getHubConnection();
      if (
        connection.settings.hasHubDeviceToken
        && connection.settings.hubDeviceTokenBindingState !== 'bound'
        && connection.deviceTokenTransition === null
      ) {
        throw new Error(
          'This device’s stored sign-in cannot be matched to an address. Use “Forget locally”, then sign in again, and ask the owner to end the old sign-in.',
        );
      }
      await deactivateOfapiRuntime();
      let revocationError: unknown = null;
      let revocationPending = false;
      if (connection.deviceTokenTransition === 'activation') {
        try {
          // Persist the user's sign-out intent before any network settlement.
          // Recovery will atomically move this activation journal to exact-
          // token revocation if Core already activated it.
          await settingsStore.runCredentialMutation(async () => {
            requestHubDeviceTokenActivationCancellation(bootData.settings);
          });
          if (await recoverDeviceCredentialJournals()) {
            revocationPending = true;
            revocationError = new Error('The sign-in is not confirmed by the server yet.');
            deviceCredentialRecoveryRetry?.start();
          } else {
            // Recovery either promoted a Core-confirmed active token (which
            // must now be revoked) or discarded a terminal 401 reservation.
            connection = await settingsStore.getHubConnection();
          }
        } catch (error) {
          revocationError = error;
        }
      }
      if (revocationError === null && connection.deviceToken !== null) {
        if (connection.hubBaseUrl === null) {
          throw new Error('Cannot end this device’s sign-in without a ChatGoose address.');
        }
        try {
          await settingsStore.runCredentialMutation(() => beginHubDeviceTokenRevocation({
            baseUrl: connection.hubBaseUrl!,
            token: connection.deviceToken!,
            keychain,
            settings: bootData.settings,
            clientVersion: app.getVersion(),
          }));
          // The remote revoke + active-secret deletion may already be committed
          // even if best-effort removal of an obsolete staging file failed.
          // Sweep such journal-less custody now and arm bounded cleanup retry
          // without turning a successful sign-out into a false security error.
          if (await recoverDeviceCredentialJournals()) {
            deviceCredentialRecoveryRetry?.start();
          }
        } catch (error) {
          revocationError = error;
          // A network failure after journal publication is recoverable and
          // quarantines the token. A safeStorage failure before publication is
          // different: the original token remains active and must not be
          // described as remotely-pending or signed out.
          const afterFailure = await settingsStore.getHubConnection();
          revocationPending = afterFailure.deviceTokenTransition === 'revocation';
          if (revocationPending) {
            deviceCredentialRecoveryRetry?.start();
          }
        }
      } else if (revocationError === null && connection.deviceTokenTransition === 'revocation') {
        try {
          if (await recoverDeviceCredentialJournals()) {
            revocationPending = true;
            revocationError = new Error('The sign-out is not confirmed by the server yet.');
            deviceCredentialRecoveryRetry?.start();
          }
        } catch (error) {
          revocationError = error;
        }
      }
      try {
        if (liveData !== null) {
          await rebuildOfapiRuntime(keychain, liveData, settingsStore, false);
        }
        bootHubAuthFailed = false;
      } catch (fallbackError) {
        await deactivateOfapiRuntime();
        throw fallbackError;
      }
      if (revocationError !== null) {
        if (!revocationPending) {
          throw new Error(
            'Sign-out did not start on the server, so this device is still signed in.',
            { cause: revocationError },
          );
        }
        throw new Error(
          // D35: no mechanism is named and no automatic retry is promised (D26);
          // what the chatter needs to know is that the sign-out is safe and this
          // device is disconnected until the server confirms it.
          'Sign-out is safely pending: the server has not confirmed it yet, and this device stays disconnected until it does.',
          { cause: revocationError },
        );
      }
    },
  });

  // 4a: validate the hub read runtime a hubBaseUrl patch WOULD produce BEFORE
  // cmd:settings.update persists it. A throwaway read client is built from the
  // PATCH override (not disk) and account-list probed; a bad address throws
  // here so the handler rejects with nothing written to the settings table
  // (SPEC §15 — no half-applied configuration). Clearing the hub, or a patch
  // with no effective credential/URL, is a no-op (the rebuild runs signed-out).
  const probeReadRuntimeForPatch = async (rawPatch: unknown): Promise<void> => {
    const patch = settingsPatchSchema.parse(rawPatch);
    if (patch.hubBaseUrl === undefined) {
      return;
    }
    const current = await settingsStore.get();
    const hubBaseUrl = patch.hubBaseUrl;
    // D35: the only bearer is the stored device token, and a hub switch while
    // one exists is already refused by the settings store. So the candidate
    // credential is simply what is stored today.
    const connection = await settingsStore.getHubConnection();
    const credential = connection.deviceToken;
    if (hubBaseUrl === null || credential === null || credential.length === 0) {
      return;
    }
    if (patch.hubBaseUrl === current.hubBaseUrl) {
      return;
    }
    // The account list GET is a read-only credential probe. It deliberately
    // does NOT call syncAccounts: candidate accounts must not mutate the live
    // DB until settings persistence commits and the real runtime builds.
    await probeHubReadCredential(createOfApiTransportClient(
      createOfApiClient({
        apiKey: credential,
        baseUrl: buildHubOfApiReadBaseUrl(hubBaseUrl),
        authErrorCode: 'CG-HUB-01',
        requestTimeoutMs: HUB_OFAPI_READ_TIMEOUT_MS,
        creditMeter: createCreditMeter(),
        clientVersion: app.getVersion(),
      }),
    ));
  };

  let purging = false;
  const registerMainIpc = (): void => {
    registerIpcHandlers({
      data: bootData,
      settingsStore,
      onRendererReady: (webContentsId) => {
        rendererReadiness.markReady(webContentsId);
      },
    // OFAPI-lifecycle services are built lazily by initOfapi, which can run
    // AFTER this registration — a key configured on a keyless boot routes
    // cmd:settings.update → onOfapiRuntimeConfigChanged → initOfapi and reassigns the
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
    get personas() {
      return hub?.personas ?? null;
    },
    get acceptance() {
      const tracker = acceptanceTracker;
      if (tracker === null) {
        return null;
      }
      return {
        enqueue: (event: Parameters<NonNullable<HubModule>['acceptance']['enqueue']>[0]) => {
          const module = hub;
          if (module !== null) {
            module.acceptance.enqueue(event);
          } else {
            enqueueAcceptanceEvent(bootData, event, activeAcceptanceDestinationIdentity);
          }
        },
        trackInserted: tracker.trackInserted,
        consumeForSend: tracker.consumeForSend,
      };
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
    get followers() { return followersService; },
    get online() {
      return onlineService;
    },
    get spendersRefresh() {
      return spendersRefresh;
    },
    // I116-2 (W4.1): boot-auth latch — read live, the flag flips on rebuilds.
    bootHubAuthFailed: () => bootHubAuthFailed,
    hubCredentialAttention: () => hubCredentialAttention,
    purge: async () => {
      // Re-entry guard: a double-fired cmd:data.purge would otherwise call
      // app.relaunch() twice before exit — Electron then spawns TWO instances
      // racing on the same encrypted db (no single-instance lock).
      if (purging) {
        return;
      }
      purging = true;
      postSignInRuntimeRetry?.cancel();
      deviceCredentialRecoveryRetry?.cancel();
      // Serialize behind any activation and drain authorized send pumps before
      // closing/deleting the DB they still reference.
      await sealRuntimeForTerminalOperation(ofapiRuntimeMutations, async () => {
        // The shared terminal promise spans the ENTIRE destructive custody
        // transition. A concurrent quit/auto-updater exit must wait through DB
        // close, cache deletion and relaunch—not merely runtime deactivation.
        await runFailClosedTerminalPurge({
          finishCustody: async () => {
            // A dirty harvest at purge entry is expected: runtime polling may
            // have appended facts since the last completed pass. Stop every
            // producer first, then upload the bounded final delta. Failure stays
            // fail-closed in runFailClosedTerminalPurge and preserves the DB.
            await drainRuntimeThenFinishCustody({
              deactivateRuntime: deactivateOfapiRuntime,
              finishCustody: async () => {
                await finishPurgeCustody({
                  settlePendingCredential: () => requireSettledDeviceCredentialCustody({
                    recover: recoverDeviceCredentialJournals,
                  }),
                  finishHarvest: () => finishHarvestDeltaBeforePurge(harvestModule),
                  settleActiveDeviceCredential: () => settleDeviceCredentialBeforePurge({
                    recover: recoverDeviceCredentialJournals,
                    read: async () => {
                      const connection = await settingsStore.getHubConnection();
                      return {
                        hasDeviceTokenCustody: connection.settings.hasHubDeviceToken,
                        bindingState: connection.settings.hubDeviceTokenBindingState,
                        hubBaseUrl: connection.hubBaseUrl,
                        deviceToken: connection.deviceToken,
                      };
                    },
                    revoke: async ({ hubBaseUrl, deviceToken }) => {
                      await settingsStore.runCredentialMutation(() => (
                        beginHubDeviceTokenRevocation({
                          baseUrl: hubBaseUrl,
                          token: deviceToken,
                          keychain,
                          settings: bootData.settings,
                          clientVersion: app.getVersion(),
                        })
                      ));
                    },
                  }),
                });
              },
            });
          },
          closeDatabase: () => data?.close(),
          clearMedia: () => media.cache.clear().catch(() => undefined),
          deleteLocalData: async () => {
            await rm(join(userData, 'chatgoose.db'), { force: true });
            await rm(join(userData, 'chatgoose.db-wal'), { force: true });
            await rm(join(userData, 'chatgoose.db-shm'), { force: true });
            await rm(join(userData, 'media-cache'), { recursive: true, force: true });
          },
          onFailure: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            dialog.showErrorBox(
              'Local data was not deleted',
              `The purge could not complete safely. ChatGoose stopped the operation and will restart; verify local-data status before retrying.\n\n${message}`,
            );
          },
          relaunch: () => app.relaunch(),
          exit: (code) => app.exit(code),
        });
      });
    },
    probeReadRuntimeForPatch,
    runReadRuntimeMutation: (task) => ofapiRuntimeMutations.run(task),
    // cmd:settings.update invokes this while the runner above owns the queue.
    onOfapiRuntimeConfigChanged: rebuildOfapiRuntimeFromSettingsInsideMutation,
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
    testKey: (provider) =>
      runKeyTest(provider, {
        settingsStore,
        clientVersion: app.getVersion(),
        onAuthFailure: (error, bearerDigest) => hubAuthSelfHeal?.(error, bearerDigest),
      }),
    // Stage 24: one-time device-token sign-in (Settings → Hub). The token
    // lands in the keychain; the config recheck swings every hub consumer
    // (REST, SSE, read gateway) onto it without a restart.
    hubAuth: {
      // The lifecycle queue covers the pre-mint existence check, network issue,
      // keychain write and activation as one credential-custody operation.
      issueDeviceToken: ({ username, password }) =>
        hubCredentialLifecycle.issue({ username, password }),
      // Security-first sign-out owns the complete transition. It waits behind
      // any activation already in flight, unpublishes/quiesces that runtime,
      // revokes the exact bearer at Core while its local secret still exists,
      // then deletes it and attempts the legacy fallback from a null-runtime
      // baseline. Any revoke ambiguity keeps the local token and fails closed.
      signOutDevice: async () => {
        postSignInRuntimeRetry?.cancel();
        try {
          await hubCredentialLifecycle.signOut();
        } catch (error) {
          bootHubAuthFailed = isHubAuthFailure(error);
          logger?.error(
            'hub',
              'device sign-out did not fully complete; inspect the durable retry/fallback state',
            errorToFields(error),
          );
          throw error;
        } finally {
          await refreshRedactionSecrets().catch((error: unknown) => {
            logger?.warn('hub', 'failed to refresh redaction secrets after sign-out', errorToFields(error));
          });
          reattachEventForwarding();
          emitSyncStatusFrame();
        }
      },
      abandonDevice: async () => {
        const confirmationOptions = {
          type: 'warning' as const,
          title: uiMessage(uiLocale, 'hub.deviceToken.abandon'),
          message: uiMessage(uiLocale, 'hub.deviceToken.abandonConfirm'),
          buttons: [
            uiMessage(uiLocale, 'common.cancel'),
            uiMessage(uiLocale, 'hub.deviceToken.abandon'),
          ],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        };
        const confirmation = mainWindow !== null && !mainWindow.isDestroyed()
          ? await dialog.showMessageBox(mainWindow, confirmationOptions)
          : await dialog.showMessageBox(confirmationOptions);
        if (confirmation.response !== 1) {
          return;
        }
        postSignInRuntimeRetry?.cancel();
        deviceCredentialRecoveryRetry?.cancel();
        await ofapiRuntimeMutations.run(async () => {
          await deactivateOfapiRuntime();
          await settingsStore.runCredentialMutation(() => abandonHubDeviceTokenCustody({
            keychain,
            settings: bootData.settings,
          }));
          await refreshRedactionSecrets();
          try {
            await rebuildOfapiRuntimeFromSettingsInsideMutation();
          } catch (error) {
            // Local abandonment already committed. A missing/bad fallback must
            // not falsely report that the old device token is still retained.
            bootHubAuthFailed = isHubAuthFailure(error);
            logger?.warn(
              'hub',
              'device token abandoned locally; fallback runtime remains unavailable',
              errorToFields(error),
            );
          }
          reattachEventForwarding();
          emitSyncStatusFrame();
        });
      },
    },
    harvest: {
      prepareIdentity: () => harvestModule.prepareIdentity(),
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
      exportPersonaSnapshot: async (snapshot) => {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = join(userData, `chatgoose-persona-backup-${stamp}.json`);
        await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        shell.showItemInFolder(file);
        return { path: file };
      },
      exportDiagnostics: async () => {
        const vm = await settingsStore.get();
        // SettingsVM carries no secrets by construction, but the diagnostics
        // file is MEANT to leave the machine — so even the last4 fingerprint
        // is stripped (SPEC §15: no credential material, partial included,
        // exits main). D19: hubDeviceIdentity carries tokenLast4.
        const settingsForExport = settingsForDiagnosticsExport(vm);

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
        // Stage 4: the usage spool never self-deletes (stop-loss) — export
        // EVERY undelivered row with its state (pending / dead-letter /
        // quarantined), so "export diagnostics first" before a purge really
        // preserves the spool, not just the HTTP-400 quarantine slice. Valid
        // usage telemetry carries no message text; malformed legacy rows are
        // retained as raw, secret-redacted forensic records instead of being
        // silently lost. Read straight from the table so the section is
        // present even while the hub module is off.
        let usageSpool: ReturnType<typeof summarizeUsageSpool> | null;
        try {
          const rows = (data?.db
            .prepare('SELECT client_event_id AS id, payload, attempts FROM usage_events ORDER BY rowid ASC')
            .all() ?? []) as Array<{ id?: unknown; payload?: unknown; attempts?: unknown }>;
          usageSpool = summarizeUsageSpool(rows);
        } catch {
          usageSpool = null;
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
            harvest: {
              machineId: harvestModule.status().machineId,
            },
            db: {
              schemaVersion,
              counts: {
                accounts: countRows('accounts'),
                chats: countRows('chats'),
                messages: countRows('messages'),
                summaries: countRows('summaries'),
                outbox: countRows('outbox'),
                messageGuardEvents: countRows('message_guard_events'),
                // Stage 31 drain watch: legacy usage_events parked for core.
                // The old reporter keeps flushing for one release; §5 exit
                // criterion is this count reaching (and staying at) zero.
                usageEvents: countRows('usage_events'),
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
            usageSpool,
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
  };

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

  // Local IPC + cached SQLite UI become interactive before any remote account
  // bootstrap. The remote runtime then activates in the background and swaps
  // event forwarding/status onto the live services when it settles.
  await exposeUiBeforeRuntimeActivation({
    registerIpc: () => {
      registerMainIpc();
      reattachEventForwarding();
    },
    loadUi: () => loadWindowContent(bootWindow),
    activate: async () => {
      await ofapiRuntimeMutations.run(async () => {
        if (await recoverDeviceCredentialJournals()) {
          deviceCredentialRecoveryRetry?.start();
        }
        backfillHubDeviceIdentityBestEffort();
        await activateOfapiRuntimeInsideMutation(keychain, bootData, settingsStore, true);
      });
    },
    onActivationFailure: onBootRuntimeActivationFailure,
    onActivationSettled: () => {
      reattachEventForwarding();
      emitSyncStatusFrame();
    },
  });
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

// Packaged-launch smoke gate (D8): `ChatGoose --smoke` proves the main bundle
// loads, the window is created, navigation finishes, and the committed renderer
// proves a settings IPC round trip on a throwaway profile — then exits 0 without
// human-visible UI. Navigation,
// preload, and renderer-process failures reject boot. The 0.1.30/0.1.31 DOA class (module
// resolution dying at load, windowless zombie) never reaches this code, so the
// CI step's timeout is the failure signal for that class; a boot() rejection
// exits 1 explicitly. Runs after the packaged-userData block so the temp
// profile always wins — a CI runner must never touch a real profile.
const smokeRun = process.argv.includes('--smoke');
if (smokeRun) {
  app.setPath('userData', join(tmpdir(), `chatgoose-smoke-${String(process.pid)}`));
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
    boot()
      .then(() => {
        if (smokeRun) {
          logger?.info('app', 'smoke boot OK');
          void logger?.flush();
          app.exit(0);
        }
      })
      .catch((err: unknown) => {
        logger?.error('boot', 'fatal startup error', errorToFields(err));
        if (smokeRun) {
          // CI runs headless — a dialog would hang the runner until timeout.
          console.error('smoke boot FAILED:', err);
          app.exit(1);
          return;
        }
        void exitAfterFatalBoot({
          showError: () => {
            dialog.showErrorBox(
              'ChatGoose failed to start',
              err instanceof Error ? err.message : String(err),
            );
          },
          flush: flushLogger,
          exit: (code) => app.exit(code),
        }).catch(() => undefined);
      });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
    // D38: one safety check of the focused account's list after the OS
    // resumed (skipped when a read already happened in the last 5 minutes).
    powerMonitor.on('resume', () => {
      logger?.info('app', 'system resume');
      sync?.noteSystemResume();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const beforeQuitBarrier = createBeforeQuitBarrier({
  drain: async () => {
    logger?.info('app', 'quit requested; draining runtime');
    cancelRuntimeRetries?.();
    cancelRuntimeRetries = null;
    try {
      // Serialize behind any activation/rebuild, then await PollingSync and
      // send-engine quiescence before allowing Electron to close the process.
      // Sealing is atomic with the final task: no late settings/retry callback
      // can enqueue a fresh runtime behind the drain.
      await sealRuntimeForTerminalOperation(ofapiRuntimeMutations, deactivateOfapiRuntime);
    } finally {
      // Do not close SQLite in `quit`: Electron's first before-quit pass leaves
      // the renderer alive while this barrier runs. The process owns the DB and
      // releases it on exit; purge has its own awaited close/delete sequence.
      await flushLogger();
    }
  },
  onError: (error) => {
    logger?.error('app', 'runtime drain failed during quit', errorToFields(error));
  },
  quit: () => app.quit(),
});
app.on('before-quit', beforeQuitBarrier);
