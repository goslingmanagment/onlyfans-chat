// Behavior: notification/read toggles, interface language + UI scale, the
// chat-list spend-style picker (real mini-previews of the ChatRow markup), and
// an Advanced block for dev-facing switches.

import type { SettingsVM } from '../../../../../preload/contract';
import { UI_LOCALE_SETTINGS, type UiLocaleSetting } from '@chatgoose/shared/i18n/index';
import { UI_THEME_SETTINGS } from '@chatgoose/shared/theme';
import { cx } from '../../../lib/cx';
import { useT } from '../../../lib/i18n';
import { Chip } from '../../../design/Chip';
import { Section, type PatchFn } from '../SettingsSurface';

const UI_SCALES = [0.9, 1, 1.1, 1.25] as const;

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full cursor-pointer items-center gap-3 py-2 text-left"
    >
      <span
        className={cx(
          'relative h-[18px] w-8 flex-none rounded-full border transition-colors duration-150',
          on ? 'border-clay bg-clay' : 'border-line-strong bg-bg3',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] h-3 w-3 rounded-full bg-bg1 transition-transform duration-150',
            on ? 'translate-x-[15px]' : 'translate-x-[3px]',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{label}</span>
        {hint !== undefined && <span className="block text-[11.5px] text-ink-low">{hint}</span>}
      </span>
    </button>
  );
}

function OptionRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[11.5px] text-ink-low">{hint}</span>
      </span>
      <span className="ml-auto flex items-center gap-[5px]">{children}</span>
    </div>
  );
}

export function BehaviorSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const t = useT();

  const localeOptionLabel = (option: UiLocaleSetting): string => {
    if (option === 'system') return t('behavior.language.system');
    return option === 'ru' ? 'Русский' : 'English';
  };

  return (
    <Section title={t('behavior.title')}>
      <div className="grid grid-cols-2 gap-x-8">
        <Toggle
          label={t('behavior.notifications')}
          hint={t('behavior.notificationsHint')}
          on={settings.notificationsEnabled}
          onChange={(v) => patch({ notificationsEnabled: v })}
        />
        <Toggle
          label={t('behavior.sound')}
          hint={t('behavior.soundHint')}
          on={settings.soundEnabled}
          onChange={(v) => patch({ soundEnabled: v })}
        />
        <Toggle
          label={t('behavior.markRead')}
          hint={t('behavior.markReadHint')}
          on={settings.markAsReadOnOpen}
          onChange={(v) => patch({ markAsReadOnOpen: v })}
        />
        <Toggle
          label={t('behavior.autoRead')}
          hint={t('behavior.autoReadHint')}
          on={settings.autoReadChats}
          onChange={(v) => patch({ autoReadChats: v })}
        />
        <Toggle
          label={t('behavior.promptCaching')}
          hint={t('behavior.promptCachingHint')}
          on={settings.promptCachingEnabled}
          onChange={(v) => patch({ promptCachingEnabled: v })}
        />
      </div>

      <OptionRow label={t('behavior.language')} hint={t('behavior.languageHint')}>
        {UI_LOCALE_SETTINGS.map((option) => (
          <Chip
            key={option}
            selected={settings.uiLocale === option}
            onClick={() => patch({ uiLocale: option })}
          >
            {localeOptionLabel(option)}
          </Chip>
        ))}
      </OptionRow>

      <OptionRow label={t('behavior.uiScale')} hint={t('behavior.uiScaleHint')}>
        {UI_SCALES.map((scale) => (
          <Chip
            key={scale}
            selected={settings.uiScale === scale}
            onClick={() => patch({ uiScale: scale })}
          >
            {`${Math.round(scale * 100)}%`}
          </Chip>
        ))}
      </OptionRow>

      <OptionRow label={t('behavior.uiTheme')} hint={t('behavior.uiThemeHint')}>
        {UI_THEME_SETTINGS.map((option) => (
          <Chip
            key={option}
            selected={settings.uiTheme === option}
            onClick={() => patch({ uiTheme: option })}
          >
            {t(`behavior.uiTheme.${option}`)}
          </Chip>
        ))}
      </OptionRow>

      <OptionRow label={t('behavior.spendStyle')} hint={t('behavior.spendStyleHint')}>
        {(['figure', 'chip'] as const).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => patch({ spendStyle: style })}
            className={cx(
              'flex h-[30px] cursor-pointer items-center rounded-chip border px-3 transition-colors duration-150',
              settings.spendStyle === style
                ? 'border-clay-line bg-clay-bg'
                : 'border-line bg-bg1 hover:bg-bg2',
            )}
          >
            {/* Exact ChatRow lifetime-spend markup (figure vs chip). */}
            <span
              className={cx(
                'num text-ink-mid',
                style === 'chip'
                  ? 'rounded-full border border-line-strong bg-bg2 px-[7px] text-[9.5px] leading-[15px]'
                  : 'text-[10.5px]',
              )}
            >
              $1,284
            </span>
          </button>
        ))}
      </OptionRow>

      <div className="mt-2 border-t border-line pt-2">
        <div className="cap text-ink-low">{t('behavior.advanced')}</div>
        <Toggle
          label={t('behavior.debug')}
          hint={t('behavior.debugHint')}
          on={settings.debugMode}
          onChange={(v) => patch({ debugMode: v })}
        />
      </div>
    </Section>
  );
}
