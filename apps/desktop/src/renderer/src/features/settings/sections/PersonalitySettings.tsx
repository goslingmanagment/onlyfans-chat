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
import {
  applyPersonalityDraft,
  capturePersonalityEditorBase,
  isPersonalityEditorLocked,
} from './personalityEditorLogic';

const PERSONA_CONTENT_MAX_CHARS = 50_000;
const PERSONA_NAME_MAX_CHARS = 120;

export function PersonalitySettings(): React.JSX.Element {
  const personalities = usePersonalities();
  const accounts = useAccounts();
  const save = useSavePersonality();
  const remove = useDeletePersonality();
  const setMapping = useSetMapping();
  const t = useT();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBase, setEditingBase] = useState<Personality | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftContent, setDraftContent] = useState('');

  const list = personalities.data ?? [];
  const contentError = draftContent.length === 0
    ? t('personalities.contentRequired')
    : draftContent.length > PERSONA_CONTENT_MAX_CHARS
      ? t('personalities.contentTooLong', { max: PERSONA_CONTENT_MAX_CHARS })
      : null;
  const mutationError = save.error ?? remove.error;
  const editorLocked = isPersonalityEditorLocked(save.isPending, remove.isPending);

  function startEdit(p: Personality | null): void {
    save.reset();
    remove.reset();
    if (p === null) {
      setEditingId('new');
      setEditingBase(null);
      setDraftName('');
      setDraftContent('');
    } else {
      setEditingId(p.id);
      // Keep the exact revision and payload the editor opened. A live list
      // refresh may show a newer Core row while the draft is open; rebasing the
      // stale draft onto that newer token would silently bypass server CAS.
      setEditingBase(capturePersonalityEditorBase(p));
      setDraftName(p.name);
      setDraftContent(p.content);
    }
  }

  function commit(): void {
    const base: Personality =
      editingBase !== null
        ? { ...editingBase }
        : {
            id: `pers_${crypto.randomUUID()}`,
            name: '',
            content: '',
            updatedAt: Date.now(),
            remoteVersion: null,
          };
    remove.reset();
    save.mutate(
      applyPersonalityDraft(base, {
        name: draftName,
        content: draftContent,
        updatedAt: Date.now(),
      }),
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
                disabled={editorLocked}
                onClick={() => startEdit(p)}
                className={cx(
                  'flex w-full cursor-pointer items-center gap-2 rounded-chip border px-3 py-2 text-left text-[13px] font-semibold',
                  editorLocked && 'cursor-not-allowed opacity-60',
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
            <Button
              size="sm"
              disabled={editorLocked}
              onClick={() => startEdit(null)}
              className="mt-1 w-full justify-center"
            >
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
                  disabled={editorLocked}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={t('personalities.namePh')}
                  maxLength={PERSONA_NAME_MAX_CHARS}
                  className="w-full rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] font-semibold outline-none focus:border-clay-line"
                />
                <textarea
                  value={draftContent}
                  disabled={editorLocked}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder={t('personalities.contentPh')}
                  maxLength={PERSONA_CONTENT_MAX_CHARS}
                  aria-invalid={contentError !== null}
                  aria-describedby="personality-content-status"
                  rows={8}
                  className="w-full resize-y rounded-chip border border-line bg-bg1 px-3 py-2 text-[13px] leading-[1.5] outline-none focus:border-clay-line"
                />
                <div
                  id="personality-content-status"
                  className={cx(
                    'flex justify-between text-[11px]',
                    contentError === null ? 'text-ink-low' : 'text-bad',
                  )}
                >
                  <span>{contentError ?? ''}</span>
                  <span>
                    {t('personalities.contentCount', {
                      current: draftContent.length,
                      max: PERSONA_CONTENT_MAX_CHARS,
                    })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={
                      draftName.trim() === '' ||
                      contentError !== null ||
                      editorLocked
                    }
                    onClick={commit}
                  >
                    {t('common.save')}
                  </Button>
                  <Button size="sm" disabled={editorLocked} onClick={() => setEditingId(null)}>
                    {t('common.cancel')}
                  </Button>
                  {editingBase !== null && editingBase.builtin !== true && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="ml-auto"
                      disabled={editorLocked}
                      onClick={() => {
                        save.reset();
                        remove.reset();
                        remove.mutate(editingBase, { onSuccess: () => setEditingId(null) });
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
                {mutationError !== null && (
                  <p className="text-[11px] text-bad">
                    {t(save.error !== null ? 'personalities.saveFailed' : 'personalities.deleteFailed', {
                      error: mutationError instanceof Error ? mutationError.message : String(mutationError),
                    })}
                  </p>
                )}
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
