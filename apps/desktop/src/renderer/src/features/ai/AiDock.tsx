// The AI dock (DESIGN §1 AI surface): streaming draft-message bubbles above
// the composer. Companion mode (P2): primary action is COPY — clicking a
// bubble copies it; ⌘1..9 copy part N, ⌘0 copies all parts.

import { useState } from 'react';
import type {
  ProfilingSnapshotPayload,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import { useUiStore } from '../../state/uiStore';
import { useSettingsCache } from '../../state/settingsCache';
import { useSettings } from '../../bridge/queries';
import { cx } from '../../lib/cx';
import { Kbd } from '../../design/Kbd';
import { AiDockSlot } from '../conversation/AiDockSlot';
import { StreamingDrafts, DRAFT_BUBBLE_BASE_CLASS } from './StreamingDrafts';
import {
  useAiStore,
  copyDockPart,
  dismissDock,
  cancelActiveOperation,
  regenerateActiveOperation,
  setDockTone,
  togglePreferSplit,
} from './aiStore';
import {
  DOCK_FEATURE_LABELS,
  DOCK_TONES,
  copyChipLabel,
  errorHint,
  extractPromptBlocks,
  formatOpCost,
  toggleTone,
  type DockView,
} from './dockLogic';

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

const PHASE_LABELS: Record<string, string> = {
  'idle': 'STARTING',
  'loading-messages': 'LOADING MESSAGES',
  'loading-earnings': 'LOADING EARNINGS',
  'generating': 'GENERATING',
};

function AiDock(): React.JSX.Element | null {
  const op = useAiStore((s) => s.op);
  const status = useAiStore((s) => s.status);
  const phase = useAiStore((s) => s.phase);
  const view = useAiStore((s) => s.view);
  const error = useAiStore((s) => s.error);
  const spend = useAiStore((s) => s.spend);
  const profiling = useAiStore((s) => s.profiling);
  const debugPrompt = useAiStore((s) => s.debugPrompt);
  const debugMode = useSettingsCache((s) => s.debugMode);

  if (op === null) return null;
  const running = status === 'running';
  const parts = view !== null && view.kind !== 'raw' ? view.parts : [];

  return (
    <div className="overflow-hidden rounded-card border border-line-strong bg-bg1 shadow-soft">
      {/* top */}
      <div className="flex items-center gap-2.5 px-3.5 pt-[9px]">
        <span className="text-[12.5px] font-semibold text-ink-mid">
          <i className="mr-[5px] not-italic text-clay">✳</i>
          {DOCK_FEATURE_LABELS[op.feature]}
        </span>
        {running && (
          <span className="num text-micro tracking-[0.08em] text-ink-low">
            {PHASE_LABELS[phase] ?? phase.toUpperCase()}
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
        {status === 'completed' && view !== null && <CompletedView view={view} />}
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
            ↻ Regenerate
          </button>
        )}
        <span className="flex-1" />
        {status === 'completed' && parts.length > 1 && (
          <button
            type="button"
            onClick={() => copyDockPart(0)}
            className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-clay-deep hover:text-clay"
          >
            Copy all <Kbd>⌘0</Kbd>
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

function CompletedView({ view }: { view: DockView }): React.JSX.Element {
  if (view.kind === 'raw') {
    // Parse/sanitizer fallback — read-only, no copy chips.
    return (
      <div className={cx(DRAFT_BUBBLE_BASE_CLASS, 'border-solid border-line bg-bg2')}>
        <div className="cap mb-1 font-sans text-ink-low">raw output</div>
        {view.text}
      </div>
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
          />
        ))}
      </>
    );
  }
  return (
    <>
      {view.parts.map((part, i) => (
        <DraftBubble key={i} text={part} partNumber={i + 1} label={null} />
      ))}
    </>
  );
}

function DraftBubble({
  text,
  partNumber,
  label,
}: {
  text: string;
  partNumber: number;
  label: string | null;
}): React.JSX.Element {
  const copied = useAiStore((s) => s.copiedIndex === partNumber || s.copiedIndex === 0);
  return (
    <button
      type="button"
      onClick={() => copyDockPart(partNumber)}
      title="Click to copy"
      className={cx(
        DRAFT_BUBBLE_BASE_CLASS,
        'w-full cursor-pointer pr-[104px] text-left transition-colors duration-150',
        'hover:border-solid hover:border-clay hover:bg-[#f9f3ea]',
      )}
    >
      {label !== null && <div className="cap mb-1 font-sans text-ink-low">{label}</div>}
      {text}
      <span
        className={cx(
          'num absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full border px-[9px] py-[2px]',
          'text-micro tracking-[0.08em]',
          copied
            ? 'border-green-line bg-green-bg text-green'
            : 'border-clay-line bg-bg1 text-clay-deep',
        )}
      >
        {copied ? 'COPIED' : copyChipLabel(partNumber)}
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
