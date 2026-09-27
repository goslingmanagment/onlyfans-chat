// D43 IPC trust boundary for media images: only a media://<64 hex> URL
// crosses (never a remote URL), `cmd:media.load` is a click unless the
// lightbox's navigation says `auto`, and `cmd:media.cancel` drops an
// unstarted automatic load. Without a media source every answer is quiet.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import { createSettingsStore } from '@main/settings/store';
import { registerIpcHandlers } from '@main/ipc/handlers';
import type { IpcDeps } from '@main/ipc/handlers';
import { memoryDataLayer } from '../db/helpers';

type Handler = (event: unknown, args?: unknown) => unknown;
const handlers = vi.hoisted(() => new Map<string, Handler>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
  },
}));

async function invoke(channel: string, args?: unknown): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({}, args);
}

const URL = `media://${'a'.repeat(64)}`;

function register(media: IpcDeps['media']): DataLayer {
  handlers.clear();
  const data = memoryDataLayer();
  const secrets = {
    getSecret: async () => null,
    hasSecret: async () => false,
    setSecret: async () => undefined,
    deleteSecret: async () => undefined,
  };
  registerIpcHandlers({
    data,
    settingsStore: createSettingsStore({ queries: data.settings, secrets }),
    sync: null,
    creditMeter: null,
    coordinator: null,
    send: null,
    purge: async () => undefined,
    media,
  } as IpcDeps);
  return data;
}

describe('media IPC handlers', () => {
  const media = {
    state: vi.fn(() => ({ state: 'idle' as const })),
    load: vi.fn(async () => ({ state: 'ready' as const })),
    cancel: vi.fn(() => true),
  };

  beforeEach(() => {
    media.state.mockClear();
    media.load.mockClear();
    media.cancel.mockClear();
    register(media);
  });

  it('refuses anything but a media:// token before touching main', async () => {
    for (const url of ['https://cdn2.onlyfans.com/files/x.jpg', 'media://abc', `media://${'A'.repeat(64)}`, '']) {
      await expect(invoke('query:media.state', { url })).rejects.toThrow();
      await expect(invoke('cmd:media.load', { url, surface: 'thread' })).rejects.toThrow();
      await expect(invoke('cmd:media.cancel', { url })).rejects.toThrow();
    }
    await expect(invoke('cmd:media.load', { url: URL, surface: 'nowhere' })).rejects.toThrow();
    await expect(invoke('cmd:media.load', { url: URL, surface: 'thread', trigger: 'always' })).rejects.toThrow();
    await expect(invoke('cmd:media.load', { url: URL, surface: 'thread', extra: 1 })).rejects.toThrow();
    expect(media.load).not.toHaveBeenCalled();
  });

  it('a load is a click unless the caller says auto; the surface rides along', async () => {
    expect(await invoke('cmd:media.load', { url: `${URL}?s=gallery`, surface: 'gallery' })).toEqual({ state: 'ready' });
    expect(media.load).toHaveBeenLastCalledWith(`${URL}?s=gallery`, 'gallery', 'click');
    await invoke('cmd:media.load', { url: URL, surface: 'lightbox', trigger: 'auto' });
    expect(media.load).toHaveBeenLastCalledWith(URL, 'lightbox', 'auto');
  });

  it('cancel delegates and reports whether an unstarted load was dropped', async () => {
    expect(await invoke('cmd:media.cancel', { url: URL })).toEqual({ cancelled: true });
    expect(media.cancel).toHaveBeenCalledWith(URL);
  });

  it('without a media source every answer is quiet', async () => {
    register(null);
    expect(await invoke('query:media.state', { url: URL })).toEqual({ state: 'unavailable' });
    expect(await invoke('cmd:media.load', { url: URL, surface: 'thread' })).toEqual({ state: 'unavailable' });
    expect(await invoke('cmd:media.cancel', { url: URL })).toEqual({ cancelled: false });
  });
});
