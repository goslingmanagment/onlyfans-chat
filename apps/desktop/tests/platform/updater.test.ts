// Auto-update policy + controller (PLAN item 11 follow-up): win32-packaged-only
// gate, the event-driven status machine, quiet ready notification, silent
// failed checks, periodic re-check, and the manual install action.

import { describe, expect, it } from 'vitest';
import {
  createUpdateController,
  shouldAutoUpdate,
  startAutoUpdater,
  UPDATE_CHECK_INTERVAL_MS,
  type AppUpdaterLike,
} from '@main/platform/updater';

type Listeners = Record<string, (arg: never) => void>;

function fakeUpdater(options: { reject?: boolean } = {}): {
  updater: AppUpdaterLike;
  checks: () => number;
  installs: () => number;
  emit: (event: string, arg?: unknown) => void;
} {
  let checks = 0;
  let installs = 0;
  const listeners: Listeners = {};
  const updater: AppUpdaterLike = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: ((event: string, listener: (arg: never) => void) => {
      listeners[event] = listener;
      return updater;
    }) as AppUpdaterLike['on'],
    checkForUpdates: () => {
      checks += 1;
      return options.reject === true ? Promise.reject(new Error('offline')) : Promise.resolve(null);
    },
    quitAndInstall: () => {
      installs += 1;
    },
  };
  return {
    updater,
    checks: () => checks,
    installs: () => installs,
    emit: (event, arg) => listeners[event]?.(arg as never),
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

describe('createUpdateController', () => {
  it('sets background-download + install-on-quit and starts idle', () => {
    const fake = fakeUpdater();
    const controller = createUpdateController({ updater: fake.updater });
    expect(fake.updater.autoDownload).toBe(true);
    expect(fake.updater.autoInstallOnAppQuit).toBe(true);
    expect(controller.status().phase).toBe('idle');
  });

  it('walks check → available → downloading → downloaded', () => {
    const fake = fakeUpdater();
    const ready: string[] = [];
    const controller = createUpdateController({
      updater: fake.updater,
      onReady: (v) => ready.push(v),
    });

    fake.emit('checking-for-update');
    expect(controller.status().phase).toBe('checking');

    fake.emit('update-available', { version: '0.0.2' });
    expect(controller.status()).toMatchObject({ phase: 'available', version: '0.0.2' });

    fake.emit('download-progress', { percent: 42.6 });
    expect(controller.status()).toMatchObject({ phase: 'downloading', version: '0.0.2', percent: 43 });

    fake.emit('update-downloaded', { version: '0.0.2' });
    expect(controller.status()).toMatchObject({ phase: 'downloaded', version: '0.0.2', percent: 100 });
    expect(ready).toEqual(['0.0.2']); // quiet "installs on quit" toast fired
  });

  it('reports up-to-date when no update is available', () => {
    const fake = fakeUpdater();
    const controller = createUpdateController({ updater: fake.updater });
    fake.emit('update-not-available', { version: '0.0.1' });
    expect(controller.status().phase).toBe('up-to-date');
  });

  it('clamps download percent into 0..100', () => {
    const fake = fakeUpdater();
    const controller = createUpdateController({ updater: fake.updater });
    fake.emit('update-available', { version: '9' });
    fake.emit('download-progress', { percent: 130 });
    expect(controller.status().percent).toBe(100);
  });

  it('check() surfaces a failed check as the error phase (manual button path)', async () => {
    const fake = fakeUpdater({ reject: true });
    const controller = createUpdateController({ updater: fake.updater });
    const result = await controller.check();
    expect(result.phase).toBe('error');
    expect(result.message).toContain('offline');
    expect(fake.checks()).toBe(1);
  });

  it('check() resolves with the post-check snapshot', async () => {
    const fake = fakeUpdater();
    const controller = createUpdateController({ updater: fake.updater });
    const result = await controller.check();
    // Fake's checkForUpdates resolves without firing events → snapshot is the
    // checking state it set on entry.
    expect(result.phase).toBe('checking');
    expect(fake.checks()).toBe(1);
  });

  it('install() quits and installs', () => {
    const fake = fakeUpdater();
    const controller = createUpdateController({ updater: fake.updater });
    controller.install();
    expect(fake.installs()).toBe(1);
  });
});

describe('startAutoUpdater', () => {
  it('checks at launch and schedules periodic re-checks at the default interval', () => {
    const fake = fakeUpdater();
    const controller = createUpdateController({ updater: fake.updater });
    let scheduledMs = 0;
    const ticks: Array<() => void> = [];
    startAutoUpdater({
      controller,
      schedule: (fn, ms) => {
        ticks.push(fn);
        scheduledMs = ms;
        return 0;
      },
    });
    expect(fake.checks()).toBe(1); // launch check
    expect(scheduledMs).toBe(UPDATE_CHECK_INTERVAL_MS);
    ticks[0]?.();
    expect(fake.checks()).toBe(2); // interval check
  });
});
