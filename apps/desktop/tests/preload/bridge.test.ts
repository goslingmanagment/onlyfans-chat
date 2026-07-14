// Preload bridge boundary (SPEC §15.1): the renderer may only reach main
// through registered channels — unknown channel strings must throw in preload
// before any ipcRenderer call.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVOKE_CHANNEL_NAMES } from '../../src/preload/contract';
import type {
  ChatGooseBridge,
  EventChannelName,
  InvokeChannelName,
} from '../../src/preload/contract';

const electronMock = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(key: string, api: ChatGooseBridge) => void>(),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(async () => undefined),
  on: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
  removeListener: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMock.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMock.invoke,
    on: electronMock.on,
    removeListener: electronMock.removeListener,
  },
}));

// Importing the preload entry runs exposeInMainWorld once; capture the bridge.
await import('../../src/preload/index');
const exposeCall = electronMock.exposeInMainWorld.mock.calls[0];
if (!exposeCall) throw new Error('preload did not call exposeInMainWorld');
const [worldKey, bridge] = exposeCall;

beforeEach(() => {
  electronMock.invoke.mockClear();
  electronMock.on.mockClear();
  electronMock.removeListener.mockClear();
});

describe('preload bridge exposure', () => {
  it('exposes the bridge as window.chatgoose exactly once', () => {
    expect(electronMock.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(worldKey).toBe('chatgoose');
    expect(typeof bridge.invoke).toBe('function');
    expect(typeof bridge.on).toBe('function');
  });
});

describe('bridge.invoke', () => {
  it('passes a known channel and args through to ipcRenderer.invoke', async () => {
    const args = { accountId: 'acct_1', filter: 'all' as const };
    electronMock.invoke.mockResolvedValueOnce({ items: [], hasMore: false });

    const result = await bridge.invoke('query:chats.list', args);

    expect(electronMock.invoke).toHaveBeenCalledTimes(1);
    expect(electronMock.invoke).toHaveBeenCalledWith('query:chats.list', args);
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it('passes void-args channels through with undefined payload', async () => {
    await bridge.invoke('query:accounts.list', undefined);
    expect(electronMock.invoke).toHaveBeenCalledWith('query:accounts.list', undefined);
  });

  it('throws on an unknown channel without ever calling ipcRenderer.invoke', () => {
    expect(() =>
      bridge.invoke('cmd:evil.dropEverything' as InvokeChannelName, undefined),
    ).toThrow('Unknown invoke channel: cmd:evil.dropEverything');
    expect(electronMock.invoke).not.toHaveBeenCalled();
  });

  it('rejects near-miss channel strings (case / whitespace variants)', () => {
    for (const channel of ['Query:accounts.list', ' query:accounts.list', 'cmd:data.purge ']) {
      expect(() => bridge.invoke(channel as InvokeChannelName, undefined)).toThrow(
        `Unknown invoke channel: ${channel}`,
      );
    }
    expect(electronMock.invoke).not.toHaveBeenCalled();
  });
});

describe('bridge.on', () => {
  it('throws on an unknown event channel without subscribing', () => {
    expect(() => bridge.on('evil:event' as EventChannelName, () => {})).toThrow(
      'Unknown event channel: evil:event',
    );
    expect(electronMock.on).not.toHaveBeenCalled();
  });

  it('subscribes a known channel, forwards the payload, and unsubscribes', () => {
    const seen: unknown[] = [];
    const unsubscribe = bridge.on('db:changed', (payload) => seen.push(payload));

    expect(electronMock.on).toHaveBeenCalledTimes(1);
    const [channel, wrapped] = electronMock.on.mock.calls[0]!;
    expect(channel).toBe('db:changed');

    wrapped({ fakeEvent: true }, { scope: 'chats', accountId: 'acct_1' });
    expect(seen).toEqual([{ scope: 'chats', accountId: 'acct_1' }]);

    unsubscribe();
    expect(electronMock.removeListener).toHaveBeenCalledWith('db:changed', wrapped);
  });
});

describe('invoke-channel registry', () => {
  it('is non-empty and contains known channels', () => {
    expect(INVOKE_CHANNEL_NAMES.length).toBeGreaterThan(0);
    expect(INVOKE_CHANNEL_NAMES).toContain('query:accounts.list');
    expect(INVOKE_CHANNEL_NAMES).toContain('cmd:data.purge');
    expect(INVOKE_CHANNEL_NAMES).toContain('cmd:harvest.prepareIdentity');
    expect(INVOKE_CHANNEL_NAMES).toContain('ai:start');
  });

  it('has no duplicates and only namespaced channel names', () => {
    expect(new Set(INVOKE_CHANNEL_NAMES).size).toBe(INVOKE_CHANNEL_NAMES.length);
    for (const name of INVOKE_CHANNEL_NAMES) {
      expect(name).toMatch(/^(query|cmd|ai):/);
    }
  });

  it('every registered channel passes the preload guard', async () => {
    for (const name of INVOKE_CHANNEL_NAMES) {
      await bridge.invoke(name, undefined as never);
    }
    expect(electronMock.invoke).toHaveBeenCalledTimes(INVOKE_CHANNEL_NAMES.length);
  });
});
