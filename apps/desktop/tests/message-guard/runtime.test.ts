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

  it('keeps guard-audit rows for ~10 years — the 90 d TTL is retired (Stage 4)', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const auditEvent = (id: string, daysAgo: number) => ({
      id,
      occurredAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
      actorUserId: null,
      actorLabel: null,
      accountId: 'acct_1',
      chatId: '101',
      surface: 'engine:sendParts',
      transport: 'hub' as const,
      decision: 'blocked' as const,
      policyVersion: 'test',
      category: 'off_platform' as const,
      ruleId: 'builtin-structural-domain',
      ruleLabel: 'Off-platform domain',
      matchedOriginal: 'example.com',
      matchedNormalized: 'examplecom',
      spanStart: 5,
      spanEnd: 16,
      messageText: 'send example.com here',
      messageHash: 'abc123',
      mediaCount: 0,
      price: 0,
    });
    // 100 d would have died under the legacy 90 d TTL; 4000 d is past even
    // the raised 3650 d horizon.
    data.messageGuardEvents.insert(auditEvent('legacy-ttl-victim', 100));
    data.messageGuardEvents.insert(auditEvent('past-horizon', 4000));

    const guard = createMessageGuardRuntime({ data });
    expect(guard.pruneExpired()).toBe(1);
    expect(data.messageGuardEvents.count()).toBe(1);
    expect(data.messageGuardEvents.report().recent[0]?.id).toBe('legacy-ttl-victim');
  });
});
