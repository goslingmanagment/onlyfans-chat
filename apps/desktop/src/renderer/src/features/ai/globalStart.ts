// Single gated entry point for AI starts that originate outside the pill
// row/menu (keymap ⌘R/⌘I/⌘H/⌘P/⌘G/⌘E/⌘S, ⌘K palette) — same gates as the
// visible buttons, evaluated from the query cache. Feature-specific gates fall
// open when their data is not cached: the coordinator's CG-FLOW-* checks stay
// authoritative and surface as dock error cards.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  AccountVM,
  MessageVM,
  PingGateVM,
  SettingsVM,
} from '../../../../preload/contract';
import { qk } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { startAiFeature, type LiveAiFeature } from './aiStore';
import { deriveHiLocked, evaluateAiGate, evaluateHiGate, evaluatePingGate } from './dockLogic';
import { pingGateKey } from './pingGate';

type MessagesData = InfiniteData<{ items: MessageVM[]; hasMore: boolean }>;

export function startAiFromGlobal(feature: LiveAiFeature, queryClient: QueryClient): void {
  const ui = useUiStore.getState();
  if (ui.view !== 'workspace' || ui.selectedAccountId === null || ui.selectedChatId === null) {
    return;
  }
  const accountId = ui.selectedAccountId;
  const chatId = ui.selectedChatId;
  const settings = queryClient.getQueryData<SettingsVM>(qk.settings);
  const account = queryClient
    .getQueryData<AccountVM[]>(qk.accounts)
    ?.find((a) => a.id === accountId);
  if (settings === undefined || account === undefined) return;

  const gate = evaluateAiGate({
    mapped: account.personalityId !== null,
    hasLlmKey: settings.hasAnthropicKey || settings.hasOpenRouterKey,
  });
  if (!gate.ok) return;

  if (feature === 'ping') {
    const pingGate = queryClient.getQueryData<PingGateVM>(pingGateKey(accountId, chatId));
    if (!evaluatePingGate(gate, pingGate?.blocked ?? null).enabled) return;
  }
  if (feature === 'hi-greeting') {
    const pages = queryClient.getQueryData<MessagesData>(qk.messages(accountId, chatId))?.pages;
    if (!evaluateHiGate(gate, deriveHiLocked(pages)).enabled) return;
  }

  startAiFeature(feature, { accountId, chatId, defaultTone: settings.defaultReplyTone });
}
