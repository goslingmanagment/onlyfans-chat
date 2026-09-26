import { describe, expect, it } from 'vitest';
import type { SyncEvent } from '../src/protocol/index';
import {
  formatPurchaseAmount,
  isAlertEligible,
  isPurchaseAlert,
  messageNotificationTitle,
  purchaseNotification,
  shouldShowOsNotification,
} from '../src/notifications/index';
import { parseSyncEvent } from '../src/protocol/index';

describe('isAlertEligible', () => {
  it('treats only an explicit false flag as suppressed', () => {
    expect(isAlertEligible({})).toBe(true);
    expect(isAlertEligible({ live: true })).toBe(true);
    expect(isAlertEligible({ live: false })).toBe(false);
  });

  it('D39: a tip message never alerts — its quiet toast comes from tip.received', () => {
    expect(isAlertEligible({ message: { isTip: true } })).toBe(false);
    expect(isAlertEligible({ live: true, message: { isTip: true } })).toBe(false);
    expect(isAlertEligible({ message: { isTip: false } })).toBe(true);
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

  it('D39: a tip message is not an OS notification either', () => {
    expect(shouldShowOsNotification({
      event: {
        ...received,
        message: {
          id: '9001',
          text: '',
          createdAt: '2026-09-26T14:00:00.000Z',
          isSentByMe: false,
          price: 0,
          isTip: true,
        },
      },
      ...allOn,
    })).toBe(false);
  });

  it('D39: a purchase notifies only on main\'s explicit yes', () => {
    const ppv: SyncEvent = { type: 'ppvUnlocked', accountId: 'acct_1', chatId: '101', messageId: '1' };
    const tip: SyncEvent = { type: 'tipReceived', accountId: 'acct_1', chatId: '101', amountUsd: 5 };
    expect(shouldShowOsNotification({ event: { ...ppv, live: true }, ...allOn })).toBe(true);
    expect(shouldShowOsNotification({ event: { ...tip, live: true }, ...allOn })).toBe(true);
    // Absent = state only (the opposite of messageReceived's convention):
    // polling's tipReceived and every replayed/caught-up fact stay silent.
    expect(shouldShowOsNotification({ event: ppv, ...allOn })).toBe(false);
    expect(shouldShowOsNotification({ event: tip, ...allOn })).toBe(false);
    expect(shouldShowOsNotification({ event: { ...tip, live: false }, ...allOn })).toBe(false);
    expect(shouldShowOsNotification({
      event: { ...ppv, live: true }, ...allOn, windowBackgrounded: false,
    })).toBe(false);
    expect(isPurchaseAlert({ type: 'ppvUnlocked', accountId: 'a', chatId: 'c', live: true })).toBe(true);
    expect(shouldShowOsNotification({
      event: {
        type: 'transactionPosted',
        accountId: 'acct_1',
        fanId: '101',
        transactionId: 't1',
        amountUsd: 5,
        createdAt: '2026-09-26T14:00:00.000Z',
      },
      ...allOn,
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

describe('purchaseNotification (D39 quiet purchase alerts)', () => {
  const ppv = { type: 'ppvUnlocked' as const, accountId: 'acct_1', chatId: '101', messageId: '1' };
  const tip = { type: 'tipReceived' as const, accountId: 'acct_1', chatId: '101' };

  it('uses the owner-approved wording: «<фан> купил(а) PPV $89», «<фан> отправил(а) чаевые $5»', () => {
    expect(purchaseNotification('ru', { ...ppv, fanName: 'Neil/US', amountUsd: 89 }))
      .toEqual({ title: 'Neil/US', body: 'купил(а) PPV $89' });
    expect(purchaseNotification('ru', { ...tip, fanName: 'Neil/US', amountUsd: 5 }))
      .toEqual({ title: 'Neil/US', body: 'отправил(а) чаевые $5' });
    expect(purchaseNotification('en', { ...ppv, fanName: 'Neil/US', amountUsd: 89 }))
      .toEqual({ title: 'Neil/US', body: 'bought PPV $89' });
    expect(purchaseNotification('en', { ...tip, fanName: 'Neil/US', amountUsd: 5 }))
      .toEqual({ title: 'Neil/US', body: 'sent a tip $5' });
  });

  it('falls back to the renderer\'s chat name, then to neutral wording', () => {
    expect(purchaseNotification('ru', { ...ppv, amountUsd: 89 }, 'Kev (list)'))
      .toEqual({ title: 'Kev (list)', body: 'купил(а) PPV $89' });
    expect(purchaseNotification('ru', { ...ppv, amountUsd: 89 }, '  '))
      .toEqual({ title: 'Покупка PPV', body: 'Фан купил(а) PPV $89' });
    expect(purchaseNotification('ru', { ...tip, amountUsd: 5 }))
      .toEqual({ title: 'Чаевые', body: 'Фан отправил(а) чаевые $5' });
    expect(purchaseNotification('en', { ...tip, amountUsd: 5 }))
      .toEqual({ title: 'Tip', body: 'A fan sent a tip $5' });
  });

  it('never invents a price: an unknown amount is left out', () => {
    expect(purchaseNotification('ru', { ...ppv, fanName: 'Neil' }))
      .toEqual({ title: 'Neil', body: 'купил(а) PPV' });
    expect(purchaseNotification('ru', tip))
      .toEqual({ title: 'Чаевые', body: 'Фан отправил(а) чаевые' });
  });

  it('formats dollars (never mills): whole dollars bare, cents when present', () => {
    expect(formatPurchaseAmount(89)).toBe('$89');
    expect(formatPurchaseAmount(13.99)).toBe('$13.99');
    expect(formatPurchaseAmount(67.0)).toBe('$67');
    expect(formatPurchaseAmount(1284)).toBe('$1,284');
    expect(formatPurchaseAmount(0.5)).toBe('$0.50');
    expect(formatPurchaseAmount(undefined)).toBe('');
    expect(formatPurchaseAmount(Number.NaN)).toBe('');
    expect(formatPurchaseAmount(-5)).toBe('');
  });

  it('the alert fields survive the main → renderer wire schema', () => {
    expect(parseSyncEvent({ ...ppv, amountUsd: 89, fanName: 'Neil', live: true }))
      .toEqual({ ...ppv, amountUsd: 89, fanName: 'Neil', live: true });
    expect(parseSyncEvent({ ...tip, amountUsd: 5, fanName: 'Neil', live: false }))
      .toEqual({ ...tip, amountUsd: 5, fanName: 'Neil', live: false });
  });
});
