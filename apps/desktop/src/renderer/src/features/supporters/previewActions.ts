// Quick-look helpers shared by the overlay and the global keymap. AI starts
// from the preview pass the SAME gates as the composer pill row (PLAN item 12:
// reuse the existing feature-gate logic); gated invocations are silent no-ops —
// the coordinator's CG-FLOW-* checks stay authoritative.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { AccountVM, MessageVM, PingGateVM, SettingsVM } from '../../../../preload/contract';
import { qk } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { startAiFeature } from '../ai/aiStore';
import { deriveHiLocked, evaluateAiGate, evaluateHiGate, evaluatePingGate } from '../ai/dockLogic';
import { pingGateKey } from '../ai/pingGate';
import { useSupportersStore } from './supportersStore';

export const PREVIEW_TEXTAREA_ID = 'supporters-preview-composer';

export function focusPreviewComposer(): void {
  const el = document.getElementById(PREVIEW_TEXTAREA_ID);
  if (el instanceof HTMLTextAreaElement && !el.disabled) el.focus();
}

/** The three pill features the preview exposes (mockup: Ping primary, Reply, Hi). */
export type PreviewAiFeature = 'ping' | 'fast-reply' | 'hi-greeting';

export function startAiFromPreview(feature: PreviewAiFeature, queryClient: QueryClient): void {
  const ui = useUiStore.getState();
  const fanId = useSupportersStore.getState().previewFanId;
  if (ui.view !== 'supporters' || ui.selectedAccountId === null || fanId === null) return;
  const accountId = ui.selectedAccountId;

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
    const pingGate = queryClient.getQueryData<PingGateVM>(pingGateKey(accountId, fanId));
    if (!evaluatePingGate(gate, pingGate?.blocked ?? null).enabled) return;
  }
  if (feature === 'hi-greeting') {
    const pages = queryClient.getQueryData<InfiniteData<{ items: MessageVM[]; hasMore: boolean }>>(
      qk.messages(accountId, fanId),
    )?.pages;
    if (!evaluateHiGate(gate, deriveHiLocked(pages)).enabled) return;
  }

  startAiFeature(feature, { accountId, chatId: fanId, defaultTone: settings.defaultReplyTone });
}
