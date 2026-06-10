// Modal-free settings surface (own view next to the rail). P1 scope: keys,
// per-feature model/reasoning, message counts, personalities CRUD + account
// mapping, behavior toggles, debug, purge (PRD F9).

import { useState } from 'react';
import type { ModelSelectableFeature, ReasoningEffort } from '@chatgoose/shared/types';
import {
  DEEP_MAX_MESSAGE_COUNT,
  DEEP_MIN_MESSAGE_COUNT,
  IMPROVE_MAX_MESSAGE_COUNT,
  IMPROVE_MIN_MESSAGE_COUNT,
  PING_MAX_MESSAGE_COUNT,
  PING_MIN_MESSAGE_COUNT,
  QUICK_MAX_MESSAGE_COUNT,
  QUICK_MIN_MESSAGE_COUNT,
} from '@chatgoose/shared/constants';
import { MODEL_GROUPS } from '@chatgoose/shared/llm/model-registry';
import type { SettingsPatch, SettingsVM } from '../../../../preload/contract';
import { useSettings, useUpdateSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { Skeleton } from '../../design/Skeleton';
import { Kbd } from '../../design/Kbd';
import { KeySettings } from './sections/KeySettings';
import { ModelSettings } from './sections/ModelSettings';
import { PersonalitySettings } from './sections/PersonalitySettings';
import { BehaviorSettings } from './sections/BehaviorSettings';
import { DangerZone } from './sections/DangerZone';

export type Feature = ModelSelectableFeature;
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['off', 'low', 'medium', 'high', 'max'];
export { MODEL_GROUPS };

export const MESSAGE_COUNT_FIELDS: ReadonlyArray<{
  key: 'quickMessageCount' | 'pingMessageCount' | 'improveMessageCount' | 'deepMessageCount';
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'quickMessageCount', label: 'Quick features (Reply / Help)', min: QUICK_MIN_MESSAGE_COUNT, max: QUICK_MAX_MESSAGE_COUNT },
  { key: 'pingMessageCount', label: 'Ping', min: PING_MIN_MESSAGE_COUNT, max: PING_MAX_MESSAGE_COUNT },
  { key: 'improveMessageCount', label: 'Improve draft', min: IMPROVE_MIN_MESSAGE_COUNT, max: IMPROVE_MAX_MESSAGE_COUNT },
  { key: 'deepMessageCount', label: 'Deep features (Scan / Review)', min: DEEP_MIN_MESSAGE_COUNT, max: DEEP_MAX_MESSAGE_COUNT },
];

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-card border border-line bg-bg1 p-4 shadow-soft">
      <h2 className="font-serif text-[15px] font-semibold">{title}</h2>
      {hint !== undefined && <p className="mt-0.5 text-[12px] text-ink-low">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingsSurface(): React.JSX.Element {
  const setView = useUiStore((s) => s.setView);
  const settings = useSettings();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg0">
      <div className="mx-auto max-w-[860px] px-8 py-6 pb-16">
        <div className="mb-5 flex items-baseline gap-4">
          <h1 className="font-serif text-[22px] font-semibold">Settings</h1>
          <button
            type="button"
            onClick={() => setView('workspace')}
            className="cursor-pointer text-[12.5px] font-medium text-ink-low hover:text-ink-mid"
          >
            ← back to workspace <Kbd>esc</Kbd>
          </button>
        </div>
        {settings.data === undefined ? (
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <SettingsBody settings={settings.data} />
        )}
      </div>
    </div>
  );
}

function SettingsBody({ settings }: { settings: SettingsVM }): React.JSX.Element {
  const update = useUpdateSettings();
  const [savedFlash, setSavedFlash] = useState(false);

  function patch(p: SettingsPatch): void {
    update.mutate(p, {
      onSuccess: () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1_200);
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="num h-4 text-right text-micro tracking-[0.08em] text-green">
        {savedFlash ? 'SAVED' : ''}
      </div>
      <KeySettings settings={settings} patch={patch} />
      <ModelSettings settings={settings} patch={patch} />
      <PersonalitySettings />
      <BehaviorSettings settings={settings} patch={patch} />
      <DangerZone />
    </div>
  );
}

export type PatchFn = (p: SettingsPatch) => void;
