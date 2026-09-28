// Behavior: notification/read toggles, interface language + UI scale, the
// chat-list spend-style picker (real mini-previews of the ChatRow markup), and
// an Advanced block for dev-facing switches.

import { useState } from 'react';
import type { SettingsVM } from '../../../../../preload/contract';
import {
  SOUND_TONES,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  SOUND_VOLUME_STEP,
  type SoundTone,
} from '@chatgoose/shared/sound/index';
import { playNotificationSound } from '../../../lib/sound';
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

function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (next: number) => void;
}): React.JSX.Element {
  return (
    <OptionRow label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="num h-[30px] w-[74px] rounded border border-line bg-bg1 px-2 text-right text-[12px] text-ink outline-none focus:border-clay-line"
      />
      {suffix !== undefined && <span className="text-[11px] text-ink-low">{suffix}</span>}
    </OptionRow>
  );
}

const SELECT_CLASS =
  'h-[30px] rounded-chip border border-line bg-bg1 px-2 text-[12.5px] text-ink outline-none focus:border-clay-line';
const PREVIEW_CLASS =
  'h-[30px] cursor-pointer rounded-chip border border-line bg-bg1 px-3 text-[12px] font-semibold text-ink-mid transition-colors duration-150 hover:bg-bg2';

/** D44: the tone picker + its «Проверить» button (plays at the current volume). */
function ToneRow({
  label,
  hint,
  role,
  tone,
  volume,
  onChange,
}: {
  label: string;
  hint: string;
  role: string;
  tone: SoundTone;
  volume: number;
  onChange: (next: SoundTone) => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <OptionRow label={label} hint={hint}>
      <select
        aria-label={label}
        data-role={role}
        value={tone}
        onChange={(event) => onChange(event.currentTarget.value as SoundTone)}
        className={SELECT_CLASS}
      >
        {SOUND_TONES.map((option) => (
          <option key={option} value={option}>
            {t(`behavior.tone.${option}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-role={`${role}-preview`}
        onClick={() => playNotificationSound('preview', tone, volume)}
        className={PREVIEW_CLASS}
      >
        {t('behavior.soundPreview')}
      </button>
    </OptionRow>
  );
}

/** D44: tones, the shared volume, and the new-subscriber switch. */
function SoundSettings({ settings, patch }: { settings: SettingsVM; patch: PatchFn }): React.JSX.Element {
  const t = useT();
  // The slider moves a local draft and saves once it is let go.
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const volume = draftVolume ?? settings.soundVolume;
  const commitVolume = (): void => {
    if (draftVolume !== null && draftVolume !== settings.soundVolume) patch({ soundVolume: draftVolume });
  };
  return (
    <div className="mt-2 border-t border-line pt-2" data-role="sound-settings">
      <div className="cap text-ink-low">{t('behavior.sounds')}</div>
      <ToneRow
        label={t('behavior.messageTone')}
        hint={t('behavior.messageToneHint')}
        role="message-tone"
        tone={settings.soundTone}
        volume={volume}
        onChange={(next) => patch({ soundTone: next })}
      />
      <Toggle
        label={t('behavior.subscriberSound')}
        hint={t('behavior.subscriberSoundHint')}
        on={settings.subscriberSoundEnabled}
        onChange={(v) => patch({ subscriberSoundEnabled: v })}
      />
      <ToneRow
        label={t('behavior.subscriberTone')}
        hint={t('behavior.subscriberToneHint')}
        role="subscriber-tone"
        tone={settings.subscriberSoundTone}
        volume={volume}
        onChange={(next) => patch({ subscriberSoundTone: next })}
      />
      <OptionRow label={t('behavior.soundVolume')} hint={t('behavior.soundVolumeHint')}>
        <input
          type="range"
          aria-label={t('behavior.soundVolume')}
          data-role="sound-volume"
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          step={SOUND_VOLUME_STEP}
          value={volume}
          onChange={(event) => setDraftVolume(Number(event.currentTarget.value))}
          onPointerUp={commitVolume}
          onKeyUp={commitVolume}
          onBlur={commitVolume}
          className="w-[140px] cursor-pointer accent-clay"
        />
        <span className="num w-[38px] text-right text-[11.5px] text-ink-low">{`${volume}%`}</span>
      </OptionRow>
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
  const patchUnread = (next: Partial<SettingsVM['unreadReconcile']>): void => {
    patch({ unreadReconcile: { ...settings.unreadReconcile, ...next } });
  };

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

      <SoundSettings settings={settings} patch={patch} />

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
        <div className="border-t border-line pt-2">
          <Toggle
            label={t('behavior.unreadReconcile')}
            hint={t('behavior.unreadReconcileHint')}
            on={settings.unreadReconcile.enabled}
            onChange={(v) => patchUnread({ enabled: v })}
          />
          <div className="grid grid-cols-2 gap-x-8">
            <Toggle
              label={t('behavior.unreadReconcileUnreadTab')}
              hint={t('behavior.unreadReconcileUnreadTabHint')}
              on={settings.unreadReconcile.triggerOnUnreadTabOpen}
              onChange={(v) => patchUnread({ triggerOnUnreadTabOpen: v })}
            />
            <Toggle
              label={t('behavior.unreadReconcileWindowFocus')}
              hint={t('behavior.unreadReconcileWindowFocusHint')}
              on={settings.unreadReconcile.triggerOnWindowFocus}
              onChange={(v) => patchUnread({ triggerOnWindowFocus: v })}
            />
            <Toggle
              label={t('behavior.unreadReconcileAccountFocus')}
              hint={t('behavior.unreadReconcileAccountFocusHint')}
              on={settings.unreadReconcile.triggerOnAccountFocus}
              onChange={(v) => patchUnread({ triggerOnAccountFocus: v })}
            />
            <Toggle
              label={t('behavior.unreadReconcileHidden')}
              hint={t('behavior.unreadReconcileHiddenHint')}
              on={settings.unreadReconcile.hiddenEnabled}
              onChange={(v) => patchUnread({ hiddenEnabled: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            <NumberRow
              label={t('behavior.unreadReconcileDebounce')}
              hint={t('behavior.unreadReconcileDebounceHint')}
              value={Math.round(settings.unreadReconcile.focusDebounceMs / 1000)}
              min={0}
              max={600}
              step={5}
              suffix={t('behavior.seconds')}
              onChange={(v) => patchUnread({ focusDebounceMs: Math.round(v * 1000) })}
            />
            <NumberRow
              label={t('behavior.unreadReconcileImmediatePages')}
              hint={t('behavior.unreadReconcileImmediatePagesHint')}
              value={settings.unreadReconcile.immediateMaxPages}
              min={1}
              max={50}
              step={1}
              onChange={(v) => patchUnread({ immediateMaxPages: Math.round(v) })}
            />
            <NumberRow
              label={t('behavior.unreadReconcileFocusedInterval')}
              hint={t('behavior.unreadReconcileFocusedIntervalHint')}
              value={Math.round(settings.unreadReconcile.focusedIntervalMs / 1000)}
              min={30}
              max={3600}
              step={30}
              suffix={t('behavior.seconds')}
              onChange={(v) => patchUnread({ focusedIntervalMs: Math.round(v * 1000) })}
            />
            <NumberRow
              label={t('behavior.unreadReconcileFocusedPages')}
              hint={t('behavior.unreadReconcileFocusedPagesHint')}
              value={settings.unreadReconcile.focusedMaxPages}
              min={1}
              max={50}
              step={1}
              onChange={(v) => patchUnread({ focusedMaxPages: Math.round(v) })}
            />
            <NumberRow
              label={t('behavior.unreadReconcileHiddenInterval')}
              hint={t('behavior.unreadReconcileHiddenIntervalHint')}
              value={Math.round(settings.unreadReconcile.hiddenIntervalMs / 1000)}
              min={60}
              max={21_600}
              step={60}
              suffix={t('behavior.seconds')}
              onChange={(v) => patchUnread({ hiddenIntervalMs: Math.round(v * 1000) })}
            />
            <NumberRow
              label={t('behavior.unreadReconcileHiddenPages')}
              hint={t('behavior.unreadReconcileHiddenPagesHint')}
              value={settings.unreadReconcile.hiddenMaxPages}
              min={1}
              max={50}
              step={1}
              onChange={(v) => patchUnread({ hiddenMaxPages: Math.round(v) })}
            />
          </div>
        </div>
        {(settings.debugMode
          || settings.hubModeOverride !== 'auto'
          || settings.spendSweepRollbackToLegacy) && (
          <>
            <OptionRow
              label={t('behavior.hubModeOverride')}
              hint={t('behavior.hubModeOverrideHint')}
            >
              {(['auto', 'polling', 'hub'] as const).map((mode) => (
                <Chip
                  key={mode}
                  selected={settings.hubModeOverride === mode}
                  onClick={() => patch({ hubModeOverride: mode })}
                >
                  {t(`behavior.hubModeOverride.${mode}`)}
                </Chip>
              ))}
            </OptionRow>
            {settings.hubModeOverride !== 'auto' && (
              <p className="pb-1 text-[11.5px] text-warn">
                {settings.hubModeOverride === 'polling'
                  ? t('behavior.hubModeOverridePollingWarn')
                  : t('behavior.hubModeOverrideHubWarn')}
              </p>
            )}
            <Toggle
              label={t('behavior.spendSweepRollback')}
              hint={t('behavior.spendSweepRollbackHint')}
              on={settings.spendSweepRollbackToLegacy}
              onChange={(v) => patch({ spendSweepRollbackToLegacy: v })}
            />
          </>
        )}
      </div>
    </Section>
  );
}
