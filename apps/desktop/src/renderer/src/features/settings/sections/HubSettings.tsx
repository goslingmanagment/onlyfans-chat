// Agency Hub connection (SPEC §6.2/§9, reworked per D19): device-token-first.
// The calm state is one human card — who is signed in, on which machine, and
// whether the hub works; every diagnostic (token fingerprint, stream state,
// app version, hub URL, page-label overrides, probe) lives under a collapsed
// "Advanced" block. The chatter API key has NO input here anymore: humans
// authenticate with password + device token (core Decision #116); a leftover
// legacy key only ever surfaces as a migration/sign-in notice, and main
// decommissions a quarantined one automatically once a bound token exists.
// "Test connection" probes the SAVED config via GET /api/v1/auth/me in main —
// the renderer stays networkless.

import { useState } from 'react';
import type { KeyTestResultVM, SettingsVM, SyncStatusVM } from '../../../../../preload/contract';
import type { UiLocale, UiTranslator } from '@chatgoose/shared/i18n/index';
import {
  useAccounts,
  useExportDiagnostics,
  useHubAbandonDevice,
  useHubDeviceTokenIssue,
  useHubSignOutDevice,
  useKeyTest,
  useSyncStatus,
} from '../../../bridge/queries';
import { localizedErrorText, useLocale, useT } from '../../../lib/i18n';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Section, type PatchFn } from '../SettingsSurface';
import {
  canIssueHubDeviceToken,
  hasHubDeviceTokenCustody,
  hubDeviceTokenStatus,
  hubUrlChangeRequiresDeviceSignOut,
  isHubConfigured,
  legacyKeyState,
} from './hubSettingsLogic';

type HubState = SyncStatusVM['hub'];

const HUB_STATUS_TONE: Record<Exclude<HubState, 'off'>, 'green' | 'amber' | 'bad'> = {
  connecting: 'amber',
  live: 'green',
  degraded: 'amber',
  'auth-failed': 'bad',
  stopped: 'amber',
};

function hubTestText(t: UiTranslator, locale: UiLocale, result: KeyTestResultVM): string {
  if (result.ok) {
    return t('hub.testOk', {
      username: result.username ?? '',
      role: result.role ?? '',
      pages: result.pages ?? 0,
    });
  }
  if (result.code === 'HUB_NOT_CONFIGURED') {
    return t('hub.testNeedsConfig');
  }
  return localizedErrorText(locale, result.code, result.message);
}

function fmtDay(iso: string, locale: UiLocale): string {
  return new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

const INPUT_CLASS =
  'min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line';

export function HubSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings.hubBaseUrl ?? '');
  const [signInUser, setSignInUser] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const deviceToken = useHubDeviceTokenIssue();
  const signOutDevice = useHubSignOutDevice();
  const abandonDevice = useHubAbandonDevice();
  const exportDiagnostics = useExportDiagnostics();
  const [labels, setLabels] = useState<Record<string, string>>(settings.accountPageLabels);
  const accounts = useAccounts();
  const syncStatus = useSyncStatus();
  const test = useKeyTest();
  const t = useT();
  const locale = useLocale();

  const configured = isHubConfigured(settings);
  const hub: HubState = syncStatus.data?.hub ?? 'off';
  const hasDeviceTokenCustody = hasHubDeviceTokenCustody(settings);
  const deviceTokenStatus = hubDeviceTokenStatus(settings);
  const identity = settings.hubDeviceIdentity;
  const keyState = legacyKeyState(settings);
  const showAbandonDevice = settings.hubDeviceTokenTransition !== null
    || settings.hubDeviceTokenBindingState !== 'bound'
    || signOutDevice.isError;
  // The probe runs against the SAVED config — while the form holds unsaved
  // edits a green result would "verify" the wrong URL, so Test locks until
  // the edits are saved (or reverted).
  const formDirty = baseUrl.trim() !== (settings.hubBaseUrl ?? '');
  const mustSignOutBeforeHubChange = hubUrlChangeRequiresDeviceSignOut({
    draftHubBaseUrl: baseUrl,
    savedHubBaseUrl: settings.hubBaseUrl,
    hasStoredDeviceToken: hasDeviceTokenCustody,
  });

  function save(): void {
    // The base URL always rides along: that settings-table write (plus the
    // IPC hub-config hook) tells main to (re)connect.
    const trimmedUrl = baseUrl.trim();
    const cleanedLabels = Object.fromEntries(
      Object.entries(labels)
        .map(([accountId, label]) => [accountId, label.trim()] as const)
        .filter(([, label]) => label !== ''),
    );
    patch({
      hubBaseUrl: trimmedUrl === '' ? null : trimmedUrl,
      accountPageLabels: cleanedLabels,
    });
    test.reset();
  }

  const busy = deviceToken.isPending || signOutDevice.isPending || abandonDevice.isPending;

  return (
    <Section title={t('hub.title')}>
      <div className="space-y-2">
        {deviceTokenStatus === 'configured' ? (
          <div className="py-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-semibold">
                {identity?.username
                  ? t('hub.connected.title', { username: identity.username })
                  : t('hub.connected.titleAnon')}
              </span>
              {hub !== 'off' && (
                <Badge tone={HUB_STATUS_TONE[hub]}>{t(`hub.status.${hub}`)}</Badge>
              )}
            </div>
            {identity && (
              <div className="pt-0.5 text-[13px] text-ink-mid">
                {t('hub.connected.sub', { label: identity.label })}
              </div>
            )}
            <div className="flex items-center gap-3 pt-2.5">
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => signOutDevice.mutate()}
              >
                {signOutDevice.isPending
                  ? t('hub.deviceToken.signingOut')
                  : t('hub.signOutDevice')}
              </Button>
              {showAbandonDevice && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  title={t('hub.deviceToken.abandonHint')}
                  onClick={() => abandonDevice.mutate()}
                >
                  {abandonDevice.isPending
                    ? t('hub.deviceToken.abandoning')
                    : t('hub.deviceToken.abandon')}
                </Button>
              )}
            </div>
          </div>
        ) : deviceTokenStatus === 'unset' ? (
          <div className="py-1">
            <div className="text-[15px] font-semibold">{t('hub.notConnected.title')}</div>
            <p className="pt-0.5 text-[11.5px] text-ink-mid">{t('hub.notConnected.hint')}</p>
            <div className="flex max-w-xl items-center gap-3 pt-2.5">
              <label htmlFor="hub-signin-user" className="sr-only">
                {t('hub.deviceToken.username')}
              </label>
              <input
                id="hub-signin-user"
                type="text"
                value={signInUser}
                onChange={(e) => setSignInUser(e.target.value)}
                placeholder={t('hub.deviceToken.username')}
                autoComplete="off"
                spellCheck={false}
                className={INPUT_CLASS}
              />
              <label htmlFor="hub-signin-password" className="sr-only">
                {t('hub.deviceToken.password')}
              </label>
              <input
                id="hub-signin-password"
                type="password"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                placeholder={t('hub.deviceToken.password')}
                autoComplete="off"
                spellCheck={false}
                className={INPUT_CLASS}
              />
              <Button
                disabled={!canIssueHubDeviceToken({
                  username: signInUser,
                  password: signInPassword,
                  hasStoredDeviceToken: hasDeviceTokenCustody,
                  issuePending: deviceToken.isPending,
                  signOutPending: signOutDevice.isPending || abandonDevice.isPending,
                })}
                onClick={() => {
                  deviceToken.mutate(
                    { username: signInUser.trim(), password: signInPassword },
                    { onSuccess: () => setSignInPassword('') },
                  );
                }}
              >
                {deviceToken.isPending ? t('hub.deviceToken.signingIn') : t('hub.deviceToken.signIn')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-1">
            <div className="flex items-center gap-3">
              <Badge tone="amber">
                {deviceTokenStatus === 'activation'
                  ? t('hub.deviceToken.signingIn')
                  : deviceTokenStatus === 'revocation'
                    ? t('hub.deviceToken.signingOut')
                    : t('hub.credentialAttention')}
              </Badge>
              {hasDeviceTokenCustody && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => signOutDevice.mutate()}
                >
                  {signOutDevice.isPending
                    ? t('hub.deviceToken.signingOut')
                    : t('hub.deviceToken.signOut')}
                </Button>
              )}
              {hasDeviceTokenCustody && showAbandonDevice && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  title={t('hub.deviceToken.abandonHint')}
                  onClick={() => abandonDevice.mutate()}
                >
                  {abandonDevice.isPending
                    ? t('hub.deviceToken.abandoning')
                    : t('hub.deviceToken.abandon')}
                </Button>
              )}
            </div>
            {settings.hasHubDeviceToken && settings.hubDeviceTokenBindingState !== 'bound' && (
              <p className="pt-1 text-[11.5px] text-bad">{t('hub.deviceToken.bindingAttention')}</p>
            )}
          </div>
        )}

        {/* Narrow live region: only status/error lines announce — never the
            whole section (typing, badge polling, details toggling). */}
        <div aria-live="polite" className="space-y-2">
          {keyState === 'working-fallback' && (
            <p className="text-[12px] text-ink-mid">{t('hub.legacyKey.working')}</p>
          )}
          {keyState === 'isolated' && (
            <p className="text-[12px] text-bad">{t('hub.legacyKey.isolated')}</p>
          )}
          {hub === 'auth-failed' && <p className="text-[12px] text-bad">{t('hub.authFailedBody')}</p>}

          {signOutDevice.isError && (
            <p className="text-[11.5px] text-bad">
              {signOutDevice.error instanceof Error
                ? signOutDevice.error.message
                : t('hub.deviceToken.signOutFailed')}
            </p>
          )}
          {abandonDevice.isError && (
            <p className="text-[11.5px] text-bad">
              {abandonDevice.error instanceof Error
                ? abandonDevice.error.message
                : t('hub.deviceToken.abandonFailed')}
            </p>
          )}
          {deviceToken.isError && (
            <p className="text-[11.5px] text-bad">
              {deviceToken.error instanceof Error
                ? deviceToken.error.message
                : t('hub.deviceToken.failed')}
            </p>
          )}
        </div>

        <details className="pt-1">
          <summary className="cursor-pointer text-[12px] font-semibold text-ink-mid">
            {t('hub.advanced')}
          </summary>
          <div className="space-y-2 pt-2">
            {identity && (
              <div className="flex items-center gap-3 py-0.5">
                <div className="w-44 flex-none text-[13px] font-semibold">{t('hub.diag.token')}</div>
                <span className="text-[12.5px] text-ink-mid">
                  {identity.issuedAt !== null && identity.expiresAt !== null
                    ? t('hub.diag.tokenInfo', {
                        last4: identity.tokenLast4,
                        issued: fmtDay(identity.issuedAt, locale),
                        expires: fmtDay(identity.expiresAt, locale),
                      })
                    : t('hub.diag.tokenInfoShort', { last4: identity.tokenLast4 })}
                </span>
              </div>
            )}
            {hub !== 'off' && (
              <div className="flex items-center gap-3 py-0.5">
                <div className="w-44 flex-none text-[13px] font-semibold">{t('hub.diag.stream')}</div>
                <Badge tone={HUB_STATUS_TONE[hub]}>{t(`hub.status.${hub}`)}</Badge>
                <span className="text-[11px] text-ink-low">{t('hub.diag.streamHint')}</span>
              </div>
            )}
            <div className="flex items-center gap-3 py-0.5">
              <div className="w-44 flex-none text-[13px] font-semibold">{t('hub.diag.app')}</div>
              <span className="text-[12.5px] text-ink-mid">
                {t('hub.diag.appInfo', {
                  version: settings.appVersion,
                  label: settings.machineLabel,
                  os: settings.osPlatform,
                })}
              </span>
            </div>
            <div className="flex items-center gap-3 py-0.5">
              <label
                htmlFor="hub-base-url"
                className="w-44 flex-none text-[13px] font-semibold"
              >
                {t('hub.baseUrl.label')}
                <span className="block text-[11px] font-normal text-ink-low">
                  {t('hub.baseUrl.hint')}
                </span>
              </label>
              <input
                id="hub-base-url"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://hub.example.com"
                autoComplete="off"
                spellCheck={false}
                className={INPUT_CLASS}
              />
            </div>
            {mustSignOutBeforeHubChange && (
              <p className="text-[11px] text-bad">{t('hub.deviceToken.signOutBeforeHubChange')}</p>
            )}

            {configured && accounts.data !== undefined && accounts.data.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[13px] font-semibold">{t('hub.pageLabels.title')}</div>
                <p className="text-[11px] text-ink-low">{t('hub.pageLabels.hint')}</p>
                {accounts.data.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 py-0.5">
                    <label
                      htmlFor={`hub-page-label-${account.id}`}
                      className="w-44 flex-none truncate text-[12.5px] text-ink-mid"
                    >
                      @{account.username}
                    </label>
                    <input
                      id={`hub-page-label-${account.id}`}
                      type="text"
                      value={labels[account.id] ?? ''}
                      onChange={(e) =>
                        setLabels((prev) => ({ ...prev, [account.id]: e.target.value }))
                      }
                      placeholder={t('hub.pageLabels.placeholder')}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1 text-[12.5px] outline-none placeholder:text-ink-low focus:border-clay-line"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button
                size="sm"
                disabled={!configured || formDirty || test.isPending}
                onClick={() => test.mutate('hub')}
              >
                {test.isPending ? t('keys.testing') : t('hub.testBtn')}
              </Button>
              <Button
                size="sm"
                disabled={exportDiagnostics.isPending}
                onClick={() => exportDiagnostics.mutate()}
              >
                {t('danger.exportDiagnostics')}
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled={mustSignOutBeforeHubChange}
                onClick={save}
              >
                {t('hub.saveBtn')}
              </Button>
            </div>
            {test.data !== undefined && (
              <p
                aria-live="polite"
                className={
                  test.data.ok
                    ? 'text-right text-[11.5px] text-green'
                    : 'text-right text-[11.5px] text-bad'
                }
              >
                {hubTestText(t, locale, test.data)}
              </p>
            )}
          </div>
        </details>
      </div>
    </Section>
  );
}
