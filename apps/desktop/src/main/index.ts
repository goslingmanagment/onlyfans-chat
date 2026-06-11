// Composition root (SPEC §4): keychain → encrypted db → settings → media://
// protocol → OFAPI client → PollingSync → AI coordinator → IPC. All secrets
// and network I/O live here in main; the renderer only ever sees typed IPC.

import { app, BrowserWindow, Notification, protocol, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { z } from 'zod';
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
import { createPollingSync, syncAccounts } from './sync/polling-sync';
import { createBudgetGuard } from './sync/budget-guard';
import { createHubSync } from './sync/hub-sync';
import { createHubAwareSync, type HubAwareSync } from './sync/hub-provider';
import { registerIpcHandlers } from './ipc/handlers';
import { createAiCoordinator, type AiCoordinator } from './ai/index';
import { attachEventForwarding } from './ipc/events';

protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_PRIVILEGES]);

let mainWindow: BrowserWindow | null = null;
let data: DataLayer | null = null;
let sync: HubAwareSync | null = null;
let client: OfApiClient | null = null;
let coordinator: AiCoordinator | null = null;
let sendEngine: SendEngine | null = null;

function loadWindowContent(win: BrowserWindow): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
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
  client.creditMeter.hydrate({ utcDay, usedToday: dataLayer.creditLog.usedOn(utcDay) });

  const budgetGuard = createBudgetGuard({
    getBudget: () => settingsCache?.creditBudgetPerShift ?? null,
    getUsedToday: () => client?.creditMeter.snapshot().usedToday ?? 0,
    onWarning: (used, budget) => {
      if (Notification.isSupported()) {
        new Notification({
          title: 'Credit budget at 80%',
          body: `${used} of ${budget} credits used this shift.`,
        }).show();
      }
    },
  });
  let persistedToday = dataLayer.creditLog.usedOn(utcDay);
  client.creditMeter.subscribe((snapshot) => {
    const delta = snapshot.usedToday - persistedToday;
    if (delta > 0 && snapshot.utcDay === utcDay) {
      dataLayer.creditLog.add(snapshot.utcDay, delta);
      persistedToday = snapshot.usedToday;
    } else if (snapshot.utcDay !== utcDay) {
      persistedToday = 0;
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

  dataLayer.bus.subscribe((events) => {
    if (events.some((event) => event.scope === 'settings')) {
      void settingsStore.get().then((vm) => {
        settingsCache = vm;
      });
      void hubConfigFingerprint().then((next) => {
        if (next !== hubFingerprint) {
          hubFingerprint = next;
          void sync?.reconfigureHub();
        }
      });
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

  // Send engine (SPEC §7): exists exactly when a client does. messageSent sync
  // events feed its verifier; boot reconciliation runs before any send can.
  const engine = createSendEngine({
    client,
    data: dataLayer,
    toMediaUrl,
    getSettings: () => settingsStore.get(),
  });
  sendEngine = engine;
  sync.subscribe((event) => engine.handleSyncEvent(event));
  void engine.reconcileOnBoot();

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
    coordinator = createAiCoordinator({ data, client, settingsStore, keychain });
  }

  registerIpcHandlers({
    data,
    settingsStore,
    sync,
    creditMeter: client?.creditMeter ?? null,
    coordinator,
    send: sendEngine,
    purge: async () => {
      sync?.stop();
      sendEngine?.dispose();
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
          title: chat?.fanName ?? 'New message',
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
  data?.close();
});
