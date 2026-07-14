import { describe, expect, it } from 'vitest';
import { conversationPersonaNotice } from '../../src/renderer/src/features/conversation/personaMappingNotice';

describe('conversationPersonaNotice', () => {
  it('keeps the generic copy only for a genuinely unmapped account', () => {
    expect(conversationPersonaNotice({
      personalityMappingState: 'unmapped',
      rawPersonalityId: null,
    })).toEqual({
      titleKey: 'conv.gateMapTitle',
      bodyKey: 'conv.gateMapBody',
    });
  });

  it.each([
    ['archived', 'conv.gateArchivedTitle', 'conv.gateArchivedBody'],
    ['unresolved', 'conv.gateUnresolvedTitle', 'conv.gateUnresolvedBody'],
  ] as const)('uses preserved raw-key copy for an %s mapping', (state, titleKey, bodyKey) => {
    expect(conversationPersonaNotice({
      personalityMappingState: state,
      rawPersonalityId: 'custom:legacy',
    })).toEqual({
      titleKey,
      bodyKey,
      params: { persona: 'custom:legacy' },
    });
  });

  it('shows no persona warning for an active mapping', () => {
    expect(conversationPersonaNotice({
      personalityMappingState: 'active',
      rawPersonalityId: 'builtin:lora',
    })).toBeNull();
  });
});
