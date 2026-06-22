// The AI dock (DESIGN §1 AI surface): streaming draft-message bubbles above
// the composer. P3: primary action is INSERT — clicking a bubble inserts it
// into the composer; ⌘1..9 insert part N, ⌘0 inserts all parts as a [NEXT]
// sequence. Copy is the secondary chip and the canSendMessage=false degrade
// (SPEC §7.0).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  ProfilingSnapshotPayload,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import { useUiStore } from '../../state/uiStore';
import { useSettingsCache } from '../../state/settingsCache';
import { useChatSendability, useSettings } from '../../bridge/queries';
import { cx } from '../../lib/cx';
import { modCombo } from '../../lib/modKey';
import { useT } from '../../lib/i18n';
import { Kbd } from '../../design/Kbd';
import { AiDockSlot } from '../conversation/AiDockSlot';
import { focusComposer } from '../conversation/composerDom';
import { StreamingDrafts, DRAFT_BUBBLE_BASE_CLASS } from './StreamingDrafts';
import {
  useAiStore,
  activateDockPart,
  copyDockPart,
  dismissDock,
  cancelActiveOperation,
  focusScanTab,
  regenerateActiveOperation,
  setDockTone,
  togglePreferSplit,
} from './aiStore';
import { usePingGate } from './pingGate';
import {
  DOCK_FEATURE_LABELS,
  DOCK_TONES,
  copyChipLabel,
  copyablePartsOf,
  errorHint,
  extractPromptBlocks,
  formatOpCost,
  insertChipLabel,
  progressLabel,
  shouldAutoInsertCompactDraft,
  toggleTone,
  type DockView,
  type PromptInspectorBlock,
} from './dockLogic';
import { getFeaturePolicy } from '@chatgoose/shared/features';

/**
 * Mounts the dock only while an operation is active — the pane never re-renders.
 * `compact` mounts the same dock as a single in-line strip (the Spenders
 * preview): same aiStore fields, same dockLogic helpers, no header/footer chrome.
 */
export function AiDockMount({ compact = false }: { compact?: boolean } = {}): React.JSX.Element | null {
  const hasOp = useAiStore((s) => s.op !== null);
  if (!hasOp) return null;
  // The compact strip is edge-to-edge (its own border-t/px-4 chrome); only the
  // full floating-card dock wants AiDockSlot's inset margins.
  if (compact) return <AiDock compact />;
  return (
    <AiDockSlot>
      <AiDock />
    </AiDockSlot>
  );
}

function AiDock({ compact = false }: { compact?: boolean }): React.JSX.Element | null {
  if (compact) return <CompactDock />;
  return <FullDock />;
}

function FullDock(): React.JSX.Element | null {
  const t = useT();
  const op = useAiStore((s) => s.op);
  const status = useAiStore((s) => s.status);
  const phase = useAiStore((s) => s.phase);
  const progressPages = useAiStore((s) => s.progressPages);
  const view = useAiStore((s) => s.view);
  const error = useAiStore((s) => s.error);
  const spend = useAiStore((s) => s.spend);
  const profiling = useAiStore((s) => s.profiling);
  const debugPrompt = useAiStore((s) => s.debugPrompt);
  const debugMode = useSettingsCache((s) => s.debugMode);
  const sendability = useChatSendability(op?.accountId ?? null, op?.chatId ?? null);

  if (op === null) return null;
  const running = status === 'running';
  const parts = copyablePartsOf(view);
  // unknown chat defaults to insert — inserting never sends by itself
  const canSend = sendability.data?.canSendMessage ?? true;
  const cannotReason = sendability.data?.canNotSendReason ?? t('conv.cannotSendFallback');

  return (
    <div className="overflow-hidden rounded-card border border-line-strong bg-bg1 shadow-soft">
      {/* top */}
      <div className="flex items-center gap-2.5 px-3.5 pt-[9px]">
        <span className="text-[12.5px] font-semibold text-ink-mid">
          <i className="mr-[5px] not-italic text-clay">✳</i>
          {DOCK_FEATURE_LABELS[op.feature]}
        </span>
        {running && (
          // deep ops count message pages through phase 'loading-messages'
          <span className="num text-micro tracking-[0.08em] text-ink-low">
            {progressLabel(phase, progressPages)}
          </span>
        )}
        <span className="ml-auto" />
        {status === 'completed' && spend !== null && (
          <span className="num text-micro text-ink-low" title={t('aidock.costTip')}>
            {formatOpCost(spend.totalUsd)}
          </span>
        )}
        <button
          type="button"
          onClick={dismissDock}
          title={t('aidock.dismissTip')}
          className="cursor-pointer px-0.5 text-[12px] text-ink-low hover:text-ink-mid"
        >
          ✕
        </button>
      </div>

      {/* body */}
      <div className="flex flex-col gap-[7px] px-3.5 pt-[9px] pb-1">
        {/* keyed per op: a superseding run must not append into the old bubbles */}
        {running && <StreamingDrafts key={op.operationId} operationId={op.operationId} />}
        {status === 'completed' && view !== null && (
          <CompletedView view={view} canSend={canSend} cannotReason={cannotReason} />
        )}
        {status === 'error' && error !== null && <ErrorCard error={error} />}
      </div>

      {/* footer */}
      <div className="flex items-center gap-[5px] px-3.5 pt-[7px] pb-[11px]">
        {op.feature === 'fast-reply' && <TonePills running={running} />}
        {op.feature === 'fast-reply' && <SplitToggle running={running} />}
        {running ? (
          <button
            type="button"
            onClick={cancelActiveOperation}
            className="ml-3 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-ink-mid hover:text-bad"
          >
            {t('common.cancel')} <Kbd>{modCombo('.')}</Kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={regenerateActiveOperation}
            className="ml-3 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-ink-mid hover:text-clay-deep"
          >
            {/* refresh-policy features (Scan/Review) force past the summary cache */}
            {getFeaturePolicy(op.feature).rerunAction === 'refresh' ? t('sp.refresh') : t('aidock.regenerate')}
          </button>
        )}
        <span className="flex-1" />
        {status === 'completed' && parts.length > 1 && (
          <button
            type="button"
            onClick={() => activateDockPart(0, { canSend })}
            title={
              canSend
                ? t('aidock.insertAllTip')
                : t('aidock.cannotCopiesInstead', { reason: cannotReason })
            }
            className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-clay-deep hover:text-clay"
          >
            {canSend ? t('aidock.insertAll') : t('aidock.copyAll')} <Kbd>{modCombo('0')}</Kbd>
          </button>
        )}
      </div>

      {debugMode && !running && (
        <DebugSection debugPrompt={debugPrompt} profiling={profiling} />
      )}
    </div>
  );
}

// ─── Compact dock (Spenders preview, mockup .pvdock) ────────────────────────

/**
 * One-line dock strip: while running — feature label (+ ping segment) + phase;
 * on completion of an insertable draft it AUTO-INSERTS into the composer and
 * focuses it (the explicit human action was the pill click/hotkey that started
 * the op; inserting never sends — SPEC §15). Hi-greeting variants, multi-part,
 * and copy-degraded results render as clickable variant chips instead. Reads
 * the same aiStore fields + dockLogic helpers as the full dock.
 */
function CompactDock(): React.JSX.Element | null {
  const t = useT();
  const op = useAiStore((s) => s.op);
  const status = useAiStore((s) => s.status);
  const phase = useAiStore((s) => s.phase);
  const view = useAiStore((s) => s.view);
  const spend = useAiStore((s) => s.spend);
  const error = useAiStore((s) => s.error);
  const profiling = useAiStore((s) => s.profiling);
  const debugPrompt = useAiStore((s) => s.debugPrompt);
  const debugMode = useSettingsCache((s) => s.debugMode);
  const partFeedback = useAiStore((s) => s.partFeedback);
  // canSend from the op's own chat — same canSendMessage source PreviewDock
  // received as a prop (unknown chat defaults to insertable; inserting never sends).
  const sendability = useChatSendability(op?.accountId ?? null, op?.chatId ?? null);
  const pingGate = usePingGate(op?.accountId ?? null, op?.chatId ?? null, null);
  const insertedOpRef = useRef<string | null>(null);

  const canSend = sendability.data?.canSendMessage ?? true;
  const parts = copyablePartsOf(view);
  const autoInsertable =
    op !== null &&
    status === 'completed' &&
    shouldAutoInsertCompactDraft({
      feature: op.feature,
      viewKind: view?.kind ?? null,
      canSend,
      partCount: parts.length,
    }) &&
    op.completedWhileVisible;

  useEffect(() => {
    if (!autoInsertable || op === null) return;
    if (insertedOpRef.current === op.operationId) return;
    insertedOpRef.current = op.operationId;
    // Insert part 0 (the whole draft) into the composer, then focus it. canSend
    // is true here, so this only INSERTS — it never sends (SPEC §15).
    activateDockPart(0, { canSend: true });
    focusComposer();
  }, [autoInsertable, op]);

  if (op === null) return null;

  const featureLabel = DOCK_FEATURE_LABELS[op.feature];
  const segment =
    op.feature === 'ping' && pingGate.data !== undefined && pingGate.data.segment !== 'active'
      ? t('sp.segment', { s: pingGate.data.segment === 'segment-a' ? 'A' : 'B' })
      : null;

  return (
    <div className="flex flex-none flex-col border-t border-line bg-bg1">
      <div className="flex items-center gap-2.5 px-4 py-2">
        <span className="text-[12px] font-semibold text-ink-mid">
          <i className="mr-[5px] text-clay not-italic">✳</i>
          {featureLabel}
          {segment !== null && <span className="font-normal text-ink-low"> · {segment}</span>}
        </span>
        {status === 'running' && (
          <span className="num text-micro tracking-[0.08em] text-ink-low">{progressLabel(phase)}</span>
        )}
        {status === 'error' && error !== null && (
          <span className="min-w-0 truncate text-[11px] text-bad">
            {error.message}
            {errorHint(error) !== null ? ` — ${errorHint(error)}` : ''}
          </span>
        )}
        {status === 'completed' && autoInsertable && (
          <span className="text-[11px] text-ink-low">{t('sp.inserted')}</span>
        )}
        {status === 'completed' && !autoInsertable && parts.length > 0 && (
          <span className="flex items-center gap-1.5">
            {parts.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  activateDockPart(index + 1, { canSend });
                  if (canSend) focusComposer();
                }}
                className="num cursor-pointer rounded-[5px] border border-clay-line bg-clay-bg px-1.5 py-0.5 text-micro font-semibold text-clay-deep hover:border-clay"
              >
                {partFeedback?.partIndex === index + 1
                  ? partFeedback.kind === 'inserted'
                    ? 'INSERTED'
                    : 'COPIED'
                  : t('sp.variant', { n: index + 1 })}
              </button>
            ))}
          </span>
        )}
        {(status === 'completed' || status === 'error') && (
          <button
            type="button"
            onClick={regenerateActiveOperation}
            className="cursor-pointer text-[11px] text-ink-low underline decoration-dotted underline-offset-3 hover:text-ink-mid"
          >
            {t('sp.anotherVariant')}
          </button>
        )}
        <span className="flex-1" />
        {spend !== null && (
          <span className="num text-[9.5px] text-ink-low">{formatOpCost(spend.totalUsd)}</span>
        )}
      </div>
      {debugMode && status !== 'running' && (
        <DebugSection debugPrompt={debugPrompt} profiling={profiling} compact />
      )}
    </div>
  );
}

// ─── Completed views ───────────────────────────────────────────────────────

function CompletedView({
  view,
  canSend,
  cannotReason,
}: {
  view: DockView;
  canSend: boolean;
  cannotReason: string;
}): React.JSX.Element {
  const t = useT();
  if (view.kind === 'raw') {
    // Parse/sanitizer fallback — read-only, no insert/copy chips.
    return (
      <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
        <div className="cap mb-1 font-sans text-ink-low">{t('aidock.rawOutput')}</div>
        {view.text}
      </div>
    );
  }
  if (view.kind === 'review') {
    // Analysis output — read-only serif card, never insertable (SPEC §15).
    return (
      <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
        <div className="mb-1.5 flex items-baseline gap-2.5">
          <span className="cap font-sans text-ink-low">{t('aidock.chatReviewCap')}</span>
          <span className="num text-[18px] font-semibold text-clay-deep">{view.rating}</span>
          <span className="num text-micro text-ink-low">/ 10</span>
        </div>
        <p>{view.evaluation}</p>
        {view.recommendations.length > 0 && (
          <>
            <div className="cap mt-2.5 mb-1 font-sans text-ink-low">{t('aidock.recommendations')}</div>
            <ul className="list-none space-y-1">
              {view.recommendations.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-none text-clay">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }
  if (view.kind === 'scan-pointer') {
    // The dossier body renders in the panel's Scan tab — the dock only points there.
    return (
      <button
        type="button"
        onClick={focusScanTab}
        className={cx(
          DRAFT_BUBBLE_BASE_CLASS,
          'w-full cursor-pointer border-solid border-line bg-bg2 text-left transition-colors duration-150',
          'hover:border-clay-line hover:bg-clay-bg',
        )}
      >
        <div className="cap mb-1 font-sans text-ink-low">{t('aidock.scanCap')}</div>
        <span className="font-semibold text-clay-deep">
          {view.cached ? t('aidock.scanFromCache') : t('aidock.scanSaved')}
        </span>
      </button>
    );
  }
  if (view.kind === 'help') {
    return (
      <>
        <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
          <div className="cap mb-1 font-sans text-ink-low">{t('aidock.coaching')}</div>
          {view.coaching}
        </div>
        {view.parts.map((part, i) => (
          <DraftBubble
            key={i}
            text={part}
            partNumber={i + 1}
            label={i === 0 ? t('aidock.labelEngaging') : i === 1 ? t('aidock.labelFlirty') : null}
            canSend={canSend}
            cannotReason={cannotReason}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {view.parts.map((part, i) => (
        <DraftBubble
          key={i}
          text={part}
          partNumber={i + 1}
          label={null}
          canSend={canSend}
          cannotReason={cannotReason}
        />
      ))}
    </>
  );
}

function DraftBubble({
  text,
  partNumber,
  label,
  canSend,
  cannotReason,
}: {
  text: string;
  partNumber: number;
  label: string | null;
  canSend: boolean;
  cannotReason: string;
}): React.JSX.Element {
  const t = useT();
  const feedback = useAiStore((s) =>
    s.partFeedback !== null &&
    (s.partFeedback.partIndex === partNumber || s.partFeedback.partIndex === 0)
      ? s.partFeedback.kind
      : null,
  );
  const chipText =
    feedback !== null
      ? feedback === 'inserted'
        ? 'INSERTED'
        : 'COPIED'
      : canSend
        ? insertChipLabel(partNumber)
        : copyChipLabel(partNumber);
  return (
    <button
      type="button"
      onClick={() => activateDockPart(partNumber, { canSend })}
      title={
        canSend
          ? t('aidock.bubbleInsertTip')
          : t('aidock.cannotClickCopies', { reason: cannotReason })
      }
      className={cx(
        DRAFT_BUBBLE_BASE_CLASS,
        'w-full cursor-pointer pr-[104px] text-left transition-colors duration-150',
        'hover:border-solid hover:border-clay hover:bg-draft-hover',
      )}
    >
      {label !== null && <div className="cap mb-1 font-sans text-ink-low">{label}</div>}
      {text}
      <span className="absolute top-1/2 right-2.5 flex -translate-y-1/2 flex-col items-end gap-1">
        <span
          className={cx(
            'num rounded-full border px-[9px] py-[2px] text-micro tracking-[0.08em]',
            feedback !== null
              ? 'border-green-line bg-green-bg text-green'
              : 'border-clay-line bg-bg1 text-clay-deep',
          )}
        >
          {chipText}
        </span>
        {canSend && (
          // secondary affordance — copy without inserting (stops the bubble's insert click)
          <span
            role="button"
            title={t('aidock.copyToClipboard')}
            onClick={(e) => {
              e.stopPropagation();
              copyDockPart(partNumber);
            }}
            className="num cursor-pointer text-micro tracking-[0.08em] text-ink-low hover:text-ink-mid"
          >
            COPY
          </span>
        )}
      </span>
    </button>
  );
}

// ─── Error card (CG-coded message + recovery hint, PRD F6) ────────────────

function ErrorCard({ error }: { error: UserFacingErrorPayload }): React.JSX.Element {
  const t = useT();
  const setView = useUiStore((s) => s.setView);
  const hint = errorHint(error);
  return (
    <div className="rounded-[12px] border border-bad/35 bg-bad/8 px-3.5 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="num text-micro tracking-[0.08em] text-bad">{error.code}</span>
        <span className="text-[13px] font-semibold text-ink">{error.message}</span>
      </div>
      {hint !== null && <p className="mt-1 text-[12.5px] text-ink-mid">{hint}</p>}
      {error.settingsLink === true && (
        <button
          type="button"
          onClick={() => setView('settings')}
          className="mt-1.5 cursor-pointer text-[12.5px] font-semibold text-clay-deep underline decoration-dotted underline-offset-2"
        >
          {t('aidock.openSettingsArrow')}
        </button>
      )}
    </div>
  );
}

// ─── Footer controls ──────────────────────────────────────────────────────

function TonePills({ running }: { running: boolean }): React.JSX.Element {
  const t = useT();
  const settings = useSettings();
  const toneOverride = useAiStore((s) => s.toneOverride);
  const active = toneOverride ?? settings.data?.defaultReplyTone ?? 'casual';
  return (
    <>
      {DOCK_TONES.map((tone) => (
        <button
          key={tone}
          type="button"
          disabled={running}
          title={
            running
              ? t('aidock.toneRunningTip')
              : active === tone
                ? t('aidock.toneDeselectTip')
                : t('aidock.toneUseTip', { tone })
          }
          onClick={() => {
            if (!running) setDockTone(toggleTone(active, tone));
          }}
          className={cx(
            'cursor-pointer rounded-full border px-[11px] py-[3px] text-[12px] font-medium transition-colors duration-150',
            'disabled:cursor-default disabled:opacity-60',
            active === tone
              ? 'border-clay-line bg-clay-bg text-clay-deep'
              : 'border-transparent text-ink-low hover:text-ink-mid',
          )}
        >
          {tone}
        </button>
      ))}
    </>
  );
}

function SplitToggle({ running }: { running: boolean }): React.JSX.Element {
  const t = useT();
  const preferSplit = useAiStore((s) => s.preferSplit);
  return (
    <button
      type="button"
      disabled={running}
      onClick={() => {
        if (!running) togglePreferSplit();
      }}
      title={t('aidock.splitTip')}
      className={cx(
        'ml-1.5 cursor-pointer rounded-full border px-[11px] py-[3px] text-[12px] font-medium transition-colors duration-150',
        'disabled:cursor-default disabled:opacity-60',
        preferSplit
          ? 'border-clay-line bg-clay-bg text-clay-deep'
          : 'border-transparent text-ink-low hover:text-ink-mid',
      )}
    >
      {t('aidock.split')}
    </button>
  );
}

// ─── Debug prompt inspector (settings.debugMode only, SPEC §12) ───────────

function DebugSection({
  debugPrompt,
  profiling,
  compact = false,
}: {
  debugPrompt: Record<string, unknown> | null;
  profiling: ProfilingSnapshotPayload | null;
  compact?: boolean;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!compact || !open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compact, open]);

  if (debugPrompt === null && profiling === null) return null;
  const blocks = debugPrompt !== null ? extractPromptBlocks(debugPrompt) : null;
  const transcriptDebug = debugPrompt !== null ? readTranscriptDebug(debugPrompt) : null;
  const promptSummary =
    blocks !== null ? `${blocks.length} blocks` : debugPrompt !== null ? 'raw' : 'profiling';

  function copyPromptText(): void {
    const text =
      blocks !== null
        ? blocks.map((b) => `── ${b.role.toUpperCase()} · cache ${b.cache} ──\n${b.text}`).join('\n\n')
        : JSON.stringify(debugPrompt, null, 2);
    void navigator.clipboard.writeText(text);
  }

  if (compact) {
    const overlay =
      open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-transparent px-[max(18px,4vw)] py-[max(44px,7vh)]"
              role="dialog"
              aria-label="Prompt debug inspector"
              onMouseDown={() => setOpen(false)}
            >
              <div
                className="flex max-h-full w-[min(1180px,92vw)] flex-col overflow-hidden rounded-card border border-line-strong bg-bg1 shadow-pop"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex flex-none items-center gap-2 border-b border-line bg-bg1 px-3.5 py-2">
                  <span className="cap text-ink-mid">Prompt</span>
                  <span className="num text-micro text-ink-low">{promptSummary}</span>
                  <span className="flex-1" />
                  {debugPrompt !== null && (
                    <button
                      type="button"
                      onClick={copyPromptText}
                      className="num cursor-pointer text-micro tracking-[0.08em] text-ink-low hover:text-ink-mid"
                    >
                      COPY
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="num cursor-pointer text-micro tracking-[0.08em] text-ink-low hover:text-ink-mid"
                  >
                    CLOSE
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
                  <PromptDebugBody
                    blocks={blocks}
                    debugPrompt={debugPrompt}
                    transcriptDebug={transcriptDebug}
                    profiling={profiling}
                    compact
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null;

    return (
      <>
        <div className="border-t border-line bg-bg2/60 px-3.5 py-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="cap flex cursor-pointer items-center gap-1.5 text-ink-low hover:text-ink-mid"
            >
              {open ? '▾' : '▸'} Prompt
            </button>
            <span className="num text-micro text-ink-low">{promptSummary}</span>
            {debugPrompt !== null && (
              <button
                type="button"
                onClick={copyPromptText}
                className="num ml-auto cursor-pointer text-micro tracking-[0.08em] text-ink-low hover:text-ink-mid"
              >
                COPY
              </button>
            )}
          </div>
        </div>
        {overlay}
      </>
    );
  }

  return (
    <div className="border-t border-line bg-bg2/60 px-3.5 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="cap flex cursor-pointer items-center gap-1.5 text-ink-low hover:text-ink-mid"
        >
          {open ? '▾' : '▸'} Prompt
        </button>
        {open && debugPrompt !== null && (
          <button
            type="button"
            onClick={copyPromptText}
            className="num ml-auto cursor-pointer text-micro tracking-[0.08em] text-ink-low hover:text-ink-mid"
          >
            COPY
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2">
          <PromptDebugBody
            blocks={blocks}
            debugPrompt={debugPrompt}
            transcriptDebug={transcriptDebug}
            profiling={profiling}
            compact={false}
          />
        </div>
      )}
    </div>
  );
}

function PromptDebugBody({
  blocks,
  debugPrompt,
  transcriptDebug,
  profiling,
  compact,
}: {
  blocks: PromptInspectorBlock[] | null;
  debugPrompt: Record<string, unknown> | null;
  transcriptDebug?: TranscriptDebug | null;
  profiling: ProfilingSnapshotPayload | null;
  compact: boolean;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      {transcriptDebug !== null && transcriptDebug !== undefined && (
        <TranscriptDebugCard transcriptDebug={transcriptDebug} />
      )}
      {blocks !== null ? (
        blocks.map((block, i) => (
          <div key={i} className="rounded-chip border border-line bg-bg1">
            <div className="flex items-center gap-2 border-b border-line px-2.5 py-1">
              <span className="cap text-ink-mid">{block.role}</span>
              <span
                className={cx(
                  'num rounded-full border px-1.5 text-micro',
                  block.cache === 'none'
                    ? 'border-line text-ink-low'
                    : 'border-green-line bg-green-bg text-green',
                )}
              >
                cache {block.cache}
              </span>
            </div>
            <pre
              className={cx(
                'px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-ink-mid select-text',
                compact ? 'overflow-visible' : 'max-h-44 overflow-auto',
              )}
            >
              {block.text}
            </pre>
          </div>
        ))
      ) : debugPrompt !== null ? (
        <pre
          className={cx(
            'rounded-chip border border-line bg-bg1 px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-ink-mid select-text',
            compact ? 'overflow-visible' : 'max-h-44 overflow-auto',
          )}
        >
          {JSON.stringify(debugPrompt, null, 2)}
        </pre>
      ) : null}
      {profiling !== null && profiling.stages.length > 0 && (
        <StageTable profiling={profiling} />
      )}
    </div>
  );
}

interface TranscriptDebug {
  messageCount: number;
  charCount: number;
  preview: string;
}

function readTranscriptDebug(snapshot: Record<string, unknown>): TranscriptDebug | null {
  const value = snapshot['transcript'];
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record['messageCount'] !== 'number' ||
    typeof record['charCount'] !== 'number' ||
    typeof record['preview'] !== 'string'
  ) {
    return null;
  }
  return {
    messageCount: record['messageCount'],
    charCount: record['charCount'],
    preview: record['preview'],
  };
}

function TranscriptDebugCard({
  transcriptDebug,
}: {
  transcriptDebug: TranscriptDebug;
}): React.JSX.Element {
  const empty = transcriptDebug.messageCount === 0;
  return (
    <div className="rounded-chip border border-line bg-bg1">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1">
        <span className="cap text-ink-mid">transcript</span>
        <span
          className={cx(
            'num rounded-full border px-1.5 text-micro',
            empty ? 'border-amber-line bg-amber-bg text-amber' : 'border-green-line bg-green-bg text-green',
          )}
        >
          {transcriptDebug.messageCount} messages
        </span>
        <span className="num text-micro text-ink-low">{transcriptDebug.charCount} chars</span>
      </div>
      <pre className="max-h-36 overflow-auto px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-ink-mid select-text">
        {transcriptDebug.preview}
      </pre>
    </div>
  );
}

function StageTable({ profiling }: { profiling: ProfilingSnapshotPayload }): React.JSX.Element {
  return (
    <table className="num w-full text-left text-[11px] text-ink-mid">
      <thead>
        <tr className="cap text-ink-low">
          <th className="py-0.5 pr-2 font-semibold">stage</th>
          <th className="py-0.5 pr-2 font-semibold">status</th>
          <th className="py-0.5 text-right font-semibold">ms</th>
        </tr>
      </thead>
      <tbody>
        {profiling.stages.map((stage) => (
          <tr key={stage.key} className="border-t border-line/60">
            <td className="py-0.5 pr-2">{stage.label}</td>
            <td
              className={cx(
                'py-0.5 pr-2',
                stage.status === 'failed' && 'text-bad',
                stage.status === 'completed' && 'text-green',
              )}
            >
              {stage.status}
            </td>
            <td className="py-0.5 text-right">
              {stage.durationMs !== undefined ? Math.round(stage.durationMs) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
