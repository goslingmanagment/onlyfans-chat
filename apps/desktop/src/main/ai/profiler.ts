// Operation pipeline profiler (research §8.6; SPEC §12). Active only in debug
// mode — the coordinator swaps in NO_OP_PROFILER otherwise (legacy NO_OP_PROFILER
// discipline) so production operations never pay for snapshots.

import type { ProfilingSnapshotPayload } from '@chatgoose/shared/protocol/index';

/** Stage keys carried from the legacy pipeline (research §8.6 list). */
export const PROFILER_STAGE_LABELS: Record<string, string> = {
  'resolve-identity': 'Resolve identity',
  'summary-cache-check': 'Summary cache check',
  'load-messages': 'Load messages',
  'ping-analysis': 'Ping analysis',
  'group-lookup': 'Group lookup',
  'account-name-lookup': 'Account name lookup',
  'earnings': 'Earnings',
  'subscription-lookup': 'Subscription lookup',
  'prompt-build': 'Prompt build',
  'llm-ttfb': 'LLM time to first byte',
  'llm-stream': 'LLM stream',
};

export interface ProfilerStageHandle {
  complete(detail?: string): void;
  fail(detail?: string): void;
  skip(): void;
}

export interface OperationProfiler {
  readonly enabled: boolean;
  stage(key: string): ProfilerStageHandle;
  log(message: string): void;
  /** undefined when profiling is disabled (no `profiling` field on frames). */
  snapshot(): ProfilingSnapshotPayload | undefined;
  /** Marks any still-running stage failed (terminal error/discard path). */
  failActive(detail?: string): void;
}

const NO_OP_STAGE: ProfilerStageHandle = {
  complete() {},
  fail() {},
  skip() {},
};

export const NO_OP_PROFILER: OperationProfiler = {
  enabled: false,
  stage() {
    return NO_OP_STAGE;
  },
  log() {},
  snapshot() {
    return undefined;
  },
  failActive() {},
};

interface StageRecord {
  key: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedElapsedMs: number;
  endedElapsedMs?: number;
  durationMs?: number;
  detail?: string;
}

export function createOperationProfiler(nowFn: () => number = Date.now): OperationProfiler {
  const startedAt = nowFn();
  const stages: StageRecord[] = [];
  const logEntries: Array<{ elapsedMs: number; message: string }> = [];

  function elapsed(): number {
    return Math.max(0, nowFn() - startedAt);
  }

  function end(
    record: StageRecord,
    status: 'completed' | 'failed' | 'skipped',
    detail?: string,
  ): void {
    if (record.status !== 'running') {
      return;
    }
    record.status = status;
    record.endedElapsedMs = elapsed();
    record.durationMs = record.endedElapsedMs - record.startedElapsedMs;
    if (detail !== undefined) {
      record.detail = detail;
    }
  }

  return {
    enabled: true,

    stage(key) {
      const record: StageRecord = {
        key,
        label: PROFILER_STAGE_LABELS[key] ?? key,
        status: 'running',
        startedElapsedMs: elapsed(),
      };
      stages.push(record);
      return {
        complete(detail) {
          end(record, 'completed', detail);
        },
        fail(detail) {
          end(record, 'failed', detail);
        },
        skip() {
          end(record, 'skipped');
        },
      };
    },

    log(message) {
      logEntries.push({ elapsedMs: elapsed(), message });
    },

    snapshot() {
      const active = stages.find((stage) => stage.status === 'running');
      return {
        elapsedMs: elapsed(),
        activeLabel: active ? active.label : null,
        logEntries: logEntries.map((entry) => ({ ...entry })),
        stages: stages.map((stage) => ({ ...stage })),
      };
    },

    failActive(detail) {
      for (const stage of stages) {
        if (stage.status === 'running') {
          end(stage, 'failed', detail);
        }
      }
    },
  };
}
