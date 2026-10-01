# ChatSpace (chat.onlymonster.ai): как устроен клиент изнутри (для расширения ChatGoose)

Статус: v3 (все разделы заполнены, ссылки сверены с бандлами). Источник: бандлы v0.167.0 (`om/pretty/*.js`, это
prettier-версии файлов из `om/bundle/`), сетевые логи `om/net-mytab.jsonl`, `om/net.jsonl`, документация `om/omdocs/`.
Ссылки вида `файл:строка` указывают на `om/pretty/`; имя файла сокращено до префикса (`composables` =
`composables-19O1xYoe.js`, `messages` = `messages-2XnThXD9.js`, `accounts` = `accounts-gVgPsqTs.js`,
`notificationEntry` = `notificationEntry-DgP70ptm.js`, `ChatView` = `ChatView-DgLPXTcj.js`, `MainLayout` =
`MainLayout-CFVPH3-K.js`, `inbox` = `inbox-BVcu4p6i.js`, `onlyfans` = `onlyfans-3gv7h9YB.js`).
Токены и данные фанов здесь не приводятся.

Термины: «стор X» — Pinia-стор с id `X`; «ключ K» — ключ кэша Pinia Colada (стор `_pc_query`); MAIN world —
контекст страницы (видит `window`-объекты приложения), isolated world — обычный content script.

---

## 0. Короткий итог

1. **WebSocket**: один сокет на вкладку браузера, подписка на **аккаунт целиком** (`subscribe_account`), а не на чат.
   Подписаны все аккаунты, у которых открыта вкладка в левом сайдбаре. Клиент не шлёт heartbeat (action `ping`
   объявлен, но не используется), токен Clerk кладётся в **каждое** сообщение клиента, периодического re-auth нет.
2. В клиенте объявлено **35 серверных событий** (`composables:86225-86261`). Событий «фан прочитал», «сообщение
   отредактировано», «фан онлайн/офлайн» нет: онлайн берётся опросом `POST …/fans-online`.
3. **Отправка**: Enter/кнопка → `pendingMessages.enqueue` → очередь на аккаунт, по одному сообщению →
   `POST api/v0/accounts/{acc}/chats/{fan}/messages` (HTML из TipTap `getHTML()`). **Автоповтора нет нигде**:
   ky не ретраит POST, таймаут 30 с даёт статус FAILED/timeout, повтор только кнопкой Resend. Эхо из WS
   сверяется по plain-тексту.
4. **Прочтение OnlyFans-чата**: при открытии клиент только патчит кэш (`unreadMessagesCount = 0`), write-запроса нет.
   Явный «прочитать» (`GET …/messages?limit=1`) включён только для `telegram_v2`. «Mark all as read» (POST) и
   «Mark as unread» (DELETE) — только по действию человека. Помечает ли бэкенд OM чат прочитанным на OF при обычном
   `GET …/messages` — из клиента не видно, нужен живой тест (§3.4).
5. **Официальный мост для внешнего софта**: пустой `<div data-id="browser-composer-translator">` в верхней полосе
   composer, на нём DOM-свойство `__omComposerBridge = {setText, insertText, focus, insertMessage}`
   (`messages:14436-14463`, разметка `messages:14805-14830`). Сделан для переводчика OnlyMonster Browser.
   Это лучший путь вставки текста и лучшее место для нашей кнопки.
6. Второй официальный путь — `ofComposerInsert.setInsertPayload(accountId, chatId, {html, media, gif, taggedCreators})`:
   смонтированный composer этого чата **заменяет** весь черновик вместе с вложениями (`messages:18665-18676`).
7. Флаг `isAiGenerated` из composer до API не доходит (обёртка `enqueue` его теряет, `notificationEntry:1639-1652`),
   а `is_copied = true` ставится, если отправленный текст совпал с вставленным через Ctrl+V. Вставка через мост или
   команды TipTap не помечается никак.
8. **Хоткеи ChatSpace**: глобально `ctrl+tab` / `ctrl+shift+tab` (в Chrome до страницы не доходят) и `escape` —
   закрыть текущую вкладку чата, если фокус не в `input/textarea` и нет открытого dialog/menu/listbox/
   `[data-dismissible-open]`. **contenteditable composer полем ввода не считается**. В composer: Enter и Ctrl+Enter —
   отправка, Shift+Enter — перенос, Tab — шаблоны, Alt+S — автоперевод (срабатывает и на Ctrl+Alt+S), «/» в начале
   текста — поиск шаблонов. TipTap: Ctrl/⌘+B/I/E, Ctrl/⌘+Shift+S, Ctrl/⌘+Z/Y.
9. **Конфликты с нашей схемой**: ⌘/Ctrl+I (Fix) = курсив TipTap; ⌘/Ctrl+E (Reply) = inline-code TipTap; ⌘⇧S
   (Recap, mac) = зачёркивание; Ctrl+Alt+S (Recap, win) = переключение автоперевода; Esc закрывает вкладку чата.
   Лечится capture-слушателем на `window`, поставленным раньше приложения (document_start), с `preventDefault` +
   `stopImmediatePropagation` для своих комбинаций, и атрибутом `data-dismissible-open` на хосте нашего оверлея.
10. **Защиты нет**: ни детекта расширений, ни SRI, ни обфускации (только минификация, строки целы). Trusted Types не
    форсируются (CSP — только `frame-ancestors`), `isTrusted` нигде не проверяется, глобальных MutationObserver нет,
    аналитики и записи сессий нет (ключ Amplitude объявлен, но не используется; Sentry без DSN).
11. **Стабильные якоря**: строковые id Pinia-сторов и имена их действий, ключи кэша (`chatMessages`, `chatList`…),
    имена WS-событий, пути API, `data-testid`, `data-id="browser-*"`, ключи localStorage `chat-space:*`.
    Нестабильны имена чанков и переменных: они меняются каждый билд, а релизы идут по несколько в день
    (v0.137 → v0.167 за 9 дней по changelog).
12. **Тема**: класс `dark` на `<html>` (vueuse `useColorMode`, ключ `chat-space:theme-mode`). Палитра — CSS-переменные
    `--color-om-*` (RGB-триплеты), выставленные инлайном на `<html>` (`index-UvX_bFdW.js:886-899`); они наследуются в
    Shadow DOM.
13. Composer рендерится на **каждую** посещённую вкладку чата (через `v-show`), поэтому `.ProseMirror` в DOM
    несколько. Брать нужно видимый, соответствующий текущему маршруту.
14. `window.OM_WINDOW` — мост к десктопу OnlyMonster Browser (Electron): встроенная панель (`isEmbedded`), отдельное
    окно, нативные уведомления, нативные виджеты. В обычном Chrome его нет: работает обычный web-режим, расширения
    ставятся штатно. В сам OM Browser поставить расширение Chrome, по всем признакам, нельзя (вывод по коду, §8).
15. Service worker `/notifications-sw.js` обрабатывает только `notificationclick`; push не реализован (TODO в коде),
    fetch не перехватывается.

---

## 1. WebSocket

### 1.1 Где создаётся и как устроен

- URL: `wss://onlymonster.ai/api/chat-space/ws` (`composables:85185`, переопределяется `VITE_CHAT_SPACE_WS_URL`,
  `composables:85200`).
- Три слоя:
  1. **Сокет-менеджер** `J4` (`composables:86016-86162`), синглтон `Y4()` (`composables:86163`).
     `new WebSocket(url)` — `composables:86072`. Обработчики назначаются свойствами `onopen/onclose/onmessage/onerror`,
     а не через addEventListener. Статусы: `CLOSED | CONNECTING | OPEN | DISCONNECTED`.
  2. **Шина событий** `Q4` (`composables:86166-86223`), синглтон: парсит каждый кадр как JSON, берёт поле `event`,
     вызывает подписчиков из приватной `Map event → Set<handler>`. `send(action, payload)` каждый раз делает
     `await getToken()` и отправляет `{action, token, ...payload}` (`composables:86201-86204`). Подключение и
     закрытие привязаны к `isSignedIn` Clerk (`composables:86193-86198`).
  3. **Хелпер подписки** `s3` (`composables:86281-86361`, экспортируется как `mt`): ждёт OPEN (до 10 с, `n3`,
     `composables:86263-86278`), делает auth (до 3 попыток, каждая ждёт `authenticated` 10 с,
     `composables:86295-86328`), затем вызывает `onConnect`/`onReconnect` стора и регистрирует его `listeners`.
     Каждый стор, которому нужен WS, вызывает `s3({...})` в своём setup.
- Действия клиента (`composables:86224`): `ping`, `auth`, `subscribe_account`, `unsubscribe_account`.
  - `ping` не отправляется нигде (проверено по всем бандлам): клиентского heartbeat нет.
  - `auth` шлётся только при connect/reconnect (`composables:86302`). Наблюдение из FACTS «повторный auth примерно
    раз в 5 минут» код не подтверждает: такое возможно только при переподключениях (например, сервер закрыл сокет).
    В `net-mytab.jsonl` три коннекта — это три перезагрузки страницы.
- Формат подписки (`accounts:9273`): `{account_id: String(id), platform, platform_account_id}`.

### 1.2 На что подписывается клиент

- Стор `accounts` (`accounts:9274-9355`): подписаны все `accountId` из открытых вкладок левого сайдбара
  (стор `tabEntries.openedEntries`, `accounts:8823-8878`, localStorage `chat-space:account-tabs:{omUserId}`).
  При изменении набора вкладок считается дифф: `unsubscribe_account` для закрытых, `subscribe_account` для новых
  (`accounts:9300-9318`). Если сокет не OPEN, синхронизация откладывается и повторяется при OPEN
  (`accounts:9296-9299`, `accounts:9344-9347`).
- Подписка именно на аккаунт: приходят события по всем фанам аккаунта (typing, новые сообщения, суммарные счётчики).
  Орг-события (права, Mimic, шаблоны, цветовые группы, list labels), судя по коду, приходят после auth без
  отдельной подписки: их слушатели к подписке на аккаунт не привязаны.
- В логе `subscribe_account` ушёл раньше `auth` (гонка: синхронизация проверяет только статус OPEN, не auth).
  Это безвредно, потому что токен есть в каждом сообщении.
- Сервер сам шлёт `account_notifications_summary` примерно раз в 61 с на каждый подписанный аккаунт (лог: 7.0 → 67.7 →
  128.4 → 189.2 с) — по сути это прикладной heartbeat. Плюс протокольные ping/pong uWebSockets (браузер отвечает сам,
  JS их не видит).

### 1.3 Переподключение

- Бэкофф `min(1000·2^n, 30000) + random·1000` мс; бюджет — 10 попыток онлайн и 3 офлайн (`composables:86009-86015`).
  Когда бюджет исчерпан: статус `DISCONNECTED`, запись `reconnect-give-up` в диагностический буфер, баннер
  «Connection lost [Reconnect]» (`MainLayout:188-255`).
- Код закрытия 1000 — без ретрая (`composables:86060`).
- Принудительный реконнект `h()` (`composables:86090-86100`) срабатывает: на событиях окна `online` **и** `offline`
  (даже при открытом сокете — закрывает и создаёт заново); на `visibilitychange → visible`, если сокет не
  OPEN/CONNECTING; по кнопке в баннере.
- На реконнекте сбрасывается кэш auth-промиса (`composables:86289-86291`), стор `accounts` очищает множество подписок и
  подписывается заново, а много сторов инвалидирует кэш (список в конце §1.5). На каждый реконнект — «шторм»
  GET-запросов.
- Тонкое место: если сокет открылся, а `authenticated` не пришёл за 3 попытки, хелпер `s3` только пишет
  `connect_failed` в диагностику. Повторная попытка запускается лишь при **смене** статуса на OPEN
  (`composables:86344-86347`), поэтому сокет может остаться открытым без подписок до следующего реконнекта, и
  баннера при этом нет. Кадры без поля `event` игнорируются (`frame-without-event`), отдельного события ошибки
  авторизации в протоколе клиента нет.
- Диагностика: кольцевой буфер на 300 событий `KF(scope, event, details)`, счётчики `qF` и снимок состояния сокета
  (`composables:63488-63513`). Пользователь копирует это через Settings → Copy session log
  (`composables-B_Bz2Xc6.js:418-432`). Пригодится для разбора конфликтов с расширением.

### 1.4 Токен

- Clerk session JWT живёт ~60 с; clerk-js обновляет его в фоне примерно раз в 55 с (`POST
  clerk…/sessions/{sid}/tokens` в логе: 59.6, 114.8, 170.0, 225.2 с). WS берёт актуальный токен на каждый `send`.
- REST-клиент — ky (`I4`, `composables:85942-85977`): `prefixUrl=https://onlymonster.ai`, таймаут 40 с,
  `retry: {limit: 2, backoffLimit: 3000}`, заголовок `Authorization: Bearer <JWT>`. На 401 — один повтор с
  `getToken({skipCache: true})`; без токена — редирект на `/sign-in` (`N4`, `composables:85931-85939`).
- Дефолты ky в бандле (`composables:62991-62998`): ретраятся только `get/put/head/delete/options/trace` и только на
  408/413/429/500/502/503/504, `retryOnTimeout: false`. **POST не ретраится никогда.**

### 1.5 Карта событий (сервер → клиент) и что они меняют

Имена событий (35 штук) — `composables:86225-86261`. Обработчики:

| Событие (поля) | Кто слушает | Эффект |
|---|---|---|
| `authenticated` | `s3` (`composables:86300`) | завершает auth |
| `account_new_message` (`account`, `message{id, content, sentAt, chatId, platform_fan_id, is_from_fan, platformMetadata}`) | стор `chats` (`accounts:6253`) | у сообщения фана сбрасывает его typing |
|  | стор `chatList` (`accounts:6353`) | во всех ключах `["chatList", acc, …]`: поднимает чат наверх / меняет `lastMessage`; `unreadMessagesCount + 1`, если сообщение от фана, иначе `0`; если чата нет в загруженном списке — refetch этого списка; помечает stale `["chatCounts", acc]` (без refetch); затем `chats.upsertChats` |
|  | стор `chatTabEntries` (`accounts:8495`) | счётчик новых сообщений у неактивных вкладок чатов |
|  | стор `chatMessages` (`messages:21240-21253`) | upsert в `["chatMessages", acc, chatId]` (только ключ без anchor); для исходящих — `pendingMessages.confirmEchoedMessage`; если ключа нет в кэше — ничего (или invalidate, если запись есть) |
|  | стор `fanProfile` (`ChatView:1696`) | `lastResponseAt` в `["fanMessageActivity", acc, fan]` |
|  | стор `notifications` (`messages:3758`, `messages:3873`) | системное уведомление, если чат не в фокусе и не замьючен |
| `account_message_deleted` (`account`, `message_id`) | `chatList` (`accounts:6369`) | `lastMessage` меняется на предыдущее из кэша, иначе refetch списка |
|  | `chatMessages` (`messages:21256`) | при праве `om_chatter_metrics` помечает `isUnsent` и инвалидирует `["ofUnsentMessages", acc, fan]`; иначе удаляет сообщение из кэша |
| `account_fan_typing` (`typing.platform_fan_id`) | `chats` (`accounts:6239`) | `isFanTyping = true` на 5 с (`accounts:6218`); сервер повторяет событие каждые ~3–4 с |
| `account_messages_summary` (`messages_count, priority_count, unread_tips_count`) | `chatList` (`accounts:6351`); `badgeCounters` (`accounts:9256`) | `["chatCounts", acc]`, `["badgeCountersMap"]` |
| `account_notifications_summary` (`notifications_count`) | `badgeCounters` (`accounts:9262`); `notificationList` (`notificationEntry:22793`) | бейдж; при изменении числа — инвалидирует `["notificationList", acc]`, `["notificationCounts", acc]` |
| `account_fan_ppv_purchased` (`fan_id, content_type: message\|post, content_id, price_gross`) | `notifications` (`messages:3771`, `messages:3881`) | только системное уведомление; кэш сообщений **не** патчится |
| `account_fan_tip_received` (`fan_id, tip_id, amount_gross`) | `notifications` (`messages:3779`, `messages:3892`) | только уведомление |
| `account_scheduled_message_created/cancelled/sent/failed` (`fan_id, send_id, error_message`) | `followUpQueueSync` (`messages:5352-5376`) | `["followUpQueue", acc, fan]`; failed — тост |
| `accounts_list_updated` | `accounts` (`accounts:9333`) | инвалидирует `["accounts"]`, закрывает вкладки удалённых аккаунтов |
| `account_data_updated` (`type, id, account`) | `fanInfo` (`ChatView:872`) | при `type === "user-notes"` инвалидирует `["fanInfo", acc, fan]` |
| `notification_reply` | `notificationList` (`notificationEntry:22803`) | патч `["notificationReplies", …]` |
| `org_user_permissions_updated` / `org_user_access_revoked` | права (`composables:86381`), `accounts` (`accounts:9338`) | перезагрузка или сброс прав |
| `folder_created/updated/deleted`, `template_created/updated/deleted/sent` | `messageTemplates` (`messages:6233-6250`) | `["templateFolders"]`, `["templates"]` |
| `org_copilot_chat_changed` / `org_copilot_chat_escalation` / `org_copilot_settings_updated` | `mimic` (`inbox:315-345`), `notifications` (`messages:3903`) | `["mimicChats"]`, `["mimicSettings"]`, состояние сессий Mimic, уведомление об эскалации |
| `chat_color_group_*`, `chat_color_groups_toggled`, `chat_color_groups_linked_fans` | `inboxes` (`notificationEntry:20258-20294`) | `["inboxes", acc]`, привязки фан → инбокс |
| `list_label_created/updated/deleted` | `listLabels` (`accounts:6920-6928`) | `["listLabels", acc]` |

Инвалидации на реконнекте: `["chatList"]`, `["chatCounts"]` (`accounts:6348`); `["chatMessages"]`,
`["ofUnsentMessages"]` (`messages:21235-21237`); `["badgeCountersMap"]` (`accounts:9252`); `["followUpQueue"]`;
`["templates"]`, `["templateFolders"]`; `["notificationReplies"]` (обнуляется), `["notificationList"]`,
`["notificationCounts"]`; `["inboxes"]`; `["listLabels"]`; `["mimicChats"]`, `["mimicSettings"]`; `["fanInfo"]`;
`["fanMessageActivity"]`; права.

Типы полей по логу: все id (`account_id`, `platform_account_id`, `chatId`, `platform_fan_id`, `message.id`) —
строки; `platform_id` — число (1 = OnlyFans). `message.platformMetadata` в `account_new_message` — почти сырой объект
сообщения OF: `responseType, isOpened, isNew, changedAt, cancelSeconds, isFromQueue, queueId, price, isFree,
lockedText, mediaCount, media[], previews[], isTip, canPurchase, canPurchaseReason, isLiked, isPinned, chatUserId,
fromUser{…}`. Исходящие (от чаттера, других чаттеров, рассылок, Mimic) приходят с `is_from_fan: false` — для
«фан написал» фильтровать по `is_from_fan === true` и сравнивать `chatId` с маршрутом как строки.

**Чего в протоколе нет** (в клиенте не объявлено): прочтение сообщения фаном, редактирование, онлайн/офлайн фана,
лайк/пин от фана, покупка PPV как изменение сообщения (флаг `isOpened` обновится только при перезагрузке истории).
Прочтение фаном нашего сообщения клиент вычисляет только из истории: у исходящего сообщения
`platform_metadata.isNew === false` значит «прочитано» (`ChatView:1643-1653`).

Онлайн-статусы: опрос `POST api/v0/accounts/{acc}/platforms/onlyfans/fans-online` (`{fan_ids}` → `{online: [...],
timed_out}`) для видимых в списке чатов (IntersectionObserver по `[data-chat-id]`). TTL на фана 60 с, повтор раз
в 5 мин, debounce 2 с, только при видимой вкладке (`accounts:6786-6866`). Для открытого чата с capability
`fan_peer_status` (сейчас только telegram_v2) — `GET …/chats/{fan}/fan-status` (`accounts:8336-8368`).

---

## 2. Отправка сообщения

### 2.1 Путь от Enter/кнопки до сети

1. **Клавиша.** TipTap `editorProps.handleKeyDown`: `Enter` без Shift → `emit('enter')` и `return true`
   (`messages:1627`). Проверяется только `shiftKey`, поэтому Ctrl/⌘/Alt+Enter тоже отправляют. Shift+Enter уходит в
   keymap TipTap и даёт `hardBreak`.
   `MessageComposerFrame.onEnter` (`messages:5558-5565`): на мобильном (`navigator.userAgentData.mobile` или UA)
   Enter вставляет `hardBreak`; иначе `emit('submit', editor)`.
2. **Кнопка Send** (`OfSendButton`, `messages:15419-15468`; подключена в слоте `send-button`,
   `messages:19407-19470`) вызывает тот же `handleSubmitWithTranslation(editor)`. Есть ещё «Send original» (если
   показан превью перевода) и «Clear».
3. **Перевод.** `handleSubmitWithTranslation` (`iE`, `messages:18168-18192`): если включён автоперевод, текст
   переводится, перевод **записывается в редактор вместо исходного**, и сообщение сразу отправляется. Если за время
   перевода текст изменили — отправка отменяется с тостом. Если автоперевод выключен — сразу `submit`.
4. **submit** (`messages:18620-18651`):
   - проверка `an` — отправка запрещена, если идёт загрузка медиа, запись голоса, открыт поиск шаблонов по «/»,
     неполный PPV или пусто (`messages:18610`);
   - текст: `yE(editor)` = `getHTML()`, если `getText().trim()` не пуст, иначе `''` (`messages:18422`);
   - атрибуция `RT.resolveAttribution` (`messages:17947-17986`): `internalTemplateId` (текст похож на вставленный
     шаблон, similarity ≥ 0.85), `isCopied` (текст = вставленный через Ctrl+V), `isAiGenerated` (похож на ответ
     встроенного AI);
   - `enqueue({platform: 'onlyfans', text, hasAttachments, internalTemplateId, isCopied, isAiGenerated,
     composerContent: {html, media, gif, taggedCreators}, platformMetadata: gE(...)})`.
     `platformMetadata` (`messages:18400-18420`) = `{giphyId?, replyToMessageId?, rfTag?, rfGuest?, mediaFiles?,
     price?, lockedText?, previews?}`;
   - если `enqueue` вернул запись: композер очищается (`w()`), сбрасываются атрибуция, reply-target, gif-пикер,
     окно цены и панель шаблонов. Если вернул `null` — тост «очередь заполнена».
5. **Очередь** — стор `pendingMessages` (`notificationEntry:1427-1628`):
   - `enqueue` (`notificationEntry:1543-1565`) отказывает (`null`), если чат сейчас ведёт Mimic
     (`mimicSettings.isActive && mimicChats[acc:fan].status === ENABLED`, `inbox:637`) или в чате уже ≥ 50 ожидающих;
     иначе создаёт запись `{id: crypto.randomUUID(), accountId, chatId, platform, status: 'pending', error: null,
     createdAt, payload}` и запускает обработку очереди аккаунта;
   - обработка `g(acc)` идёт **строго по одной** записи на аккаунт (`notificationEntry:1524-1541`);
   - отправка `m(entry)` (`notificationEntry:1471-1519`): статус `sending`, AbortController с таймаутом 30 с;
     `previous_message` = самое свежее сообщение чата из кэша (`{id, created_at, is_fan_message}`); затем
     `POST api/v0/accounts/{acc}/chats/{fan}/messages` с телом (`notificationEntry:1351-1366`):
     ```
     { text, is_copied, is_ai_generated, internal_template_id, reply_time: null,
       previous_message, platformMetadata }
     ```
   - **успех**: если запись ещё есть (не отменена) — в `["chatMessages", acc, fan]` вставляется «отправленное»
     сообщение с id от сервера и `cancelSeconds: 60` (окно unsend), запись удаляется (`notificationEntry:1457-1470`);
   - **ошибка**: если запись уже `confirmed` (эхо из WS пришло раньше ответа) — просто удаляется; abort/timeout →
     `failed {kind: 'timeout'}`; `code === 'MESSAGE_GUARD_VIOLATION'` → `failed {kind: 'blocked', guard: {words,
     topics}}` (Message Guard OM); иначе `failed {kind: 'platform', text, tooltip: upstreamMessage}` + тост.
6. **Подтверждение через WS** — `confirmEchoedMessage(acc, chatId, content, alreadyInCache)`
   (`notificationEntry:1574-1589`), вызывается из стора `chatMessages` на каждое исходящее `account_new_message`
   (`messages:21249`). Если сообщения ещё нет в кэше, ищется запись `sending` того же чата с тем же plain-текстом
   (сравнение `hF`: без тегов, с декодированными сущностями, trim) и помечается `confirmed`. Дополнительно
   удаляется запись `failed/timeout` с тем же текстом: эхо доказало, что сообщение ушло.

### 2.2 Ретраи, отмена, cancelSeconds

- **Автоповтора нет**: ky не ретраит POST (§1.4), очередь при ошибке ставит `failed` и не повторяет.
  `resend(acc, id)` (`notificationEntry:1570-1573`) работает только из `failed` и вызывается кнопкой Resend
  (видна при `platformError`/`timeout`, `composables:87653-87662`). Это совпадает с нашим правилом «никогда не
  повторять отправку с неизвестным исходом автоматически».
- **Cancel** виден, пока запись `pending/sending` (`composables:87638-87648`). `cancel(acc, id)`
  (`notificationEntry:1566-1569`) **обрывает уже летящий POST** (abort) и удаляет запись. Сервер мог успеть
  отправить: тогда сообщение позже придёт через WS как обычное, без привязки к записи.
- Для `failed` есть «Insert» (вернуть содержимое в composer через `setInsertPayload`, `messages:20997`) и «Delete».
- **`cancelSeconds`** — окно **unsend** уже отправленного сообщения, а не отложенной отправки. Оптимистичное сообщение
  получает 60 с (`notificationEntry:1384`, `notificationEntry:1398`); пункт меню Unsend
  (`onlyfans:1342-1349`, расчёт окна `onlyfans:1354-1371`). По документации OM: всем 1 минута, с правом Unsend — 24 ч.
  Unsend = `DELETE api/v0/accounts/{acc}/chats/{fan}/messages/{id}` с `retry: 0` (`messages:20126-20128`).

### 2.3 Все пути, которые реально отправляют

Все вызывают `pendingMessages.enqueue` — значит, одна точка наблюдения ловит любую отправку:
- composer OF (`messages:18620`, через обёртку `Oi`);
- «Send» шаблона без вставки: в панели шаблонов, а в поиске шаблонов — **Shift+Enter** (`messages:18838-18860`,
  `messages:11009-11013`);
- быстрые ответы из уведомлений, «Fans online», коллекций (`notificationEntry:21911-21941`: plain-текст, не HTML);
- composer telegram_v2 (`ChatView:6861-6880`).

### 2.4 Если расширение вставило текст, а человек нажал Send

- Вставка через мост (`setText`/`insertText`) или команды TipTap — это обычное изменение документа: срабатывает
  `onUpdate`, обновляется v-model (TipTap JSON), черновик пишется в `localStorage['chat-space:draft:of:{acc}:{fan}']`,
  через watch уходит `POST …/typing` (throttle 3 с, `messages:18335-18360`, `messages:18473-18475`), кнопка Send
  активируется.
- Enter или Send проходят §2.1 целиком. В API уйдёт HTML из TipTap: `<p>…</p>`, перенос строки — `<br>`, разметка —
  `<strong>/<em>/<s>/<code>` и `<span class="m-editor-fc__…|m-editor-fs__…" data-color-class|data-size-class>`
  (это родные классы редактора OF, `messages:14963-14965`, `messages:15050-15054`).
- Атрибуция: текст из моста не помечается ни `is_copied`, ни шаблоном, ни AI. Если вставлять синтетическим paste —
  OM поставит `is_copied: true` (возможная видимость в метриках чаттеров у владельца агентства).
- Если включён автоперевод OM, наш текст **будет переведён** перед отправкой (§2.1 шаг 3).
- Если текст начинается с «/», откроется поиск шаблонов, и отправка будет заблокирована, пока поиск открыт
  (`messages:17261-17300`, `messages:18610`).
- Отправку делает только человек: ни мост, ни `setInsertPayload` не отправляют.

---

## 3. Прочтение (mark as read)

### 3.1 Что делает клиент при открытии OnlyFans-чата

`ConversationPanel` (`ChatView:7214-7227`):
```
watch([chatId, accountId, isInitialFetchFinished, isError], ([chat, acc, done, err]) => {
  if (chat && acc && done && !err) {
    chatList.markChatAsRead(acc, chat)                       // только кэш
    if (capability(platform, 'marks_chat_read_on_open'))     // только telegram_v2
      GET api/v0/accounts/{acc}/chats/{chat}/messages?limit=1, затем invalidate ["badgeCountersMap"]
  }
}, { immediate: true })
```
- `chatList.markChatAsRead` (`accounts:6394-6404`) только ставит `unreadMessagesCount = 0` во всех ключах
  `["chatList", acc, …]` и в `chats.chatsById`. **Сетевого запроса нет.**
- Таблица capability (`composables:62702-62724`): у `onlyfans` нет `marks_chat_read_on_open`, есть только у
  `telegram_v2`.
- Условия срабатывания: выбран чат, первая загрузка истории завершилась, нет ошибки. **Видимость вкладки, фокус
  окна, задержка и наличие непрочитанных не проверяются.** Watch повторно срабатывает при смене чата и когда
  `isInitialFetchFinished` снова становится `true` — например, после кнопки Refresh в шапке чата (`Ul.refresh` сбрасывает
  запись в `pending`, `messages:5415-5432`).
- Новое входящее в уже открытый чат **не** помечается прочитанным: `chatList` делает `unread + 1` (`accounts:6295-6299`),
  и до следующего открытия ничего не сбрасывает.
- Исходящее сообщение (любое, включая рассылки OM) локально обнуляет unread (`accounts:6298`) — так ведёт себя и сам OF.

### 3.2 Явные запросы чтения (только по действию человека)

| Действие | Запрос | Где |
|---|---|---|
| Mark all as read (диалог подтверждения) | `POST api/v0/accounts/{acc}/platforms/onlyfans/chats/mark-as-read?filter=…&list_id=…` | `accounts:6563-6600`; ошибка `MARK_CHATS_AS_READ_LIMIT_EXCEEDED` |
| Mark as unread (меню чата, шапка) | `DELETE api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/mark-as-read` | `accounts:6471-6485`, оптимистичный `markChatAsUnread` с откатом |

### 3.3 Кто ещё вызывает GET истории

`GET api/v0/accounts/{acc}/chats/{fan}/messages` вызывается:
- основная лента (`messages:5440-5500`): `limit=10`, `cursor` — следующие страницы, `first_id` — переход к якорю,
  `force=true` — при Refresh. `staleTime` 60 с, `gcTime` 10 мин, `refetchOnWindowFocus: false`. Повторное открытие
  чата в пределах 60 с — **без запроса**; до 10 минут после ухода из чата — из кэша с фоновым обновлением;
- закреплённые (`messages:21277-21310`): `filter=pinned&limit=20`, только при открытом диалоге закреплённых;
- старые AI-кнопки (`messages:18006-18028`): страницы по `limit=60`, пока не наберётся N реплик (в логе: 549.1 с и
  555.5 с);
- виджет профиля фана в Side Panel (`ChatView:1659-1686`): до 5 страниц по `limit=100&order=desc` за 7 дней — считает
  `lastResponseAt`/`lastReadAt`. Работает только при включённом флаге `sith.cor-2363.side-panel` — у этой
  организации он **выключен** (его нет в ответе Unleash).

### 3.4 Вывод и что проверить вживую

> **Проверено вживую 2026-10-02** (после написания отчёта): на тестовом чате владельца загрузка истории в ChatSpace сбросила `unread_messages_count` в OnlyFans с 1 до 0, других запросов к чату не было. Значит, бэкенд OM при `GET …/messages` помечает чат прочитанным на OF. Подробности — в [facts.md](facts.md).


- Клиент ChatSpace сам **никогда** не отмечает OnlyFans-чат прочитанным на сервере без явного действия человека.
- Открытым остаётся только побочный эффект бэкенда: OF помечает чат прочитанным на `GET /chats/{id}/messages` (это
  наш опыт с OFAPI). Если бэкенд OM на `GET …/messages` ходит в OF вживую (а `force=true` намекает, что обычно он
  отдаёт данные из своего кэша), то прочтение = «первая загрузка истории, когда кэш клиента пуст или устарел» и
  «Refresh в шапке». То, что для telegram_v2 нужен отдельный GET с `limit=1`, а для OF — нет, косвенно говорит: либо
  OM читает OF при загрузке, либо сознательно не читает и полагается на ответ чаттера.
- **Тест (5 минут):** тестовый фан пишет креатору → в ChatSpace открыть этот чат и подождать → на стороне OF (или
  через `GET /chats` OFAPI, или с другого устройства чаттера) посмотреть, остался ли чат непрочитанным. Повторить с
  кнопкой Refresh (`force=true`).
- **Правило для расширения:** не дёргать `GET …/messages` для чатов, которые человек не открывал. Контекст для AI
  брать из кэша `["chatMessages", acc, fan]`, который ChatSpace уже загрузил; дозагружать историю (`cursor`) только
  для открытого человеком чата.

---

## 4. Composer

### 4.1 Компоненты и где лежит редактор

`ConversationPanel` → по одному `ConversationComposer` на **каждую** вкладку чата, посещённую в этой сессии
(`v-show` активной, key `${tabId}:${accountId}:${chatId}`, `ChatView:7445-7480`) → `MessageComposer`
(`ChatView:6948-7020`) → `OfMessageComposer` (`messages:18437-19699`) → `MessageComposerFrame`
(`messages:5526-5640`) → `OmRichTextEditor` (`messages:1555-1700`).

- `OmRichTextEditor` лениво грузит TipTap (`dist-DO-cPcy1.js`, `dist-CTgaf6KW.js` StarterKit, `dist-C6npEDX5.js`
  Placeholder, `dist-NBwAadfC.js`; ядро ProseMirror `dist-WWl93D_k.js`, 291 КБ). `[contenteditable]` появляется
  асинхронно; `focusEditor()` ждёт его до 2 с (`messages:5544-5553`).
- Расширения TipTap (`messages:1608-1624`): StarterKit без heading/codeBlock/blockquote/horizontalRule/bulletList/
  orderedList/listItem/underline; `TextColorClass`/`TextSizeClass` (span с `data-color-class`/`data-size-class`,
  `messages:1533-1551`); Placeholder; `pasteAsInline` (`messages:17905-17936`: plain-paste, пустые строки схлопываются
  в одиночные `hardBreak`, вызывает `trackPaste`).
- Ключ компонента редактора = текущая локаль (`messages:5592`): при смене языка UI редактор пересоздаётся.
- v-model редактора — TipTap JSON. Внешнее изменение модели делает `setContent` (`messages:1650-1653`).
- Открытый API редактора (`messages:1668-1700`): `toggleBold/Italic, setColor, setFontSize, clearFormatting,
  insertContent, clear, focus, blur, getText, getHTML, getJSON, isEmpty`. Из MAIN world экземпляр TipTap доступен как
  `.ProseMirror.editor` (FACTS), но это не контракт.

### 4.2 Что уходит в API

См. §2.1 и §2.4: HTML из `getHTML()`, или `''`, если текст пуст. Перед сравнением эхо и в превью HTML превращается в
текст через `hF` (без тегов, с декодированными сущностями). Черновик хранится в
`localStorage['chat-space:draft:of:{acc}:{fan}'] = {body: {json, gif, media, taggedCreators}, updatedAt}` с TTL 30 дней
(`composables:89493-89527`), чистится при старте (`composables:89529-89543`). Список чатов показывает превью черновика
из этого же ключа (`messages:19749-19760`).

### 4.3 Хоткеи composer

| Клавиша | Действие | Где |
|---|---|---|
| Enter, Ctrl/⌘/Alt+Enter | отправить (на мобильном — перенос) | `messages:1627`, `messages:5558-5565` |
| Shift+Enter | перенос (`hardBreak`) | keymap TipTap `dist-CTgaf6KW.js:521-522` |
| Tab (без модификаторов) | открыть/закрыть панель шаблонов | `messages:18764-18771` (capture на editor area) |
| «/» первым символом | поиск шаблонов; пока он открыт, отправка заблокирована | `messages:17259-17300` |
| Alt+S (по `code`, **любые** другие модификаторы) | вкл/выкл автоперевод; Alt+A только «проглатывается» | `messages:18278-18287` (capture на корне composer) |
| ↑↓←→ / Enter / Esc при открытой панели шаблонов | навигация, вставка, закрытие | `messages:6115-6185`, `messages:10988-11040` |
| Shift+Enter в поиске шаблонов | **сразу отправить шаблон** | `messages:11009-11013` |
| Ctrl/⌘+B, I, E | жирный, курсив, inline-code | `dist-CTgaf6KW.js:144`, `:678`, `:189` |
| Ctrl/⌘+Shift+S | зачёркивание | `dist-CTgaf6KW.js:2529` |
| Ctrl/⌘+Z, Y, Shift+Z (в т.ч. «я») | undo/redo | `dist-2JO_tV4G.js:1026-1030` |

### 4.4 `ofComposerInsert` — «официальная» вставка через стор

- Стор `ofComposerInsert` (`messages:14408-14421`): `payloadsByChatKey`, `copiedMessage` (useStorage
  `chat-space:copiedMessage`), `setInsertPayload(acc, chat, payload)`, `clearInsertPayload`, `getInsertPayload`.
  chatKey = `` `${accountId}:${chatId}` `` (`composables:89379`), обе части — строки (id аккаунта OM и числовой id
  фана OF).
- Формат payload (как его строит `Px` из сообщения, `messages:14379-14406`):
  ```
  { html: string,
    media: { medias: [{id, type: 'image'|'video'|'audio'|'gif', duration?, isFree, imageUrl?,
             playableContentUrl?, drmManifests?}], price: number|null, lockedText: boolean } | null,
    gif: { id, url } | null,
    taggedCreators: [{ id, name, type: 'user'|'guest', avatarUrl: null }] }
  ```
- Как применяется (`messages:18665-18676`): composer нужного чата следит за `getInsertPayload(acc, chat)`. Когда payload
  **меняется**, composer **очищает черновик и вложения** (`w()`, `editor.clear()`), вставляет `html`, ставит gif или
  media, теги, фокусирует редактор и удаляет payload. Watch без `immediate`: payload, записанный до монтирования
  composer, при монтировании **не** применится и останется висеть в сторе до следующей записи в тот же ключ. Вывод:
  писать только для чата, чей composer уже смонтирован (текущий маршрут), и после записи проверять, что payload
  исчез.
- Кто пользуется: «Insert» у сообщения (`messages:20149-20152`), бар «Insert copied message» (`messages:19699-19730`,
  кросс-вкладочно через localStorage), «Insert» у неотправленного pending (`messages:20997`), мост `insertMessage`.

### 4.5 `ofComposerReply`

Стор `ofComposerReply` (`messages:17226-17238`): `setReplyTarget(acc, chat, target)`, `clearReplyTarget`,
`getReplyTarget`. Target (`messages:19737-19748`): `{messageId, senderName, text, timestamp, isOwnMessage, hasGif,
mediaCount}`. Composer показывает превью цитаты, фокусирует редактор и при отправке кладёт
`platformMetadata.replyToMessageId` (`messages:18643`). Расширение может предложить «ответить на сообщение X»,
но отправлять всё равно будет человек.

### 4.6 Мост `__omComposerBridge` (рекомендуемый путь)

`ComposerTopStrip` (`messages:14738-14860`) рендерит пустой
`<div data-id="browser-composer-translator" data-native-translator="1"? class="inline-flex shrink-0 items-center">` и
вешает на него директиву `vComposerBridge` (`messages:14456-14463`). На `mounted/updated` она пишет в DOM-узел
(`messages:14436-14455`):
```
el.__omComposerBridge = {
  setText(text)      // editor.clear(); insertContent(`<p>${escape(text).replaceAll('\n','<br>')}</p>`); focus()
  insertText(text)   // вставка в позицию курсора: text + hardBreak на каждый '\n'; focus()
  focus()
  insertMessage(raw) // raw — сообщение в формате API (id, content, sent_at, is_from_fan, platform_metadata)
                     // → setInsertPayload(acc, chat, Px(map(raw)))  (замена черновика)
}
```
- `data-native-translator="1"` выставляется, когда перевод ведёт собственный переводчик ChatSpace — сигнал внешнему
  переводчику не вмешиваться.
- Узел и мост есть у **каждого** composer (по одному на вкладку). Выбирать надо видимый (`el.offsetParent !== null`)
  или тот, что соответствует текущему маршруту.
- Свойство живёт на DOM-узле, поэтому видно только из MAIN world (у isolated world свои JS-обёртки узлов).
- Мост появляется, когда компонент редактора смонтирован, но TipTap внутри может ещё грузиться: тогда вызовы тихо
  ничего не делают. Готовность проверять по `.ProseMirror` в том же composer.
- `setText` меняет только текст: вложения черновика (медиа, GIF, цена PPV, теги) остаются. `insertMessage` и
  `setInsertPayload`, наоборот, заменяют всё.
- Чтения текста в мосте нет. Текущий текст брать из `.ProseMirror.editor.getText()` или из черновика в localStorage.
- Children этого `div` Vue не трогает: у его vnode `children: null`, патчится только атрибут
  `data-native-translator` (patchFlag PROPS). Значит, сюда можно класть свою кнопку; она исчезнет вместе с composer
  (смена чата во вкладке → новый key → перемонтирование).

---

## 5. Хоткеи ChatSpace вообще

### 5.1 Глобальные слушатели

| Где | Тип | Комбинации |
|---|---|---|
| `lte` (`composables:89659-89677`), регистрирует `MainLayout:330-334` | `window` keydown, **capture** | `ctrl+tab`, `ctrl+shift+tab` — переключение вкладок чатов (с `preventDefault`); `escape` с `lastResort` — закрыть активную вкладку чата |
| PrimeVue Dialog/Popover (`composables:13714`, `composables:60366`) | `document` keydown | Escape закрывает верхний оверлей |
| Media viewer (`composables:74217`), PostPreview (`onlyfans:363`), PhotoEditor (`PhotoEditorAnchoredPanel:227`) | onKeyStroke | Escape, пока открыты |
| `document` contextmenu/dragstart (`composables-B_Bz2Xc6.js:567-584`) | capture | запрет контекстного меню и перетаскивания у `img/video/.video-js` |

Устройство `lte`: слушатель реагирует, только если нажат Ctrl, Alt или Meta либо `key.length > 1` (именованная
клавиша). Строка комбинации: `ctrl+alt+meta+shift+<key в нижнем регистре>` (по `key`, не по `code`). Обычные комбинации
выполняются с `preventDefault`. `lastResort`-комбинация (`escape`) выполняется, только если `document.activeElement`
не `input/textarea` и не виден ни один узел `[data-dismissible-open], [role="dialog"], [role="listbox"],
[role="menu"]` (`composables:89656-89658`). **contenteditable composer не считается полем ввода, поэтому Esc в
composer закрывает вкладку чата**, если не открыта панель шаблонов: у неё стоит `data-dismissible-open`,
`messages:11565` (вывод по коду; постоянно видимых `role="menu|listbox|dialog"` в разметке нет — PrimeVue рендерит их
только у открытых оверлеев; стоит один раз проверить вживую). Черновик при этом не теряется — он в localStorage.

`ctrl+tab` в обычном Chrome до страницы не доходит (браузер переключает свои вкладки) — эта функция по сути
работает только в OnlyMonster Browser.

### 5.2 Пересечения с нашей схемой (`@chatgoose/hotkeys`: mac ⌘X / ⌘⇧X, win Ctrl+X / Ctrl+Alt+X, матчинг по `code`)

| Наша комбинация | Что делает ChatSpace | Что делать |
|---|---|---|
| ⌘/Ctrl+E (Reply) | TipTap inline-code в composer; в Chrome на Windows/Linux Ctrl+E — ещё и фокус поиска в омнибоксе | перехватить |
| ⌘/Ctrl+I (Fix) | TipTap курсив | перехватить |
| ⌘/Ctrl+G, ⌘/Ctrl+P, ⌘/Ctrl+. | TipTap и ChatSpace не занимают; браузер: find-next / печать | `preventDefault` |
| ⌘⇧S (Recap, mac) | TipTap зачёркивание | перехватить |
| Ctrl+Alt+S (Recap, win) | автоперевод OM (Alt+S при любых модификаторах) | перехватить раньше capture-слушателя на корне composer |
| Ctrl+Alt+H/O/B/L/M/C, ⌘⇧H/O/B/L/M/C | свободны (Ctrl+Alt+C = codeBlock, но он выключен) | — |
| Esc (наш Cancel/закрыть оверлей) | закрыть вкладку чата | `data-dismissible-open` на хосте оверлея и/или `stopImmediatePropagation` |
| Enter (вставить следующую часть) | отправка, если фокус в composer | обрабатывать только при фокусе в нашей панели |

Как перехватывать. ProseMirror в этой версии пропускает события, у которых уже стоит `defaultPrevented`
(`dist-WWl93D_k.js:6869`, `dist-WWl93D_k.js:6896-6899`). Поэтому `preventDefault()` в нашем слушателе уже отключает
курсив/код/зачёркивание TipTap и отправку по Enter (`editorProps.handleKeyDown` идёт тем же путём). Но собственные
capture-слушатели ChatSpace — Alt+S на корне composer, Tab на области редактора, панель шаблонов, глобальный Esc
(`lte`) — `defaultPrevented` не проверяют; их отключает только остановка распространения. Итого: `keydown`-слушатель
на `window` в фазе capture, зарегистрированный **раньше** ChatSpace (content script с `run_at: document_start`;
isolated world годится — порядок обработчиков общий для всех миров), и для своих комбинаций — `preventDefault()` +
`stopImmediatePropagation()`. Такой слушатель идёт раньше слушателей composer (они на элементах-потомках) и раньше
`lte` (он на том же `window`, но регистрируется позже, при монтировании MainLayout).

---

## 6. Точки встраивания UI

### 6.1 Структура layout (сверху вниз)

```
html.dark? (style: --color-om-*, --tabs-height)
└ body
  ├ div#app  (Vue)
  │ └ main.h-screen-safe.flex                       MainLayout:352
  │   ├ AccountTabSideBar (левая колонка аккаунтов, ширина var(--account-sidebar-width)=64px)
  │   └ div.flex.min-w-0.flex-1.flex-col
  │     ├ div.sticky.top-0.z-navbar  — ChatTabBar, drag-зона, кнопки (SFW, уведомления, настройки…)
  │     ├ AppUpdateBanner / ConnectionStatusBanner / NotificationPermissionBanner (только без OM_WINDOW)
  │     └ div.h-content-safe…rounded-lg.border  → <RouterView>
  │       └ ChatView: div.flex.min-h-0.flex-1                      ChatView:7626
  │         ├ ChatsPanel [data-testid=chats-panel] (ширина: chat-space:chats-panel-width, дефолт 409, мин 280;
  │         │   виртуальный список, строки — router-link [data-testid=chat-list-item][data-chat-id])
  │         ├ PanelResizeHandle
  │         ├ section ConversationPanel (min-width 400): ConversationHeader, MessagesList (виртуальный),
  │         │   блок composer-ов (по одному на вкладку чата, v-show)
  │         └ при флаге SIDE_PANEL: SidePanel aside[data-testid=side-panel] (ширина chat-space:side-panel-width,
  │             дефолт 364) + SidePanelNav (64px);
  │           без флага (сейчас у этой организации): div[data-id=browser-widgets-column] (280px, пустой) —
  │             только при наличии OM_WINDOW
  └ (тосты PrimeVue, оверлеи с z-index от 1000, ilert-виджет статуса)
```

### 6.2 Можно ли добавить свою вкладку или виджет в Side Panel

Нет. Стор `sidePanel` (`ChatView:2823-2866`) хранит только `isOpen`, `isWidgetsVisible`, `activeTab`, порядок и
свёрнутость (localStorage `chat-space:side-panel-*`). Список вкладок `Ss` (`insights, sales, templates, notes, recap,
ai`) и виджетов `Cs` (только у `insights`: spending, preferences, lists, profile, subscription) — константы модуля,
API регистрации нет (`ChatView:2808-2822`). Подменить `activeTab` своим значением можно — получим пустую панель, но
кнопки в навигации не будет, а пустой список — это vuedraggable со своим DOM. Не рекомендуется. К тому же флаг
`sith.cor-2363.side-panel` у этой организации выключен.

### 6.3 Безопасные места монтирования (по убыванию надёжности)

1. **Свой Shadow DOM-хост вне `#app`** (`document.body` или `document.documentElement`). Vue его не видит и не
   трогает; стили изолированы. Подходит для docked-панели справа или выдвижного оверлея.
   - Docked без перекрытия: сжать приложение (например, `#app { margin-right: Wpx }` или `width: calc(100vw - Wpx)`).
     Но ChatSpace считает ширины от `window.innerWidth` (`useWindowSize`): максимальная ширина списка чатов и
     Side Panel, порог 1020 px для Side Panel (`ChatView:7745-7753`, `ChatView:4298`). Поэтому лучше выставить
     ширину `#app` и проверить, что колонки не переполняются. Альтернатива — перекрывающий оверлей поверх правой
     части ConversationPanel.
   - z-index: шапка 101, drawer 102, PrimeVue — overlay/menu от 1000, modal/tooltip от 1100
     (`index-UvX_bFdW.js:801`). Панель с z-index в диапазоне 200–900 будет над контентом, но под диалогами и меню OM
     (vault, цена, выпадающие списки) — так и нужно.
2. **Слот `[data-id="browser-composer-translator"]`** в верхней полосе composer — для маленькой кнопки или ряда
   чипов прямо над полем ввода (§4.6). Vue не удаляет чужих детей. Слот пересоздаётся при перемонтировании composer.
3. **Шапка чата и верхняя панель** — дети, которыми управляет Vue (v-if/фрагменты). Чужой узел Vue не удалит, но
   при условном рендере соседей порядок может съехать. Только для одиночной иконки и с CSS `order`.
4. **Нельзя**: внутрь виртуальных списков (сообщения, чаты) — узлы переиспользуются, virtua меряет размеры
   элементов, вставка сломает скролл; внутрь `.ProseMirror` — ProseMirror удалит или испортит.

### 6.4 Как ChatSpace относится к чужим DOM-узлам

- Prod-сборка Vue не ставит на элементы `__vueParentComponent/__vnode` (только `#app.__vue_app__`,
  `runtime-dom.esm-bundler-B8T0cb7A.js:2993`). Чужие узлы Vue «не видит»: при патче он трогает только свои vnode.
  Удаляются они только вместе с родителем при его размонтировании.
- Наблюдатели DOM у ChatSpace локальные: область редактора (`messages:5544`), контейнер списка чатов
  (`accounts:6781`), `document.body` childList — только пока открыт выпадающий список настроек переводчика
  (`messages:2205-2236`), FocusTrap внутри диалогов. Глобального наблюдения за страницей нет. Полифил modulepreload
  с наблюдателем на `document` в Chrome не активируется (`index-UvX_bFdW.js:97-114`).
- Хост в `body` при открытом селекте переводчика вызовет у него лишний пересчёт позиции оверлея — безвредно.

### 6.5 Тема

- Режим: vueuse `useColorMode({storageKey: 'chat-space:theme-mode', initialValue: 'dark', modes: {light, dark}})`
  (`fanCardSettings-UahtlbOH.js:1365-1371`). Класс `light`/`dark` ставится на `<html>` (в `index.html` по умолчанию
  `class="dark"`).
- Палитра: `--color-om-{neutral,brand,brand-2,error,warning,success,…}-{0…950}` — RGB-триплеты (`rgb(var(--…))`),
  выставляются инлайном на `document.documentElement.style` при старте (`index-UvX_bFdW.js:886-899`). Они одинаковые
  в обеих темах: тёмная тема — это другие ступени палитры через Tailwind `dark:`, например фон
  `bg-om-neutral-50` / `dark:bg-om-neutral-900`, рамки `om-neutral-100` / `om-neutral-850`.
- Переменные чата (`index-CwJTYqBO.css`, `:root` и `.dark`): `--chat-outgoing`, `--chat-incoming`,
  `--chat-*-accent`, `--chat-surface-tint`, `--chat-message-font-size`; «Chat appearance» переопределяет их инлайном
  (`fanCardSettings-UahtlbOH.js:1590-1604`).
- «Spooky» — не цветовая тема, а фон чата (`classic, gradient, monster, autumn, spooky`, ключ
  `chat-space:chat-appearance`, `fanCardSettings-UahtlbOH.js:1444`). На панель расширения не влияет.
- Для Shadow DOM: custom properties наследуются через shadow boundary, поэтому внутри панели можно писать
  `background: rgb(var(--color-om-neutral-0))`, а тёмный режим отслеживать наблюдателем за атрибутом `class` у
  `<html>` (одна дешёвая подписка).

---

## 7. Как узнавать «открыт чат X» и «новое сообщение в текущем чате» без DOM-наблюдателей

Доступ из MAIN world (после монтирования приложения):
```
const app    = document.querySelector('#app').__vue_app__
const pinia  = app.config.globalProperties.$pinia      // pinia._s: Map<storeId, store>
const router = app.config.globalProperties.$router
```
Сторы создаются лениво (`pendingMessages` — при монтировании composer). Покрыть уже созданные и будущие можно так:
обойти `pinia._s` и вызвать `pinia.use(({store}) => …)` — плагин применяется к сторам, созданным после регистрации
(`composables:449-454`).

| Способ | Что даёт | Зависит от | Стабильность |
|---|---|---|---|
| **Пассивный перехват WebSocket** (MAIN world, `document_start`: обёртка конструктора, которая вешает на каждый сокет `addEventListener('message')` и не трогает обработчики приложения; статические `CONNECTING/OPEN/...` сохраняются) | `account_new_message` (chatId, is_from_fan, content, sentAt, platformMetadata), `account_message_deleted`, `account_fan_typing`, PPV/типы, summary | URL `/api/chat-space/ws`, имена событий (контракт бэкенда) | **высокая**: минификация не влияет, формат задаёт бэкенд. Риски: перенос сокета в Worker/SharedWorker; события только по подписанным аккаунтам (у открытого чата аккаунт подписан всегда) |
| **`router.afterEach`** | `to.name === 'chat'`, `to.params.accountId`, `to.params.chatId` (числовой id фана OF), `to.query.firstId` (якорь) | vue-router API, имя маршрута `chat` (`composables:85882-85883`) | высокая–средняя: переключение вкладок чатов тоже идёт через `router.push` (`accounts:8651-8654`) |
| **`store.$onAction`** (`pendingMessages`: `enqueue`, `cancel`, `resend`, `confirmEchoedMessage`; `chatList`: `markChatAsRead`; `chats`: `upsertChats`; `ofComposerInsert`: `setInsertPayload`) | отправка человеком (`after()` возвращает созданную запись или `null`), локальное прочтение, обновление метаданных чатов | строковые id сторов и имена действий (ключи объектов переживают минификацию) | средняя: при рефакторинге имена меняют; Pinia оборачивает в действия все функции, которые вернул setup-стор (`composables:383-411`, `composables:432-439`), поэтому вызовы через объект стора видны |
| **`_pc_query.$onAction`** (`setQueryData`, `setEntryState`) с фильтром `key[0] === 'chatMessages'` | любое изменение истории чата: загрузка, WS-upsert, подтверждение отправки, unsent | ключи кэша приложения и API Pinia Colada (в этом сторе внутренние вызовы тоже обёрнуты через `action`, `composables:542-776`) | средняя: при обновлении Pinia Colada (версия 0.x) API может поменяться; `$subscribe` здесь бесполезен (кэш — shallowRef Map). Pinia оборачивает в действия **все** функции стора, так что колбэк зовётся на каждый `getQueryData/ensure/track/getEntries` — сначала проверять `name`, остальное отложенно |
| **Чтение кэша** `pinia._s.get('_pc_query').getQueryData(['chatMessages', acc, fan])` | история открытого чата `{pages: [{items: Message[], hasMore, cursor}], pageParams}`; внутри страницы от новых к старым | ключи кэша, формы объектов | формы объектов — низкая–средняя (при изменениях нужна адаптация) |
| **BroadcastChannel `chat-notifications`** | какие чаты открыты и видимы во вкладках (`{type: focus\|blur, key: 'acc:chat'}`, по `request-state` вкладки отвечают) | строковое имя канала (`messages:3600-3631`) | средняя; сигнал есть только при видимой вкладке |
| DOM (`data-testid`, `data-chat-id`, видимый `.ProseMirror`) | запасной вариант | разметка | низкая–средняя |

Оговорки по времени установки: WS-тап должен встать до создания сокета, то есть MAIN-world скрипт с
`run_at: document_start`. Если расширение установили или обновили при открытой вкладке, существующий сокет
перехватить нельзя — до перезагрузки страницы остаются Pinia/router (их можно подключить в любой момент). Обёртка
конструктора `WebSocket` должна сохранять статические `CONNECTING/OPEN/CLOSING/CLOSED`: ChatSpace сравнивает
`readyState` с `WebSocket.OPEN`/`WebSocket.CONNECTING` (`composables:86095`, `composables:86115`, `composables:86141`);
`Proxy` над конструктором сохраняет их сам.

Набросок двух самых тонких мест (MAIN world):
```
// 1) пассивный WS-тап: не трогаем onmessage приложения, только слушаем рядом
const Native = window.WebSocket
window.WebSocket = new Proxy(Native, { construct(T, args) {
  const ws = Reflect.construct(T, args)
  if (String(args[0]).includes('/api/chat-space/ws'))
    ws.addEventListener('message', e => { /* JSON.parse, фильтр по event, отдать в isolated world */ })
  return ws
}})                                   // статические WebSocket.OPEN и т.д. Proxy сохраняет

// 2) активный composer текущего маршрута
const el = [...document.querySelectorAll('[data-id="browser-composer-translator"]')]
  .find(n => n.offsetParent !== null)
el?.__omComposerBridge?.setText(text)  // только вставка; отправляет человек
```

Рекомендация: WS-тап как основной источник событий; `router.afterEach` — для «какой чат открыт»; кэш
`chatMessages` — для чтения истории (без своих GET); `pendingMessages.$onAction('enqueue')` — для факта отправки
человеком (например, чтобы сбросить панель предложений). При старте — проверка возможностей (feature probing) с
мягкой деградацией: нет моста → вставка через `.ProseMirror.editor`; нет Pinia → только WS и DOM.

---

## 8. `omWindowApi-DwjTAZsN.js` и OnlyMonster Browser

- Чанк почти целиком состоит из `@clerk/vue` (загрузка clerk-js, компоненты SignIn/UserButton/OrganizationSwitcher).
  Собственный код в конце: `t = () => window.OM_WINDOW` и `n(url)` — открыть URL в панели OM
  (`OM_WINDOW.openInPanel`) или новой вкладкой (`omWindowApi-DwjTAZsN.js:1641-1646`).
- `window.OM_WINDOW` подкладывает хост — десктоп-приложение OnlyMonster Browser. В диагностике оно так и названо:
  `isElectronHost: !!OM_WINDOW` (`composables-B_Bz2Xc6.js:425`). Найденные поля:

| Поле | Где | Смысл |
|---|---|---|
| `isEmbedded` | `MainLayout:322`, `accounts:9047`, `SignInView:9` | ChatSpace встроен панелью в главное окно OM |
| `openNewWindow(path?)` | `MainLayout:324-327`, `AccountsOverviewView:86-88` | открыть в отдельном окне («separate window mode», changelog 27.08) |
| `minimize()`, `toggleMaximize()`, `close()` | `MainLayout:262-298` | свои кнопки окна при `OM_WINDOW && !isEmbedded` (безрамочное окно, класс `app-region-drag`) |
| `isSecondaryWindow` | `composables:89678` | состояние вкладок хранится в sessionStorage, а не localStorage |
| `onNewTab(cb)` | `accounts:9131` | хост просит открыть вкладку аккаунта |
| `openInPanel(url)` | `omWindowApi-DwjTAZsN.js:1643-1645` | внешние ссылки (дашборд, кампании) |
| `toggleWidgetsPanel()`, `widgetsPanelOpen`, `onWidgetsPanelChange(cb)` | `ChatView:4533-4591` | нативные виджеты OM поверх пустой колонки `[data-id="browser-widgets-column"]` (`ChatView:7593-7597`) |
| `setActiveChat({accountId, chatId}\|null)`, `onNavigateToChat(cb)`, `showNotification({...})` | `messages:3730-3790`, `messages:3799-3808` | нативные уведомления вместо web Notifications |

- Признаки запуска внутри OM: `window.OM_WINDOW` существует. Встроенная панель — `OM_WINDOW.isEmbedded`, отдельное окно
  — `OM_WINDOW && !isEmbedded` (видны кнопки окна), вторичное окно — `isSecondaryWindow`. Колонка
  `browser-widgets-column` и кнопка виджетов появляются только с `OM_WINDOW`.
- **Расширения в OM Browser** (вывод, не проверено на самом приложении): по коду это Electron-хост. В Electron
  пользователь не может поставить расширение из Chrome Web Store; загрузить расширение может только код самого
  приложения (`session.loadExtension`, с урезанным API). В скачанной документации OM поддержка расширений не
  упоминается. Значит, ChatGoose-расширение работает, только когда чаттер открывает `chat.onlymonster.ai` в обычном
  Chrome/Chromium. Встроить ChatSpace в свой iframe тоже нельзя (`X-Frame-Options: DENY`, `frame-ancestors 'none'`).
- Важно для расширения: в обычном Chrome `OM_WINDOW` не подделывать — ChatSpace сразу переключит уведомления,
  хранилище и раскладку на «десктопный» режим.

---

## 9. Защита, детект, обфускация

- Детекта расширений нет: нет проверок `chrome.runtime`, `chrome-extension://`, `navigator.webdriver`, devtools,
  чужих глобалов.
- Integrity нет: скрипты в `index.html` без SRI (только `crossorigin`). Статика за CloudFront/Cloudflare.
- Обфускации нет: только минификация rolldown (короткие имена). Строки, ключи объектов, `__name` компонентов,
  `data-testid`, имена сторов и ключей кэша — открыты.
- Trusted Types: Vue, ProseMirror и DOMPurify создают политики, если `trustedTypes` есть, но CSP документа — только
  `frame-ancestors 'none'`, без `require-trusted-types-for`. Ограничений на `innerHTML` и инжект скриптов нет.
- `isTrusted` нигде не проверяется: синтетические события (click, input, keydown) приложение принимает. Нам это
  нужно только для вставки, не для отправки.
- Мониторинга DOM нет (§6.4). Телеметрия: Unleash шлёт метрики флагов (`POST /api/frontend/client/metrics` раз в
  60 с); Sentry-core есть, но DSN/init нет, поэтому `captureException` ничего не отправляет; Amplitude — ключ в
  конфиге без использования; Intercom/Hotjar/LogRocket и т.п. — нет. Наш UI никто не записывает.
- Санитизация входящего HTML сообщений — DOMPurify (запрещены `<a>`, `href`, `target`, `rel`, `composables:89344`).
- Ограничение на уровне продукта: право `om_block_chatspace_mobile` (экран блокировки на мобильных,
  `index-UvX_bFdW.js:2000`); право OM «Disable OnlyFans Access via Browser» касается доступа к onlyfans.com в
  OM Browser, а не ChatSpace.

---

## 10. Производительность

### 10.1 Вес и загрузка

- Всего ~5.1 МБ JS/CSS (FACTS). Критический путь (modulepreload в `index.html`): `composables-19O1xYoe.js` —
  **2.1 МБ** (5 словарей локалей de/en/es/ru/uk, video.js, luxon, DOMPurify, ky, PrimeVue core, Pinia/Pinia Colada,
  vue-router, vueuse, Sentry-core), `accounts` 217 КБ, `EmojiPicker` 160 КБ, `runtime-dom` 121 КБ, `omWindowApi`
  33 КБ (Clerk-vue).
- Лениво: `ChatView` 159 КБ, `messages` 449 КБ, `notificationEntry` 511 КБ, `fansOnlineEntry` 250 КБ, ProseMirror
  291 КБ (при первом composer), `PhotoEditor*` 201 КБ и `VideoEditorModal` 197 КБ (по требованию),
  `vuedraggable` 177 КБ.
- После загрузки `EmojiPickerWarmup` один раз невидимо рендерит эмодзи-пикер в `requestIdleCallback`
  (`index-UvX_bFdW.js:1968-1990`) — всплеск работы с DOM.
- Списки сообщений и чатов виртуализированы (virtua): в DOM только видимые строки.

### 10.2 Постоянный фон (без действий пользователя)

| Что | Период |
|---|---|
| `GET …/chats/badges` на каждый открытый аккаунт | 60 с (`accounts:8880-8920`) |
| Unleash `GET /api/frontend` + `POST …/client/metrics` | 60 с (`fanCardSettings-UahtlbOH.js:1321-1326`) |
| ilert `status.onlymonster.ai/api/summary` | 60 с (виджет из `index.html`) |
| `HEAD /index.html` (проверка новой версии по ETag) | 5 мин и при возврате на вкладку не чаще раза в 60 с (`MainLayout:127-170`) |
| `fans-online` по видимым чатам | 5 мин / TTL 60 с (§1.5) |
| Обновление токена Clerk | ~55 с |
| WS `account_notifications_summary` на аккаунт | ~61 с |
| Typing фанов: WS-события | каждые ~3–4 с на печатающего фана по всем подписанным аккаунтам |
| Реактивные часы 1 с / 60 с для таймеров и окна unsend | `composables:89544-89547` |

### 10.3 Где возможны лаги

- **Возврат на вкладку и фокус**: Pinia Colada по умолчанию делает `refetchOnWindowFocus`. Список чатов
  (`staleTime` 60 с) при фокусе перезагружает **все** загруженные страницы последовательно (`accounts:6648-6676`,
  механика infinite query `composables:875-905`).
- **Реконнект WS**: волна инвалидаций (§1.5). Принудительный реконнект бывает и на событиях `online/offline` окна.
- **Набор текста**: каждое изменение документа синхронно пишет черновик в localStorage (`JSON.stringify` TipTap JSON,
  `composables:89512-89523`) и раз в 3 с шлёт POST typing.
- Переходы между чатами: несколько параллельных GET (fans, insights, buying power, transactions, senders) — в логе
  ~30 запросов при открытии чата.

### 10.4 Чего расширению делать нельзя

1. Наблюдать `document.body` с `subtree: true` — виртуальные списки, анимации и таймеры дают поток мутаций. Только
   точечные подписки: атрибут `class` у `<html>`, слот composer, события стора и WS.
2. Опрашивать DOM таймером (`querySelectorAll` раз в N мс) — вместо этого `router.afterEach` и события сторов.
3. Порождать `focus/blur/visibilitychange` (окна, всплывашки, `window.focus()`) и диспатчить `online/offline` — это
   вызывает волны refetch и реконнекты WS.
4. Тяжело патчить `fetch`/`XMLHttpRequest` (через `fetch` идёт весь ky). Если нужен перехват — O(1), только нужные
   URL, `response.clone()` асинхронно.
5. Делать синхронную тяжёлую работу в обработчике WS-кадров (typing идёт постоянно). Парсить сразу, фильтровать по
   `event`, остальное — в `queueMicrotask` или в isolated world/service worker.
6. Мутировать объекты кэша Pinia Colada и стейт сторов — только чтение. Для действий есть публичные методы
   (`setInsertPayload`, мост). Подписки `$onAction` держать O(1): у `_pc_query` они вызываются на каждое обращение к
   кэшу из любого компонента.
7. Писать в ключи `chat-space:*` localStorage: useStorage синхронизирует их между вкладками, можно испортить
   состояние.
8. Вставлять узлы во внутренности Vue-списков и в `.ProseMirror` (§6.3).
9. Добавлять глобальный CSS: Tailwind preflight и PrimeVue легко сломать. Только Shadow DOM.
10. Делать свои `GET …/messages` для фоновых чатов (риск прочтения на OF, §3.4, и лишняя нагрузка на прокси OM).
11. Держать большой бандл в MAIN world: там только тонкий мост (перехват WS, Pinia/router, мост composer). Логику и UI —
    в content script (isolated) и background.

---

## 11. Service worker `notifications-sw.js` и web push

- Регистрируется из стора `notifications`, когда нет `OM_WINDOW`: `navigator.serviceWorker.register('/notifications-sw.js')`
  (scope `/`, `messages:3861-3866`).
- Весь SW — один обработчик `notificationclick` (`pretty/notifications-sw.js`): закрывает уведомление, ищет видимое
  окно клиента (или первое) и шлёт ему `postMessage({type: 'open-chat', accountId, chatId})` + `focus()`; если окон
  нет — `openWindow('/accounts/{acc}/chats/{chat}')`. Страница по такому сообщению делает `router.push`
  (`messages:3864-3866`).
- `push`-обработчика нет — первой строкой стоит TODO про Web Push (VAPID, хранение подписок). `pushManager.subscribe`
  в бандлах нет. `fetch`-обработчика нет: SW не кэширует и не перехватывает запросы, в том числе запросы расширения.
- Уведомления создаёт страница (`messages:3792-3850`): только при `Notification.permission === 'granted'` — через
  `registration.showNotification(title, {body, icon, tag, data: {accountId, chatId, id}})`, автозакрытие через 5 с,
  запасной вариант — `new Notification`; без разрешения — тост, если вкладка видима. Теги: `chat-{acc}-{fan}`,
  `ppv-…`, `tip-…`, `mimic-…`. Не уведомляют: исходящие; чат в фокусе (в этой или другой вкладке — по
  BroadcastChannel `chat-notifications`); замьюченные — флаг чата `isMuted` или фан в OF-списке `muted`
  (`platformMetadata.fromUser.listsStates`, `composables:63363`) (`messages:3634-3646`).
- Баннер запроса разрешения — `NotificationPermissionBanner` (`messages:3512-3590`, ключ
  `chat-space:notification-permission-banner-dismissed`); в OM Browser не показывается.
- Для расширения: SW не мешает. Свои уведомления расширение может слать через `chrome.notifications`, не трогая SW
  ChatSpace.

---

## 12. Справочник

### 12.1 Эндпоинты, которые видны в клиенте (база `https://onlymonster.ai/`)

| Назначение | Метод и путь |
|---|---|
| история чата | `GET api/v0/accounts/{acc}/chats/{fan}/messages?limit&cursor&first_id&force&filter=pinned&order=desc` |
| отправка | `POST api/v0/accounts/{acc}/chats/{fan}/messages` |
| unsend | `DELETE api/v0/accounts/{acc}/chats/{fan}/messages/{id}` |
| typing (мы печатаем) | `POST api/v0/accounts/{acc}/chats/{fan}/typing` |
| список чатов | `GET api/v0/accounts/{acc}/chats?limit=10&offset&filter&list_id&query&order&force` |
| счётчики табов | `GET api/v0/accounts/{acc}/chats/counts` |
| бейджи | `GET api/v0/accounts/{acc}/chats/badges` |
| прочитать всё / непрочитано | `POST …/platforms/onlyfans/chats/mark-as-read?filter&list_id` / `DELETE …/platforms/onlyfans/chats/{fan}/mark-as-read` |
| онлайн | `POST api/v0/accounts/{acc}/platforms/onlyfans/fans-online` |
| AI Suggestions (новые) | `GET api/v0/suggestions/accounts/{acc}/toolbar`, `POST …/chats/{fan}/generate {reply_id}` |
| AI кнопки (старые) | `GET api/creators/{platformAccId}/ai-assistant`, `POST …/ai-assistant/buttons/{id} {messages, pre_generate, smart, ai_provider: 'v2'}` |
| Mimic | `POST api/v0/copilot/accounts/{acc}/chats/activation`, `GET api/v0/copilot/chats`, `GET api/v0/copilot/settings` |
| права | `GET api/user/permissions` |
| аккаунты | `GET api/v0/accounts` |

### 12.2 Pinia-сторы, полезные расширению (id → поля и действия)

- `pendingMessages`: `messagesByAccountId`, `processingByAccountId`; `enqueue`, `cancel`, `resend`,
  `confirmEchoedMessage`, `resetForAccount`, `resetAll`.
- `ofComposerInsert`: `payloadsByChatKey`, `copiedMessage`; `setInsertPayload`, `clearInsertPayload`, `getInsertPayload`.
- `ofComposerReply`: `targetsByChatKey`; `setReplyTarget`, `clearReplyTarget`, `getReplyTarget`.
- `chats`: `chatsById`; `getChat`, `isFanOnline`, `isFanTyping`, `getFanOnlineFetchedAt`, `upsertChats`, `removeChats`,
  `updateOnlineStatuses`.
- `chatList`: `remove`, `markChatAsRead`, `markAllChatsAsRead`, `markChatAsUnread`, `removeChatFromList`,
  `reconcileChatListTabs`.
- `chatTabEntries`: `stateByAccountId` (`{[acc]: {entries: [{id, chatId}], activeEntryId, newMessagesByChatId}}`);
  `getActiveChatIdForAccount` и др.
- `tabEntries`: `openedEntries`, `activeEntryId`, `activeEntry` (вкладки аккаунтов).
- `accounts`: `subscribedAccountIds`, `supportedAccounts`, `openAccountIds`, `findAccount`.
- `_pc_query`: `getQueryData`, `setQueryData`, `getEntries`, `invalidateQueries`… (только чтение и наблюдение).
- `sidePanel`: `isOpen`, `isWidgetsVisible`, `activeTab`; `toggle`, `toggleWidgets`, `selectTab`.

### 12.3 Ключи localStorage `chat-space:*`

`theme-mode`, `locale`, `chat-appearance`, `draft:of:{acc}:{fan}`, `copiedMessage`, `chat-tabs:{omUserId}`,
`account-tabs:{omUserId}`, `active-account-tab:{omUserId}`, `pinned-chats:…`, `side-panel-open`,
`side-panel-widgets-visible`, `side-panel-tab`, `side-panel-order`, `side-panel-collapsed`, `side-panel-width`,
`chats-panel-width`, `chat-list-toolbar-height`, `chat-list-toolbar-expanded`, `composer-translator`,
`message-translator`, `chat-timers:…`, `chat-timer-presets:…`, `follow-up-settings`, `follow-up-presets`,
`quick-emojis`, `of-gif-favorites`, `my-kaomoji`, `hidden-chats`, `inbox-filter`, `fan-card-settings`,
`fan-spending-scope`, `sfw-mode`, `sfw-blur-scope`, `notification-permission-banner-dismissed`. Только чтение.

### 12.4 Стабильные DOM-якоря

`[data-id="browser-composer-translator"]` (+ `__omComposerBridge`), `[data-id="browser-widgets-column"]`,
`[data-testid="chats-panel"]`, `[data-testid="chat-list-item"][data-chat-id]`, `[data-testid="side-panel"]`,
`conversation-header-*-button`, `chat-timer-trigger`, `follow-up-trigger`, `notification-entry-button`,
`[data-dismissible-open]` (соглашение «Esc принадлежит оверлею»). Семантические (не Tailwind) классы composer:
`.composer-frame` (`messages:5517`), `.om-rich-text-editor` (`messages:1705`), `.om-rich-text-editor__content` на
элементе ProseMirror (`messages:1626`); сообщение — `.chat-message-block` (`composables:86718`). Активный composer:
`[data-id="browser-composer-translator"]` с `offsetParent !== null` → `closest('.composer-frame')` →
`.om-rich-text-editor__content`.

---

## 13. Что из этого следует для архитектуры расширения (кратко)

1. Два content script: **MAIN world, document_start** — тонкий мост (пассивный WS-тап; после монтирования —
   Pinia/router; поиск активного `__omComposerBridge`; вставка текста); **isolated world** — UI (Shadow DOM), хоткеи
   (window capture, document_start), связь с background. Между ними — `window.postMessage` с уникальным `source` и
   проверкой `event.source === window` (ChatSpace слушает `message` только от origin дашборда, `messages:11970-11985`).
2. Вставка: `bridge.setText`/`insertText` у видимого composer текущего маршрута. Запасной вариант — TipTap
   `.ProseMirror.editor.chain().focus().insertContent(...)`. Не использовать синтетический paste (метка `is_copied`).
   Для «вставить вместе с медиа» — `ofComposerInsert.setInsertPayload` для текущего (смонтированного) чата, но
   только если это продуктовое решение (правило D33: без запроса владельца новые возможности не добавлять).
3. Отправка — только человеком: расширение не вызывает `enqueue` и не кликает Send. Факт отправки ловить через
   `pendingMessages.$onAction('enqueue')` или WS-эхо.
4. Контекст для AI — из кэша `["chatMessages", acc, fan]` плюс WS-события; свои GET — только для открытого человеком
   чата.
5. Хоткеи — capture на `window` с document_start, для своих комбинаций `preventDefault` + `stopImmediatePropagation`;
   на время открытого оверлея — `data-dismissible-open` на хосте.
6. Тема — `--color-om-*` и класс `dark` у `<html>`.
7. Защита от релизов OM (несколько в день): опираться только на строковые контракты (§7, §12), проверять
   возможности при старте, деградировать без падения, логировать в свою телеметрию, какие якоря не нашлись.

---

## 14. Что осталось проверить вживую (код на эти вопросы не отвечает)

1. **Прочтение на OF при `GET …/messages`** (§3.4): открыть непрочитанный чат тестового фана в ChatSpace и посмотреть
   статус на стороне OF; отдельно — после Refresh (`force=true`). От ответа зависит, можно ли расширению вообще
   читать историю через API OM для неоткрытых чатов (по умолчанию — нельзя).
2. **Esc в composer** закрывает вкладку чата (§5.1) — подтвердить одним нажатием.
3. **Периодический re-auth** из FACTS: держать вкладку 15–20 минут и смотреть, закрывает ли сервер сокет (в логе
   будут новые `ws-open` без навигации). Код клиента сам re-auth не делает.
4. **WS-тап через Proxy** не ломает подключение: после установки проверить в Settings → Copy session log, что нет
   `reconnect-*` и `send-dropped`.
5. **Перехват Ctrl/⌘+E/I/S** в Chrome и в TipTap при фокусе в composer: курсив/код не включаются, браузерные действия
   (поиск в омнибоксе на Windows) не срабатывают.
6. **Docked-панель** при узком окне: проверить, что `ConversationPanel` (min-width 400) не обрезается, когда
   приложение сжато на ширину панели.
