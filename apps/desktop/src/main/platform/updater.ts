// Auto-update policy + controller (PLAN item 11 follow-up, owner request
// 2026-06-13; manual "check now" button added same day).
//
// Windows packaged builds only: macOS refuses to apply updates to unsigned
// apps (Squirrel.Mac hard requirement) and the owner runs the dev build there
// anyway. Background by default — download silently, install on quit, NEVER a
// surprise restart mid-shift; a failed check (offline shift, feed unreachable)
// is silent. The feed is electron-updater's generic provider over HTTPS
// (electron-builder.yml `publish`; ops in docs/RELEASE.md) — builds are
// unsigned, so the feed host being ours IS the trust anchor.
//
// The manual Settings button drives the same controller: check → (if found)
// download → "Restart & install". Both paths share createUpdateController.
//
// Dependency-free (interfaces only): electron-updater pulls in Electron at
// import time, so the composition root dynamic-imports it and hands the
// instance in — tests drive a fake.

export function shouldAutoUpdate(platform: string, isPackaged: boolean): boolean {
  return platform === 'win32' && isPackaged;
}

/** The slice of electron-updater's AppUpdater this module touches. */
export interface AppUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown;
  on(event: 'update-not-available', listener: (info: { version: string }) => void): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatus {
  phase: UpdatePhase;
  /** Target version (available / downloaded); null otherwise. */
  version: string | null;
  /** Download progress 0–100 while `downloading`; null otherwise. */
  percent: number | null;
  /** Error message while `error`; null otherwise. */
  message: string | null;
}

export interface UpdateController {
  status(): UpdateStatus;
  /** Triggers a check; resolves with the snapshot once the check settles.
   *  Background download (if an update was found) continues after this. */
  check(): Promise<UpdateStatus>;
  /** Quit and install a downloaded update now (the manual "install" action). */
  install(): void;
}

const IDLE: UpdateStatus = { phase: 'idle', version: null, percent: null, message: null };

/**
 * Wraps an AppUpdater into a state-tracking controller. Sets background
 * download + install-on-quit, then mirrors the updater's event stream into a
 * single `status` snapshot the IPC layer polls. `onReady` fires the quiet
 * "installs when you quit" notification (the auto path) — the manual button
 * reads the same `downloaded` phase to offer Restart & install.
 */
export function createUpdateController(options: {
  updater: AppUpdaterLike;
  onReady?: (version: string) => void;
}): UpdateController {
  const { updater, onReady } = options;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  let state: UpdateStatus = IDLE;

  updater.on('checking-for-update', () => {
    state = { phase: 'checking', version: null, percent: null, message: null };
  });
  updater.on('update-available', (info) => {
    state = { phase: 'available', version: info.version, percent: 0, message: null };
  });
  updater.on('update-not-available', () => {
    state = { phase: 'up-to-date', version: null, percent: null, message: null };
  });
  updater.on('download-progress', (progress) => {
    state = {
      phase: 'downloading',
      version: state.version,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      message: null,
    };
  });
  updater.on('update-downloaded', (info) => {
    state = { phase: 'downloaded', version: info.version, percent: 100, message: null };
    onReady?.(info.version);
  });
  updater.on('error', (err) => {
    state = { phase: 'error', version: null, percent: null, message: err.message };
  });

  return {
    status: () => state,
    check: async () => {
      state = { phase: 'checking', version: null, percent: null, message: null };
      try {
        await updater.checkForUpdates();
      } catch (err) {
        // Offline shifts and feed outages stay silent for the auto path; the
        // manual button surfaces this `error` phase in the UI.
        state = {
          phase: 'error',
          version: null,
          percent: null,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      return state;
    },
    install: () => updater.quitAndInstall(),
  };
}

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface StartAutoUpdaterOptions {
  controller: UpdateController;
  intervalMs?: number;
  /** Injectable for tests; defaults to setInterval. */
  schedule?: (fn: () => void, ms: number) => unknown;
}

/** Kick the background loop: check at launch, then every intervalMs. */
export function startAutoUpdater(options: StartAutoUpdaterOptions): void {
  const { controller } = options;
  void controller.check();
  const schedule = options.schedule ?? ((fn, ms) => setInterval(fn, ms));
  schedule(() => void controller.check(), options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS);
}
