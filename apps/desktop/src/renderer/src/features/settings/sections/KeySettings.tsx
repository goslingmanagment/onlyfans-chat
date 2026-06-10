import { useState } from 'react';
import type { SettingsVM } from '../../../../../preload/contract';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Section, type PatchFn } from '../SettingsSurface';

function KeyRow({
  label,
  hint,
  configured,
  onSave,
}: {
  label: string;
  hint: string;
  configured: boolean;
  onSave: (value: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-44 flex-none">
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="text-[11px] text-ink-low">{hint}</div>
      </div>
      <Badge tone={configured ? 'green' : 'neutral'}>{configured ? 'configured' : 'not set'}</Badge>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={configured ? 'Replace key…' : 'Paste key…'}
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
        }}
      >
        Save
      </Button>
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
  return (
    <Section
      title="API keys"
      hint="Stored in the OS keychain by the main process — set-only, never displayed."
    >
      <div className="divide-y divide-line">
        <KeyRow
          label="OFAPI key"
          hint="per-chatter scoped key"
          configured={settings.hasOfapiKey}
          onSave={(v) => patch({ ofapiKey: v })}
        />
        <KeyRow
          label="Anthropic key"
          hint="direct AI provider"
          configured={settings.hasAnthropicKey}
          onSave={(v) => patch({ anthropicKey: v })}
        />
        <KeyRow
          label="OpenRouter key"
          hint="alternate AI provider"
          configured={settings.hasOpenRouterKey}
          onSave={(v) => patch({ openRouterKey: v })}
        />
      </div>
    </Section>
  );
}
