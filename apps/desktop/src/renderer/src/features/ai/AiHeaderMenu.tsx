// ✳ AI menu in the conversation header (DESIGN §1 tier 2): rare/deep actions
// only — Scan ⌘S (fan-summary → panel's Scan tab) and Chat review ⌘E are live;
// Compare stays gated (P4-stretch, lowest priority — PRD F6.8). The deep
// minimum-history gate (CG-FLOW-03) is the coordinator's: errors land in the
// dock as coded cards.

import { useEffect, useRef, useState } from 'react';
import { useAccounts, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { Kbd } from '../../design/Kbd';
import { cx } from '../../lib/cx';
import { modCombo } from '../../lib/modKey';
import { startAiFeature, type LiveAiFeature } from './aiStore';
import { evaluateAiGate } from './dockLogic';
import { gateText } from './gateText';
import { useT } from '../../lib/i18n';

function MenuItem({
  glyph,
  title,
  sub,
  kbd,
  disabledReason,
  badge,
  onRun,
}: {
  glyph: string;
  title: string;
  sub: string;
  kbd?: string;
  /** Non-null = rendered dimmed and inert, reason in the tooltip. */
  disabledReason: string | null;
  badge?: string;
  onRun?: () => void;
}): React.JSX.Element {
  const disabled = disabledReason !== null;
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabledReason ?? sub}
      onClick={onRun}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-chip px-2.5 py-2 text-left',
        disabled
          ? 'cursor-default opacity-45'
          : 'cursor-pointer transition-colors duration-150 hover:bg-clay-bg',
      )}
    >
      <span className="w-4 flex-none text-center text-[12px] text-clay">{glyph}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          {title}
          {badge !== undefined && <span className="num text-micro text-ink-low">{badge}</span>}
        </span>
        <span className="mt-px block text-[10.5px] text-ink-low">{sub}</span>
      </span>
      {kbd !== undefined && (
        <span className="ml-auto">
          <Kbd>{kbd}</Kbd>
        </span>
      )}
    </button>
  );
}

export function AiHeaderMenu(): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const accountId = useUiStore((s) => s.selectedAccountId);
  const chatId = useUiStore((s) => s.selectedChatId);
  const accounts = useAccounts();
  const settings = useSettings();

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const ready = account !== null && settings.data !== undefined && chatId !== null;
  const gate = ready
    ? evaluateAiGate({
        mapped: account.personalityId !== null,
        hasLlmKey: settings.data.hasAnthropicKey || settings.data.hasOpenRouterKey,
      })
    : null;
  const blockedReason = gate === null ? t('common.loading') : gate.ok ? null : gateText(t, gate.reason);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent): void {
      if (rootRef.current !== null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function run(feature: LiveAiFeature): void {
    if (accountId === null || chatId === null || settings.data === undefined) return;
    setOpen(false);
    startAiFeature(feature, {
      accountId,
      chatId,
      defaultTone: settings.data.defaultReplyTone,
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-[7px] rounded-full border border-line bg-bg2 px-[13px] py-1 text-[12.5px] font-semibold text-ink-mid transition-colors duration-150 hover:border-clay-line hover:bg-clay-bg hover:text-clay-deep"
      >
        <i className="not-italic text-clay">✳</i> AI <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-40 w-[264px] rounded-menu border border-line-strong bg-bg1 p-1.5 shadow-pop">
          <MenuItem
            glyph="◎"
            title="Scan"
            sub={t('aidock.menuScanSub')}
            kbd={modCombo('S')}
            disabledReason={blockedReason}
            onRun={() => run('fan-summary')}
          />
          <MenuItem
            glyph="▤"
            title="Chat review"
            sub={t('aidock.menuReviewSub')}
            kbd={modCombo('E')}
            disabledReason={blockedReason}
            onRun={() => run('chat-review')}
          />
          <div className="my-1 h-px bg-line" />
          <MenuItem
            glyph="⇄"
            title="Compare"
            sub={t('aidock.menuCompareSub')}
            disabledReason={t('aidock.compareP4')}
            badge="P4-STRETCH"
          />
        </div>
      )}
    </div>
  );
}
