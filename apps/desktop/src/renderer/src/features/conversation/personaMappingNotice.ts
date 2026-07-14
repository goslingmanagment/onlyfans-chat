import type { UiMessageKey, UiMessageParams } from '@chatgoose/shared/i18n/index';
import type { AccountVM } from '../../../../preload/contract';

export interface ConversationPersonaNotice {
  titleKey: UiMessageKey;
  bodyKey: UiMessageKey;
  params?: UiMessageParams;
}

export function conversationPersonaNotice(
  account: Pick<AccountVM, 'personalityMappingState' | 'rawPersonalityId'> | null,
): ConversationPersonaNotice | null {
  if (account === null || account.personalityMappingState === 'active') {
    return null;
  }
  if (account.personalityMappingState === 'unmapped') {
    return {
      titleKey: 'conv.gateMapTitle',
      bodyKey: 'conv.gateMapBody',
    };
  }

  const params = { persona: account.rawPersonalityId ?? 'unknown' };
  return account.personalityMappingState === 'archived'
    ? {
        titleKey: 'conv.gateArchivedTitle',
        bodyKey: 'conv.gateArchivedBody',
        params,
      }
    : {
        titleKey: 'conv.gateUnresolvedTitle',
        bodyKey: 'conv.gateUnresolvedBody',
        params,
      };
}
