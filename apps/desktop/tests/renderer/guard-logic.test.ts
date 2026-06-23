import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MESSAGE_GUARD_POLICY,
  type GuardRule,
} from '@chatgoose/shared/message-guard/index';
import {
  scanDraftForDisplay,
  scanDraftPartsForSend,
  scanTextForSend,
  setCurrentGuardPolicy,
  verdictToSegments,
} from '../../src/renderer/src/features/conversation/guardLogic';

describe('renderer message guard logic', () => {
  it('fails closed when no policy is compiled', () => {
    setCurrentGuardPolicy(null);
    expect(scanDraftPartsForSend('hello')).toBe('unavailable');
    expect(scanTextForSend('caption')).toBe('unavailable');
  });

  it('blocks draft parts synchronously for send attempts', () => {
    setCurrentGuardPolicy(BUILTIN_MESSAGE_GUARD_POLICY);
    expect(scanDraftPartsForSend('hello')).toBe('allow');
    expect(scanDraftPartsForSend('hello[NEXT]paypal me')).toBe('block');
    expect(scanTextForSend('c a $ h a p p')).toBe('block');
  });

  it('maps highlighted spans back to the original draft', () => {
    const red: GuardRule = {
      id: 'test-red',
      category: 'red',
      action: 'block',
      label: 'Red test',
      reasonKey: 'guard.reason.red',
      kind: 'term',
      value: 'telegram',
      enabled: true,
    };
    const guard = setCurrentGuardPolicy({
      ...BUILTIN_MESSAGE_GUARD_POLICY,
      version: 'renderer-test',
      rules: [...BUILTIN_MESSAGE_GUARD_POLICY.rules, red],
    });
    const draft = 'try t.e.l.e.g.r.a.m';
    const verdict = scanDraftForDisplay(guard, draft);
    const segments = verdictToSegments(draft, verdict);
    expect(verdict?.decision).toBe('block');
    expect(segments.find((segment) => segment.span !== null)?.text).toBe('t.e.l.e.g.r.a.m');
  });
});
