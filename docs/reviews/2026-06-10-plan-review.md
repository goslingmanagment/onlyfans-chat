# Независимое ревью планов — 2026-06-10

Ревьюер: независимая сессия (Claude, Fable 5). Прочитано полностью: `CLAUDE.md`, `docs/PRD.md`, `docs/SPEC.md`, `docs/PLAN.md`, все три research-дока, `docs/vendor/onlyfansapi/README.md`. Факт-чекинг: `openapi.json` + `llms-full.txt` (jq/grep), ~7 живых read-only GET-вызовов OFAPI (израсходовано ~6 кредитов, баланс после: 99 217), исходники `~/code/core` и `~/code/chatgoose` (read-only). Находки предыдущего ревью (commit `a5895bc`) не пересказываются.

## Вердикт

Направление выбрано правильно: desktop-клиент поверх OFAPI с companion-фазой (P2, copy-to-OnlyMonster) до включения отправки (P3) — фазировка сама по себе хеджирует главный продуктовый риск, потому что уже P0–P2 — это самодостаточный продукт «AI-ассистент для OF-чаттеров», даже если отправку никогда не включат. Фактологическая база документов на удивление точна: подавляющее большинство проверенных утверждений про OFAPI, core и legacy подтвердились с точностью до строк кода. Главные проблемы — операционные и расчётные: Phase 0 в текущей редакции невыполним (read-only ограничение на реальном аккаунте противоречит send-тестам, ради которых Phase 0 и задуман) — это блокер ближайшего шага; кредитная математика SPEC §6 и PRD §10 расходится между собой и ломает exit-критерий параллельного трека; одна фактическая ошибка в дизайне синка (`first_id` вместо `last_id` — проверено живым вызовом) и одно живое расхождение с документацией вендора (`lastReplyAt` отсутствует в реальном ответе List Chats). После исправления перечисленного документы достаточны, чтобы свежая сессия строила P0–P1 без вопросов.

## Findings

### [P1] Phase 0 невыполним как написан: send-тесты против read-only ограничения, устаревшие пункты про покупку плана

**Утверждение/проблема.** Статус-блок Phase 0 (PLAN.md:9) фиксирует: подключён **реальный боевой** аккаунт `loravie`, «all spikes must be read-only (no sends, no state mutations…)». При этом сами пункты Phase 0 требуют мутаций и отправок: item 2 — coexistence-тест «sends from API appear correctly in OM» (PLAN.md:13); item 3 — latency-спайк включает «send-message» p50/p95 (PLAN.md:14); item 1 — «Buy OFAPI plan (start Basic $69 for the spike)… Connect the test account» (PLAN.md:12), хотя статус уже фиксирует Pro-уровень ключа (99 255 кредитов, 5 000 RPM) и подключённый аккаунт. «Immediate next actions» №1 (PLAN.md:94) тоже повторяет «purchase OFAPI plan, connect throwaway account».

**Почему важно.** Phase 0 объявлен «kill the riskiest unknowns» — но два из четырёх главных спайков (coexistence c OM при отправках, латентность send) в read-only режиме не выполняются вовсе. Команда либо нарушит read-only на боевом аккаунте, либо молча пропустит самые рискованные проверки, и тогда P3 (отправка) пойдёт на невалидированных предположениях.

**Предлагаемое исправление.** Переписать Phase 0: (а) явно разделить read-only спайки (выполнимы сейчас на `loravie`: latency для GET'ов, webhook-фикстуры, credit burn) и send-спайки; (б) для send-спайков — подключить настоящий throwaway/низкоценный аккаунт ИЛИ перенести их в явный «pre-P3 gate» с собственным чек-листом; (в) вычистить устаревшие пункты про покупку плана и «Immediate next actions» №1; (г) синхронизировать PRD risk #5 (вопрос тарифов уже low-priority по статусу).

---

### [P2-1] SPEC §6.1: выборка «нового хвоста» сообщений указана через неправильный курсор — `first_id` ходит в прошлое, а не в будущее

**Утверждение.** SPEC.md:116: «fetch just that chat's new tail (`first_id` pagination from last cached id)».

**Доказательства.** OpenAPI: `first_id` — «Use for pagination when `order=desc` (newest to oldest)»; `last_id` — «Use for pagination when `order=asc` (oldest to newest)». Проверено живыми вызовами на чате `5969226` (сообщения по убыванию: A=9969072821570 / 10 июн, B=9822622174358 / 30 мая, C=9585162578697 / 10 мая, D=9572225744889 / 9 мая):
- `last_id=C&order=asc&limit=3` → вернул **C, B, A** (граница включена, далее — более новые, по возрастанию) — это и есть «новый хвост»;
- `first_id=B&limit=3` (desc) → вернул **C, D, ещё старше** (граница исключена, далее — более старые).

**Почему важно.** Это ядро delta-правила PollingSync. AI-разработчик, следуя SPEC дословно, получит выборку *старой* истории вместо новых сообщений; кроме того, живое поведение включения/исключения граничного id расходится с текстом документации («include this message ID») — дедупликация по id обязательна в обоих направлениях.

**Исправление.** В SPEC §6.1 заменить на `last_id=<last cached id>&order=asc` (+ дедуп по id, граница может вернуться в ответе). В §8.2 (`first_id` для прокрутки истории назад) — всё корректно, не трогать.

---

### [P2-2] `lastReplyAt` (Hybrid-обогащение) отсутствует в живом ответе List Chats — а PRD F2 и P7 на него опираются

**Утверждение.** PRD F2: «The OFAPI-enriched `lastReplyAt` is displayed to spot "fan waiting" chats» (PRD.md:77); P7 «Ping queue: fan list ranked by `lastReplyAt`»; research-док §1/§3 повторяет претензию документации («Hybrid: `GET /{account}/chats` adds `lastReplyAt` per chat»).

**Доказательства.** Живой `GET /{account}/chats?limit=2` на `loravie` (2026-06-10): `grep -c lastReplyAt` по полному ответу = **0**. Ключи объекта чата: `canGoToProfile, canNotSendReason, canSendMessage, countPinnedMessages, fan, hasPurchasedFeed, hasUnreadTips, isMutedNotifications, lastMessage, lastReadMessageId, unreadMessagesCount` — без `lastReplyAt`. Документация (llms-full.txt:6831) при этом прямо обещает «`lastReplyAt` per chat».

**Почему важно.** Поле либо появляется только после накопления данных в их БД (аккаунт подключён сегодня), либо документация отстаёт от продакшена. UI-фича «fan waiting» и будущая ping-очередь не должны проектироваться вокруг, возможно, отсутствующего поля.

**Исправление.** Добавить в Phase 0 проверку «`lastReplyAt` присутствует?» (повторить через несколько дней после подключения; спросить вендора). В PRD F2 пометить поле как «if available» и заложить fallback: вычислять «fan waiting» из `lastMessage.createdAt` + `isSentByMe`/`unreadMessagesCount` (данные есть в том же ответе).

---

### [P2-3] Кредитная математика расходится: SPEC §6.1 (10-секундный рефреш открытого чата) ломает и полинговую смету PRD §10, и exit-критерий «≥5×» параллельного трека

**Утверждения.** PRD §10: polling-режим «open-conversation refreshes (conditional on list delta) ≈ 500–1,500», итого «≈ 2–4 k credits per chatter-shift»; webhook-режим «≈ 0.5–1 k». SPEC §6.1: «The open conversation additionally refreshes every **10 s**» — безусловно, а не «conditional on list delta». SPEC §6.2: «Read-state remains on-demand polling of the open conversation» — без указания каденции. Parallel track exit: «per-shift credit burn drops ≥5× vs pure polling» (PLAN.md:46).

**Пересчёт.** Чат-лист @20 s × 8 ч = 1 440 (PRD «1,000–1,400» — ок). Но открытый чат @10 s: при 60–100 % смены с открытым чатом это **~1 700–2 880** вызовов — уже выше верхней границы PRD-статьи (1 500), а суммарно (1 440 + ~2 000 + 300–800) ≈ **3 700–4 200+**, т.е. смета «2–4 k» трещит сверху. Хуже в webhook-режиме: если read-state-поллинг открытого чата сохранит 10-секундную каденцию, он один даёт ~2–2.9 k/смену → итог ~2.5–3 k вместо «0.5–1 k», и падение расхода против полинга составит ~1.5×, а не ≥5× — exit параллельного трека недостижим как специфицировано.

**Исправление.** Задать явную политику read-state-поллинга в SPEC §6.1/§6.2, например: рефреш открытого чата только при (окно в фокусе) ∧ (есть наши сообщения с `isNew=true` моложе N часов), каденция 20–30 s, авто-стоп после M минут без изменений; в hub-режиме — то же, но реже. Пересчитать PRD §10 после фиксации политики.

---

### [P2-4] Пауза полинга при скрытом окне убивает уведомления — ровно в companion-фазе, где приложение и живёт в фоне

**Утверждения.** SPEC §6.1: polling «**paused when window hidden >2 min** (resume burst on focus)». PRD F2: «toast + optional sound for incoming messages on any handled account»; PRD §12 P2-gate: чаттер работает в OnlyMonster, копируя из нашего приложения.

**Почему важно.** В P1–P2 ожидаемый режим использования — приложение свёрнуто/на втором мониторе, чаттер в OM. «Hidden >2 min → пауза» означает: ни тостов, ни звука, данные протухают — companion-режим теряет смысл. Противоречие между двумя документами, AI-разработчик «угадает» в одну из сторон.

**Исправление.** Заменить паузу на замедленный фоновый полинг (например, ×3–4 интервал) при скрытом окне, пауза — только при выключенных уведомлениях или явном idle; отразить в кредитной смете (§ P2-3).

---

### [P2-5] P2-gate ссылается на несуществующий baseline: «acceptance rate ≥ legacy Fansly baseline» нечем измерять и не с чем сравнивать

**Утверждение.** PRD §12 / PLAN P2 exit: «acceptance rate measured and ≥ Fansly baseline».

**Доказательства.** Телеметрия legacy (единственная — AI-usage events) не содержит ни поля acceptance, ни события insert: payload = `clientEventId, feature, model, токены, conversationId, durationMs, isCacheHit, isRegeneration, completedAt` (research-док §7.4; схема core `ai_usage_events` — только токены, проверено в `core: packages/db/src/schema.ts:1257–1260`). В research-доке §1 «Insert behavior» описан без какого-либо трекинга. То есть «легаси-baseline acceptance rate» никогда не измерялся. Вдобавок в P2 (copy-режим) «принятие» = копирование в буфер, что несравнимо с legacy-insert даже при наличии цифр.

**Исправление.** Либо (а) определить метрику заново (copied-or-inserted / generated, с учётом regenerate), инструментировать с первого дня P2 и гейтиться на абсолютный порог + тренд, либо (б) добавить замер в legacy-расширение сейчас, чтобы baseline появился к P2. Записать выбор в PRD §3/§12.

---

### [P2-6] Webhook-спайк и фикстуры протаскивают реальный PII боевых фанов через туннель и в git

**Утверждение.** PLAN Phase 0 item 4: подписаться на все 28 событий через `cloudflared`/`ngrok` и «capture real payloads into `tests/fixtures/webhooks/`».

**Доказательства.** Подключён реальный аккаунт (PLAN.md:9). Полезные нагрузки `messages.received`/`tips.received` содержат полный текст сообщений, имя/username/аватар фана и его траты (`fanData.spending`) — проверено по примерам payload'ов (llms-full.txt:2236+, 2788+). SPEC §5 требует санитизации только для фикстур OFAPI-клиента; для webhook-фикстур требования нет.

**Почему важно.** Сырые DM-тексты и финансовые данные реальных людей попадут (а) в сторонний туннельный сервис, (б) в git-историю репозитория навсегда. Это и приватность, и излишний разглашаемый материал.

**Исправление.** Дополнить item 4: туннель с auth (cloudflared access/закрытый endpoint), фикстуры анонимизировать перед коммитом (имена/тексты/ID заменить, структуру сохранить), сырьё хранить вне git. То же для логов latency-спайка.

---

### [P2-7] Перекос часов клиента молча уничтожает всю usage-отчётность: core отвергает весь батч, портируемый репортер дропает после 3 попыток

**Утверждения/доказательства.** Core: `completedAt` > now+5 мин → `BadRequestError` — бросается per-event внутри обработки, т.е. **весь батч получает 400** (`core: apps/runtime/src/services/ai-usage.ts:20–33`, проверено). Legacy-репортер, который портируется в §8.6 «as is»: ретрай 3 попытки с задержками [5 s, 15 s], затем события **дропаются** (`chatgoose: src/shared/constants.ts:139–143`, `src/background/agency-hub-usage-reporter.ts:126`). Следствие: если часы машины чаттера убегут вперёд на >5 минут (типично для дешёвых Windows-машин без NTP), каждый батч будет отвергнут целиком и молча потерян — биллинг/надзор ослепнет, не упав. Edge-кейс из этого же семейства: одно «плохое» событие топит остальные 99.

**Исправление.** В SPEC §8.6: при формировании событий клампить `completedAt` к серверному времени (offset по `Date`-заголовку любого ответа core или health-эндпоинта); на 400 — не ретраить как есть, а логировать и поднимать видимую ошибку `CG-HUB-*`. Записать в PLAN (parallel track / P6 «work in core repo») задачу: per-event skip вместо whole-batch reject. Тот же серверный offset использовать для 24-часового unsend-каунтдауна (сравнивать с `createdAt` сообщения от сервера, не с локальным `now`).

---

### [P2-8] PRD F8 не подписывается на `messages.deleted`, на котором держится обработка удалений в SPEC §6.3

**Доказательства.** PRD F8 перечисляет: `messages.received/sent`, `messages.ppv.unlocked`, `tips.received`, `subscriptions.*`, `users.typing/online/offline`, `accounts.*` (PRD.md:126) — `messages.deleted` нет. SPEC §6.3: «deletions via `messages.deleted` or tail-fetch diff → tombstone». PLAN parallel track регистрирует webhook «events per PRD F8» (PLAN.md:42). Событие существует в каталоге (проверено живым `GET /api/webhooks/events`: 28 событий, включая `messages.deleted`).

**Исправление.** Добавить `messages.deleted` в список F8 (и решить заодно про `transactions.new` — он покрывает типы платежей, которых нет у `tips.received`, но лагает до 3 мин).

---

### [P3-1] Семантика `accounts.session_expired` перепутана с «нужен re-auth» в формулировках PRD

`accounts.session_expired` = «expired, but **we automatically re-connected it** … you don't need to do anything»; действий требует только `accounts.authentication_failed` (llms-full.txt:2076–2105, проверено). PRD F1 «surfaces session-expiry/re-auth needs… via `accounts.*`» и F10 «(expired → "re-auth needed, ping admin")» провоцируют ложные баннеры. Исправить: баннер — только на `authentication_failed`/`is_authenticated=false`; `session_expired` — максимум информационная строка в логе/статусе. Уточнить текст `CG-OF-02`.

### [P3-2] Индикаторы pinned/priority в чат-листе: источника данных в ответе нет

PRD F2 обещает «pinned/priority» в списке. Живой объект чата не содержит ни `pinned`, ни priority-флага (см. список ключей в P2-2); есть только фильтры `filter=pinned/priority` на запросе. Показ значков потребует дополнительных отфильтрованных вызовов (кредиты) или признака внутри `fan.listsStates`. Проверить в Phase 0; иначе убрать значки из F2, оставив фильтры.

### [P3-3] `canSendMessage=false` / `canNotSendReason` не обработаны в дизайне композера

Поле подтверждено живо (плюс бонус: `canNotSendReason` — готовый текст причины). Фан заблокировал/удалился → POST упадёт 4xx «definite», но UX лучше гейтить заранее. Добавить в SPEC §7: композер блокируется при `canSendMessage=false` с показом `canNotSendReason`; код в таксономию §11.

### [P3-4] Два чаттера на одном аккаунте из двух копий приложения — не покрыто до P7

PRD risk #7 регулирует только «OM vs app». Single-flight и outbox — per-instance; две копии приложения на одной странице дадут гонки mark-as-read и двойные ответы одному фану. До P7 («multi-chatter presence») достаточно расширить протокол: «одна страница — один чаттер за смену, независимо от поверхности» — записать в PRD risk #7 и в rollout §5.

### [P3-5] Часовой пояс в `[HH:MM]` транскрипта не специфицирован

Legacy использует локальный TZ машины (`chatgoose: src/shared/transcript.ts:527–528`, проверено). Теперь транскрипты влияют на централизованно шарящиеся саммари (P4): два чаттера в разных TZ дадут разные «байт-в-байт» блоки, а инвариант §8.2 требует стабильности форматов. Зафиксировать политику (предлагаю: TZ аккаунта/агентства или UTC, одинаково для всех) в SPEC §8.2.

### [P3-6] Compare не имеет имени в закрытом enum'е core — а `scan` там есть

Enum `aiUsageFeatures` в `core: packages/shared/src/types.ts:112–122` (проверено): `fast-reply | improve-draft | help-me | fan-summary | chat-review | scan | ping | hi-greeting` — `compare` отсутствует. Если Compare (P4) будет репортить usage, нужно либо имя в core (контракт-генерация), либо явное решение «репортим как fast-reply». Решить до P4; заодно выяснить, что такое `scan` (в desktop-доках фича не фигурирует).

### [P3-7] Мелкие фактические неточности и недочищенные хвосты

- PRD §10: «1 credit ≈ $0.0015–0.003» — реальный диапазон шире: Basic $69/20k = $0.00345, топ-апы 500k/1M = $0.0010/$0.0008. Уточнить или пометить «mid-range».
- PRD F10: «from `_meta._credits` **on every response**» — конверт не универсален (уже исправлено в SPEC §5/research §6, PRD отстал).
- SPEC §5: «exact scope granularity to verify in Phase 0» — но в задачах Phase 0 такого пункта нет. Добавить item: проверить в консоли OFAPI, что scoped key умеет read-only набор P1–P2 (и что webhook CRUD отрезается).
- Док-описание `skip_users` («default = all») расходится с живым поведением: без параметра полные `fan{}` присутствуют. В клиенте задавать `skip_users` явно, не полагаясь на дефолт.

### [P3-8] Оценка P3 (~1 неделя) на корректность-критичный send-пайплайн — самое узкое место графика

P3 за «week 5–6» включает: композер, outbox-машину состояний с верификатором и restart-реконсиляцией, restricted-words UX, typing, mark-as-read, reply-to/like/unsend, записи notes/custom-name, Insert-режим, multi-part последовательности — плюс «Work in this repo (during P3): HubSync provider + presence UI». Это два самых ответственных контура (дедуп отправки и SSE-провайдер) в одну неделю. Предложение: вынести reply-to/like/unsend и notes/custom-name write в P3.5 или честно заложить 2 недели; exit-критерий «≥500 sends, zero lost/dup» оставить как есть.

## Checked and OK (проверено, переоткрывать не нужно)

**OFAPI (vendored spec + llms-full + live):**
- Каталог webhook-событий = **28** (живой `GET /api/webhooks/events`), состав совпадает с research-доком; `messages.deleted` существует.
- Delivery-политика webhook'ов: at-least-once, 15 s timeout, до 5 ретраев, HMAC-SHA256(rawBody, secret) hex (llms-full.txt:467, 3441); схема create-webhook: `endpoint_url, signing_secret (опционален), events[], account_scope (global/inclusive/exclusive), account_ids` — как в SPEC §9.2.
- Кредиты: 1/uncached account call; webhook **1 credit / 100 events**; media **3 credits/MB** (decimal); их AI-summary 200/ген; data exports 1/20 результатов (таблица в llms-full.txt:6660+); account-scoped «never cached». RPM: Basic 1 000 / Pro 5 000 / MCP 120.
- Send Message body: `price` «0 or between 3–200», nonzero ⇒ `mediaFiles` required; `previews` могут ссылаться индексами на `mediaFiles`; `replyToMessageId`, `lockedText`, `giphyId`, `rf*` — всё как в research §3.
- List Chat Messages: limit max 100, default order desc; **поля `isSentByMe`, `isNew`, `price`, `isOpened`, `isTip` подтверждены живым вызовом**, включая PPV-состояния прямо на сообщении (живой пример: price 45 + isOpened:false; price 6 + isOpened:true) — фундамент фикса «#1 incident class» валиден.
- `isNew` семантика: true = фан не видел, false = прочитал; read-receipt webhook'а нет, поллинг — официальный workaround (llms-full.txt:411–417).
- `chat_id === fan.id` подтверждено живым вызовом (id фана из chats использован как chat_id — работает).
- Typing endpoint: бесплатный, ~4 s показа, повторять для удержания; `users.typing` шлётся ~каждые 3 s, индикатор у OF живёт 5 s.
- Unsend: только <24 h (llms-full.txt:29178).
- `accounts.session_expired` vs `authentication_failed` семантика (см. P3-1); payload'ы `messages.received` (полное сообщение + `fanData.spending` + `fromUser`) и `tips.received` (`amountGross/Net`) — богатые, как заявлено.
- Fans `limit` ≤20 (описание «1-50» в тексте, валидация max 20 — research корректно указал 20); `users/list` ≤10 ids; `custom_name` и `notes` — точные имена полей тела; `about` у user details есть; `subscribedOnData.*Summ` поля есть; Hybrid-список `lastReplyAt` в доках есть (но см. P2-2 про live).
- Конверт `{data,_meta,_pagination}`: у `/{account}/chats` присутствует (живой вызов), у `/api/webhooks/events` тоже `{_meta,data}` — «per-operation unwrapping» из SPEC верен и достаточен.

**Core (`~/code/core`, проверено в исходниках):**
- Все консюмируемые маршруты существуют с точными путями (server.ts:620–1714); enum `aiUsageFeatures` закрыт и совпадает; батч 1..100, дедуп `(userId, clientEventId)` unique-индексом; токены без долларовой колонки; профиль ≤50 000, append-only, `source:"chatmuse"`; **GET и PUT профиля оба 404 на неизвестном фане** (fan-profiles.ts:82–95) — пре-P4 патч в core остаётся обязательным, а prefetch должен трактовать 404 как «профиля нет»; ключи `agency_hub_core_*`, sha256, role chatter, один активный (ротация при выпуске), `canAccessPage` на каждом page-маршруте; SSE/webhook-инфраструктуры нет, решение «REST + SSE только для AI-стриминга» задокументировано (docs/decisions.md:25–30, 178–184); OnlyFans-синк = OnlyMonster, transactions-only, `ONLYFANS_DM_POLLING_ENABLED=false` по умолчанию; Phase 7 «ChatMuse Backend» в roadmap — Not Started; `onlyfansapi`/`acct_` в core не упоминаются.

**Legacy (`~/code/chatgoose`, проверено в исходниках):**
- Все константы из research-дока подтверждены до строк: ping 5 дней/3 сообщения, hi ≤10, deep ≥30, таймауты 60/180/45/45/300 s, counts 100/25/1500/100, температуры и max_tokens по фичам, `escapeForPrompt` (& первым; personality не эскейпится), оба safety-преамбула с «UNTRUSTED USER INPUT», формат `[HH:MM]`, тип-1 фильтр, сортировка/дедуп, `[Tip: $X.XX]` из mills, hub-репортер (1 s/100/5 s/3 попытки/[5,15] s/drop), профиль ≤50k, prefetch 5 s / push 10 s, нормализация username, реестр моделей и цены, версия 1.4.1, 48 тест-файлов (~842 it/describe — масштаб «783 tests» сходится). Кэш-сегментация: user-dynamic = `ephemeral` без явного ttl — у Anthropic это и есть 5-минутный дефолт, формулировка research-дока корректна.

**Экономика LLM (пересчёт PRD §10).** Quick-фича: ~8–15k input-токенов (100 сообщений + personality + правила) × Sonnet $3/MTok ≈ $0.024–0.045 без кэша, с кэшем ≈ $0.01–0.02 + output ≤800 ток ≈ $0.012 → «$0.01–0.03/op» реалистично. Summary: 1500 сообщений ≈ 30–60k input × Opus $5 + output ≤8k × $25 ≈ $0.3–0.5 → «$0.3–0.8» с запасом. Смена «$1.5–4» при 50–150 быстрых операциях + 1–3 саммари — сходится. Кредитную часть см. P2-3.

**Направление (dimension 1).** Более дешёвой формы с той же ценностью нет: «companion-only»-вариант (без своего чат-клиента) — это и есть P0–P2 текущего плана; план уже устроен так, что каждый следующий слой (отправка, vault, hub) добавляется на работающий продукт. Стратегический single point of failure — безопасность аккаунтов при второй параллельной сессии OFAPI (бан = катастрофа уровня бизнеса, а не продукта); он назван в PRD risk #4 и тестируется в Phase 0 (после фикса P1 этого ревью). Vendor-смерть OFAPI деградирует продукт до OM+кэш — приемлемо и осознано (risk #3).

## Гипотезы и вопросы владельцу (не находки)

1. **Фактический webhook `messages.sent` — фильтруется ли источник?** Срабатывает ли он на сообщения, отправленные самим OFAPI (наш send), или только на отправки с других поверхностей? От этого зависит, насколько верификатор §7.5 может опираться на `messages.sent`. Гипотеза: срабатывает на все. Не проверено — проверить в Phase 0 webhook-спайке (отправка с throwaway).
2. **Гранулярность scoped-ключей OFAPI**: матрица SPEC §5 предполагает разрез по эндпоинтам/методам (read-only P1–P2, +send P3, +vault P5). Консоль обещает «scoped keys + per-account permissions», но реальная гранулярность не проверена. Если разреза «GET-only» нет — план custody (P6 stretch) становится важнее. Проверить в консоли (см. P3-7).
3. **`lastReplyAt`**: появляется ли после нескольких дней накопления данных у вендора? Спросить в их поддержке параллельно с Phase 0 (связано с P2-2).
4. **Аватары/тамбы (`thumbs.onlyfans.com`, `public.onlyfans.com`)**: IP-locked ли они так же, как `cdn*.onlyfans.com` (~1 мин)? Если нет — их можно грузить напрямую без 3 credits/MB и `media://`-прокси, что заметно удешевит чат-лист. Гипотеза: публичные тамбы не залочены. Проверить в Phase 0.
5. **Что такое `scan` в enum'е core** — реликт или живая фича другого клиента? Влияет на решение по Compare (P3-6).
6. **Политика mark-as-read при двух поверхностях**: решение «авто, default ON» принято до coexistence-теста; если тест покажет, что OM-чаттеры теряют unread-сигнал — готовы ли откатить дефолт? (PRD §11 #9 ссылается на тест — просто подтвердить, что решение условное.)

---
*Бюджет живых вызовов: ~7 запросов (6 кредитов). Никаких мутаций: только GET к `/api/webhooks/events`, `/{account}/chats`, `/{account}/chats/{chat_id}/messages` ×3.*
