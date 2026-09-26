// D39 quiet purchase toast: the renderer half of the alert decision. Main
// already decided the purchase is news (`live: true`: a live-provenance v2
// stream fact after replay_completed, inside the age gate, new to this
// device); here the chatter's own context decides. No sound, ever.

import type { UiLocale } from '@chatgoose/shared/i18n/index';
import {
  isPurchaseAlert,
  purchaseNotification,
  type PurchaseEvent,
} from '@chatgoose/shared/notifications/index';

export interface PurchaseToastContext {
  selectedAccountId: string | null;
  selectedChatId: string | null;
  /** document.hasFocus(): the chat counts as open only in a focused window. */
  windowFocused: boolean;
  notificationsEnabled: boolean;
  locale: UiLocale;
  /** The chat list's cached name, when main's event carries none. */
  chatFanName: string | null | undefined;
}

export interface PurchaseToast {
  title: string;
  body: string;
  accountId: string;
  chatId: string;
}

export function purchaseToast(event: PurchaseEvent, context: PurchaseToastContext): PurchaseToast | null {
  if (!isPurchaseAlert(event) || !context.notificationsEnabled) {
    return null;
  }
  const chatOpenAndFocused =
    context.selectedAccountId === event.accountId &&
    context.selectedChatId === event.chatId &&
    context.windowFocused;
  if (chatOpenAndFocused) {
    return null;
  }
  const { title, body } = purchaseNotification(context.locale, event, context.chatFanName);
  // The toast click opens this chat (ToastHost → selectChat).
  return { title, body, accountId: event.accountId, chatId: event.chatId };
}
