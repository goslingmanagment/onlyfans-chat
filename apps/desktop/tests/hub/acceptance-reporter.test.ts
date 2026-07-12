// Stage 31 Task 2 — acceptance spool, tracker, and the IPC hook bodies.
// The spool is KV-backed (independent of later schema migrations); delivery
// is telemetry-grade: 400 drops the batch loudly, transients retry, and the
// send-path observer is OBSERVE-ONLY by construction (frozen-args proof).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HubError } from '@chatgoose/shared/hub/index';
import type { HubIngestObservationEvent } from '@chatgoose/shared/hub/index';
import type { DataLayer } from '@main/db/index';
import {
  ACCEPTANCE_SPOOL_SETTINGS_KEY,
  createAcceptanceReporter,
  createAcceptanceTracker,
  enqueueAcceptanceEvent,
  observeSendForAcceptance,
  reportFeedbackAcceptance,
} from '@main/hub/acceptance-reporter';
import type { AcceptanceEventInput, AcceptanceSeam } from '@main/hub/acceptance-reporter';
import { memoryDataLayer } from '../db/helpers';

const AT = '2026-07-06T12:00:00.000Z';

function event(overrides: Partial<AcceptanceEventInput> = {}): AcceptanceEventInput {
  return {
    operationId: 'op-1',
    requestId: 'gen-1',
    feature: 'fast-reply',
    action: 'shown',
    accountId: 'acct_test',
    conversationId: '4242',
    at: AT,
    ...overrides,
  };
}

describe('acceptance reporter (spool + drain)', () => {
  let data: DataLayer;
  let batches: HubIngestObservationEvent[][];
  let failWith: unknown | null;
  let client: { postIngestObservations: ReturnType<typeof vi.fn> } | null;

  beforeEach(() => {
    data = memoryDataLayer();
    batches = [];
    failWith = null;
    client = {
      postIngestObservations: vi.fn((args: { events: HubIngestObservationEvent[] }) => {
        if (failWith !== null) {
          return Promise.reject(failWith);
        }
        batches.push(args.events);
        return Promise.resolve({ accepted: args.events.length, duplicates: 0 });
      }),
    };
  });

  afterEach(() => {
    data.close();
  });

  function makeReporter(warns: string[] = []) {
    return createAcceptanceReporter({
      data,
      getClient: () => client as never,
      onWarn: (message) => warns.push(message),
    });
  }

  it('spools, drains with deterministic ids, and carries the correlation pair', async () => {
    const reporter = makeReporter();
    reporter.enqueue(event());
    reporter.enqueue(event({ action: 'sent', edited: true, at: '2026-07-06T12:01:00.000Z' }));
    expect(reporter.pending()).toBe(2);

    await reporter.flushNow();
    expect(reporter.pending()).toBe(0);
    expect(batches).toHaveLength(1);
    const [shown, sent] = batches[0]!;
    expect(shown).toMatchObject({
      kind: 'ai_acceptance',
      observedAt: AT,
      payload: {
        operationId: 'op-1',
        requestId: 'gen-1',
        generationRef: 'gen-1',
        feature: 'fast-reply',
        action: 'shown',
        conversationId: '4242',
      },
    });
    expect(shown!.clientEventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(sent!.payload).toMatchObject({ action: 'sent', edited: true });

    // Same event → same clientEventId (kernel-side dedup key).
    reporter.enqueue(event());
    await reporter.flushNow();
    expect(batches[1]![0]!.clientEventId).toBe(shown!.clientEventId);
    reporter.dispose();
  });

  it('drains an event durably enqueued while no credential runtime existed', async () => {
    client = null;
    enqueueAcceptanceEvent(data, event({ operationId: 'op-runtime-gap' }));
    const reporter = makeReporter();
    expect(reporter.pending()).toBe(1);

    client = {
      postIngestObservations: vi.fn((args: { events: HubIngestObservationEvent[] }) => {
        batches.push(args.events);
        return Promise.resolve({ accepted: args.events.length, duplicates: 0 });
      }),
    };
    await reporter.flushNow();

    expect(reporter.pending()).toBe(0);
    expect(batches[0]?.[0]?.payload['operationId']).toBe('op-runtime-gap');
    reporter.dispose();
  });

  it('waits while the hub is unconfigured; drops a rejected batch loudly; retries transients', async () => {
    const warns: string[] = [];
    const reporter = makeReporter(warns);

    client = null;
    reporter.enqueue(event());
    await reporter.flushNow();
    expect(reporter.pending()).toBe(1); // spool intact, nothing sent

    client = {
      postIngestObservations: vi.fn(() =>
        Promise.reject(new HubError('bad-request', { message: 'contract bug' }))),
    };
    await reporter.flushNow();
    expect(reporter.pending()).toBe(0); // 400 = dropped, loudly
    expect(warns.some((warning) => warning.includes('dropping 1 events'))).toBe(true);

    reporter.enqueue(event({ operationId: 'op-2' }));
    client = { postIngestObservations: vi.fn(() => Promise.reject(new HubError('network', {}))) };
    await reporter.flushNow();
    expect(reporter.pending()).toBe(1); // transient — retained with attempts+1
    reporter.dispose();
  });

  it('bounds the spool (oldest dropped past the cap)', () => {
    const reporter = makeReporter();
    client = null;
    for (let index = 0; index < 510; index += 1) {
      reporter.enqueue(event({ operationId: `op-${index}`, at: `2026-07-06T12:00:${String(index % 60).padStart(2, '0')}.000Z` }));
    }
    expect(reporter.pending()).toBe(500);
    const spool = data.settings.getParsed(
      ACCEPTANCE_SPOOL_SETTINGS_KEY,
      z.array(z.looseObject({ operationId: z.string() })),
    );
    expect(spool?.[0]?.operationId).toBe('op-10');
    reporter.dispose();
  });

  it.each([
    ['success', null],
    ['bad request', new HubError('bad-request', { message: 'contract bug' })],
    ['transient failure', new HubError('network', { message: 'offline' })],
  ] as const)('preserves an event enqueued during an awaited %s response', async (_label, failure) => {
    let settleFirst: (() => void) | undefined;
    let calls = 0;
    client = {
      postIngestObservations: vi.fn((args: { events: HubIngestObservationEvent[] }) => {
        calls += 1;
        batches.push(args.events);
        if (calls !== 1) {
          return Promise.resolve({ accepted: args.events.length, duplicates: 0 });
        }
        return new Promise<{ accepted: number; duplicates: number }>((resolve, reject) => {
          settleFirst = () => {
            if (failure === null) {
              resolve({ accepted: args.events.length, duplicates: 0 });
            } else {
              reject(failure);
            }
          };
        });
      }),
    };
    const reporter = makeReporter();
    reporter.enqueue(event({ operationId: 'op-in-flight' }));

    const flush = reporter.flushNow();
    await vi.waitFor(() => expect(client?.postIngestObservations).toHaveBeenCalledTimes(1));
    reporter.enqueue(event({ operationId: 'op-concurrent', at: '2026-07-06T12:00:01.000Z' }));
    settleFirst?.();
    await flush;

    if (failure instanceof HubError && failure.reason === 'network') {
      expect(reporter.pending()).toBe(2);
      const stored = data.settings.getParsed(
        ACCEPTANCE_SPOOL_SETTINGS_KEY,
        z.array(z.looseObject({ operationId: z.string(), attempts: z.number() })),
      );
      expect(stored).toEqual([
        expect.objectContaining({ operationId: 'op-in-flight', attempts: 1 }),
        expect.objectContaining({ operationId: 'op-concurrent', attempts: 0 }),
      ]);
    } else {
      expect(batches.flat().map((item) => item.payload['operationId'])).toEqual([
        'op-in-flight',
        'op-concurrent',
      ]);
      expect(reporter.pending()).toBe(0);
    }
    reporter.dispose();
  });

  it('does not drain replacement events through a reporter disposed mid-flight', async () => {
    let settleOld: (() => void) | undefined;
    const oldClient = {
      postIngestObservations: vi.fn((args: { events: HubIngestObservationEvent[] }) => {
        batches.push(args.events);
        return new Promise<{ accepted: number; duplicates: number }>((resolve) => {
          settleOld = () => resolve({ accepted: args.events.length, duplicates: 0 });
        });
      }),
    };
    client = oldClient;
    const retired = makeReporter();
    retired.enqueue(event({ operationId: 'op-old-runtime' }));
    const oldFlush = retired.flushNow();
    await vi.waitFor(() => expect(oldClient.postIngestObservations).toHaveBeenCalledTimes(1));

    retired.dispose();
    enqueueAcceptanceEvent(
      data,
      event({ operationId: 'op-new-runtime', at: '2026-07-06T12:02:00.000Z' }),
    );
    settleOld?.();
    await oldFlush;

    expect(oldClient.postIngestObservations).toHaveBeenCalledTimes(1);
    expect(retired.pending()).toBe(1);

    const newBatches: HubIngestObservationEvent[][] = [];
    client = {
      postIngestObservations: vi.fn(async (args: { events: HubIngestObservationEvent[] }) => {
        newBatches.push(args.events);
        return { accepted: args.events.length, duplicates: 0 };
      }),
    };
    const replacement = makeReporter();
    await replacement.flushNow();
    expect(newBatches.flat().map((item) => item.payload['operationId'])).toEqual([
      'op-new-runtime',
    ]);
    replacement.dispose();
  });

  it('stops an in-flight flush when the same module swaps to a new client', async () => {
    let settleOld: (() => void) | undefined;
    const oldClient = {
      postIngestObservations: vi.fn((args: { events: HubIngestObservationEvent[] }) => {
        batches.push(args.events);
        return new Promise<{ accepted: number; duplicates: number }>((resolve) => {
          settleOld = () => resolve({ accepted: args.events.length, duplicates: 0 });
        });
      }),
    };
    client = oldClient;
    const reporter = makeReporter();
    reporter.enqueue(event({ operationId: 'op-old-client' }));
    const flush = reporter.flushNow();
    await vi.waitFor(() => expect(oldClient.postIngestObservations).toHaveBeenCalledTimes(1));

    enqueueAcceptanceEvent(
      data,
      event({ operationId: 'op-new-client', at: '2026-07-06T12:03:00.000Z' }),
    );
    const newBatches: HubIngestObservationEvent[][] = [];
    client = {
      postIngestObservations: vi.fn(async (args: { events: HubIngestObservationEvent[] }) => {
        newBatches.push(args.events);
        return { accepted: args.events.length, duplicates: 0 };
      }),
    };
    settleOld?.();
    await flush;

    expect(oldClient.postIngestObservations).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(reporter.pending()).toBe(0));
    expect(newBatches.flat().map((item) => item.payload['operationId'])).toEqual([
      'op-new-client',
    ]);
    reporter.dispose();
  });
});

describe('acceptance tracker + IPC hook bodies', () => {
  function makeSeam() {
    const tracker = createAcceptanceTracker();
    const enqueued: AcceptanceEventInput[] = [];
    const seam: AcceptanceSeam = {
      enqueue: (acceptanceEvent) => enqueued.push(acceptanceEvent),
      trackInserted: tracker.trackInserted,
      consumeForSend: tracker.consumeForSend,
    };
    return { seam, enqueued };
  }

  const CONTEXT = {
    operationId: 'op-7',
    requestId: 'gen-7',
    feature: 'fast-reply',
    accountId: 'acct_test',
    chatId: '4242',
    parts: ['hey you 😘', 'miss me?'],
  };

  it('feedback: copied enqueues; inserted also tracks the part text', () => {
    const { seam, enqueued } = makeSeam();
    reportFeedbackAcceptance(seam, CONTEXT, 'copied', null, AT);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ action: 'copied', requestId: 'gen-7' });

    reportFeedbackAcceptance(seam, CONTEXT, 'inserted', 1, AT);
    // Unedited send of the tracked part → sent with edited=false.
    observeSendForAcceptance(seam, { accountId: 'acct_test', chatId: '4242', parts: ['miss me?'] }, AT);
    expect(enqueued.map((item) => item.action)).toEqual(['copied', 'inserted', 'sent']);
    expect(enqueued[2]).toMatchObject({ action: 'sent', edited: false, requestId: 'gen-7' });
  });

  it('sent is one-shot and detects edits', () => {
    const { seam, enqueued } = makeSeam();
    reportFeedbackAcceptance(seam, CONTEXT, 'inserted', 0, AT);
    observeSendForAcceptance(
      seam,
      { accountId: 'acct_test', chatId: '4242', parts: ['hey you 😘 (edited a lot)'] },
      AT,
    );
    expect(enqueued[1]).toMatchObject({ action: 'sent', edited: true });

    // Second send in the same conversation: nothing tracked anymore.
    observeSendForAcceptance(seam, { accountId: 'acct_test', chatId: '4242', parts: ['again'] }, AT);
    expect(enqueued).toHaveLength(2);
  });

  it('send observer is observe-only: frozen args survive, no event without a tracked insert', () => {
    const { seam, enqueued } = makeSeam();
    const args = Object.freeze({
      accountId: 'acct_test',
      chatId: '9999',
      parts: Object.freeze(['plain human message']) as readonly string[],
    });
    // Untracked conversation: nothing enqueued, nothing thrown, args intact.
    observeSendForAcceptance(seam, args, AT);
    expect(enqueued).toHaveLength(0);
    expect(args.parts[0]).toBe('plain human message');
  });
});
