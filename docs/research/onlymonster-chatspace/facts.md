# Установленные факты (живое исследование ChatSpace, 2026-10-02)

Исходные материалы (бандлы, сетевые логи) лежали во временном каталоге сессии и в репозиторий не вошли.

## Стек и хостинг
- chat.onlymonster.ai — Vue 3.5.30 SPA, сборка Vite/rolldown, Tailwind + PrimeVue, Pinia + Pinia Colada (`_pc_query`, `_pc_mutation`), vue-i18n, vueuse, Sentry, Clerk (clerk.onlymonster.ai, clerk-js 6.36.0), video.js, TipTap (ProseMirror) редактор, Unleash фичефлаги (`/api/frontend`), Intercom, ilert status widget.
- Статика: CloudFront+S3 за Cloudflare. Документ: CSP только `frame-ancestors 'none'` + `X-Frame-Options: DENY` (script-src нет → расширению можно инжектить MAIN-world скрипты; встроить в iframe нельзя).
- Версия клиента 0.167.0. Бандлы скачаны: bundle/ (оригиналы), pretty/ (prettier), всего 49 файлов, ~240k строк.

## Авторизация
- API `https://onlymonster.ai/api/...` — заголовок `Authorization: Bearer <Clerk JWT>` (~990 символов, живёт 60 c, обновляется clerk `/v1/client/sessions/{sid}/tokens`). CORS `access-control-allow-origin: *`, `allow-headers: *`.
- Клеймы JWT: azp=https://chat.onlymonster.ai, external_id=<OM user id>, full_name, public_metadata {org_id, permissions:"1"}, sid, sub (clerk user), fva.
- Из MAIN world токен доступен через `window.Clerk.session.getToken()`.

## Роутинг (vue-router)
- `chat` → `/accounts/:accountId/chats/:chatId?`; `accounts-overview` → `/`. chatId = числовой id фана OnlyFans; accountId = id аккаунта (креатора) в OnlyMonster.
- Экземпляр приложения: `document.querySelector('#app').__vue_app__`; globalProperties: $pinia, $primevue, $toast, $i18n, $t, $router, $route; provide: Symbol(clerk) и др.

## Pinia-сторы (id → действия)
_pc_query (кэш запросов Pinia Colada, Map), _pc_mutation, chatTabEntries, chats {chatsById; getChat,isFanOnline,isFanTyping,upsertChats,removeChats,updateOnlineStatuses}, accounts, tabEntries, badgeCounters, chatList {markChatAsRead,markAllChatsAsRead,markChatAsUnread,removeChatFromList,reconcileChatListTabs}, listLabels, chatMessages, ofComposerReply {setReplyTarget,...}, pendingMessages {enqueue,cancel,resend,confirmEchoedMessage,...}, inboxes, mimic {sessionStates; markChatHandled, releaseChatManually}, notifications, notificationList, chatTimers, followUpQueueSync, messageTranslator, postPreview, sidePanel, pinnedChats, chatGallery, collectionsDialog, ofComposerInsert {payloadsByChatKey, copiedMessage; setInsertPayload,clearInsertPayload,getInsertPayload}, messageTemplates, composerTranslator, followUpSettings, campaignCreate, templateEdit.

## Ключи кэша Pinia Colada (пример для аккаунта 36408)
["userPermissions"] array(179), ["accounts"], ["fansMap",acc] {fanId: Fan}, ["badgeCountersMap"], ["fanInboxLinks",acc], ["translator",...], ["onlyfansLists",acc,"chat",""], ["telegramV2Lists",acc], ["listLabels",acc], ["chatCounts",acc] {pinned,priority,unread,withTips}, ["chatList",acc,"all"] infinite {items,hasMore,nextOffset}, ["onlyfansBuyingPowers"] {fanId:int}, ["onlyfansLastPayments",acc] {fanId: iso}, ["inboxes",acc], ["fanInsights",acc] {fanId:{temperature,reach,focus}}, ["mimicChats"], ["mimicSettings"] {isActive}, ["chatMessages",acc,fanId] infinite {items,hasMore,cursor}, ["chatMessagesSearch",...], ["fanStatus",acc,fan], ["ofUnsentMessages",acc,fan], ["ofMessageSendersMap",acc] {messageId:{userId,origin,unsentByUserId}}, ["ofOrgUsersMap"], ["accountSettings",acc], ["aiSettings",platformAccId], ["suggestionsToolbar",acc] {suggestions_enabled,replies[{id,name}],auto_generate_reply}, ["followUpQueue",acc,fan], ["vault-files",...], ["vault-folders",...], ["vault-tags",acc], ["ofStories",...], ["chatMedia",acc,fan], ["postPreview",...], ["taggableCreators",...].

## Формы данных
- Message: {id, text(HTML: входящие `<p>…</p>`, исходящие с `<br />`), createdAt, platformSenderId, isOutgoing, platform:"onlyfans", platformMetadata:{isTip,tipText,gifUrl,giphyId,replyToMessage,mediaItems,audioItems,storyImageUrl,tags,taggedCreators,mediaCount,isFree,isOpened,isNew,isMediaReady,price,lockedMediaCounts,isLockedText,isLiked,isPinned,canBePinned,canReport,cancelSeconds,cancelSecondsAsOf,isFromQueue,queueId,isUnsent}}.
- Chat (chatsById / chatList item): {id, platformFanId, lastMessage: Message, unreadMessagesCount, isMuted}.
- Fan: {id,name,customName,username,avatarUrl,avatarThumbnailUrl,lastSeen,isRestricted,canReceiveMessages,isExpired,isVerified,note,isMuted,totalSpent,subscribedAt,isSubscribed,isSubscribedByAccount,isRebillOn,subscriptionExpiresAt,subscriptionPrice,listMembership{listId:{hasUser,canAddUser,cannotAddUserReason,name,isSystem}}}.
- GET /api/v0/accounts → {items:[{id, platform_account_id, platform:"onlyfans"|"fansly", name, username, avatar, custom_label, note, subscribe_price, expires_on, timezone}]} — в организации 3 аккаунта: 2 OnlyFans (36408 loravievip, 36409 loravie) + 1 Fansly (24520); UI ChatSpace показывает только OnlyFans.

## WebSocket wss://onlymonster.ai/api/chat-space/ws (uWebSockets за Cloudflare)
- Клиент → {"action":"auth","token":JWT}; {"action":"subscribe_account","token":JWT,"account":{"account_id","platform":"onlyfans","platform_account_id"}}; в логах повторное `authenticated` примерно раз в 5 минут — по коду это переподключения, периодического re-auth нет.
- Сервер → {"event":"authenticated"}; {"event":"account_notifications_summary",account{account_id,platform_id:1,platform_account_id},organisation_id,notifications_count}; {"event":"account_messages_summary",...,messages_count,priority_count,unread_tips_count}; {"event":"account_fan_typing",account,typing:{platform_fan_id}} (каждые ~3–4 c пока фан печатает); {"event":"account_new_message",account,message:{id,content(HTML),sentAt,chatId,platform_fan_id,is_from_fan,platformMetadata:{responseType,giphyId,lockedText,isFree,price,isMediaReady,mediaCount,media[],previews[],isTip,isReportedByMe,queueId,isMarkdownDisabled,fromUser:{сырой объект пользователя OnlyFans}}}} — задержка < 1 c.

## Живые наблюдения
- Открытие уже прочитанного чата не вызвало ни одного write-запроса (только GET + POST /platforms/onlyfans/fans-online — запрос онлайн-статусов).
- Программная вставка в редактор `document.querySelector('.ProseMirror').editor.chain().focus().insertContent(text).run()` работает: Send активируется, черновик пишется в localStorage `chat-space:draft:of:{accountId}:{fanId}`, уходит `POST /api/v0/accounts/{acc}/chats/{fan}/typing`. `editor.commands.clearContent(true)` убирает текст и черновик.
- TipTap расширения: link, paragraph, starterKit(bold,italic,strike,code,hardBreak,undoRedo,…), textColorClass, textSizeClass, placeholder, pasteAsInline.
- AI Suggestions: GET /api/v0/suggestions/accounts/{acc}/toolbar → 10 системных replies (Engage, Bump, Innocent, Bullet, Quick Reply, Spicy, PPV, Playful, Question, Upsell); POST /api/v0/suggestions/accounts/{acc}/chats/{fan}/generate (ответ 400 «This chat has no fan message to generate from», если нет сообщения фана; время ответа ~10 c).
- Copilot/Mimic: POST /api/v0/copilot/accounts/{acc}/chats/activation → 400 «Mimic is disabled for account».
- data-testid: ~225 штук (chat-list-item, chat-list-item-name, chat-list-item-preview, fan-buying-power, fan-temperature-ring, conversation-header-*, chat-timer-trigger, follow-up-trigger, mimic-chats-entry-button, fans-online-entry-button и т.д.). У composer спец. testid нет, но есть aria-label у кнопок («Open vault», «Set price», «Mimic», «Templates», «Schedule a follow-up», «More AI styles»).
- Производительность вкладки: JS heap ~41–50 MB, ~5.4k DOM-узлов, DCL ~0.7 c (из кэша), ~5.1 MB JS/CSS.

## Документация OnlyMonster (omdocs/)
- ChatSpace: только OnlyFans («другие платформы позже»), open beta с 7 августа 2026; права: Chat Space, Mass Messages, Media Uploader, Chat Hiding, Mute, Unsend, shift-only access; 25.09 добавлено право «Disable OnlyFans Access via Browser» (редирект на ChatSpace).
- AI Suggestions: системные ответы на движке OM; кастомные — через AI Gateway (только OpenRouter, reasoning всегда выключен), промпт с переменными {chatHistory}, {lastFanMessage}; Auto-Generate при открытии чата (тратит кредиты).
- Публичный API: https://omapi.onlymonster.ai, заголовок x-om-auth-token, 25 rps на организацию, 15 rps на эндпоинт, 1 rps на платформенный аккаунт для чатов; есть GET/POST сообщений, транзакции, подписки, чарджбэки, vault, members, tracking links. Вебхуки: chat.message (обе стороны), chat.message_sent/error (только для отправок через API), fans.ppv.purchased, fans.tip.received, fans.subscription.new_subscriber, message guard, vault.

## Проверка прочтения (2026-10-02, тестовый чат владельца 36408/518588958)
- `DELETE /api/v0/accounts/36408/platforms/onlyfans/chats/518588958/mark-as-read` (= «пометить непрочитанным») → в свежем списке (`GET …/chats?query=loravie&force=true`) `unread_messages_count: 1`.
- Полная загрузка страницы чата в ChatSpace → два `GET …/chats/518588958/messages?limit=10[&cursor=…]`, других запросов к этому чату нет → через 12 c `unread_messages_count: 0`.
- Вывод: загрузка истории в ChatSpace отмечает чат прочитанным на OnlyFans (как GET сообщений в OFAPI). Расширению нельзя грузить историю чатов, которые человек не открывал.

## Мост поля ввода
- `[data-id="browser-composer-translator"].__omComposerBridge = { setText, insertText, focus, insertMessage }` (директива `v-composer-bridge`, `messages-2XnThXD9.js:14436-14463`): `setText` = clear + `<p>` + focus; `insertText` = вставка с `hardBreak`; `insertMessage` → `ofComposerInsert.setInsertPayload`.
- В обычном браузере `window.OM_WINDOW` отсутствует (веб-режим).
