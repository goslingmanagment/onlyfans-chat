import { describe, expect, it, vi } from 'vitest';
import {
  AI_ACCEPTANCE_PARTS_RETENTION_COUNT,
  createAiAcceptanceQueries,
  createChangeBus,
  createDataLayer,
} from '@main/db/index';
import { memoryDataLayer, tempDbFile, TEST_DRIVER } from './helpers';

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

    const accepted = data.aiAcceptance.acceptOnce(
      OPERATION.operationId,
      '2026-07-12T10:01:00.000Z',
    );
    expect(accepted.status).toBe('accepted');
    expect(accepted.status === 'accepted' ? accepted.operation.parts : []).toEqual(OPERATION.parts);
    expect(data.aiAcceptance.get(OPERATION.operationId)?.parts).toEqual([]);
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

  it('never restores cleared reply text when duplicate feedback remembers the operation again', () => {
    const data = memoryDataLayer();
    data.aiAcceptance.remember(OPERATION);
    expect(
      data.aiAcceptance.acceptOnce(OPERATION.operationId, '2026-07-12T10:01:00.000Z').status,
    ).toBe('accepted');

    // The feedback handler can still hold coordinator context on a repeated
    // Copy/Insert click and therefore calls remember() before observing that
    // the durable operation was already accepted.
    data.aiAcceptance.remember(OPERATION);

    expect(data.aiAcceptance.get(OPERATION.operationId)).toMatchObject({
      acceptedAt: '2026-07-12T10:01:00.000Z',
      parts: [],
    });
    expect(
      data.aiAcceptance.acceptOnce(OPERATION.operationId, '2026-07-12T10:02:00.000Z').status,
    ).toBe('duplicate');
    data.close();
  });

  it('rejects unknown operation ids without creating spend rows', () => {
    const data = memoryDataLayer();
    expect(
      data.aiAcceptance.acceptOnce('00000000-0000-4000-8000-0000000000aa', '2026-07-12T10:00:00.000Z'),
    ).toEqual({ status: 'unknown' });
    expect(data.aiSpendLog.rowsSince('2026-07-12')).toEqual([]);
  });

  it('discards only unaccepted operation correlation on a Hub-origin switch', () => {
    const data = memoryDataLayer();
    data.aiAcceptance.remember(OPERATION);
    const accepted = { ...OPERATION, operationId: '00000000-0000-4000-8000-000000000098' };
    data.aiAcceptance.remember(accepted);
    expect(data.aiAcceptance.acceptOnce(accepted.operationId, '2026-07-12T10:01:00.000Z').status)
      .toBe('accepted');

    expect(data.aiAcceptance.discardUnaccepted()).toBe(1);
    expect(data.aiAcceptance.get(OPERATION.operationId)).toBeNull();
    expect(data.aiAcceptance.get(accepted.operationId)?.acceptedAt).toBe(
      '2026-07-12T10:01:00.000Z',
    );
    data.close();
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

  it('bounds full parts to the renderer-compatible operation window', () => {
    const data = memoryDataLayer();
    for (let index = 0; index <= AI_ACCEPTANCE_PARTS_RETENTION_COUNT; index += 1) {
      data.aiAcceptance.remember({
        ...OPERATION,
        operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        parts: [`answer ${index}`],
        knownAt: new Date(Date.parse(OPERATION.knownAt) + index * 1_000).toISOString(),
      });
    }

    const oldest = data.aiAcceptance.get('00000000-0000-4000-8000-000000000000');
    expect(oldest).toMatchObject({
      feature: OPERATION.feature,
      accountId: OPERATION.accountId,
      conversationId: OPERATION.conversationId,
      acceptedAt: null,
      parts: [],
    });
    expect(
      data.aiAcceptance.get(
        `00000000-0000-4000-8000-${String(AI_ACCEPTANCE_PARTS_RETENTION_COUNT).padStart(12, '0')}`,
      )?.parts,
    ).toEqual([`answer ${AI_ACCEPTANCE_PARTS_RETENTION_COUNT}`]);
  });

  it('orders the full-parts window by completion instead of first-token time', () => {
    const data = memoryDataLayer();
    const slowId = '00000000-0000-4000-8000-999999999999';
    data.aiAcceptance.remember({
      ...OPERATION,
      operationId: slowId,
      parts: [],
      knownAt: '2026-07-12T09:00:00.000Z',
    });
    for (let index = 1; index <= AI_ACCEPTANCE_PARTS_RETENTION_COUNT; index += 1) {
      data.aiAcceptance.remember({
        ...OPERATION,
        operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        parts: [`answer ${index}`],
        knownAt: new Date(Date.parse(OPERATION.knownAt) + index * 1_000).toISOString(),
      });
    }

    data.aiAcceptance.remember({
      ...OPERATION,
      operationId: slowId,
      parts: ['slow answer completed last'],
      knownAt: '2026-07-12T11:00:00.000Z',
    });

    expect(data.aiAcceptance.get(slowId)?.parts).toEqual(['slow answer completed last']);
    expect(data.aiAcceptance.get('00000000-0000-4000-8000-000000000001')?.parts).toEqual([]);
  });

  // Two opens of an encrypted file database (SQLCipher key derivation plus
  // migrations each time) took 5-6 s on windows-latest and hit the 5 s default
  // there (runs 35535813678, 35535098084).
  it('scrubs all full text from the previous app session but keeps correlation metadata', () => {
    const temp = tempDbFile();
    const first = createDataLayer({
      driverPath: TEST_DRIVER,
      filePath: temp.file,
      encryptionKey: 'test-ai-acceptance-key',
      bus: createChangeBus(0),
    });
    first.aiAcceptance.remember(OPERATION);
    const acceptedOperation = {
      ...OPERATION,
      operationId: '00000000-0000-4000-8000-000000000100',
    };
    first.aiAcceptance.remember(acceptedOperation);
    expect(first.aiAcceptance.acceptOnce(
      acceptedOperation.operationId,
      '2026-07-12T10:05:00.000Z',
    ).status).toBe('accepted');
    first.close();

    const reopened = createDataLayer({
      driverPath: TEST_DRIVER,
      filePath: temp.file,
      encryptionKey: 'test-ai-acceptance-key',
      bus: createChangeBus(0),
    });
    expect(reopened.aiAcceptance.get(OPERATION.operationId)).toMatchObject({
      operationId: OPERATION.operationId,
      feature: OPERATION.feature,
      requestId: OPERATION.requestId,
      accountId: OPERATION.accountId,
      conversationId: OPERATION.conversationId,
      acceptedAt: null,
      parts: [],
    });
    expect(reopened.aiAcceptance.get(acceptedOperation.operationId)).toMatchObject({
      operationId: acceptedOperation.operationId,
      acceptedAt: '2026-07-12T10:05:00.000Z',
      parts: [],
    });
    reopened.close();
    temp.cleanup();
  }, 30_000);
});
