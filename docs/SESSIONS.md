# Session runbook — 3 промпта

Принципы: **одна сессия = один репозиторий**; **каждый промпт перезапускаем** — если сессия закончилась на середине, открой новую с тем же промптом: она прочитает PLAN + код и продолжит. Фазы и Exit-гейты из [PLAN.md](PLAN.md) — внутренние чекпоинты для сессий, тебе ими управлять не нужно.

Почему именно три и не меньше: серверная часть живёт в репозитории core (граница «один репо — одна сессия»), а между companion-продуктом и полным клиентом стоит твой ручной send-чеклист (граница безопасности: первый раз отправки на живом аккаунте проверяешь ты).

**Ultracode:** к любому из промптов можно дописать слово `ultracode` — сессия будет оркестрировать работу параллельными агентами (порты модулей, независимые фичи, адверсариальная верификация) и сделает заметно больше за раз, ценой заметно большего расхода токенов. Лучше всего окупается на №1 (много независимых модулей и фич) и №3.

## Порядок

| № | Репо | Что | Когда |
|---|---|---|---|
| 1 | `chatgoose_desktop_fable` | **Companion-продукт** — Phase 0 (скаффолд, codegen, порт shared, read-only спайки) + Phases 1–2, до гейта «чаттеры пользуются AI в сменах» | сейчас |
| 2 | `~/code/core` | **Серверная часть разом** — 2 патча + вебхук-приёмник + SSE | как только №1 закоммитит вебхук-фикстуры (рано по ходу №1); дальше параллельно |
| 3 | `chatgoose_desktop_fable` | **Полный клиент** — Phases 3–5 (отправка + SSE-клиент → deep AI + центральные саммари → vault/PPV) | после №2, №3-гейта и твоего ручного send-чеклиста |

Потом, отдельным заходом: P6 — AI gateway в core + gateway-режим в десктопе.
Опционально между этапами — ревью: `Прочитай docs/reviews/review-prompt.md и выполни его`.

## Промпты

**№1 — Companion-продукт** (репо: этот):
> Read CLAUDE.md and docs/PLAN.md. Build the companion product: Phase 0 end to end, then Phases 1 and 2, up to the P2 exit gate. Phase 0 = scaffold per SPEC §2–§3 (`pnpm check` green), OpenAPI→TS codegen from `docs/vendor/onlyfansapi/openapi.json`, port `packages/shared` from `~/code/chatgoose` with its tests, then the spikes — STRICTLY READ-ONLY (real production account; no sends, no mutations, temporary webhook via API only): latency spike with the `lastReplyAt`/avatar/pinned checks, webhook capture of all 28 events via an access-protected tunnel with the PII rules (raw → `tmp/`, anonymized fixtures → `tests/fixtures/webhooks/`), historical tip-message shape, coexistence observations; append the spike report to docs/PLAN.md. Adapt P1 design to spike findings where PLAN says so. Verify OFAPI shapes against the vendored OpenAPI / fresh `.mdx` pages as you go; keep PRD/SPEC/PLAN updated with decisions; commit in coherent increments. If a previous session already started this, continue from the current state.

**№2 — Серверная часть** (репо: `~/code/core`):
> Read the briefs from the desktop repo first: `~/code/chatgoose_desktop_fable/docs/SPEC.md` §9, `docs/research/agency-hub-core.md` ("Confirmed blocker"), `docs/research/onlyfansapi.md` §4, and fixtures in `tests/fixtures/webhooks/` (if present). In THIS repo, following its conventions, with tests: (1) `PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` auto-creates the fan + page membership for `platform=onlyfans` instead of 404 (`apps/runtime/src/services/fan-profiles.ts:88`); (2) `ingestAiUsageBatch` skips invalid events per-event with counters instead of failing the whole batch on one bad `completedAt` (`apps/runtime/src/services/ai-usage.ts:20–33`); (3) OFAPI webhook receiver — HMAC-SHA256 raw-body verify, `event_id` dedupe, event journal, ack <1 s, async processing via pg-boss; (4) SSE fanout `GET /api/v1/events/stream` — chatter API-key auth, events filtered to assigned pages, `Last-Event-ID` replay, ~7-day retention; (5) admin flow to register the OFAPI webhook (`account_scope: global`, signing secret). If a previous session already started this, continue from the current state.

**№3 — Полный клиент** (репо: этот):
> Precondition: the owner's manual send checklist (docs/PLAN.md Phase 0 item 8) is done — confirm it is recorded in PLAN before starting; do not begin otherwise. Read CLAUDE.md and docs/PLAN.md. Build Phases 3 → 4 → 5 sequentially to their exit gates (sending + HubSync SSE client; deep AI + core profile sync; vault/PPV). Verify shapes against primary sources, keep docs current, commit in increments. If a previous session already started this, continue from the current state.

## Твоё (вне сессий)

1. Держать `loravie` активным в OnlyMonster как обычно (coexistence-наблюдение).
2. В консоли OFAPI: проверить гранулярность scoped-ключей, нарезать ключи по фазовой матрице (SPEC §5) перед пилотом с чаттерами.
3. **Ручной send-чеклист** (PLAN Phase 0 item 8) — до запуска №3; лучше во время работающего вебхук-слушателя №1.
4. Приёмка: после №1 (чаттеры реально пользуются, метрики пишутся) и после №3 (≥500 отправок без потерь/дублей, PPV end-to-end).
5. Несрочные вопросы вендору: появляется ли `lastReplyAt` со временем; условия кредитов при масштабировании.
