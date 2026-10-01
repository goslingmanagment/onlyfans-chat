# ChatGoose Desktop — инвентаризация перед возможной заменой на расширение поверх ChatSpace

> Статус: v3, все разделы заполнены (2026-10-02). Факты с прода — read-only SQL в транзакции READ ONLY.
> Репозиторий: `/Users/dmitriy/orca/workspaces/onlyfans-chat/chatspace-integration`
> (git worktree, ветка `chatspace-integration`, HEAD `93e35bb`, приложение
> `apps/desktop/package.json` = **0.1.64**). Дата: 2026-10-02. Только чтение, ничего
> в репозитории не менялось. Все пути ниже — от корня репозитория, если не сказано иное.

## 0. Короткий итог

1. **Что такое десктоп сегодня.** Electron-клиент хаба: свой инбокс/чат/composer/vault-PPV поверх OFAPI, где *все* чтения идут
   через read gateway хаба (платный OFAPI), *все* записи — командами хаба, живые события — SSE хаба, AI — только на хабе.
   UI почти целиком читает локальную зашифрованную SQLite, которую наполняет синк-слой (≈7,7 тыс. строк).
2. **Уникальная ценность (то, чего нет в ChatSpace):** AI хаба с персонами и досье (Fast Reply с тоном и Split, Improve, Help Me,
   Ping с сегментами, Hi, Scan, Chat Review); доска Spenders (тиры из списков OnlyFans, колонки «Мы писали / Фан писал»,
   статистика, мини-чат с AI и PPV); New Followers (приветствия новым подписчикам с проверкой истории); семейные хоткеи;
   тихие тосты покупок и звук подписчика. Всё остальное (инбокс, тред, отправка, медиа, vault, онлайн-статус) у ChatSpace есть
   своё и шире (шаблоны, рассылки, follow-up, переводчик, метки, права по сменам).
3. **AI переносится легче всего:** клиент шлёт только ссылки (страница, id фана, ключ персоны, тон/режим, черновик), хаб сам
   собирает транскрипт/траты/досье и **отвергает клиентский контекст для OnlyFans**. Значит, AI в расширении работает, пока хаб
   получает вебхуки OFAPI по этим страницам; если OFAPI отключить — нужен новый фид в хаб (OnlyMonster API/вебхуки) или
   пересмотр решения о клиентском контексте.
4. **Переиспользуемо:** `packages/shared` (чистый TS+zod: htmlToPlainText, ping-сегменты, бакеты молчания/тиры Spenders, денежные
   блоки, санитайзер и `[NEXT]`-сплит, гейты алертов, звуки, CG-ошибки, i18n RU/EN, схемы SSE, page-mapping), `@kernel/sdk`
   (fetch+zod, уже в Fansly-расширении), `@chatgoose/hotkeys`, React-поверхности Spenders/Online/Followers/AI-док/панель фана —
   renderer уже отвязан от Electron интерфейсом `ChatGooseBridge` и запускается в браузере с mock-мостом.
   Не переносимо: синк, БД, outbox, media-resolver, секреты, updater, всё окно/меню/бейдж.
5. **Что уйдёт:** клиентские кредиты OFAPI (≈12,8 тыс./28 дней — немного) и, главное, класс «клиент жжёт кредиты» (до 14 тыс. за
   ночь); побочное авто-прочтение `GET /messages` (надо живьём проверить, как ChatSpace ведёт себя на непрочитанном чате);
   задержки OFAPI-вебхуков 3–10 мин против <1 с у WebSocket ChatSpace; пустая история из-за DPI на RU-хабе; вся Electron-цена
   (нативный SQLCipher, сборка только на Windows, неподписанные билды, свой фид, DOA-инциденты, 64 релиза за 3,5 месяца, жёсткая
   связка релиза с контракт-хешем хаба).
6. **Что станет хуже:** свои поверхности придётся встраивать в чужой Vue-SPA в бете (хрупко) или выносить в отдельную вкладку;
   мини-чат Spenders и данные доски (транзакции, «последнее сообщение каждой стороны») нужно переделать на новый источник;
   третье пространство id (аккаунт OnlyMonster) и два логина/два контура прав; нет `[NEXT]`-цепочек; вероятные конфликты
   хоткеев с TipTap (⌘E/⌘I/⌘⇧S на macOS); зависимость от вендора и его ToS; пропадает офлайн-кеш.
7. **Масштаб использования:** по проду за последние недели десктопом пользуются 1–2 чаттера на 2 OnlyFans-страницах
   (200–900 отправок и 130–900 AI-генераций в неделю); Fansly-расширением — 3–5 чаттеров. Цена поддержки Electron несоразмерна
   этому парку.

---

## 1. Функции для чаттера — что реально есть в 0.1.64

Полный список возможностей проще всего снять с контракта IPC renderer↔main:
`apps/desktop/src/preload/contract.ts:926-1190` (≈88 каналов) +
`apps/desktop/src/preload/followers-contract.ts`. Экраны: `apps/desktop/src/renderer/src/app/AppShell.tsx:90-140`
(вход → рабочая область «список + чат + панель фана» либо отдельные страницы Settings /
Spenders / Followers / Online).

### 1.1 Вход и аккаунты
| Функция | Что делает | Где |
|---|---|---|
| Экран входа (D35) | Логин + пароль чаттера → device token на машину (без cookie, без ключей). Появляется только если на машине нет device-custody | `renderer/src/features/auth/SignInScreen.tsx`, `AppShell.tsx:90-96`, IPC `cmd:hub.issueDeviceToken` (`contract.ts:968`), `main/hub/device-token.ts` (1008 строк crash-safe reserve/activate/revoke) |
| Самовосстановление на 401 | При `token_revoked`/`token_expired` от хаба стирает custody и возвращает на экран входа | D35 п.4, `main/hub/auth-recovery.ts` |
| Аккаунт в настройках | «Подключено как X · устройство Y», выйти с устройства, «забыть локально» | `features/settings/sections/HubSettings.tsx`, `cmd:hub.signOutDevice` / `cmd:hub.abandonDevice` |
| Мульти-аккаунт | Рейл слева: все OnlyFans-страницы, выданные этому чаттеру хабом (grant set, D23), аватар, точка авторизации, бейдж непрочитанных, порядок перетаскиванием | `features/inbox/AccountRail.tsx`, `query:accounts.list`, `settings.accountOrder` |

### 1.2 Инбокс (список чатов)
- Фильтры «Все / Непрочитанные / С чаевыми», виртуализированный список, строка: фан, превью
  последнего сообщения, «мы/фан», непрочитано, **lifetime-спенд и спенд за 30 дней** (creator net),
  точка «фан ждёт ответа» (`ChatListItemVM`, `contract.ts:63-86`; `features/inbox/ChatListPane.tsx`, `ChatRow.tsx`).
- Поиска в самом списке нет — поиск чатов/фанов в палитре ⌘K (`app/CommandPalette.tsx`, `query:chats.search` — по локальной БД).
- Баннер свежести «Список от чт 16:07, обновляется…» и статус SYNCING (D38 п.10–11; `features/inbox/ListFreshnessBanner.tsx`).
- ⌘1…9 — прыжок к N-му чату, с оверлеем номеров при удержании модификатора (`NavNumberOverlay.tsx`, D41).

### 1.3 Чат (тред)
- Пузыри: текст (HTML OnlyFans уже очищен в main), медиа-плитки (до 4, «+N», лайтбокс; D43),
  PPV-чип «куплено / не куплено / неизвестно», чаевые с запиской, reply-to, удалённые (tombstone),
  статус прочтения фаном своих сообщений (`isNew`), «печатает…», онлайн/last seen
  (`MessageVM`, `contract.ts:126-144`; `features/conversation/Thread.tsx`, `ThreadRows.tsx`).
- Шапка: фан, денежные чипы, ↻ ручное обновление хвоста (`cmd:conversation.refresh`), меню AI ✳ (Scan/Review).
- Прокрутка в прошлое — явная подгрузка старших страниц (`cmd:conversation.loadOlder`, D22).
- Вкладка «Галерея» чата (медиа-сообщения, PPV-статус) — `features/vault/GalleryTab.tsx`, `query:chat.gallery`.
- Действия: лайк/анлайк сообщения, переименование фана (custom name) — `features/conversation/ConversationActions.tsx:9-19,102,154`
  (после D33 из девяти «closed actions» в UI остались только like/unlike и custom name; pin/mute/hide/mark-unread убраны),
  unsend своего сообщения (`cmd:message.unsend`).

### 1.4 Composer и отправка
- Черновик на чат, сохраняется в БД (`query:draft.get`/`cmd:draft.set`).
- `[NEXT]`-цепочки: черновик режется на части, каждая — отдельное сообщение с паузой 2–5 с, отменяемо
  (`main/send/engine.ts:33-35`, `cmd:send.message`, `cmd:send.cancelSequence`).
- Typing-beacon фану (≤1 раз в 3 с, `ComposerBar.tsx:115-126`; хабовая команда `typing_active_v1`).
- Reply-to (ответ на конкретное сообщение) — `ComposerContext.tsx`.
- Outbox-строки в треде: queued / sending / sent / failed / **unconfirmed**; для failed — Retry (новая строка),
  для unconfirmed — «Проверить сейчас»/Dismiss; никаких автоповторов (§5) — `features/conversation/OutboxRows.tsx`,
  `cmd:send.retry|dismiss|verifyNow`.
- Восстановление старых «rich»-черновиков (GIF, скрытый до покупки текст, теги участников, screening) — только
  показ сводки и «сбросить», новых опций нет (D33) — `ComposerContext.tsx`.
- **Message Guard** (блок офф-платформенных ссылок/ников/кошельков/«red/yellow»-слов в черновике):
  код и настройки есть, но **принудительно выключен** с 2026-06-24 —
  `packages/shared/src/message-guard/defaults.ts:56-59` (`MESSAGE_GUARD_ENFORCEMENT_ENABLED = false`).
- «Оптимистичные» и аудитные данные: кнопка RUN OUTBOX AUDIT (дубли, зависшие unconfirmed) — `query:outbox.audit`.

### 1.5 Медиа, Vault, PPV
- Vault модели: альбомы, сетка, поиск, лайки/чаевые медиа (`features/vault/VaultPanel.tsx`, `query:vault.list|albums`).
- PPV/медиа-отправка: выбор файлов из vault, превью ⊆ файлов, цена 0 (бесплатно) или $3–200 в центах,
  обязательная сводка-подтверждение (защита от ошибки в цене) — `cmd:send.ppv` (`contract.ts:1177-1189`),
  `main/send/engine.ts:54-55`. **Загрузки файлов с диска нет** (fail-closed, `main/ofapi/transport.ts:23-29,58-60`).
- Картинки (D43): все медиа — токены `media://`, хаб решает цену (free URL / кеш OFAPI / платная загрузка,
  авто-лимит 100 кредитов/сутки на агентство, клик всегда проходит); байты кешируются только локально и
  зашифрованы; полноразмерное фото — по клику; видео/GIF — только кадр-превью
  (`features/media/*`, `main/media/resolver.ts`, `main/media/protocol.ts`).

### 1.6 AI (все режимы)
Фичи — `packages/shared/src/types.ts:5-13`, политики — `packages/shared/src/features.ts:54-160`,
лейблы — `renderer/src/features/ai/dockLogic.ts:411-419`.

| Фича (id) | Что получает чаттер | Где в UI | Хоткей (D41) |
|---|---|---|---|
| Fast Reply (`fast-reply`) | 1–N частей ответа в «доке» под composer, стриминг; тон до генерации: casual (по умолч.) / flirty / upsell / spicy / none (только персона); режим **Split** (2–3 сообщения) | пилюля Reply + ▾ тон-поповер (`AiPillRow.tsx`, `TonePopover.tsx`) | ⌘E / Ctrl+E; тон ⌘⇧O / Ctrl+Alt+O; Split ⌘⇧L |
| Improve Draft (`improve-draft`) | Переписывает черновик чаттера (обязателен непустой черновик), поддерживает Split (D42) | пилюля Improve | ⌘I |
| Help Me (`help-me`) | Коучинг-карточки (XML-документ: анализ ситуации/что ответить) | пилюля Help | ⌘⇧H |
| Ping (`ping`) | Реактивация молчащего фана; сегмент A (была история, замолчал) / B (почти не писал) / active (писал ≤5 дней) показывается, но с D29 **не блокирует** ручной Ping | пилюля Ping (в т.ч. в мини-чате Spenders) | ⌘P |
| Hi Greeting (`hi-greeting`) | 3 варианта приветствия для пустого/короткого чата (гейт ≤10 сообщений на хабе); в New Followers — 1 вариант (`variantCount: 1`, D37) | пилюля Hi | ⌘G |
| Scan (`fan-summary`) | AI-досье фана (рус., серифом) во вкладке Scan панели фана; кешируется локально, refresh = принудительная регенерация; синхронизируется в хаб как fan profile | панель фана → Scan, меню ✳ | ⌘⇧S |
| Chat Review (`chat-review`) | Разбор переписки (XML-карточки) | меню ✳ в шапке | ⌘⇧B |
| Compare (`compare`) | сравнение персон — **выключено** (gated, `main/ai/coordinator.ts:1052-1054`) | — | — |
| Cancel | отмена текущей генерации | — | ⌘. |

Общие механики: одна операция на чат (CG-FLOW-04), генерации идут в фоне при переходе между чатами,
⌘0 — вставить все части как `[NEXT]`-цепочку, вставка/копирование части — телеметрия acceptance
(`cmd:ai.feedback`), debug-режим с инспектором промпта, который присылает хаб (D9).
AI **никогда не отправляет сам**: результат только вставляется в composer (D30 — квитанция вставки, «AI does not send messages»).

### 1.7 Панель фана (`]`)
Вкладка Info: имя, custom name, @ник, last seen, about, разбивка трат (всего/подписки/чаевые/сообщения+PPV/посты/стримы),
подписка (активна/истекла, цена, продление, **бейдж риска оттока при выключенном автопродлении**), возраст данных.
Вкладка Scan — см. 1.6. `renderer/src/features/fan-panel/FanPanel.tsx`, `FanPanelVM` (`contract.ts:152-180`).

### 1.8 Spenders (доска саппортеров) — отдельная страница (`$` в рейле, ⌘⇧M)
- Полки-тиры = **списки OnlyFans (user lists), которые ведёт OnlyMonster**; маппинг «список → полка» в настройках
  (`main/spenders/service.ts:1-7`, `features/settings/sections/SpendersSettings.tsx`). Фаны вне списков — «Без тира».
- Строка: аватар, имя, эмодзи/номер тира, lifetime, 30 дней, превью последнего сообщения с префиксом «Мы:/Фан:»,
  две колонки «Мы писали» / «Фан писал» (D29), сортировка по ним; поиск по имени/нику/ID и фильтры (D30).
- **Мини-чат (QuickLook)** по Space/клику: тот же `ConversationView` в компактном режиме — тред, composer, PPV/vault,
  AI-пилюли Ping/Reply/Hi/Improve; J/K — следующий/предыдущий фан, O — открыть полный чат
  (`features/spenders/QuickLook.tsx`, `features/conversation/conversationFeatures.ts:28-48`).
- Панель статистики (вся — из локальной БД, 0 кредитов): дневная выручка за 30 дней, 7д vs прошлые 7д, сегодня,
  плательщики, средний чек, выручка/плательщики по тирам, «радар молчания» (8–21 / >21 день), очередь
  «последним писал фан», новые спендеры (`SpenderStatsVM`, `contract.ts:788-817`; `StatsPanel.tsx`).
- Платное «Обновить» по скоупу: по одному GET хвоста переписки на каждого фана ростера, с TTL 5 мин, паузой при
  бюджете, прогрессом (`main/spenders/refresh.ts:1-11`).

### 1.9 Online — «кто сейчас онлайн» (отдельная страница)
Плоский список онлайн-фанов (по умолчанию «только спендеры»), сортировка по трате или «кто только зашёл»,
те же колонки, что у Spenders. **Только ручное «Обновить»** (1 кредит/страница ≤20 фанов, автопарса нет по
решению владельца) — `main/online/service.ts:1-12`, `features/online/OnlineSurface.tsx`.

### 1.10 New Followers — «новые подписчики» (отдельная страница, D32/D34/D36/D37)
Выбор окна (часы), явное согласие на платные чтения (они помечают чаты прочитанными), перебор
`/fans/latest?type=new`, проверка истории каждого фана → статусы pending/checking/ready/replied/contacted/unknown/
blocked/sending/sent; для `ready` — генерация одного приветствия (Hi, 1 вариант), ревью, отправка одной командой с
перепроверкой и межпользовательской блокировкой на хабе (core #339). Журнал прогона (debug) и экспорт.
`main/followers/service.ts` (1066 строк), `features/followers/*`, `docs/followers.md`.

### 1.11 Уведомления, звук, бейдж
- In-app toasts + OS-уведомления (о новом сообщении — когда окно в фоне), клик открывает чат
  (`main/index.ts:1188-1260`, `renderer/src/app/ToastHost.tsx`).
- Покупки (D39/D40): тихие тосты «<фан> купил(а) PPV $89» / «отправил(а) чаевые $5», без звука; окно возраста 60 мин.
- Звуки (D44): 8 синтезированных тонов, громкость, отдельный звук «новый подписчик» (`subscription.started`)
  со своей паузой (`packages/shared/src/sound/index.ts`, `features/settings/sections/BehaviorSettings.tsx`).
- Повтор/реплей после простоя не звенит (D24, D38 п.9); бейдж непрочитанных на иконке Dock (macOS) /
  overlay-иконка панели задач (Windows) (`main/index.ts:1188-1200`, `main/platform/badge.ts`).

### 1.12 Хоткеи и навигация
- Семейная схема `@chatgoose/hotkeys` (общая с Fansly-расширением, D41): текстовые действия ⌘/Ctrl+E/I/G/P/., панели
  ⌘⇧/Ctrl+Alt+H/S/O/B/L/M, сопоставление по физической клавише (работает в русской раскладке), защита от
  «перекатывания» после смены языка (`packages/chatgoose-hotkeys/dist/scheme.d.ts`, `renderer/src/lib/hotkeyScheme.ts`).
- Навигация: J/K, ⌘U следующий непрочитанный, Enter фокус composer, ⌘Enter отправить, Esc, `[` / `]` скрыть список/панель,
  ⌘K палитра, `?` шпаргалка, ⌘, настройки, ⌘0 вставить все части; на Spenders — Space/O/←/S/`/`
  (`renderer/src/app/keymapBindings.ts:79-104`).
- Своё меню приложения, чтобы системные ⌘R/⌘H/⌘0 не перехватывали хоткеи (`main/index.ts:~420-460`).

### 1.13 Настройки (`features/settings/SettingsSurface.tsx:70-78`)
- **Activity**: режим синка (POLLING / HUB LIVE), кредиты OFAPI по назначениям (hot-poll, message-tail,
  spenders-refresh, online, media…), сводка кредитов хаба по страницам, AI-траты по фичам, телеметрия SSE.
- **Аккаунт** (вход/выход, диагностика подключения).
- **Personalities**: какая персона хаба (каталог только для чтения, D17) привязана к каждому аккаунту; экспорт старых локальных персон.
- **Behavior**: язык RU/EN, тема (CSS-переменные), масштаб, уведомления, звуки, **Auto-read** (по умолчанию OFF),
  настройки сверки непрочитанных, стиль спенда в списке, debug, prompt caching (рудимент), rollback-тумблеры.
- **Spenders**: маппинг списков OnlyFans → полки.
- **Данные**: размер зашифрованного кеша, открыть папку, экспорт диагностики, purge, разовая «жатва» локальной
  истории в хаб (harvest).
- **Обновления**: проверить/скачать/перезапустить (Windows) или «Скачать» (macOS, D21).

### 1.14 Статус-бар
Режим синка, SYNCING, «HUB AUTH/HUB CREDENTIAL», кредиты сегодня и баланс, AI-траты сегодня, отправки
(sent · unconfirmed), «последний пуш N назад», «список проверен N назад» — `renderer/src/app/StatusBar.tsx`.

### 1.15 Чего в десктопе нет (для сравнения с ChatSpace)
Нет: массовых рассылок, шаблонов сообщений, follow-up-очереди/таймеров, переводчика, заметок к фану
(кроме custom name), загрузки медиа с диска, постинга/stories, pin/mute/hide/mark-unread (убраны D33),
Compare-персон, Telegram-каналов, ролей/прав, «Mimic»-автопилота. Многое из этого у ChatSpace есть (FACTS.md: сторы
`messageTemplates`, `followUpQueueSync`, `chatTimers`, `messageTranslator`, `mimic`, `pinnedChats`, права Mass Messages/Unsend/…).

---

## 2. Источник данных каждой функции

### 2.1 Пять источников
1. **Хаб, read gateway (платный OFAPI через хаб).** Все чтения OnlyFans идут не напрямую в onlyfansapi.com, а в
   `https://gosling-agency.ru/api/v1/ofapi/read/...` с device token (`main/ofapi/transport.ts:7-14`,
   `main/index.ts:689-701`). Каждое такое чтение — реальный вызов OFAPI (≥1 кредит), хаб лишь проксирует,
   журналирует и считает расход. Прямого OFAPI на машине чаттера нет с Stage 24 (D3).
2. **Хаб, command outbox (через vendored `@kernel/sdk`).** Все записи — команды хаба: `send_text_message_v1` (обычный текст),
   `send_media_message_v1` (медиа/PPV), `send_message_v2` (только когда есть rich-опции, D28), `typing_active_v1`, `unsend_message_v1`,
   `mark_chat_read_v1`, `like/unlike_message_v1`, `set_fan_custom_name_v1`. Прямые записи в transport **fail-closed**
   (`main/ofapi/transport.ts:56-79`), единственный путь — `main/send/engine.ts` + `composer-actions.ts` (`createOfapiCommand` / `getOfapiCommand`).
3. **Хаб, SSE v2 + REST-ленты.** Живые события из вебхуков OFAPI → хаб → `GET` SSE-поток: `message.received|sent|deleted`,
   `message.ppv_unlocked`, `tip.received`, `transaction.posted`, `presence.online|offline`, `subscription.started|renewed`,
   `account.auth_changed`; typing — по отдельному `ephemeral`-лейну; плюс snapshot для разрывов (D10/D16) и
   `/events/v2/facts` для денежных фактов (D39) — `packages/shared/src/protocol/index.ts:648-779`,
   `main/sync/hub-sync.ts:824-845`, `main/sync/money-facts.ts`.
4. **AI хаба (kernel feature lane).** Генерация — `streamAiFeature` (SDK) через `main/hub/ai-feature-gateway.ts`.
5. **Локальная зашифрованная SQLite** (better-sqlite3-multiple-ciphers, SQLCipher; ключ в OS keychain через
   `safeStorage`) — 23 таблицы, схема v26 (`main/db/schema.ts`, `migrations.ts:40`): accounts, chats, messages, fans, fan_transactions, message_facts,
   summaries, outbox(+outbox_next), unsend_commands, composer_actions, sync_intents, thread_fetch_log, credit_log,
   ai_spend_log, ai_acceptance_ops, usage_events, media_cache, media_urls, media_fetch_reports, message_guard_events,
   harvest_uploaded_revisions, settings. **UI почти целиком читает отсюда**, сеть только наполняет кеш.

### 2.2 Функция → источник
| Функция | Чтение | Запись | Платно (OFAPI-кредиты)? |
|---|---|---|---|
| Рейл аккаунтов, grant set | хаб: `listAccounts` через read gateway → локальная `accounts` (D23/D35) | — | 1 вызов на старт/реконсиляцию |
| Список чатов, unread, превью | локальная `chats`; наполняется: SSE (`message.*`), страница 1 при старте и «safety read» раз в 5 мин для активного аккаунта (D38), sync intents, deep sweep 5 стр./5 мин (только в polling-режиме), сверка непрочитанных `GET /chats?filter=unread` (настраиваемо) — `main/sync/polling-sync.ts:42-90` | — | да, `listChats` = 1 кр/стр. |
| Lifetime-спенд | `fans.spending` из объекта пользователя OFAPI | — | при обновлении фана |
| Спенд за 30 дней, статистика Spenders | **вычисляется** SQL-суммой по `fan_transactions`; наполняют: часовой sweep `GET /transactions` через gateway (`polling-sync.ts:92-97`) + мгновенные `transaction.posted` из SSE и catch-up `/events/v2/facts` (бесплатно, D39) | — | sweep ~1 стр./час |
| Тред сообщений | локальная `messages`; SSE доставляет тела входящих/исходящих (нормализованные хабом) без GET; при **открытии чата** — `GET /chats/{id}/messages` через gateway (`cmd:conversation.open`, `ipc/handlers.ts:854-909`) | — | да; **и помечает чат прочитанным на OnlyFans** (см. §6) |
| Старшая история | `backfillOlder` с заголовком `x-agency-hub-read-intent: deep-history-v1` — хаб может отдать из своей БД (D22) | — | иногда бесплатно |
| PPV «куплено» | `message_facts` из SSE `message.ppv_unlocked` + catch-up (D39) + поле `isOpened` при чтении | — | нет |
| Typing / online фана | SSE (ephemeral typing, presence) | typing: команда хаба `typing_active_v1` | нет |
| Панель фана Info | локальная `fans`; при открытии чата, если старше 5 мин — `GET /users/{username}` через gateway (`polling-sync.ts:78,2587-2590`) | custom name: команда хаба | да, ≤1 на открытие |
| Scan (досье) | локальный кеш `summaries`; при промахе — AI хаба; после генерации push в хаб (`putFanProfile`, `main/hub/summary-hooks.ts`) | — | AI-кредиты хаба |
| AI-ответы (все фичи) | **хаб собирает контекст сам** (см. 2.3) | — | AI-счёт хаба, не OFAPI |
| Ping-сегмент (подсказка в доке) | локально из треда (`packages/shared/src/transcript/ping-segment.ts`), на хабе — та же функция над его архивом | — | нет |
| Отправка текста / [NEXT] / PPV | — | outbox (локально) → `createOfapiCommand` хаба → статус `getOfapiCommand`; верификатор сверяет по статусу хаба или по SSE `message.sent` | 1 попытка вендора на команду |
| Unsend / like / mark-read | — | команды хаба (`unsend_message_v1`, `like_message_v1`, `mark_chat_read_v1` и т.д.) | да, по 1 |
| Vault (альбомы, файлы) | `GET /media/vault`, `/media/vault/lists` через gateway **на каждый показ** (кеш React Query 30–60 с) — `renderer/src/bridge/queries.ts:593,602` | — | да |
| Галерея чата | `GET /chats/{id}/media` через gateway (staleTime 15 с) | — | да |
| Картинки | локальный зашифрованный media-кеш → иначе `POST /api/v1/ofapi/media/resolve` хаба, хаб решает free/paid/лимит, байты качает сама машина с CDN OnlyFans, отчёт `ofapiMediaReports` (D43) | — | по решению хаба (авто ≤100 кр/сутки на агентство) |
| Spenders: тиры | `GET /user-lists` + `/user-lists/{id}/users` через gateway, кеш в памяти 5 мин (`main/spenders/service.ts:27-33`) | — | да |
| Spenders: мини-чат | тред из локальной БД + `cmd:spenders.hydrate` (1 GET хвоста, TTL 5 мин) | обычный outbox | да, и помечает прочитанным |
| Spenders: «Обновить» | по 1 GET хвоста на фана ростера | — | да, помечает прочитанными |
| Online | `GET /fans/active?filter[online]=1` вручную; остальное — join по локальной БД (`main/online/service.ts`) | — | 1 кр/стр. |
| New Followers | `/fans/latest?type=new`, `/settings/welcome-message`, `/chats/{id}/messages` по каждому фану, с пейсингом (`main/followers/pacing.ts`) | outbox (одна команда, custody хаба #339) | да, помечает прочитанными |
| Кредиты/статистика расхода | локальные `credit_log`, `ai_spend_log` + хаб `ofapiCreditsChatterSummary` | — | нет |
| Персоны | хаб `aiPersonaCatalog` (метаданные), маппинг аккаунт→персона локально (D17) | — | нет |
| Обновления приложения | фид `45-8-230-111.sslip.io` (Win) / `version-mac.json` (mac) | — | нет |

### 2.3 AI: что передаёт клиент и что собирает хаб
- Клиент шлёт **только ссылки и параметры** (`main/hub/ai-feature-gateway.ts:172-197`): `clientRequestId`,
  `pageLabel` (страница хаба), `platform: 'onlyfans'`, `conversationRef` = id фана/чата, `personaKey` +
  `expectedPersonaDefinitionId` (доказательство версии персоны, D17), `replyTone`, `replyMode` (Split),
  `draftText` (для Improve), `variantCount: 1` + `fanRef` (для New Followers), `isRegeneration`. Ни транскрипта, ни трат,
  ни промпта: «NO prompt or context leaves the desktop» (`ai-feature-gateway.ts:1-4`, `main/ai/coordinator.ts:913-945`).
- Хаб для OnlyFans-страниц **сам** собирает контекст из своих данных и **отвергает клиентский контекст**:
  `~/code/1-platform/hub/apps/runtime/src/modules/ai/features/index.ts:468-473`
  («clientContext is only accepted for fansly pages … OnlyFans context is kernel-fresh — accepting client values there would
  let a bearer fabricate transcript/spend»). Источники на хабе (`features/index.ts:541-597`,
  `modules/ai/context/index.ts:99-140,208-260`): транскрипт из `dm_message_archive` (архив, наполняемый вебхуками OFAPI и
  захватом чтений) + опциональный union со свежими таблицами, траты/подписка из ledger `transactions`, имя и био фана,
  ping-сегмент и дни молчания, досье фана (fan profile, #136), описания картинок (media notes), персона. Для Fansly
  (расширение) есть отдельный путь Stage 32, где контекст присылает клиент (`clientContext`).
- Локально остаётся: выбор персоны по аккаунту, кеш Scan, гейт «нужен черновик», телеметрия acceptance
  (shown/copied/inserted → capture lane хаба, `main/hub/acceptance-reporter.ts`), debug-эхо промпта.
- Вывод для новой архитектуры: AI-часть переносится в любой клиент почти даром (нужны device token, pageLabel, id фана,
  ключ персоны) — **но качество ответа зависит от того, насколько свеж архив хаба по этому диалогу**, т.е. от того,
  продолжает ли хаб получать вебхуки OFAPI по этим страницам (§6).

### 2.4 Что десктоп сам отдаёт хабу (пропадёт вместе с ним)
- Каждое чтение через read gateway хаб **захватывает в свой архив** (capture-first: `hub/apps/runtime/src/services/ofapi-capture-transport.ts`,
  D22) — открытия чатов десктопом дополняют архив, по которому хаб строит AI-контекст.
- Scan-досье пушатся в хаб как fan profile (`main/hub/summary-hooks.ts`) и потом подмешиваются в другие AI-промпты (#136).
- Телеметрия acceptance (shown/copied/inserted), отчёты о загрузке медиа (`ofapiMediaReports`), разовая «жатва»
  локальной истории (`main/harvest/index.ts`, `POST /api/v1/ingest/observations`).

---

## 3. Electron-специфика и цена поддержки

### 3.1 Что завязано на Electron/Node (не переносится в расширение как есть)
| Модуль | Зачем | Где |
|---|---|---|
| Composition root | окно, меню (свои акселераторы, чтобы ⌘R/⌘H/⌘0 не перехватывались), zoom, тема (`nativeTheme`), single-instance, `before-quit`-барьер (дождаться дренажа рантайма), `powerMonitor` resume, уведомления, бейдж | `main/index.ts` (2613 строк), `window-lifecycle.ts`, `platform/*` |
| Секреты | device token и ключи БД/медиа шифруются `safeStorage` (Keychain/DPAPI), по файлу на секрет; при загрузке удаляются «списанные» секреты прошлых эпох (ofapiKey, anthropicKey, hubApiKey…) | `main/secrets/keychain.ts:10-60` |
| Зашифрованная БД | `better-sqlite3-multiple-ciphers` (SQLCipher), WAL, схема v26, миграции только вперёд | `main/db/*` (≈3,7 тыс. строк запросов + схема 654) |
| Медиа-кеш | свой протокол `media://` (privileged scheme), шифрованный кеш байтов, allowlist хостов, проверка magic bytes | `main/media/protocol.ts`, `cache.ts`, `resolver.ts` (≈1,6 тыс. строк) |
| Автообновление | `electron-updater` на generic-фиде на VPS агентства (Windows, установка при выходе); macOS — только уведомление и ссылка (неподписанный билд, D21) | `main/platform/updater.ts`, `docs/RELEASE.md` |
| IPC-граница | allowlist каналов в preload, zod на каждом входе в main | `preload/index.ts`, `preload/contract.ts:1264-1356`, `main/ipc/handlers.ts` (1475 строк) |
| Device sign-in custody | crash-safe reserve/activate/revoke с журналами, привязка токена к origin+digest | `main/hub/device-token.ts` (1008), `credential-journal.ts`, `runtime-activation.ts` (617) |

### 3.2 Сборка, подпись, распространение
- **Нативный модуль без prebuilds**: Windows-инсталлятор собирается только на Windows (`apps/desktop/scripts/assert-win32.mjs`),
  отдельный node-ABI-алиас пакета для тестов, `rebuild:native` для dev (`docs/RELEASE.md:20-45`).
- **Без подписи**: Windows — SmartScreen («Подробнее → Выполнить в любом случае»), macOS — right-click → Open и нет автообновления.
  Сертификаты упираются в оплату из РФ (заметка владельца `code-signing-rf-payment-blocker`), workflow к подписи готов, но не включён (`docs/RELEASE.md:54-87`).
- **Своя инфраструктура обновлений**: nginx-фид `https://45-8-230-111.sslip.io/u/<token>/` на VPS, `publish-feed.sh` (397 строк:
  серверный lock, строгий рост версии, атомарная подмена `latest.yml`, SHA-512 проверка), публичная страница скачивания
  `ext.gosling-agency.ru/desktop/` (D20), отдельный ручной канал для mac (`publish-mac.sh` 214 + `publish-mac-remote.sh` 337).
- **Откат запрещён**: только roll-forward более высокой версией (D11), т.к. миграции БД односторонние и updater не ставит младшую.

### 3.3 CI и релизный ритуал
- `ci.yml`: PR → Linux `pnpm check` (typecheck + lint + test + build); push в `main` → Linux + Windows. На ПК-раннерах части идут
  параллельно через `scripts/ci-parallel-check.mjs` (295 строк). CI платный (см. глобальные правила владельца).
- `windows-build.yml` (430 строк) на тег `v*`: полный check → assert «тег == package.json», «тег на origin/main», «этот SHA прошёл
  кросс-платформенный CI», **«контракт-хеш прод-хаба == вендоренному SDK»** (`apps/desktop/scripts/assert-release-sdk-vendor.mjs`) →
  сборка → smoke-запуск упакованного exe (`--smoke` до реального IPC-раунда) → загрузка в фид → post-publish assert.
- Связка с хабом жёсткая: любое изменение контракта хаба требует перевендорить SDK и выпустить десктоп (30 коммитов трогают
  `packages/kernel-sdk`; тег `v0.1.63` не прошёл гейт, т.к. прод-хаб уже ушёл на новый контракт — D44).
- Объём: main ≈36 тыс. строк TS (без сгенерированного `ofapi.gen.ts` на 52 тыс.), renderer ≈20 тыс. (+2,5 тыс. dev-mock),
  preload 1,5 тыс., shared 8,3 тыс., вендоренный SDK ≈102 тыс. строк; тесты — 184 файла / 53 тыс. строк, ≈2,3–2,4 тыс. тестов (D31; followers-incident).

### 3.4 Частота релизов
64 тега за 3,5 месяца (первый `v0.1.0` 2026-06-13, последний `v0.1.64` 2026-09-28): июнь — 28, июль — 22, август — 0,
сентябрь — 14 (из них пять в один день 2026-09-27: 0.1.58–0.1.62). 386 коммитов с 2026-06-10.

### 3.5 Инциденты, связанные с десктопом/Electron
| Когда | Что | Класс |
|---|---|---|
| 0.1.30/0.1.31 (07-06/07) | **Dead-on-launch**: `@kernel/sdk` был вынесен из бандла main → `ERR_MODULE_NOT_FOUND`, упакованный Electron молча висит без окна; обновившиеся пользователи «окирпичены» до ручной переустановки (updater живёт в мёртвом main). Фикс 0.1.32 (D8), запрет откатываться на эти версии | Electron-упаковка |
| 06-13 (item 11) | userData packaged/dev совпал → `dbKey` не расшифровывается (Keychain/DPAPI привязаны к бинарю); пойман smoke-прогоном до релиза | Electron/секреты |
| 0.1.42→0.1.44 (07-16) | После апдейта старый ключ чаттера «изолирован» (нет binding-журнала) → хаб мёртв до повторного входа; вылилось в D19/D35 | креды на машине |
| 07-15 | **PPV poison loop**: битый `conversationRef` от хаба + строгая проверка в 0.1.37 + `forceRefresh` на каждом флапе SSE = deep sweep ×аккаунты каждые ~14 с, **~14 тыс. кредитов за ночь** с одной машины (D18) | платные чтения с клиента |
| 0.1.47 (07-22) | Запуск после простоя: тост+звук на каждое сообщение за смену, ~5 мин писка (D24) | синк/реплей |
| до 0.1.57 (09-26) | ~80 с после запуска показывался вчерашний список (D38) | синк |
| 0.1.53 (09-15) | Новые фаны: пустой список из-за неверной пагинации OFAPI (D34) | OFAPI-интеграция |
| 0.1.5 (06) | гейт auto-read случайно закрыл превью Spenders (фикс 0.1.6) | auto-read |
| 06-23… | Хаб (RU VPS) читает OFAPI через DPI-троттлинг ~1 КБ/с → пустая/обрезанная история (заметка `hub-server-dpi-throttle`; текущий статус не проверял) | инфраструктура хаба |

### 3.6 Сколько десктопом реально пользуются (прод хаба, read-only SQL, 2026-10-02)
- Отправки через command outbox (`ofapi_commands`, по сути — только десктоп): за последние 10 недель **1–2 чаттера в неделю**,
  200–900 отправок в неделю; за 28 дней — 2 чаттера, 2 OnlyFans-страницы (в хабе всего 2 OnlyFans- и 6 Fansly-страниц).
  Неделя 2026-08-31 — ни одной отправки и ни одной OnlyFans-генерации.
- AI-генерации (`ai_generation_content` × `pages.platform`), последние 6 недель: OnlyFans (= десктоп) — 1–2 пользователя,
  130–900 генераций в неделю; Fansly (= расширение) — 3–5 пользователей, 760–2580 в неделю.
- По заметке владельца на 2026-07-16 парк десктопа = «Максим + Дмитрий»; в D42 упоминается чаттер Гриша.
Итого: вся Electron-машинерия из §3 обслуживает одного-двух активных чаттеров на двух страницах.

PLAN.md (помечен как исторический, обновлялся до 2026-06-26/07-12): все фазы P0–P5 code-complete, открытыми оставались
только пилотные гейты владельца (смена ≥500 отправок с аудитом outbox, живой PPV-круг на тест-фане и т.п.).

---

## 4. Что платформенно-чистое и переиспользуемо в расширении

### 4.1 `packages/shared` (8,3 тыс. строк, только TS + zod, без Node/Electron/DOM — проверено grep'ом)
Полезное для расширения поверх ChatSpace:
| Модуль | Что даёт |
|---|---|
| `transcript/html.ts` → `htmlToPlainText` | OF-HTML → текст без DOM (ChatSpace тоже отдаёт HTML `<p>…</p>` / `<br />`) |
| `transcript/normalize.ts`, `ofapi-message.ts`, `format.ts` | нормализация транскрипта, метки PPV/медиа, `[HH:MM]` UTC (если когда-нибудь понадобится клиентский контекст) |
| `transcript/ping-segment.ts` | точный legacy-алгоритм сегментов Ping (A/B/active, окно 5 дней, ≥3 сообщений фана) |
| `spenders/index.ts` | бакеты молчания (`fanSilenceBucket`, тёплый 8–21 / горячий >21 день), `daysSince`, тиры по спискам (`assignSpenderTiers`, `splitTierLabel`), `sortBySilence`, `buildDailySeries`, `periodDelta`, `isNewSpender`, `shelfPresentation`, стоимость refresh в кредитах |
| `context/spending.ts`, `context/subscription.ts` | денежные/подписочные блоки (месячные суммы, автопродление, длительность подписки) |
| `output/split.ts`, `reply-output.ts`, `xml.ts` | `[NEXT]`/`[VARIANT]`-разбиение, санитайзер вставляемых частей, парсинг Help Me / Chat Review |
| `features.ts`, `types.ts`, `constants.ts` | политики AI-фич (гейты, Split/Tone, deep ≥30 сообщений), тоны, дефолты |
| `notifications/index.ts` | гейт «живое vs история» для алертов, тексты покупок («купил(а) PPV $89») |
| `sound/index.ts` | 8 синтезированных тонов поверх Web Audio (уже общие с Fansly-расширением, D44) |
| `errors/index.ts` | реестр CG-кодов (в т.ч. CG-HUB-04..10 провайдерских ошибок хаба, D25) |
| `i18n/*` | каталог RU/EN на 1590 строк с тестом паритета, плюрализация |
| `protocol/index.ts` | zod-схемы SSE v2 кадров хаба и `mapDomainFrame` (понадобится, если расширение подпишется на поток хаба — например, ради покупок/подписчиков) |
| `hub/client.ts` | обёртка над `@kernel/sdk`: AI-стрим, команды, media resolve, money facts, профили — без Node API (fetch) |
| `hub/page-mapping.ts` | сопоставление аккаунта со страницей хаба по нормализованному username — нужно для связи «аккаунт OnlyMonster ↔ page хаба» |
| `composer.ts`, `message-guard/*`, `summary/validity.ts`, `activity/*`, `diagnostics/log.ts` | цены в центах, офф-платформенный гард (выключен), кеш досье, леджеры кредитов/AI, редактор секретов в логах |

### 4.2 `packages/kernel-sdk` (`@kernel/sdk`, вендорится из хаба)
Чистый ESM: `fetch` + zod, без Node API; покрывает ≈257 операций хаба, включая `streamAiFeature`, `subscribeDomainEvents`,
команды OFAPI, media resolve. Уже используется Fansly-расширением (`~/code/1-platform/fansly-chat/vendor/kernel-sdk`). Цена —
тот же контракт-хеш: каждый деплой хаба с новым контрактом → перевендоринг и релиз расширения.

### 4.3 `packages/chatgoose-hotkeys`
Семейная схема хоткеев (движок + таблица + лейблы), чистый TS; уже вендорится в оба клиента с одинаковым sha256 (D41).
Для расширения на ChatSpace — переиспользуется напрямую (клиент `extension`), но конфликты клавиш надо перепроверить в Chrome/
в самом ChatSpace (схема подбиралась под Firefox и Fansly; у ChatSpace свои хоткеи и TipTap).

### 4.4 Renderer (React 19 + Tailwind + TanStack Query + Zustand)
- Главный шов: весь UI говорит с main только через интерфейс `ChatGooseBridge` (`invoke`/`on`, `preload/contract.ts:1241-1256`),
  а `renderer/src/bridge/bridge.ts` при отсутствии Electron подставляет **полный mock-мост** (`dev/mockBridge.ts`, 2140 строк) —
  renderer уже запускается в обычном браузере (`vite.standalone.config.ts`, :5199). В расширении можно реализовать тот же
  интерфейс поверх `chrome.runtime`-сообщений к background-воркеру и монтировать готовые React-поверхности в Shadow DOM
  внутри ChatSpace (Vue) или в side panel/отдельной вкладке расширения.
- Хорошо переносимые поверхности (данные — через мост): **Spenders** (`features/spenders/*`: доска, QuickLook, StatsPanel,
  поиск/фильтры, boardModel), **Online**, **Followers**, **AI-док и пилюли** (`features/ai/*`: AiDock 980, aiStore 816, dockLogic 675,
  AiPillRow, TonePopover), **Scan-вкладка** и Info панели фана, дизайн-примитивы (`design/*`), i18n-хуки, тема.
- Плохо переносимые: тред/composer/outbox (`features/conversation/*`) — в ChatSpace их заменяет собственный UI (кроме мини-чата
  Spenders, где нужен свой тред+composer или навигация в чат ChatSpace); медиа-ячейки и лайтбокс завязаны на `media://`;
  настройки Activity/Updates/Data — специфичны для десктопа; `KeymapProvider` придётся подружить с хоткеями ChatSpace.

### 4.5 Main: логика переносима частично, инфраструктура — нет
- Переносимо как логика (TS без DOM, но на `DataLayer`/SQLite): AI-координатор (`main/ai/coordinator.ts`, жизненный цикл операции,
  таймауты, санитайзер), сервис New Followers (оценка истории `followers/evidence.ts`, пейсинг), агрегации Spenders/Online.
  Их данные (OFAPI через gateway) в мире ChatSpace придётся брать иначе (API/кеш ChatSpace или хаб).
- Становится ненужным: весь синк-слой (polling-sync 2929 + hub-sync 1722 + hub-provider 1878 + intents 575 + money-facts 556 ≈ 7,7 тыс.
  строк, которые держат локальное зеркало OnlyFans), send engine/outbox (1383 + 245 + 159), media resolver, БД, секреты, updater.

---

## 5. Решения из `docs/decisions.md`, важные для новой архитектуры

| Решение | Суть (коротко) | Что значит для расширения поверх ChatSpace |
|---|---|---|
| **D35** (+D19, D7) | Один аккаунт на чаттера, вход логин+пароль → device token (`authIssueDeviceTokenWithPassword`, без cookie), legacy-ключи удалены, самовосстановление на 401 с причиной, кеш аккаунтов привязан к identity; в UI запрещены слова token/key/API (`packages/shared/tests/copy-vocabulary.test.ts`) | Расширению нужен тот же вход в хаб (Fansly-расширение уже так живёт). Вход в ChatSpace (Clerk) — отдельный, это второй логин чаттера |
| **D3** | Прямые чтения OFAPI мертвы, только read gateway хаба; device token — креденшл | В новой схеме чат читается из ChatSpace, gateway нужен только для того, чего нет у OnlyMonster |
| **D4, D25, D9** | AI только на хабе: ни ключей, ни промптов, ни моделей на клиенте; ошибки провайдера — структурные коды CG-HUB-04..10; debug-эхо промпта по окну владельца | Переносится 1:1 через `@kernel/sdk` (refs-only запрос, §2.3) |
| **D17** | Персоны — каталог владельца на хабе (read-only для клиента); клиент хранит только маппинг аккаунт→персона и шлёт `expectedPersonaDefinitionId` | Расширению нужен такой же маппинг, ключом станет аккаунт OnlyMonster ↔ page хаба |
| Правило отправки (CLAUDE.md, README, D30) | **AI никогда не отправляет сам**, только черновик; вставка из одной генерации — один раз | Вставлять в TipTap-редактор ChatSpace (работает программно, FACTS.md), кнопку Send жмёт человек |
| Индетерминированная отправка (CLAUDE.md, `send/engine.ts:1-10`, D12, D27/D28, D32) | Никогда не повторять автоматически отправку с неизвестным исходом; повтор — только новая строка после явного отказа; повторное использование ключа провайдера — только явным «unchanged recovery» | Если отправку делает ChatSpace (`pendingMessages.enqueue/resend`), гарантия переходит к OnlyMonster — надо проверить их поведение при таймауте. Если расширение шлёт само (через их API) — правило надо переносить |
| Live-тесты | Живые отправки только тест-фану владельца (`P3_SEND_TEST_FAN_ID`), без него — никаких | Сохраняется для расширения |
| **D33** | Product scope: покрытие API ≠ разрешение на UI; убрана панель опций, pin/mute/hide/mark-unread, журнал команд; оставлены reply-to, like/unlike, custom name | Не тащить в расширение функции «потому что можно»; у ChatSpace свои — их и использовать |
| **D29, D30** | Spenders: контактные колонки без «срочных» цветов, чаттер сам решает, когда Ping; поиск/фильтры не делают чтений; ошибки ≠ пустые данные | Требования к будущей встроенной доске |
| **D32, D34, D36, D37** | New Followers: явное согласие перед платными чтениями (они помечают прочитанным), консервативные доказательства происхождения, никакой автоотправки и bulk, custody на хабе | Если переносить — эти правила обязательны; источник данных сменится |
| **D18** | Уведомительные кадры не блокируют курсор, переходы SSE не запускают платные чтения, poison breaker | Класс инцидента исчезает, если клиент не делает платных чтений; если расширение подпишется на SSE хаба — правило остаётся |
| **D22, D23** | Старшая история по явному действию может обслуживаться из БД хаба; список аккаунтов от хаба — полный grant set | Grant set хаба надо сверять с доступами в OnlyMonster |
| **D24, D38, D39, D40, D44** | Реплей не звенит, тосты по `provenance: live` и возрасту ≤60 мин, тихие тосты покупок, звук нового подписчика | Если оставить эти алерты (у ChatSpace свои уведомления), их источник — SSE хаба |
| **D41, D42** | Одна схема хоткеев с Fansly-расширением (вендорится из хаба), Split для Reply и Improve | Пакет готов для клиента `extension`; перепроверить конфликты в Chrome/ChatSpace |
| **D43** | Картинки: хаб решает цену, байты только локально и зашифрованы, бюджет 100 кр/сутки | Не нужно — медиа показывает ChatSpace |
| **D8, D11, D20, D21** | DOA-урок (SDK бандлить), только roll-forward, страница скачивания, mac без автообновления | Уходит вместе с Electron (у расширения своя доставка: AMO/Chrome Web Store/свой хостинг, как у Fansly-расширения) |
| Семейный закон (decisions.md:6-15) | Удаление документов только с tombstone; кросс-репо решения — в журналах клиентов со ссылкой на хаб | Решение «заменить десктоп» надо будет оформить записью (Dxx) с tombstone для устаревших доков |
| Прочие правила CLAUDE.md | Секреты и сеть только в доверенном процессе, zod на каждой границе, локальные данные шифруются, суммы OFAPI в долларах (не mills), два пространства id (`acct_…` OFAPI vs числовые id OnlyFans, `chat_id === fan.id`), тема — swap CSS-переменных | В расширении: секреты в background, не в content script/MAIN world; добавится третье пространство id — `accountId` OnlyMonster (36408) |

---

## 6. Боли, которые уйдут, и что станет хуже

Ниже «ChatSpace-сценарий» = чаттер работает в `chat.onlymonster.ai`, наше расширение добавляет AI и свои поверхности,
чат/список/отправку/медиа даёт OnlyMonster (его серверное соединение с OnlyFans, REST + WebSocket; FACTS.md).

### 6.1 Что уйдёт (выигрыш)
1. **Кредиты OFAPI на чтение чата с машины чаттера.** Сейчас каждый вызов из списка назначений
   `packages/shared/src/activity/purposes.ts:5-21` платный: hot-poll / safety read списка, unread-reconcile, открытие чата
   (`message-tail`, `chat-refresh`), fan details, vault и галерея на каждый показ, часовой spend-sweep, тиры и refresh Spenders,
   Online, New Followers, медиа (D43, до 100 кр/сутки авто). В ChatSpace это читает OnlyMonster своим соединением —
   чаттер OFAPI не тратит. Вместе с этим исчезает **класс инцидентов «клиент жжёт кредиты»** (PPV poison loop: ~14 тыс. кредитов
   за ночь с одной машины, D18). Масштаб в штатном режиме (прод, `ofapi_credit_ledger`, последние 28 дней, read-only):
   чтения через gateway от имени чаттеров — **10 520 кредитов** (список чатов 6 046, сообщения 2 922, профиль фана 819,
   транзакции 546, списки/тиры ~140, остальное единицы) + команды (отправки, лайки) — 2 257 кредитов; итого ≈12,8 тыс. кредитов
   за 4 недели (по старой оценке $0.0034/кредит — порядка $40–45 в месяц). Для сравнения: фоновые чтения самого хаба
   (маркетинг, trial/tracking-ссылки, синк аудитории `fans/active` и т.п.) — 30 194, вебхуки — 970, плюс 43 336 «external» (расход вне хаба,
   природу не выяснял). Т.е. деньги на кредитах — не главный аргумент; главный — инциденты и побочные эффекты чтений.
   Оговорка: если OFAPI остаётся подключённым ради хаба (AI-контекст, деньги), его вебхуки и бэкфилл продолжают стоить
   (в Activity есть строка `webhook.estimatedCredits`, `contract.ts:286-301`) — уходит только клиентская часть.
2. **Авто-прочтение через `GET /messages`.** На OFAPI любое чтение тела переписки мгновенно показывает фану «прочитано»
   (живой тест владельца 2026-06-16, заметка `ofapi-get-marks-read`; отсюда настройка `autoReadChats` = OFF,
   `contract.ts:420-428`). Поэтому в десктопе: открыть чат = пометить прочитанным; мини-чат Spenders, «Обновить» по тиру,
   New Followers — тоже помечают (с явным согласием); полный текст новых сообщений неоткрытых чатов виден только если
   хаб прислал тело через SSE. В ChatSpace прочтение — явные действия (`chatList.markChatAsRead/markAllChatsAsRead/markChatAsUnread`),
   а открытие уже прочитанного чата не дало ни одного write-запроса (FACTS.md). **Не проверено**: помечает ли OnlyFans
   прочитанным открытие *непрочитанного* чата в ChatSpace (т.е. что делает их серверная сессия при загрузке истории) — это
   надо проверить живьём до решения, это одна из главных потенциальных выгод.
3. **Задержки.** ChatSpace: `account_new_message` по WebSocket < 1 с, `account_fan_typing` каждые 3–4 с (FACTS.md). Десктоп:
   OFAPI-вебхук → хаб → SSE; по замерам в D38 за 30 дней 88 обычных входящих пришли с опозданием 3–10 мин (задержка самого
   OFAPI), по D40 ~4% покупок и ~7% чаевых приходят позже 9 мин; эндпоинт списка OFAPI отстаёт от вебхука (защита
   `HEAD_WRITE_PROTECT_MS`, D38 п.5); до 0.1.57 список после запуска был вчерашним ~80 с.
4. **Пустая/обрезанная история и DPI.** Хаб на RU-VPS: зарубежный трафик сервера троттлится до ~1 КБ/с (замер 2026-06-23,
   заметка `hub-server-dpi-throttle`), страницы сообщений OFAPI (~1 МБ) не успевают → пустой тред; это же бьёт по вебхукам.
   В ChatSpace данные чата идут OnlyMonster → браузер напрямую, хаб с пути чтения уходит (но не с пути AI — см. 6.2 п.4).
5. **Вся Electron-обвязка** (§3): нативный SQLCipher и сборка только на Windows, неподписанные инсталляторы (SmartScreen,
   Gatekeeper), mac без автообновления, свой фид на VPS и страница скачивания, DOA-риски (0.1.30/31), карантин кредов после
   апдейта (0.1.42), forward-only миграции 23 таблиц, платный CI с Windows-раннером и релизными гейтами.
6. **Синк-слой и его класс багов** — ≈7,7 тыс. строк, которые держат локальное зеркало OnlyFans (курсоры, снапшоты, sync intents,
   poison breaker, гейты алертов; D10, D13, D16, D18, D24, D38, D39). Источником правды для списка/треда/непрочитанных
   становится ChatSpace; исчезает и расхождение «прочитал в OnlyMonster, а в десктопе висит непрочитанным».
7. **Отправка и медиа** — outbox, верификатор unconfirmed, команды хаба, resolver картинок с бюджетами (D27/D28/D43) заменяются
   нативными механизмами ChatSpace (`pendingMessages.enqueue/cancel/resend/confirmEchoedMessage`, их vault и превью).
8. **Функции, которых у нас нет и не будет без отдельной работы** (D33 запрещает добавлять «потому что API позволяет»), а у
   ChatSpace есть: шаблоны, массовые рассылки, follow-up-очередь и таймеры, переводчик, метки/закреп/скрытие/mute, теги vault,
   stories, заметки, «температура/охват/фокус» фана, покупательская способность, последние платежи, собственный экран
   «кто онлайн» (`fans-online-entry-button`), права по сменам.

### 6.2 Что станет хуже или пропадёт
1. **Наши поверхности придётся встраивать в чужой SPA.** Spenders (тиры, контактные колонки D29, статистика, мини-чат), New
   Followers, Scan/Help/Review, AI-док с пилюлями и тоном, Activity. ChatSpace — Vue 3.5 + PrimeVue + Pinia, версия 0.167.0,
   открытая бета с 2026-08-07: встраивание через MAIN-world скрипт (CSP позволяет, iframe запрещён `X-Frame-Options: DENY`),
   опора на ~225 `data-testid` и внутренние Pinia-сторы — их релизы будут ломать интеграцию без предупреждения.
   Альтернатива — отдельная вкладка/side panel расширения (стабильнее, но чаттер переключается между окнами).
2. **Мини-чат превью Spenders.** Сейчас это наш `ConversationView` в компактном режиме (тред + composer + vault/PPV + AI, J/K по
   фанам, `conversationFeatures.ts:28-48`). В ChatSpace — либо уводить их роутер на `/accounts/:accountId/chats/:chatId` (теряется
   связка «доска + превью рядом»), либо рисовать свой мини-тред по их данным (кеш `chatMessages` / REST) и отправлять через их
   composer/API (публичный API: 1 rps на аккаунт для чатов). Сложность переезжает, а не исчезает.
3. **Данные для Spenders/статистики/Online.** Сейчас всё — join'ы по локальной БД (lifetime из `fans.spending`, 30 дней и дневная
   выручка из `fan_transactions`, «Мы писали/Фан писал» из локальных сообщений и головы списка). У ChatSpace есть `fansMap`
   (totalSpent, подписка, членство в списках), `onlyfansLastPayments`, `onlyfansBuyingPowers`, `fanInsights`, но нет
   «последнее сообщение каждой стороны» и транзакций по дням в известных нам сторах. Нужен новый бэкенд для доски: хаб
   (ledger `transactions`, `/events/v2/facts` — пока OFAPI подключён) или публичный API OnlyMonster (транзакции, вебхуки).
4. **AI-контекст держится на OFAPI-вебхуках хаба.** Хаб строит контекст OnlyFans только из своего архива и отвергает клиентский
   контекст (`hub/.../ai/features/index.ts:468-473`). Если агентство отключит OFAPI (чтобы не платить дважды), архив и денежный
   ledger хаба перестанут обновляться → ответы AI устареют. Варианты: оставить OFAPI-вебхуки; кормить хаб из OnlyMonster
   (вебхуки `chat.message` обе стороны, `fans.ppv.purchased`, `fans.tip.received`, `fans.subscription.new_subscriber`);
   или разрешить клиентский контекст для OnlyFans, как для Fansly (Stage 32) — это пересмотр решения о доверии.
   Плюс пропадает захват чтений десктопа в архив хаба (§2.4).
5. **Третье пространство id и маппинг.** ChatSpace: `accountId` OnlyMonster (напр. 36408) + `platform_account_id`; хаб: `pageLabel`
   и OFAPI `acct_…`. id фана совпадает (числовой id OnlyFans = `chatId` в роуте ChatSpace) — это хорошо. Сопоставление аккаунтов
   можно взять из `packages/shared/src/hub/page-mapping.ts` (по username) + ручной override, как сейчас.
6. **Два входа и два контура прав.** Чаттер логинится в OnlyMonster (Clerk) и в хаб (device token); права ChatSpace (Chat Space,
   Mass Messages, Unsend, shift-only…) и grant set хаба надо держать согласованными.
7. **Наши send-механики.** `[NEXT]`-цепочки с паузой 2–5 с и отменой, ⌘0 «вставить все части цепочкой», Split-ответы в 2–3 сообщения,
   PPV с защитой от ошибки цены — в ChatSpace нет известного аналога цепочек; программно жать Send за человека нельзя по нашему же
   правилу «AI не отправляет сам», т.е. части придётся вставлять/подтверждать по одной.
8. **Уведомления, звуки, бейдж.** У ChatSpace свои уведомления (`notifications`, `account_notifications_summary`). Наши тихие тосты
   покупок, звук нового подписчика, OS-уведомления, бейдж Dock/панели задач — либо переписать в расширении (`packages/shared/src/sound`
   переиспользуется), либо отказаться в пользу ChatSpace.
9. **Хоткеи.** Схема D41 подбиралась под Firefox/Fansly. В composer ChatSpace стоит TipTap, у которого по документированным умолчаниям ⌘B/⌘I/⌘E
   (bold/italic/code) и ⌘⇧S (strike) — совпадает с нашими ⌘I Improve, ⌘E Reply, ⌘⇧S Scan на macOS (на Windows Ctrl+Alt не
   конфликтует). Перехват в capture-фазе возможен, но набор надо проверить на реальной конфигурации ChatSpace и в Chrome.
10. **Зависимость от вендора.** Цены и условия OnlyMonster, бета-продукт, ToS на сторонние скрипты, неофициальный доступ
    (Clerk JWT живёт 60 с, берётся из `window.Clerk.session.getToken()` в MAIN world), лимиты публичного API (25 rps на организацию,
    1 rps на аккаунт для чатов). Пропадает офлайн-режим: десктоп показывает зашифрованный кеш при недоступности сети/хаба, ChatSpace —
    нет (зато меньше данных хранится на машине).
11. **Доставка расширения.** Fansly-расширение — Firefox MV3 (подписание через AMO + самохостинг, заметка `legacy-extension-release-deploy`).
    Если ChatSpace будут открывать в Chrome, установка вне Chrome Web Store на Windows/macOS по общему знанию возможна только
    через корпоративные политики — это надо учесть при выборе браузера (здесь не проверялось).
12. **New Followers** опирается на OFAPI (`/fans/latest?type=new`, `queueId` welcome-шаблона как доказательство, D36). В ChatSpace-мире
    нужен другой источник (данные фанов OnlyMonster / вебхук `fans.subscription.new_subscriber`) и перепроверка всей логики доказательств.

### 6.3 Попутное замечание о гибриде
`X-Frame-Options`/`frame-ancestors` запрещают только iframe; Electron может грузить `chat.onlymonster.ai` в собственный
`WebContentsView` с preload-скриптом и рисовать наши панели рядом. Это сохраняет нативные уведомления/хоткеи/бейдж и выкидывает
синк, БД и отправку, но оставляет всю цену Electron из §3 (сборка, подпись, фид). Упоминаю как третий вариант для сравнения.
