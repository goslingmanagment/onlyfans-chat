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
contradicts round-4's own fix demand to add that opt-in). Deferred nits:

- **driver stale-check misses deletions**: `newestMtime` stats files and
  recurses dirs but ignores each directory's own mtime, so deleting a src
  file doesn't flag the build stale. Include dir mtimes in the max.
- **parallel runs share the shots dir**: two drivers using the same `ss
  name` overwrite each other's PNG in `$TMPDIR/chatgoose-run/shots/`.
  Default shots into a per-run subdir (like the per-run profile) or
  prefix files with the run id.
