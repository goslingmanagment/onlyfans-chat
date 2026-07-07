// Agency Hub connection (SPEC §6.2/§9): core base URL + chatter API key feed
// the real-time SSE stream plus summary sync / usage reporting. Quiet section —
// most chatters never touch it. Page-label overrides: main auto-matches OFAPI
// accounts to hub pages by username (SPEC §8.5); the inputs here override that
// per account. "Test connection" probes the SAVED config via GET /api/v1/auth/me
// in main — the renderer stays networkless.

import { useState } from 'react';
import type { KeyTestResultVM, SettingsVM, SyncStatusVM } from '../../../../../preload/contract';
import type { UiLocale, UiTranslator } from '@chatgoose/shared/i18n/index';
import {
  useAccounts,
  useHubDeviceTokenIssue,
  useHubSignOutDevice,
  useKeyTest,
  useSyncStatus,
} from '../../../bridge/queries';
import { localizedErrorText, useLocale, useT } from '../../../lib/i18n';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Section, type PatchFn } from '../SettingsSurface';
import { isHubConfigured } from './hubSettingsLogic';

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

export function HubSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings.hubBaseUrl ?? '');
  const [key, setKey] = useState('');
  const [signInUser, setSignInUser] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const deviceToken = useHubDeviceTokenIssue();
  const signOutDevice = useHubSignOutDevice();
  const [labels, setLabels] = useState<Record<string, string>>(settings.accountPageLabels);
  const accounts = useAccounts();
  const syncStatus = useSyncStatus();
  const test = useKeyTest();
  const t = useT();
  const locale = useLocale();

  const configured = isHubConfigured(settings);
  const hub: HubState = syncStatus.data?.hub ?? 'off';
  // The probe runs against the SAVED config — while the form holds unsaved
  // edits a green result would "verify" the wrong URL/key, so Test locks
  // until the edits are saved (or reverted).
  const formDirty = baseUrl.trim() !== (settings.hubBaseUrl ?? '') || key.trim() !== '';

  function save(): void {
    // One patch for everything: key writes go to the keychain and publish no
    // settings-table change, so the base URL ALWAYS rides along — that table
    // write (plus the IPC hub-config hook) tells main to (re)connect.
    const trimmedUrl = baseUrl.trim();
    const trimmedKey = key.trim();
    const cleanedLabels = Object.fromEntries(
      Object.entries(labels)
        .map(([accountId, label]) => [accountId, label.trim()] as const)
        .filter(([, label]) => label !== ''),
    );
    patch({
      hubBaseUrl: trimmedUrl === '' ? null : trimmedUrl,
      accountPageLabels: cleanedLabels,
      ...(trimmedKey !== '' ? { hubApiKey: trimmedKey } : {}),
    });
    setKey('');
    test.reset();
  }

  return (
    <Section title={t('hub.title')} hint={t('hub.hint')}>
      <div className="space-y-2">
        <div className="flex items-center gap-3 py-1">
          <div className="w-44 flex-none">
            <div className="text-[13px] font-semibold">{t('hub.baseUrl.label')}</div>
            <div className="text-[11px] text-ink-low">{t('hub.baseUrl.hint')}</div>
          </div>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://hub.example.com"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
          />
        </div>
        <div className="flex items-center gap-3 py-1">
          <div className="w-44 flex-none">
            <div className="text-[13px] font-semibold">{t('hub.key.label')}</div>
            <div className="text-[11px] text-ink-low">{t('hub.key.hint')}</div>
          </div>
          <Badge tone={settings.hasHubKey ? 'green' : 'neutral'}>
            {settings.hasHubKey ? t('common.configured') : t('common.notSet')}
          </Badge>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={settings.hasHubKey ? t('common.replaceKey') : t('common.pasteKey')}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
          />
        </div>
        <div className="flex items-center gap-3 py-1">
          <div className="w-44 flex-none">
            <div className="text-[13px] font-semibold">{t('hub.deviceToken.label')}</div>
            <div className="text-[11px] text-ink-low">{t('hub.deviceToken.hint')}</div>
          </div>
          <Badge tone={settings.hasHubDeviceToken ? 'green' : 'neutral'}>
            {settings.hasHubDeviceToken ? t('common.configured') : t('common.notSet')}
          </Badge>
          <input
            type="text"
            value={signInUser}
            onChange={(e) => setSignInUser(e.target.value)}
            placeholder={t('hub.deviceToken.username')}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
          />
          <input
            type="password"
            value={signInPassword}
            onChange={(e) => setSignInPassword(e.target.value)}
            placeholder={t('hub.deviceToken.password')}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
          />
          <Button
            disabled={signInUser.trim() === '' || signInPassword === '' || deviceToken.isPending}
            onClick={() => {
              deviceToken.mutate(
                { username: signInUser.trim(), password: signInPassword },
                { onSuccess: () => setSignInPassword('') },
              );
            }}
          >
            {deviceToken.isPending ? t('hub.deviceToken.signingIn') : t('hub.deviceToken.signIn')}
          </Button>
          {settings.hasHubDeviceToken && (
            <Button
              variant="danger"
              size="sm"
              disabled={signOutDevice.isPending}
              onClick={() => signOutDevice.mutate()}
            >
              {signOutDevice.isPending
                ? t('hub.deviceToken.signingOut')
                : t('hub.deviceToken.signOut')}
            </Button>
          )}
        </div>
        {deviceToken.isSuccess && (
          <div className="pl-47 text-[11px] text-ink-low">
            {t('hub.deviceToken.issued', {
              prefix: deviceToken.data.keyPrefix,
              label: deviceToken.data.label,
            })}
          </div>
        )}
        {signOutDevice.isError && (
          <div className="pl-47 text-[11px] text-bad">
            {signOutDevice.error instanceof Error
              ? signOutDevice.error.message
              : t('hub.deviceToken.signOutFailed')}
          </div>
        )}
        {deviceToken.isError && (
          <div className="pl-47 text-[11px] text-bad">
            {deviceToken.error instanceof Error ? deviceToken.error.message : t('hub.deviceToken.failed')}
          </div>
        )}
        <div className="flex items-center gap-3 py-1">
          <div className="w-44 flex-none">
            <div className="text-[13px] font-semibold">{t('hub.ofapiWrites.label')}</div>
            <div className="text-[11px] text-ink-low">{t('hub.ofapiWrites.hint')}</div>
          </div>
          <Badge tone="green">{t('hub.ofapiWrites.hub')}</Badge>
          <span className="text-[11px] text-ink-low">{t('hub.ofapiWrites.restart')}</span>
        </div>

        {hub !== 'off' && (
          <div className="flex items-center gap-3 py-1">
            <div className="w-44 flex-none text-[13px] font-semibold">{t('hub.streamStatus')}</div>
            <Badge tone={HUB_STATUS_TONE[hub]}>{t(`hub.status.${hub}`)}</Badge>
          </div>
        )}
        {hub === 'auth-failed' && <p className="text-[12px] text-bad">{t('hub.authFailedBody')}</p>}

        {configured && accounts.data !== undefined && accounts.data.length > 0 && (
          <div className="space-y-1 pt-2">
            <div className="text-[13px] font-semibold">{t('hub.pageLabels.title')}</div>
            <p className="text-[11px] text-ink-low">{t('hub.pageLabels.hint')}</p>
            {accounts.data.map((account) => (
              <div key={account.id} className="flex items-center gap-3 py-0.5">
                <div className="w-44 flex-none truncate text-[12.5px] text-ink-mid">
                  @{account.username}
                </div>
                <input
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

        {test.data !== undefined && (
          <p
            className={
              test.data.ok ? 'text-right text-[11.5px] text-green' : 'text-right text-[11.5px] text-bad'
            }
          >
            {hubTestText(t, locale, test.data)}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <span className="text-[11px] text-ink-low">
            {configured ? t('hub.footerOk') : t('hub.footerOff')}
          </span>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!configured || formDirty || test.isPending}
            onClick={() => test.mutate('hub')}
          >
            {test.isPending ? t('keys.testing') : t('hub.testBtn')}
          </Button>
          <Button size="sm" onClick={save}>
            {t('hub.saveBtn')}
          </Button>
        </div>
      </div>
    </Section>
  );
}
