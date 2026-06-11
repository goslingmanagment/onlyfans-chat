// Agency Hub connection (SPEC §6.2/§9): core base URL + chatter API key feed
// the real-time SSE stream plus summary sync / usage reporting. Quiet section —
// most chatters never touch it. Page-label overrides: main auto-matches OFAPI
// accounts to hub pages by username (SPEC §8.5); the inputs here override that
// per account. The renderer never sees the hub page list (network stays in
// main), so the auto-match result is not previewed — overrides only, honest.

import { useState } from 'react';
import type { SettingsVM, SyncStatusVM } from '../../../../../preload/contract';
import { useAccounts, useSyncStatus } from '../../../bridge/queries';
import { Badge } from '../../../design/Badge';
import { Button } from '../../../design/Button';
import { Section, type PatchFn } from '../SettingsSurface';

type HubState = SyncStatusVM['hub'];

const HUB_STATUS: Record<Exclude<HubState, 'off'>, { label: string; tone: 'green' | 'amber' | 'bad' }> = {
  connecting: { label: 'connecting…', tone: 'amber' },
  live: { label: 'live', tone: 'green' },
  degraded: { label: 'degraded — polling covers', tone: 'amber' },
  'auth-failed': { label: 'auth failed', tone: 'bad' },
  stopped: { label: 'stopped', tone: 'amber' },
};

export function HubSettings({
  settings,
  patch,
}: {
  settings: SettingsVM;
  patch: PatchFn;
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings.hubBaseUrl ?? '');
  const [key, setKey] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>(settings.accountPageLabels);
  const accounts = useAccounts();
  const syncStatus = useSyncStatus();

  const configured = settings.hubBaseUrl !== null && settings.hasHubKey;
  const hub: HubState = syncStatus.data?.hub ?? 'off';

  function save(): void {
    // One patch for everything: key writes go to the keychain and publish no
    // settings-table change, so the base URL ALWAYS rides along — that table
    // write (plus the IPC hub-config hook) tells main to (re)connect.
    const trimmedUrl = baseUrl.trim();
    const trimmedKey = key.trim();
    const cleanedLabels = Object.fromEntries(
      Object.entries(labels)
        .map(([accountId, label]) => [accountId, label.trim()] as const)
        .filter(([, label]) => label !== ''),
    );
    patch({
      hubBaseUrl: trimmedUrl === '' ? null : trimmedUrl,
      accountPageLabels: cleanedLabels,
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

        {hub !== 'off' && (
          <div className="flex items-center gap-3 py-1">
            <div className="w-44 flex-none text-[13px] font-semibold">Stream status</div>
            <Badge tone={HUB_STATUS[hub].tone}>{HUB_STATUS[hub].label}</Badge>
          </div>
        )}
        {hub === 'auth-failed' && (
          <p className="text-[12px] text-bad">
            CG-HUB-01 — the hub rejected the chatter key. Chatter keys are
            one-active-per-chatter and revocable: paste a fresh key (hub
            Settings → Users) and save.
          </p>
        )}

        {configured && accounts.data !== undefined && accounts.data.length > 0 && (
          <div className="space-y-1 pt-2">
            <div className="text-[13px] font-semibold">Hub page labels</div>
            <p className="text-[11px] text-ink-low">
              Each account auto-matches a hub page by its username. Set a label
              only when that match misses; leave empty for auto.
            </p>
            {accounts.data.map((account) => (
              <div key={account.id} className="flex items-center gap-3 py-0.5">
                <div className="w-44 flex-none truncate text-[12.5px] text-ink-mid">
                  @{account.username}
                </div>
                <input
                  type="text"
                  value={labels[account.id] ?? ''}
                  onChange={(e) =>
                    setLabels((prev) => ({ ...prev, [account.id]: e.target.value }))
                  }
                  placeholder="auto (match by username)"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-chip border border-line bg-bg1 px-3 py-1 text-[12.5px] outline-none placeholder:text-ink-low focus:border-clay-line"
                />
              </div>
            ))}
          </div>
        )}

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
