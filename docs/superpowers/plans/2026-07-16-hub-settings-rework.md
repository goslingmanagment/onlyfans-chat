# Hub Settings Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Device-token-first Hub settings (minimalism UI per approved mockup), auto-decommission of quarantined legacy chatter keys, and a core-side device-adoption report — per `docs/superpowers/specs/2026-07-16-hub-settings-rework-design.md`.

**Architecture:** Main-process changes ride the existing credential-journal machinery (new non-secret `hubDeviceIdentity.v1` record written/removed atomically alongside `hubDeviceTokenBinding.v1`; a decommission pass inside the settings-store mutation queue). The renderer HubSettings component is rewritten around two states (connected card / sign-in form) with diagnostics in a `<details>` block; all state predicates stay in `hubSettingsLogic.ts` for headless vitest coverage. Core gets one read-only owner endpoint.

**Tech Stack:** Electron main (TS strict, zod), React + Tailwind renderer, Vitest; core: Fastify + drizzle.

## Global Constraints

- Worktree: `/Users/dmitriy/code/.worktrees/chatgoose_desktop/260715a-hub-settings-rework`, branch `ai/260715a-hub-settings-rework`. Core work happens in `~/code/core` on branch `feat/device-adoption-report`, committed separately.
- `pnpm check` must pass before every desktop commit claim; core: `pnpm lint && pnpm test` (see core package.json scripts) before its commit.
- SPEC §15 invariants: secrets/network only in main; zod at trust boundaries; `packages/shared` platform-pure.
- i18n catalog keys always carry en+ru (parity-tested).
- The literal string `pending` must never reach UI copy. CTA copy never asks a human to paste an API key.
- Warm-theme conventions: reuse existing Tailwind utility classes from the current HubSettings (rounded-chip, border-line, bg-bg1, text-[13px]/[11px], text-ink-low/mid, text-bad).
- The activated bearer legitimately starts with `agency_hub_pending_device_` (0092 rollback guard) — display only last-4.

---

### Task 1: `hubCredentialNeedsAttention` — bound device token suppresses the key branch

**Files:**
- Modify: `apps/desktop/src/main/runtime-activation.ts:33-45`
- Test: `apps/desktop/tests/main/runtime-activation.test.ts`

**Interfaces:**
- Produces: unchanged signature `hubCredentialNeedsAttention(settings): boolean`; new semantics: key-branch ignored when `hubDeviceTokenBindingState === 'bound'`.

- [ ] **Step 1: Write the failing tests** — append to the existing `describe` covering `hubCredentialNeedsAttention` (find it via `grep -n "hubCredentialNeedsAttention" apps/desktop/tests/main/runtime-activation.test.ts`; reuse the file's existing settings-fixture helper, extending it per-case):

```ts
it('bound device token suppresses a quarantined legacy key (Maxim regression)', () => {
  expect(hubCredentialNeedsAttention({
    hasHubKey: true,
    hubApiKeyBindingState: 'unbound',
    hasHubDeviceToken: true,
    hubDeviceTokenBindingState: 'bound',
    hubDeviceTokenTransition: null,
  })).toBe(false);
});

it('quarantined key still raises attention without a bound device token', () => {
  expect(hubCredentialNeedsAttention({
    hasHubKey: true,
    hubApiKeyBindingState: 'unbound',
    hasHubDeviceToken: false,
    hubDeviceTokenBindingState: 'none',
    hubDeviceTokenTransition: null,
  })).toBe(true);
});

it('device-token trouble is never suppressed', () => {
  expect(hubCredentialNeedsAttention({
    hasHubKey: false,
    hubApiKeyBindingState: 'none',
    hasHubDeviceToken: true,
    hubDeviceTokenBindingState: 'mismatch',
    hubDeviceTokenTransition: null,
  })).toBe(true);
});
```

- [ ] **Step 2: Run to verify the first fails**

Run: `pnpm --filter chatgoose-desktop exec vitest run tests/main/runtime-activation.test.ts`
Expected: FAIL — suppression case returns `true`.

- [ ] **Step 3: Implement**

```ts
export function hubCredentialNeedsAttention(settings: {
  hasHubKey: boolean;
  hubApiKeyBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
  hasHubDeviceToken: boolean;
  hubDeviceTokenBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
  hubDeviceTokenTransition: 'activation' | 'revocation' | null;
}): boolean {
  // A bound device token is the active bearer; a leftover legacy key is dead
  // weight the boot decommission pass removes (D19). Only surface it while no
  // healthy device credential exists.
  const legacyKeyAttention = settings.hasHubKey
    && settings.hubApiKeyBindingState !== 'bound'
    && settings.hubDeviceTokenBindingState !== 'bound';
  return legacyKeyAttention || (
    settings.hasHubDeviceToken && settings.hubDeviceTokenBindingState !== 'bound'
  ) || settings.hubDeviceTokenTransition !== null;
}
```

- [ ] **Step 4: Re-run the test file** — all pass.
- [ ] **Step 5: Commit** — `fix(hub): bound device token suppresses legacy-key attention`

---

### Task 2: credential journal — username in the activation journal + `hubDeviceIdentity.v1`

**Files:**
- Modify: `apps/desktop/src/main/hub/credential-journal.ts`
- Test: `apps/desktop/tests/hub/device-token.test.ts` (journal round-trip cases live where the journal helpers are already exercised; check `apps/desktop/tests/hub/helpers.ts` for the fake settings/keychain factories and reuse them)

**Interfaces:**
- Produces:
  - `hubDeviceTokenActivationSchema` gains `username: z.string().min(1).max(120).nullable().optional().default(null)`.
  - `export const HUB_DEVICE_IDENTITY_KEY = 'hubDeviceIdentity.v1'`
  - `export const hubDeviceIdentitySchema = z.strictObject({ version: z.literal(1), username: z.string().min(1).max(120).nullable(), label: z.string().min(1).max(120), tokenLast4: z.string().length(4), issuedAt: z.string().datetime(), expiresAt: z.string().datetime() })`
  - `export type HubDeviceIdentity = z.infer<typeof hubDeviceIdentitySchema>`
  - `export function readHubDeviceIdentity(queries): HubDeviceIdentity | null` — same `readJournal` helper; **unlike the credential journals it must fail-open**: corrupt/unreadable identity returns `null` (it is display metadata, not custody), so wrap `readJournal` in try/catch → null.

- [ ] **Step 1: Failing test** (append to device-token.test.ts):

```ts
it('readHubDeviceIdentity fails open on corrupt records', () => {
  const settings = makeJournalQueries(); // existing fake from tests/hub/helpers.ts
  settings.set(HUB_DEVICE_IDENTITY_KEY, { garbage: true });
  expect(readHubDeviceIdentity(settings)).toBeNull();
});

it('activation journal accepts records without username (pre-D19 builds)', () => {
  const settings = makeJournalQueries();
  settings.set(HUB_DEVICE_TOKEN_ACTIVATION_KEY, legacyActivationJournalFixture); // existing fixture WITHOUT username
  expect(readDeviceTokenActivation(settings)?.username).toBeNull();
});
```

- [ ] **Step 2: Run — FAIL (symbols undefined).**
- [ ] **Step 3: Implement** the schema/key/type/reader exactly as in Interfaces (identity reader:

```ts
export function readHubDeviceIdentity(
  queries: Pick<CredentialJournalQueries, 'get'>,
): HubDeviceIdentity | null {
  try {
    return readJournal(queries, HUB_DEVICE_IDENTITY_KEY, hubDeviceIdentitySchema);
  } catch {
    return null; // display metadata — never blocks credentials
  }
}
```
).
- [ ] **Step 4: Run device-token tests — pass. Step 5: Commit** — `feat(hub): device identity journal + username on activation journal`

---

### Task 3: device-token lifecycle writes/removes the identity record

**Files:**
- Modify: `apps/desktop/src/main/hub/device-token.ts`
- Test: `apps/desktop/tests/hub/device-token.test.ts`

**Interfaces:**
- Consumes Task 2 exports.
- Produces: every SQLite batch that SETS `HUB_DEVICE_TOKEN_BINDING_KEY` also sets `HUB_DEVICE_IDENTITY_KEY`; every batch that REMOVES the binding also removes the identity. `issueHubDeviceToken` stores `username` in the activation journal.

- [ ] **Step 1: Failing tests** (device-token.test.ts already builds a full issue→activate flow against a fake fetch; extend the success-path assertion):

```ts
it('activation commit persists the device identity', async () => {
  const { keychain, settings } = await runSuccessfulIssueFlow({ username: 'Maxim' }); // existing helper pattern
  const identity = readHubDeviceIdentity(settings);
  expect(identity).toMatchObject({ username: 'Maxim', label: 'Kevin' });
  expect(identity!.tokenLast4).toHaveLength(4);
});

it('revocation removes the device identity', async () => {
  // drive the existing sign-out flow helper, then:
  expect(readHubDeviceIdentity(settings)).toBeNull();
});

it('abandon removes the device identity', async () => {
  await abandonHubDeviceTokenCustody({ keychain, settings });
  expect(readHubDeviceIdentity(settings)).toBeNull();
});
```

(Adapt helper names to what `tests/hub/device-token.test.ts` actually provides — read the file first; the assertions above are the contract.)

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** In `issueHubDeviceToken` (journal construction, ~line 210): add `username: input.username.trim()`. In `completeHubDeviceTokenActivation` promotion batch (~line 415) extend:

```ts
input.settings.batch([
  {
    kind: 'set',
    key: HUB_DEVICE_TOKEN_BINDING_KEY,
    value: deviceTokenBinding(journal.hubBaseUrl, journal.tokenDigest),
  },
  {
    kind: 'set',
    key: HUB_DEVICE_IDENTITY_KEY,
    value: {
      version: 1,
      username: journal.username ?? null,
      label: journal.label,
      tokenLast4: staged.token.slice(-4),
      issuedAt: nowIso(),
      expiresAt: activated.expiresAt,
    } satisfies HubDeviceIdentity,
  },
  { kind: 'remove', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY },
]);
```

where `nowIso()` is `new Date().toISOString()` inline. Mirror the same identity `set` in the recovery promotion batch (`recoverHubDeviceTokenLifecycle`, accepted-promoted-active branch ~line 670 — there `activated.expiresAt` is unknown; use `journal.reservationExpiresAt`?? NO: expiry there is unknowable → set `expiresAt` from `journal.reservationExpiresAt` is wrong. Instead persist identity with the token's own unknown expiry as `issuedAt`-only knowledge: use the journal's `reservationExpiresAt` REPLACED by a 90-day estimate is dishonest — therefore in this branch persist identity with `expiresAt` = issuedAt + 90 days? Decision: honesty first — in the recovery branch set `expiresAt` to `new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()` with a code comment `// server TTL at issue time; sliding-refreshed server-side — display-only estimate`). `tokenLast4: activeCustody.value.slice(-4)`.
  Add `{ kind: 'remove', key: HUB_DEVICE_IDENTITY_KEY }` to every batch that removes `HUB_DEVICE_TOKEN_BINDING_KEY`: terminal-401 cleanup (~346), both revocation completions (~518, ~568), `abandonHubDeviceTokenCustody` (~849). Find all sites: `grep -n "HUB_DEVICE_TOKEN_BINDING_KEY" apps/desktop/src/main/hub/device-token.ts` — every `kind: 'remove'` occurrence gets the sibling removal.
- [ ] **Step 4: Run hub tests — pass. Step 5: Commit** — `feat(hub): persist non-secret device identity across the token lifecycle`

---

### Task 4: settings store — expose identity + appVersion in the VM

**Files:**
- Modify: `apps/desktop/src/main/settings/store.ts` (buildVm ~592-644; `SettingsStoreOptions` ~496)
- Modify: `apps/desktop/src/preload/contract.ts` (SettingsVM block ~404-482)
- Modify: `apps/desktop/src/main/index.ts` (createSettingsStore call site — `grep -n "createSettingsStore" apps/desktop/src/main/index.ts`)
- Modify: `apps/desktop/src/renderer/src/dev/mockBridge.ts` (settings object ~420)
- Test: `apps/desktop/tests/settings/store.test.ts`

**Interfaces:**
- Produces:
  - `contract.ts`: `export interface HubDeviceIdentityVM { username: string | null; label: string; tokenLast4: string; issuedAt: string; expiresAt: string; }`; `SettingsVM` gains `hubDeviceIdentity: HubDeviceIdentityVM | null;` and `appVersion: string;`.
  - `SettingsStoreOptions` gains `appVersion: string`; index.ts passes `app.getVersion()`; test factories pass `'0.0.0-test'`.
  - `buildVm()` adds `hubDeviceIdentity: readHubDeviceIdentity(queries)` and `appVersion: options.appVersion`; identity is surfaced only while device custody exists: `hubDeviceTokenBindingState !== 'none' || transition !== null` — else `null` (stale identity after an external secret wipe must not render a connected card).
  - mockBridge settings: `hubDeviceIdentity: { username: 'Maxim', label: 'Kevin', tokenLast4: 'W7vt', issuedAt: '2026-07-15T21:42:15Z', expiresAt: '2026-10-13T21:42:15Z' }, appVersion: '0.0.0-mock'`.

- [ ] **Step 1: Failing test** (store.test.ts — reuse its store factory):

```ts
it('exposes device identity only while device custody exists', async () => {
  const store = await makeStore(); // existing factory; ensure it now passes appVersion
  // seed identity + binding + secret through the fakes the file already uses
  seedBoundDeviceToken(store); // whatever the file's existing bound-token seeding helper is
  const vm = await store.get();
  expect(vm.hubDeviceIdentity?.label).toBe('Kevin');
  expect(vm.appVersion).toBe('0.0.0-test');
  // wipe custody externally → identity hidden
  await store.testKeychain.deleteSecret('hubDeviceToken');
  removeBindingRecord(store);
  expect((await store.get()).hubDeviceIdentity).toBeNull();
});
```

- [ ] **Step 2: Run — FAIL (type + behavior). Step 3: Implement** per Interfaces. **Step 4: `pnpm typecheck` + store tests pass** (typecheck sweeps mockBridge/dock consumers). **Step 5: Commit** — `feat(settings): expose hub device identity and app version in the settings VM`

---

### Task 5: auto-decommission of the quarantined legacy key

**Files:**
- Modify: `apps/desktop/src/main/settings/store.ts` (new method on `SettingsStore`)
- Modify: `apps/desktop/src/main/index.ts` (boot sequence after `recoverDeviceCredentialJournals` (~1155) and `activateStoredCredential` success path (~1489-1507))
- Test: `apps/desktop/tests/settings/store.test.ts`

**Interfaces:**
- Produces: `SettingsStore.decommissionQuarantinedHubKey(): Promise<boolean>` — inside `enqueueMutation`; returns true when it deleted something. Rule:

```ts
// D19: with a provably bound device token, a NON-bound legacy key is dead
// weight by construction (buildHubConnection selects bound credentials only)
// — delete it silently. Bound keys stay: working fallback until D116(c).
// Skip entirely while any credential transition journal exists.
```

- [ ] **Step 1: Failing tests** — the matrix from the spec:

```ts
describe('decommissionQuarantinedHubKey', () => {
  it('deletes an unbound key when the device token is bound', async () => { /* seed bound token + key secret WITHOUT binding → expect true; key secret gone; HUB_API_KEY_BINDING_KEY gone; keyMeta.hub null; hasHubKey false */ });
  it('deletes a mismatched key when the device token is bound', async () => { /* binding with wrong digest → true */ });
  it('deletes an unreadable key file without decrypting', async () => { /* keychain.getSecret throws for hubApiKey; deleteSecret succeeds → true */ });
  it('keeps a BOUND key (working fallback)', async () => { /* bound key + bound token → false, everything intact */ });
  it('does nothing without a bound device token', async () => { /* unbound key alone → false */ });
  it('does nothing while a credential transition journal exists', async () => { /* seed HUB_CREDENTIAL_TRANSITION_KEY → false */ });
  it('is idempotent', async () => { /* run twice → second returns false */ });
});
```

Write them with the file's real seeding helpers (read the top of store.test.ts first); each `it` must assert the exact post-state listed in the comment.

- [ ] **Step 2: Run — FAIL. Step 3: Implement** inside `createSettingsStore`:

```ts
async function decommissionQuarantinedHubKeyInsideQueue(): Promise<boolean> {
  if (readHubCredentialTransition() !== null) return false;
  if (readDeviceTokenActivation(queries) !== null || readDeviceTokenRevocation(queries) !== null) return false;
  const connection = await buildHubConnection();
  if (connection.settings.hubDeviceTokenBindingState !== 'bound') return false;
  const keyState = connection.settings.hubApiKeyBindingState;
  if (keyState === 'none' || keyState === 'bound') return false;
  await secrets.deleteSecret('hubApiKey'); // deletion needs no decryption
  queries.batch([
    { kind: 'remove', key: HUB_API_KEY_BINDING_KEY },
    { kind: 'set', key: KEY_META_KEY, value: { hub: null } },
  ]);
  return true;
}
```

expose as `decommissionQuarantinedHubKey: () => enqueueMutation(decommissionQuarantinedHubKeyInsideQueue)`. Wire in index.ts: (a) at boot right after the `recoverDeviceCredentialJournals()` call inside the startup activation path; (b) in `activateStoredCredential` after `emitSyncStatusFrame()`. Both sites: `void settingsStore.decommissionQuarantinedHubKey().then((removed) => { if (removed) logger?.info('hub', 'quarantined legacy chatter key decommissioned (D19)'); }).catch((error) => logger?.warn('hub', 'legacy key decommission failed; will retry next boot', errorToFields(error)));`
- [ ] **Step 4: Tests pass. Step 5: Commit** — `feat(settings): auto-decommission quarantined legacy hub key under a bound device token (D19)`

---

### Task 6: renderer logic — `legacyKeyState` + connected-state predicates

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/settings/sections/hubSettingsLogic.ts`
- Test: `apps/desktop/tests/renderer/hub-settings-logic.test.ts`

**Interfaces:**
- Produces:

```ts
export type LegacyKeyState = 'working-fallback' | 'isolated' | null;
export function legacyKeyState(settings: {
  hasHubKey: boolean;
  hubApiKeyBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
  hubDeviceTokenBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
}): LegacyKeyState {
  if (!settings.hasHubKey || settings.hubDeviceTokenBindingState === 'bound') return null;
  return settings.hubApiKeyBindingState === 'bound' ? 'working-fallback' : 'isolated';
}
```

`canIssueHubDeviceToken`, `hasHubDeviceTokenCustody`, `hubDeviceTokenStatus`, `isHubConfigured`, `hubUrlChangeRequiresDeviceSignOut` stay as-is.

- [ ] **Step 1: Failing tests** (hub-settings-logic.test.ts):

```ts
describe('legacyKeyState', () => {
  it('is null with a bound device token regardless of key state', () => {
    expect(legacyKeyState({ hasHubKey: true, hubApiKeyBindingState: 'unbound', hubDeviceTokenBindingState: 'bound' })).toBeNull();
  });
  it('working-fallback for a bound key on a key-only machine', () => {
    expect(legacyKeyState({ hasHubKey: true, hubApiKeyBindingState: 'bound', hubDeviceTokenBindingState: 'none' })).toBe('working-fallback');
  });
  it('isolated for a quarantined key with no token', () => {
    expect(legacyKeyState({ hasHubKey: true, hubApiKeyBindingState: 'unbound', hubDeviceTokenBindingState: 'none' })).toBe('isolated');
  });
  it('null without any key', () => {
    expect(legacyKeyState({ hasHubKey: false, hubApiKeyBindingState: 'none', hubDeviceTokenBindingState: 'none' })).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL → Step 3: implement → Step 4: pass. Step 5: Commit** — `feat(settings-ui): legacy-key state predicate`

---

### Task 7: i18n — new strings, removed strings, status-bar copy

**Files:**
- Modify: `packages/shared/src/i18n/catalog.ts` (hub block, lines ~106-200)
- Modify: `apps/desktop/src/renderer/src/app/statusBarTips.ts:27-30`
- Test: existing catalog parity test + `apps/desktop/tests/renderer/status-bar.test.ts` (adjust pinned strings if it asserts the old tips)

**Interfaces:**
- Produces (en / ru):

```ts
'hub.connected.title': { en: 'Connected as {username}', ru: 'Подключено как {username}' },
'hub.connected.titleAnon': { en: 'Device connected', ru: 'Устройство подключено' },
'hub.connected.sub': {
  en: 'Device {label} · sync and sending go through your agency hub',
  ru: 'Устройство {label} · синхронизация и отправка идут через hub агентства',
},
'hub.signOutDevice': { en: 'Sign out this device', ru: 'Выйти с этого устройства' },
'hub.notConnected.title': { en: 'Device not connected', ru: 'Устройство не подключено' },
'hub.notConnected.hint': {
  en: 'Sign in with your own login — this machine gets its own token.',
  ru: 'Войдите под своим логином — этой машине выдастся собственный токен.',
},
'hub.advanced': { en: 'Advanced', ru: 'Дополнительно' },
'hub.diag.token': { en: 'Device token', ru: 'Токен устройства' },
'hub.diag.tokenInfo': {
  en: '…{last4} · issued {issued} · valid to {expires}, renews itself',
  ru: '…{last4} · выдан {issued} · до {expires}, продлевается сам',
},
'hub.diag.stream': { en: 'Event stream', ru: 'Стрим событий' },
'hub.diag.streamHint': { en: 'polling covers if it drops', ru: 'при сбое подстраховывает опрос' },
'hub.diag.app': { en: 'Application', ru: 'Приложение' },
'hub.diag.appInfo': { en: '{version} · machine {label}', ru: '{version} · машина {label}' },
'hub.legacyKey.working': {
  en: 'Running on a legacy key — sign in with the device to switch to a token.',
  ru: 'Работает на legacy-ключе — войдите устройством, чтобы перейти на токен.',
},
'hub.legacyKey.isolated': {
  en: 'Access is paused: the stored legacy key cannot be verified. Sign in with the device.',
  ru: 'Доступ приостановлен: сохранённый legacy-ключ нельзя подтвердить. Войдите устройством.',
},
```

- Removes: `hub.key.label`, `hub.key.hint`, `hub.key.bindingAttention`, `hub.deviceToken.issued`, `hub.ofapiWrites.*` (6 keys), `hub.footerOk`, `hub.footerOff`, `hub.deviceToken.label`, `hub.deviceToken.hint`. Before deleting each: `grep -rn "<key>" apps/desktop/src packages/shared/src` — a key still referenced stays until its consumer is rewritten in Task 8 (do the deletion as the LAST step of Task 8 if grep still hits HubSettings.tsx).
- statusBarTips replacements (added-later tips, not the byte-pinned six):

```ts
hubAuth:
  'Хаб отклонил данные входа — живые события не приходят. Откройте настройки Agency Hub и войдите устройством заново.',
hubCredential:
  'Сохранённые данные входа изолированы: приложение не может доказать, какому Hub они принадлежат. Откройте настройки Agency Hub и выполните вход устройства.',
```

- [ ] **Step 1:** run `grep -n "hubCredential\|hubAuth" apps/desktop/tests/renderer/status-bar.test.ts` — update any pinned assertions to the new copy (test-first: change assertions, watch FAIL).
- [ ] **Step 2: Apply catalog + tips edits. Step 3: `pnpm --filter chatgoose-desktop exec vitest run tests/renderer/status-bar.test.ts` + the catalog parity test — pass. Step 4: Commit** — `feat(i18n): device-first hub copy; retire key-pasting CTAs`

---

### Task 8: HubSettings.tsx rewrite (minimalism per mockup)

**Files:**
- Rewrite: `apps/desktop/src/renderer/src/features/settings/sections/HubSettings.tsx`
- Test: `pnpm typecheck` + visual verification (Task 10); logic already covered by Task 6.

**Interfaces:**
- Consumes: `legacyKeyState`, `hubDeviceTokenStatus`, `hasHubDeviceTokenCustody`, `canIssueHubDeviceToken`, `hubUrlChangeRequiresDeviceSignOut`, `isHubConfigured` (Task 6); `settings.hubDeviceIdentity`, `settings.appVersion` (Task 4); existing hooks `useHubDeviceTokenIssue/useHubSignOutDevice/useHubAbandonDevice/useKeyTest/useExportDiagnostics/useAccounts/useSyncStatus`; i18n keys (Task 7).

Component structure (write it as real JSX; full skeleton below is the binding structure — flesh out with the existing utility classes):

```tsx
export function HubSettings({ settings, patch }: { settings: SettingsVM; patch: PatchFn }) {
  // state hooks identical to today (baseUrl, signInUser, signInPassword, labels)
  const identity = settings.hubDeviceIdentity;
  const status = hubDeviceTokenStatus(settings);
  const keyState = legacyKeyState(settings);
  const hub: HubState = syncStatus.data?.hub ?? 'off';
  const connected = status === 'configured';

  return (
    <Section title={t('hub.title')} hint={undefined /* section hint retired */}>
      <div className="space-y-2" aria-live="polite">
        {connected ? (
          <ConnectedCard />   /* inline block, not a new file: title, sub, badge, sign-out */
        ) : (
          <SignInBlock />     /* headline + labeled inputs + Войти; transition states keep
                                 the signingIn/signingOut/abandon affordances exactly as the
                                 current component renders them (copy the existing branches) */
        )}
        {keyState === 'working-fallback' && (
          <p className="text-[12px] text-ink-mid">{t('hub.legacyKey.working')}</p>
        )}
        {keyState === 'isolated' && (
          <p className="text-[12px] text-bad">{t('hub.legacyKey.isolated')}</p>
        )}
        {/* device-token bindingAttention (quarantined TOKEN) keeps its existing red line + abandon button */}
        <details className="pt-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-ink-mid">
            {t('hub.advanced')}
          </summary>
          <div className="space-y-2 pt-2">
            {identity && <TokenDiagRow />}   {/* hub.diag.token / tokenInfo with locale date fmt */}
            {hub !== 'off' && <StreamRow />} {/* existing HUB_STATUS_TONE badge + hub.diag.streamHint */}
            <AppRow />                        {/* hub.diag.appInfo: settings.appVersion + identity?.label ?? hostname absent → omit machine part */}
            <BaseUrlRow />                    {/* existing labeled input + mustSignOutBeforeHubChange line */}
            <PageLabelsRows />                {/* existing block, unchanged */}
            <div className="flex items-center gap-3 pt-1">
              <Button size="sm" disabled={!configured || formDirty || test.isPending} onClick={() => test.mutate('hub')}>{t('hub.testBtn')}</Button>
              <Button size="sm" onClick={() => exportDiagnostics.mutate()}>{t('localData.exportBtn') /* reuse the Local data key — grep its exact name first */}</Button>
              <Button size="sm" className="ml-auto" disabled={mustSignOutBeforeHubChange} onClick={save}>{t('hub.saveBtn')}</Button>
            </div>
            {test.data !== undefined && <ProbeResultLine />} {/* existing hubTestText */}
          </div>
        </details>
      </div>
    </Section>
  );
}
```

Hard requirements:
1. Every input gets `<label htmlFor>` + `id` (login, password, base URL, each page-label input). Error/success lines live inside the `aria-live="polite"` container.
2. `save()` no longer touches `hubApiKey` at all — the `key` state variable and its input are deleted; `formDirty` drops the key term.
3. The literal strings `agency_hub`, `pending`, `fail-closed` do not appear anywhere in the component.
4. Sign-in form is not rendered while `hasDeviceTokenCustody` (transition branches show their progress buttons instead — reuse the existing transition JSX).
5. Dates in `tokenInfo` format via the existing locale helper used elsewhere in settings (grep `toLocaleDateString` / date-fmt util in the settings sections and reuse).

- [ ] **Step 1: Rewrite the component.**
- [ ] **Step 2: Delete now-unreferenced i18n keys** (Task 7 list; grep each before deleting).
- [ ] **Step 3: `pnpm check` — typecheck catches stale key references; fix all.**
- [ ] **Step 4: Commit** — `feat(settings-ui): device-first minimal Hub section (D19)`

---

### Task 9: purge/transition sweep — identity cleanup completeness

**Files:**
- Modify: `apps/desktop/src/main/settings/store.ts`
- Test: `apps/desktop/tests/settings/store.test.ts`

- [ ] **Step 1:** `grep -n "HUB_DEVICE_TOKEN_BINDING_KEY\|deleteSecret('hubDeviceToken')" apps/desktop/src/main/settings/store.ts` — every store-side path that removes device custody (local-data purge, `deleteDeadDeviceToken` transition branch ~854/878, recovery branches ~963-999) must also `{ kind: 'remove', key: HUB_DEVICE_IDENTITY_KEY }`.
- [ ] **Step 2: Failing test:** purge (and the deleteDeadDeviceToken transition) leaves no `hubDeviceIdentity.v1` behind.
- [ ] **Step 3: Implement, run, pass. Step 4: Commit** — `fix(settings): device identity never outlives device custody`

---

### Task 10: end-to-end verification (run the app)

- [ ] **Step 1:** `pnpm check` at the worktree root — full suite green.
- [ ] **Step 2:** Serve the standalone renderer (`vite.standalone.config.ts`, port 5199 — mock bridge) and screenshot the section in: connected state (mock identity Maxim/Kevin), signed-out state, `working-fallback` and `isolated` warning states (tweak mockBridge settings per state), light + dark themes, RU + EN.
- [ ] **Step 3:** Compare against the approved mockup (artifact `c6364e39`); fix drift; re-run `pnpm check`.
- [ ] **Step 4: Commit any fixes** — `fix(settings-ui): visual polish per binding mockup`

---

### Task 11: docs — D19 + DESIGN note

**Files:**
- Modify: `docs/decisions.md` (quick-ref table + full entry after D18)
- Modify: `docs/DESIGN.md` (settings-surface paragraph — one superseded-style sentence: hub section is device-first as of D19)

- [ ] **Step 1: Write D19** — full entry covering: key field removed from UI while runtime dual-acceptance for bound keys stays until core D116(c); auto-decommission rule (bound token + non-bound key → silent delete, safe because non-bound keys are never selected as bearer); identity journal (`hubDeviceIdentity.v1`, non-secret, fail-open); bound token suppresses legacy-key attention; pending-prefix display correction (activated bearer keeps the reservation prefix by 0092 design — UI shows last-4 only); phase-2 outline pointer to the spec.
- [ ] **Step 2: Commit** — `docs: D19 device-token-first hub settings`

---

### Task 12: core — device-adoption report endpoint (`~/code/core`, branch `feat/device-adoption-report`)

**Files (core repo):**
- Modify: `apps/runtime/src/services/auth.ts` (new query helper) or the identity module service file — follow where admin user listings live (`grep -rn "admin/users" apps/runtime/src/modules`)
- Modify: the identity/admin routes module registering `GET /api/v1/admin/device-token-adoption` (owner role via the module's existing `requireDashboardUser`/owner guard pattern)
- Test: `tests/` alongside `device-token-lifecycle.integration.test.ts` patterns

**Interfaces:**
- Produces JSON:

```json
{
  "generatedAt": "…",
  "freshWindowDays": 14,
  "chatters": [
    { "username": "Maxim", "hasFreshDeviceToken": true, "deviceTokenLastUsedAt": "…",
      "activeApiKeys": 0, "apiKeyLastUsedAt": "…" }
  ],
  "gate": { "allActiveChattersOnFreshTokens": false }
}
```

- Scope: users with role `chatter`, `disabled_at IS NULL`, excluding probe/service accounts is NOT attempted (no schema flag exists — D116(c) phase-2 concern; document in the route comment).

- [ ] **Step 1: Failing integration test** — seed one chatter with a fresh token, one with only an active api key → expect `gate.allActiveChattersOnFreshTokens === false` and per-row fields as above; revoke the key + add fresh token → `true`.
- [ ] **Step 2: Implement route + SQL (drizzle: LEFT JOIN latest non-revoked device token / api key per user).**
- [ ] **Step 3: Run core checks** (`pnpm lint`, `pnpm test`, plus `pnpm contracts:generate` if the OpenAPI snapshot is materialized from routes — commit the regenerated `reference/agency-hub.openapi.json`).
- [ ] **Step 4: Commit in core** — `feat(identity): device-token adoption report for the D116(c) gate`. No desktop SDK re-vendor (desktop does not consume this endpoint).

---

### Task 13: Draft PR + agent review

- [ ] **Step 1:** Push branch; open Draft PR titled `feat(settings): device-token-first Hub section, legacy-key auto-decommission (D19)` — body: spec path, mockup artifact link, prod incident summary (Maxim 2026-07-16), phase-2 pointer; end with the standard Claude Code footer.
- [ ] **Step 2:** `~/code/agentic-control-plane/bin/agent review chatgoose_desktop --pr <N>` — LAST step per workspace rules.
- [ ] **Step 3:** Core PR similarly (`agent review core --pr <N>` if core is registered; otherwise owner-reviewed).

## Self-review notes

- Spec coverage: UI rework (T6-T8, T10), identity persistence (T2-T4, T9), auto-decommission (T5), attention suppression (T1), i18n/status-bar (T7), a11y labels/live-region (T8), core endpoint (T12), docs D19 (T11), operational Nikita item is NOT code — carried in the PR body + memory.
- The `--color-ink-low` contrast fix is explicitly out of scope (spec).
- Type consistency: `HubDeviceIdentity` (main) vs `HubDeviceIdentityVM` (contract) — same fields minus `version`.
