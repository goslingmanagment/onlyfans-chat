import type { ModelSelectableFeature, ReasoningEffort } from '@chatgoose/shared/types';
import type { SettingsVM } from '../../../../../preload/contract';
import { MODEL_GROUPS, MESSAGE_COUNT_FIELDS, REASONING_EFFORTS, Section, type PatchFn } from '../SettingsSurface';

const FEATURE_LABELS: Record<ModelSelectableFeature, string> = {
  'fast-reply': 'Fast Reply',
  'help-me': 'Help Me',
  'fan-summary': 'Scan (fan summary)',
  'chat-review': 'Chat Review',
  ping: 'Ping',
};

const FEATURES: readonly ModelSelectableFeature[] = [
  'fast-reply',
  'help-me',
  'fan-summary',
  'chat-review',
  'ping',
];

const selectClass =
  'rounded-chip border border-line bg-bg1 px-2 py-1.5 text-[12.5px] outline-none focus:border-clay-line cursor-pointer';

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

export function ModelSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  return (
    <>
      <Section title="Models" hint="Per-feature model and reasoning effort.">
        <div className="space-y-1.5">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-3 py-1">
              <div className="w-44 flex-none text-[13px] font-semibold">{FEATURE_LABELS[feature]}</div>
              <select
                value={settings.featureModels[feature]}
                onChange={(e) =>
                  patch({ featureModels: { ...settings.featureModels, [feature]: e.target.value } })
                }
                className={`${selectClass} min-w-0 flex-1`}
              >
                {MODEL_GROUPS.map((group) => (
                  <optgroup key={group.provider} label={group.label}>
                    {group.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label} — {model.description}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value={settings.featureReasoning[feature]}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isReasoningEffort(v)) {
                    patch({ featureReasoning: { ...settings.featureReasoning, [feature]: v } });
                  }
                }}
                className={selectClass}
                title="Reasoning effort"
              >
                {REASONING_EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Context size" hint="How many messages each feature reads (legacy ranges).">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          {MESSAGE_COUNT_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center justify-between gap-3 py-1 text-[13px]">
              <span className="text-ink-mid">{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={settings[field.key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) {
                    patch({ [field.key]: Math.max(field.min, Math.min(field.max, Math.round(n))) });
                  }
                }}
                className="num w-24 rounded-chip border border-line bg-bg1 px-2 py-1 text-right text-[13px] outline-none focus:border-clay-line"
              />
            </label>
          ))}
        </div>
      </Section>
    </>
  );
}
