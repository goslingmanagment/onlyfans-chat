// Re-expresses legacy tests/protocol.test.ts boundary-guard cases as zod parse
// behavior. Legacy extension-runtime envelopes (getPopupStatus / getSessionsSnapshot /
// testAgencyHubConnection, tab:*, compare:*) have no desktop equivalent; the facts
// they encoded — unknown type rejected, non-object rejected, optional fields
// type-checked, cancel-by-id works for any operation — are asserted against the
// desktop unions below.

import { describe, expect, it } from 'vitest';
import {
  FEATURE_POLICIES,
} from '../src/features';
import {
  OPERATION_DISCARD_REASONS,
  OPERATION_PHASES,
  operationFeatureSchema,
  operationPhaseSchema,
  parseOperationCommand,
  parseOperationEvent,
  parseSyncEvent,
  replyModeSchema,
  replyToneSchema,
} from '../src/protocol/index';

describe('protocol enums stay aligned with the shared types', () => {
  it('operation features mirror the policy registry', () => {
    expect([...operationFeatureSchema.options]).toEqual(Object.keys(FEATURE_POLICIES));
  });

  it('phases match the legacy OperationPhase union', () => {
    expect([...OPERATION_PHASES]).toEqual([
      'idle',
      'loading-messages',
      'loading-earnings',
      'generating',
      'completed',
      'cancelled',
      'error',
    ]);
  });

  it('reply modes and tones match the legacy unions', () => {
    expect([...replyModeSchema.options]).toEqual(['default', 'preferSplit']);
    expect([...replyToneSchema.options]).toEqual(['none', 'casual', 'flirty', 'upsell', 'spicy']);
  });

  it('discard reasons cover chat_changed / cancelled / superseded', () => {
    expect([...OPERATION_DISCARD_REASONS]).toEqual(['chat_changed', 'cancelled', 'superseded']);
  });
});

describe('operation commands (renderer → main boundary)', () => {
  // Legacy: valid operation:start with feature/tone/mode/forceRegenerate accepted.
  it('accepts a valid operation:start envelope and preserves params', () => {
    const parsed = parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'fast-reply',
      accountId: 'acct_abc123',
      chatId: '4471102',
      params: {
        forceRegenerate: false,
        replyMode: 'default',
        replyTone: 'casual',
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('operation:start');
    if (parsed?.type === 'operation:start') {
      expect(parsed.feature).toBe('fast-reply');
      expect(parsed.params?.replyTone).toBe('casual');
      expect(parsed.params?.replyMode).toBe('default');
      expect(parsed.params?.forceRegenerate).toBe(false);
    }
  });

  it('accepts operation:start without params (all params optional)', () => {
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-2',
      feature: 'improve-draft',
      accountId: 'acct_abc123',
      chatId: '4471102',
      params: { draftText: 'hey you' },
    })).not.toBeNull();
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-3',
      feature: 'ping',
      accountId: 'acct_abc123',
      chatId: '4471102',
    })).not.toBeNull();
  });

  // Legacy: compare:cancel with operationId accepted → cancel-by-id works for any operation.
  it('accepts cancel by operationId', () => {
    expect(parseOperationCommand({
      type: 'operation:cancel',
      operationId: 'compare-1',
    })).toEqual({ type: 'operation:cancel', operationId: 'compare-1' });
  });

  // Legacy: operation:start with feature 'not-a-feature' rejected.
  it('rejects an unknown feature', () => {
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'not-a-feature',
      accountId: 'acct_abc123',
      chatId: '4471102',
    })).toBeNull();
  });

  // Legacy: 'compare' had its own envelope; the operation union does not take it.
  it('rejects compare as an operation feature', () => {
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'compare',
      accountId: 'acct_abc123',
      chatId: '4471102',
    })).toBeNull();
  });

  // Legacy: operation:cancel without operationId rejected.
  it('rejects cancel without operationId', () => {
    expect(parseOperationCommand({ type: 'operation:cancel' })).toBeNull();
  });

  it('rejects missing routing ids and empty ids', () => {
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'fast-reply',
      chatId: '4471102',
    })).toBeNull();
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'fast-reply',
      accountId: '',
      chatId: '4471102',
    })).toBeNull();
  });

  // Legacy: optional fields are type-checked (getPopupStatus tabId '12' rejected).
  it('rejects wrong-typed optional params', () => {
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'fast-reply',
      accountId: 'acct_abc123',
      chatId: '4471102',
      params: { forceRegenerate: 'yes' },
    })).toBeNull();
    expect(parseOperationCommand({
      type: 'operation:start',
      operationId: 'op-1',
      feature: 'fast-reply',
      accountId: 'acct_abc123',
      chatId: '4471102',
      params: { replyTone: 'aggressive' },
    })).toBeNull();
  });

  // Legacy: unknown envelope type and non-object input rejected.
  it('rejects unknown types and non-object input', () => {
    expect(parseOperationCommand({ type: 'unknown' })).toBeNull();
    expect(parseOperationCommand(null)).toBeNull();
    expect(parseOperationCommand('operation:start')).toBeNull();
  });
});

describe('operation events (main → renderer boundary)', () => {
  // Legacy: operation:chunk with string text accepted.
  it('accepts a streaming chunk', () => {
    expect(parseOperationEvent({
      type: 'operation:chunk',
      operationId: 'op-1',
      text: 'hello',
    })).toEqual({ type: 'operation:chunk', operationId: 'op-1', text: 'hello' });
  });

  // Legacy: operation:chunk with numeric text rejected.
  it('rejects a chunk with non-string text', () => {
    expect(parseOperationEvent({
      type: 'operation:chunk',
      operationId: 'op-1',
      text: 42,
    })).toBeNull();
  });

  // Legacy: operation:error with {key, code, message} accepted.
  it('accepts an error event with a CG-coded user-facing error', () => {
    const parsed = parseOperationEvent({
      type: 'operation:error',
      operationId: 'op-1',
      error: {
        key: 'unknown_error',
        code: 'CG-UNK-01',
        message: 'Unknown error.',
      },
    });
    expect(parsed).not.toBeNull();
    if (parsed?.type === 'operation:error') {
      expect(parsed.error.code).toBe('CG-UNK-01');
    }
  });

  it('rejects an error event without a structured error', () => {
    expect(parseOperationEvent({
      type: 'operation:error',
      operationId: 'op-1',
      error: 'boom',
    })).toBeNull();
    expect(parseOperationEvent({
      type: 'operation:error',
      operationId: 'op-1',
      error: { message: 'no key or code' },
    })).toBeNull();
  });

  it('accepts progress for every phase, with page progress', () => {
    for (const phase of operationPhaseSchema.options) {
      expect(parseOperationEvent({
        type: 'operation:progress',
        operationId: 'op-1',
        feature: 'fan-summary',
        phase,
      })).not.toBeNull();
    }
    expect(parseOperationEvent({
      type: 'operation:progress',
      operationId: 'op-1',
      feature: 'fan-summary',
      phase: 'loading-messages',
      currentPage: 3,
      targetPages: 15,
      message: 'Loading messages… 3/15 pages',
    })).not.toBeNull();
  });

  it('rejects progress with an unknown phase or wrong-typed page numbers', () => {
    expect(parseOperationEvent({
      type: 'operation:progress',
      operationId: 'op-1',
      feature: 'fan-summary',
      phase: 'warming-up',
    })).toBeNull();
    expect(parseOperationEvent({
      type: 'operation:progress',
      operationId: 'op-1',
      feature: 'fan-summary',
      phase: 'loading-messages',
      currentPage: '3',
    })).toBeNull();
  });

  it('accepts a complete event with result, spend summary, and profiling snapshot', () => {
    expect(parseOperationEvent({
      type: 'operation:complete',
      operationId: 'op-1',
      feature: 'fast-reply',
      result: {
        rawText: 'hey [NEXT] you',
        parts: ['hey', 'you'],
        splitModeRequested: true,
      },
      llmSpend: {
        totalTokens: 1200,
        inputTokens: 1000,
        cacheWriteTokens: 0,
        cacheReadTokens: 800,
        outputTokens: 200,
        totalUsd: 0.012,
        uncachedUsd: 0.02,
        cacheEffectUsd: 0.008,
        cacheEffectKind: 'saved',
        cacheWriteUsd: 0,
        cacheReadUsd: 0.001,
        approximate: false,
      },
      profiling: {
        elapsedMs: 5400,
        activeLabel: null,
        logEntries: [{ elapsedMs: 100, message: 'resolved identity' }],
        stages: [
          {
            key: 'llm-stream',
            label: 'LLM stream',
            status: 'completed',
            startedElapsedMs: 1200,
            endedElapsedMs: 5300,
            durationMs: 4100,
          },
        ],
      },
    })).not.toBeNull();
  });

  // Legacy: required object payload given null rejected (tab:state state:null case).
  it('rejects a complete event whose result payload is null or malformed', () => {
    expect(parseOperationEvent({
      type: 'operation:complete',
      operationId: 'op-1',
      feature: 'fast-reply',
      result: null,
    })).toBeNull();
    expect(parseOperationEvent({
      type: 'operation:complete',
      operationId: 'op-1',
      feature: 'fast-reply',
      result: { parts: ['no rawText'] },
    })).toBeNull();
  });

  it('accepts discarded events only with a known reason', () => {
    for (const reason of OPERATION_DISCARD_REASONS) {
      expect(parseOperationEvent({
        type: 'operation:discarded',
        operationId: 'op-1',
        reason,
      })).not.toBeNull();
    }
    expect(parseOperationEvent({
      type: 'operation:discarded',
      operationId: 'op-1',
      reason: 'because',
    })).toBeNull();
    expect(parseOperationEvent({
      type: 'operation:discarded',
      operationId: 'op-1',
    })).toBeNull();
  });

  it('accepts a debug prompt snapshot event', () => {
    expect(parseOperationEvent({
      type: 'operation:debugPrompt',
      operationId: 'op-1',
      feature: 'fast-reply',
      snapshot: { system: '…', user: '…' },
    })).not.toBeNull();
  });

  it('rejects unknown event types and non-object input', () => {
    expect(parseOperationEvent({ type: 'tab:state', state: null })).toBeNull();
    expect(parseOperationEvent(null)).toBeNull();
    expect(parseOperationEvent(undefined)).toBeNull();
  });
});

describe('sync events (SPEC §6 union, IPC today / hub SSE later)', () => {
  it('accepts every variant of the union', () => {
    expect(parseSyncEvent({ type: 'chatListUpdated', accountId: 'acct_abc123' })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'messageReceived',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987654',
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'messageSent',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987655',
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'ppvUnlocked',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987656',
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'tipReceived',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987657',
      amountUsd: 5,
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'presence',
      accountId: 'acct_abc123',
      chatId: '4471102',
      online: true,
      lastSeenAt: 1765432100000,
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'typing',
      accountId: 'acct_abc123',
      chatId: '4471102',
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'accountAuthChanged',
      accountId: 'acct_abc123',
      authenticated: false,
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'readStateChanged',
      accountId: 'acct_abc123',
      chatId: '4471102',
      lastReadMessageId: '987650',
    })).not.toBeNull();
  });

  it('tip amount is optional (never fabricated) but must be a non-negative number', () => {
    expect(parseSyncEvent({
      type: 'tipReceived',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987657',
    })).not.toBeNull();
    expect(parseSyncEvent({
      type: 'tipReceived',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987657',
      amountUsd: '5.00',
    })).toBeNull();
    expect(parseSyncEvent({
      type: 'tipReceived',
      accountId: 'acct_abc123',
      chatId: '4471102',
      messageId: '987657',
      amountUsd: -1,
    })).toBeNull();
  });

  it('rejects malformed frames', () => {
    expect(parseSyncEvent({ type: 'messageReceived', accountId: 'acct_abc123' })).toBeNull();
    expect(parseSyncEvent({ type: 'presence', accountId: 'acct_abc123', chatId: '4471102', online: 'yes' })).toBeNull();
    expect(parseSyncEvent({ type: 'accountAuthChanged', accountId: 'acct_abc123' })).toBeNull();
    expect(parseSyncEvent({ type: 'chatListUpdated', accountId: '' })).toBeNull();
    expect(parseSyncEvent({ type: 'somethingElse', accountId: 'acct_abc123' })).toBeNull();
    expect(parseSyncEvent(null)).toBeNull();
  });
});
