# AGENTS.md — ChatGoose Desktop

Electron-клиент чата OnlyFans для чаттеров агентства со встроенным ИИ
(ответы, коуч, саммари фана, пинги, борд спендеров). В OnlyFans не
встроиться, поэтому приложение рисует свой чат поверх OnlyFans API
(onlyfansapi.com, «OFAPI»). Клиент Agency Hub (`~/code/1-platform/hub`):
все чтения — через read-gateway хаба, все записи (текст, typing, unsend,
mark-read, медиа) — через его outbox, вендоренным `@kernel/sdk`; ИИ только в
хабе. Вход: логин + пароль, device token. Соседний клиент Fansly —
`~/code/1-platform/fansly-chat`.

## Запуск и проверки

- pnpm-монорепо: `apps/desktop` (Electron + React + TS strict + Tailwind),
  `packages/shared` (чистый TS, основные тесты), `packages/kernel-sdk` и
  `packages/chatgoose-hotkeys` (вендоренные, см. ниже).
- Локально — typecheck, lint и тесты затронутого пакета/файла. Полный
  `pnpm check` (typecheck + lint + test + build) — дело CI: Ready PR — Linux,
  push в `main` — Linux + Windows. На ПК-раннерах Linux-job идёт через
  `scripts/ci-parallel-check.mjs`; тесты пишут только во временные папки.
- PR, который трогает нативные модули, пути, инсталлятор или апдейтер:
  до мержа вручную запустить `windows-build` (workflow_dispatch,
  `publishFeed=false`).

## Как посмотреть

Скилл `run-desktop` (`.claude/skills/run-desktop`): собранное приложение,
изолированный профиль без ключей, офлайн.

## Релиз

Пуш тега `v*` → `windows-build.yml` перепроверяет и собирает на Windows →
автообновление у всех. Версия — `apps/desktop/package.json`. Детали —
`docs/RELEASE.md`.

## Опасно

- Никогда не откатываться на 0.1.30/0.1.31 (падают при запуске).
- ИИ никогда не отправляет без явного действия человека; неясную отправку
  не повторять. Живые тестовые отправки — только тестовому фану владельца
  (`P3_SEND_TEST_FAN_ID` в `.env`); без него — никаких живых отправок.
- Секреты и сеть — только в Electron main; `packages/shared` без платформы;
  zod на каждой границе доверия; локальная БД и медиа-кэш зашифрованы.
- Продукт: поддержка в SDK или API — не повод для нового UI. Новые
  возможности для пользователя — только по просьбе владельца; сырые ID
  провайдера, режимы скрининга и журналы команд не показывать.

## Подводные камни

- Формы OFAPI сверять с `docs/vendor/onlyfansapi/openapi.json` (`jq`) или
  свежим `.mdx` (добавить `.mdx` к URL `docs.onlyfansapi.com`), не по памяти;
  `llms-full.txt` — только grep. Карта возможностей —
  `docs/research/onlyfansapi.md`.
- Суммы OFAPI — доллары; mills из Fansly-клиента сюда не переносить.
- Два пространства ID: OFAPI `acct_…` и числовые id OnlyFans
  (`chat_id === fan.id`). Не смешивать.
- `packages/kernel-sdk` — перевендорить из хаба (`scripts/vendor-sdk.mjs`),
  руками не править; тест и typecheck пинят хэш контракта.
  `packages/chatgoose-hotkeys` — из хаба (`scripts/vendor-hotkeys.mjs`) в ОБА
  клиента с одного коммита, sha256 манифеста должен совпасть.
- Правки на стороне хаба можно делать в той же сессии: контракт в синхроне,
  проверки хаба, коммиты в двух репо отдельно.
- Тема — своп CSS-переменных (`.dark` на `<html>`), без покомпонентной
  тёмной стилизации.
- `docs/decisions.md` (D1–D45) заморожен 2026-10-20 — справка по истории;
  новые решения — в описании PR. `docs/PRD.md`, `docs/SPEC.md`,
  `docs/PLAN.md`, `docs/SESSIONS.md`, `docs/generated/` — история, не текущая правда.
