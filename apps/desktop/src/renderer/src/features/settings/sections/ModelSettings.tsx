// Per-feature model/effort + context sizes. Each feature row carries its real
// trailing-7-day cost (query:ai.featureCosts) so the model choice is visible
// in dollars; context fields show their valid range and a rough token figure.
// Feature names are product terms (hotkeys/buttons) — not localized.

import type { ModelSelectableFeature, ReasoningEffort } from '@chatgoose/shared/types';
import {
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
} from '@chatgoose/shared/constants';
import { formatCompactTokens } from '@chatgoose/shared/llm/cost';
import { pluralWord, type UiTranslator, type UiLocale } from '@chatgoose/shared/i18n/index';
import type { AiFeatureCostsVM, SettingsVM } from '../../../../../preload/contract';
import { useAiFeatureCosts } from '../../../bridge/queries';
import { useLocale, useT } from '../../../lib/i18n';
import { Button } from '../../../design/Button';
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

/** Display-only rough figure for the context token hints (≈25 tok/message). */
const APPROX_TOKENS_PER_MESSAGE = 25;

const selectClass =
  'rounded-chip border border-line bg-bg1 px-2 py-1.5 text-[12.5px] outline-none focus:border-clay-line cursor-pointer';

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

function costHint(
  t: UiTranslator,
  locale: UiLocale,
  costs: AiFeatureCostsVM | undefined,
  feature: ModelSelectableFeature,
): string {
  const entry = costs?.byFeature[feature];
  if (entry === undefined || entry.runs === 0) {
    return t('models.noRuns');
  }
  const avg = entry.usd / entry.runs;
  return t('models.costHint', {
    runs: entry.runs,
    word: pluralWord(locale, entry.runs, ['run', 'runs'], ['запуск', 'запуска', 'запусков']),
    avg: avg < 0.005 ? '<$0.01' : `$${avg.toFixed(2)}`,
  });
}

export function ModelSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const costs = useAiFeatureCosts(true);

  return (
    <>
      <Section title={t('models.title')} hint={t('models.hint')}>
        <div className="space-y-1.5">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-3 py-1">
              <div className="w-44 flex-none">
                <div className="text-[13px] font-semibold">{FEATURE_LABELS[feature]}</div>
                <div className="num text-[10.5px] text-ink-low">
                  {costHint(t, locale, costs.data, feature)}
                </div>
              </div>
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
                title={t('models.effortTitle')}
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
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              patch({
                featureModels: { ...DEFAULT_FEATURE_MODELS },
                featureReasoning: { ...DEFAULT_FEATURE_REASONING },
              })
            }
          >
            {t('models.reset')}
          </Button>
        </div>
      </Section>
      <Section title={t('context.title')} hint={t('context.hint')}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          {MESSAGE_COUNT_FIELDS.map((field) => (
            <div key={field.key} className="py-1">
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink-mid">{t(field.labelKey)}</span>
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
              <div className="num mt-0.5 text-right text-[10px] text-ink-low">
                {field.min}–{field.max} ·{' '}
                {t('context.tokens', {
                  n: formatCompactTokens(settings[field.key] * APPROX_TOKENS_PER_MESSAGE),
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
