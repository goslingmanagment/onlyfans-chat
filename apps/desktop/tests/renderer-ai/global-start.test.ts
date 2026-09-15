import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountVM, SettingsVM } from '../../src/preload/contract';

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, args: unknown) => Promise<unknown>>(() => Promise.resolve({ text: '' })),
);
vi.mock('../../src/renderer/src/bridge/bridge', () => ({
  getBridge: () => ({ invoke }),
}));

import { qk } from '../../src/renderer/src/bridge/queries';
import { startAiFromGlobal } from '../../src/renderer/src/features/ai/globalStart';
import { useAiStore } from '../../src/renderer/src/features/ai/aiStore';
import { pingGateKey } from '../../src/renderer/src/features/ai/pingGate';
import { useUiStore } from '../../src/renderer/src/state/uiStore';

const ACCOUNT_ID = 'acct_1';
const CHAT_ID = 'chat_1';

function resetAiStore(): void {
  useAiStore.setState({
    op: null,
    status: 'running',
    phase: 'idle',
    progressMessage: null,
    progressPages: null,
    view: null,
    error: null,
    spend: null,
    profiling: null,
    debugPrompt: null,
    jobsById: {},
    jobsByConversation: {},
    visibleConversationKey: `${ACCOUNT_ID}/${CHAT_ID}`,
    toneOverride: null,
    toneMenuOpen: false,
    preferSplit: false,
    partFeedback: null,
    draftText: '',
    scanFlashSeq: 0,
  });
}

function makeQueryClient(): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(qk.settings, {
    // Stage 31 / D35: the signed-in device IS the AI configuration.
    hasHubDeviceToken: true,
    hubDeviceTokenBindingState: 'bound',
    hubBaseUrl: 'https://hub.example.com',
    defaultReplyTone: 'casual',
  } as SettingsVM);
  queryClient.setQueryData(qk.accounts, [
    { id: ACCOUNT_ID, personalityId: 'builtin:lora' } as AccountVM,
  ]);
  queryClient.setQueryData(pingGateKey(ACCOUNT_ID, CHAT_ID), { segment: 'segment-b', blocked: false });
  return queryClient;
}

function seedLoadedMessages(queryClient: QueryClient): void {
  queryClient.setQueryData(qk.messages(ACCOUNT_ID, CHAT_ID), {
    pages: [{ items: [], hasMore: false }],
    pageParams: [null],
  });
}

beforeEach(() => {
  invoke.mockClear();
  resetAiStore();
  useUiStore.setState({
    view: 'workspace',
    selectedAccountId: ACCOUNT_ID,
    selectedChatId: CHAT_ID,
  });
});

describe('startAiFromGlobal message-load gate', () => {
  it('does not start AI before messages are loaded', () => {
    const queryClient = makeQueryClient();

    startAiFromGlobal('ping', queryClient);

    expect(useAiStore.getState().op).toBeNull();
    expect(invoke.mock.calls.some((call) => call[0] === 'ai:start')).toBe(false);
  });

  it('starts AI once messages are loaded', () => {
    const queryClient = makeQueryClient();
    seedLoadedMessages(queryClient);

    startAiFromGlobal('ping', queryClient);

    expect(useAiStore.getState().op).toMatchObject({ feature: 'ping', chatId: CHAT_ID });
    expect(invoke.mock.calls.some((call) => call[0] === 'ai:start')).toBe(true);
  });

  it('starts manual Ping for an active fan even if an old recency flag is cached', () => {
    const queryClient = makeQueryClient();
    seedLoadedMessages(queryClient);
    queryClient.setQueryData(pingGateKey(ACCOUNT_ID, CHAT_ID), { segment: 'active', blocked: true });
    startAiFromGlobal('ping', queryClient);
    expect(useAiStore.getState().op).toMatchObject({ feature: 'ping', chatId: CHAT_ID });
    expect(invoke.mock.calls.some(call => call[0] === 'ai:start')).toBe(true);
    expect(invoke.mock.calls.some(call => call[0].startsWith('cmd:send'))).toBe(false);
  });
});
