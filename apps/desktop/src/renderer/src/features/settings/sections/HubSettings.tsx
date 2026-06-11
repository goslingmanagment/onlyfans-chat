// Agency Hub connection (SPEC §6.2/§9): core base URL + chatter API key feed
// the real-time SSE stream. Quiet section — most chatters never touch it.

import { useState } from 'react';
import type { SettingsVM } from '../../../../../preload/contract';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Section, type PatchFn } from '../SettingsSurface';

export function HubSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings.hubBaseUrl ?? '');
  const [key, setKey] = useState('');

  const configured = settings.hubBaseUrl !== null && settings.hasHubKey;

  function save(): void {
    // One patch for both fields: key writes go to the keychain and publish no
    // settings-table change, so the base URL ALWAYS rides along — that table
    // write is what tells main to (re)connect the hub stream.
    const trimmedUrl = baseUrl.trim();
    const trimmedKey = key.trim();
    patch({
      hubBaseUrl: trimmedUrl === '' ? null : trimmedUrl,
      ...(trimmedKey !== '' ? { hubApiKey: trimmedKey } : {}),
    });
    setKey('');
  }

  return (
    <Section
      title="Agency Hub"
      hint="Real-time message events stream from the hub when both fields are set; the app falls back to polling automatically when the stream drops."
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3 py-1">
          <div className="w-44 flex-none">
            <div className="text-[13px] font-semibold">Hub base URL</div>
            <div className="text-[11px] text-ink-low">your agency's core server</div>
          </div>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://hub.example.com"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
          />
        </div>
        <div className="flex items-center gap-3 py-1">
          <div className="w-44 flex-none">
            <div className="text-[13px] font-semibold">Chatter API key</div>
            <div className="text-[11px] text-ink-low">agency_hub_core_… — set-only</div>
          </div>
          <Badge tone={settings.hasHubKey ? 'green' : 'neutral'}>
            {settings.hasHubKey ? 'configured' : 'not set'}
          </Badge>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={settings.hasHubKey ? 'Replace key…' : 'Paste key…'}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line"
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-[11px] text-ink-low">
            {configured
              ? 'Hub connection configured — live events active when the stream is healthy.'
              : 'Not connected — the app runs on polling alone.'}
          </span>
          <Button size="sm" className="ml-auto" onClick={save}>
            Save hub settings
          </Button>
        </div>
      </div>
    </Section>
  );
}
