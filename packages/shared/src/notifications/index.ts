import { uiMessage, type UiLocale } from '../i18n/index';
import type { SyncEvent } from '../protocol/index';
import { htmlToPlainText } from '../transcript/index';

/** Canonical incoming-message copy shared by native and renderer notices. */
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
