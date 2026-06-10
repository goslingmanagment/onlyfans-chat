# Session runbook — какие сессии, в каких репо, с какими промптами

Правило: **одна сессия = один репозиторий** (CLAUDE.md). Между фазами — приёмка владельцем по Exit-критериям из [PLAN.md](PLAN.md). Промпты ниже — готовые к вставке; сессии сами дочитают контекст из CLAUDE.md/PLAN.

## Очередь сессий

| # | Когда | Репо | Что делает | Зависит от |
|---|---|---|---|---|
| A | сейчас | `chatgoose_desktop_fable` | Phase 0: скаффолд, codegen, порт `packages/shared` | — |
| B | сейчас (после A) | `chatgoose_desktop_fable` | Phase 0: read-only спайки (latency, вебхук-фикстуры, coexistence) | ключ в `.env` ✓ |
| M | твои руки, параллельно | OFAPI console / OnlyMonster | скоупы ключей в консоли; держать `loravie` активным в OM; (позже, до P3) ручной send-чеклист — PLAN Phase 0 item 8, лучше при работающем слушателе сессии B | — |
| C | до P4, можно рано | `~/code/core` | мини-патч: auto-create фана при PUT profile + per-event skip в ai-usage | — |
| 1 | после A+B | `chatgoose_desktop_fable` | Phase 1 — читающий клиент | A, B |
| 2 | после 1 | `chatgoose_desktop_fable` | Phase 2 — быстрые AI-фичи (companion, copy-режим) | 1 |
| D | параллельно с 1–2, до P3 | `~/code/core` | параллельный трек: приёмник вебхуков OFAPI + SSE fanout | фикстуры из B |
| 3 | после 2 + твоего send-чеклиста (M) | `chatgoose_desktop_fable` | Phase 3 — отправка + HubSync (SSE-клиент) | 2, M, D |
| 4 | после 3 и C | `chatgoose_desktop_fable` | Phase 4 — deep AI + центральные саммари через core | 3, C |
| 5 | после 4 | `chatgoose_desktop_fable` | Phase 5 — vault и PPV | 4 |
| E | до P6 | `~/code/core` | AI gateway (Phase 7 роадмапа core) | — |
| 6 | после 5 и E | `chatgoose_desktop_fable` | Phase 6 — HubGateway, центральные LLM-ключи и лимиты | 5, E |
| R | в любой момент (рекомендуется после A+B и перед 3) | `chatgoose_desktop_fable` | независимое ревью | — |

## Промпты

**A — Phase 0 engineering** (репо: этот):
> Read CLAUDE.md and docs/PLAN.md. Execute Phase 0 items 5–7: pnpm monorepo scaffold per SPEC §2–§3 (electron-vite boots a blank window; `pnpm check` = typecheck + lint + unit + build, green), OpenAPI→TS codegen script from `docs/vendor/onlyfansapi/openapi.json`, and port `packages/shared` from the legacy repo (`~/code/chatgoose`) with its tests (errors, split, xml, reply-output, prompt-injection, model registry). Commit when green.

**B — Phase 0 spikes** (репо: этот):
> Read CLAUDE.md and docs/PLAN.md. Execute Phase 0 items 2–4. STRICTLY READ-ONLY: a real production account is connected — no sends, no mutations, no manual webhook setup in the dashboard (register/delete the temporary webhook via API only). Do: the latency spike with the `lastReplyAt` / avatar-IP-lock / pinned-flag checks; webhook capture via an access-protected tunnel subscribed to all 28 events, with the PII rules (raw payloads under `tmp/` only, anonymized fixtures into `tests/fixtures/webhooks/`); the historical tip-message shape check; coexistence read-only observations. Append the spike report to docs/PLAN.md Phase 0 and commit.

**C — core мини-патч** (репо: `~/code/core`):
> Read the brief from the desktop repo first: `~/code/chatgoose_desktop_fable/docs/research/agency-hub-core.md` ("Confirmed blocker") and `docs/SPEC.md` §9. Two changes in THIS repo, following its conventions and with tests: (1) `PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` must auto-create the fan + page membership for `platform=onlyfans` instead of 404 (`apps/runtime/src/services/fan-profiles.ts:88`); (2) `ingestAiUsageBatch` must skip invalid events per-event (counting them in the response) instead of failing the whole batch with 400 on one bad `completedAt` (`apps/runtime/src/services/ai-usage.ts:20–33`).

**D — core параллельный трек** (репо: `~/code/core`):
> Read the brief from the desktop repo first: `~/code/chatgoose_desktop_fable/docs/SPEC.md` §9.2, `docs/research/onlyfansapi.md` §4, and the captured fixtures in `tests/fixtures/webhooks/`. Build in THIS repo, following its conventions: an OFAPI webhook receiver (HMAC-SHA256 raw-body verify, `event_id` dedupe, event journal, ack <1 s, async processing via pg-boss), an SSE fanout endpoint `GET /api/v1/events/stream` (chatter API-key auth, events filtered to the chatter's assigned pages, `Last-Event-ID` replay from the journal, ~7-day retention), and an admin flow to register the OFAPI webhook (`account_scope: global`, signing secret).

**1–6 — фазы** (репо: этот; меняй номер фазы):
> Read CLAUDE.md and docs/PLAN.md. Build Phase N to its exit gate. Verify OFAPI shapes against the vendored OpenAPI / fresh .mdx pages as you go; keep PRD/SPEC/PLAN updated with any decisions made along the way; commit in coherent increments.

**R — ревью**:
> Прочитай docs/reviews/review-prompt.md и выполни его.

**E — AI gateway** (репо: `~/code/core`): бриф — SPEC §9.2 (AI gateway) + roadmap core Phase 7; промпт собрать на месте, когда дойдём (контракт `AiGateway` будет уже зафиксирован кодом desktop).

## Твоя роль между сессиями

- Приёмка по Exit-критериям фазы (PLAN) → «едем дальше».
- Доступы по запросу сессий; ключи чаттерам — скоупированные (SPEC §5).
- Ручной send-чеклист (PLAN Phase 0 item 8) до старта Phase 3.
- Вопросы вендору (не срочно): `lastReplyAt` появляется ли со временем; условия кредитов при масштабировании.
