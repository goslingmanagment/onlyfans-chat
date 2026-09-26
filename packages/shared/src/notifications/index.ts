import { uiMessage, type UiLocale } from '../i18n/index';
import type { SyncEvent } from '../protocol/index';
import { htmlToPlainText } from '../transcript/index';

/** Attention gate consumer side: absent flag = live (polling events never
 * stamp it); only an explicit false suppresses toast/sound/OS-notif. D39: a
 * tip MESSAGE is never an alert — the tip's quiet alert comes from Core's
 * `tip.received` fact instead (owner decision: tip messages stop ringing). */
export function isAlertEligible(event: {
  live?: boolean | undefined;
  message?: { isTip?: boolean | undefined } | undefined;
}): boolean {
  return event.live !== false && event.message?.isTip !== true;
}

export type PurchaseEvent = Extract<SyncEvent, { type: 'ppvUnlocked' | 'tipReceived' }>;

/** D39: a purchase alerts only on main's explicit yes (`live: true`). */
export function isPurchaseAlert(event: PurchaseEvent): boolean {
  return event.live === true;
}

/** Main's complete OS-notification decision, extracted so the Electron
 * composition root stays a thin caller and the gate is unit-testable. */
export function shouldShowOsNotification(input: {
  event: SyncEvent;
  windowBackgrounded: boolean;
  notificationsEnabled: boolean;
  notificationsSupported: boolean;
}): boolean {
  const { event } = input;
  const eligible = event.type === 'messageReceived'
    ? isAlertEligible(event)
    : event.type === 'ppvUnlocked' || event.type === 'tipReceived'
      ? isPurchaseAlert(event)
      : false;
  return eligible
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

/**
 * A purchase amount as the app shows money: whole dollars without cents
 * ("$89"), otherwise two decimals ("$13.99"); thousands separated. OFAPI
 * amounts are dollars — never mills. Unknown or invalid → empty string.
 */
export function formatPurchaseAmount(amountUsd: number | undefined): string {
  if (amountUsd === undefined || !Number.isFinite(amountUsd) || amountUsd < 0) {
    return '';
  }
  const cents = Math.round(amountUsd * 100);
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/**
 * D39 quiet purchase alert copy, shared by the in-app toast and the OS
 * notification: «<фан>» / «купил(а) PPV $89» and «<фан>» / «отправил(а)
 * чаевые $5». The name comes from the event (main resolved it from Core's
 * thread label or the local chat/fan cache); `fallbackName` lets the renderer
 * add its chat-list cache. Without any name the wording is neutral.
 */
export function purchaseNotification(
  locale: UiLocale,
  event: PurchaseEvent,
  fallbackName?: string | null,
): { title: string; body: string } {
  const name = [event.fanName, fallbackName].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const amount = formatPurchaseAmount(event.amountUsd);
  const isPpv = event.type === 'ppvUnlocked';
  if (name !== undefined) {
    return {
      title: name,
      body: uiMessage(locale, isPpv ? 'notif.ppvBought' : 'notif.tipSent', { amount }).trim(),
    };
  }
  return {
    title: uiMessage(locale, isPpv ? 'notif.ppvTitle' : 'notif.tip'),
    body: uiMessage(locale, isPpv ? 'notif.ppvBoughtByFan' : 'notif.tipSentByFan', { amount }).trim(),
  };
}
