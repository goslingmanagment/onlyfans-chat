# Hub settings rework: device-token-first, legacy-key decommission path

Status: design approved by owner 2026-07-16 (this session); implementation not started.
Visual reference (binding for layout intent): claude.ai artifact `c6364e39` —
"Agency Hub — целевой дизайн (минимализм)"; states: connected (advanced expanded),
signed-out, warning lines.

## Problem

Shipped v0.1.42+ introduced credential binding journals (`hubApiKeyBinding.v1`):
a chatter key stored by ≤0.1.41 has no binding record → state `unbound` →
quarantined. Fallout observed on Maxim's machine (2026-07-16, prod-verified):

1. A **bound device token does not suppress** the legacy-key warning:
   `hubCredentialNeedsAttention` (runtime-activation.ts) ORs both credentials,
   and HubSettings renders a red "paste the key again" line — while the runtime
   correctly ignores the quarantined key entirely.
2. The stored legacy key **cannot be removed from the UI**: `save()` omits an
   empty `hubApiKey` from the patch; a hub-URL switch (the only clearing path)
   is blocked while a device token exists. The warning is therefore permanent.
3. The red CTA tells a human to paste an API key — contradicting core Decision
   #116 (humans = password + device token; API keys = robots only).
4. The sign-in success line shows the reservation prefix
   (`agency_hub_pending_device_…`) and conflates machine hostname with user
   identity ("выдан … для Kevin", where Kevin is `hostname()`).
5. Accessibility: inputs have no `<label>`s, error lines have no live region.
   (Theme-level contrast of `--color-ink-low` — 2.88:1 dark / 2.93:1 light —
   is a real WCAG failure but is a **separate, app-wide** item, not this PR.)

Fleet context (prod, 2026-07-16): Maxim = device token only (his key was
server-revoked via user deactivate/reactivate); Dmitriy = token + stale key;
Nikita = **actively working on a legacy key** (will hit the same quarantine on
his next update/restart); Nikolay/Ivan = key-only, idle since May. D116(c)
fleet-gate conditions are NOT met, so the runtime key fallback must survive
this release.

## Owner decisions (2026-07-16)

- **Remove the "API-ключ чаттера" field entirely** from settings. No advanced
  hide. Runtime dual-acceptance for already-stored *bound* keys stays until the
  D116(c) gate.
- **Auto-decommission** the local key when it is provably dead weight: device
  binding `bound` AND key binding ∈ {unbound, mismatch} → silently delete
  `hubApiKey` secret + its binding record. No lockout is possible by
  construction: a non-bound key is never selected as bearer
  (`buildHubConnection` binds-only). Bound keys are NOT touched (working
  fallback until phase 2). AMENDED (review round 2): `unreadable` is also
  excluded — a transient DPAPI/keychain read failure is not proof of
  non-binding; that custody stays for the explicit-abandonment/purge paths.
- **Desktop + small core** in scope; layout = **minimalism (variant Б)** with
  diagnostics under a collapsible "Дополнительно".

## Phase 1 — this release

### Renderer (HubSettings rework, per mockup)

Connected state: one human card — "Подключено как {username}" + stream badge
(работает / сбой / остановлен), subline "Устройство {label} · синхронизация и
отправка идут через hub агентства", danger button "Выйти с этого устройства".
Login/password form is NOT rendered while custody exists.

Signed-out state: headline "Устройство не подключено", hint, login + password +
Войти. Nothing else above the fold.

"Дополнительно" (collapsed by default), diagnostic rows:
- **Токен устройства**: "…{last4} · выдан {date} · до {date}, продлевается
  сам". IMPORTANT correction (verified in core auth.ts, 2026-07-16): the
  activated bearer KEEPS the `agency_hub_pending_device_` raw prefix by
  design — a deliberate 0092 rollback guard (an older Core routes the prefix
  as a legacy key and fails auth). There is no `agency_hub_device_…` string
  to display for sign-in-minted tokens. The UI therefore never shows a
  prefix at all — only the last-4 fingerprint (keyMeta convention).
- **Стрим событий**: live/degraded/stopped badge + "при сбое подстраховывает
  опрос".
- **Приложение**: app version · machine hostname · OS. (Support: "какая у тебя
  версия" answered by one screenshot.)
- **Адрес хаба**: existing input (rarely touched; needed pre-sign-in).
- **Метки страниц**: existing mapping rows, unchanged semantics.
- Buttons: **Проверить подключение** (probe `/api/v1/auth/me` with the live
  bearer; result line "Проверено <когда> — сервер отвечает, вы вошли как
  {username}"), **Экспорт диагностики** (existing secrets-free JSON export,
  same action as Local data), **Сохранить**.

Warning lines (each only in its real state, CTA is always device sign-in,
never key-pasting):
- key-only machine, key still working: neutral "Работает на legacy-ключе —
  войдите устройством, чтобы перейти на токен".
- auth rejected: "Доступ отклонён: токен устройства больше не действует.
  Войдите заново."
- hub unreachable: existing degraded copy.

Removed from UI: API-key row + badge + red binding line; "Записи OFAPI" row
(architecture constant, not a setting); footer "…без локального OFAPI-ключа"
(direct-OFAPI era relic). Remove now-unused i18n keys (`hub.key.*`,
`hub.ofapiWrites.*`, `hub.deviceToken.issued` pending-prefix form, footer);
add new keys en+ru. statusBarTips credential tip copy → device sign-in CTA.

A11y in the same pass: real `<label>` elements bound to inputs;
`aria-live="polite"` region for error/success lines.

### Main process

- **Persist non-secret device identity at activation commit** — new settings
  record `hubDeviceIdentity.v1` `{username, label, issuedAt, expiresAt}`
  (username from the sign-in form, label/expiry from the activate response,
  issuedAt stamped locally at commit), written in
  the same batch as `hubDeviceTokenBinding.v1`, removed on sign-out/abandon.
  Required to render the connected card after restart; today username/label
  live only in the transient mutation result.
- **Auto-decommission** (rule above): runs at boot inside the credential
  mutation queue after device lifecycle recovery, and after a successful
  activation commit. Unreadable key files are deleted without decryption
  (cleanupOrphan pattern). Idempotent.
- **`hubCredentialNeedsAttention`**: device binding `bound` suppresses the
  key branch (safety net for the window before auto-decommission or its
  failure). Device journal/transition branches unchanged.
- `hubApiKey` patch path in settings store stays (phase 2 removes it) — the UI
  simply never sends it.

### Core (small; separate commit in ~/code/core; run core checks)

- ~~`authActivateDeviceToken` recomputes `key_prefix`~~ DROPPED (2026-07-16):
  the pending prefix on activated tokens is the true bearer prefix and a
  deliberate rollback guard (see correction above). Renaming it would lie
  about the credential or break the guard. Admin-list cosmetics can be a
  dashboard display concern later, not a token mutation.
- New owner-scope report endpoint (foundation for the D116(c) CI gate,
  wiring itself is phase 2): per active chatter — device token fresher than
  14 days?, active API keys count, last key use. Read-only.

### Tests (regression cases are mandatory)

- `bound token + unbound key` → no attention, no red line (the Maxim state).
- Auto-decommission matrix: unbound/mismatch/unreadable cleaned; bound kept;
  nothing cleaned without a bound device binding; idempotent on re-boot.
- Persisted identity: connected card renders after restart; cleared on
  sign-out/abandon.
- Success/connected copy uses username + machine label + token last-4; the
  literal `pending` never reaches any UI string.
- Key-only machine → neutral CTA line; no key input exists anywhere.
- Existing suites stay green (`pnpm check`).

### Docs in the same PR

- decisions.md: **D19** (device-token-first settings; auto-decommission rule;
  key field removed while runtime fallback stays until D116(c)).
- DESIGN.md settings paragraph: hub section now device-first (superseded-banner
  style, no silent patching); SPEC §9.2 if the core endpoint lands.

## Phase 2 — gated by core D116(c), outline only (do not build now)

Gate: password provisioning live in dashboard; every active chatter's device
token `last_used_at` < 14 d; one week fleet-wide without CG-HUB-03 / human
key auth.

1. **Two-release deletion** (crash-recovery constraint: a machine that died
   mid-key-transition must never update onto code that cannot finish it):
   release N drains — decommission-on-boot for ALL `hubApiKey` custody
   (secret, staged copy, binding, keyMeta, `hubCredentialTransition.v1`
   replay); release N+1 deletes the machinery — key branches of
   `resolveHubCredential` / `effectiveHubBearerAfterPatch`,
   `probeRetryKeyAfterAuthFailure` (I116-2), staged-key transition code,
   recovery parsers, key binding journal readers, remaining `hub.key` strings,
   fixtures.
2. CI release gate: capability check + fleet-adoption report (endpoint above)
   instead of capability-only + one hard-coded machine evidence.
3. Extension parity (separate repo/track): E9 key deletion per D116(c).
4. Core track (own decision in core's log): service-account split for
   `api_keys` (schema today cannot distinguish human legacy from automation);
   dashboard UsersTab contradiction (chatter "Key Status"/"Issue Key" columns
   vs "no key to send around" copy) resolves as part of that split.

## Operational (not code, do before/with the release)

- Nikita is one restart away from a dead hub: set his password
  (`PATCH /api/v1/admin/users/:username/password` — deactivation NOT needed;
  deactivate/reactivate is what revoked Maxim's key) and run device sign-in.
- Nikolay/Ivan: same ritual when they return.

## Explicitly out of scope

- Theme-wide `--color-ink-low` contrast fix (own item, needs owner's eyes).
- Service-account model, extension E9, CI gate wiring (phase 2).
- Deleting bound working keys or any core-side key revocation.
