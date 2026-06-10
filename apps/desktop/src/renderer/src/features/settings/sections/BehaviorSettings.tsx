import type { SettingsVM } from '../../../../../preload/contract';
import { cx } from '../../../lib/cx';
import { Section, type PatchFn } from '../SettingsSurface';

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

export function BehaviorSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  return (
    <Section title="Behavior">
      <div className="grid grid-cols-2 gap-x-8">
        <Toggle
          label="Notifications"
          hint="Toast on incoming messages"
          on={settings.notificationsEnabled}
          onChange={(v) => patch({ notificationsEnabled: v })}
        />
        <Toggle
          label="Sound"
          hint="Blip with each notification"
          on={settings.soundEnabled}
          onChange={(v) => patch({ soundEnabled: v })}
        />
        <Toggle
          label="Mark as read on open"
          hint="Activates in P3 — read-only keys until then"
          on={settings.markAsReadOnOpen}
          onChange={(v) => patch({ markAsReadOnOpen: v })}
        />
        <Toggle
          label="Prompt caching"
          hint="Reuse prompt prefixes to cut LLM cost"
          on={settings.promptCachingEnabled}
          onChange={(v) => patch({ promptCachingEnabled: v })}
        />
        <Toggle
          label="Debug mode"
          hint="Raw payloads, prompt snapshots, profiling"
          on={settings.debugMode}
          onChange={(v) => patch({ debugMode: v })}
        />
      </div>
    </Section>
  );
}
