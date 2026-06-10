// Composer pill row (DESIGN §1 tier 1): all five frequent AI actions, always
// visible above the composer. Reply/Improve/Help live in P2; Ping/Hi dimmed
// until P4 (their gate logic exists but the features are out of P2 scope).

import { useAccounts, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { useAiStore, startAiFeature, type LiveAiFeature } from './aiStore';
import { evaluateAiGate, type AiGate } from './dockLogic';
import { Kbd } from '../../design/Kbd';
import { cx } from '../../lib/cx';

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
  const setView = useUiStore((s) => s.setView);
  const accounts = useAccounts();
  const settings = useSettings();
  const draftEmpty = useAiStore((s) => s.draftText.trim().length === 0);

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const ready = account !== null && settings.data !== undefined;
  const gate: AiGate | null = ready
    ? evaluateAiGate({
        mapped: account.personalityId !== null,
        hasLlmKey: settings.data.hasAnthropicKey || settings.data.hasOpenRouterKey,
      })
    : null;
  const blockedMessage = gate !== null && !gate.ok ? gate.message : null;
  const rowDisabled = !ready || blockedMessage !== null;

  function start(feature: LiveAiFeature): void {
    if (rowDisabled || settings.data === undefined) return;
    startAiFeature(feature, {
      accountId,
      chatId,
      defaultTone: settings.data.defaultReplyTone,
    });
  }

  return (
    <div className="mx-[18px] mt-[9px] flex flex-none items-center gap-1.5">
      <PillButton
        primary
        disabled={rowDisabled}
        title={blockedMessage ?? 'Generate a reply suggestion'}
        onClick={() => start('fast-reply')}
      >
        <i className="not-italic">✳</i> Reply <Kbd>⌘R</Kbd>
      </PillButton>
      <PillButton
        disabled={rowDisabled || draftEmpty}
        title={blockedMessage ?? (draftEmpty ? 'Type a draft in the composer to improve' : 'Improve your draft')}
        onClick={() => start('improve-draft')}
      >
        Improve <Kbd>⌘I</Kbd>
      </PillButton>
      <PillButton
        disabled={rowDisabled}
        title={blockedMessage ?? 'Coaching + two suggested directions'}
        onClick={() => start('help-me')}
      >
        Help <Kbd>⌘H</Kbd>
      </PillButton>
      <PillButton dimmed disabled title="Arrives in P4">
        Ping <Kbd>⌘P</Kbd>
      </PillButton>
      <PillButton dimmed disabled title="Arrives in P4">
        Hi <Kbd>⌘G</Kbd>
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
