import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_MESSAGE_GUARD_POLICY,
  MESSAGE_GUARD_DISABLED_POLICY_VERSION,
  type GuardRule,
} from '@chatgoose/shared/message-guard/index';
import { createMessageGuardRuntime } from '@main/message-guard/runtime';
import type { DataLayer } from '@main/db/index';
import { memoryDataLayer } from '../db/helpers';

describe('MessageGuardRuntime enforcement switch', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  afterEach(() => {
    data.close();
  });

  it('returns and enforces the disabled policy even when a blocking saved policy exists', () => {
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
    data.settings.set('messageGuardPolicy', {
      ...BUILTIN_MESSAGE_GUARD_POLICY,
      version: 'saved-active-policy',
      rules: [...BUILTIN_MESSAGE_GUARD_POLICY.rules, red],
    });

    const guard = createMessageGuardRuntime({ data });

    expect(guard.getPolicy().version).toBe(MESSAGE_GUARD_DISABLED_POLICY_VERSION);
    expect(guard.scan('telegram @name paypal me').decision).toBe('allow');
    expect(() =>
      guard.assertAllowed({
        accountId: 'acct_1',
        chatId: '101',
        text: 'telegram @name paypal me',
        surface: 'test',
        transport: 'hub',
      }),
    ).not.toThrow();
    expect(data.messageGuardEvents.count()).toBe(0);
  });
});
