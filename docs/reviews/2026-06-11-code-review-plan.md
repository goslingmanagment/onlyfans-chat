# План ревью приложения — 2026-06-11

Цель: провести не один поверхностный code review, а серию независимых проходов по всем зонам ChatGoose Desktop, чтобы искать потенциальные баги до пилота и перед включением отправки. План привязан к текущему состоянию репозитория: P1/P2 уже реализованы частично/полностью, P3–P5 впереди. `CLAUDE.md`, `docs/PRD.md`, `docs/SPEC.md`, `docs/PLAN.md`, `docs/DESIGN.md` считаются нормативными; при конфликте кода и документов ревью должно фиксировать оба факта.

## 0. Формат каждого прохода

Каждый проход заканчивается коротким отчетом в `docs/reviews/` или блоком findings в общем отчете:

- `P1` — блокер до пилота / риск потери данных, денег, аккаунта, секретов или double-send.
- `P2` — нужно исправить до следующей фазы или до расширения пилота.
- `P3` — улучшение, тестовый пробел, документационная неточность.

Для каждого finding:

1. Claim: что код/док обещает.
2. Evidence: файл/строка, тест, fixture, спецификация или live-observation.
3. Impact: какой пользовательский или операционный баг возможен.
4. Fix: конкретное изменение в коде, тесте или документах.

## 1. Первый слой: инварианты и самые дорогие классы багов

Эти проверки идут первыми и повторяются в каждом модуле.

### 1.1 Electron security boundary

Проверяем:

- Renderer не импортирует `electron`, `fs`, `path`, `process`, OFAPI/LLM clients, keychain, DB driver.
- Весь network I/O только в main или будущих hub/core контекстах.
- Preload exposes only typed bridge; нет сырого `ipcRenderer`, нет произвольного invoke channel.
- IPC request/response валидируются zod-схемами на trust boundary.
- Renderer не получает API keys, auth headers, raw OFAPI headers, локальные пути media cache.
- CSP, `contextIsolation: true`, `nodeIntegration: false`, отсутствие remote content.

Основные файлы:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/contract.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/renderer/src/bridge/*`

Баги, которые ищем: утечка секретов в renderer, обход typed IPC, XSS через OF HTML, remote script/media bypass.

### 1.2 AI safety and human-in-the-loop

Проверяем:

- Любой fan-derived текст проходит через `escapeForPrompt` перед prompt inclusion: сообщения, fan name, username, bio/about, custom name, tip text, notes/future summary facts.
- Safety preamble есть на каждом LLM пути.
- Insertable output всегда проходит sanitizer.
- AI operation не может вызвать send напрямую; P2 copy-mode и P3 insert-mode не нарушают “AI never sends”.
- Stale chunks discard при смене чата/operationId.
- Prompt templates сохранены byte-compatible, кроме разрешенного Fansly→OnlyFans wording.

Основные файлы:

- `packages/shared/src/prompts/*`
- `packages/shared/src/output/*`
- `packages/shared/src/transcript/*`
- `apps/desktop/src/main/ai/*`
- `apps/desktop/src/renderer/src/features/ai/*`

Баги, которые ищем: prompt injection, meta-leak в ответе, вставка мусора Gemini-style, неправильный `[NEXT]` split, AI-output попадает в composer без sanitizer.

### 1.3 Send correctness readiness

Сейчас P3 еще впереди, но ревью уже должно защищать места, которые P3 будет использовать.

Проверяем:

- Нет заготовок или helper'ов, которые автоматически retry non-idempotent POST.
- OFAPI client умеет различать definite failure и indeterminate failure.
- UI и протокол уже имеют место для `failed` vs `unconfirmed`, а не один общий error.
- Любой будущий multi-part send должен абортиться на первом сбое.
- `canSendMessage=false` и `canNotSendReason` не теряются в view models.

Основные файлы:

- `apps/desktop/src/main/ofapi/client.ts`
- `apps/desktop/src/main/ofapi/errors.ts`
- `apps/desktop/src/main/ipc/viewmodels.ts`
- `apps/desktop/src/renderer/src/features/conversation/*`
- будущие P3 файлы `outbox/*`, `composer/*`

Баги, которые ищем: silent duplicate send, retry после timeout/5xx, потеря draft, wrong disabled state.

## 2. Второй слой: модульные проходы

### 2.1 `packages/shared`: behavioral core

Порядок ревью:

1. `prompts/escape.ts`, `output/reply-output.ts`, `output/split.ts`, `output/xml.ts`
2. `transcript/html.ts`, `transcript/format.ts`, `transcript/ofapi-message.ts`, `transcript/ping-segment.ts`
3. `context/spending.ts`, `context/subscription.ts`, `summary/validity.ts`
4. `features.ts`, `constants.ts`, `llm/model-registry.ts`, `llm/cost.ts`, `llm/sse.ts`
5. `protocol/index.ts`, `errors/index.ts`

Что доказываем:

- Legacy behavior сохранен тестами, особенно edge cases из `docs/research/legacy-chatgoose.md`.
- Форматы transcript/spending/subscription byte-stable, timezone UTC.
- PPV state labels используют `price`/`isOpened`, tips используют `tipAmount` + stripped `tipText`.
- Model capabilities и cost не приводят к invalid provider payload.
- Zod-протоколы не слишком широкие и не допускают impossible states.

Обязательные тестовые пробелы для поиска:

- Unicode/emoji/HTML entities в именах и tipText.
- Fan name/bio как prompt-injection payload.
- Пустые/удаленные сообщения, media-only сообщения, mixed PPV bundles.
- Client clock skew для summary validity и future usage events.

### 2.2 OFAPI client layer

Порядок ревью:

1. `schemas.ts` и generated `ofapi.gen.ts` usage.
2. `client.ts` request construction, path safety, per-operation unwrap.
3. `pagination.ts` boundary inclusion/dedupe.
4. `rate-limiter.ts` and retry policy.
5. `credit-meter.ts`, `fixture-capture.ts`, `sanitize.ts`, `errors.ts`.

Что доказываем:

- Нет ad-hoc fetch вне client layer.
- Все account-scoped calls проходят через credit meter.
- `POST send-message` и другие future mutation calls не retry'ятся.
- 429 respects `Retry-After`; 5xx retries only idempotent GET.
- Envelope parsing учитывает bare arrays/objects vs `{data,_meta,_pagination}`.
- Fixture capture не пишет PII/keys/raw headers.

Особые edge cases:

- Pagination cursors: `last_id + order=asc` для нового хвоста, `first_id` только для scrollback.
- 401/revoked key mid-shift, credits exhausted, malformed 400 with/without `textHighLight`.
- Account id namespace `acct_*` vs raw fan/chat ids.

### 2.3 SQLite, encryption, media cache

Порядок ревью:

1. `db/database.ts`, `db/driver.ts`, `db/migrations.ts`, `db/schema.ts`
2. query modules: accounts/chats/messages/fans/summaries/settings/credit-log
3. `media/cache.ts`, `media/protocol.ts`
4. tests under `apps/desktop/tests/db` and `tests/media`

Что доказываем:

- SQLCipher реально включен; DB не открывается plaintext fallback'ом.
- Key хранится в keychain/safeStorage, а не в settings/env/logs.
- Upsert keys соответствуют `(account_id, chat_id, message_id)`.
- Raw JSON хранится для debug/reconcile, но renderer получает narrow view model.
- Migrations последовательные, repeatable, не ломают existing DB.
- Media cache хранит encrypted blobs и не отдает raw signed OF CDN URLs renderer'у.

Особые edge cases:

- Duplicate webhook/poll delivery.
- Deleted/tombstoned messages.
- Media `isMediaReady=false` polling cap.
- 5k+ messages per chat, pruning/retention.
- Purge local data deletes DB + media cache + derived state.

### 2.4 Sync engine

Порядок ревью:

1. `sync/provider.ts`, `sync/polling-sync.ts`, `sync/mappers.ts`, `sync/budget-guard.ts`
2. DB change bus interaction.
3. Renderer subscriptions and status bar freshness.
4. Future HubSync seam readiness.

Что доказываем:

- No overlapping polls per account/chat under high OFAPI latency.
- Delta rule fetches only changed chats and dedupes boundary id.
- Hidden-window behavior slows but still supports notifications in P1/P2.
- Read-state sweep is conditional, not credit runaway.
- Budget guard slows gracefully at 80/100%, never silently lies about freshness.
- Events reconcile through SQLite, not direct renderer state mutation.

Особые edge cases:

- 500 during list poll, partial account failure, one account authenticated=false.
- Fan changed name/avatar; chat row updates without losing messages.
- Poll event races with optimistic/future sent message.
- SSE reconnect/replay design when HubSync lands.

### 2.5 AI coordinator and providers

Порядок ревью:

1. `ai/coordinator.ts`, `ai/timeouts.ts`, `ai/profiler.ts`
2. `ai/context-loader.ts`
3. `ai/gateway.ts`, `ai/providers/*`
4. Renderer AI dock/store interactions.

Что доказываем:

- One operation per conversation context; concurrent start returns expected `CG-FLOW-*`.
- Cancellation propagates to provider transport and stops streaming.
- Timeout stages match SPEC/legacy constants.
- 429/503 retry policy is bounded and safe.
- Cost accounting handles cache hits, reasoning settings, unknown models.
- Provider payloads don't include unsupported sampling params for models that reject them.
- Usage events can be quarantined on hub 400 instead of blind retry/drop.

Особые edge cases:

- Personality deleted/edited while operation is running.
- Conversation switched during stream.
- Provider sends malformed SSE, partial JSON, `[DONE]` variants.
- XML result missing fields, duplicate fields, huge output.

### 2.6 Renderer workspace

Порядок ревью:

1. App shell and state: `App.tsx`, `app/*`, `state/*`, `bridge/*`
2. Inbox/account rail: `features/inbox/*`
3. Conversation/message list/composer placeholder: `features/conversation/*`
4. Fan panel: `features/fan-panel/*`
5. AI dock: `features/ai/*`
6. Settings: `features/settings/*`
7. Design primitives and CSS.

Что доказываем:

- No renderer network/secrets/import boundary violations.
- Virtualization is used for long lists; stable keys and no row layout thrash.
- AI streaming batches updates and does not re-render whole tree per chunk.
- Error/empty/loading states exist for each surface.
- Data age and stale/fallback states are visible.
- Hotkeys are centralized and don't conflict with text input.
- Copy/Insert actions cannot target wrong conversation after switch.
- Settings writes go through typed IPC and secrets go to keychain path.

Особые edge cases:

- Long fan names, long usernames, Russian/English mixed text, emoji-heavy messages.
- Window narrow/collapsed panels, text not overflowing buttons/chips.
- `canSendMessage=false`, locked PPV, purchased/not-purchased badges.
- Search fuzziness with transliteration/empty results.
- Notification sound permissions and hidden window behavior.

### 2.7 Tests, fixtures, and CI

Порядок ревью:

1. `pnpm check` baseline.
2. Unit test coverage by module.
3. Fixture provenance and anonymization.
4. Missing integration/e2e tests for phase gates.

Что доказываем:

- Existing tests cover negative and adversarial cases, not only happy paths.
- Fixtures preserve real OFAPI shapes and mark unverified examples.
- Generated OFAPI types are reproducible from vendored spec.
- No test uses live mutation endpoints by accident.
- Renderer has at least logic tests for hotkeys, filters, AI dock, message formatting.
- P3 needs new integration harness before code expands: outbox state machine, restart reconciliation, restricted words, app restart, multi-part abort.

## 3. Третий слой: workflow reviews

После модульных проходов надо проверять пользовательские сценарии end-to-end, потому что многие баги живут между модулями.

### 3.1 P1 read-only shift

Сценарий:

1. App starts with cached DB.
2. Accounts list loads.
3. Chat list polls and updates.
4. Conversation opens from cache, then reconciles network tail.
5. Fan panel loads spending/subscription.
6. Incoming message triggers toast/sound while window hidden.
7. Credits/status freshness remain honest.

Критичные баги: stale UI without warning, wrong PPV state, tip amount lost, credit runaway, renderer fetch bypass.

### 3.2 P2 AI companion

Сценарий:

1. Personality mapping gate blocks unmapped account.
2. Fast Reply/Improve/Help stream into dock.
3. Copy/copy-part actions are tracked as acceptance.
4. Regenerate marks previous suggestion rejected.
5. Prompt inspector shows escaped context blocks.
6. Provider failure/cancel leaves UI recoverable.

Критичные баги: unsafe prompt context, wrong conversation insertion/copy, cost missing, cancellation leak, unacceptable AI output not sanitized.

### 3.3 P3 sending readiness

Сценарий для будущего review before merge:

1. Draft persists per chat.
2. Outbox row persists before POST.
3. Optimistic bubble reconciles with returned/message-tail id.
4. Timeout/5xx becomes `unconfirmed`, never auto-retry.
5. Restricted word 400 preserves text and highlights `textHighLight`.
6. App restart reconciles pending rows before offering resend.
7. `[NEXT]` sequence aborts on first failure.

Критичные баги: lost send, duplicate send, manual retry without diff, sequence continues after failure.

### 3.4 Hub/core mode

Сценарий:

1. SSE connects with chatter key.
2. Events are ACL-filtered by assigned pages.
3. `Last-Event-ID` replay fills gaps.
4. Polling fallback runs slowed and marks degraded state.
5. Read-state remains conditional polling.

Критичные баги: cross-page event leak, replay duplicate, reconnect storm, false real-time UI.

## 4. Рекомендуемый порядок исполнения ревью

1. Static boundary audit: imports, IPC, zod, fetch/process/env usage.
2. Shared AI safety audit: prompt escaping, sanitizer, transcript/context formats.
3. OFAPI/sync/DB audit: cache correctness, pagination, retries, credit meter, encryption.
4. Renderer audit: UI state, virtualization/perf, hotkeys, wrong-conversation races.
5. Test audit: compare expected coverage vs actual test files and fixtures.
6. Workflow audit: P1 and P2 end-to-end on current code.
7. Pre-P3 design audit before sending implementation starts.

## 5. Useful search probes

Run these at the start of each review and investigate every hit:

```sh
rg -n "\bfetch\(|https?://|Authorization|Bearer|process\.env|localStorage|sessionStorage" apps packages
rg -n "ipcRenderer|ipcMain|contextBridge|invoke|send\(" apps/desktop/src
rg -n "\bas\b|as unknown|as any|JSON\.parse|z\.any|z\.unknown" apps packages
rg -n "retry|backoff|setTimeout|setInterval|AbortController" apps packages
rg -n "sendMessage|messages|price|isOpened|isNew|textHighLight|canSendMessage" apps packages
rg -n "escapeForPrompt|sanitize|safety|UNTRUSTED|prompt|personality|fan" apps packages
rg -n "TODO|FIXME|HACK|throw new Error|console\." apps packages
```

These probes are not findings by themselves; they are entry points.

## 6. Immediate review notes from reconnaissance

- `CLAUDE.md` still says “No application code yet”, while the repo has substantial `apps/desktop` and `packages/shared` code and `PLAN.md` says P1/P2 work exists. Treat this as a documentation consistency issue to fix or explicitly ignore during review.
- Existing `docs/reviews/2026-06-10-plan-review.md` was a planning review. Do not re-open its already-applied findings unless the applied fix is wrong in code.
- The riskiest upcoming boundary is P3 sending. Before reviewing normal polish, prioritize anything that could create double-send, lost-send, or false confirmed-send behavior.
- Key custody is still strategically sensitive: OFAPI keys have no scopes. Any desktop-side key path is pilot-only; review should flag accidental scale assumptions.
