// Auto-update policy + controller (PLAN item 11 follow-up, owner request
// 2026-06-13; manual "check now" button added same day).
//
// Packaged Windows builds self-update: download silently, install on quit,
// NEVER a surprise restart mid-shift. Packaged macOS builds are unsigned, so
// Squirrel.Mac cannot apply an update; they poll the public manifest and open
// its manual download page instead. A failed background check (offline shift,
// feed unreachable) is silent. The Windows feed is electron-updater's generic
// provider over HTTPS (electron-builder.yml `publish`; ops in
// docs/RELEASE.md) — builds are unsigned, so the feed host being ours IS the
// trust anchor.
//
// The manual Settings button drives the same controller: check → (if found)
// download → "Restart & install". Both paths share createUpdateController.
//
// Dependency-free (interfaces only): electron-updater pulls in Electron at
// import time, so the composition root dynamic-imports it and hands the
// instance in — tests drive a fake.

import { z } from 'zod';

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
  | 'manual'
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

// ── macOS manual-download flow (D21) ─────────────────────────────────────────
// Unsigned builds can't use Squirrel.Mac, so mac packaged builds get a
// notify-only controller: it polls the download page's version-mac.json and,
// when a newer version exists, reports phase `manual` — the UI offers a
// Download button and `install()` opens the page instead of installing.

export const MANUAL_DOWNLOAD_PAGE_URL = 'https://ext.gosling-agency.ru/desktop/';

export function shouldNotifyManualUpdate(platform: string, isPackaged: boolean): boolean {
  return platform === 'darwin' && isPackaged;
}

const RELEASE_VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Strict stable-semver "candidate is newer" — anything non-parsable is not. */
export function isNewerVersion(candidate: string, current: string): boolean {
  if (!RELEASE_VERSION_RE.test(candidate) || !RELEASE_VERSION_RE.test(current)) {
    return false;
  }
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

const manualManifestSchema = z.object({ version: z.string().regex(RELEASE_VERSION_RE) });

export function createManualUpdateController(options: {
  currentVersion: string;
  /** Fetches the page's version-mac.json; the raw value is zod-validated here. */
  fetchManifest: () => Promise<unknown>;
  /** The `install()` action: open the download page. */
  openDownloadPage: () => void;
  /** Fires once per distinct newer version per app run (the OS notification). */
  onAvailable?: (version: string) => void;
}): UpdateController {
  const { currentVersion, fetchManifest, openDownloadPage, onAvailable } = options;
  let state: UpdateStatus = IDLE;
  let notifiedVersion: string | null = null;

  return {
    status: () => state,
    check: async () => {
      state = { phase: 'checking', version: null, percent: null, message: null };
      try {
        const manifest = manualManifestSchema.parse(await fetchManifest());
        if (isNewerVersion(manifest.version, currentVersion)) {
          state = { phase: 'manual', version: manifest.version, percent: null, message: null };
          if (notifiedVersion !== manifest.version) {
            notifiedVersion = manifest.version;
            onAvailable?.(manifest.version);
          }
        } else {
          state = { phase: 'up-to-date', version: null, percent: null, message: null };
        }
      } catch (err) {
        // Same policy as the win path: the background loop stays silent, the
        // manual button surfaces this `error` phase.
        state = {
          phase: 'error',
          version: null,
          percent: null,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      return state;
    },
    install: () => openDownloadPage(),
  };
}

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
