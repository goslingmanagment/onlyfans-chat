// Composer pill row (DESIGN §1 tier 1): all five frequent AI actions, always
// visible above the composer. Ping/Hi dim with their gate reason when
// inapplicable (fan-active for Ping, >10 msgs for Hi — legacy gates); the
// coordinator's CG-FLOW-05/09 checks stay authoritative for unknowns.

import { useEffect, useRef } from 'react';
import { useAccounts, useMessages, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import {
  useAiStore,
  activateToneFromMenu,
  setToneMenuOpen,
  startAiFeature,
  type AiStartContext,
  type LiveAiFeature,
} from './aiStore';
import {
  deriveHiLocked,
  effectiveReplyTone,
  evaluateAiGate,
  evaluateHiGate,
  evaluatePingGate,
  hasConfiguredAiTransport,
  type AiGate,
} from './dockLogic';
import { TonePopover } from './TonePopover';
import { usePingGate } from './pingGate';
import { gateText } from './gateText';
import { Kbd } from '../../design/Kbd';
import { cx } from '../../lib/cx';
import { modCombo } from '../../lib/modKey';
import { useT } from '../../lib/i18n';
import type { AiPill } from '../conversation/conversationFeatures';

// Default full set + order (today's full chat). Kept as a module constant so the
// default-prop path is a stable reference and renders byte-for-byte as before.
const DEFAULT_PILLS: readonly AiPill[] = ['reply', 'improve', 'help', 'ping', 'hi'];

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
        // shrink-0 + whitespace-nowrap: a pill stays one atomic line — the ROW
        // wraps (flex-wrap below), the pill's label↔Kbd never break internally.
        'flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full border px-[13px] py-1 text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-150',
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

// The primary-pill shape, split between the Reply body and its ▾ tone caret so
// the two segments read as one pill. Both branches mirror PillButton's `primary`
// classes exactly; only the corner rounding differs (body rounds the left, caret
// the right) and a hairline separates them.
const SPLIT_PILL_BASE =
  'flex shrink-0 cursor-pointer items-center border text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-150 ' +
  'disabled:cursor-default disabled:opacity-45 ' +
  'border-clay-line bg-clay-bg text-clay-deep hover:border-clay hover:text-clay ' +
  'disabled:hover:border-clay-line disabled:hover:bg-clay-bg disabled:hover:text-clay-deep';

/**
 * Variant C: Reply is a split control. The body generates a fast-reply in the
 * ACTIVE tone (same as ⌘R — unchanged); the ▾ caret opens the upward TonePopover
 * where picking a tone immediately generates in it (one click = one generation).
 * The menu mark reflects the effective active tone (toneOverride ?? default), so
 * it stays in sync with ⌘T cycling and the dock footer pills. Outside-click
 * closes via a ref that wraps the WHOLE control (body + caret), so toggling the
 * caret never self-closes.
 */
function ReplySplitPill({
  disabled,
  bodyTitle,
  ctx,
  onGenerate,
}: {
  disabled: boolean;
  bodyTitle: string;
  ctx: AiStartContext;
  onGenerate: () => void;
}): React.JSX.Element {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuOpen = useAiStore((s) => s.toneMenuOpen);
  const toneOverride = useAiStore((s) => s.toneOverride);
  const activeTone = effectiveReplyTone(toneOverride, ctx.defaultTone);

  // Outside-click closes the menu; the ref boundary includes the caret, so a
  // caret click toggles instead of dismissing (Esc handling lives in TonePopover).
  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent): void {
      if (rootRef.current !== null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setToneMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen]);

  // A disabled row must not leave a menu hanging open.
  useEffect(() => {
    if (disabled && menuOpen) setToneMenuOpen(false);
  }, [disabled, menuOpen]);

  return (
    <div ref={rootRef} className="relative flex shrink-0">
      <button
        type="button"
        disabled={disabled}
        title={bodyTitle}
        onClick={() => {
          if (!disabled) {
            // One Reply click = one generation: close the menu so an open
            // tone picker can't linger and chain a second (toned) op on top.
            setToneMenuOpen(false);
            onGenerate();
          }
        }}
        className={cx(SPLIT_PILL_BASE, 'gap-[7px] rounded-l-full py-1 pr-2.5 pl-[13px]')}
      >
        <i className="not-italic">✳</i> Reply <Kbd>{modCombo('R')}</Kbd>
      </button>
      <button
        type="button"
        disabled={disabled}
        title={t('aidock.toneMenuTip')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('aidock.toneMenuTip')}
        onClick={() => {
          if (!disabled) setToneMenuOpen(!menuOpen);
        }}
        // border-l-0 drops the shared edge so it doesn't double with the body's
        // right border; the hairline below is the visible split separator.
        className={cx(
          SPLIT_PILL_BASE,
          'justify-center rounded-r-full border-l-0 py-1 pr-3 pl-2.5 text-[10px]',
          'shadow-[inset_1px_0_0_0_var(--color-clay-line)]',
        )}
      >
        ▾
      </button>
      <TonePopover
        isOpen={menuOpen && !disabled}
        activeTone={activeTone}
        onSelectTone={(tone) => activateToneFromMenu(tone, ctx)}
        onClose={() => setToneMenuOpen(false)}
      />
    </div>
  );
}

export function AiPillRow({
  accountId,
  chatId,
  pills = DEFAULT_PILLS,
  replyTone = true,
  disabledReason = null,
}: {
  accountId: string;
  chatId: string;
  pills?: readonly AiPill[];
  replyTone?: boolean;
  disabledReason?: string | null;
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
  const messagesLoaded = messages.data !== undefined;
  // pages[0] = newest page, items ascending — last item is the newest message
  const lastMessageId = pages?.[0]?.items.at(-1)?.id ?? null;
  const pingGate = usePingGate(accountId, chatId, lastMessageId);

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const ready = account !== null && settings.data !== undefined;
  const gate: AiGate | null = ready
    ? evaluateAiGate({
        mapped: account.personalityId !== null,
        hasLlmKey: hasConfiguredAiTransport(settings.data),
      })
    : null;
  const blockedMessage = gate !== null && !gate.ok ? gateText(t, gate.reason) : null;
  const externalBlockedMessage = disabledReason?.trim() ? disabledReason : null;
  const loadingBlockedMessage = messagesLoaded ? null : t('conv.loadingTitle');
  const disabledMessage = externalBlockedMessage ?? loadingBlockedMessage ?? blockedMessage;
  const rowDisabled = !ready || disabledMessage !== null;

  const pingPill = evaluatePingGate(gate, pingGate.data?.blocked ?? null);
  const hiPill = evaluateHiGate(gate, deriveHiLocked(pages));

  const defaultTone = settings.data?.defaultReplyTone ?? 'casual';

  function start(feature: LiveAiFeature): void {
    if (settings.data === undefined) return;
    startAiFeature(feature, { accountId, chatId, defaultTone });
  }

  // One renderer per pill, keyed by AiPill. <ConversationView> chooses which to
  // show (and their order) via `pills`; the full chat passes the default set so
  // this renders byte-for-byte as before. Reply swaps its split-menu (tone caret)
  // for a plain ⌘R fast-reply when `replyTone` is false (e.g. the preview).
  const pillNodes: Record<AiPill, React.JSX.Element> = {
    reply: replyTone ? (
      <ReplySplitPill
        key="reply"
        disabled={rowDisabled}
        bodyTitle={disabledMessage ?? t('aidock.replyTip')}
        ctx={{ accountId, chatId, defaultTone }}
        onGenerate={() => start('fast-reply')}
      />
    ) : (
      <PillButton
        key="reply"
        primary
        disabled={rowDisabled}
        title={disabledMessage ?? t('aidock.replyTip')}
        onClick={() => {
          if (!rowDisabled) start('fast-reply');
        }}
      >
        <i className="not-italic">✳</i> Reply <Kbd>{modCombo('R')}</Kbd>
      </PillButton>
    ),
    improve: (
      <PillButton
        key="improve"
        disabled={rowDisabled || draftEmpty}
        title={disabledMessage ?? (draftEmpty ? t('aidock.improveEmptyTip') : t('aidock.improveTip'))}
        onClick={() => {
          if (!rowDisabled) start('improve-draft');
        }}
      >
        Improve <Kbd>{modCombo('I')}</Kbd>
      </PillButton>
    ),
    help: (
      <PillButton
        key="help"
        disabled={rowDisabled}
        title={disabledMessage ?? t('aidock.helpTip')}
        onClick={() => {
          if (!rowDisabled) start('help-me');
        }}
      >
        Help <Kbd>{modCombo('H')}</Kbd>
      </PillButton>
    ),
    ping: (
      <PillButton
        key="ping"
        dimmed={rowDisabled || !pingPill.enabled}
        disabled={rowDisabled || !pingPill.enabled}
        title={disabledMessage ?? (pingPill.enabled ? t('aidock.pingTip') : gateText(t, pingPill.code))}
        onClick={() => {
          if (!rowDisabled && pingPill.enabled) start('ping');
        }}
      >
        Ping <Kbd>{modCombo('P')}</Kbd>
      </PillButton>
    ),
    hi: (
      <PillButton
        key="hi"
        dimmed={rowDisabled || !hiPill.enabled}
        disabled={rowDisabled || !hiPill.enabled}
        title={disabledMessage ?? (hiPill.enabled ? t('aidock.hiTip') : gateText(t, hiPill.code))}
        onClick={() => {
          if (!rowDisabled && hiPill.enabled) start('hi-greeting');
        }}
      >
        Hi <Kbd>{modCombo('G')}</Kbd>
      </PillButton>
    ),
  };

  return (
    // flex-wrap: at the narrow (~332px) centre worst-case the pills spill to a
    // 2nd line instead of compressing/overflowing onto the FanPanel. The gated
    // settings CTA gets basis-full so it always drops to its own line below.
    <div className="mx-[18px] mt-[9px] flex flex-none flex-wrap items-center gap-1.5">
      {pills.map((pill) => pillNodes[pill])}
      {blockedMessage !== null && (
        <button
          type="button"
          onClick={() => setView('settings')}
          className="ml-1.5 basis-full cursor-pointer text-left text-[12px] font-semibold text-clay-deep underline decoration-dotted underline-offset-2"
        >
          {blockedMessage} →
        </button>
      )}
    </div>
  );
}
