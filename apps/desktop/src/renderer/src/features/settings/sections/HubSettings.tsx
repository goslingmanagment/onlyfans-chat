// Agency Hub connection (SPEC §6.2/§9): core base URL + chatter API key feed
// the real-time SSE stream plus summary sync / usage reporting. Quiet section —
// most chatters never touch it. Page-label overrides: main auto-matches OFAPI
// accounts to hub pages by username (SPEC §8.5); the inputs here override that
// per account. "Test connection" probes the SAVED config via GET /api/v1/auth/me
// in main — the renderer stays networkless.

import { useState } from 'react';
import type { KeyTestResultVM, SettingsVM, SyncStatusVM } from '../../../../../preload/contract';
import type { UiLocale, UiTranslator } from '@chatgoose/shared/i18n/index';
import { useAccounts, useKeyTest, useSyncStatus } from '../../../bridge/queries';
import { localizedErrorText, useLocale, useT } from '../../../lib/i18n';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Chip } from '../../../design/Chip';
import { Section, type PatchFn } from '../SettingsSurface';

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
  const [labels, setLabels] = useState<Record<string, string>>(settings.accountPageLabels);
  const accounts = useAccounts();
  const syncStatus = useSyncStatus();
  const test = useKeyTest();
  const t = useT();
  const locale = useLocale();

  const configured = settings.hubBaseUrl !== null && settings.hasHubKey;
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
            <div className="text-[13px] font-semibold">{t('hub.ofapiReads.label')}</div>
            <div className="text-[11px] text-ink-low">{t('hub.ofapiReads.hint')}</div>
          </div>
          <div className="flex items-center rounded-full border border-line bg-bg1 p-0.5">
            <Chip
              selected={settings.ofapiReadTransport === 'direct'}
              onClick={() => patch({ ofapiReadTransport: 'direct' })}
            >
              {t('hub.ofapiReads.direct')}
            </Chip>
            <Chip
              selected={settings.ofapiReadTransport === 'hub'}
              onClick={() => patch({ ofapiReadTransport: 'hub' })}
            >
              {t('hub.ofapiReads.hub')}
            </Chip>
          </div>
          <span className="text-[11px] text-ink-low">{t('hub.ofapiReads.restart')}</span>
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
