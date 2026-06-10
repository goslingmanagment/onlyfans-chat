# Session runbook — 4 промпта

Принципы: **одна сессия = один репозиторий**; **каждый промпт перезапускаем** — если сессия закончилась на середине, открой новую с тем же промптом, она прочитает PLAN + код и продолжит с места остановки. Фазы и Exit-гейты из [PLAN.md](PLAN.md) остаются внутренними чекпоинтами для сессий — тебе управлять ими не нужно.

## Порядок

| № | Репо | Что | Когда |
|---|---|---|---|
| 1 | `chatgoose_desktop_fable` | **Подготовка** — Phase 0 целиком (скаффолд + codegen + порт shared + read-only спайки) | сейчас |
| 2 | `~/code/core` | **Серверная часть разом** — 2 патча + вебхук-приёмник + SSE | после №1 (нужны фикстуры) |
| 3 | `chatgoose_desktop_fable` | **Companion-продукт** — Phases 1–2 до гейта «чаттеры пользуются AI в сменах» | после №1, параллельно с №2 |
| 4 | `chatgoose_desktop_fable` | **Полный клиент** — Phases 3–5 (отправка → deep AI → PPV) | после №2, №3 и твоего ручного send-чеклиста |

Потом, отдельным заходом (не сейчас): P6 — AI gateway в core + gateway-режим в десктопе.
Опционально между этапами — ревью: `Прочитай docs/reviews/review-prompt.md и выполни его`.

## Промпты

**№1 — Подготовка** (репо: этот):
> Read CLAUDE.md and docs/PLAN.md. Execute Phase 0 end to end. First items 5–7: pnpm monorepo scaffold per SPEC §2–§3 (electron-vite boots, `pnpm check` green), OpenAPI→TS codegen from `docs/vendor/onlyfansapi/openapi.json`, port `packages/shared` from `~/code/chatgoose` with its tests. Then items 2–4, STRICTLY READ-ONLY (real production account; no sends, no mutations, temporary webhook via API only): latency spike with the `lastReplyAt`/avatar/pinned checks, webhook capture of all 28 events via an access-protected tunnel with the PII rules (raw → `tmp/`, anonymized fixtures → `tests/fixtures/webhooks/`), historical tip-message shape, coexistence observations. Append the spike report to docs/PLAN.md and commit in coherent increments. If a previous session already started this, continue from the current state.

**№2 — Серверная часть** (репо: `~/code/core`):
> Read the briefs from the desktop repo first: `~/code/chatgoose_desktop_fable/docs/SPEC.md` §9, `docs/research/agency-hub-core.md` ("Confirmed blocker"), `docs/research/onlyfansapi.md` §4, and fixtures in `tests/fixtures/webhooks/`. In THIS repo, following its conventions, with tests: (1) `PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` auto-creates the fan + page membership for `platform=onlyfans` instead of 404 (`apps/runtime/src/services/fan-profiles.ts:88`); (2) `ingestAiUsageBatch` skips invalid events per-event with counters instead of failing the whole batch on one bad `completedAt` (`apps/runtime/src/services/ai-usage.ts:20–33`); (3) OFAPI webhook receiver — HMAC-SHA256 raw-body verify, `event_id` dedupe, event journal, ack <1 s, async processing via pg-boss; (4) SSE fanout `GET /api/v1/events/stream` — chatter API-key auth, events filtered to assigned pages, `Last-Event-ID` replay, ~7-day retention; (5) admin flow to register the OFAPI webhook (`account_scope: global`, signing secret). If a previous session already started this, continue from the current state.

**№3 — Companion-продукт** (репо: этот):
> Read CLAUDE.md and docs/PLAN.md. Build Phase 1 and then Phase 2, up to the P2 exit gate. Verify OFAPI shapes against the vendored OpenAPI / fresh `.mdx` pages as you go; keep PRD/SPEC/PLAN updated with decisions; commit in coherent increments. If a previous session already started this, continue from the current state.

**№4 — Полный клиент** (репо: этот):
> Precondition: the owner's manual send checklist (docs/PLAN.md Phase 0 item 8) is done — confirm in PLAN before starting. Read CLAUDE.md and docs/PLAN.md. Build Phases 3 → 4 → 5 sequentially to their exit gates (sending + HubSync SSE client; deep AI + core profile sync; vault/PPV). Same rules: verify shapes against primary sources, keep docs current, commit in increments, continue from current state if already started.

## Твоё (вне сессий)

1. Держать `loravie` активным в OnlyMonster как обычно (coexistence-наблюдение, уже идёт).
2. В консоли OFAPI: проверить гранулярность scoped-ключей, нарезать ключи по фазовой матрице (SPEC §5) перед пилотом с чаттерами.
3. **Ручной send-чеклист** (PLAN Phase 0 item 8) — до запуска №4; лучше во время работающего вебхук-слушателя сессии №1.
4. Приёмка: после №3 (чаттеры реально пользуются, метрики пишутся) и после №4 (≥500 отправок без потерь/дублей, PPV end-to-end).
5. Несрочные вопросы вендору: появляется ли `lastReplyAt` со временем; условия кредитов при масштабировании.
