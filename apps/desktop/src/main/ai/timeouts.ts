// Staged operation timeouts (research §8.5 table is normative; SPEC §8.3).
// Quick features run under one `quick-total` timer; deep features stage
// prep → ttfb → idle/max-stream. TTFB clears on the FIRST provider activity
// signal — not the first text chunk (legacy 1.3.10: Claude thinking blocks
// arrive before text and must not trip a false TTFB timeout).

import {
  DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS,
  DEEP_OPERATION_LLM_MAX_STREAM_TIMEOUT_MS,
  DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS,
  DEEP_OPERATION_PREP_TIMEOUT_MS,
  QUICK_OPERATION_TIMEOUT_MS,
} from '@chatgoose/shared/constants';
import type { FeatureTimeoutBucket } from '@chatgoose/shared/features';

export type OperationTimeoutKey =
  | 'quick-total'
  | 'deep-prep'
  | 'llm-ttfb'
  | 'llm-idle'
  | 'llm-max-stream';

export interface StagedTimeouts {
  /** Arm the start-of-operation timer (quick-total or deep-prep). */
  start(): void;
  /** LLM request dispatched: deep clears prep and arms llm-ttfb. */
  llmRequestStarted(): void;
  /** First provider event/progress/reasoning signal: clears llm-ttfb. */
  providerActivity(): void;
  /** First text chunk: clears llm-ttfb, arms llm-idle + llm-max-stream. */
  firstChunk(): void;
  /** Every subsequent text chunk: resets llm-idle. */
  chunk(): void;
  clearAll(): void;
}

export interface StagedTimeoutsOptions {
  bucket: FeatureTimeoutBucket;
  onTimeout: (key: OperationTimeoutKey) => void;
}

export function createStagedTimeouts(options: StagedTimeoutsOptions): StagedTimeouts {
  const { bucket, onTimeout } = options;
  const timers = new Map<OperationTimeoutKey, ReturnType<typeof setTimeout>>();
  let dead = false;

  function arm(key: OperationTimeoutKey, ms: number): void {
    if (dead) {
      return;
    }
    clear(key);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        if (!dead) {
          onTimeout(key);
        }
      }, ms),
    );
  }

  function clear(key: OperationTimeoutKey): void {
    const timer = timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(key);
    }
  }

  function armDeepStreamCoverage(): void {
    if (bucket !== 'deep') {
      return;
    }
    arm('llm-idle', DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS);
    if (!timers.has('llm-max-stream')) {
      arm('llm-max-stream', DEEP_OPERATION_LLM_MAX_STREAM_TIMEOUT_MS);
    }
  }

  return {
    start() {
      if (bucket === 'quick') {
        arm('quick-total', QUICK_OPERATION_TIMEOUT_MS);
      } else {
        arm('deep-prep', DEEP_OPERATION_PREP_TIMEOUT_MS);
      }
    },

    llmRequestStarted() {
      if (bucket === 'deep') {
        clear('deep-prep');
        arm('llm-ttfb', DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS);
      }
    },

    providerActivity() {
      clear('llm-ttfb');
      armDeepStreamCoverage();
    },

    firstChunk() {
      clear('llm-ttfb');
      armDeepStreamCoverage();
    },

    chunk() {
      armDeepStreamCoverage();
    },

    clearAll() {
      dead = true;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}
