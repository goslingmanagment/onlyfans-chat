# OnlyMonster ChatSpace 0.167.0 — полный перечень функций (продуктовый разбор)

Дата: 2026-10-02. Клиент `chat.onlymonster.ai`, `VITE_GIT_TAG=v0.167.0` (comp19:62730).
Источники: бандлы `om/pretty/*.js`, локали vue-i18n (en/de/es/ru/uk; объекты comp19:75482–81900, сборка namespaces comp19:84935–85065), ответы API в `net.jsonl`/`net-mytab.jsonl` (только структура, без токенов и данных фанов), документация `omdocs/*.md`.

Сокращения ссылок: `ChatView:7718` = `pretty/ChatView-DgLPXTcj.js:7718`; `messages:` = messages-2XnThXD9.js; `accounts:` = accounts-gVgPsqTs.js; `notif:` = notificationEntry-DgP70ptm.js; `comp19:` = composables-19O1xYoe.js; `compB:` = composables-B_Bz2Xc6.js; `fanCard:` = fanCardSettings-UahtlbOH.js; `fansOnline:` = fansOnlineEntry-C0AVLBRL.js; `of:` = onlyfans-3gv7h9YB.js; `inbox:` = inbox-BVcu4p6i.js; `index:` = index-UvX_bFdW.js; `omWin:` = omWindowApi-DwjTAZsN.js. Ключи локали пишутся как `namespace.key` (namespace = имя json-файла локали: accounts, app, automation, chatView, chats, collections, common, developerSettings, fans, gallery, message, messageTranslator, messages, mimic, notifications, platformError, postPreview, sendOfMessage, shared, sidePanel, transactions, translator, widgets). Пометка «(док)» — факт из документации OnlyMonster, а не из кода.

---

## 1. Главное для решения

1. **ChatSpace — веб-клиент OnlyMonster, рассчитанный на работу внутри OM Browser (их Electron-браузер).** В коде есть мост `window.OM_WINDOW` (omWin:1645): окна, вкладки, OS-уведомления хоста, панель виджетов. В обычном браузере часть функций отсутствует.
2. **В обычном браузере у этой организации нет правой карточки фана вообще.**
   - Новая side panel (вкладки Insights/Sales/Templates/Notes/Recap/AI) стоит за флагом `sith.cor-2363.side-panel`, а он для орг. 13709 выключен. При включённом флаге она показывается при ширине окна от 1020px.
   - Старая колонка виджетов — пустой `div[data-id=browser-widgets-column]` шириной 280px, его заполняет OM Browser. Колонка показывается, только если существует `window.OM_WINDOW`: тогда по состоянию хоста (`toggleWidgetsPanel`/`widgetsPanelOpen`), а без этого метода — при ширине окна от 1280px (ChatView:4298–4299, 4533–4590, 7593, 7718).
   - Документированные «Fan's Overview» и «Fan Notes» — виджеты OM Browser, а не веб-клиента.
3. **AI в ChatSpace:** (а) AI Suggestions — 10 системных стилей ответа + кастомные (своя модель через OpenRouter и свой промпт), результат по клику вставляется в поле ввода, не отправляется; (б) Mimic AI — автономный бот, который **сам пишет фану** (5 кредитов за сообщение (док)) и передаёт чат человеку; (в) переводчик исходящих (System/Custom, режим Native) и входящих; (г) Fan insights — Temperature/Reach/Focus и Buying Power 0–5; (д) Message Guard — блок отправки по словам и AI-темам. **Саммари фана, коучинга и «улучшить мой текст» нет.** Вкладка «Recap/Сводка» заведена в коде, но пустая.
4. **Auto-Generate (подсказка при открытии чата) клиент 0.167.0 не использует:** поле `auto_generate_reply` приходит в `/suggestions/.../toolbar`, но в коде не читается (messages:18103–18110).
5. **Онлайн-спендеры покрыты полностью:** попап Fans Online с серверным ранжированием по сумме трат, Buying Power и последней покупке, с быстрым ответом (fansOnline:9870–9930).
6. **Доски спендеров по тирам, пингов с анализом сегментов, приветствия новых подписчиков из чата нет.** Есть системный стиль «Bump» («возвращает тихий чат»), шаблоны, follow-up по таймеру (до 120 мин, отмена при ответе фана) и авто-кампании (Welcome/Online/Expired/Expiring Soon).
7. **Хоткеев почти нет:** Enter/Shift+Enter, Tab и «/» (шаблоны), Alt+S (переводчик), Ctrl+Tab/Ctrl+Shift+Tab (вкладки чатов), Esc (закрыть вкладку), Cmd/Ctrl+клик (чат в новой вкладке). Для AI-кнопок горячих клавиш нет.
8. **Платформы:** UI показывает только `onlyfans` и `telegram_v2` (accounts:2087). Fansly-аккаунты организации в ChatSpace скрыты. Telegram — ранняя версия: текстовый composer без локализации (ChatView:6861).
9. **Точка встраивания для нашего расширения:** в composer всегда есть `div[data-id=browser-composer-translator]`, а на нём объект `__omComposerBridge` с методами `setText`, `insertText`, `focus` и `insertMessage` (messages:14436–14462, 14800–14830). Это готовый мост для вставки текста из MAIN-world, без хаков с ProseMirror.
10. **Аналитика за спиной чаттера:** каждое сообщение уходит с флагами `is_copied`, `is_ai_generated`, `internal_template_id` и `previous_message` (notif:1346–1356). На их основе OnlyMonster считает Team Metrics.

---

## 2. Перечень функций по разделам

### 2.1 Аккаунты, вкладки, окна

| Функция | Что делает | Где |
|---|---|---|
| Accounts Overview (стартовая `/`) | Сетка аккаунтов, нечёткий поиск по имени, username, custom label, ID; кнопка «Open all» (открыть все из фильтра); метка «Opened»; «Start Chatting» | AccountsOverviewView:83–110; `accounts.overview.*` |
| Открыть в новом окне | Только при `OM_WINDOW.openNewWindow` (OM Browser); в браузере кнопки нет | AccountsOverviewView:86–88; MainLayout:320–327 |
| Вкладки аккаунтов (левый сайдбар) | Несколько креаторов одновременно, бейджи непрочитанных сообщений и уведомлений (99+), «+ Open new tab»; WS подписка на каждый открытый аккаунт | accounts:9029 (AccountTabSideBar), 9280–9350; `accounts.accountTabs.openNewTab` |
| Дропдаун аккаунта | ID, заметка аккаунта (Account Notes), «Close Session» (закрыть аккаунт) | accounts:4038 (AccountDropdown); `accounts.accountDropdown.*` |
| Шапка аккаунта над списком | Аватар креатора с кольцом сторис, просмотр своих сторис (`/users/{platformAccountId}/stories`) | ChatView:3506–3533, 3966, 5451–5458; `chatView.accountSummary.openStories` |
| Вкладки чатов | Несколько чатов одного аккаунта как вкладки, счётчик новых сообщений на фоновых вкладках, перетаскивание, сохраняются между перезагрузками (`chat-space:chat-tabs`) | accounts:8478–8560, 935 (OmChatTabBar), 8742 (ChatTabBar) |
| Чат в новой вкладке | Из списка, уведомлений, Fans Online, коллекций; Cmd/Ctrl+клик | ChatView:5359; `chats.rowActions.chatInNewTab` |
| Хоткеи вкладок | Ctrl+Tab / Ctrl+Shift+Tab — переключение, Esc — закрыть активную | MainLayout:330–334 |
| Заголовок окна (Electron) | Свернуть/развернуть/закрыть — только в OM Browser | MainLayout:262 (WindowControls) |
| Баннеры | «Доступна новая версия ChatSpace» + Reload; «Соединение потеряно» + Reconnect; виджет статуса ilert | MainLayout:80, 188; `app.appUpdate.*`, `app.connectionStatus.*` |

### 2.2 Инбокс / список чатов

| Функция | Что делает | Где |
|---|---|---|
| Табы-фильтры | All / Pinned / Priority / Unread / With Tips со счётчиками (`/chats/counts`), плюс закреплённые списки OF как табы | ChatView:4589–4600, 7600–7625; `chatView.filterTabs.*` |
| Закреплённые списки | Диалог «Pinned Lists»: какие списки OF показывать табами (возможность `edits_pinned_chat_lists`) | ChatView:7526 (PinnedListsDialog), 4078 |
| Блок списков | Показать все / свернуть, ресайз высоты | ChatView:4615 (ChatListToolbar); `chatView.chatsPanel.showAllLists/collapseLists/listsResizeHandle` |
| Сортировка | Newest First / Oldest First (серверная, `order=old`) | ChatView:4831 (ChatOrderList); accounts:6670 |
| Поиск | По имени и username (сервер, `query`); вставка ссылки на чат OnlyFans открывает этот чат | ChatView:4121, 5283–5290; `chatView.search.chatsPlaceholder` «Search chat or paste link» |
| Скрытые чаты (клиентский фильтр) | Hide Creators With No Spend (по умолчанию включено), Hide Muted, Hide Restricted | inbox:104–135; `chats.hiddenChatsFilters.*` |
| Inboxes (разделение чатов) | Фильтр списка по «инбоксам» (= chat color groups: номер+цвет); у фана свой инбокс; включается на аккаунте | notif:19935–20000 (InboxFilterButton), 20160–20330; `chats.inboxFilter.*` |
| Закрепление чатов (ChatSpace) | Pin/Unpin в меню строки, закреплённые наверху. **Хранится локально в браузере** (`chat-space:pinned-chats:{userId}`), не синхронизируется ни с OF, ни между чаттерами. Не путать с табом «Pinned» — это нативный фильтр OF (`filter=pinned`) | accounts:6182–6184, 6869–6895; ChatView:5325–5326 |
| Пометить прочитанным/непрочитанным | Mark as unread в строке и в шапке фана (`DELETE …/mark-as-read`). При открытии чат сразу становится прочитанным в списке (кэш клиента). Явной отметки на OF клиент для OnlyFans не шлёт (возможность `marks_chat_read_on_open` есть только у Telegram); вероятно, её делает сервер при загрузке сообщений — не проверено | accounts:6405–6440, 6474–6480; ChatView:7225 |
| Mark all chats as read | Для текущего таба/списка, с подтверждением; при слишком большом числе — «Too many unread chats» | accounts:6139, 6568–6575; `chats.markAllAsRead.*` |
| Действия строки | Чат / Чат в новой вкладке / Quick Reply / Pin / ещё: Copy Profile Link, Copy Chat Link, Clear Chat, Hide Chat, Restrict | accounts:7714 (OfChatRowActionsMenu), 7484; `chats.rowActions.*`, `fans.profileActions.*` |
| Quick Reply из списка | Ответить фану без открытия чата | `chats.rowActions.quickReply` |
| Hide / Clear chat | Hide — скрыть чат на OF; Clear — удалить переписку (`DELETE /chats/{fan}`); нужен `of_chat_blocking_hiding` | accounts:6598–6603, 6900–6906, 7426 |
| Индикаторы в строке | typing, черновик («Draft:»), «[Locked Message]», «[Media Attachment]», галочки отправлено/прочитано, «Fan replied. Waiting for you.» (нужен ответ), бейджи Expired / Message Restricted / Muted, подписка (активна / не продлевается / истекла), New fan (≤14 дней), Last spend (дни с последнего платежа), эмодзи-метки списков, имена списков, Buying Power, Temperature-кольцо, Reach, Focus, кольцо Mimic, таймер чата, номер инбокса, онлайн-точка | accounts:4168–5800; `chats.listItem.*`, `chats.statusBadge.*`, `chats.subscriptionStatus.*` |
| Аватар | Режимы: Total Spend (по умолчанию для OF) / Photo / Last Spend / Photo/Spend | fanCard:2544–2551; `widgets.fanCardSettings.avatarModes.*` |
| Настройка вида списка | 14 переключателей (Buying Power, Temperature, Reach, Focus, Fan Lists, List Labels, Inbox, Last Spend, Mimic Ring, New Fan, Online, Reply Needed, Subscription, Username) + лимит показа списков/меток; хранится локально на пользователя и аккаунт | fanCard:2453–2620, 3003 (FanCardSettingsDialog) |
| Списки фана из строки | Добавить или убрать фана из списков OF (звёздочка, поиск по спискам) | notif:21035 (ChatListMembershipStar), 21342; `chats.lists.*` |
| Подсветка новых входящих, ресайз панели, «Keep looking» | Догрузка страниц при фильтрации (по 10 чатов на запрос) | accounts:6641–6700; `chatView.chatsPanel.filterStillLooking/keepLooking` |

### 2.3 Окно чата

| Функция | Что делает | Где |
|---|---|---|
| Шапка фана | Имя, custom name + эмодзи (редактирование прямо в шапке), заметка OF во всплывающей подсказке, онлайн / «был недавно / на неделе / в месяце» | ChatView:6226 (ConversationHeader); accounts:7297 (PATCH `fan_custom_name`); `widgets.conversationHeader.*` |
| Кнопки шапки | Поиск по сообщениям, закреплённые сообщения, галерея чата, обновить чат, открыть в новой вкладке, показать/скрыть панель виджетов, mute (нужен `of_mute_chats`) | ChatView:6090–6226 |
| Follow / Unfollow | Аккаунт подписывается на фана (OF follow) | accounts:7352–7368, 7860; `fans.subscribe.*` |
| Restrict / Unrestrict, Hide, Clear, ссылки | Меню действий профиля | accounts:7484–7540 |
| Поиск по чату | Серверный, 3–100 символов, переход к старшему/младшему совпадению с якорем | ChatView:4310–4340, 6735; `chatView.search.*` |
| Ссылка на сообщение | «Copy Message Link» → переход прямо к сообщению | of:1315; `messages.messageActions.copyLink` |
| Галерея чата | Фильтры All / Unlocked / Purchased / Photo / Video / GIF / Audio / From Creator / From Fan, группировка по сообщениям, «Go to message» | ChatGalleryDialog:215, 242, 502; `gallery.*` |
| Закреплённые сообщения | Список, открепление с подтверждением | messages:21341; `messages.pinnedDialog.*` |
| Действия с сообщением | Like, Reply (цитата), Translate, Copy text, Copy message (с медиа, для вставки в другой чат), Copy link, Insert (своё сообщение снова в composer), Pin, Hide (входящее), Report (с причинами OF), Unsend | of:1283–1350 |
| Окно Unsend | Без права `of_unsend_messages` — только своё сообщение в течение 60 с; с правом — любое в течение 24 ч | of:1282–1283, 1360–1372 |
| Отображение сообщений | Чаевые (сумма + текст), PPV: заблокированные медиа (счётчики, «Unlock for $»), Paid / Not Paid Yet / Not Paid, обработка медиа, GIF, голосовые, ответы на сторис, теги соавторов (с копированием), цитаты | comp19:86709–89383; `message.*` |
| DRM-видео | Воспроизведение защищённых видео OF (Widevine/FairPlay, лицензия через OM API) | of:200–250 |
| Отправитель сообщения | «Sent by {чаттер}» или источник: OM Auto Message Campaign / OM Mass Message Campaign / Mimic AI / OM Scheduled Message; нужно `of_view_message_sender` | of:1402–1420, 1514–1520; `messages.senderOrigin.*` |
| Отозванные (unsent) и удалённые сообщения | Показ «Message was Unsent», «Unsent by {кто}», «Show media (N)» за последние 30 дней; удалённые фаном сообщения не пропадают; нужен `om_chatter_metrics` + настройка «Unsent messages» | of:1660–1700; messages:5472–5485, 21255–21268 |
| Очередь отправки | До 50 сообщений в очереди на чат; Failed to send / Send timed out / Mimic took over; Resend, Cancel | notif:1426–1560; `message.queue.*` |
| Блокировка Message Guard | «Message blocked. Contains restricted word(s)… / Contains {topics} context.» | notif:1306–1345, 1513 |
| Превью поста | Пост из уведомления или кампании: медиа, лайки, чаевые, заблокированный текст | of:311, 335; `postPreview.*` |
| Typing фана, «Back to latest», даты | Индикатор набора (WS `account_fan_typing`), прокрутка к последним | messages:20827, 20867 |
| Недоступный чат | «Chat is unavailable», «Your role can’t send messages» (роль с `of_block_message_sending`), «Messaging with this fan is restricted» | ChatView:6920–6935 |

### 2.4 Composer (поле ввода)

Редактор TipTap (ProseMirror). Плейсхолдер: «Type a message or press “/” to search templates».

| Функция | Что делает | Где |
|---|---|---|
| Верхняя полоса | Быстрые эмодзи (панель), кнопки AI-стилей (+ меню «More AI styles»), слот переводчика, таймер чата, Mimic, кнопка Templates | messages:14738–14860 (ComposerTopStrip) |
| Эмодзи и каомодзи | Пикер эмодзи; вкладка Kaomoji с группами (Happy, Love, Flirty and shy…) и личным списком «My kaomoji» | EmojiPicker:5274, 5477; `shared.emojiPicker.*` |
| Панель эмодзи (hotbar) | Свои эмодзи: добавить, удалить, переставить; по умолчанию берётся список аккаунта (Custom Emoji Bar) | notif:19765, 19882–19905; `accounts.emojiHotbar.*` |
| Шаблоны | Панель Message Templates: папки, поиск по папкам и тексту, «/» в поле ввода и Tab; Insert или Send сразу; медиа в шаблоне (слайдшоу видео); переменные Liquid `{{name}}`, `{{displayName}}`; создание и редактирование в iframe Control Panel (`om_edit_message_hub_templates`) | messages:9936, 11462, 14190, 14268, 18768, 18830–18870; `automation.templates.*` |
| Vault | Открыть хранилище и вставить медиа | messages:18876–18893 (`vault`) |
| Загрузка с устройства | Файлы, перетаскивание, вставка из буфера; до 40 файлов, 1 аудио, 4 ГБ; нужен `om_view_media_uploader` или `om_upload_media_hub` | messages:17346–17353, 17687, 18678 |
| Голосовое | Запись с микрофона → аудио-вложение | messages:16966, 18712–18735; `sendOfMessage.voiceRecorder.*` |
| GIF | Поиск GIF (Giphy через OF), избранное | messages:5696, 5749; `sendOfMessage.gifPicker.*` |
| Цена PPV | $3–200 или Free, с копейками; платные и бесплатные медиа (превью) в одном сообщении, перенос между зонами; «Lock text behind paywall» | messages:15585–15610, 16320, 16498; `sendOfMessage.priceModal.*`, `mediaSplit.*` |
| Упоминания | Отметка соавторов (Tag Other Creators); авто-теги из release forms медиа vault | messages:15212, 15475, 18361 |
| Форматирование | Жирный, курсив, 5 размеров шрифта, цвета (Default / Blue / Sky blue / Gray), очистка | messages:14957, 15043; `sendOfMessage.formattingToolbar.*` |
| Ответ на сообщение | Плашка цитаты над полем | messages:16683 |
| Копия сообщения между чатами | «Copy message» → плашка «Insert message» в любом другом чате | messages:19699; `sendOfMessage.copiedMessage.*` |
| Редакторы медиа | Фото и видео из вложений (см. 2.5); результат загружается как новый файл | messages:17833–17836, MT |
| Черновики | Автосохранение на чат (`chat-space:draft:{acc}:{fan}`), индикатор в списке | comp19:89493 |
| Отправка | Enter — отправить, Shift+Enter — новая строка; кнопка Clear; typing-сигнал фану | messages:1627, 15419, 18339 |
| Follow-up | Запланировать сообщение через 1/5/15/30/60/120 мин или своё время (1–120), «Cancel if a new Message Received» (по умолчанию включено), очередь с обратным отсчётом, Cancel / Insert / Send now, свои пресеты. Нельзя: ответы-цитаты, GIF, незагруженные файлы, неполный PPV | messages:4550–4745, 5199; серверный `POST /scheduled-messages` |
| Таймер чата | Напоминание на чат: пресеты 1/5/15/30/60 мин, свои пресеты, случайное время в диапазоне, секунды; по истечении — OS-уведомление «Time’s Up». Хранится локально | messages:3919–4016, 4362 |
| Переводчик исходящих | См. 3.3; Alt+S включает/выключает | messages:18281 |

### 2.5 Медиа, Vault, коллекции, редакторы

| Функция | Что делает | Где |
|---|---|---|
| Vault OnlyFans | Папки (сортировка, поиск, превью до 3 файлов), All Media, обновление с OF | comp19:73745 (MediaSidebar), 73826–73918 |
| Поиск в vault | Режимы: «Tags & Description» и **«Image Content» (поиск по содержимому картинки)** | comp19:70913–70916 |
| Фильтры и сортировка | По дате публикации, длине видео (<1, 1–5, 5–10, >10 мин), заблокированные медиа; сортировка Recent / Most Liked / Highest Tips, по возрастанию/убыванию | comp19:70917–70947, 72924, 74051, 74100 |
| **Статус медиа по фану** | Для открытого чата: Paid / Unpaid / Free / Not Sent, цена, когда отправлено и куплено — фильтр «Media Status» | comp19:71780–71800, 73582–73596 |
| Синхронизация статусов | «Labeling Gallery... Please wait.» и время последней синхронизации | comp19:71893–71900, 74502–74516 |
| Метаданные медиа | Описание, теги, **Recommended Price** («цена-подсказка чаттеру»), дата публикации; массовое редактирование и очистка; копирование описания | comp19:72077–72884, 73042 |
| Просмотр | Полноэкранный просмотр, видеоплеер с перемоткой, блюр-раскрытие | comp19:74181 (MediaViewerModal), 75062 |
| Media Hub (legacy) | Облачное хранилище OM (вкладка «Media Hub») | comp19:71061–71140, 71474 |
| Фоторедактор | Поворот, свободная обрезка, отражение, блюр, эмодзи-наклейки, фильтры (Original / Vivid / Soft / Mono), яркость / контраст / насыщенность, undo/redo; нужен `om_chatspace_edit_photos` | PhotoEditorModal:421; PhotoEditorAnchoredPanel:9265; `accounts.photoEditor.*` |
| Видеоредактор | Обрезка начала и конца, звук, экспорт с прогрессом | VideoEditorModal:8969; `accounts.videoEditor.*` |
| Collections (списки OF) | Списки аккаунта и их пользователи: колонки User / Inbox / List / Subscription / Total Spent; эмодзи-метка списка; очистить или удалить список; из строки — открыть чат, новая вкладка, quick reply | OfCollectionsDialog:1329–2200; `collections.*` |

### 2.6 Карточка фана и side panel

**Для орг. 13709 в браузере ничего из этого раздела не видно** (см. 1.2).

Новая side panel (флаг `sith.cor-2363.side-panel`, ChatView:2803–2860, 3047, 3075, 7718):

| Вкладка | Виджеты | Что внутри |
|---|---|---|
| Insights / «Инсайты» | Spending | Total Spend, Last Payment (когда, тип, сумма), таблица PPV / Tips / Subscription (среднее, сумма), Buying Power (5 уровней), Highest Spend, **Chargeback Risk** (Low / Medium / High с советом: «medium — PPV можно, на крупные кастомы брать предоплату»), охват Account / Organization (траты фана у всех креаторов агентства) — ChatView:1195–1260, 1314, 1552; `fans.spending.*` |
| | Preferences | Теги интересов фана из общего словаря агентства + свои — ChatView:830, 893, 1070; `sidePanel.preferences.*` |
| | Lists | Списки OF, в которых фан — ChatView:1626 |
| | Profile | День рождения и возраст (+ знак зодиака), страна и регион, время фана (утро/день/вечер/ночь) и аккаунта, Last Response, Last Read, инбокс (назначение — `om_assign_color_chat_group`), Traffic Source — ChatView:2129–2778; `sidePanel.profile.*`; API `GET/PATCH /fans/{fan}/info` (ChatView:815, 852) |
| | Subscription | Статус, цена, с какого числа, автопродление, окончание — ChatView:2792; `sidePanel.subscription.*` |
| Sales, Templates, Notes, Recap («Сводка»), AI | **виджетов нет** | Вкладки объявлены (ChatView:2808–2815), но для них нет ни одного виджета (`Cs` только с `tab: insights`, ChatView:2816–2822). Это заготовки дорожной карты |

Старая колонка: `div[data-id=browser-widgets-column]` 280px, пустая (ChatView:7591–7597). Её заполняет OM Browser нативными виджетами «Fan's Overview» и «Fan Notes» (док: chatspace.md «Side Panel»).

Без панели в вебе остаются: custom name, заметка OF в подсказке, статус подписки, списки, Buying Power, Temperature/Reach/Focus, Last Spend и Total Spend на аватаре в списке чатов.

### 2.7 Fans Online

| Функция | Где |
|---|---|
| Попап «Fans Online» со списком онлайн-фанов, отранжированным сервером (`/analytics/fans/online-ranked`) | fansOnline:9902, 10285 |
| Сортировка: Spent (траты на аккаунте), Buying Power, Last Purchase | fansOnline:9870 |
| Колонки: Inbox, Fans, List Labels (эмодзи списков), Buying Power, Spent, Last Purchase | `fans.online.*` |
| Quick reply прямо из строки, открыть чат, новая вкладка, обновить | fansOnline:9955, 9979 |

### 2.8 Transactions

Попап транзакций аккаунта (`/platforms/onlyfans/transactions`): колонки Date & Time, Amount, Net, Description, Inbox; пометка Chargeback; местное время с UTC-сдвигом; переход в чат. Нужно право `of_statements` (ChatView:3602, 3658, 3912–3918; `transactions.*`).

### 2.9 Кампании и рассылки

| Функция | Что делает | Где |
|---|---|---|
| Попап Campaigns | Вкладки OF Mass Messages / Priority Messages / Auto Messages; колонки Message, Status, Created by, Created at, Sent, Price; 13 статусов | messages:13520–14079; `automation.campaigns.*` |
| Создание | Mass: OF Mass (общий инбокс фана), Priority (приоритетный инбокс). Auto: Welcome, Online, Expired, Expiring Soon. Форма — встроенный iframe Control Panel (`/panel/...?embed=chat-space`) | messages:11773–11830, 12094–12400 |
| Управление | Unsend, Cancel & Unsend (авто, флаг AM_CANCEL_UNSEND; только за последние 24 ч), Resume / Stop / Activate / Pause / Archive, Duplicate as a Draft; авто-архив через 7 дней после остановки | messages:12448–12545, 12892 |
| Подстановки | Custom Name, Fan’s Name и фолбэки между ними | `automation.campaigns.messageTags.*` |
| «Handled by Mimic» | Пометка кампаний, где Mimic стартует из авто-сообщения | `automation.campaigns.handledByMimic` |
| Права | Просмотр `om_view_*` и создание `om_edit_*` раздельно для OF Mass, Priority и Auto | messages:11791–11798 |

### 2.10 Уведомления

| Функция | Что делает | Где |
|---|---|---|
| Центр уведомлений (колокольчик) | Уведомления OF: All / Subscribed / Tips / Purchases / Comments / Mentions / Favorites / Messages / Deactivated media со счётчиками; открыть пост; перейти к сообщению о покупке | notif:21679, 21850–21950, 22673; `notifications.*` |
| Quick reply из уведомления | Ответ прямо в попапе (автофокус) | notif:22143, 22225 |
| **Кто уже ответил** | «You replied 5m ago» / «{чаттер} replied» — ответ отмечается на сервере (`PUT /platform/notifications/{id}`), видно всей команде | notif:21714–21840 |
| Списки фана из уведомления | Посмотреть и быстро добавить фана в список | notif:20434 (NotificationItem), 21410 |
| OS-уведомления (браузер) | Новое сообщение, покупка PPV, чаевые, эскалация Mimic, таймер чата; клик открывает чат; авто-закрытие через 5 с. Не уведомляют: заглушённые чаты, исходящие и чат, открытый в этой или другой вкладке (координация вкладок через BroadcastChannel) | messages:3600–3645, 3640–3912; notifications-sw.js |
| Баннер разрешения | «Turn on notifications so you don't miss new messages» | messages:3514 |
| Ограничения | Web Push нет: в service worker только клик, `TODO: Web Push` (notifications-sw.js:1). Своих звуков нет — только системный звук ОС | notifications-sw.js |

### 2.11 Командная работа

| Функция | Что делает | Где |
|---|---|---|
| Sender logs | Кто из команды отправил каждое исходящее (или кампания / Mimic / отложенное) | of:1402–1420; право `of_view_message_sender` |
| Unsent logs | Кто и что отозвал (люди), за 30 дней, с медиа | of:1660–1700; `om_chatter_metrics` |
| Удалённые сообщения | Видны менеджерам (переключатель show/hide) | messages:21255–21268 |
| Inboxes | Разделение фанов по пронумерованным цветным группам (под разных чаттеров), фильтр списка | notif:19935–20330 |
| «Кто ответил» в уведомлениях | Против двойных ответов | notif:21714–21840 |
| Атрибуция для метрик | `is_copied`, `is_ai_generated`, `internal_template_id`, `previous_message` на каждом сообщении | notif:1346–1356; messages:17975–17985 |
| Права в реальном времени | WS `org_user_permissions_updated` → перечитать права; `org_user_access_revoked` → очистить права и перезагрузить страницу (так работает доступ только в смену) | comp19:86375–86398; accounts:9338–9339 |
| Владелец | `isOwner` — бит 1 в `public_metadata.permissions` JWT; владельцу не мешает `of_block_message_sending` | comp19:86357–86368; ChatView:6924–6927 |
| Смены, Clock-in, Team Metrics | В ChatSpace UI нет — это Control Panel / OM Browser (флаги `sith.cor-1013.clock-in`, `jawas.ot-1154.chatter-metrics`) | — |

### 2.12 Настройки, внешний вид, SFW, язык

| Функция | Что делает | Где |
|---|---|---|
| Меню Settings | Appearance, Chat List View, Language (при MULTI_LANGUAGE_UI), Copy Session Log (диагностика) | compB:394–480 |
| Appearance | Тема Dark / Light / System; аватар фана у сообщений; хранить отозванные сообщения; размер сообщений Compact / Default / Large; сила блюра SFW (6 ступеней) и что блюрить (всё / медиа креатора / медиа фана); цвета исходящих, входящих, бейджей; фон чата Classic / Gradient / Monster / Autumn / Spooky + тон (Gold / Steel / Indigo / Mint / Rust) | fanCard:2212; `widgets.chatAppearance.*` |
| SFW mode | Кнопка «SFW» в заголовке — размывает медиа | of:143–144, 173; `app.sfwMode.*` |
| Переключатель темы | В заголовке | fanCard:1409 |
| Язык интерфейса | en / de / es / ru / uk («переводы ещё шлифуются»); без флага всегда en | comp19:84932–84990; compB:319 |
| Developer settings | Переопределение флагов — в прод-сборке заглушка | compB:196; fanCard:1331–1336 |
| Мобильная заглушка | «ChatSpace isn't available on this device», если роли выдано `om_block_chatspace_mobile` | index:1995–2006; compB:162 |

---

## 3. AI детально

### 3.1 AI Suggestions (подсказки ответов)

- **Где:** кнопки-стили в верхней полосе composer, лишние — в меню «More AI styles» (messages:14515–14670). Нужно право `om_ai_assistant_buttons` («AI Replies» (док)) (messages:18680).
- **Новый режим** (флаг `droidz.ai-1353.NEW-ai-replies`, включён): `GET /api/v0/suggestions/accounts/{acc}/toolbar` → `{suggestions_enabled, replies:[{id,name}], auto_generate_reply}`; по клику `POST /suggestions/accounts/{acc}/chats/{fan}/generate {reply_id}` → `{text}` (messages:18094–18132). Контекст переписки собирает сервер. Без входящего от фана — 400 «This chat has no fan message to generate from». Ответ занимает около 10 с.
- **Системные replies (10):** Engage — втянуть в разговор; Bump — вернуть тихий чат; Innocent — мило и застенчиво; Bullet — быстрый флирт; Quick Reply — держать темп; Spicy — больше флирта; PPV — перевести в продажу; Playful — дразнить; Question — разжечь любопытство; Upsell — подвести к покупке (док ai-suggestions). У системных ответов фиксированы промпт и модель, настраивается только стиль письма.
- **Кастомные replies** (док custom-replies, connecting-replies): своя модель через AI Gateway (только OpenRouter, reasoning всегда выключен), System Prompt + User Message с переменными `{chatHistory}` (обязательна) и `{lastFanMessage}`, пост-обработка «No Dots Before Emojis», стиль и привычки печати. Режим аккаунта System Mode (все системные) или Custom (выбор и порядок кнопок). Раздел Analytics по использованию.
- **Старый режим** (без флага): `GET /api/creators/{platformAccountId}/ai-assistant` → кнопки; `POST /api/creators/{id}/ai-assistant/buttons/{btn}` с последними 25 сообщениями в виде строк «Fan:/Creator:», `ai_provider:"v2"`; минимум 5 сообщений (или `minimum` кнопки), иначе тост «At least N messages are required» (messages:17987–18092).
- **Как результат попадает в composer** (messages:18690–18700): если текст в поле не менялся с момента клика — поле очищается и вставляется ответ; если пользователь успел что-то набрать — ответ вставляется в позицию курсора. Затем фокус. Текст запоминается (`trackAiGenerated`). Если отправленное сообщение совпадает с подсказкой хотя бы на 85% (сходство по биграммам), оно уходит с `is_ai_generated:true` (messages:17925–17985).
- **Auto-Generate** (док: подсказка при открытии чата, тратит кредиты) — **в клиенте 0.167.0 не реализован**: `auto_generate_reply` не читается (у орг. он `null`).
- **Отправка:** никогда не автоматическая.

### 3.2 Mimic AI (Copilot)

- **Что это** (док mimic-ai_*): автономный AI-чаттер. Ведёт ранние стадии разговора (Greetings → Small Talk → Flirting → Follow Up → Closing; для Welcome — стадия New Subscriber) и отдаёт чат человеку, когда фан готов платить. **Пишет фану сам**, первым, независимо от того, чьё последнее сообщение. 5 кредитов за отправленное сообщение; при балансе ниже 100 кредитов останавливается. Настройки в Control Panel: Persona, Tone of Voice (включая скорость печати), лимит активных сессий, Disclosure (уведомить фана, что это AI). Запуск вручную из чата или из Auto Messages (Online / Expiring / Expired / Welcome, а также «Start Mimic when fan replies»).
- **В ChatSpace** (inbox:180–400, 395–700; ChatView:3188–3530):
  - Кнопка «Mimic» в composer: `POST /api/v0/copilot/accounts/{acc}/chats/activation {fan_id, status:"enabled", actor_type:"user"}`; «Stop Mimic» — `status:"disabled", deactivation_reason:"manual"`.
  - Условия: платформа OF, `copilot/settings.is_active=true` (у орг. true) и право `om_view_copilot` (в доке «Start/Stop Mimic»). Плюс переключатель на аккаунте: у орг. сервер отвечает 400 «Mimic is disabled for account».
  - Состояния `enabled` / `disabled` / `escalated`. Эскалация бывает двух типов: `finish` — «Mimic AI warmed up this chat, take it from here», причины Ready to pay / Ready for more / Content request / Time is over / Goodbye sent; и `stop` — «Mimic AI stopped, take over this chat», причины Fan sent content / Fan sent a tip / Fact check / Human check / Technical issue / Offtop.
  - Пока Mimic ведёт чат, composer заблокирован: «Conversation is handled by Mimic AI — Manual messages can’t be sent while Mimic is working». Чужие сообщения в очереди получают «Mimic took over the chat».
  - Попап «Mimic AI Chats»: активные и эскалированные чаты с колонками Inbox / Fan / Status / Reason и кнопкой Stop. Кольцо на аватаре в списке. OS-уведомление «Mimic finished/stopped: {reason}».
  - Copilot settings: `mark_chat_unread_enabled=true` — эскалированный чат помечается непрочитанным по списку причин (ответ `/copilot/settings`).

### 3.3 Переводчик

- **Исходящие** (composer, messages:2645–3010, 18195–18330):
  - Режим **System**: `POST /api/v0/ts/translate-creative {text, targetLanguage, sourceLanguage?, creativityLevel: Default|Native, chatHistory}`. «Native — звучит как носитель» только для пар RU→EN, RU→CS, UK→EN, UK→CS, BG→EN, DE→EN, DE→FR, EN→DE, EN→FR, EN→ES, FR→DE (ответ `/ts/translator/profiles`).
  - Режим **Custom**: `POST /api/v0/ts/translate {translator_id, direction:OUTGOING, …}` — свой переводчик на LLM-пресете AI Gateway.
  - Что в коде есть, а в UI пока нет: третий уровень творчества `CREATIVE=3` (без строки локали) и тип переводчика `THIRD_PARTY=3` (messages:1913–1916) — вероятно, дорожная карта.
  - Auto-translate с превью (переводит при наборе, задержка ~1 с), «Send Translation», «Send original», определение языка, преобразования Lowercase / No Commas. Вкл/выкл — Alt+S. По умолчанию цель EN, творчество Native. Настройки хранятся локально на пользователя и аккаунт.
  - Контекст — последние 15 сообщений в виде «Fan:/Creator:» (messages:18145–18170).
  - Нужно право `om_message_translator`.
- **Профили переводчика** (`GET /api/v0/ts/translator/profiles`; ответ орг.):
  - системные «Incoming Default» и «Outgoing Default» — провайдер «Fast and accurate translation», 32 языка;
  - «Outgoing Native» — «Sounds like a native speaker», только перечисленные выше пары;
  - у каждого профиля есть `system_prompt`, `user_message`, `preset_id` (кастомные на AI Gateway) и пост-обработка `no_dots_before_emojis` / `no_dashes`.
  Конфиг аккаунта `GET /api/v0/ts/accounts/{acc}`: для входящих и исходящих задаются режим (1 = System), языки-источники и цели. Режимы System/Custom переключаются в виджете, если аккаунту назначен кастомный переводчик (messages:2911–2965).
- **Входящие:** Translate на отдельном сообщении и панель «Translate Chat» (From/To, Active, «Hide original text», пакетный перевод `/ts/translate-batch`) (messages:2998, 3200; `messageTranslator.*`).
- В OM Browser хост может встроить свой переводчик в слот `browser-composer-translator` (в доке — «Full page translator» справа).

### 3.4 Insights: Temperature, Reach, Focus, Buying Power, Chargeback

- **Fan insights:** `GET /api/v0/accounts/{acc}/fans/{fan}/insights` → `{temperature, reach, focus, generated_at}`, целые 0–100 (accounts:8370–8420). Запрашиваются пачками по 6 для видимых в списке фанов. Ответ 403 отключает функцию — вероятно, это право `om_view_chatspace_additional_fan_metrics` (в клиенте его нет, сервер отвечает 403).
  - **Temperature** — «насколько фан тёплый или холодный сейчас»: 4 уровня (≤25 — низкая, ≤50 — растёт, ≤75 — высокая, ≤100 — максимальная). Рисуется кольцом вокруг аватара.
  - **Reach** — «насколько широк круг фана»: на скольких креаторов он подписан, 6 уровней (≤17 — единицы … ≤100 — «extremely large number of creators»).
  - **Focus** — «насколько сосредоточено внимание фана»: 4 уровня от «spread wide» до «very small circle»; при ≥90 особая отметка (accounts:4243–4320, 4564).
  - Как считаются, в клиенте не видно — только готовые числа и `generated_at` (пакетный расчёт на сервере). Reach и Focus по смыслу требуют данных по многим креаторам, то есть по всей сети клиентов OnlyMonster (это вывод, не факт из кода).
- **Buying Power:** `GET /api/stats/platforms/onlyfans/buying_power?fan_ids=…` → 0–5, «OnlyMonster rating, updated automatically», «No data», если данных мало; право `om_buying_power` (accounts:7190–7240).
- **Chargeback Risk** (side panel): `GET /api/stats/platforms/{p}/fans/{fan}/chargeback_info` → Low / Medium / High с советом по предоплате (ChatView:1195–1210).
- **Spending scope Organization:** траты фана по всем креаторам агентства (ChatView:1240–1260).

### 3.5 Message Guard

Проверка перед отправкой на сервере. При блоке сервер отвечает кодом `MESSAGE_GUARD_VIOLATION`, клиент показывает найденные слова и темы: Double Meaning, Bestiality, Deviations, Direct Contact, Drugs, File Hosting, Financial Scamming, Hate Speech, Incest, Public Exposure, Real-world Meetup, Self-harm, Third-party Payment, Underage, Weapons sales, Off-Topic Risk (notif:1306–1345, 1513; флаги `droidz.ai-300.firewall`, `droidz.ai-450.message-guard-l2`).

### 3.6 Чего нет

- Саммари фана / сводки переписки (кроме пустой вкладки Recap).
- Коучинга и разбора чата.
- «Улучшить мой черновик» (единственное близкое — творческий перевод Native и преобразования Lowercase / No Commas).
- Скоринга «кого пинговать» и анализа сегментов (есть только Fans Online и стиль Bump).
- В бандлах нет слов coach, rewrite, improve, sentiment, persona: проверено поиском по прикладным файлам.

### 3.7 Отправляет ли AI сообщения фанам сам?

- **Да — только Mimic AI** (автономно, за кредиты, с передачей человеку).
- AI Suggestions — нет: только вставка в поле.
- Переводчик — нет: меняет текст перед отправкой, но кнопку нажимает человек.
- Follow-up и кампании отправляются по расписанию, но создаёт их человек.

---

## 4. Unleash-тоглы (дорожная карта OnlyMonster)

Ответ `/api/frontend?appName=chat-space&…` одинаков во всех 17 снимках: 80 тоглов, все `enabled:true`, вариант везде `disabled` (A/B-вариантов нет). Frontend-API Unleash отдаёт только включённые для контекста (организация 13709) тоглы, выключенные в ответ не попадают. Ответ общий для всей платформы OnlyMonster (браузер, дашборд, Control Panel), а не только для ChatSpace.

Сам клиент ChatSpace читает ровно 6 флагов (fanCard:1312–1319):

| Константа | Флаг | Для орг. | Что переключает (место) |
|---|---|---|---|
| NEW_AI_REPLIES | `droidz.ai-1353.NEW-ai-replies` | вкл | Новый AI Suggestions вместо старого «AI Assistant buttons» — messages:18133 |
| AM_CANCEL_UNSEND | `jedi.omg-1990.am-cancel-unsend` | вкл | «Cancel & Unsend» для авто-кампаний — messages:12545 |
| MULTI_LANGUAGE_UI | `sith.cor-2336.multi-language-ui` | вкл | Выбор языка интерфейса (иначе всегда en) — compB:390 |
| FAN_INSIGHTS | `jawas.ot-1397.fan-insights` | вкл | Temperature/Reach/Focus в списке чатов и их настройки — fanCard:2588 |
| EMBED_CAMPAIGNS_CREATION | `sith.cor-2277.embed-campaigns-creation` | вкл | Создание кампаний прямо в ChatSpace — messages:13825 |
| SIDE_PANEL | `sith.cor-2363.side-panel` | **выкл (нет в ответе)** | Новая правая панель с вкладками Insights/Sales/Templates/Notes/Recap/AI — ChatView:7718 |

Команды по префиксам (вывод по составу тоглов и тикетов):
- **droidz** (тикеты AI-xxx) — AI-команда: шлюз, переводчик, ответы, Mimic, Message Guard.
- **jedi** (OMG-xxx) — рассылки и рост: авто-сообщения, PMM, последовательности, автопромо, Monster Club, экспорт.
- **sith** (COR-xxx) — ядро и браузер: ChatSpace, смены, прокси, переводчики, шаблоны, загрузчик, мульти-аккаунт.
- **jawas** (OT-xxx) — аналитика: Traffic Metrics, Accounts Overview, Team (Chatter) Metrics, bot detection, fan insights.
- **ewoks** (CN-xxx) — коннекторы платформ (Snapchat).
- **kill.*** — kill-switch / смоук-флаг.

| Флаг | Расшифровка (что за функция) |
|---|---|
| droidz.ai-1062.ai-gateway | AI Gateway — свои ключи OpenRouter и пресеты моделей (GA 13 авг) |
| droidz.ai-1103.ai-translator | LLM-переводчик (AI Translate) |
| droidz.ai-1125.mimic-overview | Mimic Overview — расход кредитов и сессии Mimic по аккаунтам |
| droidz.ai-1353.NEW-ai-replies | Новый AI Suggestions (системные + кастомные ответы) — используется ChatSpace |
| droidz.ai-1359.how-it-work | Онбординг «How it works» в AI-модулях (по названию) |
| droidz.ai-1375.beta-translator-native | Режим перевода Native, бета (в клиенте — `creativity: Default/Native`) |
| droidz.ai-1375.lingvanex-machine | Машинный движок Lingvanex для перевода |
| droidz.ai-1375.suggestions-beta-provider | Бета-провайдер генерации подсказок |
| droidz.ai-1411.l2-openrouter-fallback | Фолбэк L2 (контекстная проверка Message Guard) на OpenRouter (вывод по связке с ai-450) |
| droidz.ai-300.firewall | Message Guard («firewall»: запрещённые слова, блок сообщений; вебхук `firewall.message_guard.violation`) |
| droidz.ai-450.message-guard-l2 | Message Guard Context Detection (AI-проверка тем) |
| droidz.ai-568.copilot | Copilot = Mimic AI (эндпоинты `/api/v0/copilot/...`) |
| ewoks.cn-33.snapchat-platform | Платформа Snapchat (запуск 2 сен) |
| jawas.OT-904.new-subscribers-dashboard-widgets | Виджеты новых подписчиков на дашборде |
| jawas.ot-1.traffic-metrics | Traffic Metrics |
| jawas.ot-1047.accounts-overview-load-all | Accounts Overview: загрузка всех аккаунтов |
| jawas.ot-1106.campaign-initiator-user-id | Кто создал кампанию (колонка «Created by») |
| jawas.ot-1106.campaign-sale-type-classification | Классификация продаж по типу кампании (Sales Settings) |
| jawas.ot-1154.chatter-metrics | Chatter Metrics (с 30 сен — Team Metrics) |
| jawas.ot-1169.custom-metrics | Custom Metrics (свои формулы) |
| jawas.ot-1397.fan-insights | Fan insights (Temperature/Reach/Focus) — используется ChatSpace |
| jawas.ot-1419.bot-detection-link-limit-raised | Bot detection: поднят лимит ссылок |
| jawas.ot-1458.of-mass-message-metrics | Метрики OF Mass Messages (View / Unlock / Purchase Rate) |
| jawas.ot-1486.date-picker-text-entry | Ручной ввод даты в date picker (30 сен) |
| jawas.ot-192.accounts-overview-mvp | Accounts Overview (MVP) |
| jawas.ot-226.shared-reports | Shared Reports (Traffic Metrics) |
| jawas.ot-299.link-overview | Link Overview |
| jawas.ot-666.traffic-metrics-all-time-double-attribution | All Time + двойная атрибуция в Traffic Metrics |
| jawas.ot-795.bot-detection | Bot Detection в трафике |
| jawas.ot-816.dashboard_v2 | Новый Dashboard (GA 30 апр) |
| jawas.ot-831.customize-traffic-metrics | Настройка метрик Traffic Metrics |
| jawas.ot-976.accounts-overview-compare-to | Сравнение периодов в Accounts Overview |
| jawas.ot-976.accounts-overview-onlyfans-accounts | OF-аккаунты в Accounts Overview |
| jedi.omg-1272.sequences | Последовательности сообщений (Auto / Priority) |
| jedi.omg-1424.pmm-sequences | Последовательности в Priority Mass Messages |
| jedi.omg-1602.auto-promo | Auto-promo (автопродление промо) |
| jedi.omg-1719.data-export | Data Export |
| jedi.omg-1791.of-mass-messages | OF Mass Messages в Control Panel |
| jedi.omg-1889.am-pmm-dynamic-lists | Dynamic Fan Lists для AM/PMM |
| jedi.omg-1928.monster-club | Monster Club (партнёрские предложения) |
| jedi.omg-1936.am-mimic-ui | UI запуска Mimic из Auto Messages |
| jedi.omg-1947.am-edit-campaign | Редактирование активных авто-кампаний |
| jedi.omg-1971.am-expandable-rows | Раскрывающиеся строки в таблице AM |
| jedi.omg-1990.am-cancel-unsend | Cancel & Unsend авто-кампаний — используется ChatSpace |
| jedi.omg-1996.mimic-on-reply | Действие «Start Mimic AI when fan replies» (10 авг) |
| jedi.omg-2051.translate-message | Перевод отдельного сообщения |
| jedi.omg-2066.dynamic-lists-highlight | Подсветка динамических списков |
| jedi.omg-2089.datatable-column-memo | Запоминание колонок таблиц |
| jedi.omg-2108.auto-promo-fast-tick | Автопромо: применение за 2 мин (28 сен) |
| jedi.omg-2117.of-mm-duplicate | Дублирование OF Mass Message (25 сен) |
| kill.of-api-smoke.main | Kill-switch / смоук OF API |
| sith.COR-1625.validate-upload-url | Проверка URL загрузки |
| sith.cor-1013.clock-in | Clock-in (отметка начала смены) |
| sith.cor-1024.media-hub | Media Hub (облачное хранилище, legacy) |
| sith.cor-1024.priority-mass-messages | Priority Mass Messages |
| sith.cor-1111.proxy-debug-account | Отладка прокси аккаунта |
| sith.cor-1282.chatting-mode-tabs | Вкладки OnlyFans в Chatting Mode OM Browser |
| sith.cor-1362.periodic-creators-fetch | Периодический опрос креаторов |
| sith.cor-1385.chat-mimic-ai-copilot | Mimic AI в чатах OF-интерфейса |
| sith.cor-1439.fanvue_basic_permissions | Права для Fanvue |
| sith.cor-1460.of-message-tooltips | Тултип-превью сообщений OF (12 мар) |
| sith.cor-1473.tango-translator | Переводчик для Tango |
| sith.cor-1481.fansly-media-history | История медиа Fansly |
| sith.cor-1493.chat-space | ChatSpace (вход в продукт) |
| sith.cor-1519.proxy-of-req-api | Проксирование запросов OF API |
| sith.cor-1565.multi-account-browser | Мульти-аккаунтный браузер |
| sith.cor-1571.enable-fe-mg | Message Guard на фронтенде |
| sith.cor-1592.tango-inline-translator | Инлайн-переводчик Tango |
| sith.cor-1829.om-proxy-headers-main | Заголовки OM-прокси |
| sith.cor-1945.multigate-om-user-agent | User-Agent для multigate |
| sith.cor-2277.embed-campaigns-creation | Создание кампаний внутри ChatSpace — используется |
| sith.cor-2284.fansly-message-templates | Шаблоны сообщений для Fansly (27 авг) |
| sith.cor-2336.multi-language-ui | Многоязычный UI — используется |
| sith.cor-2506.native-spell-checker | Нативная проверка орфографии |
| sith.cor-567.message-tracker | Message Tracker |
| sith.cor-752.message-templates | Message Templates |
| sith.cor-839.api-access | Публичный API |
| sith.cor-938.app-version | Контроль версии приложения |
| sith.cor-970.of-uploader | Media Uploader для OF |
| sith.ot-848.enable-activity-log | Activity Log |
| *(нет в ответе)* sith.cor-2363.side-panel | Новая side panel ChatSpace — выключена для организации |

Что видно по дорожной карте:
- AI-команда активно строит переводчики (Native, Lingvanex, кастомные) и подсказки (бета-провайдер, кастомные ответы).
- ChatSpace пилят ежедневно: 0.105 → 0.167 за месяц (док changelog).
- Следующий шаг ChatSpace — side panel с вкладками Sales / Templates / Notes / **Recap** / **AI**, сейчас пустыми.
- В коде появляется Telegram v2 (`telegram_v2`).

---

## 5. Права (permissions)

`GET /api/user/permissions` → `{status, data:[179 строк]}`. Это права текущего пользователя (владелец, почти полный набор): `of_*` 31, `om_*` 64, `fansly_*` 38, `telegram_*` 25, `fanvue_*` 7, `snapchat_*` 14. Названия прав в бандле — только коды; человекочитаемые имена ниже даны по доке и смыслу.

### 5.1 Что проверяет сам клиент ChatSpace (24 кода, comp19:85207–85232)

| Код | Название (док/смысл) | Что даёт в ChatSpace | Где |
|---|---|---|---|
| `of_messages` | Messages | Менять статус прочитанности (mark as unread, mark all read), действия профиля | ChatView:4188; accounts:7502 |
| `of_block_message_sending` | (запрещающее) | Роль не может отправлять: «Your role can’t send messages» (владельцу не мешает) | ChatView:4258, 6927 |
| `of_chat_blocking_hiding` | Chat Hiding & Fan Blocking | Clear chat, Hide chat, Restrict, Hide/Report сообщения | accounts:6617, 7501, 7723; messages:20488 |
| `of_mute_chats` | Mute Chats | Mute/unmute в шапке | ChatView:6098 |
| `of_unsend_messages` | Unsend Message | Отзыв любого сообщения 24 ч (без права — только своё и 60 с) | messages:20487; of:1282–1283 |
| `of_view_message_sender` | View Message Sender | «Sent by …» под исходящими | of:1520 |
| `of_statements` | Statements | Попап Transactions | ChatView:3918 |
| `om_chatter_metrics` | Chatter (Team) Metrics | Отозванные и удалённые сообщения в истории, пункт настроек | compB:407; messages:5479, 20182, 21262 |
| `om_view_media_uploader`, `om_upload_media_hub` | Media Uploader | Загрузка с устройства и голосовые (достаточно любого) | messages:18678 |
| `om_view_of_mass_messages` / `om_edit_of_mass_messages` | OF Mass Messages View / Edit | Видеть и создавать OF-рассылки | messages:11791–11798 |
| `om_view_priority_mass_messages` / `om_edit_priority_mass_messages` | Priority MM View / Edit | То же для Priority | там же |
| `om_view_auto_messages` / `om_edit_auto_messages` | Auto Messages View / Edit | То же для Auto | там же |
| `om_buying_power` | Buying Power | Показ Buying Power | accounts:7200 |
| `om_block_chatspace_mobile` | (запрещающее) | Блок ChatSpace на телефоне | index:2000 |
| `om_ai_assistant_buttons` | AI Replies | AI-кнопки в composer | messages:18680 |
| `om_chatspace_edit_photos` | ChatSpace Edit Photos | Фото- и видеоредактор | messages:18679 |
| `om_view_copilot` | Start/Stop Mimic | Кнопки Mimic, попап Mimic | inbox:213, 377 |
| `om_message_translator` | Message Translator | Переводчик | messages:2012, 2886–2964 |
| `om_assign_color_chat_group` | Assign Color Chat Group | Назначать фану инбокс | ChatView:2342 |
| `om_edit_message_hub_templates` | Edit Templates | Создавать и редактировать шаблоны в чате | messages:11516 |

Проверяются сервером, но относятся к ChatSpace: `om_use_chatspace` (доступ к ChatSpace (док «Chat Space»)), `om_view_chatspace_additional_fan_metrics` (вероятно, Temperature/Reach/Focus — сервер отдаёт 403), `om_view_message_hub_templates` (шаблоны), `om_ai_assistant` (настройки AI Suggestions), `om_view_ai_gateway`, `om_edit_ai_gateway_keys`, `om_edit_ai_gateway_presets` (кастомные ответы и переводчики), `om_view_copilot_settings` / `om_edit_copilot` (настройки Mimic), `om_restricted_words` / `om_edit_restricted_words` (Message Guard), `om_spell_checker`.

### 5.2 Полный список кодов (179)

- **OnlyFans (`of_*`, 31):** help_tickets, promotions, statements, statements_earning_statistics, statistics, statistics_payout_requests, settings, settings_profile, bank, logout, my_profile, home, new_post, add_stories, streaming, queue, vault, vault_delete_media, add_new_media, media_download, collections, manage_friends_list, messages, notifications, mass_messages, unsend_messages, unsend_mass_messages, chat_blocking_hiding, mute_chats, view_message_sender, export_chat.
- **OnlyMonster (`om_*`, 64):**
  - агентство: agency_dashboard, agency_settings, billing, creators, creators_groups, assign_creators, creator_proxy_settings, creator_insights;
  - команда: members, edit_members, remove_members, roles, edit_roles, assign_roles, view_chatter_shifts, edit_chatter_shifts, chatter_metrics, view_transactions_chatter_metrics, edit_transactions_chatter_metrics, edit_custom_metrics, view_activity_logs, data_export;
  - трафик: tracking_links, view_traffic_metrics, edit_traffic_metrics, view_monster_club;
  - рассылки: mass_messages, view/edit_auto_messages, view/edit_priority_mass_messages, view/edit_of_mass_messages, view/edit_dynamic_fan_lists, auto_follow, auto_promotions, view_message_tracker;
  - контент: media_hub, upload/edit/delete_media_hub, view_media_uploader, chatspace_edit_photos;
  - шаблоны: view/edit_message_hub_templates;
  - AI: ai_assistant, ai_assistant_buttons, message_translator, view_glossary, edit_glossary, view_ai_gateway, edit_ai_gateway_keys, edit_ai_gateway_presets, view_copilot, view_copilot_settings, edit_copilot, spell_checker;
  - безопасность: restricted_words, edit_restricted_words;
  - ChatSpace: use_chatspace, view_chatspace_additional_fan_metrics, assign_color_chat_group, buying_power.
- **Fansly (38), Telegram (25), Fanvue (7), Snapchat (14)** — права OM Browser для этих платформ, в ChatSpace не используются (ответ API).

### 5.3 Чаттер против админа

| Возможность | Обычный чаттер (типовая роль) | Админ / владелец |
|---|---|---|
| Работа в ChatSpace | при `om_use_chatspace` (док) | да |
| Отправка | да, если роли не выдано `of_block_message_sending` | всегда (`isOwner` обходит блок) |
| Unsend | только своё и в течение 60 с | любое в течение 24 ч (`of_unsend_messages`) |
| Hide / Clear / Restrict / Report | нет без `of_chat_blocking_hiding` | да |
| Mute | нет без `of_mute_chats` | да |
| Видеть, кто отправил | нет без `of_view_message_sender` | да |
| Отозванные / удалённые в истории | нет без `om_chatter_metrics` | да |
| Транзакции | нет без `of_statements` | да |
| Загрузка с устройства, голосовые | **по умолчанию выключено** (док), нужен Media Uploader | да |
| Кампании | по отдельным view/edit-правам | да |
| AI-кнопки, переводчик, Mimic, Buying Power | по отдельным правам | да |
| Телефон | можно запретить (`om_block_chatspace_mobile`) | — |
| Только в смену | опция роли «Allow access only during active shifts» (док); по WS `org_user_access_revoked` страница перезагружается и доступ пропадает | — |
| Блок OF в обычном браузере | право «Disable OnlyFans Access via Browser» (25 сен (док)) — редирект на ChatSpace | — |

---

## 6. Мультиаккаунтность, вкладки, платформы, мобильная версия

- **Мультиаккаунтность:** несколько креаторов открыты одновременно во вкладках сайдбара, на каждый открытый аккаунт есть подписка WS, бейджи непрочитанного на всех. В каждом аккаунте — свои вкладки чатов. Accounts Overview: «Open all». Клиентского лимита на число открытых аккаунтов в коде нет (accounts:9280–9350, 8478–8560).
- **Окна:** «Open in new window» и режим отдельного окна — только в OM Browser (`OM_WINDOW.openNewWindow`, `isSecondaryWindow`) (AccountsOverviewView:86; comp19:89678).
- **Платформы в коде ChatSpace:** матрица возможностей (comp19:62702–62722):
  - `onlyfans`: fan_online_status, mimic, keeps_message_anchor_on_send, notification_center, sfw_blur, collections, transactions, campaigns, fans_online_widget, fan_lists, edits_pinned_chat_lists;
  - `telegram_v2`: fan_peer_status, notification_center, sfw_blur, assigns_chats_to_folders, marks_chat_read_on_open.
  - Список аккаунтов фильтруется по множеству `{onlyfans, telegram_v2}` (accounts:2087–2089). Fansly, Fanvue и Snapchat в ChatSpace не показываются, хотя API отдаёт Fansly-аккаунт организации.
  - Telegram v2 — ранний этап (ChatView:4898–5140, 6861–6900; accounts:8140–8170):
    - текстовый `textarea` без медиа, строки не переведены («Telegram message», «Message queue is full» — хардкод);
    - папки чатов, поиск по ссылкам t.me / web.telegram.org;
    - в локали под него уже есть ключи `chats.folders.*` («Add to folder»), `messages.telegramV2.reply` и типы контента voice / sticker / document (`messages.contentKind.*`).
    В доке ChatSpace — «только OnlyFans, другие платформы позже».
- **Fansly у OnlyMonster** живёт в OM Browser (интерфейс поверх fansly.com): с 24 сен там AI Suggestions, шаблоны, Fan's Overview, Buying Power, инбоксы (док changelog-2026), но не в ChatSpace.
- **Мобильная версия:** адаптивная вёрстка (несколько итераций «Improved mobile layout»), десятичные цены PPV на телефоне, iOS/Android-уведомления, пока вкладка открыта. Нет PWA-манифеста и нет Web Push в фоне (`TODO` в service worker). Роли можно запретить телефон (`om_block_chatspace_mobile`; мобильное устройство определяется по UA — comp19:63386–63391).
- **Язык UI:** en, de, es, ru, uk.

---

## 7. Соответствие с ChatGoose Desktop

| Наша функция | ChatSpace | Оценка | Комментарий |
|---|---|---|---|
| Подсказки ответов (AI Reply) | AI Suggestions: 10 системных стилей + кастомные на своей модели и своём промпте | **Покрывает** | Вставка в поле по клику, без автоотправки. Контекст строит сервер. Auto-Generate в ChatSpace не работает. Наших персон, legacy-промптов и вариантов нет |
| Улучшение текста (Improve, Split) | Нет. Близкое — творческий перевод «Native» для RU/UK→EN и Lowercase / No Commas | **Нет** (частично только для перевода) | Для русскоязычных чаттеров Native-перевод частично закрывает «писать как носитель» |
| Коучинг (Chat Review) | Нет. Есть менеджерская аналитика Team Metrics (вне ChatSpace) по флагам is_ai_generated / is_copied | **Нет** | — |
| Саммари фана | Нет AI-текста. Структурные данные: Fan's Overview (OM Browser), side panel Insights (выключена), Temperature/Reach/Focus, Buying Power, Chargeback Risk | **Частично** | Вкладка «Recap/Сводка» заведена и пуста — вероятный конкурент в будущем |
| Пинги и реактивация по шаблонам | Стиль «Bump», шаблоны (папки, «/», Liquid `{{name}}`), follow-up 1–120 мин с отменой при ответе, таймер чата, авто-кампании Online / Expired / Expiring, Mimic | **Частично** | Нет анализа сегментов, «кого пинговать», шаблонов реактивации по нашей методике и Hi-приветствия |
| Доска саппортеров / спендеров | Нет доски по тирам. Есть Fans Online (сортировка по тратам), Collections с Total Spent, аватар Total/Last Spend, Last Spend-бейдж | **Частично** | Нет тиров, дат «мы писали / фан писал», мини-чата и навигации J/K |
| Онлайн-спендеры | Fans Online: серверное ранжирование по Spent / Buying Power / Last Purchase, эмодзи списков, инбокс, quick reply | **Покрывает (шире)** | Плюс Buying Power и последняя покупка |
| Хоткеи | Enter, Shift+Enter, Tab и «/» (шаблоны), Alt+S, Ctrl+Tab, Esc, Cmd/Ctrl+клик | **Частично** | Нет хоткеев AI-действий (⌘E/I/G/P) и панелей (⌘⇧H/S/O/B/L/M) |
| Уведомления | OS (сообщение, PPV, чаевые, Mimic, таймер), центр уведомлений OF с фильтрами, quick reply, «кто ответил» | **Покрывает** | Нет своих звуков (у нас 8 тонов), нет фонового Web Push, нет уведомления о новом подписчике в OS |
| Новые подписчики (приветствие) | Авто-кампания Welcome и Mimic New Subscriber | **Частично** | Это автоматизация, а не очередь «встретить вручную» |
| Галерея и vault, PPV | Галерея с фильтрами, vault с поиском по картинке, статус медиа по фану, цена $3–200 | **Покрывает и шире** | Плюс DRM-видео, редакторы, загрузка с устройства |
| Fansly | Нет (только OF и ранний Telegram) | — | Нужен наш fansly-chat |

**Что ChatSpace делает, чего у нас нет:**
- Mimic AI — автономный AI-чаттер с эскалацией (отправляет сам, за кредиты).
- Переводчик исходящих и входящих: авто-перевод с превью, Native, кастомные LLM-переводчики, перевод всего чата.
- Message Guard — блок отправки по словам и AI-темам.
- Fan insights (Temperature / Reach / Focus — данные по сети), Buying Power 0–5, Chargeback Risk, траты фана по всему агентству.
- Командное: Inboxes (разделение фанов по чаттерам), «кто уже ответил» в уведомлениях, sender logs (включая Mimic и кампании), отозванные и удалённые сообщения для менеджеров, права в реальном времени и доступ по сменам.
- Кампании прямо из чата: OF Mass, Priority, Auto с unsend и дублированием.
- Шаблоны с папками и медиа, создание и правка прямо в чате; follow-up на сервере; таймеры чата.
- Vault: поиск по содержимому изображения, recommended price, массовые метаданные, статус медиа по фану, фото- и видеоредактор.
- Голосовые, GIF с избранным, каомодзи, панель эмодзи, форматирование и цвет текста, заблокированный текст, теги соавторов по release forms.
- Collections (управление списками OF с эмодзи-метками), транзакции с чарджбэками.
- SFW-блюр с настройкой, темы и фоны, 5 языков UI, мобильная вёрстка.

**Что есть у нас, а в ChatSpace нет:**
- Fan Summary, Chat Review (коучинг), Improve (+ Split), Hi Greeting.
- Ping с анализом сегментов и шаблонами реактивации.
- Доска спендеров по тирам с датами контакта и мини-чатом; очередь New Followers.
- Хоткеи AI и панелей, звуки уведомлений.
- Fansly в той же схеме (через расширение).

---

## 8. Точки встраивания для нашего расширения (по коду)

1. **Вставка текста:** `document.querySelector('[data-id="browser-composer-translator"]').__omComposerBridge` с методами:
   - `setText(text)` — очистить поле и вставить текст абзацем;
   - `insertText(text)` — вставить в позицию курсора с переносами строк;
   - `focus()`;
   - `insertMessage(msg)` — вставить сообщение целиком (текст, медиа, цена) через стор `ofComposerInsert`.
   Div рендерится всегда, не только в OM Browser (messages:14436–14462, 14800–14830). Работает из MAIN-world.
2. **Слот под наши виджеты:** колонка `browser-widgets-column` (280px) показывается, только если существует `window.OM_WINDOW`. С методами `toggleWidgetsPanel`/`onWidgetsPanelChange` колонкой управляет хост, а без них она открыта при ширине окна от 1280px (ChatView:4533–4590). Эмуляция `OM_WINDOW` из расширения (MAIN-world, document_start) возможна, но у неё есть побочный эффект: с `OM_WINDOW` клиент переключает OS-уведомления на `OM_WINDOW.showNotification` (messages:3800–3808, 3908–3911). Значит, придётся реализовать и этот метод, иначе уведомления деградируют в тосты. Это хрупкий путь, лучше свой оверлей.
3. **События:**
   - WS `wss://onlymonster.ai/api/chat-space/ws`: новые сообщения, typing, PPV, чаевые, эскалации Mimic, обновления шаблонов и инбоксов (полный список — приложение A);
   - REST с Clerk JWT (`window.Clerk.session.getToken()`) — те же эндпоинты, что у клиента (приложение B);
   - публичный API `omapi.onlymonster.ai` (`x-om-auth-token`): аккаунты, сообщения, отправка, транзакции, чарджбэки, подписки, vault, авто-кампании, tracking/trial links, участники;
   - вебхуки: chat.message, fans.ppv.purchased, fans.tip.received, fans.subscription.new_subscriber, message_guard, vault (док openapi / webhook).
4. **Риски:**
   - Атрибуция (messages:17925–17985, IT=0.85) работает так:
     - `is_ai_generated` — отправленный текст совпадает с их AI-подсказкой или похож на неё ≥85% (сходство по биграммам);
     - `internal_template_id` — текст похож на вставленный шаблон ≥85% или совпадают медиа;
     - `is_copied` — текст в точности равен вставленному через paste.
     Наш текст, вставленный через мост, сервер увидит как «ручной». Если чаттер вставит его из буфера — как `is_copied`.
   - Message Guard проверит и наш текст при отправке.
   - Эмуляция `OM_WINDOW` без `isEmbedded` покажет в шапке кнопки окна (свернуть/развернуть/закрыть), которые вызывают методы хоста (MainLayout:320–327).

---

## Приложение A. События WebSocket (comp19:86224–86262)

- Клиент отправляет: `ping`, `auth`, `subscribe_account`, `unsubscribe_account`.
- Сервер присылает:
  - `authenticated`;
  - аккаунт: `account_messages_summary`, `account_notifications_summary`, `account_new_message`, `account_message_deleted`, `account_fan_typing`, `account_fan_ppv_purchased`, `account_fan_tip_received`, `account_data_updated` (в т.ч. `user-notes`), `accounts_list_updated`;
  - отложенные: `account_scheduled_message_created`, `account_scheduled_message_cancelled`, `account_scheduled_message_sent`, `account_scheduled_message_failed`;
  - уведомления и доступ: `notification_reply`, `org_user_permissions_updated`, `org_user_access_revoked`;
  - шаблоны: `folder_created`, `folder_updated`, `folder_deleted`, `template_created`, `template_updated`, `template_deleted`, `template_sent`;
  - Mimic: `org_copilot_chat_changed`, `org_copilot_settings_updated`, `org_copilot_chat_escalation`;
  - инбоксы: `chat_color_group_created`, `chat_color_group_updated`, `chat_color_group_deleted`, `chat_color_groups_toggled`, `chat_color_groups_linked_fans`;
  - метки списков: `list_label_created`, `list_label_updated`, `list_label_deleted`.

## Приложение B. REST-эндпоинты клиента (база `https://onlymonster.ai/`)

- **Чаты:**
  - `api/v0/accounts`, `…/{acc}/chats` (filter, list_id, query, order, offset, force), `…/chats/counts`, `…/chats/badges`;
  - `…/chats/{fan}` (DELETE — clear), `…/chats/{fan}/messages` (GET/POST), `…/messages/{id}`, `…/messages/search`, `…/chats/{fan}/typing`, `…/chats/{fan}/fan-status`;
  - `…/platforms/onlyfans/chats/{fan}/mark-as-read` (DELETE — unread), `…/platforms/onlyfans/chats/mark-as-read` (все), `…/chats/{fan}/hide`, `…/chats/{fan}/mute`.
- **Фаны:** `…/platforms/onlyfans/fans`, `…/fans-online`, `…/users/{fan}` (PATCH custom name), `…/users/{fan}/restrict`, `…/users/{fan}/subscribe`, `…/users/{id}/stories`.
- **Списки и метки:** `…/platforms/onlyfans/lists`, `…/lists/{id}/users/{fan}`, `…/list-labels`.
- **Инбоксы:** `…/chat-color-groups`, `…/chat-color-groups/linked-fans`.
- **Сообщения OF:** `…/platforms/onlyfans/chats/{fan}/messages/{id}/like|pin|report`, `…/report/reasons`, `…/platforms/onlyfans/gifs`, `…/posts/{id}`, `api/v0/platforms/onlyfans/accounts/{pa}/medias/{id}/drm`, `…/medias/drm/certificate`.
- **Медиа:**
  - `…/platforms/onlyfans/medias/upload|hash`, `…/vault/uploads/start|finish`, `…/vault/medias/metadata`, `…/vault/tags`, `…/platforms/onlyfans/vault/media/release-forms`;
  - `api/v0/platforms/onlyfans/accounts/{pa}/vault/folders`, `…/vault/media/urls`, `…/fans/{fan}/medias/stats|sync-status`;
  - `api/media-hub/...`;
  - `…/platforms/onlyfans/chats/{fan}/media` (галерея).
- **Фан-аналитика:** `…/fans/{fan}/insights`, `…/fans/{fan}/info` (GET/PATCH), `api/agency/preferences`, `api/stats/platforms/onlyfans/buying_power`, `api/stats/accounts/{acc}/fans/transactions/latest`, `api/stats/platforms/{p}/fans/{fan}/chargeback_info`, `api/stats/organisations/{org}/platforms/{p}/…/transactions_info`, `…/analytics/fans/online-ranked`, `…/platforms/onlyfans/transactions`.
- **Командное:** `…/platform/onlyfans/logs/messages/senders`, `…/logs/mass-messages/senders`, `api/v0/organisations/{org}/platforms/onlyfans/logs/messages/unsent`, `api/v0/users`.
- **Уведомления:** `…/notifications`, `…/notifications/count`, `…/platform/notifications` (кто ответил), `…/platform/notifications/{id}` (PUT).
- **Отложенные:** `…/scheduled-messages`.
- **Кампании:** `…/of-mass-messages`, `…/of-mass-messages/{id}/unsend`, `…/priority-mass-messages/campaigns`, `…/auto-message-campaigns`, `…/auto-message-campaigns/{id}/status|unsend`, `api/v0/accounts/{auto-message-campaigns|priority-mass-messages/campaigns}/count`.
- **Шаблоны:** `api/v0/message-hub/accounts/{acc}/folders`, `…/templates`.
- **AI:** `api/v0/suggestions/accounts/{acc}/toolbar`, `…/chats/{fan}/generate`, `api/creators/{pa}/ai-assistant[/buttons/{id}]`, `api/v0/copilot/settings`, `api/v0/copilot/chats`, `api/v0/copilot/accounts/{acc}/chats/activation`.
- **Перевод:** `api/v0/ts/translate`, `api/v0/ts/translate-creative`, `api/v0/ts/translate-batch`, `api/v0/ts/accounts/{acc}`, `api/v0/ts/translator/profiles`, `api/v0/translator/supported-languages`.
- **Прочее:** `api/user/permissions`, `…/{acc}/settings`, `api/frontend` (Unleash).

## Приложение C. Локальные ключи `chat-space:*` (что хранится только в браузере)

- Вкладки: account-tabs, active-account-tab, chat-tabs.
- Внешний вид: chat-appearance, theme-mode, sfw-mode, sfw-blur-scope, fan-card-settings:{user}:{acc}, locale.
- Панели: chats-panel-width, chat-list-toolbar-expanded/height, side-panel-* (open, widgets-visible, tab, order, collapsed, width), fan-spending-scope.
- Фильтры: hidden-chats:{acc}, inbox-filter:{acc}.
- **Закреплённые чаты:** pinned-chats:{user}.
- **Таймеры чатов и пресеты:** chat-timers:{user}, chat-timer-presets:.
- Follow-up: follow-up-settings, follow-up-presets: (сами follow-up — на сервере).
- Переводчики: composer-translator:accounts:{user}, message-translator:settings:.
- Ввод: draft:{acc}:{fan}, copiedMessage, my-kaomoji:, quick-emojis:, of-gif-favorites:.
- Прочее: notification-permission-banner-dismissed.

Следствие: закрепления, таймеры, наборы эмодзи и каомодзи, избранные GIF и настройки не переходят между компьютерами и браузерами чаттера (ссылки: accounts:6184, 8478, 8821; messages:2971, 3010, 3511, 3919–3920, 4551, 4561, 5667, 14412; notif:19882, 19958; inbox:112; of:143–144; fanCard:1366, 1432, 2541; ChatView:1149, 2803–2807, 4293–4297; EmojiPicker:5250; comp19:84933, 89493).
