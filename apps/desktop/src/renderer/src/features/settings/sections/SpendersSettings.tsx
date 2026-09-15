// Spenders board mapping (PLAN item 12): per-account, OWNER-ORDERED list of
// OnlyMonster user-lists → board shelves (top tier first). One-time manual
// setting; the lists themselves stay OnlyMonster's (read-only here) — spenders
// outside mapped lists land in the board's «Без тира» section.

import { useState } from 'react';
import type { SettingsVM } from '../../../../../preload/contract';
import { useAccounts, useSpenderLists } from '../../../bridge/queries';
import { Button } from '../../../design/Button';
import { useT } from '../../../lib/i18n';
import { splitTierLabel } from '@chatgoose/shared';
import { Section, type PatchFn } from '../SettingsSurface';

export function SpendersSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const t = useT();
  const accounts = useAccounts();
  const accountList = accounts.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const accountId = selectedId ?? accountList[0]?.id ?? null;
  // Stage 24 / DP 8: reads are hub-only.
  const hasOfapiReadAccess =
    settings.hubBaseUrl !== null && settings.hubDeviceTokenBindingState === 'bound';

  const lists = useSpenderLists(accountId, hasOfapiReadAccess);
  const mapped = accountId !== null ? (settings.spendersListMappings[accountId] ?? []) : [];
  const byId = new Map((lists.data?.lists ?? []).map((list) => [list.id, list]));

  function setMapping(next: string[]): void {
    if (accountId === null) return;
    patch({
      spendersListMappings: { ...settings.spendersListMappings, [accountId]: next },
    });
  }

  function move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= mapped.length) return;
    const next = [...mapped];
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    setMapping(next);
  }

  const available = (lists.data?.lists ?? []).filter((list) => !mapped.includes(list.id));
  // OM tier lists are custom lists — surface those first, built-ins after.
  const sortedAvailable = [...available].sort((a, b) =>
    a.custom === b.custom ? b.usersCount - a.usersCount : a.custom ? -1 : 1,
  );

  return (
    <Section title={t('sp.set.title')} hint={t('sp.set.hint')}>
      {accountList.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[12px] text-ink-mid">{t('sp.set.account')}</span>
          <select
            value={accountId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-chip border border-line bg-bg1 px-2 py-1 text-[12.5px]"
          >
            {accountList.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {!hasOfapiReadAccess ? (
        <p className="text-[12.5px] text-ink-low">{t('sp.set.noKey')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="cap mb-1.5 text-ink-low">{t('sp.set.mapped')}</div>
            {mapped.length === 0 && (
              <p className="text-[12.5px] text-ink-low">{t('sp.set.empty')}</p>
            )}
            <ul className="space-y-1">
              {mapped.map((listId, index) => {
                const list = byId.get(listId);
                const label = splitTierLabel(list?.name ?? listId);
                return (
                  <li
                    key={listId}
                    className="flex items-center gap-2 rounded-chip border border-line bg-bg2 px-2.5 py-1.5"
                  >
                    <span className="num w-4 text-right text-[10.5px] text-ink-low">{index + 1}</span>
                    <span className="min-w-0 truncate text-[12.5px] font-medium">{label.title}</span>
                    {label.band !== null && (
                      <span className="num text-[9.5px] text-ink-low">{label.band}</span>
                    )}
                    {list !== undefined && (
                      <span className="num text-[10px] text-ink-low">
                        {t('sp.set.fansCount', { n: list.usersCount })}
                      </span>
                    )}
                    <span className="flex-1" />
                    <button
                      type="button"
                      title={t('sp.set.up')}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="cursor-pointer text-[11px] text-ink-low hover:text-ink disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title={t('sp.set.down')}
                      onClick={() => move(index, 1)}
                      disabled={index === mapped.length - 1}
                      className="cursor-pointer text-[11px] text-ink-low hover:text-ink disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <Button size="sm" variant="subtle" onClick={() => setMapping(mapped.filter((id) => id !== listId))}>
                      {t('sp.set.remove')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <div className="cap mb-1.5 text-ink-low">{t('sp.set.available')}</div>
            {lists.isPending && <p className="num text-micro text-ink-low">{t('sp.loading')}</p>}
            <ul className="max-h-[260px] space-y-1 overflow-y-auto">
              {sortedAvailable.map((list) => {
                const label = splitTierLabel(list.name);
                return (
                  <li
                    key={list.id}
                    className="flex items-center gap-2 rounded-chip border border-line bg-bg1 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate text-[12.5px]">{label.title}</span>
                    {label.band !== null && (
                      <span className="num text-[9.5px] text-ink-low">{label.band}</span>
                    )}
                    <span className="num text-[10px] text-ink-low">
                      {t('sp.set.fansCount', { n: list.usersCount })}
                    </span>
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => setMapping([...mapped, list.id])}>
                      {t('sp.set.add')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Section>
  );
}
