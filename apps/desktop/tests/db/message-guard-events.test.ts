import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GuardAuditEvent } from '@chatgoose/shared/message-guard/index';
import type { DataLayer } from '@main/db/index';
import { memoryDataLayer } from './helpers';

function event(overrides: Partial<GuardAuditEvent> = {}): GuardAuditEvent {
  return {
    id: overrides.id ?? 'evt_1',
    occurredAt: overrides.occurredAt ?? '2026-06-23T00:00:00.000Z',
    actorUserId: null,
    actorLabel: null,
    accountId: 'acct_1',
    chatId: '101',
    surface: 'engine:sendParts',
    transport: 'hub',
    decision: 'blocked',
    policyVersion: 'test',
    category: 'off_platform',
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
    ...overrides,
  };
}

describe('message_guard_events queries', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  afterEach(() => {
    data.close();
  });

  it('stores full audit text but reports only sanitized metadata', () => {
    data.messageGuardEvents.insert(event());

    expect(data.messageGuardEvents.count()).toBe(1);
    const report = data.messageGuardEvents.report();
    expect(report.total).toBe(1);
    expect(report.byDecision).toEqual({ blocked: 1 });
    expect(report.byCategory).toEqual({ off_platform: 1 });
    expect(report.recent[0]).toMatchObject({
      messageHash: 'abc123',
      ruleId: 'builtin-structural-domain',
      accountId: 'acct_1',
      chatId: '101',
    });
    expect(JSON.stringify(report)).not.toContain('send example.com here');
    expect(JSON.stringify(report)).not.toContain('matchedOriginal');
  });

  it('prunes rows older than the supplied 90-day cutoff', () => {
    data.messageGuardEvents.insert(event({ id: 'old', occurredAt: '2026-01-01T00:00:00.000Z' }));
    data.messageGuardEvents.insert(event({ id: 'new', occurredAt: '2026-06-23T00:00:00.000Z' }));

    expect(data.messageGuardEvents.pruneOlderThan('2026-03-25T00:00:00.000Z')).toBe(1);
    const report = data.messageGuardEvents.report();
    expect(report.total).toBe(1);
    expect(report.recent[0]?.id).toBe('new');
  });
});
