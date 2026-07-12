import { describe, expect, it, vi } from 'vitest';
import { createAiAcceptanceQueries } from '@main/db/index';
import { memoryDataLayer } from './helpers';

const OPERATION = {
  operationId: '00000000-0000-4000-8000-000000000099',
  feature: 'fan-summary',
  day: '2026-07-12',
  requestId: 'req-1',
  accountId: 'acct_1',
  conversationId: '101',
  parts: ['first', 'second'],
  knownAt: '2026-07-12T10:00:00.000Z',
} as const;

describe('ai_acceptance_ops', () => {
  it('durably claims an operation once and increments its authoritative feature once', () => {
    const data = memoryDataLayer();
    data.aiAcceptance.remember(OPERATION);

    expect(data.aiAcceptance.acceptOnce(OPERATION.operationId, '2026-07-12T10:01:00.000Z').status)
      .toBe('accepted');
    expect(data.aiAcceptance.acceptOnce(OPERATION.operationId, '2026-07-12T10:02:00.000Z').status)
      .toBe('duplicate');
    expect(data.aiSpendLog.rowsSince(OPERATION.day)).toMatchObject([
      { day: OPERATION.day, feature: OPERATION.feature, inserted: 1 },
    ]);

    // A fresh query object over the same DB models coordinator/IPC replacement.
    const afterReplacement = createAiAcceptanceQueries(data.db, data.aiSpendLog);
    expect(afterReplacement.acceptOnce(OPERATION.operationId, '2026-07-12T10:03:00.000Z').status)
      .toBe('duplicate');
  });

  it('rejects unknown operation ids without creating spend rows', () => {
    const data = memoryDataLayer();
    expect(
      data.aiAcceptance.acceptOnce('00000000-0000-4000-8000-0000000000aa', '2026-07-12T10:00:00.000Z'),
    ).toEqual({ status: 'unknown' });
    expect(data.aiSpendLog.rowsSince('2026-07-12')).toEqual([]);
  });

  it('does not let a duplicate operation id rewrite authoritative metadata', () => {
    const data = memoryDataLayer();
    data.aiAcceptance.remember(OPERATION);
    data.aiAcceptance.remember({
      ...OPERATION,
      feature: 'ping',
      day: '2026-07-13',
      requestId: null,
      accountId: null,
      conversationId: null,
      parts: [],
    });
    expect(data.aiAcceptance.get(OPERATION.operationId)).toMatchObject({
      feature: OPERATION.feature,
      day: OPERATION.day,
      requestId: OPERATION.requestId,
      accountId: OPERATION.accountId,
      conversationId: OPERATION.conversationId,
      parts: OPERATION.parts,
    });
  });

  it('fills completed parts without letting empty or duplicate metadata erase them', () => {
    const data = memoryDataLayer();
    data.aiAcceptance.remember({ ...OPERATION, parts: [] });
    data.aiAcceptance.remember(OPERATION);
    data.aiAcceptance.remember({ ...OPERATION, feature: 'ping', parts: [] });

    expect(data.aiAcceptance.get(OPERATION.operationId)).toMatchObject({
      feature: OPERATION.feature,
      parts: OPERATION.parts,
    });
  });

  it('rolls back the claim when the metric increment fails', () => {
    const data = memoryDataLayer();
    const markInserted = vi.fn(() => {
      throw new Error('ledger write failed');
    });
    const queries = createAiAcceptanceQueries(data.db, { markInserted });
    queries.remember(OPERATION);

    expect(() => queries.acceptOnce(OPERATION.operationId, '2026-07-12T10:01:00.000Z'))
      .toThrow(/ledger write failed/);
    expect(queries.get(OPERATION.operationId)?.acceptedAt).toBeNull();
  });
});
