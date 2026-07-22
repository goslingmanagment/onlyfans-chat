# Backlog (agent-deferred improvements)

Отложенные улучшения из agent-review, не блокирующие мердж. Источник:
отчёты `~/.agentic-workflow/reports/chatgoose_desktop-pr4-*.md`.

## From PR #4 (D19 hub-settings rework), round-4 P2s — 2026-07-16

- **identity.expiresAt — разовый снимок при скользящем продлении.**
  Сервер продлевает токен при каждом использовании (sliding 90d, hard cap
  365d), а `hubDeviceIdentity.expiresAt` записан один раз при активации и
  не обновляется. Копирайт честно говорит «продлевается сам», но дата
  постепенно устаревает в пессимистичную сторону. Идея: обновлять identity
  из ответа сервера при удачном keyTest/периодически, либо показывать
  «выдан …» без «до …» вовсе. (device-token.ts:436)
- **Диагностический экспорт — denylist на растущем контракте.**
  `settingsForDiagnosticsExport` вычёркивает известные поля (keyMeta,
  hubDeviceIdentity); новое поле с чувствительным содержимым утечёт по
  умолчанию. Идея: allowlist или тест-страж «каждое новое поле SettingsVM
  явно классифицировано для экспорта». (diagnostics/report.ts:63)

## Инфра

- **codex-ревьюер стабильно таймаутит на desktop-снапшотах** (3 из 4
  прогонов PR #4; core проходит). Поднять его таймаут в control-plane или
  сузить снапшот.

## From PR #8 (run-desktop skill), review round-5 leftovers — 2026-07-18

Owner stopped the review loop after 5 non-converging rounds (blockers
3→2→1→3→3, each round new ones; round-5 P1 about `CHATGOOSE_RUN_PROFILE`
contradicts round-4's own fix demand to add that opt-in).

Resolved 2026-07-19: the stale check now includes directory mtimes (so source
deletions invalidate `out/`), and each driver defaults to a process-specific
screenshot directory derived from its isolated profile. Explicit shared
`SCREENSHOT_DIR` remains available as an opt-in.

- 2026-07-22 (startup-notification-flood, resolved in round 3): polling's
  sleep-wake backlog now rides the provider's shared attention gate (row
  createdAt vs re-armed epoch), so the suspend flood is closed for both
  lanes. Residual nit only: a polling fresh-by-id message whose createdAt is
  genuinely old (e.g. an old message surfacing late) is now suppressed
  rather than alerted — revisit only if a chatter reports a missed alert of
  that shape.

- 2026-07-22 (PR #16, residual P2s from the final raced review, owner to
  arbitrate): (a) a multi-hour SSE outage while the machine is awake replays
  hours of genuinely-unalerted messages as individual toasts on reconnect
  (deliberate "awake = still news" policy, D24) — if that ever bites, the
  polish is aggregation ("N new messages") above some burst size, not
  suppression; (b) the epoch fallback compares server timestamps to the
  local clock — a clock >60 s fast mutes alerts until core's marker deploys
  (one warn per session; marker removes the class).
