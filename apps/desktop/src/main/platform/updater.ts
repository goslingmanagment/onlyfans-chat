// Auto-update policy (PLAN item 11 follow-up, owner request 2026-06-13).
// Windows packaged builds only: macOS refuses to apply updates to unsigned
// apps (Squirrel.Mac hard requirement) and the owner runs the dev build there
// anyway. Quiet by design — download in the background, install on quit,
// NEVER prompt for a restart mid-shift; a failed check (offline shift, feed
// not reachable) is silent. The feed is electron-updater's generic provider
// over HTTPS (electron-builder.yml `publish`; ops in docs/RELEASE.md) —
// builds are unsigned, so the feed host being ours IS the trust anchor.
//
// This module is dependency-free (interfaces only): electron-updater pulls in
// Electron at import time, so the composition root dynamic-imports it and
// hands the instance in — tests drive a fake.

export function shouldAutoUpdate(platform: string, isPackaged: boolean): boolean {
  return platform === 'win32' && isPackaged;
}

/** The slice of electron-updater's AppUpdater this policy needs. */
export interface AppUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  checkForUpdates(): Promise<unknown>;
}

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface StartAutoUpdaterOptions {
  updater: AppUpdaterLike;
  /** Quiet "installs when you quit" notification. */
  onUpdateReady: (version: string) => void;
  intervalMs?: number;
  /** Injectable for tests; defaults to setInterval. */
  schedule?: (fn: () => void, ms: number) => unknown;
}

export function startAutoUpdater(options: StartAutoUpdaterOptions): void {
  const { updater, onUpdateReady } = options;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', (info) => onUpdateReady(info.version));
  const check = (): void => {
    // Offline shifts and feed outages must never surface to the chatter.
    void updater.checkForUpdates().catch(() => undefined);
  };
  check();
  const schedule = options.schedule ?? ((fn, ms) => setInterval(fn, ms));
  schedule(check, options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS);
}
