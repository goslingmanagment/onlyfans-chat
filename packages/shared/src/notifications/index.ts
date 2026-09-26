import { uiMessage, type UiLocale } from '../i18n/index';
import type { SyncEvent } from '../protocol/index';
import { htmlToPlainText } from '../transcript/index';

/** Attention gate consumer side: absent flag = live (polling events never
 * stamp it); only an explicit false suppresses toast/sound/OS-notif. */
export function isAlertEligible(event: { live?: boolean | undefined }): boolean {
  return event.live !== false;
}

/** Main's complete OS-notification decision, extracted so the Electron
 * composition root stays a thin caller and the gate is unit-testable. */
export function shouldShowOsNotification(input: {
  event: SyncEvent;
  windowBackgrounded: boolean;
  notificationsEnabled: boolean;
  notificationsSupported: boolean;
}): boolean {
  return input.event.type === 'messageReceived'
    && isAlertEligible(input.event)
    && input.windowBackgrounded
    && input.notificationsEnabled
    && input.notificationsSupported;
}

/**
 * Notification title for an incoming message (D38): the cached chat's fan
 * name, else the name the event carries for a chat not listed yet, else
 * «Новый чат» for a first message from someone the app does not know yet,
 * else the generic title. Never awaits a read — the notification is kept.
 */
export function messageNotificationTitle(
  locale: UiLocale,
  event: Extract<SyncEvent, { type: 'messageReceived' }>,
  chatFanName: string | null | undefined,
  surface: 'toast' | 'os',
): string {
  if (chatFanName !== null && chatFanName !== undefined && chatFanName !== '') {
    return chatFanName;
  }
  if (event.fanName !== undefined) {
    return event.fanName;
  }
  if (event.newChat === true) {
    return uiMessage(locale, 'notif.newChat');
  }
  return uiMessage(locale, surface === 'toast' ? 'toast.newMessage' : 'notif.newMessage');
}

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
