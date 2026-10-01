# Каталог HTTP API веб-клиента OnlyMonster ChatSpace (chat.onlymonster.ai, v0.167.0)

> Источники: `om/pretty/*.js` (prettier-версии бандлов), `om/net-mytab.jsonl`, `om/net.jsonl`.
> Ссылки вида `composables:85943` = `pretty/composables-19O1xYoe.js`, строка 85943. Короткие имена файлов: `composables` (composables-19O1xYoe.js), `accounts` (accounts-gVgPsqTs.js), `ChatView` (ChatView-DgLPXTcj.js), `messages` (messages-2XnThXD9.js), `notif` (notificationEntry-DgP70ptm.js), `onlyfans` (onlyfans-3gv7h9YB.js), `inbox` (inbox-BVcu4p6i.js), `OfColl` (OfCollectionsDialog-CM7h25-0.js), `gallery` (ChatGalleryDialog-CPjzzS5P.js), `fansOnline` (fansOnlineEntry-C0AVLBRL.js).

## 0. Коротко
- Весь API — `https://onlymonster.ai/api/...` (ky, Bearer Clerk JWT на 60 c, таймаут 40 c, ретраи только GET/PUT/DELETE, на 401 — один повтор со свежим токеном). В таблицах ниже ~125 пар «метод+путь» (~100 шаблонов путей): `api/v0/...` (основное), `api/stats/...` (аналитика), `api/media-hub/...`, `api/creators/{pacc}/ai-assistant` (старый AI), `api/agency/preferences`, `api/user/permissions`.
- Отправка: `POST api/v0/accounts/{acc}/chats/{fan}/messages` `{text(HTML), is_copied, is_ai_generated, internal_template_id, reply_time:null, previous_message, platformMetadata{mediaFiles, previews, price, lockedText, giphyId, replyToMessageId, rfTag, rfGuest}}`. Идемпотентности нет; клиентская очередь последовательная по аккаунту, таймаут 30 c, подтверждение — WS-эхо `account_new_message` по совпадению текста.
- Отдельного mark-read одного чата нет: при открытии чата клиент только обнуляет локальный счётчик (у telegram_v2 — ещё `GET …/messages?limit=1`). Есть «прочитать все» (кнопка) и «пометить непрочитанным» (`DELETE …/mark-as-read`). Сама загрузка истории идёт к OnlyFans живьём и, вероятно, помечает чат прочитанным на стороне OF; вживую не подтверждено. Фоновой загрузки истории чужих чатов нет.
- Браузер к API onlyfans.com не ходит; медиа — через подписанный прокси OM `pw365.ompcdn.com`.
- Сверх OF: buying power 0-5, insights (temperature / reach / focus — кросс-креаторские), риск чарджбэка, траты по аккаунту и по организации, CRM-поля, статусы «отправлено/куплено» по медиа для фана, `last_sent_at` шаблонов, кто из чаттеров что отправил, архив отменённых сообщений.
- Мультиплатформенность: ChatSpace уже поддерживает `telegram_v2` (свой композер); Fansly-аккаунты в API есть, но ChatSpace их отфильтровывает; флаги Unleash про Fansly, Fanvue и Snapchat.

## 1. HTTP-клиент

- Библиотека: **ky** (встроена в бандл; `HTTPError` composables:62743-62755, `ForceRetryError`, `NonError`).
- Фабрика: `I4()` composables:85942-85975, синглтон `L4()` composables:85977 (экспорт `vt`; локальные алиасы: accounts→`V`, ChatView→`Z`, messages/notif/gallery→`K`, onlyfans→`V`, inbox→`A`, OfColl→`Se`, fansOnline→`nt`).
- `prefixUrl` = `r2.onlyMonsterUrl` = `https://onlymonster.ai` (composables:85183-85203); все пути относительные `api/...` → `https://onlymonster.ai/api/...`.
  Остальные адреса конфига: WS `wss://onlymonster.ai/api/chat-space/ws`, Clerk `https://clerk.onlymonster.ai`, Unleash `https://onlymonster.ai/api/frontend` (clientKey `*:development.…`), dashboard `https://dashboard.onlymonster.ai`, Amplitude key.
- `timeout: 40 000 мс` (`P4`, composables:85940).
- `retry: { limit: 2, backoffLimit: 3000 }` поверх дефолтов ky (composables:62989-62999): методы `get, put, head, delete, options, trace` (**POST и PATCH не ретраятся**), коды `408, 413, 429, 500, 502, 503, 504`, для `413/429/503` уважается `Retry-After`, задержка `0.3·2^(n-1)` c (≤3 c), `retryOnTimeout: false`.
- `beforeRequest` (composables:85956-85963): `Authorization: Bearer ${await getToken()}` (Clerk `useAuth().getToken`, кэш Clerk ~60 c JWT), и `Content-Type: application/json`, если есть body и заголовок не задан. Других заголовков (x-client-version и т.п.) нет.
- `afterResponse` → `N4` (composables:85930-85938): на **401** берёт `getToken({ skipCache: true })` и повторяет запрос один раз уже голым `ky(request, {timeout})` (без хуков и ретраев); если токена нет — `window.location.assign('/sign-in')`.
- Ошибки: `D4().handleError(err, {toastTitle, toastSubtitle, silent})` composables:85827-85837 → тост PrimeVue `{variant:'error', summary, detail}` + `console.group` + Sentry `captureException`. Subtitle: `TypeError` → «connection error» (i18n `shared.errorHandler.connectionError`); 4xx `HTTPError` → поле `message` из тела ответа (composables:63310-63328, `GP`): тело ошибки сервера = `{code, message, details:{upstream_message}}`. `AbortError` игнорируется (`lF`, composables:63385).
- Пермишены пользователя: `GET api/user/permissions` (composables:85990, `B4`), массив строк; ключ кэша `["userPermissions"]`.

## 2. Каталог эндпоинтов (черновые записи по мере прохода)

Обозначения: `{acc}` — id аккаунта (креатора) в OnlyMonster (число); `{fan}` — числовой id фана OnlyFans (= chatId); `{pacc}` — platform_account_id (id креатора в OnlyFans); `{org}` — org_id из JWT.

### 2.1 Аккаунты
| Метод | Путь | Параметры / тело | Ответ | Где |
|---|---|---|---|---|
| GET | `api/v0/accounts` | — | `{items:[{id, platform_account_id, platform, name, avatar, username, subscribe_price, status, expired_at, is_expired_soon, custom_label, note, timezone}]}` | accounts:2049-2065 (`wr`, ключ `["accounts"]`), маппер `Sr` accounts:2032 |
| GET | `api/v0/accounts/{acc}/chats/badges` | — | `{chat_messages_count, notifications_count}` | accounts:8879-8920 (`yp`/`wp`): **поллинг каждые 60 c** для каждого аккаунта, открытого во вкладке |
| GET | `api/v0/accounts/{acc}/settings` | — | см. §2.12 | notif:19718-19750 |

### 2.2 Чаты
| Метод | Путь | Параметры / тело | Ответ / смысл | Где |
|---|---|---|---|---|
| GET | `api/v0/accounts/{acc}/chats` | `limit=10`, `offset`, `force=true` (ручной refresh), `filter` ∈ {`unread`,`pinned`,`who_tipped`,`priority`}, `list_id` (id списка OF), `query` (поиск), `order=old` | `{items:[Chat], has_more, next_offset}` | accounts:6644-6700 (`Lu`); staleTime 60 c, gcTime 10 мин, `refetchOnWindowFocus: true`; фильтры accounts:6182, 6207 |
| GET | `api/v0/accounts/{acc}/chats/counts` | — | `{pinned_count, priority_count, unread_count, with_tips_count}` | ChatView:7600-7625 (`Ad`), только onlyfans, staleTime 5 мин |
| POST | `api/v0/accounts/{acc}/platforms/onlyfans/chats/mark-as-read` | query `filter`/`list_id` (вкладка) | «Прочитать все» (по вкладке); ошибка `MARK_CHATS_AS_READ_LIMIT_EXCEEDED` | accounts:6563-6593 (`ju`) — только по кнопке |
| DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/mark-as-read` | — | **«Пометить непрочитанным»** (оптимистично `unreadMessagesCount=1`) | accounts:6470-6487 (`vu`) |
| POST | `api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/hide` | — | Скрыть чат (OF hide), снимает локальный пин | accounts:6897-6912 (`ed`) |
| DELETE | `api/v0/accounts/{acc}/chats/{fan}` | — | «Очистить/удалить чат» (право `of_chat_blocking_hiding`) | accounts:6594-6610 (`Mu`), диалог `Nu` |
| POST / DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/mute` | — | mute / unmute | accounts:7313-7342 |
| POST | `api/v0/accounts/{acc}/platforms/onlyfans/fans-online` | `{fan_ids:[int]}` | `{online:[id], timed_out?}` | accounts:6789-6868 (`Qu`): только для **видимых** в списке чатов (IntersectionObserver по `[data-chat-id]`), только при `document.visibilityState==='visible'`, debounce 2 c, один фан не чаще раза в 60 c, цикл раз в 5 мин |
| — | пины чатов | — | **только localStorage** `chat-space:pinned-chats:{userId}` (useStorage), без API | accounts:6869-6896 (`$u`), ключ accounts:6184 |
| GET / POST / PUT / DELETE | `api/v0/accounts/{acc}/list-labels[/{listId}]` | POST `{list_id, name}`, PUT `{name}` | `{items:[{list_id, name}]}` — эмодзи-метки к спискам OF | accounts:6934-7002 (`rd`, `od`) |
| GET | `api/v0/accounts/{acc}/chats/{fan}/fan-status` | — | `{status, is_online, last_seen_at, online_expires_at}` — только платформы с `fan_peer_status` (telegram_v2) | accounts:8336-8362 (`Yf`) |
| GET | `api/v0/accounts/{acc}/platforms/telegram_v2/chats/lookup` | `chat_id` или `username` | `{chat}` | accounts:8159 |
| GET | `api/v0/accounts/{acc}/platforms/telegram_v2/lists` | `offset=0&limit=100` | `{items:[{id,name}]}` | ChatView:735-760 |
| GET / POST / DELETE | `api/v0/accounts/{acc}/platforms/telegram_v2/chats/{chat}/lists[/{folderId}]` | — | `{folder_ids:[]}` | ChatView:4897-4945 |

### 2.3 Фаны
| Метод | Путь | Параметры / тело | Ответ / смысл | Где |
|---|---|---|---|---|
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/fans` | `fan_ids` (повтор. параметр, пачки по 20), `force=true` | `{items:[сырой объект пользователя OnlyFans]}` | accounts:7098-7180 (`Od`), маппер `ud` accounts:7044-7066; staleTime 60 c |
| PATCH | `api/v0/accounts/{acc}/platforms/onlyfans/users/{fan}` | `{fan_custom_name}` | custom name (OF displayName) | accounts:7290-7305 (`Vd`) |
| POST / DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/users/{fan}/subscribe` | — | подписка креатора на фана (follow back) | accounts:7345-7375 |
| POST / DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/users/{fan}/restrict` | — | restrict / unrestrict | accounts:7390-7420 |
| GET | `api/v0/accounts/{acc}/fans/{fan}/insights` | — | `{temperature, reach, focus}` | accounts:8376-8440 (`rp`), по 6 параллельно, на 403 отключается для аккаунта, staleTime 30 мин |
| GET / PATCH | `api/v0/accounts/{acc}/fans/{fan}/info` | PATCH — частичный объект | `{birthyear, birthday, source, country, preferences[]}` — CRM-карточка OM (не OF) | ChatView:796-858 (`Vi`, `Ki`); WS `ACCOUNT_DATA_UPDATED{type:'user-notes'}` инвалидирует |
| GET | `api/agency/preferences` | — | `{data:{preferences[], sources[]}}` — справочник агентства для fan info | ChatView:822-834 |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/users/{fan}/stories` | retry 0 | `{items:[{media:[сырые OF media]}]}` | ChatView:3506-3527 (`Sc`) |
| GET | `api/v0/accounts/{acc}/chats/{fan}/messages` (5×100, `order=desc`) | — | вычисляет `lastResponseAt` фана и `lastReadAt` (исходящее с `isNew===false`) за 7 дней | ChatView:1655-1690 (`go`, ключ `fanMessageActivity`) |

### 2.4 Статистика (`api/stats/...`)
| Метод | Путь | Параметры | Ответ | Где |
|---|---|---|---|---|
| GET | `api/stats/platforms/onlyfans/buying_power` | `fan_ids` (пачки по 50) | `{items:[{id, buying_power}]}`, уровни 0..5 | accounts:7194-7240 (`Pd`), право `om_buying_power`, staleTime 30 мин |
| GET | `api/stats/accounts/{acc}/fans/transactions/latest` | `fanIds` (пачки по 50) | `{"<fanId>": "<ISO дата последней оплаты>"}` | accounts:7245-7290 (`Bd`), staleTime 5 мин |
| GET | `api/stats/platforms/{platform}/fans/{fan}/chargeback_info` | — | `{transactions_sum, chargebacks_sum}` → % и уровень (low <1%, medium <5%, high) | ChatView:1189-1209 (`wa`) |
| GET | `api/stats/organisations/{org}/platforms/{platform}/accounts/{pacc}/fans/{fan}/transactions_info` | scope=account | `{spent, avg_ppv, avg_tip, by_type{ppv,tips,subscription}{sum}, last_purchase{amount,type,date}, last_purchase_date, highest_purchase}` | ChatView:1230-1258 (`Aa`) |
| GET | `api/stats/organisations/{org}/platforms/{platform}/fans/{fan}/transactions_info` | scope=organization | то же, **по всем креаторам агентства** | ChatView:1249-1253 |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/transactions` | `limit=20`, `cursor` | `{items:[{id, created_at, amount_gross, amount_net, description(HTML), platform_fan_id, status('undo'=чарджбэк)}], next_cursor}` | ChatView:3575-3612 (`Rc`) |

### 2.5 Сообщения
| Метод | Путь | Параметры / тело | Ответ / смысл | Где |
|---|---|---|---|---|
| GET | `api/v0/accounts/{acc}/chats/{fan}/messages` | `limit=10`; `cursor` = id самого старого загруженного сообщения (клиент берёт `items.at(-1).id`); `first_id` = якорь (переход к найденному/из уведомления); `force=true` при ручном refresh | `{items:[RawMessage], has_more}` (у pinned/AI-подгрузки ещё `next_cursor`/`cursor`) | messages:5440-5480 (`ql`, ключ `["chatMessages",acc,fan(,anchor)]`), staleTime 60 c, `refetchOnWindowFocus:false` |
| GET | то же, `filter=pinned&limit=20&cursor` | — | закреплённые сообщения | messages:21275-21300 (`qD`) |
| GET | то же, `limit=60&cursor` (до 3 доп. страниц) | — | добор истории для старого AI-assistant | messages:17995-18024 (`GT`) |
| GET | то же, `limit=1` | — | **«прочитать при открытии» только для платформ с `marks_chat_read_on_open` (telegram_v2)** | ChatView:7212-7227 |
| GET | `api/v0/accounts/{acc}/chats/{fan}/messages/search` | `query` (3..100 символов), retry 0 | `{items:[messageId]}` → навигация по якорю `first_id` | ChatView:4304-4335 (`Fl`) |
| **POST** | `api/v0/accounts/{acc}/chats/{fan}/messages` | см. §3.1 | `{id, ...}` (id созданного сообщения) | notif:1351-1365 (`gi`), очередь `pendingMessages` notif:1427-1628 |
| DELETE | `api/v0/accounts/{acc}/chats/{fan}/messages/{msgId}` | retry 0 | **unsend** (OF «отменить отправку», окно `cancelSeconds`=60 c у свежего) | messages:20127-20129 (`oD`) |
| POST / DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/messages/{msgId}/like` | — | лайк | onlyfans:1140-1146 (`Qt`) |
| POST / DELETE | `…/messages/{msgId}/pin` | — | закрепить | onlyfans:1147-1151 (`$t`) |
| POST | `…/messages/{msgId}/hide` | — | скрыть сообщение | onlyfans:1152-1154 (`en`) |
| POST | `…/messages/{msgId}/report` | `{reason_id}` | пожаловаться | onlyfans:1155-1157 |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/report/reasons` | — | `{items:[{id, name/title}]}` | onlyfans:1158-1159 |
| POST | `api/v0/accounts/{acc}/chats/{fan}/typing` | timeout 3 c | «печатает…» к фану; троттлинг 1 раз в 3 c при изменении текста | messages:18334-18355 (`sE`, `lE`) |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/media` | `limit=50`, `cursor` | `{…, has_more, next_cursor}` — галерея медиа чата | gallery:195-230 (`Ge`) |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/gifs` | `limit=24`, `offset`, `search` | `{items:[{id,url}], has_more}` | messages:5683-5715 |
| GET | `api/v0/platforms/{platform}/accounts/{acc}/posts/users-to-tag` | `offset`, `limit`, `name` | `{items, has_more}` — креаторы для release-form тегов | messages:15160-15180 |
| POST | `api/v0/accounts/{acc}/platforms/onlyfans/vault/media/release-forms` | `{media_ids:[int]}` | `{items:[{type:'user'/'guest',…}]}` | messages:18356-18361 (`uE`) |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/posts/{postId}` | — | сырой пост OF (`postedAt, text, lockedText, favoritesCount, tipsAmount, price, preview[], media[]`) | onlyfans:300-318 (`pt`) |

### 2.6 Scheduled messages / follow-ups (серверная отложенная отправка)
| Метод | Путь | Тело / параметры | Ответ | Где |
|---|---|---|---|---|
| GET | `api/v0/accounts/{acc}/scheduled-messages` | `fan_id`, `limit=25` | `{items:[{send_id, account_id, fan_id, message_data{text, platform_medias{id:{type}}, locked_text, preview_platform_media_ids, price, platform_account_ids}, scheduled_at, rules{send_delay_seconds, skip_on_incoming_message}}]}` | messages:4562-4566 (`Xc`), маппер `rl` 4598 |
| POST | `api/v0/accounts/{acc}/scheduled-messages` | `{fan_id, message_data{…как выше}, rules{send_delay_seconds (60..7200), skip_on_incoming_message}, filter_list:[]}` | — | messages:4567, сборка `nl` 4583-4597 |
| DELETE | `api/v0/accounts/{acc}/scheduled-messages/{sendId}` | — | 404 = уже отправлено/нет | messages:4568-4570 |
WS: `account_scheduled_message_created/cancelled/sent/failed` (messages:5337-5380). Chat timers (`chatTimers`) — **только localStorage** `chat-space:chat-timers:{userId}` + браузерное уведомление, без API (messages:3917-3985).

### 2.7 Шаблоны (message-hub)
| Метод | Путь | Параметры | Ответ | Где |
|---|---|---|---|---|
| GET | `api/v0/message-hub/accounts/{acc}/folders` | `limit=200`; или `query` (3..255) + `limit=100` | `{items:[{id, name, templates_count}], nextCursor}` | messages:5983-6035 |
| GET | `api/v0/message-hub/accounts/{acc}/folders/{folderId}/templates` | `limit=200`, `fan_id` | `{items:[{id, folder_id, note, data{text, price, locked_text, medias{id:{type,duration}}, preview_media_ids, platform_account_ids}, last_sent_at}]}` — `last_sent_at` **для конкретного фана** (уже отправляли ли этот шаблон) | messages:6045-6066 |
| GET | `api/v0/message-hub/accounts/{acc}/templates` | `query`, `limit=25`, `offset`, `fan_id` | `{items, has_more}` | messages:6075-6095 |
Создание/редактирование шаблонов и кампаний — во встроенном iframe `https://dashboard.onlymonster.ai/...?accountId=…&embedded…` с протоколом postMessage `source:'om-control-panel'` (`campaignCreated`, `templateSaved`, `close`, `ready`, `formState`), messages:11930-12000. Шаблоны используют Liquid (liquidjs в бандле, messages:6280+).

### 2.8 Кампании / массовые рассылки
| Метод | Путь | Параметры / тело | Где |
|---|---|---|---|
| GET | `api/v0/accounts/{acc}/of-mass-messages` | `limit=20`, `to` (курсор) | messages:12757-12762 |
| POST | `api/v0/accounts/{acc}/of-mass-messages/{id}/unsend` | — | messages:12487-12497 |
| GET | `api/v0/accounts/{acc}/priority-mass-messages/campaigns` | `limit=20`, `offset`, `show_archived=false` | messages:12763-12776 |
| POST | `api/v0/accounts/{acc}/priority-mass-messages/campaigns/{id}/{start/pause/unsend}` | → `{status}` | messages:12498-12515 |
| GET | `api/v0/accounts/{acc}/auto-message-campaigns` | `limit=20`, `offset`, `show_archived=false` | messages:12777-12789 |
| PATCH | `api/v0/accounts/{acc}/auto-message-campaigns/{id}/status` | `{status}` | messages:12440-12452 |
| POST | `api/v0/accounts/{acc}/auto-message-campaigns/{id}/unsend` | — | messages:12453-12465 |
| GET | `api/v0/accounts/priority-mass-messages/campaigns/count` и `api/v0/accounts/auto-message-campaigns/count` | `account_id_list={acc}` → `{"<acc>":{active_count}}` | messages:12838-12862 |
Поля строк: `id, name, type, status, ui_status, trigger_type, created_at, created_by, user_id, scheduled_at, schedule_tz, recipient_count, message_data{text, platform_medias, price}, message_stats{sent_messages_count}, follow_up_message_stats, can_unsend, has_started, status_updated_at`.

### 2.9 Медиа: vault OF, Media Hub, загрузка, DRM
Важно: vault OF адресуется **по `platform_account_id`** (`api/v0/platforms/onlyfans/accounts/{pacc}/…`), метаданные OM — по `{acc}`.
| Метод | Путь | Параметры / тело | Ответ / смысл | Где |
|---|---|---|---|---|
| GET | `api/v0/platforms/onlyfans/accounts/{pacc}/vault/folders` | `offset, limit, search, force=true` | `{items, has_more}` | composables:71500-71520 (`UG`) |
| POST | `api/v0/platforms/onlyfans/accounts/{pacc}/vault/folders/sort` | `{sort, order}` | **меняет сортировку vault в аккаунте OF** (клиент ставит нужную, читает, возвращает обратно) | composables:71640-71665 (`XG`) |
| GET | `api/v0/platforms/onlyfans/accounts/{pacc}/vault/folders/{folderId}/medias` | `offset, limit, type, field, sort, force, search (поиск по содержимому изображений), published_to` | `{items, has_more}` | composables:71296-71310 (`zG`) |
| GET | `api/v0/platforms/onlyfans/accounts/{pacc}/vault/media/urls` | `media_ids` (повтор.) | `{items:[{media_id, urls{thumbnail, full, drm{manifest}, previews[]}}]}` | composables:71450-71465, onlyfans:542-560 |
| GET | `api/v0/accounts/{acc}/vault/medias/metadata` | `media_ids` | `{items:[{media_id,…}]}` (описание, price_net, теги OM) | composables:71250-71262 |
| PUT | `api/v0/accounts/{acc}/vault/medias/{mediaId}/metadata` | `{description, price_net, tag_ids}` | — | composables:72040 |
| POST | `api/v0/accounts/{acc}/vault/medias/metadata` | `{media_ids, description?, price_net?, tag_ids?}` | bulk | composables:72042-72050 |
| GET / POST | `api/v0/accounts/{acc}/vault/tags` | POST `{name}` → `{tag_id}` | `{items}` | composables:71490-71500, 72612-72620 |
| GET | `api/media-hub/accounts/{acc}/folders` | `order=desc, offset, limit=20, include_counters, include_platforms_counters` | Media Hub (библиотека OM) | composables:71135-71145 |
| GET | `api/media-hub/accounts/{acc}/folders/{id}/medias` | `order, offset, limit, include_medias_mapping=required, include_metadata, include_tags, type, tag_ids` | | composables:71068-71085 |
| GET | `api/media-hub/tags` | — | | composables:71437 |
| GET | `api/v0/platforms/onlyfans/accounts/{pacc}/fans/{fan}/medias/stats` | `media_ids` (≤100) | `{items:[{media_id, message_id, price, sent_at, purchased_at}]}` → статусы paid / unpaid / free / not sent **для этого фана** | composables:71785-71830 (`hK`) |
| GET | `api/v0/platforms/onlyfans/accounts/{pacc}/fans/{fan}/medias/sync-status` | — | `{status: actual/resyncing/throttling, lastSyncAt}`; поллинг раз в 30 c до 5 мин | composables:71894-71960 (`vK`) |
| POST | `api/v0/accounts/{acc}/vault/uploads/start` | `{name, size, content_type, duration}` | single `{put_url, get_url, key, upload_token}` или multipart `{upload_id, key, parts:[{id, put_url}], get_url, upload_token}` (>5 МБ; до 4 ГБ) | messages:16725, 16790-16812 |
| PUT | presigned S3 URL (`put_url`) | файл | загрузка из браузера напрямую в S3 OM (Uppy AwsS3) | messages:16815-16850 |
| POST | `api/v0/accounts/{acc}/vault/uploads/finish` | `{key, secure:false, upload_id, parts:[{e_tag, part}]}` | `{e_tag}` | messages:16726-16734 |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/medias/hash` | `hash` (=ETag), `file_size` | `{media}` — дедуп: если такой файл уже в vault, берётся его id | messages:16736-16741 |
| POST | `api/v0/accounts/{acc}/platforms/onlyfans/medias/upload` | `{file_name, e_tag, location(get_url), key, upload_token}` | `{processId, host, extra, duration, thumbs[{url}], sourceUrl}` → это `uploadDescriptor`, который кладётся в `mediaFiles` при отправке | messages:16735, 16878-16893 |
| GET | `api/v0/platforms/onlyfans/accounts/{pacc}/medias/drm/certificate` | — | сертификат FairPlay (binary) | onlyfans:202-207 |
| POST | `api/v0/platforms/onlyfans/accounts/{pacc}/medias/{mediaId}/drm/license` (vault), `…/drm/message/{msgId}/license?fan_id=` (сообщение), `…/drm/post/{postId}/license` (пост); `?type=fairplay/widevine` | binary challenge, `Content-Type: application/octet-stream` | лицензия DRM — **проксируется бэкендом OM** | onlyfans:200-263 |

### 2.10 AI
| Метод | Путь | Тело | Ответ | Где |
|---|---|---|---|---|
| GET | `api/v0/suggestions/accounts/{acc}/toolbar` | — | `{suggestions_enabled, replies:[{id,name}], auto_generate_reply}` | messages:18094-18098 (`XT`), ключ `["suggestionsToolbar",acc]`, staleTime 0 |
| POST | `api/v0/suggestions/accounts/{acc}/chats/{fan}/generate` | `{reply_id}` | `{text}` — **без стриминга** (`.json()`), контекст строит сервер; 400 «This chat has no fan message…» | messages:18099-18102 (`ZT`), `QT` 18103-18130 |
| GET | `api/creators/{pacc}/ai-assistant` | — | `{data:{buttons:[{id, …, minimum}]}}` — старый AI-assistant (если флаг `droidz.ai-1353.NEW-ai-replies` выключен) | messages:18045-18056 (`JT`), ключ `["aiSettings",pacc]` |
| POST | `api/creators/{pacc}/ai-assistant/buttons/{buttonId}` | `{messages:["Fan: …","Creator: …"] (≤25, старые→новые, мин. 5), pre_generate:false, smart:false, ai_provider:"v2"}` — **транскрипт собирает клиент** | `{data:{message}}` | messages:18060-18075, сборка `WT`/`GT` 17975-18024 |
| GET | `api/v0/copilot/settings` | — | `{is_active}` (Mimic) | inbox:196-207 |
| GET | `api/v0/copilot/chats?status=enabled&status=escalated` | — | `{chats:[{account_id, fan_id, status, escalation_type, escalation_reason, activated_at, updated_at}]}` | inbox:240-256 |
| POST | `api/v0/copilot/accounts/{acc}/chats/activation` | `{fan_id, status:'enabled'/'disabled', actor_type:'user', deactivation_reason:'manual'}` | 400 «Mimic is disabled for account» | inbox:355-368 |
Флаг `auto_generate_reply` в ответе toolbar в этой версии клиента **не используется** (нет ссылок). Какой контур активен, решает флаг Unleash `droidz.ai-1353.NEW-ai-replies` (messages:18133-18140); в организации он включён → работает новый `suggestions/…/generate`.

### 2.11 Переводчик
| Метод | Путь | Тело | Ответ | Где |
|---|---|---|---|---|
| POST | `api/v0/ts/translate` | `{text, translator_id, direction:2 (outgoing), target_lang, source_lang?, account_id, chat_history?}` (режим CUSTOM) | `{translated_text, source_language}` | messages:2643-2662 |
| POST | `api/v0/ts/translate-creative` | `{text, targetLanguage, sourceLanguage?, creativityLevel (1 default, 2 native, 3 creative), chatHistory?}` (режим SYSTEM) | `{translation, sourceLanguage}` | messages:2663-2676 |
| POST | `api/v0/ts/translate-batch` | `{messages:[…], lang, translatorId?, sourceLang?}` (входящие) | `{data:{translations[], sourceLanguage}}` | messages:2993-3007 |
| GET | `api/v0/ts/accounts/{acc}` | — | `{incoming{mode,…}, outgoing{mode, targets, fromLangs…}}` | messages:2880-2893 |
| GET | `api/v0/translator/supported-languages` | — | `{languageOptions, nativeCreativitySupportedLanguagePairs}` | messages:2897-2910 |
| GET | `api/v0/ts/translator/profiles` | — | `{items:[{id, type, direction, name, translate_from, translate_to, supported_langs, supported_pairs, connected, api_key_connected, deleted_at}]}` | messages:2914-2927 |
Все — только при праве `om_message_translator`.

### 2.12 Логи, пользователи, организация
| Метод | Путь | Параметры | Ответ / смысл | Где |
|---|---|---|---|---|
| GET | `api/user/permissions` | — | массив строк-прав (179 шт. у тестового пользователя) | composables:85985-85996 |
| GET | `api/v0/accounts/{acc}/platform/onlyfans/logs/messages/senders` | `message_ids` (≤100) | `[{message_id, user_id, origin: 'auto'/'pmm'/'copilot'/'scheduled_messages'/null}]` — **какой чаттер/автоматика отправил каждое исходящее** | onlyfans:1413-1416, `Pn` 1440-1500 |
| GET | `api/v0/accounts/{acc}/platform/onlyfans/logs/mass-messages/senders` | `message_ids` (= queueId) | `[{message_id, user_id, unsent_by_user_id}]` | onlyfans:1409-1412 |
| GET | `api/v0/users` | `ids` (≤50), `includeDeletedOrgMembers=true` | `{users:[{id, name, avatar}]}` (право `of_view_message_sender`) | onlyfans:1547-1560 (`Bn`) |
| GET | `api/v0/organisations/{org}/platforms/onlyfans/logs/messages/unsent` | `from, to` (30 дней), `creator_ids={acc}`, `fan_ids={fan}`, `unsent_by=human`, `offset=0`, `limit=100` | `{items:[{id, content, sent_at(ms), giphy_id, unsent_by, media_ids}]}` — **архив отменённых сообщений** (право `om_chatter_metrics`) | onlyfans:1660-1700 (`Jn`) |
| GET | `api/v0/accounts/{acc}/settings` | — | `{id, account_id, special_online_fans_list, auto_promotions, auto_follow, emoji_list[{value}], dialogs_splitting, note_template_title, note_template_description, monthly_revenue_goal, created_at, updated_at}` | notif:19718-19750 (`Ef`) |
| GET | `api/v0/accounts/{acc}/chat-color-groups` | — | `{enable, items:[{id,name,color}]}` («инбоксы»/цветные группы; 403 = нет функции) | notif:19928-19955, маппер inbox `ct` |
| GET | `api/v0/accounts/{acc}/chat-color-groups/linked-fans` | `fan_ids` (≤100) | `{items:[{fan_id, chat_color_groups_id}]}` | notif:20160-20185 |
| POST | `api/v0/accounts/{acc}/chat-color-groups/linked-fans` | `{fan_id, chat_color_groups_id}` | — | notif:20310-20320 |
| GET | `api/v0/accounts/{acc}/analytics/fans/online-ranked` | `limit=20, sort, cursor` | `{items:[{fan_id, last_purchase_at_account}], next_cursor}` — виджет «фаны онлайн» | fansOnline:9895-9915 |

### 2.13 Списки (collections) OnlyFans
| Метод | Путь | Параметры / тело | Где |
|---|---|---|---|
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/lists` | `offset, limit, filter=chat (закреплённые в списке чатов), query` → `{items, has_more, next_offset}` | notif:20815-20826 |
| PATCH | `api/v0/accounts/{acc}/platforms/onlyfans/lists/{listId}` | `{is_pinned_to_chat}` | notif:20870 |
| DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/lists/{listId}` | удалить список | OfColl:1324 |
| GET | `api/v0/accounts/{acc}/platforms/onlyfans/lists/{listId}/users` | `offset, limit=30` → `{items:[OF user], has_more, next_offset}` | OfColl:1640-1655 |
| DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/lists/{listId}/users` | очистить список | OfColl:1323 |
| POST / DELETE | `api/v0/accounts/{acc}/platforms/onlyfans/lists/{listId}/users/{fan}` | добавить / убрать фана | notif:21045-21070 |

### 2.14 Уведомления (OnlyFans notifications)
| Метод | Путь | Параметры / тело | Ответ | Где |
|---|---|---|---|---|
| GET | `api/v0/accounts/{acc}/notifications` | `limit=20, type ∈ {all, purchases, subscribed, tip, commented, mentioned, favorited, message, deactivated_media}, cursor` | `{items, has_more}` | notif:21664-21690 |
| GET | `api/v0/accounts/{acc}/notifications/count` | — | `{items:{type:count}}` | notif:21844-21860 |
| GET | `api/v0/accounts/{acc}/platform/notifications` | `ids` (≤20) | `{items:[{notification_id, replied_by_user_id, replied_at}]}` — кто из команды ответил | notif:21740-21760 |
| PUT | `api/v0/accounts/{acc}/platform/notifications/{id}` | `{reply_message}` | отметка «ответили» | notif:21826-21836 |
Быстрый ответ из уведомлений = `pendingMessages.enqueue({text, platformMetadata:{}})` (notif:21930-21940).

### 2.15 WebSocket `wss://onlymonster.ai/api/chat-space/ws` (дополнение к FACTS)
- Клиент `J4`/`Q4` composables:86016-86222: реконнект с экспоненциальной задержкой `min(1 c·2^n, 30 c)+jitter`, бюджет 10 попыток онлайн / 3 офлайн; переподключение при `online`/`offline`, при возврате вкладки в `visible`.
- Каждое действие отправляется со **свежим токеном**: `{action, token: await getToken(), ...}` (composables:86196-86199). Действия: `ping`, `auth`, `subscribe_account`, `unsubscribe_account` (composables:86224). `auth` ждёт `authenticated` 10 c, 3 попытки (composables:86280-86320).
- Подписка только на аккаунты, **открытые во вкладках**, и только платформ `onlyfans` / `telegram_v2` (`zp`, accounts:9272-9330).
- Полный список событий сервера (composables:86225-86261): `authenticated, account_messages_summary, account_notifications_summary, account_new_message, account_message_deleted, account_fan_typing, account_fan_ppv_purchased, account_fan_tip_received, account_scheduled_message_{created,cancelled,sent,failed}, accounts_list_updated, account_data_updated, notification_reply, org_user_permissions_updated, org_user_access_revoked (→ перезагрузка страницы / сброс прав), folder_{created,updated,deleted}, template_{created,updated,deleted,sent}, org_copilot_chat_changed, org_copilot_settings_updated, org_copilot_chat_escalation, chat_color_group_{created,updated,deleted}, chat_color_groups_toggled, chat_color_groups_linked_fans, list_label_{created,updated,deleted}`.
- `account_new_message` (messages:21233-21252, accounts:6342-6356): входящее → `unreadMessagesCount+1` в кэше списка (**даже если чат сейчас открыт**) и инвалидация `chatCounts`; исходящее → `unreadMessagesCount=0`; сообщение вставляется в кэш истории без HTTP-запроса; для исходящих вызывается `pendingMessages.confirmEchoedMessage`.
- `account_message_deleted {account, message_id}` → при праве `om_chatter_metrics` сообщение помечается «unsent», иначе удаляется из кэша (messages:21254-21270).
- При реконнекте WS инвалидируются запросы истории/списков → **перезапрос истории открытого чата** (messages:21229-21231).

### 2.16 Прочие хосты
| Хост | Что | Где |
|---|---|---|
| `clerk.onlymonster.ai` | `GET /v1/client`, `GET /v1/environment`, `POST /v1/client/sessions/{sid}/tokens` (новый JWT, ~раз в 60-80 c при активности), `POST …/touch` | clerk-js 6.36.0 (FACTS), логи |
| `onlymonster.ai/api/frontend` | Unleash proxy: `GET ?appName=chat-space&userId&sessionId&properties[agencyId/email/name]`, `refreshInterval: 60` c; `POST /api/frontend/client/metrics` | fanCardSettings:1318-1324 |
| `status.onlymonster.ai/api/summary` | виджет статуса ilert (поллинг) | index.html |
| `chat.onlymonster.ai/index.html` | `HEAD` раз в 5 мин и при возврате на вкладку (не чаще 1/мин) — проверка новой версии | MainLayout:127-155 |
| `pw365.ompcdn.com` | **подписанный медиа-прокси OM поверх CDN OnlyFans**: `/cdn/v1/of/av/public.onlyfans.com/files/…?exp=&m=&p=&sig=`; в него бэкенд переписывает URL, которые реально рендерятся (аватары `avatar`/`avatarThumbs`, `media[].files.{full,thumb,preview,squarePreview}`), видео отдаётся 206 | логи |
| `cdn.onlymonster.ai` | аватары аккаунтов (`/account_avatars/…`) из `GET api/v0/accounts` | логи |
| `*.onlyfans.com` (`public.`, `thumbs.`, `cdn2.`) | **сырые** URL OF CDN остаются в нерендеримых полях (`header`, `headerThumbs`, `videoSources`, аватары в `lists[].users[]`, `replyToMessage.fromUser`); в записанной сессии браузер к ним не ходил. API onlyfans.com браузер не вызывает (в бандлах `onlyfans.com` есть только для копирования ссылок: accounts:7067-7069, messages:20199, composables:86540) | логи, код |
| `media.giphy.com` | GIF по `giphyId` | composables:86407 |
| presigned S3 (`put_url`) | загрузка медиа из браузера | messages:16815-16850 |
| `dashboard.onlymonster.ai` | iframe создания кампаний/шаблонов | messages:11930-12000 |
| `window.OM_WINDOW` | мост к Electron-хосту OnlyMonster Browser: `isEmbedded`, `openNewWindow`, `openInPanel`, `onNewTab`, `toggleWidgetsPanel`, `minimize/toggleMaximize/close`, нативные уведомления | omWindowApi:1640-1646, MainLayout:262-325, messages:3792-3918 |

## 3. Формы ключевых запросов и ответов (обезличенно; `str/num/bool/iso` — типы)

### 3.1 Отправка сообщения — `POST api/v0/accounts/{acc}/chats/{fan}/messages` (notif:1351-1365)
Запрос (собирается в `OfMessageComposer.submit` messages:18620-18650 → `pendingMessages.enqueue` → `gi`):
```json
{
  "text": "<p>…</p>",                 // HTML из TipTap getHTML(); у быстрых ответов/Telegram — plain text
  "is_copied": false,                 // true, если весь текст = последняя вставка из буфера (RT, messages:17947-17980)
  "is_ai_generated": false,           // true, если текст ≈ (сходство ≥0.85) ответу AI OM
  "internal_template_id": null,       // id шаблона, если текст/медиа совпадают с вставленным шаблоном
  "reply_time": null,                 // всегда null
  "previous_message": { "id": 123, "created_at": "iso", "is_fan_message": true },  // последнее сообщение из кэша или null (notif:1366-1384)
  "platformMetadata": {               // gE, messages:18400-18416 — 1:1 поля нативного OF API
    "mediaFiles": [123, {"id":123,"thumbId":0}, {"processId":"…","host":"…","extra":"…", "name":"…","duration":0,"thumbUrl":"…","sourceUrl":"…"}],
    "previews": [123],                // бесплатные медиа в платном сообщении
    "price": 15,                      // USD, только если > 0
    "lockedText": true,
    "giphyId": "…",
    "replyToMessageId": 123,
    "rfTag": [123], "rfGuest": [123]  // release-form теги
  }
}
```
Ответ: по коду используется только `id` нового сообщения (`p(e, n.id)`, notif:1499). Ошибки: `{code, message, details:{upstream_message}}`; `code:"MESSAGE_GUARD_VIOLATION"` + `word_matches[]`, `topic_matches[]` (запрещённые слова/темы: underage, direct_contact, third_party_payment… notif:1305-1350). Подробно см. §4(а).

### 3.2 История — `GET api/v0/accounts/{acc}/chats/{fan}/messages?limit=10[&cursor=<id>|&first_id=<id>][&force=true]` (реальное тело)
```json
{ "items": [ { "id": "str", "content": "HTML", "sent_at": "iso", "is_from_fan": "bool",
    "platform_metadata": { "responseType","giphyId","lockedText","isFree","price","isMediaReady","mediaCount",
      "media":[…], "previews":[…], "isTip","isReportedByMe","isCouplePeopleMedia","queueId","isMarkdownDisabled",
      "releaseForms":[…], "isFromQueue","isOpened","isNew","changedAt","cancelSeconds","isLiked","canPurchase",
      "canPurchaseReason","canReport","canBePinned","isPinned","isAddedToBookmarks","chatUserId" } } ],
  "platform_fan_id": "str", "has_more": "bool", "next_cursor": "str" }
```
`platform_metadata` — практически сырой объект сообщения OnlyFans. Клиент сам вычисляет курсор как id последнего элемента (`next_cursor` игнорирует). Сервер принимает и `limit=60/100`, `order=desc` (ChatView:1676-1681, messages:18017). Маппер `Y3` composables:86656-86667; статус доставки исходящего: `isNew===false` → «прочитано фаном» (composables:89277-89279).

### 3.3 Список чатов — `GET api/v0/accounts/{acc}/chats?limit=10&offset=…` (реальное тело)
```json
{ "items": [ { "platform_fan_id": "str", "unread_messages_count": "num",
    "last_message": { "id","content","sent_at", "platform_metadata": { …как в истории…, "fromUser": {сырой объект пользователя OF}, "toUser"? } },
    "platform_metadata": { "canGoToProfile","canNotSendReason","canSendMessage","countPinnedMessages",
      "hasPurchasedFeed","hasUnreadTips","isMutedNotifications","lastReadMessageId" } } ],
  "has_more": "bool", "next_offset": "num" }
```
Маппер `w7` composables:89361-89372.

### 3.4 Фан — `GET api/v0/accounts/{acc}/platforms/onlyfans/fans?fan_ids=…` (реальное тело)
`{items:[сырой пользователь OF]}`, ключи: `avatar, avatarThumbs, canAddSubscriber, canCommentStory, canEarn, canLookStory, canPayInternal, canReceiveChatMessage, canReport, canRestrict, canTrialSend, currentSubscribePrice, displayName (= custom name), hasNotViewedStory, hasScheduledStream, hasStories, hasStream, header, headerSize, headerThumbs, hideChat, id, isActive, isBlocked, isPerformer, isRealPerformer, isRestricted, isVerified, lastSeen, listsStates[{id,type,name,hasUser,canAddUser,cannotAddUserReason}], name, notice (заметка), subscribePrice, subscribedBy, subscribedByAutoprolong, subscribedByData{…}, subscribedByExpire, subscribedByExpireDate, subscribedIsExpiredNow, subscribedOn, subscribedOnData{price, newPrice, regularPrice, subscribePrice, discountPercent, discountPeriod, subscribeAt, expiredAt, renewedAt, discountStartedAt, discountFinishedAt, status, isMuted, unsubscribeReason, duration, tipsSumm, subscribesSumm, messagesSumm, postsSumm, streamsSumm, totalSumm, subscribes[…], hasActivePaidSubscriptions}, subscribedOnDuration, subscribedOnExpire, subscribedOnExpiredNow, tipsEnabled, tipsMax, tipsMin, tipsMinInternal, tipsTextEnabled, username, view`. Время ответа ~350 мс (кэш OM; `force=true` — обновить).

### 3.5 Insights — `GET api/v0/accounts/{acc}/fans/{fan}/insights`
`{"temperature": num (1-4 «насколько тёплый фан сейчас»), "focus": num (1-4 «на скольких креаторах сосредоточен»), "reach": num (1-6 «на скольких креаторов подписан»), "generated_at": iso}` (описания — work/en-locale.js:460-492).

### 3.6 `GET api/stats/accounts/{acc}/fans/transactions/latest?fanIds=…&fanIds=…`
`{"<fanId>": "YYYY-MM-DD HH:MM:SS+TZ"}` — дата последней оплаты фана этому аккаунту.

### 3.7 `GET api/stats/platforms/onlyfans/buying_power?fan_ids=…`
`{"items":[{"id": num, "buying_power": "0".."5"}]}` — строка; «OnlyMonster rating, updated automatically» (en-locale:452-456); в пути нет ни аккаунта, ни организации.

### 3.8 `GET api/user/permissions`
`{"status":"ok","data":[…строки…]}` — 179 у владельца: префиксы `om_`(64), `fansly_`(38), `of_`(31), `telegram_`(25), `snapchat_`(14), `fanvue_`(7). Важные для чата: `om_use_chatspace`, `of_messages` (менять статус прочтения, accounts:7502, ChatView:4188), `of_block_message_sending` (запрет отправки, если не владелец — ChatView:4258, 6927), `of_unsend_messages`, `of_chat_blocking_hiding`, `of_mute_chats`, `of_view_message_sender`, `om_buying_power`, `om_chatter_metrics`, `om_message_translator`, `om_ai_assistant_buttons`, `om_view_copilot`. `isOwner` = бит 0 маски `public_metadata.permissions` из JWT (composables:86355, 86362-86366).

### 3.9 AI-подсказка — `POST api/v0/suggestions/accounts/{acc}/chats/{fan}/generate`
Запрос `{"reply_id": num}` (id из `toolbar.replies`). Ответ 200 `{"text": "…"}` (по коду, messages:18117), ошибка 400 `{"message": "This chat has no fan message to generate from"}`. Время ответа ~10 c, **стриминга нет**. Вставка результата в редактор помечается `trackAiGenerated` → `is_ai_generated:true` при отправке (messages:18676-18685).

## 4. Ответы на ключевые вопросы

### (а) Как именно отправляется сообщение
1. **Редактор → submit.** TipTap-композер `OfMessageComposer` (messages:18436+). Если у чаттера включён переводчик с автопереводом (настройки в localStorage `chat-space:composer-translator:accounts:{userId}`), submit перехватывается обёрткой `aE`/`iE`: текст сначала переводится, перевод записывается в редактор и только потом уходит (messages:18194-18300). Кнопка Send выключена, пока идёт загрузка медиа/запись голоса/неполный платный режим (messages:18610).
2. **Сборка.** `submit` (messages:18620-18650): `text` = `editor.getHTML()` (если есть непустой текст), атрибуция `internal_template_id / is_copied / is_ai_generated` из трекера `RT` (messages:17947-17980), `platformMetadata` из `gE` (медиа, превью, цена, lockedText, GIF, reply, release-form теги).
3. **Очередь `pendingMessages`** (notif:1427-1628): `enqueue` создаёт запись с **клиентским UUID — он только локальный и на сервер не уходит**; статусы `pending → sending → (удалено | failed | confirmed)`. Очередь последовательная **по аккаунту** (одновременно один POST на аккаунт, `g` notif:1528-1542). Лимит 50 ожидающих на чат («queue full», notif:1426, 1543-1567). Если чат ведёт Mimic (copilot `isActive` и статус чата `enabled`) — запись сразу `failed: mimicTakeover`, а композер заблокирован (notif:1533-1536, inbox:637).
4. **HTTP.** `POST api/v0/accounts/{acc}/chats/{fan}/messages` (тело — §3.1). **Ключа идемпотентности / client id нет** ни в теле, ни в заголовках (проверено и по коду, и по заголовкам в логах). ky **не ретраит POST** (ретраи только для GET/PUT/HEAD/DELETE). Собственный таймаут очереди 30 c через AbortController (`Ti`, notif:1425, 1471-1480) поверх ky-таймаута 40 c.
5. **Успех.** По `id` из ответа в кэш истории вставляется локальное сообщение (`xi`, notif:1406-1414, `cancelSeconds: 60`), запись удаляется из очереди (notif:1499).
6. **Эхо (`confirmEchoedMessage`, notif:1574-1588).** Обработчик WS `account_new_message` (messages:21228-21252) для исходящих вызывает `confirmEchoedMessage(acc, chatId, content, уже_в_кэше?)`. Сопоставление — **по chatId + равенству «очищенного» текста** (`hF`: убрать HTML-теги, раскодировать сущности, trim — composables:63394-63396): запись в статусе `sending` → `confirmed` (если потом POST упадёт или отвалится по таймауту — запись просто удаляется как доставленная); запись `failed` с `kind:'timeout'` и тем же текстом → удаляется (значит, на самом деле ушло). Если сообщение с этим id уже в кэше (ответ POST пришёл раньше эха), выполняется только чистка «таймаутных» записей. Слабые места: два одинаковых текста подряд в одном чате и сообщения из одних медиа (пустой текст) сопоставляются неоднозначно.
7. **Ошибки** (notif:1500-1520): таймаут/abort → `failed{timeout}` (повтор только вручную кнопкой Resend → возможен дубль, если эхо не пришло); `code:"MESSAGE_GUARD_VIOLATION"` → `failed{blocked}` со списком слов/тем (серверный фильтр OM «Message Guard», срабатывает до OnlyFans); прочее → `failed{platform}` + тост, тексты по кодам `UNAUTHORIZED→session, FORBIDDEN→access, NOT_FOUND→general, PLATFORM_NOT_FOUND→missing, PLATFORM_*→rejected` с причиной из `details.upstream_message` (accounts:6488-6560).
8. **Другие пути отправки:** быстрый ответ из уведомлений и Telegram-композер — та же очередь, только текст (notif:21911-21940, ChatView:6861-6880); серверный отложенный follow-up — `POST …/scheduled-messages` (§2.6); массовые рассылки и автокампании — через iframe dashboard (§2.7-2.8). Unsend — `DELETE …/messages/{id}` (окно `cancelSeconds`); OM сохраняет отменённые чаттерами сообщения вместе с текстом в `logs/messages/unsent`.

### (б) Есть ли mark-as-read, кто и когда его вызывает
- **Отдельного эндпоинта «прочитать один чат» в клиенте нет.** Есть только:
  - `POST api/v0/accounts/{acc}/platforms/onlyfans/chats/mark-as-read?filter=…&list_id=…` — «прочитать все» чаты текущей вкладки; **только по кнопке с диалогом подтверждения** (ChatView:4182-4210 → accounts:6563-6593), право `of_messages`, есть серверный лимит (`MARK_CHATS_AS_READ_LIMIT_EXCEEDED`);
  - `DELETE api/v0/accounts/{acc}/platforms/onlyfans/chats/{fan}/mark-as-read` — **«пометить непрочитанным»** из меню шапки чата (accounts:6471-6487).
- **При открытии чата** (ChatView:7212-7227): когда первая страница истории загрузилась без ошибки, вызывается `chatList.markChatAsRead(acc, fan)` — это **только правка локального кэша** (`unreadMessagesCount=0`, accounts:6394-6404), сетевого запроса нет. Для платформ с capability `marks_chat_read_on_open` — это **только `telegram_v2`** (composables:62716-62722) — дополнительно делается `GET …/messages?limit=1` и обновляются бейджи: у Telegram «прочтение» запускает сервер при запросе свежих сообщений.
- **Нет** ни таймера, ни реакции на видимость вкладки, ни на прокрутку. Новое входящее в уже открытом чате увеличивает локальный счётчик непрочитанных, и чат остаётся «непрочитанным» в списке, пока его не переоткроют или не ответят (accounts:6295-6299, 6342-6356). Исходящее (эхо) обнуляет счётчик.
- **Но (важно):** сама `GET …/chats/{fan}/messages` — это живой запрос через OM к OnlyFans (медиана 3,8 c, до 11 c, против ~0,35 c у кэшируемых эндпоинтов). Нативный `GET /chats/{id}/messages` у OnlyFans сам помечает чат прочитанным (это мы уже наблюдали в OFAPI). То, что фронт безусловно обнуляет счётчик после первой страницы, говорит о том, что для OF бэкенд полагается именно на этот побочный эффект. В записанной сессии непрочитанный чат ни разу не открывали, так что **вживую это не подтверждено**.
- Кто ещё запрашивает историю — **всегда только открытого чата**: основная лента, повторный запрос при реконнекте WS и при ручном refresh (`force=true`), боковая панель `fanMessageActivity` (до 5×100), старый AI-assistant (`limit=60`), закреплённые (`filter=pinned`). **Фоновых запросов истории других чатов нет** (в отличие от нашего Electron-клиента), то есть неоткрытые чаты ChatSpace не «прочитывает».
- Mimic на сервере может сам помечать чаты непрочитанными (`copilot/settings`: `mark_chat_unread_enabled`, `mark_chat_unread_reasons[9]`).

### (в) Прямые запросы к onlyfans.com
- **API OnlyFans браузер не вызывает.** Всё идёт через бэкенд OM (`https://onlymonster.ai/api/...`): чаты, сообщения, фаны, vault, DRM-лицензии (FairPlay/Widevine проксируются), загрузка медиа (браузер грузит в presigned S3 OM, дальше `medias/upload` возвращает дескриптор OF `processId/host/extra`), уведомления, списки. В логах сессии нет ни одного запроса к `*.onlyfans.com`; строка `onlyfans.com` в бандлах встречается только в ссылках «скопировать ссылку на чат/профиль/сообщение».
- **`pw365.ompcdn.com`** — подписанный медиа-прокси OM поверх CDN OnlyFans: путь содержит исходный хост (`/cdn/v1/of/av/public.onlyfans.com/files/…`), query `exp`, `m`, `p`, `q`, `sig` (срок жизни + подпись). Бэкенд переписывает на него URL, которые реально рендерятся (аватары, `media[].files.full/thumb/preview/squarePreview`); видео отдаётся кусками (206).
- **`cdn.onlymonster.ai`** — собственная статика OM (аватары аккаунтов креаторов).
- В части полей остаются сырые URL CDN OF (`public.`, `thumbs.`, `cdn2.onlyfans.com` с CloudFront `Policy/Signature/Key-Pair-Id`): шапки профиля, `videoSources`, аватары участников списков, `replyToMessage.fromUser`. Если UI их отрисует (например, сторис берут `videoSources` напрямую — ChatView:3486), браузер обратится к CDN OF за статикой, но не к API. В сессии такого не было.
- По флагам Unleash видна серверная прокси-инфраструктура к OF: `sith.cor-1519.proxy-of-req-api`, `sith.cor-1829.om-proxy-headers-main`, `sith.cor-1945.multigate-om-user-agent`, право `om_creator_proxy_settings`.

### (г) Данные о фане сверх официального OnlyFans
(сам объект пользователя OF с `subscribedOnData.totalSumm/tipsSumm/messagesSumm…` — это данные OF, они есть и у креатора)
1. **Buying power 0-5** — «рейтинг OnlyMonster» (`api/stats/platforms/onlyfans/buying_power`). В пути нет ни аккаунта, ни организации → вероятно, считается по всей сети OM.
2. **Insights:** `temperature` 1-4 (насколько фан «тёплый» сейчас), `reach` 1-6 (**на скольких креаторов подписан**), `focus` 1-4 (насколько внимание сосредоточено на узком круге) + `generated_at`. Reach/focus — кросс-креаторские сетевые данные, которых у OF нет.
3. **Риск чарджбэка:** `chargebacks_sum / transactions_sum` → low / medium / high с рекомендациями («просить предоплату за кастомы»), путь `api/stats/platforms/{platform}/fans/{fan}/chargeback_info` — без аккаунта.
4. **Траты:** `transactions_info` — spent, avg_ppv, avg_tip, разбивка ppv/tips/subscription, последняя и максимальная покупка; **по аккаунту и по всей организации** (все креаторы агентства); `transactions/latest` — дата последней оплаты; лента транзакций аккаунта с пометкой чарджбэков (`status:'undo'`).
5. **CRM OM:** день/год рождения, страна, источник, предпочтения (`fans/{fan}/info` + справочник `api/agency/preferences`), события `user-notes`.
6. **Медиа-история по фану:** `medias/stats` — для каждого медиа vault: когда отправлено, за сколько, куплено ли → paid / unpaid / free / not sent (защита от повторной продажи), статус синхронизации.
7. **Шаблоны** с `last_sent_at` для конкретного фана.
8. **Логи команды:** кто из чаттеров или какая автоматика (`auto`, `pmm`, `copilot`, `scheduled_messages`) отправил каждое исходящее; архив отменённых сообщений с текстом и автором отмены (30 дней); кто ответил на уведомление.
9. **Онлайн:** опрос онлайн-статуса видимых фанов (`fans-online`), рейтинг «фанов онлайн» с последней покупкой (`analytics/fans/online-ranked`).
10. Цветные группы/инбоксы, эмодзи-метки списков, статус Mimic по чату (enabled/escalated + причина), серверные follow-ups с `skip_on_incoming_message`, AI-подсказки и переводчик.

### (д) Признаки других платформ
- `GET api/v0/accounts` отдаёт `platform: "onlyfans" | "fansly"` (в организации есть Fansly-аккаунт), но ChatSpace берёт только `zp = {onlyfans, telegram_v2}` (accounts:9272-9286); Fansly отфильтрован.
- Карта capability (composables:62702-62726): `onlyfans` {fan_online_status, mimic, keeps_message_anchor_on_send, notification_center, sfw_blur, collections, transactions, campaigns, fans_online_widget, fan_lists, edits_pinned_chat_lists}; `telegram_v2` {fan_peer_status, notification_center, sfw_blur, assigns_chats_to_folders, marks_chat_read_on_open}.
- **Telegram v2 уже работает:** отдельный текстовый `TgV2MessageComposer` (ChatView:6861-6880), поиск чата по username/`t.me`/`tg:` (accounts:8157-8230), папки, `fan-status`, разбор TG-типов контента (photo/voice/sticker/document… composables:86576-86655).
- Общие эндпоинты не зависят от платформы (`api/v0/accounts/{acc}/chats…`, `…/messages`, `…/typing` — платформу сервер берёт из аккаунта), а платформенные вынесены в `/platforms/onlyfans/…`, `/platforms/telegram_v2/…`, `api/stats/platforms/{platform}/…`, `api/v0/platforms/{platform}/accounts/{acc}/posts/users-to-tag`.
- Ключ черновика `chat-space:draft:{namespace}:{acc}:{fan}`; у OF-композера namespace `of` (messages:17186, composables:89493-89494).
- Флаги Unleash: `sith.cor-1481.fansly-media-history`, `sith.cor-2284.fansly-message-templates`, `sith.cor-1439.fanvue_basic_permissions`, `ewoks.cn-33.snapchat-platform`. Права организации: `fansly_*`(38), `telegram_*`(25), `snapchat_*`(14), `fanvue_*`(7).
- Документация OM: ChatSpace пока только для OF, «другие платформы позже».

## 5. Что расширение могло бы вызывать само и какие риски

**Как получить доступ.** Content script в MAIN world (CSP страницы задаёт только `frame-ancestors`, инжект разрешён). Токен — `await window.Clerk.session.getToken()` прямо перед каждым запросом (JWT живёт 60 c; Clerk сам кэширует и обновляет). На 401 — один повтор с `getToken({skipCache:true})`, как делает приложение. CORS `*` и авторизация без кук → запросы технически работают и из контекста страницы, и из фона расширения, но у фоновых будет `Origin: chrome-extension://…`, что сразу видно серверу. Поэтому — только из контекста страницы.

**Лучше читать, чем запрашивать.** Почти всё нужное для AI уже лежит в кэше приложения: `__vue_app__.config.globalProperties.$pinia` → `_pc_query` (ключи `["chatMessages",acc,fan]`, `["fansMap",acc]`, `["fanInsights",acc]`, `["onlyfansBuyingPowers"]`, `["onlyfansLastPayments",acc]`, `["chatList",acc,…]`). Новые события — перехватом `WebSocket` приложения (обёртка `onmessage`/`addEventListener` в MAIN world на `document_start`), без второго соединения. Ноль дополнительной нагрузки и минимум следов.

**Кандидаты на прямые вызовы (по убыванию безопасности):**
- только чтение, кэш OM, быстро: `fans?fan_ids`, `fans/{fan}/insights`, `stats/…/buying_power`, `transactions/latest`, `transactions_info` (аккаунт/организация), `chargeback_info`, `fans/{fan}/info`, `medias/stats`, шаблоны с `fan_id`, `scheduled-messages`, `logs/…/senders`, `suggestions/…/toolbar`, `chats/counts`;
- чтение с живым запросом к OF (медленно, нагрузка на прокси креатора, **возможный mark-read**): `chats/{fan}/messages` (до `limit=100`, `order=desc`, `cursor`), `chats` (список), `lists`, `stories`, `fans-online`;
- запись: `typing` (безвредно); `fans/{fan}/info` PATCH; `scheduled-messages` POST; списки, custom name; **`POST …/messages` — технически возможно, но не нужно**: прямой POST обходит очередь, эхо-дедуп, блокировку при Mimic, лимиты и UI. Правильно — вставить текст в редактор (`.ProseMirror` → `editor.commands.insertContent`) и оставить нажатие Send человеку. Это совпадает с нашим правилом «AI не отправляет без человека».

**Риски:**
1. **Права.** Токен чаттера = права чаттера. Клиентские запреты (`of_block_message_sending`, Mimic, лимит очереди 50) при прямом POST не действуют, серверные (Message Guard, вероятно и права) — действуют. Часть эндпоинтов для роли чаттера может отдавать 403 (`insights` при 403 отключается до смены аккаунта, `buying_power` требует `om_buying_power`, логи и unsent — `om_chatter_metrics`/`of_view_message_sender`, `users` отдаёт email участников организации). Проверять на реальном токене чаттера.
2. **Токен на 60 c.** Не хранить и не кэшировать; брать через Clerk перед каждым вызовом и перед каждым WS-действием. При потере Clerk-сессии приложение само уходит на `/sign-in`.
3. **Нагрузка и лимиты.** Заголовков rate-limit нет, 429 обрабатывается только ретраем ky (GET/PUT/DELETE, с учётом `Retry-After`). История и список чатов ходят к OF живьём через прокси OM конкретного креатора (1-11 c); массовый обход чатов нагружает OM и может спровоцировать троттлинг или антибот OnlyFans на аккаунте креатора. В публичном API OM лимит «1 rps на платформенный аккаунт для чатов» — разумный ориентир и для внутреннего. Само приложение уже опрашивает: badges раз в 60 c на аккаунт, Unleash раз в 60 c, online раз в 5 мин, `HEAD /index.html` раз в 5 мин.
4. **Mark-read.** GET истории неоткрытого чата, вероятно, помечает его прочитанным в OF (наш старый баг с OFAPI). Историю брать только для чата, открытого человеком, — желательно из кэша приложения.
5. **Детект.** На HTTP-уровне запросы из контекста страницы неотличимы (кастомных заголовков нет), но OM видит необычные эндпоинты и частоту, все записи атрибутируются чаттеру. Наш AI-текст, вставленный программно, уйдёт с `is_copied:false, is_ai_generated:false` и в метриках OM будет выглядеть набранным вручную; вставка через «вставить из буфера» даст `is_copied:true`. Если чаттер включил автоперевод OM, вставленный текст будет переведён перед отправкой.
6. **Хрупкость.** Внутренний API `v0`, бандлы с хешами, версия 0.167.0, раздеплой проверяется каждые 5 мин. Опираться на сетевой API, `data-testid`/`aria-label` и TipTap-редактор, а не на минифицированные имена и внутренности Pinia (их брать с фолбэком).
7. **Среда.** Внутри десктопного OnlyMonster Browser (Electron, `window.OM_WINDOW`) Chrome-расширения, скорее всего, не ставятся: расширение работает только в обычном Chrome/Edge. Встроить ChatSpace в свой iframe нельзя (`X-Frame-Options: DENY`).
8. **Юридическое и данные.** Реверс внутреннего API и автоматизация, вероятно, противоречат ToS OnlyMonster (риск блокировки). API отдаёт персональные данные фанов и email участников организации: по нашей архитектуре вынос допустим только в ядро (hub), без сторонних AI-SDK в расширении.

## 6. Что проверить вживую (открытые вопросы)
1. Открыть непрочитанный чат в UI: падают ли `chats/counts.unread_count`, `unread_messages_count` в `GET chats`, WS `account_messages_summary`, и прочитан ли чат в самом OnlyFans. Отдельно: `GET …/messages` непрочитанного чата без UI.
2. Полное тело ответа `POST …/messages` и задержка эха по WS.
3. Набор 403 для токена с ролью чаттера (insights, buying_power, transactions_info в масштабе организации, logs, unsent, users).
4. Есть ли 429 / троттлинг при последовательных GET истории; влияние `force=true`.
5. Принимает ли сервер `limit>100` для истории; работает ли `order=asc`.
