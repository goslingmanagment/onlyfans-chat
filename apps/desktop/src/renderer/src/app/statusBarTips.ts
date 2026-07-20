// Status-bar Russian hover tooltips — the first localized layer (owner
// 2026-06-11); the rest of the UI stays English. The six texts below are
// BYTE-FOR-BYTE from the binding mockup's tiplist table
// (docs/mockups/experiments/activity-panel.html) — do not edit without owner
// sign-off. DEGRADED / OFFLINE / HUB AUTH cover states the mockup strip does
// not show (added in the same style).

import type { SyncStatusVM } from '../../../preload/contract';

export const STATUS_BAR_TIPS = {
  polling:
    'Резервный режим: приложение читает OFAPI через Agency Hub каждые 20 секунд, пока live-поток Hub недоступен. Новые данные могут приходить с задержкой 20–60 секунд.',
  hubLive:
    'Поток событий от Agency Hub подключён: сообщения, типинг и покупки приходят за секунды. Это не проверка чтения OFAPI — списки чатов, история и баланс могут быть временно недоступны отдельно.',
  credits:
    'Кредиты OFAPI, учтённые сегодня для запросов этого устройства через Agency Hub, и последний полученный баланс. «БАЛАНС —» означает, что после запуска ещё не было ответа OFAPI с балансом. Клик — разбивка: опросы, догрузки, медиа, Scan.',
  aiToday: 'Стоимость всех ИИ-операций за сегодня на этой машине. Клик — разбивка по фичам.',
  sends:
    'Отправлено сегодня · не подтверждено. Неподтверждённые проверяются вручную — авто-повторов в приложении нет, чтобы фан не получил сообщение дважды.',
  updated: 'Сколько прошло с последней сверки списка чатов с OnlyFans.',
  lastPush:
    'Сколько прошло с последнего события, принятого от хаба. Сверка списка чатов показывается рядом отдельным счётчиком.',
  degraded:
    'Резервные запросы через Agency Hub завершаются ошибкой; приложение продолжает повторять. Списки чатов и история могут отставать, даже если live-поток позже восстановится.',
  offline:
    'Нет успешных запросов данных через Agency Hub — списки чатов и история не обновляются. Проверьте интернет; если ошибка не проходит, сообщите администратору. Ключ OFAPI хранится на Hub, на этой машине его нет.',
  hubAuth:
    'Хаб отклонил данные входа — живые события не приходят. Откройте настройки Agency Hub и войдите устройством заново.',
  hubCredential:
    'Сохранённые данные входа изолированы: приложение не может доказать, какому Hub они принадлежат. Откройте настройки Agency Hub и выполните вход устройства.',
  forcedPolling:
    'Отладочный режим: live-поток Hub отключён вручную, приложение использует резервные запросы через Agency Hub. autoReadChats не меняется.',
  forcedHub:
    'Отладочный режим: polling-fallback удерживается выключенным, пока проверяется hub. autoReadChats и ручное открытие чата не меняются.',
} as const;

export interface StatusBarMode {
  /** The bar's mode word — matches the Activity panel badge (mockup). */
  word: 'POLLING' | 'HUB LIVE' | 'DEGRADED' | 'OFFLINE';
  tone: 'ok' | 'warn' | 'bad';
  tip: string;
}

/** Live hub SSE is the primary signal; polling failures are secondary there. */
export function statusBarMode(
  state: SyncStatusVM['state'],
  hub: SyncStatusVM['hub'],
  override: SyncStatusVM['hubModeOverride'] = 'auto',
): StatusBarMode {
  if (hub === 'live') {
    return { word: 'HUB LIVE', tone: 'ok', tip: STATUS_BAR_TIPS.hubLive };
  }
  if (state === 'offline') {
    return { word: 'OFFLINE', tone: 'bad', tip: STATUS_BAR_TIPS.offline };
  }
  if (override === 'hub') {
    return { word: 'DEGRADED', tone: 'warn', tip: STATUS_BAR_TIPS.forcedHub };
  }
  if (state === 'degraded') {
    return { word: 'DEGRADED', tone: 'warn', tip: STATUS_BAR_TIPS.degraded };
  }
  return { word: 'POLLING', tone: 'ok', tip: STATUS_BAR_TIPS.polling };
}
