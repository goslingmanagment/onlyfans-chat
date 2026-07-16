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
- **decommission: 'mismatch' поглощает нечитаемый binding-журнал.**
  `bindingState` классифицирует ошибку чтения binding-записи как
  'mismatch' (store.ts bindingState catch), и авто-decommission удалит ключ
  при возможно-валидном, но временно нечитаемом журнале. Lockout невозможен
  (bearer выбирает только bound), но для симметрии с 'unreadable'-секретом
  можно различать «журнал прочитан и не сошёлся» от «журнал не прочитался».
  (store.ts:1297)
- **Диагностический экспорт — denylist на растущем контракте.**
  `settingsForDiagnosticsExport` вычёркивает известные поля (keyMeta,
  hubDeviceIdentity); новое поле с чувствительным содержимым утечёт по
  умолчанию. Идея: allowlist или тест-страж «каждое новое поле SettingsVM
  явно классифицировано для экспорта». (diagnostics/report.ts:63)

## Инфра

- **codex-ревьюер стабильно таймаутит на desktop-снапшотах** (3 из 4
  прогонов PR #4; core проходит). Поднять его таймаут в control-plane или
  сузить снапшот.
