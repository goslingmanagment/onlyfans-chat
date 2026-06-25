import { describe, expect, it } from 'vitest';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import { uiMessage } from '@chatgoose/shared/i18n/index';
import { messageNotificationBody } from '@main/notifications';

function received(
  message: Extract<SyncEvent, { type: 'messageReceived' }>['message'],
): Extract<SyncEvent, { type: 'messageReceived' }> {
  return {
    type: 'messageReceived',
    accountId: 'acct_1',
    chatId: '101',
    messageId: message?.id ?? 'm1',
    ...(message === undefined ? {} : { message }),
  };
}

function message(
  overrides: Partial<NonNullable<Extract<SyncEvent, { type: 'messageReceived' }>['message']>> = {},
): NonNullable<Extract<SyncEvent, { type: 'messageReceived' }>['message']> {
  return {
    id: 'm1',
    text: '<p>hello</p>',
    createdAt: '2026-06-25T12:00:00.000Z',
    isSentByMe: false,
    price: 0,
    ...overrides,
  };
}

describe('messageNotificationBody', () => {
  it('strips OF HTML before returning the native notification body', () => {
    expect(
      messageNotificationBody(
        'en',
        received(message({ text: '<p>I love it<br />second line</p>' })),
      ),
    ).toBe('I love it\nsecond line');
  });

  it('uses canonical copy for tip messages instead of platform text', () => {
    expect(
      messageNotificationBody('en', received(message({ text: '<p>Tip boilerplate</p>', isTip: true }))),
    ).toBe(uiMessage('en', 'notif.tip'));
  });

  it('uses canonical copy for media-only and id-only notifications', () => {
    expect(messageNotificationBody('en', received(message({ text: '', mediaCount: 1 })))).toBe(
      uiMessage('en', 'notif.media'),
    );
    expect(messageNotificationBody('en', received(undefined))).toBe(uiMessage('en', 'notif.sentYou'));
  });
});
