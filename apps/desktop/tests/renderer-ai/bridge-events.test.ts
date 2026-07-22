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

vi.mock('../../src/renderer/src/lib/sound', () => ({
  playNotificationBlip: vi.fn(),
}));

import { attachBridgeEvents } from '../../src/renderer/src/bridge/events';
import { playNotificationBlip } from '../../src/renderer/src/lib/sound';
import { qk } from '../../src/renderer/src/bridge/queries';
import { useSettingsCache } from '../../src/renderer/src/state/settingsCache';
import { useUiStore } from '../../src/renderer/src/state/uiStore';
import * as aiStore from '../../src/renderer/src/features/ai/aiStore';

describe('attachBridgeEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridgeMock.listeners.clear();
    bridgeMock.bridge.on.mockClear();
    useSettingsCache.setState({ notificationsEnabled: true, soundEnabled: false, uiLocale: 'en' });
    useUiStore.setState({ selectedAccountId: null, selectedChatId: null, toasts: [] });
    vi.mocked(playNotificationBlip).mockClear();
    vi.stubGlobal('document', { hasFocus: () => false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('resets AI jobs only for main\'s committed runtime identity replacement', () => {
    const queryClient = new QueryClient();
    const resetSpy = vi.spyOn(aiStore, 'resetAiJobsForHubOriginChange');
    const detach = attachBridgeEvents(queryClient);

    for (const listener of bridgeMock.listeners.get('db:changed') ?? []) {
      listener({ scope: 'settings', settingsKeys: ['soundEnabled'] });
    }
    expect(resetSpy).not.toHaveBeenCalled();

    for (const listener of bridgeMock.listeners.get('db:changed') ?? []) {
      listener({
        scope: 'settings',
        settingsKeys: ['personalities.catalog.v1.scope-digest'],
      });
    }
    expect(resetSpy).not.toHaveBeenCalled();

    for (const listener of bridgeMock.listeners.get('db:changed') ?? []) {
      listener({ scope: 'settings', settingsKeys: ['runtime.aiContext'] });
    }
    expect(resetSpy).toHaveBeenCalledTimes(1);
    detach();
    resetSpy.mockRestore();
  });

  it('builds a message toast from the incoming frame instead of the stale chat preview', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(qk.chats('acct_1', 'all'), {
      items: [{ chatId: 'chat_1', fanName: 'Alice', lastMessagePreview: 'old preview' }],
    });
    const detach = attachBridgeEvents(queryClient);

    for (const listener of bridgeMock.listeners.get('sync:event') ?? []) {
      listener({
        type: 'messageReceived',
        accountId: 'acct_1',
        chatId: 'chat_1',
        messageId: 'm2',
        message: {
          id: 'm2',
          text: '<p>new body<br>second line</p>',
          createdAt: '2026-07-12T12:00:00.000Z',
          isSentByMe: false,
          price: 0,
        },
      });
    }

    expect(useUiStore.getState().toasts.at(-1)).toMatchObject({
      title: 'Alice',
      body: 'new body\nsecond line',
    });
    detach();
  });

  it('applies replayed live:false frames silently — no toast, no blip', () => {
    useSettingsCache.setState({ notificationsEnabled: true, soundEnabled: true, uiLocale: 'en' });
    const queryClient = new QueryClient();
    const detach = attachBridgeEvents(queryClient);

    const replayed = {
      type: 'messageReceived',
      accountId: 'acct_1',
      chatId: 'chat_1',
      messageId: 'm-replay',
      live: false,
      message: {
        id: 'm-replay',
        text: '<p>from the backlog</p>',
        createdAt: '2026-07-12T02:00:00.000Z',
        isSentByMe: false,
        price: 0,
      },
    };
    for (const listener of bridgeMock.listeners.get('sync:event') ?? []) {
      listener(replayed);
    }
    expect(useUiStore.getState().toasts).toHaveLength(0);
    expect(playNotificationBlip).not.toHaveBeenCalled();

    // The identical frame WITHOUT the flag is live delivery: exactly one
    // toast and one blip.
    const { live: _live, ...liveFrame } = replayed;
    for (const listener of bridgeMock.listeners.get('sync:event') ?? []) {
      listener({ ...liveFrame, messageId: 'm-live' });
    }
    expect(useUiStore.getState().toasts).toHaveLength(1);
    expect(playNotificationBlip).toHaveBeenCalledTimes(1);
    detach();
  });
});
