// Auto-update policy (PLAN item 11 follow-up): win32-packaged-only gate,
// download-in-background + install-on-quit flags, quiet ready notification,
// silent failed checks, periodic re-check.

import { describe, expect, it } from 'vitest';
import {
  shouldAutoUpdate,
  startAutoUpdater,
  UPDATE_CHECK_INTERVAL_MS,
  type AppUpdaterLike,
} from '@main/platform/updater';

function fakeUpdater(options: { reject?: boolean } = {}): {
  updater: AppUpdaterLike;
  checks: () => number;
  fireDownloaded: (version: string) => void;
} {
  let checks = 0;
  let downloadedListener: ((info: { version: string }) => void) | null = null;
  const updater: AppUpdaterLike = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: (_event, listener) => {
      downloadedListener = listener;
      return updater;
    },
    checkForUpdates: () => {
      checks += 1;
      return options.reject === true ? Promise.reject(new Error('offline')) : Promise.resolve(null);
    },
  };
  return {
    updater,
    checks: () => checks,
    fireDownloaded: (version) => downloadedListener?.({ version }),
  };
}

describe('shouldAutoUpdate', () => {
  it('only win32 packaged builds update themselves', () => {
    expect(shouldAutoUpdate('win32', true)).toBe(true);
    expect(shouldAutoUpdate('win32', false)).toBe(false); // dev
    expect(shouldAutoUpdate('darwin', true)).toBe(false); // unsigned mac can't
    expect(shouldAutoUpdate('linux', true)).toBe(false);
  });
});

describe('startAutoUpdater', () => {
  it('sets background-download + install-on-quit and checks immediately', () => {
    const fake = fakeUpdater();
    startAutoUpdater({ updater: fake.updater, onUpdateReady: () => undefined, schedule: () => 0 });
    expect(fake.updater.autoDownload).toBe(true);
    expect(fake.updater.autoInstallOnAppQuit).toBe(true);
    expect(fake.checks()).toBe(1);
  });

  it('notifies quietly when an update finished downloading', () => {
    const fake = fakeUpdater();
    const ready: string[] = [];
    startAutoUpdater({ updater: fake.updater, onUpdateReady: (v) => ready.push(v), schedule: () => 0 });
    fake.fireDownloaded('0.0.2');
    expect(ready).toEqual(['0.0.2']);
  });

  it('schedules periodic re-checks at the default interval', () => {
    const fake = fakeUpdater();
    let scheduledMs = 0;
    const ticks: Array<() => void> = [];
    startAutoUpdater({
      updater: fake.updater,
      onUpdateReady: () => undefined,
      schedule: (fn, ms) => {
        ticks.push(fn);
        scheduledMs = ms;
        return 0;
      },
    });
    expect(scheduledMs).toBe(UPDATE_CHECK_INTERVAL_MS);
    ticks[0]?.();
    expect(fake.checks()).toBe(2);
  });

  it('swallows failed checks (offline shift stays silent)', async () => {
    const fake = fakeUpdater({ reject: true });
    expect(() =>
      startAutoUpdater({ updater: fake.updater, onUpdateReady: () => undefined, schedule: () => 0 }),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.checks()).toBe(1);
  });
});
