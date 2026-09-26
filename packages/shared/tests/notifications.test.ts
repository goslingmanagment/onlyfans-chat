import { describe, expect, it } from 'vitest';
import type { SyncEvent } from '../src/protocol/index';
import {
  isAlertEligible,
  messageNotificationTitle,
  shouldShowOsNotification,
} from '../src/notifications/index';
import { parseSyncEvent } from '../src/protocol/index';

describe('isAlertEligible', () => {
  it('treats only an explicit false flag as suppressed', () => {
    expect(isAlertEligible({})).toBe(true);
    expect(isAlertEligible({ live: true })).toBe(true);
    expect(isAlertEligible({ live: false })).toBe(false);
  });
});

describe('shouldShowOsNotification', () => {
  const received: SyncEvent = {
    type: 'messageReceived',
    accountId: 'acct_1',
    chatId: '101',
    messageId: '9001',
  };
  const allOn = {
    windowBackgrounded: true,
    notificationsEnabled: true,
    notificationsSupported: true,
  };

  it('notifies for a live messageReceived when backgrounded, enabled, supported', () => {
    expect(shouldShowOsNotification({ event: received, ...allOn })).toBe(true);
  });

  it('never notifies for a replayed live:false frame', () => {
    expect(
      shouldShowOsNotification({ event: { ...received, live: false }, ...allOn }),
    ).toBe(false);
  });

  it('requires every environment flag', () => {
    expect(shouldShowOsNotification({
      event: received, ...allOn, windowBackgrounded: false,
    })).toBe(false);
    expect(shouldShowOsNotification({
      event: received, ...allOn, notificationsEnabled: false,
    })).toBe(false);
    expect(shouldShowOsNotification({
      event: received, ...allOn, notificationsSupported: false,
    })).toBe(false);
  });

  it('ignores non-message events', () => {
    expect(shouldShowOsNotification({
      event: { type: 'chatListUpdated', accountId: 'acct_1' },
      ...allOn,
    })).toBe(false);
  });
});

describe('messageNotificationTitle (D38: first message of a chat not listed yet)', () => {
  const base = {
    type: 'messageReceived' as const,
    accountId: 'acct_1',
    chatId: '101',
    messageId: '9001',
  };

  it('prefers the cached chat, then the event name, then «new chat», then the generic title', () => {
    expect(messageNotificationTitle('ru', { ...base, fanName: 'Kevin' }, 'Kev (list)', 'os')).toBe('Kev (list)');
    expect(messageNotificationTitle('ru', { ...base, fanName: 'Kevin' }, undefined, 'os')).toBe('Kevin');
    expect(messageNotificationTitle('ru', { ...base, newChat: true }, null, 'os')).toBe('Новый чат');
    expect(messageNotificationTitle('en', { ...base, newChat: true }, null, 'toast')).toBe('New chat');
    expect(messageNotificationTitle('ru', base, undefined, 'toast')).toBe('Новое сообщение');
  });

  it('the hint survives the main → renderer wire schema', () => {
    expect(parseSyncEvent({ ...base, fanName: 'Kevin' })).toMatchObject({ fanName: 'Kevin' });
    expect(parseSyncEvent({ ...base, newChat: true })).toMatchObject({ newChat: true });
  });
});
