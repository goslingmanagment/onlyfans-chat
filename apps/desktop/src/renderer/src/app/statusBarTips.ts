// Status-bar Russian hover tooltips — the first localized layer (owner
// 2026-06-11); the rest of the UI stays English. The six texts below are
// BYTE-FOR-BYTE from the binding mockup's tiplist table
// (docs/mockups/experiments/activity-panel.html) — do not edit without owner
// sign-off. DEGRADED / OFFLINE / HUB AUTH cover states the mockup strip does
// not show (added in the same style).

import type { SyncStatusVM } from '../../../preload/contract';

export const STATUS_BAR_TIPS = {
  polling:
    'Режим опроса: приложение само спрашивает OFAPI каждые 20 секунд. Хаб недоступен — новые сообщения приходят с задержкой до 20–60 секунд.',
  hubLive:
    'События приходят от хаба за секунды (сообщения, типинг, покупки). Опрос замедлен до страховочного.',
  credits:
    'Кредиты OFAPI, потраченные сегодня с этой машины, и остаток на ключе команды. Клик — разбивка: опросы, догрузки, медиа, Scan.',
  aiToday: 'Стоимость всех ИИ-операций за сегодня на этой машине. Клик — разбивка по фичам.',
  sends:
    'Отправлено сегодня · не подтверждено. Неподтверждённые проверяются вручную — авто-повторов в приложении нет, чтобы фан не получил сообщение дважды.',
  updated: 'Сколько прошло с последней сверки списка чатов с OnlyFans.',
  lastPush:
    'Сколько прошло с последнего события, принятого от хаба. Сверка списка чатов показывается рядом отдельным счётчиком.',
  degraded:
    'Опрос OFAPI сбоит — последние запросы завершились ошибкой, приложение продолжает повторять. Данные могут отставать.',
  offline:
    'Нет связи с OFAPI — данные не обновляются. Проверьте интернет и ключ OFAPI в настройках.',
  hubAuth:
    'Хаб отклонил ключ чаттера — живые события не приходят. Проверьте ключ в настройках Agency Hub.',
} as const;

export interface StatusBarMode {
  /** The bar's mode word — matches the Activity panel badge (mockup). */
  word: 'POLLING' | 'HUB LIVE' | 'DEGRADED' | 'OFFLINE';
  tone: 'ok' | 'warn' | 'bad';
  tip: string;
}

/** Sync state outranks the hub badge: a degraded poller is the louder fact. */
export function statusBarMode(
  state: SyncStatusVM['state'],
  hub: SyncStatusVM['hub'],
): StatusBarMode {
  if (state === 'offline') {
    return { word: 'OFFLINE', tone: 'bad', tip: STATUS_BAR_TIPS.offline };
  }
  if (state === 'degraded') {
    return { word: 'DEGRADED', tone: 'warn', tip: STATUS_BAR_TIPS.degraded };
  }
  return hub === 'live'
    ? { word: 'HUB LIVE', tone: 'ok', tip: STATUS_BAR_TIPS.hubLive }
    : { word: 'POLLING', tone: 'ok', tip: STATUS_BAR_TIPS.polling };
}
