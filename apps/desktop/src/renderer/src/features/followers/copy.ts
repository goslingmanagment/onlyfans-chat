import { useLocale } from '../../lib/i18n';
import type { FollowerStatus } from '../../../../preload/followers-contract';

const ru = {
  pauseHint: 'Поставьте проверку на паузу или дождитесь её завершения.',
  title: 'Новые подписчики',
  back: '← В чаты',
  start: 'Проверить',
  restart: 'Новая проверка',
  pause: 'Пауза',
  resume: 'Продолжить',
  hours: 'Период',
  hour: 'ч',
  all: 'Все',
  search: 'Имя или ID фана',
  loading: 'Загрузка…',
  select: 'Выберите подписчика',
  empty: 'Подписчиков с таким фильтром нет',
  idle: 'Выберите период и запустите проверку.',
  acknowledge:
    'Разрешаю прочитать чаты. OnlyFans пометит сообщения прочитанными; запросы расходуют кредиты.',
  cost: 'Расход зависит от числа подписчиков и глубины истории: несколько запросов на фана. Открытие уже загруженного чата бесплатно.',
  checked: 'Обработано',
  requests: 'Запросы',
  range: 'Границы проверки',
  unknownDate: 'Дата неизвестна',
  truncated:
    'Результат неполный: достигнут предел загрузки. Отсутствие контакта не подтверждено для непроверенных фанов.',
  cooldown: 'Пауза после ограничения API до',
  retry: 'Проверить снова',
  older: 'Загрузить раньше · запрос API',
  noMessages: 'В загруженной истории сообщений нет.',
  cached: 'Загруженная история · без дополнительных запросов',
  draft: 'Личное приветствие',
  generate: 'Сгенерировать',
  generating: 'Генерация…',
  send: 'Отправить',
  sending: 'Проверка и отправка…',
  placeholder: 'Напишите или сгенерируйте приветствие…',
  saving: 'Сохранение…',
  saved: 'Черновик сохранён',
  changed:
    'Проверка изменилась после подготовки черновика. Прочитайте обновлённую историю и подтвердите черновик.',
  reviewed: 'Историю посмотрел, черновик актуален',
  sent: 'Отправлено',
  checkedAt: 'Проверка',
  subscribed: 'Подписался',
  trace: 'Журнал',
  close: 'Закрыть',
  export: 'Сохранить журнал',
  exported: 'Журнал сохранён',
  run: 'Запуск',
  latest: 'Последний',
  fan: 'ID фана',
  traceSearch: 'Событие или детали',
  noEvents: 'Событий нет',
  dropped: 'Событий не сохранено',
  previous: '← Назад',
  next: 'Дальше →',
  page: 'Страница',
  error: 'Ошибка',
  readyHint:
    'Отправка повторно проверит историю. AI ничего не отправляет автоматически.',
};
type Copy = { [K in keyof typeof ru]: string };
const en: Copy = {
  pauseHint: 'Pause the check or wait until it finishes.',
  title: 'New subscribers',
  back: '← Chats',
  start: 'Check',
  restart: 'New check',
  pause: 'Pause',
  resume: 'Resume',
  hours: 'Period',
  hour: 'h',
  all: 'All',
  search: 'Fan name or ID',
  loading: 'Loading…',
  select: 'Select a subscriber',
  empty: 'No subscribers match this filter',
  idle: 'Choose a period and start a check.',
  acknowledge:
    'Allow reading chats. OnlyFans will mark messages as read; requests spend credits.',
  cost: 'Cost depends on subscribers and history depth: several requests per fan. Viewing cached history costs no credits.',
  checked: 'Processed',
  requests: 'Requests',
  range: 'Check boundaries',
  unknownDate: 'Unknown date',
  truncated:
    'Incomplete result: the loading limit was reached. Unchecked fans are not confirmed as uncontacted.',
  cooldown: 'API cooldown until',
  retry: 'Check again',
  older: 'Load earlier · API request',
  noMessages: 'No messages in the loaded history.',
  cached: 'Cached history · no additional requests',
  draft: 'Personal greeting',
  generate: 'Generate',
  generating: 'Generating…',
  send: 'Send',
  sending: 'Checking and sending…',
  placeholder: 'Write or generate a greeting…',
  saving: 'Saving…',
  saved: 'Draft saved',
  changed:
    'The check changed after this draft was prepared. Review the updated history and confirm your draft.',
  reviewed: 'History reviewed, draft is current',
  sent: 'Sent',
  checkedAt: 'Checked',
  subscribed: 'Subscribed',
  trace: 'Trace',
  close: 'Close',
  export: 'Save trace',
  exported: 'Trace saved',
  run: 'Run',
  latest: 'Latest',
  fan: 'Fan ID',
  traceSearch: 'Event or details',
  noEvents: 'No events',
  dropped: 'Events not retained',
  previous: '← Previous',
  next: 'Next →',
  page: 'Page',
  error: 'Error',
  readyHint: 'Sending rechecks the history. AI never sends automatically.',
};
const statuses: Record<'ru' | 'en', Record<FollowerStatus, string>> = {
  ru: {
    pending: 'В очереди',
    checking: 'Проверяем',
    ready: 'Не писали',
    replied: 'Фан ответил',
    contacted: 'Уже писали',
    unknown: 'Не удалось проверить',
    blocked: 'Отправка недоступна',
    sending: 'Отправляем',
    sent: 'Отправлено',
  },
  en: {
    pending: 'Queued',
    checking: 'Checking',
    ready: 'Not contacted',
    replied: 'Fan replied',
    contacted: 'Already contacted',
    unknown: 'Not verified',
    blocked: 'Cannot send',
    sending: 'Sending',
    sent: 'Sent',
  },
};
export function useFollowersCopy(): {
  c: Copy;
  status: Record<FollowerStatus, string>;
  locale: string;
} {
  const locale = useLocale();
  return {
    c: locale === 'ru' ? ru : en,
    status: statuses[locale],
    locale: locale === 'ru' ? 'ru-RU' : 'en-US',
  };
}
export function formatFollowerTime(
  value: string | null,
  locale: string,
): string {
  if (value === null || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
