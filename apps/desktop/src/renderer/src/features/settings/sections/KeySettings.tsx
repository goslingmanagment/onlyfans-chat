// API keys (PRD F9): set-only inputs (keys never round-trip to the renderer),
// non-secret fingerprints ({last4, setAt}) so the chatter can see WHICH key is
// stored, and a per-row Test button probing the SAVED key (cmd:keys.test —
// the probe runs in main; failures localize by CG-* code).

import { useState } from 'react';
import type {
  KeyMetaEntry,
  KeyTestProvider,
  KeyTestResultVM,
  SettingsVM,
} from '../../../../../preload/contract';
import type { UiLocale, UiTranslator } from '@chatgoose/shared/i18n/index';
import { useKeyTest } from '../../../bridge/queries';
import { localeTag, localizedErrorText, useLocale, useT } from '../../../lib/i18n';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Section, type PatchFn } from '../SettingsSurface';

function testResultText(t: UiTranslator, locale: UiLocale, result: KeyTestResultVM): string {
  if (result.ok) {
    return result.team != null && result.team !== ''
      ? t('keys.testOkTeam', { team: result.team })
      : t('keys.testOk');
  }
  return localizedErrorText(locale, result.code, result.message);
}

function KeyRow({
  provider,
  label,
  hint,
  configured,
  meta,
  onSave,
}: {
  provider: KeyTestProvider;
  label: string;
  hint: string;
  configured: boolean;
  meta: KeyMetaEntry | null;
  onSave: (value: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState('');
  const t = useT();
  const locale = useLocale();
  const test = useKeyTest();

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <div className="w-44 flex-none">
          <div className="text-[13px] font-semibold">{label}</div>
          <div className="text-[11px] text-ink-low">{hint}</div>
          {configured && meta !== null && (
            <div className="num text-[10.5px] text-ink-low">
              {t('keys.meta', {
                last4: meta.last4,
                date: new Date(meta.setAt).toLocaleDateString(localeTag(locale), {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })}
            </div>
          )}
        </div>
        <Badge tone={configured ? 'green' : 'neutral'}>
          {configured ? t('common.configured') : t('common.notSet')}
        </Badge>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={configured ? t('common.replaceKey') : t('common.pasteKey')}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
        />
        <Button
          size="sm"
          disabled={value.trim() === ''}
          onClick={() => {
            onSave(value.trim());
            setValue('');
            test.reset();
          }}
        >
          {t('common.save')}
        </Button>
        <Button
          size="sm"
          disabled={!configured || test.isPending}
          onClick={() => test.mutate(provider)}
          title={t('keys.test')}
        >
          {test.isPending ? t('keys.testing') : t('keys.test')}
        </Button>
      </div>
      {test.data !== undefined && (
        <p
          className={
            test.data.ok
              ? 'mt-1 text-right text-[11.5px] text-green'
              : 'mt-1 text-right text-[11.5px] text-bad'
          }
        >
          {testResultText(t, locale, test.data)}
        </p>
      )}
    </div>
  );
}

export function KeySettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const t = useT();
  return (
    <Section title={t('keys.title')} hint={t('keys.hint')}>
      <div className="divide-y divide-line">
        <KeyRow
          provider="anthropic"
          label={t('keys.anthropic.label')}
          hint={t('keys.anthropic.hint')}
          configured={settings.hasAnthropicKey}
          meta={settings.keyMeta.anthropic}
          onSave={(v) => patch({ anthropicKey: v })}
        />
        <KeyRow
          provider="openrouter"
          label={t('keys.openrouter.label')}
          hint={t('keys.openrouter.hint')}
          configured={settings.hasOpenRouterKey}
          meta={settings.keyMeta.openRouter}
          onSave={(v) => patch({ openRouterKey: v })}
        />
      </div>
    </Section>
  );
}
