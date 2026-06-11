// The AI dock (DESIGN §1 AI surface): streaming draft-message bubbles above
// the composer. P3: primary action is INSERT — clicking a bubble inserts it
// into the composer; ⌘1..9 insert part N, ⌘0 inserts all parts as a [NEXT]
// sequence. Copy is the secondary chip and the canSendMessage=false degrade
// (SPEC §7.0).

import { useState } from 'react';
import type {
  ProfilingSnapshotPayload,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import { useUiStore } from '../../state/uiStore';
import { useSettingsCache } from '../../state/settingsCache';
import { useChatSendability, useSettings } from '../../bridge/queries';
import { cx } from '../../lib/cx';
import { Kbd } from '../../design/Kbd';
import { AiDockSlot } from '../conversation/AiDockSlot';
import { CANNOT_SEND_FALLBACK } from '../conversation/sendLogic';
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
  toggleTone,
  type DockView,
} from './dockLogic';
import { getFeaturePolicy } from '@chatgoose/shared/features';

/** Mounts the dock only while an operation is active — the pane never re-renders. */
export function AiDockMount(): React.JSX.Element | null {
  const hasOp = useAiStore((s) => s.op !== null);
  if (!hasOp) return null;
  return (
    <AiDockSlot>
      <AiDock />
    </AiDockSlot>
  );
}

function AiDock(): React.JSX.Element | null {
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
  const cannotReason = sendability.data?.canNotSendReason ?? CANNOT_SEND_FALLBACK;

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
          <span className="num text-micro text-ink-low" title="LLM cost of this operation">
            {formatOpCost(spend.totalUsd)}
          </span>
        )}
        <button
          type="button"
          onClick={dismissDock}
          title="Dismiss (Esc)"
          className="cursor-pointer px-0.5 text-[12px] text-ink-low hover:text-ink-mid"
        >
          ✕
        </button>
      </div>

      {/* body */}
      <div className="flex flex-col gap-[7px] px-3.5 pt-[9px] pb-1">
        {/* keyed per op: a superseding run must not append into the old bubbles */}
        {running && <StreamingDrafts key={op.operationId} />}
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
            Cancel <Kbd>⌘.</Kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={regenerateActiveOperation}
            className="ml-3 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-ink-mid hover:text-clay-deep"
          >
            {/* refresh-policy features (Scan/Review) force past the summary cache */}
            {getFeaturePolicy(op.feature).rerunAction === 'refresh' ? '↻ Refresh' : '↻ Regenerate'}
          </button>
        )}
        <span className="flex-1" />
        {status === 'completed' && parts.length > 1 && (
          <button
            type="button"
            onClick={() => activateDockPart(0, { canSend })}
            title={
              canSend
                ? 'Insert all parts as a [NEXT] sequence — send delivers them as separate messages'
                : `${cannotReason} — copies instead`
            }
            className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-clay-deep hover:text-clay"
          >
            {canSend ? 'Insert all' : 'Copy all'} <Kbd>⌘0</Kbd>
          </button>
        )}
      </div>

      {debugMode && !running && (
        <DebugSection debugPrompt={debugPrompt} profiling={profiling} />
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
  if (view.kind === 'raw') {
    // Parse/sanitizer fallback — read-only, no insert/copy chips.
    return (
      <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
        <div className="cap mb-1 font-sans text-ink-low">raw output</div>
        {view.text}
      </div>
    );
  }
  if (view.kind === 'review') {
    // Analysis output — read-only serif card, never insertable (SPEC §15).
    return (
      <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
        <div className="mb-1.5 flex items-baseline gap-2.5">
          <span className="cap font-sans text-ink-low">chat review</span>
          <span className="num text-[18px] font-semibold text-clay-deep">{view.rating}</span>
          <span className="num text-micro text-ink-low">/ 10</span>
        </div>
        <p>{view.evaluation}</p>
        {view.recommendations.length > 0 && (
          <>
            <div className="cap mt-2.5 mb-1 font-sans text-ink-low">recommendations</div>
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
        <div className="cap mb-1 font-sans text-ink-low">scan</div>
        <span className="font-semibold text-clay-deep">
          {view.cached ? 'Scan loaded from cache — in the panel →' : 'Scan saved to the panel →'}
        </span>
      </button>
    );
  }
  if (view.kind === 'help') {
    return (
      <>
        <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
          <div className="cap mb-1 font-sans text-ink-low">coaching</div>
          {view.coaching}
        </div>
        {view.parts.map((part, i) => (
          <DraftBubble
            key={i}
            text={part}
            partNumber={i + 1}
            label={i === 0 ? 'engaging' : i === 1 ? 'flirty' : null}
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
        canSend ? 'Click to insert into the composer' : `${cannotReason} — click copies instead`
      }
      className={cx(
        DRAFT_BUBBLE_BASE_CLASS,
        'w-full cursor-pointer pr-[104px] text-left transition-colors duration-150',
        'hover:border-solid hover:border-clay hover:bg-[#f9f3ea]',
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
            title="Copy to clipboard"
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
          Open Settings →
        </button>
      )}
    </div>
  );
}

// ─── Footer controls ──────────────────────────────────────────────────────

function TonePills({ running }: { running: boolean }): React.JSX.Element {
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
              ? 'Tone applies to the next generation'
              : active === tone
                ? 'Click to deselect (no tone)'
                : `Use ${tone} tone on the next generation`
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
  const preferSplit = useAiStore((s) => s.preferSplit);
  return (
    <button
      type="button"
      disabled={running}
      onClick={() => {
        if (!running) togglePreferSplit();
      }}
      title="Prefer splitting the reply into multiple messages (applies to the next generation)"
      className={cx(
        'ml-1.5 cursor-pointer rounded-full border px-[11px] py-[3px] text-[12px] font-medium transition-colors duration-150',
        'disabled:cursor-default disabled:opacity-60',
        preferSplit
          ? 'border-clay-line bg-clay-bg text-clay-deep'
          : 'border-transparent text-ink-low hover:text-ink-mid',
      )}
    >
      ⫶ split
    </button>
  );
}

// ─── Debug prompt inspector (settings.debugMode only, SPEC §12) ───────────

function DebugSection({
  debugPrompt,
  profiling,
}: {
  debugPrompt: Record<string, unknown> | null;
  profiling: ProfilingSnapshotPayload | null;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (debugPrompt === null && profiling === null) return null;
  const blocks = debugPrompt !== null ? extractPromptBlocks(debugPrompt) : null;

  function copyPromptText(): void {
    const text =
      blocks !== null
        ? blocks.map((b) => `── ${b.role.toUpperCase()} · cache ${b.cache} ──\n${b.text}`).join('\n\n')
        : JSON.stringify(debugPrompt, null, 2);
    void navigator.clipboard.writeText(text);
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
        <div className="mt-2 space-y-2">
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
                <pre className="max-h-44 overflow-auto px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-ink-mid select-text">
                  {block.text}
                </pre>
              </div>
            ))
          ) : debugPrompt !== null ? (
            <pre className="max-h-44 overflow-auto rounded-chip border border-line bg-bg1 px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-ink-mid select-text">
              {JSON.stringify(debugPrompt, null, 2)}
            </pre>
          ) : null}
          {profiling !== null && profiling.stages.length > 0 && (
            <StageTable profiling={profiling} />
          )}
        </div>
      )}
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
