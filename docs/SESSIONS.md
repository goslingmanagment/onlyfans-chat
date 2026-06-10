# Session runbook — 3 промпта

Принципы: **одна сессия = один репозиторий**; **каждый промпт перезапускаем** — если сессия закончилась на середине, открой новую с тем же промптом: она прочитает PLAN + код и продолжит. Фазы и Exit-гейты из [PLAN.md](PLAN.md) — внутренние чекпоинты для сессий, тебе ими управлять не нужно.

**Калибровка под исполнителя (2026-06-10):** промпты рассчитаны на топ-модель — они задают цель, жёсткие ограничения и критерий готовности, а не пошаговые инструкции. Исполнитель сам решает детали реализации, чинит доки при конфликте с наблюдаемой реальностью (правка в том же коммите), параллелит работу субагентами/ultracode, и не ждёт владельца там, где можно двигаться (открытые вопросы — в PLAN). Жёстко зафиксированы только: инварианты SPEC §15, промпты байт-в-байт, DESIGN-мокап + перф-чеклист, read-only на живом аккаунте, фазовые гейты. **Весь код пишется с нуля** — legacy служит поведенческим справочником; дословно переносятся только промпты, продуктовые константы и тест-кейсы как факты поведения (SPEC §8.1).

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
> Read CLAUDE.md, docs/PRD.md, docs/SPEC.md, docs/PLAN.md and docs/DESIGN.md — they are the spec, and CLAUDE.md rules are binding. **Goal: build the companion product — Phase 0 end to end (all items as specified in PLAN), then Phases 1–2 — landing at the P2 exit gate.** One constraint is repeated here because it must survive any doc edits: the connected OFAPI account is a REAL production account — every automated interaction is strictly read-only (no sends, no mutations; the temporary spike webhook is registered and deleted via API only), and no send capability is built in this stage. You have full latitude on everything the docs don't pin down; pinned: SPEC §15 invariants, byte-for-byte prompts, the DESIGN mockup + §3 perf checklist, phase gates. Where a doc conflicts with reality you discover, fix the doc in the same commit and proceed. Use the frontend-design skill for renderer surfaces; parallelize with subagents where it pays; `pnpm check` green on every commit. If something needs an owner decision, record it as an open question in PLAN and keep moving on what doesn't depend on it. **Definition of done: the P0/P1/P2 gates demonstrated with evidence in your final report** — spike report appended to PLAN, the app running against the live account, AI features producing output, golden set checked in. If a previous session already started this, continue from the current state.

**№2 — Серверная часть** (репо: `~/code/core`):
> This is the production Agency Hub — nothing live may break: migrations additive, full test suite green, follow this repo's own conventions and doc discipline (decisions/roadmap) for everything you add. Read the briefs from the desktop repo first: `~/code/chatgoose_desktop_fable/docs/SPEC.md` §9, `docs/research/agency-hub-core.md`, `docs/research/onlyfansapi.md` §4, and captured fixtures in its `tests/fixtures/webhooks/` (if present). **Goal — four additions, with tests:** (1) `PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` auto-creates the fan + page membership for `platform=onlyfans` instead of 404 (`apps/runtime/src/services/fan-profiles.ts:88`); (2) `ingestAiUsageBatch` skips invalid events per-event with counters instead of failing the whole batch on one bad `completedAt` (`ai-usage.ts:20–33`); (3) OFAPI webhook receiver — HMAC-SHA256 raw-body verify, `event_id` dedupe, event journal, ack <1 s, async processing via pg-boss; (4) SSE fanout `GET /api/v1/events/stream` — chatter API-key auth, events filtered to assigned pages, `Last-Event-ID` replay, ~7-day retention — plus an admin flow to register the OFAPI webhook (`account_scope: global`, signing secret). Implementation details beyond this contract are your judgment. **Definition of done: integration tests replay the captured OFAPI webhook fixtures end-to-end into delivered SSE frames (including dedupe and Last-Event-ID resume), and both patched endpoints are covered by tests.** If a previous session already started this, continue from the current state.

**№3 — Полный клиент** (репо: этот):
> Preconditions — verify both are recorded in docs/PLAN.md, refuse to start otherwise: (a) the owner's manual send checklist (PLAN Phase 0 item 8) is done; (b) before entering P4 — core's pre-P4 patch (profile auto-create + per-event usage skip) is deployed. Read CLAUDE.md, docs/PRD.md, docs/SPEC.md, docs/PLAN.md, docs/DESIGN.md. **Goal: Phases 3 → 4 → 5 sequentially to their exit gates** — sending + HubSync SSE client; deep AI + central Scan sync via core; vault/PPV. Same latitude and pins as №1; one session = one repo — needed core-side changes are recorded in PLAN for a separate core session, never edited from here. The send pipeline (SPEC §7) is the most correctness-critical code in the product: never auto-retry an indeterminate send. **Definition of done: each phase gate demonstrated with evidence** — outbox audit across real sends, golden parity outputs vs legacy, a PPV send verified end-to-end including the purchased-state flip. If a previous session already started this, continue from the current state.

## Твоё (вне сессий)

1. Держать `loravie` активным в OnlyMonster как обычно (coexistence-наблюдение).
2. В консоли OFAPI: проверить гранулярность scoped-ключей, нарезать ключи по фазовой матрице (SPEC §5) перед пилотом с чаттерами.
3. **Ручной send-чеклист** (PLAN Phase 0 item 8) — до запуска №3; лучше во время работающего вебхук-слушателя №1.
4. Приёмка: после №1 (чаттеры реально пользуются, метрики пишутся) и после №3 (≥500 отправок без потерь/дублей, PPV end-to-end).
5. Несрочные вопросы вендору: появляется ли `lastReplyAt` со временем; условия кредитов при масштабировании.
