// Localized text for an AI gate / deep-pill block reason. dockLogic emits the
// reason CODE (locale-free, unit-tested); the chrome resolves it to Russian/English
// here so the AI/LLM path itself is never touched (CLAUDE.md: uiLocale is chrome only).
// AiGate.reason ('unmapped' | 'no-key') is a subset of PillGateReason, so this also
// resolves the account-level gate message.

import { HI_GREETING_MAX_TRANSCRIPT } from '@chatgoose/shared/constants';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import type { PillGateReason } from './dockLogic';

export function gateText(t: UiTranslator, code: PillGateReason): string {
  switch (code) {
    case 'unmapped':
      return t('aidock.gate.unmapped');
    case 'no-key':
      return t('aidock.gate.noKey');
    case 'ping-blocked':
      return t('aidock.pingBlocked');
    case 'hi-locked':
      return t('aidock.hiLocked', { max: HI_GREETING_MAX_TRANSCRIPT });
    case 'loading':
      return t('common.loading');
  }
}
