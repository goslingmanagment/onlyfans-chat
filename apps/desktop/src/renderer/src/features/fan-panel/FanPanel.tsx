// Fan context panel (collapsible ']'): Info / Scan tabs, money chips, churn
// badge, data-age honesty (PRD F5 read-only scope). The Scan tab is the home
// of the AI fan dossier (F6.4, "Scan" = fan-summary): Russian body in serif,
// generated-at + model, refresh (forceRegenerate), quiet stale hint.

import { useEffect, useRef, useState } from 'react';
import type { FanPanelVM } from '../../../../preload/contract';
import { useAccounts, useFan, useMessages, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { startAiFeature, useAiStore } from '../ai/aiStore';
import { evaluateAiGate } from '../ai/dockLogic';
import { gateText } from '../ai/gateText';
import { isScanStale, splitSummaryParagraphs } from './scanLogic';
import { Avatar } from '../../design/Avatar';
import { Badge } from '../../design/Badge';
import { DataAge } from '../../design/DataAge';
import { EmptyState } from '../../design/EmptyState';
import { Kbd } from '../../design/Kbd';
import { Skeleton } from '../../design/Skeleton';
import { cx } from '../../lib/cx';
import { useT, useLocale } from '../../lib/i18n';
import { modCombo } from '../../lib/modKey';
import { formatDollars } from '../../lib/money';
import { formatLastSeen, isOnline } from '../../lib/time';

const SCAN_FLASH_MS = 1600;

/** True after a Scan completion bumped the flash signal — briefly highlights the tab. */
function useScanFlash(): boolean {
  const seq = useAiStore((s) => s.scanFlashSeq);
  const seenSeq = useRef(seq);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (seq === seenSeq.current) return;
    seenSeq.current = seq;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), SCAN_FLASH_MS);
    return () => clearTimeout(timer);
  }, [seq]);
  return flashing;
}

export function FanPanel(): React.JSX.Element {
  const t = useT();
  const accountId = useUiStore((s) => s.selectedAccountId);
  const chatId = useUiStore((s) => s.selectedChatId);
  const tab = useUiStore((s) => s.fanPanelTab);
  const setTab = useUiStore((s) => s.setFanPanelTab);
  const scanFlashing = useScanFlash();

  const fan = useFan(accountId, chatId);

  return (
    <aside className="flex min-h-0 w-[328px] flex-none flex-col border-l border-line bg-bg1">
      <div className="flex flex-none border-b border-line px-1.5">
        {(['info', 'scan'] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={cx(
              'flex-1 cursor-pointer border-b-2 pt-3 pb-[10px] text-center text-[12.5px] font-semibold',
              tab === tabId ? 'border-clay text-ink' : 'border-transparent text-ink-low hover:text-ink-mid',
              tabId === 'scan' && scanFlashing && 'animate-pulse border-clay text-clay-deep',
            )}
          >
            {tabId === 'info' ? t('fan.tabInfo') : 'Scan'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chatId === null ? (
          <EmptyState title={t('fan.noneSelectedTitle')} hint={t('fan.noneSelectedHint')} />
        ) : fan.isPending ? (
          <PanelSkeleton />
        ) : fan.data == null ? (
          <EmptyState title={t('fan.noDataTitle')} hint={t('fan.noDataHint')} />
        ) : tab === 'info' ? (
          <InfoTab fan={fan.data} fetchedAt={fan.dataUpdatedAt} />
        ) : (
          <ScanTab accountId={accountId} chatId={chatId} fan={fan.data} />
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
  const t = useT();
  const locale = useLocale();
  const now = new Date();
  const sub = fan.subscription;
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={fan.name} url={fan.avatarUrl} online={isOnline(fan.lastSeen, now)} size={48} radius={13} />
        <div className="min-w-0">
          <div className="truncate font-serif text-[17px] font-semibold">{fan.name}</div>
          <div className="num truncate text-micro text-ink-low">@{fan.username}</div>
          {fan.customName !== null && (
            <div className="mt-[2px] truncate text-[11.5px] text-ink-mid">
              {t('fan.customName')}{' '}
              <span className="border-b border-dashed border-line-strong">{fan.customName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 text-[12px] text-ink-low">{formatLastSeen(fan.lastSeen, now, t)}</div>

      {fan.spending !== null ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Stat cap={t('fan.statLifetime')} value={formatDollars(fan.spending.total)} money />
          <Stat cap={t('fan.statTips')} value={formatDollars(fan.spending.tips)} />
          <Stat cap={t('fan.statMessagesPpv')} value={formatDollars(fan.spending.messages)} />
          <Stat cap={t('fan.statSubs')} value={formatDollars(fan.spending.subscriptions)} />
        </div>
      ) : (
        <div className="mt-3.5 rounded-chip border border-line bg-bg2 px-3 py-2.5 text-[12px] text-ink-low">
          {t('fan.noSpending')}
        </div>
      )}

      {sub !== null && (
        <div className="mt-3 rounded-chip border border-line bg-bg1 px-3 py-[11px]">
          <div className="mb-2 flex items-center gap-2">
            <span className="cap text-ink-low">{t('fan.subscription')}</span>
            {sub.autoRenewOff && (
              <Badge tone="bad" title={t('fan.churnRiskTip')}>
                {t('fan.churnRiskBadge')}
              </Badge>
            )}
          </div>
          <KV
            label={t('fan.kvStatus')}
            value={
              sub.status === 'active'
                ? `${t('fan.subActive')}${sub.priceUsd !== null && sub.priceUsd > 0 ? ` · ${t('fan.subPerMonth', { price: formatDollars(sub.priceUsd) })}` : ` · ${t('fan.subFree')}`}`
                : sub.status === 'expired'
                  ? t('fan.subExpired')
                  : t('fan.subNone')
            }
            ok={sub.status === 'active'}
          />
          {sub.renewsAt !== null && (
            <KV
              label={t('fan.kvRenews')}
              value={new Date(sub.renewsAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })}
            />
          )}
          <KV
            label={t('fan.kvAutoRenew')}
            value={sub.autoRenewOff ? 'OFF' : 'ON'}
            ok={!sub.autoRenewOff}
            risk={sub.autoRenewOff}
          />
          {sub.durationLabel !== null && <KV label={t('fan.kvDuration')} value={sub.durationLabel} />}
        </div>
      )}

      {fan.about !== null && (
        <div className="mt-3 rounded-chip border border-line bg-bg1 px-3 py-[11px]">
          <div className="cap mb-1.5 text-ink-low">{t('fan.about')}</div>
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

function ScanTab({
  accountId,
  chatId,
  fan,
}: {
  accountId: string | null;
  chatId: string;
  fan: FanPanelVM;
}): React.JSX.Element {
  const t = useT();
  const accounts = useAccounts();
  const settings = useSettings();
  const scanRunning = useAiStore(
    (s) => s.op?.feature === 'fan-summary' && s.status === 'running',
  );
  // shares the conversation's message cache — newest message drives the stale hint
  const messages = useMessages(accountId, chatId);
  const newestMessageAt = messages.data?.pages[0]?.items.at(-1)?.createdAt ?? null;

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const gate =
    account !== null && settings.data !== undefined
      ? evaluateAiGate({
          mapped: account.personalityId !== null,
          hasLlmKey: settings.data.hasAnthropicKey || settings.data.hasOpenRouterKey,
        })
      : null;
  const blockedReason = gate === null ? t('common.loading') : gate.ok ? null : gateText(t, gate.reason);
  const runnable = blockedReason === null && !scanRunning && accountId !== null;

  function runScan(forceRegenerate: boolean): void {
    if (!runnable || accountId === null || settings.data === undefined) return;
    startAiFeature(
      'fan-summary',
      { accountId, chatId, defaultTone: settings.data.defaultReplyTone },
      forceRegenerate ? { forceRegenerate: true } : {},
    );
  }

  if (fan.summary === null) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          glyph="◎"
          title={scanRunning ? t('fan.scanningTitle') : t('fan.noScanTitle')}
          hint={
            scanRunning ? (
              t('fan.scanGenerating')
            ) : (
              <span className="flex flex-col items-center gap-2.5">
                {t('fan.runScanPrompt')}
                <button
                  type="button"
                  disabled={!runnable}
                  title={blockedReason ?? t('fan.runScanTip')}
                  onClick={() => runScan(false)}
                  className="flex cursor-pointer items-center gap-[7px] rounded-full border border-clay-line bg-clay-bg px-[13px] py-1 text-[12.5px] font-semibold text-clay-deep hover:border-clay hover:text-clay disabled:cursor-default disabled:opacity-45"
                >
                  ◎ {t('fan.runScanBtn')} <Kbd>{modCombo('S')}</Kbd>
                </button>
              </span>
            )
          }
        />
      </div>
    );
  }

  const stale = isScanStale(fan.summary.generatedAt, newestMessageAt);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <span className="cap shrink-0 text-ink-low">Scan</span>
        {/* DataAge is the elastic member (flex-1 + truncate): the long RU
            "СГЕНЕРИРОВАНО …" clips with an ellipsis instead of wrapping the row,
            while the model label + refresh action stay fixed on the baseline. */}
        <DataAge
          at={fan.summary.generatedAt}
          prefix={t('fan.generatedPrefix')}
          className="min-w-0 flex-1 truncate"
        />
        <span className="num shrink-0 whitespace-nowrap text-micro text-ink-low">{fan.summary.modelLabel}</span>
        <button
          type="button"
          disabled={!runnable}
          title={blockedReason ?? t('fan.refreshTip')}
          onClick={() => runScan(true)}
          className="num shrink-0 cursor-pointer whitespace-nowrap text-micro tracking-[0.08em] text-clay-deep hover:text-clay disabled:cursor-default disabled:opacity-45"
        >
          {scanRunning ? t('fan.scanning') : t('fan.refresh')}
        </button>
      </div>
      {stale && !scanRunning && (
        // quiet hint, not an alarm — the scan is still useful, just behind the chat
        <div className="mt-1.5 text-[11.5px] text-ink-low">
          {t('fan.staleHint')}
        </div>
      )}
      {/* AI-authored text always renders in serif (DESIGN §4); Russian body per PRD F6.4 */}
      <div className="mt-2 space-y-2.5">
        {splitSummaryParagraphs(fan.summary.body).map((paragraph, i) => (
          <p
            key={i}
            className="font-serif text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-mid select-text"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
