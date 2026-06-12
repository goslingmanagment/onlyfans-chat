// Personalities CRUD + account→personality mapping (F1: unmapped accounts get
// the AI gate banner in the conversation).

import { useState } from 'react';
import type { Personality } from '@chatgoose/shared/types';
import {
  useAccounts,
  useDeletePersonality,
  usePersonalities,
  useSavePersonality,
  useSetMapping,
} from '../../../bridge/queries';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Avatar } from '../../../design/Avatar';
import { cx } from '../../../lib/cx';
import { useT } from '../../../lib/i18n';
import { Section } from '../SettingsSurface';

export function PersonalitySettings(): React.JSX.Element {
  const personalities = usePersonalities();
  const accounts = useAccounts();
  const save = useSavePersonality();
  const remove = useDeletePersonality();
  const setMapping = useSetMapping();
  const t = useT();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftContent, setDraftContent] = useState('');

  const list = personalities.data ?? [];
  const editing = list.find((p) => p.id === editingId) ?? null;

  function startEdit(p: Personality | null): void {
    if (p === null) {
      setEditingId('new');
      setDraftName('');
      setDraftContent('');
    } else {
      setEditingId(p.id);
      setDraftName(p.name);
      setDraftContent(p.content);
    }
  }

  function commit(): void {
    const base: Personality =
      editing !== null
        ? { ...editing }
        : {
            id: `pers_${crypto.randomUUID()}`,
            name: '',
            content: '',
            updatedAt: Date.now(),
          };
    save.mutate(
      { ...base, name: draftName.trim(), content: draftContent, updatedAt: Date.now() },
      { onSuccess: () => setEditingId(null) },
    );
  }

  return (
    <>
      <Section title={t('personalities.title')} hint={t('personalities.hint')}>
        <div className="flex gap-4">
          <div className="w-52 flex-none space-y-1">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => startEdit(p)}
                className={cx(
                  'flex w-full cursor-pointer items-center gap-2 rounded-chip border px-3 py-2 text-left text-[13px] font-semibold',
                  editingId === p.id
                    ? 'border-clay-line bg-clay-bg text-clay-deep'
                    : 'border-line bg-bg1 hover:bg-bg2',
                )}
              >
                <span className="truncate">{p.name}</span>
                {p.builtin === true && (
                  <Badge tone="neutral" className="ml-auto">
                    {t('personalities.builtIn')}
                  </Badge>
                )}
              </button>
            ))}
            <Button size="sm" onClick={() => startEdit(null)} className="mt-1 w-full justify-center">
              {t('personalities.new')}
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            {editingId === null ? (
              <div className="flex h-full items-center justify-center rounded-chip border border-dashed border-line-strong p-6 text-[12.5px] text-ink-low">
                {t('personalities.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={t('personalities.namePh')}
                  className="w-full rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] font-semibold outline-none focus:border-clay-line"
                />
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder={t('personalities.contentPh')}
                  rows={8}
                  className="w-full resize-y rounded-chip border border-line bg-bg1 px-3 py-2 text-[13px] leading-[1.5] outline-none focus:border-clay-line"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" disabled={draftName.trim() === ''} onClick={commit}>
                    {t('common.save')}
                  </Button>
                  <Button size="sm" onClick={() => setEditingId(null)}>
                    {t('common.cancel')}
                  </Button>
                  {editing !== null && editing.builtin !== true && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="ml-auto"
                      onClick={() => {
                        remove.mutate(editing.id, { onSuccess: () => setEditingId(null) });
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('mapping.title')} hint={t('mapping.hint')}>
        <div className="space-y-1.5">
          {(accounts.data ?? []).map((account) => (
            <div key={account.id} className="flex items-center gap-3 py-1">
              <Avatar name={account.displayName} url={account.avatarUrl} size={28} radius={8} />
              <div className="w-44 flex-none">
                <div className="text-[13px] font-semibold">{account.displayName}</div>
                <div className="num text-micro text-ink-low">@{account.username}</div>
              </div>
              <select
                value={account.personalityId ?? ''}
                onChange={(e) =>
                  setMapping.mutate({
                    accountId: account.id,
                    personalityId: e.target.value === '' ? null : e.target.value,
                  })
                }
                className="min-w-0 flex-1 cursor-pointer rounded-chip border border-line bg-bg1 px-2 py-1.5 text-[12.5px] outline-none focus:border-clay-line"
              >
                <option value="">{t('mapping.unmapped')}</option>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {account.personalityId === null && <Badge tone="amber">{t('mapping.aiDisabled')}</Badge>}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
