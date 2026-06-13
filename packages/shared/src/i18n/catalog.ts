// The UI message catalog — every entry carries both locales; a parity test enforces it.
// EN values are byte-identical to the strings the UI shipped with (the binding mockups
// are English), RU is the owner-requested interface language for chatters.
// Conventions: technical badge/status words (POLLING, HUB LIVE, LIVE, OFF, DIRECT, AUTH)
// and product feature names (Fast Reply, Scan, Ping…) stay English in both locales —
// they are status codes / hotkey-product names, already explained by the Russian
// status-bar tooltips. `{name}` placeholders are interpolated by uiMessage().

export const UI_MESSAGES = {
  // ── Common ────────────────────────────────────────────────────────────────
  'common.save': { en: 'Save', ru: 'Сохранить' },
  'common.cancel': { en: 'Cancel', ru: 'Отмена' },
  'common.delete': { en: 'Delete', ru: 'Удалить' },
  'common.configured': { en: 'configured', ru: 'настроен' },
  'common.notSet': { en: 'not set', ru: 'не задан' },
  'common.replaceKey': { en: 'Replace key…', ru: 'Заменить ключ…' },
  'common.pasteKey': { en: 'Paste key…', ru: 'Вставьте ключ…' },
  'common.savedFlash': { en: 'SAVED', ru: 'СОХРАНЕНО' },

  // ── Settings shell ────────────────────────────────────────────────────────
  'settings.title': { en: 'Settings', ru: 'Настройки' },
  'settings.back': { en: '← back to workspace', ru: '← назад к работе' },

  // ── API keys ──────────────────────────────────────────────────────────────
  'keys.title': { en: 'API keys', ru: 'API-ключи' },
  'keys.hint': {
    en: 'Stored in the OS keychain by the main process — set-only, never displayed.',
    ru: 'Хранятся в системной связке ключей — только запись, никогда не показываются.',
  },
  'keys.ofapi.label': { en: 'OFAPI key', ru: 'Ключ OFAPI' },
  'keys.ofapi.hint': { en: 'per-chatter scoped key', ru: 'личный ключ чаттера' },
  'keys.anthropic.label': { en: 'Anthropic key', ru: 'Ключ Anthropic' },
  'keys.anthropic.hint': { en: 'direct AI provider', ru: 'основной ИИ-провайдер' },
  'keys.openrouter.label': { en: 'OpenRouter key', ru: 'Ключ OpenRouter' },
  'keys.openrouter.hint': { en: 'alternate AI provider', ru: 'запасной ИИ-провайдер' },
  'keys.meta': { en: '…{last4} · added {date}', ru: '…{last4} · добавлен {date}' },
  'keys.test': { en: 'Test', ru: 'Проверить' },
  'keys.testing': { en: 'Testing…', ru: 'Проверяю…' },
  'keys.testOk': { en: 'Key works', ru: 'Ключ работает' },
  'keys.testOkTeam': { en: 'Key works — team {team}', ru: 'Ключ работает — команда {team}' },

  // Russian texts for CG-* codes a key/hub test can return. EN failures show
  // the wire message (registry wording incl. provider overrides) — these en
  // values exist for catalog parity/documentation only.
  'err.CG-OF-01': {
    en: 'OnlyFans API key is invalid.',
    ru: 'Ключ OFAPI отклонён (401) — проверьте ключ.',
  },
  'err.CG-OF-02': {
    en: 'OnlyFans account authentication failed.',
    ru: 'Сессия аккаунта OnlyFans слетела — сам ключ OFAPI рабочий.',
  },
  'err.CG-OF-03': {
    en: 'OnlyFans API rate limit reached.',
    ru: 'Лимит запросов OFAPI — попробуйте через минуту.',
  },
  'err.CG-OF-04': {
    en: 'OnlyFans API credits are exhausted.',
    ru: 'Кредиты OFAPI закончились — пополните баланс.',
  },
  'err.CG-AUTH-02': {
    en: 'Provider rejected the API key.',
    ru: 'Провайдер отклонил ключ (401).',
  },
  'err.CG-NET-01': {
    en: 'Network request failed.',
    ru: 'Сеть недоступна — запрос не прошёл.',
  },
  'err.CG-NET-02': {
    en: 'Request timed out.',
    ru: 'Запрос не уложился в таймаут.',
  },
  'err.CG-API-01': {
    en: 'Provider rate limit hit — try again shortly.',
    ru: 'Лимит запросов провайдера — попробуйте чуть позже.',
  },
  'err.CG-API-02': {
    en: 'Provider balance is insufficient.',
    ru: 'У провайдера закончился баланс — пополните счёт.',
  },
  'err.CG-API-05': {
    en: 'Provider service is unavailable.',
    ru: 'Сервис провайдера недоступен — попробуйте позже.',
  },
  'err.CG-APP-01': {
    en: 'Something went wrong.',
    ru: 'Что-то пошло не так — попробуйте ещё раз.',
  },
  'err.CG-HUB-01': {
    en: 'The hub rejected the chatter key.',
    ru: 'Хаб отклонил ключ чаттера.',
  },
  'err.CG-HUB-02': {
    en: 'The hub is unreachable.',
    ru: 'Хаб недоступен.',
  },

  // ── Agency Hub ────────────────────────────────────────────────────────────
  'hub.title': { en: 'Agency Hub', ru: 'Agency Hub' },
  'hub.hint': {
    en: 'Real-time message events stream from the hub when both fields are set; the app falls back to polling automatically when the stream drops.',
    ru: 'Когда заполнены оба поля, события приходят от хаба в реальном времени; при обрыве стрима приложение само возвращается к опросу.',
  },
  'hub.baseUrl.label': { en: 'Hub base URL', ru: 'Адрес хаба' },
  'hub.baseUrl.hint': { en: "your agency's core server", ru: 'core-сервер вашего агентства' },
  'hub.key.label': { en: 'Chatter API key', ru: 'API-ключ чаттера' },
  'hub.key.hint': { en: 'agency_hub_core_… — set-only', ru: 'agency_hub_core_… — только запись' },
  'hub.streamStatus': { en: 'Stream status', ru: 'Статус стрима' },
  'hub.status.connecting': { en: 'connecting…', ru: 'подключение…' },
  'hub.status.live': { en: 'live', ru: 'работает' },
  'hub.status.degraded': { en: 'degraded — polling covers', ru: 'сбой — опрос подстраховывает' },
  'hub.status.auth-failed': { en: 'auth failed', ru: 'ключ отклонён' },
  'hub.status.stopped': { en: 'stopped', ru: 'остановлен' },
  'hub.authFailedBody': {
    en: 'CG-HUB-01 — the hub rejected the chatter key. Chatter keys are one-active-per-chatter and revocable: paste a fresh key (hub Settings → Users) and save.',
    ru: 'CG-HUB-01 — хаб отклонил ключ чаттера. Ключ один на чаттера и может быть отозван: вставьте свежий ключ (хаб: Settings → Users) и сохраните.',
  },
  'hub.pageLabels.title': { en: 'Hub page labels', ru: 'Метки страниц хаба' },
  'hub.pageLabels.hint': {
    en: 'Each account auto-matches a hub page by its username. Set a label only when that match misses; leave empty for auto.',
    ru: 'Аккаунт сам подбирает страницу хаба по username. Заполняйте метку, только если автоподбор промахнулся; пусто — авто.',
  },
  'hub.pageLabels.placeholder': { en: 'auto (match by username)', ru: 'авто (по username)' },
  'hub.footerOk': {
    en: 'Hub connection configured — live events active when the stream is healthy.',
    ru: 'Хаб настроен — живые события идут, пока стрим работает.',
  },
  'hub.footerOff': {
    en: 'Not connected — the app runs on polling alone.',
    ru: 'Не подключено — приложение работает только на опросе.',
  },
  'hub.saveBtn': { en: 'Save hub settings', ru: 'Сохранить настройки хаба' },
  'hub.testBtn': { en: 'Test connection', ru: 'Проверить подключение' },
  'hub.testOk': {
    en: 'Connected — {username} ({role}) · pages: {pages}',
    ru: 'Подключено — {username} ({role}) · страниц: {pages}',
  },
  'hub.testNeedsConfig': {
    en: 'Set the hub base URL and chatter key first.',
    ru: 'Сначала заполните адрес хаба и ключ чаттера.',
  },

  // ── Models / context size ─────────────────────────────────────────────────
  'models.title': { en: 'Models', ru: 'Модели' },
  'models.hint': {
    en: 'Per-feature model and reasoning effort.',
    ru: 'Модель и глубина размышления для каждой фичи.',
  },
  'models.effortTitle': { en: 'Reasoning effort', ru: 'Глубина размышления' },
  'models.reset': { en: 'Reset to recommended', ru: 'Вернуть рекомендованные' },
  'models.costHint': { en: '7d: {runs} {word} · ≈ {avg}/run', ru: 'за 7 дн: {runs} {word} · ≈ {avg}/запуск' },
  'models.noRuns': { en: '7d: no runs', ru: 'за 7 дн: запусков не было' },
  'context.title': { en: 'Context size', ru: 'Размер контекста' },
  'context.hint': {
    en: 'How many recent messages each feature reads.',
    ru: 'Сколько последних сообщений читает каждая фича.',
  },
  'context.field.quick': { en: 'Quick features (Reply / Help)', ru: 'Быстрые фичи (Reply / Help)' },
  'context.field.ping': { en: 'Ping', ru: 'Ping' },
  'context.field.improve': { en: 'Improve draft', ru: 'Improve draft' },
  'context.field.deep': { en: 'Deep features (Scan / Review)', ru: 'Глубокие фичи (Scan / Review)' },
  'context.tokens': { en: '≈ {n} tokens/run', ru: '≈ {n} токенов/запуск' },

  // ── Personalities / mapping ───────────────────────────────────────────────
  'personalities.title': { en: 'Personalities', ru: 'Личности' },
  'personalities.hint': {
    en: "The model's voice — accounts must map to one before AI activates.",
    ru: 'Голос модели — пока аккаунт не привязан к личности, ИИ выключен.',
  },
  'personalities.builtIn': { en: 'built-in', ru: 'встроенная' },
  'personalities.new': { en: '+ New personality', ru: '+ Новая личность' },
  'personalities.empty': {
    en: 'Select a personality to edit, or create a new one.',
    ru: 'Выберите личность для правки или создайте новую.',
  },
  'personalities.namePh': { en: 'Name', ru: 'Имя' },
  'personalities.contentPh': {
    en: 'Personality content — who she is, how she talks…',
    ru: 'Описание личности — кто она и как говорит…',
  },
  'mapping.title': { en: 'Account mapping', ru: 'Привязка аккаунтов' },
  'mapping.hint': {
    en: 'Unmapped accounts show an AI gate banner in the conversation.',
    ru: 'Непривязанные аккаунты показывают баннер «ИИ выключен» в переписке.',
  },
  'mapping.unmapped': { en: '— unmapped (AI disabled) —', ru: '— не привязан (ИИ выключен) —' },
  'mapping.aiDisabled': { en: 'AI disabled', ru: 'ИИ выключен' },

  // ── Behavior ──────────────────────────────────────────────────────────────
  'behavior.title': { en: 'Behavior', ru: 'Поведение' },
  'behavior.notifications': { en: 'Notifications', ru: 'Уведомления' },
  'behavior.notificationsHint': { en: 'Toast on incoming messages', ru: 'Всплывашка при входящем сообщении' },
  'behavior.sound': { en: 'Sound', ru: 'Звук' },
  'behavior.soundHint': { en: 'Blip with each notification', ru: 'Сигнал при каждом уведомлении' },
  'behavior.markRead': { en: 'Mark as read on open', ru: 'Прочитано при открытии' },
  'behavior.markReadHint': {
    en: 'Marks the chat read on OnlyFans when you open it',
    ru: 'Отмечает чат прочитанным в OnlyFans при открытии',
  },
  'behavior.promptCaching': { en: 'Prompt caching', ru: 'Кэш промптов' },
  'behavior.promptCachingHint': {
    en: 'Reuse prompt prefixes to cut LLM cost',
    ru: 'Повторно использует начало промпта — запросы к ИИ дешевле',
  },
  'behavior.debug': { en: 'Debug mode', ru: 'Режим отладки' },
  'behavior.debugHint': {
    en: 'Raw payloads, prompt snapshots, profiling',
    ru: 'Сырые данные, снимки промптов, профилирование',
  },
  'behavior.advanced': { en: 'Advanced', ru: 'Дополнительно' },
  'behavior.language': { en: 'Language', ru: 'Язык' },
  'behavior.languageHint': { en: 'Interface language', ru: 'Язык интерфейса' },
  'behavior.language.system': { en: 'System', ru: 'Системный' },
  'behavior.uiScale': { en: 'UI scale', ru: 'Масштаб интерфейса' },
  'behavior.uiScaleHint': { en: 'Zoom for the whole window', ru: 'Масштаб всего окна' },
  'behavior.uiTheme': { en: 'Theme', ru: 'Тема' },
  'behavior.uiThemeHint': {
    en: 'System follows the OS color scheme',
    ru: '«Системная» повторяет настройку ОС',
  },
  'behavior.uiTheme.system': { en: 'System', ru: 'Системная' },
  'behavior.uiTheme.light': { en: 'Light', ru: 'Светлая' },
  'behavior.uiTheme.dark': { en: 'Dark', ru: 'Тёмная' },
  'behavior.spendStyle': { en: 'Fan spend style', ru: 'Вид суммы фана' },
  'behavior.spendStyleHint': {
    en: 'Lifetime figure beside the name in the chat list',
    ru: 'Сумма за всё время рядом с именем в списке чатов',
  },

  // ── Local data (danger zone) ──────────────────────────────────────────────
  'danger.title': { en: 'Local data', ru: 'Локальные данные' },
  'danger.hint': {
    en: 'Purges the encrypted local cache (chats, messages, media). Nothing is deleted upstream.',
    ru: 'Очищает зашифрованный локальный кэш (чаты, сообщения, медиа). На серверах ничего не удаляется.',
  },
  'danger.stats': {
    en: 'Database {db} · media cache {media} ({files})',
    ru: 'База {db} · медиа-кэш {media} ({files})',
  },
  'danger.purgeBtn': { en: 'Purge local data…', ru: 'Очистить локальные данные…' },
  'danger.confirmQuestion': {
    en: 'Purge all locally cached data? The next sync rebuilds it from OFAPI.',
    ru: 'Удалить весь локальный кэш? Следующая синхронизация заново соберёт его из OFAPI.',
  },
  'danger.typeToConfirm': { en: 'Type {word} to confirm', ru: 'Введите {word} для подтверждения' },
  'danger.yesPurge': { en: 'Yes, purge', ru: 'Да, очистить' },
  'danger.openFolder': { en: 'Open data folder', ru: 'Открыть папку данных' },
  'danger.exportDiagnostics': { en: 'Export diagnostics', ru: 'Выгрузить диагностику' },
  'danger.diagHint': {
    en: 'Versions, recent log, sync status — no secrets.',
    ru: 'Версии, последний лог, статус синка — без секретов.',
  },
  'danger.diagSend': {
    en: 'If something broke, export this file and send it to support.',
    ru: 'Если что-то сломалось — выгрузите этот файл и пришлите мне.',
  },
  'danger.exported': { en: 'Saved: {path}', ru: 'Сохранено: {path}' },
  'danger.copyPath': { en: 'Copy path', ru: 'Скопировать путь' },
  'danger.copied': { en: 'Copied', ru: 'Скопировано' },

  // ── Crash recovery (ErrorBoundary) ─────────────────────────────────────────
  'crash.title': { en: 'Something went wrong', ru: 'Что-то пошло не так' },
  'crash.body': {
    en: 'ChatGoose hit an unexpected error. Your local data is safe.',
    ru: 'ChatGoose столкнулся с неожиданной ошибкой. Локальные данные в сохранности.',
  },
  'crash.reload': { en: 'Reload', ru: 'Перезагрузить' },
  'crash.exportHint': {
    en: 'Export the diagnostics file and send it to support.',
    ru: 'Выгрузите файл диагностики и пришлите мне.',
  },

  // ── Activity panel ────────────────────────────────────────────────────────
  'activity.title': { en: 'Activity', ru: 'Активность' },
  'activity.subtitle': {
    en: 'Live data flow and today’s spend on this machine. Read-only.',
    ru: 'Поток данных и сегодняшние траты на этой машине. Только чтение.',
  },
  'activity.capDataflow': { en: 'Data flow · now', ru: 'Поток данных · сейчас' },
  'activity.rowMessages': { en: 'MESSAGES', ru: 'СООБЩЕНИЯ' },
  'activity.rowHub': { en: 'HUB (CORE)', ru: 'ХАБ (CORE)' },
  'activity.rowAi': { en: 'AI', ru: 'ИИ' },
  'activity.rowSends': { en: 'SENDS', ru: 'ОТПРАВКИ' },
  'activity.askingOfapi': { en: '— asking OFAPI directly', ru: '— опрашиваем OFAPI напрямую' },
  'activity.hubPushed': {
    en: '— pushed from core in seconds; polling relaxed to safety-net',
    ru: '— события приходят от core за секунды; опрос переведён в страховочный режим',
  },
  'activity.notPolledYet': { en: 'not polled yet', ru: 'ещё не опрашивался' },
  'activity.polledAgo': { en: 'polled {age} ago', ru: 'опрошен {age} назад' },
  'activity.everySec': { en: 'every {n} s', ru: 'каждые {n} с' },
  'activity.everyMin': { en: 'every {n} min', ru: 'каждые {n} мин' },
  'activity.deepSweep': { en: 'deep sweep {every}', ru: 'глубокий проход {every}' },
  'activity.lastEventAgo': { en: 'last event {age} ago', ru: 'последнее событие {age} назад' },
  'activity.eventsToday': { en: '{n} events today', ru: 'событий сегодня: {n}' },
  'activity.pollingSlowed': { en: 'polling slowed: {notes}', ru: 'опрос замедлен: {notes}' },
  'activity.hubConnectedFor': {
    en: '— connected {dur} · {n} dropped frames',
    ru: '— подключён {dur} · битых кадров: {n}',
  },
  'activity.hubNotConfigured': {
    en: '— not configured (Settings → Agency Hub)',
    ru: '— не настроен (Настройки → Agency Hub)',
  },
  'activity.hubKeyRejected': {
    en: '— chatter key rejected, check Settings → Agency Hub',
    ru: '— ключ чаттера отклонён, проверьте Настройки → Agency Hub',
  },
  'activity.hubUnreachableSince': {
    en: '— unreachable since {time}, reconnecting',
    ru: '— недоступен с {time}, переподключение',
  },
  'activity.hubReconnecting': { en: '— reconnecting', ru: '— переподключение' },
  'activity.usageQueueEmpty': { en: 'Usage queue empty', ru: 'Очередь отчётов пуста' },
  'activity.usageQueuePending': { en: 'Usage queue: {n} pending', ru: 'В очереди отчётов: {n}' },
  'activity.summariesSynced': {
    en: '{n} fan summaries synced today · profile prefetch on.',
    ru: 'саммари фанов за сегодня: {n} · предзагрузка профилей включена.',
  },
  'activity.quarantined': {
    en: '{n} usage events quarantined (rejected by core).',
    ru: 'Отчётов об ИИ в карантине: {n} (отклонены core).',
  },
  'activity.instantPaused': {
    en: 'Instant events (typing, online, PPV unlocked, tips) are paused — everything still arrives by polling, just up to 20–60 s late.',
    ru: 'Мгновенные события (печатает, онлайн, покупки PPV, чаевые) на паузе — всё по-прежнему приходит опросом, просто с задержкой 20–60 с.',
  },
  'activity.pendingUpload': {
    en: 'Pending upload for core: {list} — will flush on reconnect.',
    ru: 'Ждут отправки в core: {list} — улетят при подключении.',
  },
  'activity.aiDirect': {
    en: '— {provider} from this machine, key in keychain',
    ru: '— {provider} с этой машины, ключ в связке ключей',
  },
  'activity.aiDirectHubLive': {
    en: '— {provider} from this machine (central gateway = P6, deferred)',
    ru: '— {provider} с этой машины (центральный шлюз = P6, отложен)',
  },
  'activity.aiOff': {
    en: '— no LLM key yet (Settings → API keys)',
    ru: '— ключа ИИ ещё нет (Настройки → API-ключи)',
  },
  'activity.sendsLine': {
    en: '{sent} sent · {failed} failed · {unconfirmed} unconfirmed',
    ru: '{sent} отправлено · {failed} с ошибкой · {unconfirmed} не подтверждено',
  },
  'activity.sendsToday': { en: 'today', ru: 'сегодня' },
  'activity.auditBtn': { en: 'RUN OUTBOX AUDIT', ru: 'АУДИТ ОТПРАВОК' },
  'activity.auditing': { en: 'AUDITING…', ru: 'ПРОВЕРЯЮ…' },
  'activity.auditClean': {
    en: 'AUDIT — {n} clean sends · no anomalies',
    ru: 'АУДИТ — чистых отправок: {n} · аномалий нет',
  },
  'activity.auditAnomalies': {
    en: 'AUDIT — {n} clean sends · {a} anomalies',
    ru: 'АУДИТ — чистых отправок: {n} · аномалий: {a}',
  },
  'activity.outboxEmpty': { en: 'outbox empty', ru: 'исходящие пусты' },
  'activity.chat': { en: 'chat', ru: 'чат' },

  // Outbox state words (audit report totals).
  'outbox.state.queued': { en: 'queued', ru: 'в очереди' },
  'outbox.state.sending': { en: 'sending', ru: 'отправляется' },
  'outbox.state.sent': { en: 'sent', ru: 'отправлено' },
  'outbox.state.failed': { en: 'failed', ru: 'с ошибкой' },
  'outbox.state.unconfirmed': { en: 'unconfirmed', ru: 'не подтверждено' },
  'outbox.state.cancelled': { en: 'cancelled', ru: 'отменено' },
  'activity.doubleClaims': { en: 'double claims: ', ru: 'двойные подтверждения: ' },
  'activity.suspectDuplicates': { en: 'suspect duplicates: ', ru: 'подозрение на дубли: ' },
  'activity.staleUnconfirmed': { en: 'stale unconfirmed: ', ru: 'зависшие без подтверждения: ' },
  'activity.sentMissing': { en: 'sent but missing locally: ', ru: 'отправлено, но нет локально: ' },
  'activity.capCredits': { en: 'OFAPI credits · today', ru: 'Кредиты OFAPI · сегодня' },
  'activity.creditsEmpty': {
    en: 'No OFAPI traffic recorded yet today.',
    ru: 'Сегодня запросов к OFAPI ещё не было.',
  },
  'activity.colWhat': { en: 'what', ru: 'что' },
  'activity.colRequests': { en: 'requests', ru: 'запросы' },
  'activity.colCredits': { en: 'credits', ru: 'кредиты' },
  'activity.totalToday': { en: 'Total today', ru: 'Итого за сегодня' },
  'activity.balance': { en: 'Balance {n}', ru: 'Остаток {n}' },
  'activity.pace': { en: 'at this pace ≈ {n} days', ru: 'при таком темпе ≈ {n} дн.' },
  'activity.headroom': { en: 'rate limit headroom {n} req/min', ru: 'запас по лимиту {n} запр/мин' },
  'activity.capAiSpend': { en: 'AI spend · today', ru: 'Траты на ИИ · сегодня' },
  'activity.aiEmpty': { en: 'No AI runs yet today.', ru: 'Сегодня запусков ИИ ещё не было.' },
  'activity.colFeature': { en: 'feature', ru: 'фича' },
  'activity.colRuns': { en: 'runs', ru: 'запуски' },
  'activity.colInserted': { en: 'inserted', ru: 'вставлено' },
  'activity.colTokens': { en: 'tokens', ru: 'токены' },
  'activity.colCost': { en: 'cost', ru: 'цена' },
  'activity.cacheHits': { en: 'Cache hits {n}%', ru: 'Кэш-попадания {n}%' },
  'activity.topRun': {
    en: 'most expensive single run today {usd} ({what})',
    ru: 'самый дорогой запуск за сегодня {usd} ({what})',
  },
  'activity.sevenDayTotal': { en: '7-day total {usd}', ru: 'за 7 дней {usd}' },

  // OFAPI purpose labels (credits ledger rows).
  'purpose.hot-poll': { en: 'Hot polls (new-message detector)', ru: 'Горячие опросы (детектор новых сообщений)' },
  'purpose.deep-sweep': { en: 'Deep sweeps (older chats)', ru: 'Глубокие проходы (старые чаты)' },
  'purpose.hydration': {
    en: 'Hydration (chat-list backfill, fan details)',
    ru: 'Догрузка (список чатов, анкеты фанов)',
  },
  'purpose.message-tail': { en: 'Message fetches (changed chats)', ru: 'Загрузка сообщений (изменённые чаты)' },
  'purpose.media': { en: 'Media downloads', ru: 'Загрузка медиа' },
  'purpose.scan-deep-fetch': { en: 'Scan deep fetches', ru: 'Глубокая загрузка для Scan' },
  'purpose.send': { en: 'Sends & delivery checks', ru: 'Отправка и проверка доставки' },
  'purpose.vault': { en: 'Vault browsing & uploads', ru: 'Vault: просмотр и загрузка' },
  'purpose.spend-sweep': { en: 'Fan-spend sweeps', ru: 'Сбор трат фанов' },
  'purpose.spenders': { en: 'Spenders board (tier lists)', ru: 'Борд спендеров (тир-списки)' },
  'purpose.spenders-refresh': {
    en: 'Spenders refresh (thread backfill)',
    ru: 'Спендеры: обновление (подтяжка переписок)',
  },
  'purpose.untagged': {
    en: 'Untagged (recorded before this update)',
    ru: 'Без метки (записано до обновления)',
  },

  // ── Status bar segment labels (mode words stay English — test-pinned) ─────
  'sb.creditsToday': { en: 'CREDITS TODAY', ru: 'КРЕДИТЫ СЕГОДНЯ' },
  'sb.bal': { en: 'BAL', ru: 'БАЛАНС' },
  'sb.aiToday': { en: 'AI TODAY', ru: 'ИИ СЕГОДНЯ' },
  'sb.sends': { en: 'SENDS', ru: 'ОТПРАВКИ' },
  'sb.unconf': { en: 'UNCONF', ru: 'НЕ ПОДТВ.' },
  'sb.updated': { en: 'UPDATED', ru: 'ОБНОВЛЕНО' },
  'sb.ago': { en: 'AGO', ru: 'НАЗАД' },
  'sb.shortcuts': { en: 'SHORTCUTS', ru: 'КЛАВИШИ' },

  // ── Spenders board (PLAN item 12; RU pinned to mockups/supporters.html) ──
  'sp.title': { en: 'Spenders', ru: 'Спендеры' },
  'sp.sortNote': { en: 'WITHIN A SHELF — BY FAN SILENCE ↓', ru: 'ВНУТРИ ПОЛКИ — ПО МОЛЧАНИЮ ФАНА ↓' },
  'sp.backToChat': { en: '← BACK TO CHAT · ESC', ru: '← НАЗАД К ЧАТУ · ESC' },
  'sp.all': { en: 'All', ru: 'Все' },
  'sp.untiered': { en: 'No tier', ru: 'Без тира' },
  'sp.moreInTier': { en: '{n} more in {tier}', ru: 'ещё {n} в {tier}' },
  'sp.show': { en: 'show ▾', ru: 'показать ▾' },
  'sp.model': { en: 'MODEL', ru: 'МОДЕЛЬ' },
  'sp.fan': { en: 'FAN', ru: 'ФАН' },
  'sp.dayShort': { en: 'D', ru: 'Д' },
  'sp.today': { en: 'TODAY', ru: 'СЕГОДНЯ' },
  'sp.you': { en: 'you:', ru: 'you:' },
  'sp.footNav': { en: 'rows', ru: 'по списку' },
  'sp.footPreview': { en: 'preview', ru: 'превью' },
  'sp.footChat': { en: 'chat', ru: 'чат' },
  'sp.footReadOnly': { en: 'tiers — OM lists · read-only', ru: 'тиры — списки ОМ · только чтение' },
  'sp.syncingChat': { en: 'Syncing…', ru: 'Синхронизируем…' },
  'sp.openChatFailed': {
    en: 'Could not sync this chat yet — preview stays read-only.',
    ru: 'Не удалось синхронизировать чат — превью остаётся только для чтения.',
  },
  'sp.earlier': { en: '↑ earlier', ru: '↑ раньше' },
  'sp.noHistory': {
    en: 'No local history for this fan yet — O opens the full chat.',
    ru: 'Локальной истории пока нет — O откроет полный чат.',
  },
  'sp.noChatSend': {
    en: 'Chat not synced yet — sending unavailable from the preview.',
    ru: 'Чат не синхронизирован — отправка из превью недоступна.',
  },
  // canNotSendReason tokens, live-verified 2026-06-13 (research doc §expired)
  'sp.reason.unsubscribed': {
    en: 'Fan unsubscribed — OnlyFans blocks new messages to this chat.',
    ru: 'Фан отписался — OnlyFans не даёт писать в этот чат.',
  },
  'sp.reason.chat_unavailable': {
    en: 'Chat unavailable on OnlyFans.',
    ru: 'Чат недоступен на OnlyFans.',
  },
  'sp.inserted': { en: 'inserted into composer', ru: 'вставлен в композер' },
  'sp.anotherVariant': { en: '↻ another take', ru: '↻ другой вариант' },
  'sp.variant': { en: 'Variant {n}', ru: 'Вариант {n}' },
  'sp.segment': { en: 'segment {s}', ru: 'сегмент {s}' },
  'sp.openChat': { en: 'Open chat', ru: 'Открыть чат' },
  'sp.previewHint': { en: 'ESC CLOSE · J/K NEXT FAN', ru: 'ESC ЗАКРЫТЬ · J/K СЛЕД. ФАН' },
  'sp.truncated': {
    en: 'roster capped at 1000 — sorted tail not shown',
    ru: 'ростер обрезан на 1000 — хвост не показан',
  },
  'sp.notConfigured': {
    en: 'Map OnlyMonster tier lists to shelves in Settings to fill this board.',
    ru: 'Сопоставьте списки OnlyMonster полкам в настройках — борд наполнится.',
  },
  'sp.openSettings': { en: 'Open settings', ru: 'Открыть настройки' },
  'sp.loading': { en: 'LOADING…', ru: 'ЗАГРУЗКА…' },
  // ── Data freshness (PLAN item 13; RU pinned to mockups/experiments/spenders-freshness.html) ──
  'sp.refresh': { en: '↻ Refresh', ru: '↻ Обновить' },
  'sp.refreshing': { en: '⟳ Refreshing', ru: '⟳ Обновление' },
  'sp.stop': { en: 'STOP', ru: 'СТОП' },
  'sp.creditsShort': { en: 'CR', ru: 'КР' },
  'sp.lastUpdate': { en: 'LAST UPDATE — {when}', ru: 'ПОСЛЕДНИЙ АПДЕЙТ — {when}' },
  'sp.neverUpdated': { en: 'NO UPDATE YET', ru: 'АПДЕЙТА ЕЩЁ НЕ БЫЛО' },
  'sp.yesterdayCap': { en: 'YESTERDAY', ru: 'ВЧЕРА' },
  'sp.rowsLeft': { en: '{n} ROWS LEFT', ru: 'ОСТАЛОСЬ {n} СТРОК' },
  'sp.refreshPaused': { en: 'PAUSED — CREDIT BUDGET', ru: 'ПАУЗА — БЮДЖЕТ КРЕДИТОВ' },
  'sp.noThreadYet': { en: 'thread not fetched yet', ru: 'переписка ещё не подтягивалась' },
  'sp.refreshTip': {
    en: 'Pull the latest messages for every fan of the current view · 1 credit per fan · read-only',
    ru: 'Подтянуть последние сообщения по каждому фану текущего вида · 1 кредит на фана · только чтение',
  },
  'sp.set.title': { en: 'Spenders', ru: 'Спендеры' },
  'sp.set.hint': {
    en: 'Map OnlyMonster user-lists to board shelves, top tier first. The lists themselves are managed in OnlyMonster — the board only reads them. Spenders outside mapped lists land in «No tier».',
    ru: 'Сопоставьте user-списки OnlyMonster полкам борда, верхний тир первым. Сами списки ведёт OnlyMonster — борд их только читает. Спендеры вне выбранных списков попадают в «Без тира».',
  },
  'sp.set.account': { en: 'Account', ru: 'Аккаунт' },
  'sp.set.mapped': { en: 'On the board (in order)', ru: 'На борде (по порядку)' },
  'sp.set.available': { en: 'Available OM lists', ru: 'Доступные списки ОМ' },
  'sp.set.add': { en: 'Add', ru: 'Добавить' },
  'sp.set.remove': { en: 'Remove', ru: 'Убрать' },
  'sp.set.up': { en: 'Up', ru: 'Выше' },
  'sp.set.down': { en: 'Down', ru: 'Ниже' },
  'sp.set.empty': { en: 'No lists mapped yet.', ru: 'Списки пока не выбраны.' },
  'sp.set.noKey': {
    en: 'Lists load once the OFAPI key is configured.',
    ru: 'Списки загрузятся после настройки ключа OFAPI.',
  },
  'sp.set.fansCount': { en: '{n} fans', ru: '{n} фанов' },
  // ── Spenders page stats panel (owner v2 2026-06-13; mockups/experiments/spenders-page-2.html) ──
  'sp.stats.title': { en: 'Statistics', ru: 'Статистика' },
  'sp.stats.expand': { en: 'EXPAND ⤢', ru: 'РАЗВЕРНУТЬ ⤢' },
  'sp.stats.collapse': { en: 'COLLAPSE ⤡', ru: 'СВЕРНУТЬ ⤡' },
  'sp.stats.localNote': { en: 'LOCAL DATA · 0 CREDITS', ru: 'ЛОКАЛЬНЫЕ ДАННЫЕ · 0 КРЕДИТОВ' },
  'sp.stats.revenue': { en: 'Revenue', ru: 'Выручка' },
  'sp.stats.windowNote': { en: 'FAN_TRANSACTIONS · 30-DAY WINDOW', ru: 'ИЗ FAN_TRANSACTIONS · ОКНО 30 ДНЕЙ' },
  'sp.stats.d30': { en: '30 days', ru: '30 дней' },
  'sp.stats.d7': { en: '7 days', ru: '7 дней' },
  'sp.stats.prev7': { en: 'vs prior 7', ru: 'к прош. 7' },
  'sp.stats.todayCap': { en: 'Today', ru: 'Сегодня' },
  'sp.stats.payers': { en: 'Paid · 30 d', ru: 'Платили · 30 д' },
  'sp.stats.fansWord': { en: 'fans', ru: 'фанов' },
  'sp.stats.avgCheck': { en: 'Avg purchase', ru: 'Средний чек' },
  'sp.stats.payersAvg': { en: 'Paid · avg', ru: 'Платили · ср. чек' },
  'sp.stats.todayAxis': { en: 'TODAY', ru: 'СЕГОДНЯ' },
  'sp.stats.byShelf': { en: 'By shelf', ru: 'По полкам' },
  'sp.stats.window30Short': { en: '30 D', ru: '30 Д' },
  'sp.stats.paidShort': { en: '{n} pd.', ru: '{n} пл.' },
  'sp.stats.reactivation': { en: 'Reactivation', ru: 'Реактивация' },
  'sp.stats.clickTier': { en: 'CLICK = TIER', ru: 'КЛИК = ТИР' },
  'sp.stats.hotSummary': { en: 'silent >21 d · lifetime {sum}', ru: 'молчат >21 д · лайфтайм {sum}' },
  'sp.stats.warmWord': { en: 'cooling', ru: 'остывают' },
  'sp.stats.hotWord': { en: 'cold', ru: 'запущены' },
  'sp.stats.waiting': { en: 'Awaiting reply', ru: 'Ждут ответа' },
  'sp.stats.clickPreview': { en: 'CLICK = PREVIEW', ru: 'КЛИК = ПРЕВЬЮ' },
  'sp.stats.new30': { en: 'New · 30 days', ru: 'Новые · 30 дней' },
  'sp.stats.firstBuy': { en: 'FIRST PURCHASE IN WINDOW', ru: 'ПЕРВАЯ ПОКУПКА В ОКНЕ' },
  'sp.stats.emptyBlock': { en: 'nothing in the window', ru: 'за окно — пусто' },
  'sp.stats.retentionNote': {
    en: 'TRANSACTIONS KEPT LOCALLY FOR 31 DAYS — CHARTS COVER AT MOST A MONTH · DAY COUNTERS COME FROM LOCAL MESSAGE HISTORY',
    ru: 'ТРАНЗАКЦИИ ХРАНЯТСЯ ЛОКАЛЬНО 31 ДЕНЬ — ГРАФИКИ МАКСИМУМ ЗА МЕСЯЦ · СЧЁТЧИКИ ДНЕЙ — ПО ЛОКАЛЬНОЙ ИСТОРИИ СООБЩЕНИЙ',
  },

  // ── Toasts (renderer) and notifications (main) ────────────────────────────
  'toast.newMessage': { en: 'New message', ru: 'Новое сообщение' },
  'toast.sentYou': { en: 'sent you a message', ru: 'прислал(а) сообщение' },
  'toast.dismiss': { en: 'Dismiss', ru: 'Закрыть' },
  'notif.newMessage': { en: 'New message', ru: 'Новое сообщение' },
  'notif.budgetTitle': { en: 'Credit budget at 80%', ru: 'Бюджет кредитов: 80%' },
  'notif.budgetBody': {
    en: '{used} of {budget} credits used this shift.',
    ru: 'Потрачено {used} из {budget} кредитов за смену.',
  },
  'notif.updateTitle': { en: 'Update ready', ru: 'Обновление готово' },
  'notif.updateBody': {
    en: 'ChatGoose {version} will install when you quit the app.',
    ru: 'ChatGoose {version} установится при выходе из приложения.',
  },

  // ── Settings → Updates (PLAN item 11) ──────────────────────────────────────
  'update.title': { en: 'Updates', ru: 'Обновления' },
  'update.hint': {
    en: 'The app updates itself in the background and installs when you quit; check here to update right now.',
    ru: 'Приложение обновляется само в фоне и ставит обновление при выходе; здесь можно обновиться прямо сейчас.',
  },
  'update.current': { en: 'Current version {version}', ru: 'Текущая версия {version}' },
  'update.check': { en: 'Check for updates', ru: 'Проверить обновления' },
  'update.checking': { en: 'Checking…', ru: 'Проверяю…' },
  'update.upToDate': { en: 'You have the latest version.', ru: 'Установлена последняя версия.' },
  'update.downloading': {
    en: 'Downloading {version}… {percent}%',
    ru: 'Скачиваю {version}… {percent}%',
  },
  'update.preparing': { en: 'Preparing update {version}…', ru: 'Готовлю обновление {version}…' },
  'update.ready': {
    en: 'Update {version} is downloaded — restart to install.',
    ru: 'Обновление {version} скачано — перезапустите, чтобы установить.',
  },
  'update.install': { en: 'Restart & install', ru: 'Перезапустить и установить' },
  'update.error': {
    en: "Couldn't check for updates: {message}",
    ru: 'Не удалось проверить обновления: {message}',
  },
  'update.unsupported': {
    en: 'Auto-update runs in the installed Windows app.',
    ru: 'Автообновление работает в установленном приложении на Windows.',
  },
} as const satisfies Record<string, { en: string; ru: string }>;

export type UiMessageKey = keyof typeof UI_MESSAGES;
