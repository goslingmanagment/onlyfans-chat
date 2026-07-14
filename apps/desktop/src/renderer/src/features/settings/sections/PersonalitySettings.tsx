// Read-only global persona catalog + local account→persona mapping.

import {
  useAccounts,
  useExportLegacyPersonaSnapshot,
  usePersonalities,
  useSetMapping,
} from '../../../bridge/queries';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Avatar } from '../../../design/Avatar';
import { useT } from '../../../lib/i18n';
import { Section } from '../SettingsSurface';

export function PersonalitySettings(): React.JSX.Element {
  const accounts = useAccounts();
  const personalities = usePersonalities();
  const exportBackup = useExportLegacyPersonaSnapshot();
  const setMapping = useSetMapping();
  const t = useT();

  const list = personalities.data?.personas ?? [];
  const active = list.filter((persona) => persona.status === 'active');

  return (
    <>
      <Section title={t('personalities.title')} hint={t('personalities.readOnlyHint')}>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((persona) => (
              <div
                key={persona.key}
                className="flex items-center gap-2 rounded-chip border border-line bg-bg1 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {persona.displayName}
                </span>
                <span className="num text-micro text-ink-low">v{persona.version}</span>
                {persona.status === 'archived' && (
                  <Badge tone="amber">{t('personalities.archived')}</Badge>
                )}
              </div>
            ))}
            {list.length === 0 && (
              <div className="rounded-chip border border-dashed border-line-strong p-4 text-[12.5px] text-ink-low">
                {t('personalities.catalogUnavailable')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={exportBackup.isPending}
              onClick={() => exportBackup.mutate()}
            >
              {t('personalities.exportLegacy')}
            </Button>
            {exportBackup.data !== undefined && (
              <span className="min-w-0 truncate text-[11px] text-good">
                {t('personalities.exported', { path: exportBackup.data.path })}
              </span>
            )}
            {exportBackup.error !== null && (
              <span className="text-[11px] text-bad">
                {t('personalities.exportFailed', {
                  error: exportBackup.error instanceof Error
                    ? exportBackup.error.message
                    : String(exportBackup.error),
                })}
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('mapping.title')} hint={t('mapping.readOnlyHint')}>
        <div className="space-y-1.5">
          {(accounts.data ?? []).map((account) => {
            const rawKey = account.rawPersonalityId;
            const selected = rawKey === null
              ? null
              : list.find((persona) => persona.key === rawKey) ?? null;
            const unresolvedLabel = selected?.displayName ?? rawKey ?? 'unknown';
            return (
              <div key={account.id} className="flex items-center gap-3 py-1">
                <Avatar name={account.displayName} url={account.avatarUrl} size={28} radius={8} />
                <div className="w-44 flex-none">
                  <div className="text-[13px] font-semibold">{account.displayName}</div>
                  <div className="num text-micro text-ink-low">@{account.username}</div>
                </div>
                <select
                  value={rawKey ?? ''}
                  onChange={(event) => setMapping.mutate({
                    accountId: account.id,
                    personalityId: event.target.value === '' ? null : event.target.value,
                  })}
                  className="min-w-0 flex-1 cursor-pointer rounded-chip border border-line bg-bg1 px-2 py-1.5 text-[12.5px] outline-none focus:border-clay-line"
                >
                  <option value="">{t('mapping.unmapped')}</option>
                  {rawKey !== null && account.personalityMappingState !== 'active' && (
                    <option value={rawKey} disabled>
                      {account.personalityMappingState === 'archived'
                        ? t('mapping.archivedSelection', { persona: unresolvedLabel })
                        : t('mapping.unresolvedSelection', { persona: unresolvedLabel })}
                    </option>
                  )}
                  {active.map((persona) => (
                    <option key={persona.key} value={persona.key}>
                      {persona.displayName}
                    </option>
                  ))}
                </select>
                {account.personalityMappingState !== 'active' && (
                  <Badge tone="amber">
                    {account.personalityMappingState === 'archived'
                      ? t('mapping.archived')
                      : account.personalityMappingState === 'unresolved'
                        ? t('mapping.unresolved')
                        : t('mapping.aiDisabled')}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
