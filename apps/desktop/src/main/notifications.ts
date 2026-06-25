import { uiMessage, type UiLocale } from '@chatgoose/shared/i18n/index';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import { htmlToPlainText } from '@chatgoose/shared/transcript/index';

export function messageNotificationBody(
  locale: UiLocale,
  event: Extract<SyncEvent, { type: 'messageReceived' }>,
): string {
  const message = event.message;
  if (message === undefined) {
    return uiMessage(locale, 'notif.sentYou');
  }
  if (message.isTip === true) {
    return uiMessage(locale, 'notif.tip');
  }
  const text = htmlToPlainText(message.text);
  if (text !== '') {
    return text;
  }
  if ((message.mediaCount ?? message.media?.length ?? 0) > 0) {
    return uiMessage(locale, 'notif.media');
  }
  return uiMessage(locale, 'notif.sentYou');
}
