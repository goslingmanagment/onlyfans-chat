# Инвентаризация расширения ChatGoose для Fansly (fansly-chat)

> Статус: финальная версия. Дата: 2026-10-02.
> Репозиторий: `/Users/dmitriy/code/1-platform/fansly-chat` (ветка `main`, HEAD `a534d72`, версия 2.7.1 от 2026-09-28, 404 коммита).
> Ссылки `файл:строка` — относительно корня репозитория, если не указано иное. Репозиторий не менялся (только чтение).

## 0. Коротко

- **Что это.** Firefox-only MV3 расширение (gecko ≥142, event page, без Chrome), которое встраивает AI-ассистента прямо в DOM Fansly (Angular SPA). TypeScript strict + esbuild, без UI-фреймворка (ручной DOM, глобальный CSS, Shadow DOM только у окна фоловеров). ≈60k строк TS в `src` + ≈65k строк тестов (146 файлов). `pnpm check` = typecheck+lint+AI-гейты+vitest+build. Релиз: `scripts/deploy.sh` → `web-ext sign --channel unlisted` (AMO) → `ext.gosling-agency.ru/updates.json` (самохостинг-фид, `update_url` в манифесте).
- **Функции чаттера.** Тулбар над композером: Reply (+тоны Casual/Flirt/Sell/Spice, Split 2–3 сообщения), Fix (переписать черновик, со Split), Hi (3 варианта приветствия), Ping (реактивация), Review (оценка переписки), Recap (полное/короткое досье, полное синхронизируется в хаб), Coach (чат с ИИ о фане, пресет Help, история, авто-рекап), Voice (скрипт + платная озвучка ElevenLabs + прикрепление MP3), Cancel. Глобально: доска Spenders, окно «Новые фоловеры» (скан, верификация, черновик Hi, отправка с хабовой опекой), Vault uploader, звук входящих/новых фоловеров, шпаргалка, popup с квотой, «Кабинет» настроек из 7 панелей. Хоткеи — общая с десктопом схема `@chatgoose/hotkeys` (⌘/Ctrl+E I G P . — запись; ⌘⇧ / Ctrl+Alt + H S O B L M C — панели; по физической клавише).
- **Автоматически (без человека):** снятие заголовков сессии Fansly, `account/me`, пересборка состояния вкладки и проба voice-способности (хаб `pages`), обновление каталога персон раз в 5 мин, **повторная выгрузка готового полного Recap в хаб**, телеметрия acceptance (`shown` на первом чанке), звук, ре-аттач UI, поллинг роута; после старта человеком — очередь верификации фоловеров (может создавать пустые чаты через `POST /group`) и очередь vault. **Автогенераций и автоотправок нет.**
- **Связь с Fansly.** Не перехват fetch в MAIN world, а: (1) `webRequest.onBeforeSendHeaders` снимает заголовки сессии чаттера (`authorization`, `fansly-client-*`) → (2) background сам ходит в `apiv3.fansly.com` (сообщения, group, account, earnings, подписка, PPV orderhistory, фоловеры; запись — только `POST /group`/`/message` в окне фоловеров); (3) DOM — только якорь, textarea и имя для UI; (4) MAIN-world Proxy над `WebSocket` — только для звука. Текущий чат — поллинг URL `/messages/<groupId>` раз в 500 мс; фан — `GET /group`. Вставка — `execCommand('insertText')` в textarea. UI — прямо перед `app-group-message-input` + MutationObserver. **Слоя адаптера платформы нет**: Fansly-специфика размазана по background/shared, а сбор контекста и вызов ИИ слиты в одной ≈1 950-строчной функции.
- **Связь с хабом.** Только vendored `@kernel/sdk` (~16 операций из 254): вход логин+пароль → device token (в `storage.local`, FIFO-опека, самолечение по названному 401), `streamAiFeature` (SSE) для всех генераций, `pages` (pageLabel по username), персоны, recap-status, fan profile get/put, top-spenders, follower-outreach reserve/dispatch/sent, voice notes, `ingestObservations`. Промпты/модели/квоты/деньги — в хабе; клиент шлёт `clientContext` (транскрипт своей сборки, траты, подписка, био…). **Хаб принимает `clientContext` только для Fansly; для OnlyFans контекст берёт сам из OFAPI-архива** (десктоп шлёт только ссылки) — ключевое отличие для ChatSpace.
- **Качество.** Сильные стороны: разделение процессов, DI в background, fail-closed (обрезанный стрим = ошибка, неопределённая отправка не повторяется), реестр ошибок `CG-*`, опека учётки, пейсинг, тесты. Долг: «божественные» `ChatGooseContentApp` (4 275 строк, 56 изменяемых полей), `startOperation`, options `render()` (≈4 960 строк), нет адаптера платформы, мёртвый Compare/`aiUsageBatch`, непоследовательная валидация, глобальный CSS без изоляции, поллинг роута, тяжёлая scroll-компенсация, полная перерисовка доски, много Fansly-запросов на одну генерацию, только Firefox.
- **Переиспользовать:** контракты хаба + хабовую промпт-логику, `@chatgoose/hotkeys`, гейтвей SSE/ошибки, device-token/custody, acceptance/quota/persona-catalog, парсеры ответов (`[NEXT]`/`[VARIANT]`, Help/Review XML), Coach-сессии, voice-attempt state machine, решение о звуке, реестр ошибок, UX-раскладку. **Не переиспользовать:** Fansly REST/сессию/DOM/роутинг/вставку, «божественные» классы, мёртвый код.
- **HostPort** (§7.3): идентичность и маршрут (+смена креатора), композер (read/write/focus/onDraftChange/attach), якорь UI, навигация, контекст client-lane (только Fansly), локальные предпроверки, живые события, справочник фанов для доски, действия в платформе (фоловеры/vault/directSend) — всё за `capabilities` (`contextLane: 'client'|'hub'`), плюс статический `HostDescriptor` (matches + `parseUrl`) для background.

## 1. Источники правды в репо

- `CLAUDE.md` — рабочие правила (короткий, актуален на 2.7.x). Ключевое: «AI is kernel-only», «extension is the LIVE reader of Fansly», «Fansly egress rides the chatter's own session … anything new without pacing risks a model ban», «AI never sends without explicit human action» (`CLAUDE.md:44-60`).
- `README.md` — «Current architecture» + фичи + история релизов (актуален на 2.7.1).
- `docs/decisions.md` — append-only лог решений E1…E146 (376 KB; quick-ref таблица неполная — E63–E65, E87–E89, E97–E117 есть только в теле).
- `docs/generated/00…16-*.md` — машинные карты кода на 1.6.0 (2026-07-07, коммит `1586f07`): архитектурно полезны, но устарели (там storage v10, 7 фич, нет Coach/Voice/Followers/Vault/Sound).
- `SPEC_FINAL.md` — исторический v1.3 (до ядра), только UX-намерения.
- `CHANGELOG.md` (165 KB) / `changelog.html` — история релизов; `guide.html`, `start.html`, `install.html`, `whats-new-2.html` — пользовательские страницы, публикуются рядом с фидом.

---

## 2. Устройство: манифест, сборка, объём, проверки, релиз

### 2.1 Манифест (`manifest.json`)

- **MV3, только Firefox** (gecko id `chatgoose@gosling.agency`, `strict_min_version: 142.0`), `manifest.json:2, 87-91`. Chrome не поддерживается: `background.scripts` (не `service_worker`) — это **non-persistent event page** Firefox MV3 (`manifest.json:21-25`); типы `@types/firefox-webext-browser`, глобальный `browser.*` без полифилла; динамический `import()` moz-extension URL из content script (`esbuild.config.mjs:164-167`) — Firefox-специфика.
- `permissions`: `storage`, `unlimitedStorage`, `webRequest`, `tabs` (`manifest.json:6-11`). Нет `scripting`, нет `webRequestBlocking`, нет `cookies`.
- `host_permissions`: `*://fansly.com/*`, `*://apiv3.fansly.com/*`, `https://gosling-agency.ru/*` (хаб) (`manifest.json:12-16`); `optional_host_permissions`: `http://*/*`, `https://*/*` — для нестандартного адреса хаба (запрос из options по жесту: `src/options/index.ts:1960, 2208`) (`manifest.json:17-20`).
- `content_scripts` (все на `*://fansly.com/*`), `manifest.json:26-55`:
  1. `content-socket-tap.js` — **MAIN world**, `document_start` (E145): Proxy над `window.WebSocket`, пассивно слушает собственный сокет Fansly `wss://wsv3.fansly.com`.
  2. `content-sound-relay.js` — isolated, `document_start`: мост CustomEvent → `runtime.sendMessage`.
  3. `content.js` — isolated, `document_idle`: маленький bootstrap; тяжёлые модули грузятся лениво через `import(browser.runtime.getURL(...))`.
- `web_accessible_resources`: `content-chat.js`, `content-followers.js`, `content-vault.js`, `content.css`, `vault.css` (`manifest.json:56-69`) — это ленивые ESM-бандлы и стили (нужны для dynamic import из content script).
- `action` → `popup.html`; `options_ui` → `options.html` (`open_in_tab: true`).
- Автообновление: `browser_specific_settings.gecko.update_url = https://ext.gosling-agency.ru/updates.json` (`manifest.json:91`); `data_collection_permissions.required` перечисляет authenticationInfo, PII, personalCommunications, financialAndPaymentInfo, websiteContent (`manifest.json:92-100`).

### 2.2 Сборка

- **TypeScript strict** (`noUncheckedIndexedAccess`, `isolatedModules`), **esbuild** (`esbuild.config.mjs`), **без UI-фреймворка**: весь UI — ручной DOM (`document.createElement`, классы `chatgoose-*`), стили — обычный CSS, вставляемый `<style>` в `<head>` страницы (`src/content/dom-anchor.ts:1-17`). Только окно «Новые фоловеры» живёт в **Shadow DOM** (`src/content/followers/index.ts:52-53`); основной тулбар/оверлеи — НЕ в Shadow DOM, а прямо в DOM Fansly с префиксованными классами.
- Четыре группы бандлов (`esbuild.config.mjs:12-37, 148-172`):
  - IIFE «страницы»: `background`, `options`, `popup`, `debug-prompt`, `debug-followers`;
  - IIFE bootstrap: `content` (`src/content/bootstrap.ts`);
  - IIFE early: `content-socket-tap`, `content-sound-relay`;
  - **ESM, ленивые**: `content-chat` (`src/content/index.ts`), `content-followers`, `content-vault`.
- Таргет `firefox128`, `minifySyntax+minifyWhitespace` без mangling, `charset: utf8`, sourcemaps; `.md`/`.css` грузятся как текст; плагин `virtual:model-card-drafts` (каталог `prompts/drafts/` для Compare — каталога в репо нет, т.е. Compare фактически выключен, см. §3).
- Зависимости рантайма: `zod` (почти не используется в src — валидация в основном ручными guard-функциями в `src/shared/protocol.ts`), `@kernel/sdk` (`link:./vendor/kernel-sdk`), `@chatgoose/hotkeys` (`link:./vendor/chatgoose-hotkeys`) (`package.json:33-37`).

### 2.3 Объём кода (строки, `wc -l`)

| Модуль | TS-строк | файлов | CSS-строк |
|---|---:|---:|---:|
| `src/background` | 19 304 | 44 | — |
| `src/content` | 21 329 | 48 | 4 675 |
| `src/options` | 7 628 | 10 | 2 591 |
| `src/popup` | 307 | 1 | 355 |
| `src/shared` | 11 018 | 48 | — |
| `src/debug-*` | 329 | 2 | 169 |
| **итого src** | **≈59 900** | 153 | ≈7 800 |
| `tests/` | 64 935 | 146 файлов | — |

Самые крупные файлы-«боги»: `src/options/index.ts` 5 576, `src/content/index.ts` 4 275 (класс `ChatGooseContentApp`), `src/content/overlay/overlay-controller.ts` 3 632, `src/background/operations.ts` 3 584 (`OperationCoordinator`, из них `startOperation` ≈1 950 строк: 1612–3556), `src/shared/types.ts` 2 305, `src/content/voice/voice-panel.ts` 1 728, `src/background/runtime-api.ts` 1 505, `src/background/voice-service.ts` 1 486, `src/background/compare-operations.ts` 1 395.

### 2.4 Проверки

- `pnpm check` = `typecheck && lint && gates && test && build` (`package.json:13`).
- `gates` = `scripts/check-ai-cutover.mjs`: grep-инварианты «AI только через ядро» — нет `api.anthropic.com|openrouter.ai` в src, нет удалённых модулей (`llm-client`, `shared/prompts`…), в пользовательских доках нет «Claude»/«введите ключ».
- Тесты: vitest + jsdom, 146 файлов (~65k строк), в т.ч. структурные: дрейф vendored SDK (`tests/kernel-sdk-vendor.test.ts`), sha хоткеев (`tests/chatgoose-hotkeys-vendor.test.ts`), producer-gate реестра ошибок, проверки страниц релиза, bundle-тесты bootstrap.
- ESLint flat config запрещает content-скриптам импортировать background-модули (E1).
- CI (`.github/workflows/ci.yml`): PR и push в main; self-hosted раннеры на ПК владельца при `CI_POOL=pc`, иначе ubuntu; на ПК части гоняются параллельно через `scripts/ci-parallel-check.mjs`.

### 2.5 Релиз и автообновление

- Версия = `package.json` + `manifest.json` (должны совпадать). `scripts/deploy.sh`: преффлайты (main, чистое дерево, HEAD == origin/main, no-downgrade против отдаваемого фида, прод-ядро живо, контракт ядра задеплоен — `deploy.sh:200-360`) → стемпинг страниц → **`web-ext sign --channel unlisted`** (AMO unlisted, ключи из `.env.deploy`) (`deploy.sh:561-570`) → загрузка XPI и `updates.json` на VPS `root@45.8.230.111` по ssh/scp → `https://ext.gosling-agency.ru/updates.json` (`deploy.sh:6-18, 587-600`) → git-тег `v<версия>` → опциональный анонс в Telegram (`SKIP_ANNOUNCE=1`).
- Фид — единственный канал дистрибуции; Firefox сам подтягивает обновления по `update_url`.
- **Чаттеры работают в Firefox ≥142** (десктоп; см. README «Setup»). Хоткеи различают mac/win.

---

## 3. Функции для чаттера

Общая модель: **AI-выход — всегда черновик**; в чате расширение ничего не отправляет само (вставка в поле ввода, отправка — родной Enter Fansly). Единственное место, где расширение само шлёт сообщение в Fansly, — окно «Новые фоловеры», и только по клику, с хабовым резервированием (§3.10). Все генерации идут через ядро (`POST /api/v1/ai/features/:feature`, SSE). Один активный AI-процесс на вкладку: второй запуск → тост «another_operation» (`src/background/operations.ts:1616-1641`, `src/content/index.ts:1636-1639`).

Предусловия любой генерации (`src/content/index.ts:1424-1454`): вход в хаб выполнен (`hasApiKey` = URL хаба + device token), в каталоге хаба есть персоны, аккаунт Fansly замаплен на персону (`accountMappings`), сессия Fansly захвачена (`connected`), для Fix — непустой черновик. Иначе — тост с deep-link в нужную панель настроек или баннер `MappingBanner` под тулбаром.

### 3.1 Тулбар над полем ввода (в чате `/messages/<groupId>`)

Порядок кнопок (`src/content/button-bar.ts:244-266`): **Reply** + капсула опций (тоны 😌 Casual / 😏 Flirt / 💰 Sell / 🔥 Spice — radio, «армируют» следующий Reply; ячейка **Split** — sticky-чекбокс) │ **Fix** │ **Hi** · **Ping** · **Review** · **Recap** · **Coach** · (🎙 **Voice** — только если хаб вернул `voiceNotesCapable` для страницы). Ховер-подсказки на русском (`HoverHintController`, задержка 1000 мс, отключаемы `showToolbarHints`), бейджи хоткеев, точка «рекап готов» на Recap. Compare/Multi удалён из тулбара по просьбе владельца, но движок (`src/background/compare-operations.ts`, 1 395 строк; `startCompare` в content) остался, а каталог черновиков пуст — мёртвый код.

| Функция | Фича ядра | Как вызывается | Что делает / где результат |
|---|---|---|---|
| **Reply** | `fast-reply` | кнопка, ⌘E / Ctrl+E | Ответ на переписку (окно `quickMessageCount`, дефолт 100 сообщений). Тон — разовый (сбрасывается после отправки запроса, но Regenerate повторяет тон оригинала: `src/content/index.ts:1510-1515, 1708-1714`). Split (`replyMode: preferSplit`) → 2–3 части. Результат — inline-панель над композером: карточки «клик = вставить», Insert/Copy, Enter вставляет следующую часть, Regenerate, Cancel, ↗ развернуть в оверлей. |
| **Fix** | `improve-draft` | кнопка, ⌘I / Ctrl+I | Переписывает черновик из textarea (окно `improveMessageCount`, 25). Одна часть — автозамена черновика; со Split (E142) — 2–3 части с Insert каждая, «прибиты» к исходному черновику (Regenerate перегенерирует тот же черновик). Кэш по ключу черновика+режима. |
| **Hi** | `hi-greeting`, `variantCount: 3` | кнопка, ⌘G / Ctrl+G | 3 варианта приветствия, «Choose one greeting.». Читает 1 страницу (25 сообщ.); отказ, если история не помещается в страницу или >10 «личных» сообщений (welcome/mass не считаются: `operations.ts:2414-2480`, `HI_GREETING_MAX_TRANSCRIPT=10`). Контекст: displayName/username/кастомное имя/био/аватар фана, welcome-тексты креатора (кэш 24 ч, `src/background/welcome-definitions.ts`). |
| **Ping** | `ping` | кнопка, ⌘P / Ctrl+P | Реактивация замолчавшего фана. Клиент считает `pingSegment` (segment-a/segment-b/active) и `fanSilenceDays` по одной метке времени (`operations.ts:2482-2518`, `shared/transcript.ts:820-864`); `active` (фан писал в последние 5 дней) → блок `ping_blocked` без вызова ИИ. Передаёт био и кастомное имя фана (E115). |
| **Review** | `chat-review` | кнопка, ⌘⇧B / Ctrl+Alt+B | Оценка переписки (глубокое окно `deepMessageCount`, дефолт 3000, мин. 30 сообщений) — оверлей-документ «оценка + рекомендации + как надо было» (парсер XML-блоков ядра, `parseChatReviewXml`). |
| **Recap** | `fan-summary` (+`summaryMode: 'short'`) | кнопка/⌘⇧S → диалог выбора: «Полный» (Enter) / «Короткий» (300 сообщ.) / «Открыть последний» | Досье фана. Полный — до 3000 сообщений + детальные траты по месяцам (до 12 месяцев earnings), кэшируется локально (`summary:<groupId>`) и **синхронизируется в хаб** (`upsertFanProfile`, хаб подмешивает досье в промпты других фич); короткий — только локально (`summary-short:`). При открытии диалога выбора — metadata-only `aiRecapStatus` (активирует «Открыть последний»; `content/index.ts:961-1052`, `runtime-api.ts:1418`). |
| **Coach** | `coach-chat` | кнопка, ⌘⇧C / Ctrl+Alt+C | Чат-оверлей «спроси ИИ про этого фана»: вопрос → потоковый ответ; история диалога (до `coachHistoryLimit`=10, макс. 20) уходит в ядро как `coachHistory`; сессии в памяти content (LRU 5 на пару аккаунт+группа, `src/content/coach-session.ts:16-35`); галочка «приложить мой недописанный ответ» (draftText); карточки-черновики внутри ответа с вставкой; «Новый диалог»; меню «Рекап ▾»; опц. **авто-рекап** перед первым вопросом (`coachAutoRecap`, дефолт off). Транскрипт — инкрементальный кэш в background (`coach-transcript-cache.ts`, LRU 5). |
| **Help** | `coach-chat` + `preset: 'situation'` | ⌘⇧H / Ctrl+Alt+H, чип внутри Coach (кнопки в тулбаре нет с E80) | «Разбор ситуации» — канонический вопрос живёт в ядре (Core #204), клиент шлёт только литерал пресета (`src/content/index.ts:2271-2285`). |
| **Voice** | `voice-script` (SSE) + `voiceNoteCreate/Status` + `fetchVoiceNoteAudio` | кнопка 🎙 (нет хоткея) | Из черновика → скрипт голосовой заметки (ядро) → платная озвучка ElevenLabs на хабе → предпрослушка, скачивание MP3 → прикрепление к композеру Fansly через родной `<input type=file>` (DataTransfer, фолбэк через `wrappedJSObject`+`cloneInto`, `src/content/native-file-handoff.ts`, `voice/attach-adapter.ts`), подтверждение по появлению waveform (20 с). Отправка — руками. Платные попытки — в `storage.session` с CAS-ревизиями (защита от двойной оплаты). Доступно только страницам с включённой у хаба способностью. |
| Отмена | — | ⌘. / Ctrl+. (или Esc/кнопка Cancel) | Отменяет текущую генерацию/цепочку рекапа/ход коуча. |
| Цикл тона / Split | — | ⌘⇧O / Ctrl+Alt+O; ⌘⇧L / Ctrl+Alt+L | Переключение опций Reply. |

### 3.2 Глобальные поверхности (на любой странице Fansly)

- **Доска Spenders** (`src/content/spenders/spenders-board-controller.ts`, лаунчер-кнопка + ⌘⇧M / Ctrl+Alt+M): полноэкранный оверлей, рейтинг фанов по lifetime-тратам из ядра (`pageTopSpenders`, до 1000), колонка «+$N за месяц» (второй запрос ядра по окну `YYYY-MM`), клиентские тиры, бейдж NEW, «удалённый аккаунт», поиск (по кастомному имени/username), J/K/Enter, свежесть данных. Клиент дополнительно читает из Fansly карту fan→groupId (последние 150 диалогов, `SPENDERS_MAX_FANS`) и имена `/account?ids=` пачками по 50 (бюджет 12 с, кэш 6 ч, `storage.local`). Клик → открытие чата через SPA-роутер Angular (fallback — полная загрузка); чат вне карты резолвится одним поиском по инбоксу.
- **Новые фоловеры** (кнопка «Новые», `src/content/followers/index.ts`, Shadow DOM `<dialog>`): см. §3.10.
- **Шпаргалка хоткеев** (`?` вне полей ввода, `src/content/cheatsheet-controller.ts`).
- **Vault uploader** на `/creator/vault` (лаунчер появляется только на этом роуте; ленивый модуль `content-vault.js`): выбрать папку → файлы по одному загружаются в открытый альбом через родную форму Fansly «Upload to Vault» (тот же native-file-handoff), каждый подтверждается карточкой альбома (3 стабильных опроса по 1,5 с, таймаут 45 мин/файл), чекпоинт на аккаунт+альбом в `storage.local` (`vaultUpload:*`) для продолжения; «неподтверждённый» файл никогда не перезаливается без ответа человека (`src/content/vault/upload-runner.ts:1-60`, `vault-dom.ts`).
- **Звук входящего сообщения / нового фоловера** (E145/E146): см. §3.11.
- **Тосты** с кнопкой «Настройки» (deep-link по коду ошибки реестра), баннер маппинга под тулбаром.

### 3.3 Popup (иконка расширения)

`src/popup/index.ts:207-296`: аккаунт Fansly и текущий диалог (id с копированием, имена), пилюля «Fansly подключён / не подключён», предупреждение о связи с хабом, **остаток AI-квоты на сегодня** (из meta-кадров SSE, сброс 00:00 UTC), «Открыть настройки», ссылки на «что нового»/changelog. В разлогиненном состоянии — приглашение войти.

### 3.4 Настройки — «Кабинет» (`options.html`, 7 панелей, `src/shared/options-routes.ts:14-31`)

1. **Статус** — готовность установки («Что мешает» + кнопка, закрывающая каждый пункт), проверки хаба/квоты/доски, отчёт для поддержки (без секретов), версия/схема хранилища.
2. **Agency Hub («Аккаунт ChatGoose»)** — вход логин+пароль → device token (`src/background/device-token.ts`), адрес хаба (по умолчанию `https://gosling-agency.ru`, под «Дополнительно»), запрос host-permission на нестандартный адрес, «Выйти» (wipe + best-effort revoke), «Проверить связь», контракт SDK (debug).
3. **Персоны** — read-only каталог персон с хаба (`aiPersonaCatalog`; персоны — серверный контент, E36), какие аккаунты на какой персоне; восстановление/экспорт старых локальных персон.
4. **Аккаунты** — Fansly-аккаунты, которые видел этот браузер (presence: live/seen/never), локальные ярлыки, **маппинг аккаунт → персона**, per-model mute звука, «перейти во вкладку».
5. **Генерация** — окна сообщений (quick 5–200/100, ping, improve 25, deep 100–3000/3000), Coach (история 1–20, авто-рекап off/short/full), «Служебное»: режим отладки.
6. **Хоткеи** — read-only шпаргалка, генерируемая из vendored схемы (`buildHotkeyEntries`, `src/shared/hotkeys.ts:166-215`).
7. **Вид** — тема system/light/dark, подсказки тулбара, звук (вкл/тон/громкость; отдельно для фоловеров).

Debug-страницы: `debug-prompt.html` (эхо собранного ядром промпта, только в debug-режиме и только в окне, открытом владельцем на хабе, E28) и `debug-followers.html` (журнал проверки фоловеров, экспорт .txt).

### 3.5 Хоткеи (`@chatgoose/hotkeys`, общая схема с десктопом)

Спека — `hub/packages/chatgoose-hotkeys/README.md`; vendored в `vendor/chatgoose-hotkeys` (sha256 `953c6236…`, hub `a667c62b`, scheme v1 — **такой же sha в десктопе** `packages/chatgoose-hotkeys/chatgoose-hotkeys.vendor.json`). Схема:

| Действие | macOS | Windows | ЙЦУКЕН | Клиенты |
|---|---|---|---|---|
| Reply | ⌘E | Ctrl+E | У | оба |
| Fix (desktop: Improve) | ⌘I | Ctrl+I | Ш | оба |
| Hi | ⌘G | Ctrl+G | П | оба |
| Ping | ⌘P | Ctrl+P | З | оба |
| Cancel AI | ⌘. | Ctrl+. | Ю | оба |
| Help | ⌘⇧H | Ctrl+Alt+H | Р | оба |
| Recap (desktop: Scan) | ⌘⇧S | Ctrl+Alt+S | Ы | оба |
| Tone | ⌘⇧O | Ctrl+Alt+O | Щ | оба |
| Review | ⌘⇧B | Ctrl+Alt+B | И | оба |
| Split | ⌘⇧L | Ctrl+Alt+L | Д | оба |
| Spenders | ⌘⇧M | Ctrl+Alt+M | Ь | оба |
| Coach | ⌘⇧C | Ctrl+Alt+C | С | расширение (в десктопе зарезервирован) |

Правила движка: строгие модификаторы (mac: «текст» = только ⌘, «панели» = ⌘⇧; win: только Ctrl / Ctrl+Alt — Ctrl+Shift и Alt+Shift заняты переключением раскладки у команды); матчинг по `KeyboardEvent.code` (физическая клавиша — работает в русской раскладке); **fresh-press roll-over guard** для Reply/Fix/Hi/Ping (команда срабатывает, только если после нажатия ⌘/Ctrl не было других клавиш и не было отпускания Shift/Space; Cancel исключён); auto-repeat → «проглотить, не запускать»; `isComposing` игнорируется; mac-алиасы старых привычек (⌘⇧E/I/G = ⌘E/I/G, ⌘⇧X = Cancel, ⌘⇧D/⌘⇧F проглатываются). Движок только решает; клиент решает контекст и зовёт `preventDefault`. Клиент-специфичны (вне схемы): `?` шпаргалка, Esc, Enter (вставка следующей части), отправка, навигация по чатам и клавиши доски.

В расширении: адаптер `src/shared/hotkeys.ts` (маппинг семейных действий в action-id расширения — TOTAL-рекорд, новая семейная клавиша ломает typecheck; подписи/aria) и **один** экземпляр движка на вкладку в realm-глобальном слоте `Symbol.for('chatgoose.hotkeys.engine')`, общий для bootstrap и ленивого content-chat (`src/content/hotkey-input.ts:13-36`). Внутри чата любая комбинация ChatGoose «наша» (preventDefault даже если действие сейчас невозможно); вне чата перехватываются только глобальные (Spenders, `?`) (`src/content/index.ts:866-893`). Пока открыта доска/шпаргалка, запуск платных генераций по хоткею блокируется тостом (`index.ts:895-913`).

### 3.6–3.9 Прочее

- **Персоны и маппинг**: персона определяет голос модели; каталог — серверный (`aiPersonaCatalog`, обновление при старте и **каждые 5 минут**, `src/background/persona-catalog.ts:14,34-45`); маппинг Fansly-аккаунт → persona key — локально (`accountMappings` в `storage.local`), с алиасами legacy/canonical id. В запрос ядру уходят `personaKey` + `expectedPersonaDefinitionId`; meta-кадр с другим definitionId → результат отбрасывается (`kernel-feature-gateway.ts`, ветка `meta`).
- **Режим отладки**: эхо промпта (запрос через capability-заголовок), профилирование стадий (загрузка сообщений, earnings, TTFB…), токены/стоимость, журнал фоловеров.
- **Телеметрия acceptance**: события `shown` (на первом чанке стрима, `operations.ts:3093-3102`), `copied`, `inserted` (из UI) с `operationId`/`requestId` → spool в `storage.local` (cap 300, drop-oldest) → `ingestObservations` (`src/background/acceptance-reporter.ts`).
- **Квота AI**: снимок `remainingRequestsToday` из meta-кадра, denial 429 `quota_denied` → «квота исчерпана» (`src/background/quota-tracker.ts`).

### 3.10 Новые фоловеры (2.2.0 → 2.4.6, E118–E139)

Окно по кнопке «Новые»: период (1 ч … 30 дней, `FOLLOWER_HOURS`), список фоловеров (`GET /account/{creator}/followersnew`), статусы «Не писали / Ждёт ответа / Уже писали / В очереди / Нужно проверить / Отправлено…», фильтры, превью переписки. Две фазы: быстрый проход по позитивным доказательствам (инбокс-префикс, сохранённые chat id) → **автоматическая очередь** верификации остатка: `POST /group` (get-or-create чата по паре id — **может создавать пустые технические чаты**) + чтение истории до конца. Пейсер: общая «creator lane», 400 мс джиттер, первый 429 останавливает хвост, 5 подряд сетевых ошибок — стоп (`README.md` «Two-phase follower verification»). Генерация черновика = `hi-greeting` с `variantCount: 1` (тот же контекст, что Hi в чате, `src/shared/greeting-context.ts`). **Отправка** — по клику, только для строк с проверенной историей: локальный лок fan → повторная проверка → хаб `followerOutreachAttempt(reserve)` (кросс-девайс: «другой чаттер уже отправляет») → журнал попытки в `storage.local` → `followerOutreachAttempt(dispatch)` → `POST /message` (без ретраев) → `sent` (`src/background/followers-service.ts:972-1081`). Неопределённая доставка → `uncertain`, повтор заблокирован.

### 3.11 Звук (2.7.0/2.7.1, E145/E146)

MAIN-world тап сокета → isolated relay → `runtime.sendMessage({type:'messageSound'})` → background решает (`src/shared/message-sound-decision.ts`: свой/автоматический/чаевые/старше 180 с/muted/этот чат открыт в фокусе/троттлинг 2 с/«не наш аккаунт»/вкладка закрыта) и **играет синтезированный звук в background** (AudioContext, 8 тонов, `src/shared/sound-synth.ts`, `background/message-sound-player.ts`). Новый фоловер (`FollowerService type 2`) — свой тон. Никаких запросов к Fansly/хабу.

### 3.12 Что делается автоматически, без действия человека

| Что | Когда | Куда | Ссылка |
|---|---|---|---|
| Снятие заголовков сессии Fansly | каждый запрос страницы к apiv3 | память background | `session-capture.ts:90-125` |
| `GET /account/me` (каноничный id креатора) | на «материальном» захвате, кулдаун 30 с | Fansly | `operations.ts:644-682, 765-835` |
| Пересборка состояния вкладки + проба voice-способности | tab:init, смена роута, захват, изменение настроек | хаб `pages` (кэш 5 мин) | `operations.ts:857-937`, `voice-service.ts:538-640` |
| Обновление каталога персон | старт + каждые 5 мин (пока жив background) | хаб `aiPersonaCatalog` | `persona-catalog.ts:34-45`, `background/index.ts:121-124, 243-245` |
| **Повторная выгрузка полного Recap в хаб** (если локальный trusted-рекап не сохранён) | при каждом обновлении состояния вкладки с готовым рекапом; preflight-чтение досье; кулдаун 3 мин | хаб `pageConversationProfile` → `upsertFanProfile` | `operations.ts:623-628, 939-1103` |
| Телеметрия acceptance (`shown` — сам на первом чанке; `copied`/`inserted` — по действию) | дебаунс 1 с после события; при старте | хаб `ingestObservations` | `acceptance-reporter.ts` |
| Keepalive-порт bootstrap | на каждой странице Fansly | держит event page живым (ради 5-мин цикла персон) | `bootstrap.ts:91-94`, `bootstrap-keepalive.ts` |
| Ре-аттач UI | MutationObserver + ретраи | DOM | `conversation-mount-controller.ts` |
| Поллинг роута | каждые 500 мс | — | `route-watcher.ts` |
| Тап сокета + звук | каждый WS-кадр Fansly | background → звук | `page-socket-tap.ts` |
| Очередь верификации фоловеров (вкл. `POST /group`) | после открытия окна «Новые» и старта скана | Fansly | `followers-service.ts:1084+` |
| Загрузка welcome-определений | Hi/фоловеры, кэш 24 ч | Fansly `/message/automated` | `welcome-definitions.ts` |
| Vault-очередь | после старта чаттером — файл за файлом | Fansly (родная форма) | `vault/upload-runner.ts` |

**Никаких автоматических AI-генераций нет**: каждая генерация — клик/хоткей (авто-рекап Coach запускается вопросом чаттера и только при включённой настройке). Никаких автоматических отправок нет.

---

## 4. Связь с хостом Fansly

### 4.1 Двухслойная модель: content-скрипты + background

```
fansly.com (Angular SPA)
 ├─ MAIN world  content-socket-tap.js  — Proxy(window.WebSocket) → CustomEvent(JSON)
 ├─ isolated    content-sound-relay.js — CustomEvent → runtime.sendMessage(messageSound)
 └─ isolated    content.js (bootstrap) → import(content-chat.js | content-followers.js | content-vault.js)
                    │ Port 'chatgoose-content' (+ runtime.sendMessage для разовых запросов)
background.js (event page, «движок»)
 ├─ webRequest.onBeforeSendHeaders(apiv3.fansly.com) → SessionStore (заголовки сессии чаттера, только в памяти)
 ├─ FanslyClient → fetch https://apiv3.fansly.com/api/v1/... с теми же заголовками
 ├─ OperationCoordinator / KernelFeatureGateway → хаб (SSE)
 └─ AgencyHubClient (vendored @kernel/sdk) → хаб (JSON)
```

### 4.2 Как читаются данные Fansly

Четыре механизма, DOM-парсинг минимален:

1. **Перехват учётных данных сессии через `webRequest`** (не MAIN-world-перехват fetch): `browser.webRequest.onBeforeSendHeaders` на `https://apiv3.fansly.com/*` с `['requestHeaders']` (неблокирующий) снимает 4 обязательных заголовка самих запросов страницы — `authorization`, `fansly-client-id`, `fansly-client-ts`, `fansly-session-id` + опционально `fansly-client-check` (по route-ключу) (`src/background/session-capture.ts:40-125`). accountId = base64-декод `authorization` до `:` (`session-capture.ts:5-13`). Хранится только в памяти background (`src/background/session-store.ts:14-74`), привязка tabId→account; 401/403 → `markDisconnected`.
2. **Прямые вызовы Fansly REST API из background** с этими заголовками (`credentials: 'omit'`, `?ngsw-bypass=true`), `src/background/fansly-client.ts:415-546` (GET с ретраями 1/2/4 c, Retry-After, 429→`rate_limited`, 401/403→`session_expired`) и `postOnce` для записей без ретраев (`fansly-client.ts:636-696`). Эндпоинты:
   - `GET /api/v1/message?groupId&limit=25&before=` — история (пагинация, 300 мс пауза) (`fansly-client.ts:774-789, 1268-1311`);
   - `GET /api/v1/group/{groupId}/` — участники чата → fanAccountId (`fansly-client.ts:549-565`);
   - `GET /api/v1/account/me` — идентичность креатора (`:717-772`, `getAuthenticatedAccount` — `:722`); `GET /api/v1/account?ids=` — имена/био/аватар/кастомное имя фана (note contentType 12002) (`:913-945`);
   - `GET /api/v1/account/wallets/earnings/stats/accounts` и `/monthlystats/accounts` — траты фана (для контекста ИИ) (`:947-970, 1072-1091`);
   - `GET /api/v1/messaging/groups` (инбокс/поиск) и `GET /api/v1/subscribers` — подписка фана, поиск чата (`:976-1200`);
   - `GET /api/v1/media/orderhistory` — проверка купленности PPV (до 10 проверок, конкурентность 3) (`:791-911`);
   - фоловеры: `GET /api/v1/account/{creator}/followersnew`, `GET /api/v1/message/automated` (welcome-сообщения) (`:567-580`);
   - **записи**: `POST /api/v1/group` (get-or-create чата по паре участников) и `POST /api/v1/message` (отправка) — только в окне «Новые фоловеры» после клика (`:698-715`).
   - Пейсинг: `src/background/fansly-pacer/*` (политика на семейство маршрутов, выученный интервал, 400 мс джиттер, кулдаун, лимиты переживают перезапуск background) — применяется только к opt-in «follower-сессиям» (скан фоловеров и welcome-определения, `fansly-client.ts:333-339`); обычные AI-чтения идут без пейсера — фиксированная пауза 300 мс между страницами + ретраи (E130–E133).
3. **DOM Fansly — только для «где я и куда вставлять»** (`src/content/conversation-dom.ts`): селекторы Angular-компонентов `app-messages-conversation-route`, `app-group-message-input`, `app-group-message-container`, `app-account-username .user-name`, `textarea.message-input` (`conversation-dom.ts:9-17`). Из DOM берутся: якорь для монтирования, textarea композера, отображаемое имя фана (только как UI-лейбл, в ядро не идёт — `src/background/operations.ts:396-409`). Историю сообщений из DOM НЕ парсят.
4. **MAIN-world тап сокета** (E145/E146): `src/content/page-socket-tap.ts` — Proxy над `window.WebSocket`, `addEventListener` (захваченный до zone.js) на `message/open/close` сокета `wsv3.fansly.com`; парсер `src/shared/fansly-ws-frame.ts` (обёртка `{t,d}`, `t:10000` ServiceEvent, `serviceId 5` MessageService `type 1` = новое сообщение; `serviceId 3` FollowerService `type 2` = фоллоу; `t:10001` батч). Наружу уходит текст-free проекция `{id, groupId, senderId, type, createdAt, correlationId, inReplyTo, tip}` через `CustomEvent` с JSON. Используется **только для звука** (входящее сообщение/новый фоловер), не для ИИ и не для UI чата.

### 4.3 Как определяется текущий чат/фан

- **Чат** = `groupId` из URL `/messages/<groupId>` (`src/shared/fansly-routes.ts:4-7`). SPA-навигация отслеживается **поллингом `location.pathname` каждые 500 мс** (один интервал на бандл, `src/content/route-watcher.ts:6-45`, `ROUTE_POLL_INTERVAL_MS`), т.к. content-скрипт не видит history API страницы.
- **Фан** = второй участник группы: background делает `GET /group/{groupId}` и берёт `userId != resolvedAccountId` (`src/background/operations.ts:2357-2361`). Канонический id креатора — из `GET /account/me` (ленивая резолюция, ключи «legacy id» из Authorization ↔ «resolved id»).
- **Аккаунт креатора** (= «страница» в хабе): `pageLabel` резолвится точным совпадением username креатора с `GET /pages` хаба (`src/background/agency-hub-client.ts:323-356, 419-440`).

### 4.4 Как вставляется текст

`src/content/textarea.ts:28-49`: найти textarea композера → `focus()`+`select()` → `document.execCommand('insertText', false, text)` (сохраняет undo и будит Angular), фолбэк — `textarea.value = text` + `input`/`change` события; проверка `textarea.value === text`, иначе `insertion_failed`. Отправка — всегда родной Enter Fansly (расширение в чате ничего не отправляет само). Черновик для Fix читается из `textarea.value`; изменения отслеживаются делегированным `input`-слушателем (`src/content/index.ts:447-466`).

### 4.5 Как монтируется UI

- Тулбар + inline-панель + баннер маппинга — один `div#chatgoose-root`, вставляется **прямо перед `app-group-message-input`** (`src/content/conversation-mount-controller.ts:70-81`). Ре-аттач: `MutationObserver` на родителе route-root (`childList, subtree`) с фильтром мутаций внутри своего root + setTimeout(0)-дебаунс (`:147-187`); ретраи 50 мс в течение 10 с, потом медленный поллинг 2 с (`:118-145`).
- Оверлеи (Coach, Recap, Review, Voice, доска Spenders, шпаргалка, тосты) — в `body` (`#chatgoose-overlay-root`, `#chatgoose-toast-root`) (`src/content/dom-anchor.ts:19-37`).
- Глобальные лаунчеры на любой странице Fansly: кнопка «Новые» (фоловеры) (`src/content/bootstrap.ts:97-115`), лаунчер доски Spenders (`bootstrap.ts:261-264`), лаунчер Vault на `/creator/vault` (`bootstrap.ts:329-341`).
- Стили — глобальные `<style id="chatgoose-style">` из `content.css` (3 930 строк) — изоляция только префиксами классов; есть тест на слоение стилей. Тема — CSS-переменные (`src/shared/theme.ts`).
- Открытие чата с доски — через роутер Angular: `history.pushState` + синтетический `popstate`, проверка через 2 с и фолбэк на `location.assign` (`src/content/index.ts:1198-1228`).

### 4.6 Есть ли адаптер платформы

**Нет выделенного слоя.** Fansly-специфика размазана: DOM-селекторы — в `conversation-dom.ts` (хорошо локализованы), но знание о Fansly REST, формах ответа (`FanslyMessage`, `FanslyGroup`…), PPV/orderhistory, earnings, note 12002, snowflake-датах, welcome/automated-сообщениях живёт в `fansly-client.ts`, `operations.ts`, `shared/transcript.ts` (872 строки нормализации сообщений Fansly), `shared/followers.ts`, `shared/greeting-context.ts`, `followers-service.ts`, `spenders-service.ts`, `voice-service.ts`, `vault/*`. В запросах к ядру `platform: 'fansly'` захардкожен (`src/background/kernel-feature-gateway.ts:457`, тело `streamAiFeature`). Т.е. «ядро» и «Fansly» переплетены на уровне `OperationCoordinator.startOperation` (сбор контекста + вызов ИИ в одной функции).

---

## 5. Связь с хабом (Agency Hub, «ядро»)

### 5.1 Транспорт

- **Только vendored `@kernel/sdk`** (`vendor/kernel-sdk`, генерируется хабовым `scripts/vendor-sdk.mjs`; contractHash `b95b765c…`, core `e033e3ec`; дрейф пинится тестом `tests/kernel-sdk-vendor.test.ts`). Своего fetch к хабу нет: JSON-операции через `createClient(...)` (`src/background/agency-hub-client.ts:236-259`, обёртка `sdkFor`), генерации — через `streamAiFeature` (SSE) (`src/background/kernel-feature-gateway.ts:325-560`, вызов SDK — `:445`). SDK описывает 254 операции, расширение использует ~16.
- Все вызовы — из background (event page). Каждый запрос несёт `x-client-version: chatgoose-extension/<версия>` (`src/shared/client-version.ts`). Адрес хаба — `settings.agencyHubBaseUrl` (дефолт `https://gosling-agency.ru`, `src/shared/constants.ts:17`).

### 5.2 Используемые операции

| Операция SDK | Метод/путь (по смыслу) | Зачем | Где |
|---|---|---|---|
| `authIssueDeviceTokenWithPassword` | `POST /auth/device-tokens/password` (публичный, `mode: 'active'`) | Вход логин+пароль → device token (bearer) | `device-token.ts:85-160` |
| `authRevokeCurrentDeviceToken` | revoke | «Выйти» (best-effort, 5 с) | `agency-hub-client.ts:706-740` |
| `me`, `raw('health')` | identity / health | «Статус», «Проверить связь» | `agency-hub-client.ts:750-800` |
| `pages` | список страниц, доступных чаттеру | **резолв `pageLabel`** по точному username креатора + `platform === 'fansly'`; capability `voiceNotesCapable` | `agency-hub-client.ts:323-356, 419-440`; `voice-service.ts:1297-1370` |
| `aiPersonaCatalog` | каталог персон (метаданные) | persona key + definitionId для маппинга | `agency-hub-client.ts:677-700`, `persona-catalog.ts` |
| `streamAiFeature` | `POST /api/v1/ai/features/:feature` (SSE) | **все AI-генерации** | `kernel-feature-gateway.ts` |
| `aiRecapStatus` | метаданные рекапов fan | «есть ли рекап, какого возраста» (Coach/Recap picker) | `agency-hub-client.ts:541-590` |
| `pageConversationProfile` | GET досье фана | preflight перед пушем рекапа | `agency-hub-client.ts:358-376` |
| `upsertFanProfile` | PUT досье (тело ≤ лимита, `generatedAtMs`) | запись полного Recap в `fan_profiles` | `agency-hub-client.ts:378-397` |
| `pageTopSpenders` | `GET /pages/:pageLabel/top-spenders` (lifetime + `YYYY-MM`, лимит 1000, фолбэк 500) | доска Spenders | `agency-hub-client.ts:595-675`, `spenders-service.ts` |
| `followerOutreachAttempt` | reserve / dispatch / sent | кросс-девайсная опека отправки фоловерам | `agency-hub-client.ts:261-270`, `followers-service.ts:1028, 1043, 1061` |
| `voiceNoteCreate`, `voiceNoteStatus`, `fetchVoiceNoteAudio` | платная озвучка | Voice | `agency-hub-client.ts:486-530`, `voice-service.ts` |
| `ingestObservations` | capture lane `ai_acceptance` | телеметрия shown/copied/inserted | `acceptance-reporter.ts:154` |
| `aiUsageBatch` | — | **мёртвый код** (вызывающих нет; метеринг — в ядре по `usage`-кадрам) | `agency-hub-client.ts:400-410, 849-900` |

Подписок на события хаба (SSE events, WS) **нет** — расширение «живое» за счёт самого Fansly, хаб только отвечает на запросы.

### 5.3 AI-генерации: какой контекст шлёт клиент

Запрос строится в `OperationCoordinator.startOperation` (`src/background/operations.ts:2903-2955`) и уходит телом:

```
{ clientRequestId (=operationId, UUID), pageLabel, platform: 'fansly',
  conversationRef (fanAccountId; для coach/recap — groupId) , fanRef?,
  personaKey, expectedPersonaDefinitionId, replyTone?, replyMode?, draftText?,
  isRegeneration, chatterQuestion? / preset? / coachHistory? (coach),
  summaryMode? ('short'), variantCount? (hi: 3 | followers: 1), messageCount (запрошенное окно),
  clientContext: { transcript (≤300k симв., oldest-first усечение), messageCount (kept),
                   fanDisplayName, fanSpendingData, fanSubscriptionData, fanBio?, fanCustomName?,
                   fanUsername?/fanAvatarUrl?/personalMessageCount? (только hi),
                   pingSegment?/fanSilenceDays? (ping), transcriptCoverage? (coach/short recap),
                   media? (нумерованные медиа окна, только id) } }
```

- **Промпты, персоны, модели, бюджеты, квоты, учёт стоимости — в ядре**; клиент шлёт только **значения контекста** (Stage 32, E3/E5). Формат транскрипта — клиентский: строки `[HH:MM] Model|Fan: [метки] текст`, метки `[Tip: $X]`, PPV с состоянием покупки (проверка через `orderhistory`), `[Photo #n]` (`src/shared/transcript.ts:549-640, 712-800`) — это де-факто контракт с хабом.
- **Важное для ChatSpace**: хаб принимает `clientContext` **только для Fansly-страниц** и отвергает его для OnlyFans («clientContext is only accepted for fansly pages» — `hub/apps/runtime/src/modules/ai/features/index.ts:468-473`). Для OnlyFans ядро само грузит транскрипт/траты/подписку/имя/био из своего OFAPI-архива (`index.ts:540-600`), а десктоп шлёт только ссылки: `platform: 'onlyfans', conversationRef: chatId` (`apps/desktop/src/main/hub/ai-feature-gateway.ts:172-195`). Т.е. в общем ядре нужно две «полосы контекста»: `client` (Fansly) и `hub` (OnlyFans).
- SSE-кадры: `meta` (requestId, model, personaDefinitionId — сверяется с ожидаемым, иначе результат отбрасывается; квота; attachedRecaps/presetQuestion для coach), `debug_input_v1` (эхо промпта), `content_delta`, `reasoning_delta`, `usage` (токены, `costMicroUsd`), `done` (stopReason), `error` (provider_* → русские карточки `CG-HUB-*`) (`kernel-feature-gateway.ts:362-440`, ошибки — `:170-203`). Обрезанный поток (нет `done`/исчерпание выхода, `isOutputExhausted`) — ошибка, никогда не результат. Гейт-ошибки ядра (`gate_min_messages`, `gate_hi_greeting_limit`, `gate_ping_active`, `gate_voice_disabled`) мапятся в ключи расширения (`:205-240`).
- Таймауты: quick — 60 с всего; deep — prep 360 с, TTFB 45 с, idle 45 с, max stream 300 с (`constants.ts:208-219`). Стрим в content — пачками раз в 50 мс (`STREAM_CHUNK_FLUSH_MS`) через Port.

### 5.4 Авторизация чаттера и хранение ключей

- Один логин+пароль на чаттера для обоих клиентов (E123, 2.4.0); legacy chatter key удалён (миграция v17). Обмен на **device token** через публичный маршрут, без cookie (вход в расширении не разлогинивает дашборд хаба в том же Firefox) (`device-token.ts:1-20`).
- Хранение: `storage.local` ключ `agencyHubDeviceToken` (открытым текстом, отдельный ключ — «per-key custody», E19), метаданные `chatgoose:deviceTokenMeta` (prefix, когда/откуда выпущен). Все мутации — через один FIFO (`withAgencyHubCustodyLock`, `src/background/hub-custody.ts:24-35`). **Самолечение**: 401 с названной причиной (`token_revoked`/`token_expired`) и тем же bearer → wipe этого устройства; «голый» 401 — fail-closed, без разлогина (`hub-custody.ts:1-12`).
- Учётка Fansly в хаб **не передаётся** — расширение ездит на сессии чаттера в его браузере.

### 5.5 Что хаб делает для расширения «за кадром»

- Подмешивает сохранённое полное досье (Recap) в промпты остальных фич (Core #136) — отсюда автоматический re-push рекапа (§3.12).
- Считает траты фанов (проекция earnings, обходит Fansly по своему расписанию) → доска Spenders; клиент не считает деньги сам (CLAUDE.md «Money»).
- Хранит персоны, квоты, журнал генераций (restricted capture), acceptance lifecycle.

### 5.6 `@chatgoose/hotkeys`

Используется (vendored, тот же sha, что в десктопе) — см. §3.5.

---

## 6. Качество и техдолг

### 6.1 Что сделано хорошо (стоит сохранить как принципы)

- **Чёткое разделение процессов**: content (UI, DOM) / background (сеть, секреты, оркестрация) / options+popup; ESLint запрещает content импортировать background (E1). В background — **composition root с конструкторной DI**, без модульных синглтонов (`src/background/index.ts:36-193`).
- **AI только через ядро**, закреплено grep-гейтом (`scripts/check-ai-cutover.mjs`) — ключей и промптов в клиенте нет.
- **Fail-closed семантика**: обрезанный SSE = ошибка (`kernel-feature-gateway.ts:536-562`, проверка `done` — `:546`), неопределённая отправка никогда не повторяется (followers custody `followers-service.ts:1063-1078`, Voice paid-attempt CAS, Vault `uncertain`), persona definition сверяется по meta-кадру, stale-результаты отсекаются по `operationId`/`routeNonce`/`summaryCommitToken`.
- **Реестр ошибок** с кодами `CG-FAN-*`, `CG-HUB-*`, `CG-API-*` (59 кодов, `src/shared/errors.ts`), русская копия, deep-link в панель настроек, связан с семейной таксономией хаба (`hub/docs/error-handling.md`, колонки «extension key / code»).
- **Опека хабовых учётных данных**: FIFO + «wipe must prove itself» (`hub-custody.ts`), отдельные ключи хранения, нумерованные forward-only миграции (`src/shared/migrations.ts`, схема v19).
- **Пейсинг Fansly** для фоновых чтений (`fansly-pacer/*`), бюджеты/таймауты на всё (доска 120 с, имена 12 с, deep prep 360 с).
- **Ленивые бандлы и «ноль работы вне маршрута»** (E75, E111): bootstrap крошечный, чат/фоловеры/vault — динамический `import()`.
- **Тесты**: 146 файлов, структурные гейты (дрейф SDK/хоткеев, producer-gate реестра ошибок, страницы релиза).
- **Debug-инструменты**: эхо промпта, профилирование стадий, журнал фоловеров с экспортом.

### 6.2 Техдолг и проблемы

1. **«Божественные» модули с неявной машиной состояний.**
   - `ChatGooseContentApp` — 4 275 строк, 56 изменяемых полей (+15 readonly-контроллеров) (`activeFeature`, `activeOperationId`, `activeCompareModel`, `coachRecapChain`, `recapPickerModel`, `deepOverlayModel`, `quickInlineVisible`, `quickSurfaceMode`, `inlineImprove`, `suppressedTerminalOpIds`…) (`src/content/index.ts:299-722`). Поверхности переключаются россыпью флагов; `planSurfaces` (`surface-planner.ts`) — чистый, но состояние вокруг него — нет. Комментарии фиксируют 15+ раундов ревью гонок именно здесь.
   - `OperationCoordinator.startOperation` — ≈1 950 строк (`src/background/operations.ts:1612-3556`): валидация, чтение Fansly, PPV-проверки, earnings, подписка, welcome, ping-анализ, сборка транскрипта, резолв pageLabel, вызов ядра, таймауты, профилирование, кэш рекапа, синк в хаб — в одной функции.
   - Options: `render()` — один ≈4 960-строчный (`src/options/index.ts:615-5574`); `overlay-controller.ts` — 3 632 строки.
2. **Нет слоя адаптера платформы** (см. §4.6): знание о Fansly REST/DOM/единицах (mills, коды транзакций 2110/2116/7101/15001 в `src/shared/earnings.ts:9-14`, note 12002, snowflake-даты) размазано по background и shared. `platform: 'fansly'` захардкожен в гейтвее (`kernel-feature-gateway.ts:457`), резолв страницы фильтрует `platform === 'fansly'` (`agency-hub-client.ts:345, 801`).
3. **Мёртвый код**: движок Compare/Multi (`compare-operations.ts` 1 395 строк + ветки `startCompare`/`compare:*` в content и протоколе; кнопки нет, каталог черновиков пуст), `aiUsageBatch`, типы `PromptBuildInput`/`PromptTextBlock` (`src/shared/types.ts:215+`), `COMPARE_TEMPERATURE`, инертная настройка `promptCachingEnabled` в `DEFAULT_SETTINGS`.
4. **Непоследовательная валидация на границах**: followers — zod (`src/shared/followers-protocol.ts`), остальное — ручные guard-функции (`src/shared/protocol.ts`, 729 строк); три независимых `runtime.onMessage`-слушателя (runtime-api, followers-runtime, message-sound-runtime).
5. **Глобальное состояние в content**: модульные `let` в bootstrap (`src/content/bootstrap.ts:23-28`), realm-глобальный слот движка хоткеев, модульные FIFO-очереди в background (ops-daily, hub-custody, quota-tracker) — терпимо, но мешает тестам/повторному использованию.
6. **UI без фреймворка и без изоляции**: ручной DOM + глобальный `content.css` (3 930 строк) прямо в DOM Fansly, изоляция только префиксами `chatgoose-*`; Shadow DOM — только у окна фоловеров. Смешанный язык UI (кнопки/inline-панель по-английски, подсказки/оверлеи по-русски).
7. **Производительность** (по коду и `docs/research/performance-2026-09-07/README.md`):
   - поллинг `location.pathname` каждые 500 мс (`route-watcher.ts:35`) вместо подписки на роутер;
   - `MutationObserver` на родителе route-root с `subtree: true` (фильтр «своих» мутаций + дебаунс setTimeout(0)) (`conversation-mount-controller.ts:147-187`);
   - scroll-компенсация при каждом рендере inline-поверхности ищет скролл-контейнер TreeWalker'ом с `getComputedStyle` при промахе кэша — плохо масштабируется с длиной переписки (`src/content/scroll-compensation.ts:55-75`; отмечено в perf-исследовании);
   - доска Spenders при обогащении пересоздаёт все строки (1000 строк → 1000 новых узлов; одинаковый поиск даёт ~1000 childList-записей) (perf README, п. 2);
   - **Fansly-egress на одну генерацию** (Reply): ~4 страницы сообщений + `group` + до 10 `orderhistory` + `account` + 2 запроса earnings + поиск подписки (обход инбокса до 20 страниц × 100, затем `subscribers`) — кэш подписки/покупок 5 мин (`fansly-client.ts:1093-1146, 1203-1266`; `operations.ts:2602-2700`). Для глубоких фич — до 120 страниц сообщений и до 12 помесячных earnings.
   - каждый запуск генерации делает ещё и `pages()` хаба для резолва `pageLabel` — кэша списка страниц в `AgencyHubClient` нет (`agency-hub-client.ts:323-356, 419-428`, вызов из `operations.ts:2863`); voice-способность кэшируется на 5 мин;
   - стрим рендерится через rAF и батчи 50 мс — это нормально.
8. **Безопасность**:
   - Заголовки сессии Fansly — только в памяти background, запросы с `credentials: 'omit'` — хорошо.
   - Device token — открытым текстом в `storage.local` (норма для расширений, но шифрования нет).
   - MAIN-world мост звука слушает page-reachable `CustomEvent` — страница может подделать «входящее сообщение» (последствие — лишний звук); relay валидирует и не умеет ничего, кроме `messageSound` (`src/content/sound-relay.ts:1-9`).
   - Proxy над `window.WebSocket` в MAIN world — вмешательство в чужую страницу (аккуратно: нативный объект, только `addEventListener` до zone.js).
   - `innerHTML` только для статических шаблонов (фоловеры, debug); AI-текст — через `textContent`.
   - `optional_host_permissions: http://*/*, https://*/*` — широкие, но запрашиваются по жесту только для нестандартного хаба.
   - Эхо промпта не попадает в DOM Fansly (только проекция счётчиков + токен; полный промпт — на extension-странице, E28).
9. **Известные баги/ограничения из истории**:
   - Hi в чате закрыт для фанов, чья история не помещается в 1 страницу (страницы с ежедневными масс-рассылками), хотя окно «Новые» таких приветствует — открытый вопрос владельцу (`docs/decisions.md:4751-4756`).
   - Верификация фоловеров создаёт пустые «технические» чаты (`POST /group`), живая производительность очереди не измерена (E138/E139).
   - TODO владельца №1: «AI-slop» — шаблонные/ассистентские ответы (`TODO.md`; в памяти проекта — это вопрос модели/effort на хабе, не клиента).
   - Firefox не выдаёт новые `host_permissions` при обновлении (bug 1893232) → доступ к хабу спрашивается при первом входе (`background/index.ts:221-241`).
   - Документация разрослась: `decisions.md` 376 KB с неполной quick-ref таблицей, `docs/generated/` устарели (1.6.0), комментарии в коде ≈13% строк, часто — история ревью.
10. **Только Firefox**: event page, `browser.*` без полифилла, `wrappedJSObject`/`cloneInto` (Xray), dynamic import из content script, `data_collection_permissions` — перенос в Chrome потребует переработки.

### 6.3 Что переиспользовать, а что нет

**Переиспользовать (как есть или почти):**
- Контракты хаба через vendored `@kernel/sdk` и хабовую логику промптов — целиком (клиенту остаются только ссылки/значения контекста).
- `@chatgoose/hotkeys` — как есть (общая схема с десктопом; возможно, понадобится третий `HotkeyClient` или режим «extension» для ChatSpace — проверить конфликты с хоткеями ChatSpace).
- Модули логики без платформы: `kernel-feature-gateway.ts` (маппинг кадров/ошибок SSE, сверка персоны, fail-closed по `done`), `hub-custody.ts` + `device-token.ts` (вход/выход/самолечение), `acceptance-reporter.ts`, `quota-tracker.ts`, `persona-catalog.ts`, `shared/reply-output.ts` (`[NEXT]`/`[VARIANT]`), парсеры Help/Review XML и `summary-markdown`/`analysis-blocks`, `coach-session.ts` + `coach-history.ts` + `coach-draft.ts`, `shared/errors.ts` (реестр, без `CG-FAN-*` копии), `shared/voice-attempt.ts` (машина состояний платной попытки), `message-sound-decision.ts` + `sound-synth.ts`, `surface-planner.ts` (как идея), `migrations.ts`/`storage-coordinator` (как паттерн), `fansly-pacer` (как механизм для любого «эгресса на сессии чаттера»).
- UX-решения: тулбар Reply+тон+Split | Fix | Hi·Ping·Review·Recap·Coach, inline-панель с «клик = вставить», Recap picker, Coach-чат с пресетом Help, доска Spenders, кабинет настроек, тексты ошибок.

**Не переиспользовать (переписать):**
- `fansly-client.ts`, `session-capture.ts`/`session-store.ts` (снятие заголовков через `webRequest`), `conversation-dom.ts`, `textarea.ts` (execCommand для textarea; в ChatSpace — TipTap `editor.commands`), `route-watcher.ts` (поллинг; в ChatSpace — `router.afterEach`), Fansly-нормализация транскрипта/PPV/earnings, `fansly-ws-frame.ts`, vault DOM, followers DOM/REST.
- «Божественные» классы (`ChatGooseContentApp`, `startOperation`, options `render`, `overlay-controller`) — разрезать на фичи/стор/представления.
- Ручной DOM без Shadow DOM — для ChatSpace (Tailwind+PrimeVue) нужна изоляция стилей (Shadow DOM) и лёгкий UI-фреймворк.
- Мёртвый код (Compare, aiUsageBatch, prompt-типы).

---

## 7. Платформенно-независимое ядро vs специфика хоста

### 7.1 Классификация текущих модулей

| Слой | Модули (сейчас) | Вердикт |
|---|---|---|
| **Хаб-клиент** (общий, параметризовать `platform`) | `device-token.ts`, `hub-custody.ts`, `agency-hub-client.ts` (pages/persona/recap/profile/top-spenders/outreach/voice/me/health), `kernel-feature-gateway.ts`, `acceptance-reporter.ts`, `quota-tracker.ts`, `persona-catalog.ts`, `ops-daily.ts`, `client-version.ts` | Ядро. Убрать хардкод `'fansly'` (`kernel-feature-gateway.ts:457`, `agency-hub-client.ts:345, 801`), добавить полосу контекста `hub` (OnlyFans: без `clientContext`). |
| **Доменная логика без DOM** | `features.ts` (политики; бакет `hi=25` — «1 страница Fansly» — вынести в адаптер), `reply-output.ts`, `split.ts`, `xml.ts`, парсеры Help/Review, `coach-session.ts`/`coach-history.ts`/`coach-draft.ts`/`coach-format.ts`, `spenders.ts` (тиры/формат по mills хаба), `voice-attempt.ts`, `message-sound-decision.ts` (частично: `automationReason` из Fansly), `sound-synth.ts`, `errors.ts` (кроме `CG-FAN-*` текстов), `options-routes.ts`, `theme.ts`, `hotkeys.ts`, `migrations.ts`/`storage.ts`, `summary-cache.ts`, `persona-*` | Ядро (с мелкой чисткой). |
| **Оркестрация** | `OperationCoordinator` (lifecycle, single-op lock, таймауты, стрим, кэши, recap-sync), `operation-*`, `coach-transcript-cache.ts`, `surface-planner.ts` | Ядро — **после** выноса сбора контекста Fansly из `startOperation` в порт. |
| **UI-поверхности** | `button-bar.ts`, `inline-panel/*`, `overlay/*`, `spenders-board-controller.ts`, `cheatsheet-controller.ts`, `toast.ts`, `mapping-banner.ts`, `ui/*`, options, popup | Ядро по смыслу, но переписать (Shadow DOM, view-model, фреймворк). |
| **Смешанные — резать** | `spenders-service.ts` (ранжирование хаба = ядро; карта fan→groupId и обход имён Fansly = хост), `voice-service.ts` (хаб = ядро; привязка к маршруту/attach = хост), `followers-service.ts` (поток/опека/черновик = ядро; REST/инбокс/`POST /group` = хост), `greeting-context.ts` (форма контракта = ядро; валидация аватара Fansly = хост), `message-sound-service.ts` (решение = ядро; сессия вкладки = хост), `welcome-definitions.ts` (кэш = ядро; чтение `/message/automated` = хост) | Разделить по порту. |
| **Хост Fansly** | `session-capture.ts`, `session-store.ts`, `fansly-client.ts`, `fansly-pacer/*` (политики), `conversation-dom.ts`, `conversation-mount-controller.ts`, `textarea.ts`, `route-watcher.ts`, `fansly-routes.ts`, `transcript.ts` (нормализация Fansly-сообщений, PPV/orderhistory, медиа), `earnings.ts`, `subscriptions.ts`, `fansly-custom-name.ts`, `followers.ts` (snowflake, automation), `fansly-ws-frame.ts`, `page-socket-tap.ts`, `sound-relay.ts`, `native-file-handoff.ts`, `voice/attach-adapter.ts`, `vault/*`, `openFanChat` (Angular pushState+popstate, `content/index.ts:1198-1228`) | Адаптер `FanslyHost`. |

### 7.2 Чем хост ChatSpace отличается (по FACTS.md) — что это значит для порта

| Аспект | Fansly (сейчас) | ChatSpace (OnlyFans) |
|---|---|---|
| Где живёт адаптер | isolated content (DOM) + **background** (REST на снятых заголовках) + MAIN-world тап сокета | **MAIN world** (Vue app `#app.__vue_app__`, `$router`, `$pinia`, TipTap `.ProseMirror.editor`) + мост в isolated world |
| Текущий чат | URL `/messages/<groupId>`, поллинг 500 мс | `router.currentRoute` `/accounts/:accountId/chats/:chatId`, подписка `router.afterEach` |
| Креатор | захват `authorization` → `account/me`; 1 аккаунт на вкладку | `accountId` (OnlyMonster) → `["accounts"]` (platform_account_id, username); **несколько креаторов в одной вкладке** |
| Фан / ref для хаба | `GET /group` → fanAccountId; conversationRef = fanAccountId (coach/recap — groupId) | chatId = OF fan id = conversationRef = fanRef (как в десктопе) |
| Контекст ИИ | **client lane**: транскрипт/траты/подписка/био собирает клиент | **hub lane**: хаб отвергает `clientContext` для OnlyFans, берёт контекст из своего архива |
| Вставка | textarea + `execCommand('insertText')` | `editor.chain().focus().insertContent()`, `clearContent(true)`; черновик ChatSpace в `localStorage chat-space:draft:of:{acc}:{fan}` |
| Живые события | Proxy над `WebSocket` Fansly | Pinia (`chats.$subscribe`, `_pc_query.$onAction`) или WS `account_new_message` / `account_fan_typing` |
| Навигация | pushState+popstate (Angular) | `$router.push({name:'chat', params})` |
| Монтирование | перед `app-group-message-input` | у композера (testid нет, есть aria-label кнопок) — Shadow DOM обязателен (Tailwind/PrimeVue) |
| Данные для UI-гейтов | REST | Pinia-кэш: `["chatMessages",acc,fan]`, `["fansMap",acc]`, buying power, last payments, insights |

### 7.3 Предлагаемый интерфейс «порта хоста» (HostPort)

Принципы: (1) ядро не трогает DOM/JS страницы иначе как через порт; (2) все методы асинхронны и сериализуемы (порт ChatSpace живёт в MAIN world за мостом, порт Fansly частично в background); (3) возможности объявляются заранее (`capabilities`), ядро скрывает недоступные фичи; (4) единицы нормализованы (время — epoch ms, деньги — как ждёт хаб), id — в семантике хаба (`conversationRef`/`fanRef`); (5) любые записи в платформу — только явные, однократные, без авто-ретраев.

```ts
type Platform = 'fansly' | 'onlyfans';
type Unsubscribe = () => void;

interface HostCapabilities {
  contextLane: 'client' | 'hub';   // Fansly: client (clientContext); OnlyFans: hub (только ссылки)
  multiCreatorPerTab: boolean;     // ChatSpace: true
  composerAttach: boolean;         // Voice → прикрепить MP3 к композеру
  incomingMessageEvents: boolean;  // звук/бейджи
  followerEvents: boolean;         // звук нового фоловера
  followers: boolean;              // окно «Новые фоловеры»
  vaultUpload: boolean;            // загрузчик в vault
  directSend: boolean;             // отправка мимо композера (только фоловеры)
}

interface CreatorIdentity {
  platform: Platform;
  platformAccountId: string;       // Fansly canonical id / OF creator id
  username: string | null;         // ключ резолва pageLabel в хабе (`pages`)
  displayName: string | null;
  hostAccountId?: string;          // OnlyMonster accountId (route param)
}

interface ConversationIdentity {
  creator: CreatorIdentity;
  conversationRef: string;         // Fansly groupId | OF chatId
  fanRef: string | null;           // Fansly fan account id (резолвится) | OF chatId
  fanLabel: string | null;         // только для UI (DOM/кастомное имя), не идентичность
}

/** Нормализованная переписка (client lane и окно фоловеров). Строку `[HH:MM] Fan: …`
 *  для хаба собирает ЯДРО из этих полей (сейчас — shared/transcript.ts). */
interface HostTranscriptMessage {
  id: string;
  at: number;                                   // epoch ms
  sender: 'fan' | 'model';
  text: string;                                 // plain text
  labels: string[];                             // '[Tip: $5.00]', PPV/медиа-метки с состоянием покупки
  media?: Array<{ kind: 'photo' | 'video'; mediaId: string;
    placement: 'inline' | 'appended' | 'preview'; paid: boolean }>;
  automated?: boolean;                          // welcome / mass message
}
interface HostTranscript { messages: HostTranscriptMessage[]; reachedEnd: boolean }

/** Статическое описание хоста — без доступа к странице, годится для background
 *  (tabs.query, «этот чат открыт в фокусном окне?» для звука, атрибуция вкладок). */
interface HostDescriptor {
  platform: Platform;
  matches: string[];                            // content_scripts / tabs.query
  parseUrl(url: string): { hostAccountId?: string; conversationRef: string | null } | null;
}

interface HostPort {
  readonly platform: Platform;
  readonly capabilities: HostCapabilities;

  // 1. Идентичность и маршрут  — все фичи, тулбар, маппинг персоны, pageLabel
  currentCreator(): Promise<CreatorIdentity | null>;
  currentConversation(): Promise<ConversationIdentity | null>;
  onCreatorChange(cb: (c: CreatorIdentity | null) => void): Unsubscribe;
  onConversationChange(cb: (c: ConversationIdentity | null) => void): Unsubscribe;
  sessionState(): Promise<'connected' | 'disconnected' | 'unknown'>; // Fansly: заголовки сняты/401; ChatSpace: Clerk-сессия

  // 2. Композер  — Reply/Fix/Hi/Ping (вставка), Fix/Coach/Voice (чтение черновика), Split-части
  readDraft(): Promise<string>;
  writeDraft(text: string, mode: 'replace' | 'append'): Promise<'ok' | 'failed'>;
  focusComposer(): Promise<void>;
  onDraftChange(cb: (hasText: boolean) => void): Unsubscribe;
  attachToComposer?(file: File, signal: AbortSignal):
    Promise<'confirmed' | 'uncertain' | 'unavailable'>;            // Voice (Fansly: native input + waveform)

  // 3. Поверхности UI  — тулбар/inline-панель у композера, оверлеи в body
  toolbarAnchor(): Promise<{ parent: Element; before: Element | null } | null>;
  onAnchorInvalidated(cb: () => void): Unsubscribe;               // Fansly: MutationObserver; ChatSpace: смена роута/ремоунт
  hostTheme?(): Promise<'light' | 'dark' | null>;

  // 4. Навигация  — доска Spenders, фоловеры, «перейти к аккаунту» в «Аккаунтах»
  openConversation(t: { conversationRef?: string; fanRef?: string; creator?: CreatorIdentity }):
    Promise<'navigated' | 'reloaded' | 'failed'>;
  openCreator?(creator: CreatorIdentity): Promise<boolean>;      // Fansly: фокус вкладки; ChatSpace: смена accountId в SPA
  resolveConversationRef?(fanRef: string, hints: { username?: string; displayName?: string },
    signal: AbortSignal): Promise<string | null>;                 // Fansly: поиск по инбоксу; OF: = fanRef

  // 5. Контекст для client lane (только contextLane === 'client') — все AI-фичи Fansly
  loadTranscript?(c: ConversationIdentity, q: { limit: number; signal: AbortSignal;
    onProgress?: (p: { page: number; target: number }) => void }): Promise<HostTranscript>;
    // HostTranscript = нормализованные сообщения {id, at, sender:'fan'|'model', text, labels, media[], automated}
    //                 + reachedEnd; формат строки для хаба собирает ЯДРО (общий форматтер)
  loadFanProfile?(fanRef: string, signal: AbortSignal): Promise<{ username: string | null;
    displayName: string | null; customName: string | null; bio: string | null; avatarUrl: string | null } | null>;
  loadFanMoney?(fanRef: string, q: { deep: boolean; signal: AbortSignal }):
    Promise<{ spendingBlock: string; subscriptionBlock: string; verified: boolean } | null>;
  loadAutomatedTemplates?(signal: AbortSignal): Promise<ReadonlySet<string>>; // Hi/фоловеры: welcome/mass

  // 6. Локальные предпроверки для UX (обе полосы; хаб всё равно гейтит сам)
  peekConversationStats?(c: ConversationIdentity): Promise<{
    loadedMessages: number; personalMessages: number | null;
    lastFanMessageAt: number | null; historyCovered: boolean } | null>;

  // 7. Живые события  — звук, бейджи, «фан печатает»
  onIncomingMessage?(cb: (e: { creatorAccountId: string; conversationRef: string; fanRef: string;
    messageId: string; at: number | null; tip: boolean; automated: boolean; fromCreator: boolean }) => void): Unsubscribe;
  onNewFollower?(cb: (e: { creatorAccountId: string; fanRef: string; eventId: string }) => void): Unsubscribe;
  onFanTyping?(cb: (e: { conversationRef: string }) => void): Unsubscribe;

  // 8. Справочник фанов для доски Spenders (ранжирует хаб)
  lookupFans?(fanRefs: string[], signal: AbortSignal):
    Promise<Map<string, { customName: string | null; displayName: string | null; username: string | null;
      conversationRef: string | null; deleted?: boolean }>>;

  // 9. Действия в платформе — только по явному действию человека, без авто-ретраев
  followers?: {
    list(sinceMs: number, signal: AbortSignal): Promise<Array<{ fanRef: string; followedAt: number;
      username: string | null; displayName: string | null; avatarUrl: string | null }>>;
    readHistory(fanRef: string, signal: AbortSignal): Promise<HostTranscript & { conversationRef: string | null }>;
    ensureConversation(fanRef: string, signal: AbortSignal): Promise<string>;   // Fansly POST /group
    send(conversationRef: string, text: string, signal: AbortSignal): Promise<{ messageId: string }>;
  };
  vault?: {                                          // Fansly /creator/vault
    isVaultRoute(): boolean; view(): Promise<VaultView>;
    handOff(file: File): Promise<'dispatched' | 'unavailable' | 'indeterminate'>;
  };
}
```

Покрытие текущих функций методами порта:

| Функция | Методы порта |
|---|---|
| Тулбар, маппинг, баннеры, popup | 1, 3 (+`sessionState`) |
| Reply / Fix / Hi / Ping / Review / Recap / Coach / Help | 1, 2, 5 (только Fansly), 6 (опц.) + хаб-клиент ядра |
| Split-вставка частей, Enter-вставка | 2 |
| Voice | 2 (`readDraft`, `attachToComposer`), 1 |
| Spenders | 4, 8 + хаб `pageTopSpenders` |
| Новые фоловеры | 9.followers, 5 (`loadAutomatedTemplates`, `loadFanProfile`), 4 + хаб `followerOutreachAttempt` |
| Vault uploader | 9.vault |
| Звук | 7 + `HostDescriptor.parseUrl` (подавление, если чат открыт в фокусном окне) + `sessionState` |
| «Аккаунты» в настройках (presence, «перейти во вкладку») | 1, 4 (`openCreator`), `HostDescriptor` |
| Хоткеи | ядро (`@chatgoose/hotkeys`), контекст «в чате» — из 1 |

Реализация для двух хостов:

| Метод | FanslyHost | ChatSpaceHost |
|---|---|---|
| `currentCreator` | `account/me` по снятой сессии (background) | `$router` params + `["accounts"]` из Pinia Colada |
| `currentConversation` | URL groupId + `GET /group` (fanRef) | `router.currentRoute.params.chatId` (fanRef = chatId) |
| `onConversationChange` | поллинг pathname (или MAIN-world хук history) | `router.afterEach` |
| `readDraft`/`writeDraft` | textarea + execCommand | TipTap `editor.getText()` / `insertContent` / `clearContent` |
| `toolbarAnchor` | `app-group-message-input` | контейнер `.ProseMirror` (поиск по aria-label соседних кнопок) |
| `openConversation` | pushState+popstate, fallback `location.assign` | `$router.push({ name: 'chat', params })` |
| `loadTranscript/FanProfile/FanMoney` | REST apiv3 (как сейчас) | не нужны (hub lane) — можно для UI-превью из Pinia |
| `onIncomingMessage` | MAIN-world тап `wsv3` | Pinia-подписка / WS `account_new_message` |
| `followers`, `vault`, `attachToComposer` | есть | изначально `undefined` (capability = false) |

### 7.4 Что из этого следует для «полного аналога» на ChatSpace

1. **Самое важное архитектурное отличие — полоса контекста.** Для OnlyFans хаб сам собирает контекст и не примет транскрипт из Pinia. Плюс: в ChatSpace-адаптере почти не нужно «чтение данных» для ИИ, только ссылки (`pageLabel`, `conversationRef=chatId`, `fanRef`, персона, тон, черновик) — как в десктопе. Риск: качество ответов зависит от свежести OFAPI-архива хаба; если он отстаёт от того, что чаттер видит в ChatSpace, это решается только на стороне хаба (новый контракт, а не обход).
2. Резолв `pageLabel` нужно обобщить с «username + fansly» на «platform + username/platformAccountId» (сейчас фильтр `platform === 'fansly'`).
3. Порт ChatSpace живёт в MAIN world: нужен узкий валидируемый мост (как `sound-relay`, но двусторонний RPC), а UI ядра — в Shadow DOM.
4. Тулбар/оверлеи/Coach/Recap/доску можно сделать один раз в ядре, а Fansly-адаптер получить выносом уже существующих Fansly-модулей (§7.1, нижняя строка) — без переписывания проверенной Fansly-логики (пейсер, PPV, фоловеры, vault, опека отправок).
5. Хоткеи — общая схема `@chatgoose/hotkeys`; проверить конфликты с собственными хоткеями ChatSpace и браузером чаттеров (схема выбрана под Firefox; если ChatSpace-чаттеры в Chrome — перепроверить зарезервированные Ctrl/⌘-сочетания).
