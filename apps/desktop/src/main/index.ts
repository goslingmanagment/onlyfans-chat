// Composition root (SPEC §4): keychain → encrypted db → settings → media://
// protocol → OFAPI client → PollingSync → AI coordinator → IPC. All secrets
// and network I/O live here in main; the renderer only ever sees typed IPC.

import { app, BrowserWindow, dialog, Notification, protocol, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { resolveUiLocale, uiMessage, type UiLocale } from '@chatgoose/shared/i18n/index';
import { createKeychain, type Keychain } from './secrets/keychain';
import { createDataLayer, type DataLayer } from './db/index';
import { createSettingsStore, type SettingsStore } from './settings/store';
import {
  createToMediaUrl,
  isAllowedMediaUrl,
  MEDIA_SCHEME_PRIVILEGES,
  registerMediaProtocol,
  type FetchRemote,
} from './media/protocol';
import { createSqliteMediaCacheQueries } from './media/cache';
import { createOfApiClient, type OfApiClient } from './ofapi/client';
import { createSendEngine, type SendEngine } from './send/engine';
import { createVaultService, type VaultService } from './media/vault';
import { createPollingSync, syncAccounts } from './sync/polling-sync';
import { createBudgetGuard } from './sync/budget-guard';
import { createHubSync } from './sync/hub-sync';
import { createHubAwareSync, type HubAwareSync } from './sync/hub-provider';
import { registerIpcHandlers } from './ipc/handlers';
import { runKeyTest } from './diagnostics/key-tests';
import { createAiCoordinator, type AiCoordinator } from './ai/index';
import { createHubModule, type HubModule } from './hub/index';
import { attachEventForwarding } from './ipc/events';

protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_PRIVILEGES]);

let mainWindow: BrowserWindow | null = null;
let data: DataLayer | null = null;
let sync: HubAwareSync | null = null;
let client: OfApiClient | null = null;
let coordinator: AiCoordinator | null = null;
let sendEngine: SendEngine | null = null;
let vaultService: VaultService | null = null;
let hub: HubModule | null = null;
/** Set by initOfapi; lets cmd:settings.update trigger a hub-config recheck. */
let recheckHubConfig: (() => void) | null = null;
/** UI prefs mirrored from settings by boot()'s bus watcher — read by window
 *  creation (zoom) and main-side notifications (locale). */
let uiScale = 1;
let uiLocale: UiLocale = 'en';

function loadWindowContent(win: BrowserWindow): void {
  // Dev convenience: CHATGOOSE_OPEN_VIEW=settings boots straight into Settings
  // (e.g. watching the Activity panel during a live run). No effect packaged.
  const openView = !app.isPackaged ? process.env['CHATGOOSE_OPEN_VIEW'] : undefined;
  const search = openView === 'settings' ? 'view=settings' : null;
  if (process.env['ELECTRON_RENDERER_URL']) {
    const url = process.env['ELECTRON_RENDERER_URL'];
    void win.loadURL(search !== null ? `${url}?${search}` : url);
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
    backgroundColor: '#efece4',
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
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
  const apiKey = await keychain.getSecret('ofapiKey');
  if (!apiKey || client) {
    return;
  }
  client = createOfApiClient({ apiKey });
  const utcDay = new Date().toISOString().slice(0, 10);
  client.creditMeter.hydrate({
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
    getUsedToday: () => client?.creditMeter.snapshot().usedToday ?? 0,
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
  client.creditMeter.subscribe((snapshot) => {
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

  let settingsCache: { creditBudgetPerShift: number | null } | null = await settingsStore.get();

  // Hub config fingerprint: reconfigure the SSE connection only when the base
  // URL or the chatter key actually changed — NOT on every settings write
  // (HubSync itself persists hubSync.lastEventId into the settings table, so a
  // naive resubscribe-on-settings-change would loop the stream forever).
  async function hubConfigFingerprint(): Promise<string> {
    const vm = await settingsStore.get();
    const hubKey = await keychain.getSecret('hubApiKey');
    return `${vm.hubBaseUrl ?? ''}\n${hubKey ?? ''}`;
  }
  let hubFingerprint = await hubConfigFingerprint();

  // Shared by the settings-bus watcher and the IPC onHubConfigChanged hook
  // (key-only writes hit the keychain and never publish a bus event).
  recheckHubConfig = () => {
    void hubConfigFingerprint().then((next) => {
      if (next !== hubFingerprint) {
        hubFingerprint = next;
        void sync?.reconfigureHub();
        void hub?.reconfigure();
      }
    });
  };

  dataLayer.bus.subscribe((events) => {
    if (events.some((event) => event.scope === 'settings')) {
      void settingsStore.get().then((vm) => {
        settingsCache = vm;
      });
      recheckHubConfig?.();
    }
  });

  // Minting registers the remote URL in media_urls; only registered tokens
  // resolve through the media:// handler (SPEC §4).
  const toMediaUrl = createToMediaUrl(dataLayer.mediaUrls);
  const polling = createPollingSync({
    client,
    data: dataLayer,
    toMediaUrl,
    isBudgetExhausted: () => budgetGuard.isExhausted(),
  });

  const lastEventIdSchema = z.number().int().nonnegative();
  sync = createHubAwareSync({
    polling,
    data: dataLayer,
    // Resolved per (re)connect attempt so settings edits take effect on
    // reconfigureHub without re-running OFAPI init. Null = hub mode off.
    createHub: async ({ onEvent, onStatusChange }) => {
      const vm = await settingsStore.get();
      const hubKey = await keychain.getSecret('hubApiKey');
      if (vm.hubBaseUrl === null || hubKey === null || hubKey.length === 0) {
        return null;
      }
      return createHubSync({
        baseUrl: vm.hubBaseUrl,
        apiKey: hubKey,
        onEvent,
        onStatusChange,
        // Resume checkpoint is global per chatter key (core fanout_seq).
        getLastEventId: () =>
          dataLayer.settings.getParsed('hubSync.lastEventId', lastEventIdSchema) ?? null,
        setLastEventId: (id) => dataLayer.settings.set('hubSync.lastEventId', id),
      });
    },
  });

  // Hub REST cluster (SPEC §8.5/§8.6): summary prefetch/push + usage reporter.
  // Inert until hub config exists; rebuilt by recheckHubConfig on changes.
  hub = createHubModule({ data: dataLayer, settingsStore, keychain });
  void hub.reconfigure();

  // Send engine (SPEC §7): exists exactly when a client does. messageSent sync
  // events feed its verifier; boot reconciliation runs before any send can.
  const engine = createSendEngine({
    client,
    data: dataLayer,
    toMediaUrl,
    getSettings: () => settingsStore.get(),
  });
  sendEngine = engine;
  // Vault & PPV (PRD F7): vault/gallery thumbs are OF CDN URLs — minted into
  // media:// tokens through the same registering toMediaUrl seam as sync.
  vaultService = createVaultService({
    client,
    toMediaUrl,
    dialog: {
      showOpenDialog: (options) =>
        dialog.showOpenDialog({ properties: ['openFile'], filters: options.filters }),
    },
  });
  sync.subscribe((event) => engine.handleSyncEvent(event));
  // Awaited on purpose (adversarial review 2026-06-11): the "reconciliation
  // before any send" guarantee must hold even for a fast first user action.
  // reconcileOnBoot swallows network errors internally, so this never blocks
  // startup on connectivity.
  await engine.reconcileOnBoot();

  const accountIds = await syncAccounts(client, dataLayer, toMediaUrl);
  sync.start(accountIds);
}

async function boot(): Promise<void> {
  const userData = app.getPath('userData');
  const keychain = createKeychain({
    safeStorage,
    secretsDir: join(userData, 'secrets'),
  });

  // Dev convenience: import the spike key once so a fresh dev install can run
  // against the live account without manual settings entry.
  if (!app.isPackaged && process.env['ONLYFANSAPI_API_KEY']) {
    if (!(await keychain.hasSecret('ofapiKey'))) {
      await keychain.setSecret('ofapiKey', process.env['ONLYFANSAPI_API_KEY']);
    }
  }

  const dbKey = await keychain.getOrCreateGeneratedKey('dbKey');
  const mediaKeyHex = await keychain.getOrCreateGeneratedKey('mediaCacheKey');

  data = createDataLayer({
    driverPath: 'better-sqlite3-multiple-ciphers',
    filePath: join(userData, 'chatgoose.db'),
    encryptionKey: dbKey,
  });

  const settingsStore = createSettingsStore({ queries: data.settings, secrets: keychain });

  // UI prefs (zoom + interface language for main-side notifications): seed
  // before the window loads, then track every settings-table write.
  const refreshUiPrefs = async (): Promise<void> => {
    const vm = await settingsStore.get();
    uiScale = vm.uiScale;
    uiLocale = resolveUiLocale(vm.uiLocale, app.getLocale());
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(uiScale);
    }
  };
  await refreshUiPrefs();
  data.bus.subscribe((events) => {
    if (events.some((event) => event.scope === 'settings')) {
      void refreshUiPrefs();
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

  if (client) {
    coordinator = createAiCoordinator({
      data,
      client,
      settingsStore,
      keychain,
      // Hooks delegate through the hub module — unconfigured hub stays inert.
      ...(hub !== null
        ? { summaryHub: hub.summaryHub, onUsageEvent: (event) => hub?.onUsageEvent(event) }
        : {}),
    });
  }

  let purging = false;
  registerIpcHandlers({
    data,
    settingsStore,
    sync,
    creditMeter: client?.creditMeter ?? null,
    coordinator,
    send: sendEngine,
    vault: vaultService,
    purge: async () => {
      // Re-entry guard: a double-fired cmd:data.purge would otherwise call
      // app.relaunch() twice before exit — Electron then spawns TWO instances
      // racing on the same encrypted db (no single-instance lock).
      if (purging) {
        return;
      }
      purging = true;
      sync?.stop();
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
    onOfapiKeyConfigured: () => {
      if (data) {
        void initOfapi(keychain, data, settingsStore);
      }
    },
    onHubConfigChanged: () => recheckHubConfig?.(),
    testKey: (provider) => runKeyTest(provider, { keychain, settingsStore }),
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
        const report = {
          generatedAt: new Date().toISOString(),
          app: {
            version: app.getVersion(),
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            platform: process.platform,
          },
          settings: settingsForExport,
          sync: sync?.status() ?? null,
          hub: sync?.hubStatus?.() ?? null,
          hubActivity: sync?.hubActivity?.() ?? null,
          credits: client?.creditMeter.snapshot() ?? null,
        };
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = join(userData, `chatgoose-diagnostics-${stamp}.json`);
        await writeFile(file, JSON.stringify(report, null, 2), 'utf8');
        shell.showItemInFolder(file);
        return { path: file };
      },
    },
  });

  attachEventForwarding({
    window: () => mainWindow,
    bus: data.bus,
    sync,
    creditMeter: client?.creditMeter ?? null,
    coordinator,
    onSyncEvent: (event) => {
      if (event.type === 'chatListUpdated' && process.platform === 'darwin' && data) {
        const total = data.accounts.list().reduce((sum, account) => sum + account.unreadTotal, 0);
        app.dock?.setBadge(total > 0 ? String(total) : '');
      }
      if (
        event.type === 'messageReceived' &&
        mainWindow &&
        (!mainWindow.isVisible() || !mainWindow.isFocused()) &&
        Notification.isSupported()
      ) {
        const chat = data?.chats.get(event.accountId, event.chatId);
        new Notification({
          title: chat?.fanName ?? uiMessage(uiLocale, 'notif.newMessage'),
          body: chat?.lastMessagePreview ?? '',
          silent: true,
        }).show();
      }
    },
  });

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

app.whenReady().then(() => {
  void boot();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  sync?.stop();
  sendEngine?.dispose();
  coordinator?.dispose();
  hub?.dispose();
  data?.close();
});
