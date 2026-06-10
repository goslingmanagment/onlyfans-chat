// Fan context panel (collapsible ']'): Info / Scan tabs, money chips, churn
// badge, data-age honesty (PRD F5 read-only scope).

import type { FanPanelVM } from '../../../../preload/contract';
import { useFan } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { Avatar } from '../../design/Avatar';
import { Badge } from '../../design/Badge';
import { DataAge } from '../../design/DataAge';
import { EmptyState } from '../../design/EmptyState';
import { Skeleton } from '../../design/Skeleton';
import { cx } from '../../lib/cx';
import { formatDollars } from '../../lib/money';
import { formatLastSeen, isOnline } from '../../lib/time';

export function FanPanel(): React.JSX.Element {
  const accountId = useUiStore((s) => s.selectedAccountId);
  const chatId = useUiStore((s) => s.selectedChatId);
  const tab = useUiStore((s) => s.fanPanelTab);
  const setTab = useUiStore((s) => s.setFanPanelTab);

  const fan = useFan(accountId, chatId);

  return (
    <aside className="flex min-h-0 w-[328px] flex-none flex-col border-l border-line bg-bg1">
      <div className="flex flex-none border-b border-line px-1.5">
        {(['info', 'scan'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              'flex-1 cursor-pointer border-b-2 pt-3 pb-[10px] text-center text-[12.5px] font-semibold',
              tab === t ? 'border-clay text-ink' : 'border-transparent text-ink-low hover:text-ink-mid',
            )}
          >
            {t === 'info' ? 'Info' : 'Scan'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chatId === null ? (
          <EmptyState title="No fan selected" hint="Pick a conversation to see fan context." />
        ) : fan.isPending ? (
          <PanelSkeleton />
        ) : fan.data == null ? (
          <EmptyState title="No fan data yet" hint="Fan details load with the next sync." />
        ) : tab === 'info' ? (
          <InfoTab fan={fan.data} fetchedAt={fan.dataUpdatedAt} />
        ) : (
          <ScanTab fan={fan.data} />
        )}
      </div>
    </aside>
  );
}

function PanelSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-[13px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="h-28" />
    </div>
  );
}

function Stat({ cap, value, money = false }: { cap: string; value: string; money?: boolean }): React.JSX.Element {
  return (
    <div
      className={cx(
        'rounded-chip border px-[11px] py-[9px]',
        money ? 'border-green-line bg-green-bg' : 'border-line bg-bg2',
      )}
    >
      <span className="cap text-ink-low">{cap}</span>
      <span className={cx('num mt-[2px] block text-[16px] font-semibold', money && 'text-green')}>
        {value}
      </span>
    </div>
  );
}

function InfoTab({ fan, fetchedAt }: { fan: FanPanelVM; fetchedAt: number }): React.JSX.Element {
  const now = new Date();
  const sub = fan.subscription;
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={fan.name} url={fan.avatarUrl} online={isOnline(fan.lastSeen, now)} size={48} radius={13} />
        <div className="min-w-0">
          <div className="truncate font-serif text-[17px] font-semibold">{fan.name}</div>
          <div className="num text-micro text-ink-low">@{fan.username}</div>
          {fan.customName !== null && (
            <div className="mt-[2px] text-[11.5px] text-ink-mid">
              custom name:{' '}
              <span className="border-b border-dashed border-line-strong">{fan.customName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 text-[12px] text-ink-low">{formatLastSeen(fan.lastSeen, now)}</div>

      {fan.spending !== null ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Stat cap="lifetime" value={formatDollars(fan.spending.total)} money />
          <Stat cap="tips" value={formatDollars(fan.spending.tips)} />
          <Stat cap="messages·ppv" value={formatDollars(fan.spending.messages)} />
          <Stat cap="subs" value={formatDollars(fan.spending.subscriptions)} />
        </div>
      ) : (
        <div className="mt-3.5 rounded-chip border border-line bg-bg2 px-3 py-2.5 text-[12px] text-ink-low">
          No spending data yet.
        </div>
      )}

      {sub !== null && (
        <div className="mt-3 rounded-chip border border-line bg-bg1 px-3 py-[11px]">
          <div className="mb-2 flex items-center gap-2">
            <span className="cap text-ink-low">Subscription</span>
            {sub.autoRenewOff && (
              <Badge tone="bad" title="Auto-renew is off — churn risk">
                CHURN RISK
              </Badge>
            )}
          </div>
          <KV
            label="Status"
            value={
              sub.status === 'active'
                ? `Active${sub.priceUsd !== null && sub.priceUsd > 0 ? ` · ${formatDollars(sub.priceUsd)}/mo` : ' · free'}`
                : sub.status === 'expired'
                  ? 'Expired'
                  : 'None'
            }
            ok={sub.status === 'active'}
          />
          {sub.renewsAt !== null && (
            <KV label="Renews" value={new Date(sub.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
          )}
          <KV
            label="Auto-renew"
            value={sub.autoRenewOff ? 'OFF' : 'ON'}
            ok={!sub.autoRenewOff}
            risk={sub.autoRenewOff}
          />
          {sub.durationLabel !== null && <KV label="Duration" value={sub.durationLabel} />}
        </div>
      )}

      {fan.about !== null && (
        <div className="mt-3 rounded-chip border border-line bg-bg1 px-3 py-[11px]">
          <div className="cap mb-1.5 text-ink-low">About</div>
          <p className="text-[12.5px] leading-[1.6] text-ink-mid">{fan.about}</p>
        </div>
      )}

      <div className="mt-3 text-right">
        <DataAge at={fetchedAt} />
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  ok = false,
  risk = false,
}: {
  label: string;
  value: string;
  ok?: boolean;
  risk?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex justify-between py-[3px] text-[12.5px] text-ink-mid">
      <span>{label}</span>
      <b className={cx('font-semibold', risk ? 'text-bad' : ok ? 'text-green' : 'text-ink')}>{value}</b>
    </div>
  );
}

function ScanTab({ fan }: { fan: FanPanelVM }): React.JSX.Element {
  if (fan.summary === null) {
    return (
      <EmptyState
        glyph="◎"
        title="No scan yet"
        hint="Deep fan scans arrive in P4 — the AI dossier will live here."
      />
    );
  }
  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <span className="cap text-ink-low">Scan</span>
        <DataAge at={fan.summary.generatedAt} prefix="GENERATED" />
        <span className="num ml-auto text-micro text-ink-low">{fan.summary.modelLabel}</span>
      </div>
      {/* AI-authored text always renders in serif (DESIGN §4) */}
      <p className="mt-2 font-serif text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-mid select-text">
        {fan.summary.body}
      </p>
    </div>
  );
}
