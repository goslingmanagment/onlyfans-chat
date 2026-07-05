// Stage 12 harvest: deterministic ids, cursor resume without loss, manifest
// counts, purge guard, and the excluded-table pin.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DataLayer } from '@main/db/index';
import type { HubIngestObservationEvent } from '@chatgoose/shared/hub/index';
import {
  createHarvestModule,
  HARVEST_TABLES,
  uuidV5,
} from '@main/harvest/index';
import { memoryDataLayer } from '../db/helpers';

let data: DataLayer;
let manifestDir: string;

beforeEach(() => {
  data = memoryDataLayer();
  manifestDir = mkdtempSync(join(tmpdir(), 'harvest-test-'));
});

afterEach(() => {
  data.close();
  rmSync(manifestDir, { recursive: true, force: true });
});

function seedMessage(messageId: string, overrides?: { deleted?: number }) {
  data.db
    .prepare(
      'INSERT INTO messages (account_id, chat_id, message_id, created_at, is_sent_by_me, text_plain, raw, deleted) ' +
        "VALUES ('acct_hv', '555', @messageId, @createdAt, 0, 'hello', '{}', @deleted)",
    )
    .run({ messageId, createdAt: `2026-01-0${(Number(messageId) % 9) + 1}T00:00:00.000Z`, deleted: overrides?.deleted ?? 0 });
}

function collectingUploader() {
  const batches: HubIngestObservationEvent[][] = [];
  return {
    batches,
    uploader: {
      async postIngestObservations({ events }: { events: HubIngestObservationEvent[] }) {
        batches.push(events);
        return { accepted: events.length, duplicates: 0 };
      },
    },
  };
}

function buildModule(uploader: { postIngestObservations: never } | object, batchSize = 2) {
  return createHarvestModule({
    data,
    createUploader: () => uploader as never,
    appVersion: '0.1.29',
    schemaVersion: 16,
    manifestDir,
    batchSize,
    paceMs: 0,
    sleep: async () => {},
  });
}

describe('harvest module', () => {
  it('walks tables with deterministic ids and writes a reconciling manifest', async () => {
    seedMessage('1');
    seedMessage('2', { deleted: 1 });
    seedMessage('3');
    data.fanTransactions.upsertMany([
      { accountId: 'acct_hv', txId: 'tx-1', fanId: '555', amount: 5, net: 4, type: 'tip', createdAt: '2026-01-05T00:00:00.000Z' },
    ]);

    const { batches, uploader } = collectingUploader();
    const harvest = buildModule(uploader);
    const { manifestPath } = await harvest.run();

    const events = batches.flat();
    const messageEvents = events.filter((event) => event.kind === 'harvest.messages');
    expect(messageEvents).toHaveLength(3);
    // Deterministic id: UUIDv5 of machineId:table:composite-pk.
    const machineId = harvest.status().machineId!;
    expect(messageEvents[0]!.clientEventId).toBe(uuidV5(`${machineId}:messages:acct_hv:555:1`));
    expect(messageEvents[0]!.payload).toMatchObject({
      table: 'messages',
      machineId,
      schemaVersion: 16,
      ofapiAccountId: 'acct_hv',
    });
    const txEvents = events.filter((event) => event.kind === 'harvest.fan_transactions');
    expect(txEvents).toHaveLength(1);
    expect(txEvents[0]!.clientEventId).toBe(uuidV5(`${machineId}:fan_transactions:acct_hv:tx-1`));

    expect(manifestPath).not.toBeNull();
    const manifest = JSON.parse(readFileSync(manifestPath!, 'utf8')) as {
      machineId: string;
      tables: Array<{ table: string; walked: number; uploaded: number; duplicates: number }>;
    };
    expect(manifest.machineId).toBe(machineId);
    const byTable = new Map(manifest.tables.map((entry) => [entry.table, entry]));
    expect(byTable.get('messages')).toMatchObject({ walked: 3, uploaded: 3, duplicates: 0 });
    expect(byTable.get('fan_transactions')).toMatchObject({ walked: 1, uploaded: 1 });
    expect(byTable.get('outbox')).toMatchObject({ walked: 0 });

    expect(harvest.status().state).toBe('complete');
    expect(harvest.isIncomplete()).toBe(false);
  });

  it('resumes from the cursor after a failure without gap or re-send', async () => {
    for (const id of ['1', '2', '3', '4', '5']) {
      seedMessage(id);
    }

    // First run: batch 1 (2 rows) lands, batch 2 dies on network forever.
    const seen: string[] = [];
    let fail = true;
    const flaky = {
      async postIngestObservations({ events }: { events: HubIngestObservationEvent[] }) {
        if (fail && seen.length > 0) {
          throw new Error('network down');
        }
        seen.push(...events.map((event) => event.clientEventId));
        return { accepted: events.length, duplicates: 0 };
      },
    };
    const first = buildModule(flaky);
    await expect(first.run()).rejects.toThrow('network down');
    expect(seen).toHaveLength(2);
    expect(first.isIncomplete()).toBe(true);
    expect(first.status().state).toBe('error');

    // Second run resumes at row 3 — nothing re-sent, nothing skipped.
    fail = false;
    const second = buildModule(flaky);
    const { manifestPath } = await second.run();
    expect(manifestPath).not.toBeNull();
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    const machineId = second.status().machineId!;
    expect(seen[2]).toBe(uuidV5(`${machineId}:messages:acct_hv:555:3`));
    expect(second.isIncomplete()).toBe(false);

    // Walked counts across both runs cover every row exactly once.
    const manifest = JSON.parse(readFileSync(manifestPath!, 'utf8')) as {
      tables: Array<{ table: string; walked: number }>;
    };
    expect(manifest.tables.find((entry) => entry.table === 'messages')).toMatchObject({ walked: 5 });
  });

  it('never touches excluded tables and keeps the harvested set pinned', () => {
    expect(HARVEST_TABLES.map((spec) => spec.table).sort()).toEqual([
      'ai_spend_log',
      'credit_log',
      'fan_transactions',
      'message_guard_events',
      'messages',
      'outbox',
      'usage_events',
    ]);
    const excluded = ['settings', 'summaries', 'chats', 'accounts', 'fans', 'media_urls', 'thread_fetch_log'];
    for (const table of excluded) {
      expect(HARVEST_TABLES.some((spec) => spec.table === table)).toBe(false);
    }
  });
});
