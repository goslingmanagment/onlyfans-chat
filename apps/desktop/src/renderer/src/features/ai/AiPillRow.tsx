// Composer pill row (DESIGN §1 tier 1): all five frequent AI actions, always
// visible above the composer. Ping/Hi dim with their gate reason when
// inapplicable (fan-active for Ping, >10 msgs for Hi — legacy gates); the
// coordinator's CG-FLOW-05/09 checks stay authoritative for unknowns.

import { useAccounts, useMessages, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { useAiStore, startAiFeature, type LiveAiFeature } from './aiStore';
import {
  deriveHiLocked,
  evaluateAiGate,
  evaluateHiGate,
  evaluatePingGate,
  type AiGate,
} from './dockLogic';
import { usePingGate } from './pingGate';
import { gateText } from './gateText';
import { Kbd } from '../../design/Kbd';
import { cx } from '../../lib/cx';
import { modCombo } from '../../lib/modKey';
import { useT } from '../../lib/i18n';

function PillButton({
  primary = false,
  dimmed = false,
  disabled,
  title,
  onClick,
  children,
}: {
  primary?: boolean;
  dimmed?: boolean;
  disabled: boolean;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      {...(onClick !== undefined ? { onClick } : {})}
      className={cx(
        'flex cursor-pointer items-center gap-[7px] rounded-full border px-[13px] py-1 text-[12.5px] font-semibold transition-colors duration-150',
        'disabled:cursor-default',
        primary
          ? 'border-clay-line bg-clay-bg text-clay-deep hover:border-clay hover:text-clay'
          : 'border-line bg-bg2 text-ink-mid hover:border-clay-line hover:bg-clay-bg hover:text-clay-deep',
        dimmed
          ? 'opacity-45 disabled:hover:border-line disabled:hover:bg-bg2 disabled:hover:text-ink-mid'
          : 'disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-bg2 disabled:hover:text-ink-mid',
        primary && 'disabled:hover:border-clay-line disabled:hover:bg-clay-bg disabled:hover:text-clay-deep',
      )}
    >
      {children}
    </button>
  );
}

export function AiPillRow({
  accountId,
  chatId,
}: {
  accountId: string;
  chatId: string;
}): React.JSX.Element {
  const t = useT();
  const setView = useUiStore((s) => s.setView);
  const accounts = useAccounts();
  const settings = useSettings();
  const draftEmpty = useAiStore((s) => s.draftText.trim().length === 0);

  // Shares the conversation's message cache (same key as MessageList — no
  // extra fetch): hi gate heuristic + the ping gate's refetch trigger.
  const messages = useMessages(accountId, chatId);
  const pages = messages.data?.pages;
  // pages[0] = newest page, items ascending — last item is the newest message
  const lastMessageId = pages?.[0]?.items.at(-1)?.id ?? null;
  const pingGate = usePingGate(accountId, chatId, lastMessageId);

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const ready = account !== null && settings.data !== undefined;
  const gate: AiGate | null = ready
    ? evaluateAiGate({
        mapped: account.personalityId !== null,
        hasLlmKey: settings.data.hasAnthropicKey || settings.data.hasOpenRouterKey,
      })
    : null;
  const blockedMessage = gate !== null && !gate.ok ? gateText(t, gate.reason) : null;
  const rowDisabled = !ready || blockedMessage !== null;

  const pingPill = evaluatePingGate(gate, pingGate.data?.blocked ?? null);
  const hiPill = evaluateHiGate(gate, deriveHiLocked(pages));

  const defaultTone = settings.data?.defaultReplyTone ?? 'casual';

  function start(feature: LiveAiFeature): void {
    if (settings.data === undefined) return;
    startAiFeature(feature, { accountId, chatId, defaultTone });
  }

  return (
    <div className="mx-[18px] mt-[9px] flex flex-none items-center gap-1.5">
      <PillButton
        primary
        disabled={rowDisabled}
        title={blockedMessage ?? t('aidock.replyTip')}
        onClick={() => {
          if (!rowDisabled) start('fast-reply');
        }}
      >
        <i className="not-italic">✳</i> Reply <Kbd>{modCombo('R')}</Kbd>
      </PillButton>
      <PillButton
        disabled={rowDisabled || draftEmpty}
        title={blockedMessage ?? (draftEmpty ? t('aidock.improveEmptyTip') : t('aidock.improveTip'))}
        onClick={() => {
          if (!rowDisabled) start('improve-draft');
        }}
      >
        Improve <Kbd>{modCombo('I')}</Kbd>
      </PillButton>
      <PillButton
        disabled={rowDisabled}
        title={blockedMessage ?? t('aidock.helpTip')}
        onClick={() => {
          if (!rowDisabled) start('help-me');
        }}
      >
        Help <Kbd>{modCombo('H')}</Kbd>
      </PillButton>
      <PillButton
        dimmed={!pingPill.enabled}
        disabled={!pingPill.enabled}
        title={pingPill.enabled ? t('aidock.pingTip') : gateText(t, pingPill.code)}
        onClick={() => {
          if (pingPill.enabled) start('ping');
        }}
      >
        Ping <Kbd>{modCombo('P')}</Kbd>
      </PillButton>
      <PillButton
        dimmed={!hiPill.enabled}
        disabled={!hiPill.enabled}
        title={hiPill.enabled ? t('aidock.hiTip') : gateText(t, hiPill.code)}
        onClick={() => {
          if (hiPill.enabled) start('hi-greeting');
        }}
      >
        Hi <Kbd>{modCombo('G')}</Kbd>
      </PillButton>
      {blockedMessage !== null && (
        <button
          type="button"
          onClick={() => setView('settings')}
          className="ml-1.5 cursor-pointer text-[12px] font-semibold text-clay-deep underline decoration-dotted underline-offset-2"
        >
          {blockedMessage} →
        </button>
      )}
    </div>
  );
}
