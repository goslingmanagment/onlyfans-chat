import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    listeners,
    bridge: {
      platform: 'darwin',
      invoke: vi.fn(async () => undefined),
      on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
        const channelListeners = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
        channelListeners.add(listener);
        listeners.set(channel, channelListeners);
        return () => channelListeners.delete(listener);
      }),
    },
  };
});

vi.mock('../../src/renderer/src/bridge/bridge', () => ({
  getBridge: () => bridgeMock.bridge,
}));

import { attachBridgeEvents } from '../../src/renderer/src/bridge/events';
import { qk } from '../../src/renderer/src/bridge/queries';

describe('attachBridgeEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridgeMock.listeners.clear();
    bridgeMock.bridge.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invalidates accounts when chat rows change', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const detach = attachBridgeEvents(queryClient);

    for (const listener of bridgeMock.listeners.get('db:changed') ?? []) {
      listener({ scope: 'chats', accountId: 'acct_1', chatId: 'chat_1' });
    }
    await vi.advanceTimersByTimeAsync(50);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.accounts });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['online', 'acct_1'] });
    detach();
  });
});
