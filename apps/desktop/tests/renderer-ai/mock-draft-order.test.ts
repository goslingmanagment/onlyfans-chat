// Fixture-only regression: mock latency must not reorder the synchronous
// local draft handlers. All stores/controllers below are real; no live IPC.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatGooseBridge } from '../../src/preload/contract';

const invoke = vi.hoisted(() => vi.fn<ChatGooseBridge['invoke']>());
vi.mock('../../src/renderer/src/bridge/bridge', () => ({ getBridge: () => ({ invoke }) }));

import { createMockBridge } from '../../src/renderer/src/dev/mockBridge';
import {
  handleConversationChange,
  setDraftText,
  useAiStore,
} from '../../src/renderer/src/features/ai/aiStore';

const CTX = { accountId: 'acct_1', chatId: '90018' };

beforeEach(async () => {
  vi.useFakeTimers();
  invoke.mockImplementation(createMockBridge().invoke);
  useAiStore.setState(useAiStore.getInitialState(), true);
  handleConversationChange(CTX.accountId, CTX.chatId);
  await vi.advanceTimersByTimeAsync(100);
  invoke.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  handleConversationChange(null, null);
  vi.clearAllTimers();
  vi.useRealTimers();
});

/** Deterministically deliver mocked IPC responses in an adversarial order. */
function holdResponses(): Array<() => void> {
  const responses: Array<() => void> = [];
  vi.stubGlobal('setTimeout', (callback: () => void) => {
    responses.push(callback);
    return responses.length;
  });
  return responses;
}

it('captures each draft read between the writes that precede and follow it', async () => {
  const responses = holdResponses();
  const firstWrite = invoke('cmd:draft.set', { ...CTX, text: 'original' });
  const firstRead = invoke('query:draft.get', CTX);
  const clear = invoke('cmd:draft.set', { ...CTX, text: '' });
  const clearedRead = invoke('query:draft.get', CTX);
  expect(responses).toHaveLength(4);
  for (const index of [1, 3, 2, 0]) responses[index]!();
  await expect(firstRead).resolves.toEqual({ text: 'original' });
  await expect(clearedRead).resolves.toEqual({ text: '' });
  await Promise.all([firstWrite, clear]);
});

it('keeps a clear when QuickLook closes and reopens before the debounce expires', async () => {
  setDraftText('hey how are u');
  await vi.advanceTimersByTimeAsync(600); // the original draft is stored
  setDraftText('');
  const responses = holdResponses();
  handleConversationChange(null, null); // flush the clear immediately
  handleConversationChange(CTX.accountId, CTX.chatId);
  expect(responses).toHaveLength(2);
  responses[1]!(); // read response arrives before the write acknowledgement
  await Promise.resolve();
  expect(useAiStore.getState().draftText).toBe('');
  responses[0]!();
  await Promise.resolve();
  expect(useAiStore.getState().draftText).toBe('');
  expect(invoke.mock.calls.some(([channel]) => channel === 'cmd:send.message')).toBe(false);
});
