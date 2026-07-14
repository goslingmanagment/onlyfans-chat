// Stage 12 harvest: deterministic revision ids, failure resume without loss,
// mutable-row stabilization, manifest counts, purge guard, and table pins.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataLayer } from '@main/db/index';
import { HubError, type HubIngestObservationEvent } from '@chatgoose/shared/hub/index';
import {
  createHarvestModule,
  finishHarvestDeltaBeforePurge,
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

function seedMessage(messageId: string, overrides?: { deleted?: number; text?: string }) {
  data.db
    .prepare(
      'INSERT INTO messages (account_id, chat_id, message_id, created_at, is_sent_by_me, text_plain, raw, deleted) ' +
        "VALUES ('acct_hv', '555', @messageId, @createdAt, 0, @text, '{}', @deleted)",
    )
    .run({
      messageId,
      createdAt: `2026-01-0${(Number(messageId) % 9) + 1}T00:00:00.000Z`,
      text: overrides?.text ?? 'hello',
      deleted: overrides?.deleted ?? 0,
    });
}

function uploadedRevisionCount(table = 'messages'): number {
  const row = data.db
    .prepare('SELECT COUNT(*) AS count FROM harvest_uploaded_revisions WHERE table_name = @table')
    .get({ table }) as { count: number };
  return row.count;
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

function buildModule(
  uploader: { postIngestObservations: never } | object,
  batchSize = 2,
  schemaVersion = 19,
) {
  return createHarvestModule({
    data,
    createUploader: () => uploader as never,
    appVersion: '0.1.29',
    schemaVersion,
    manifestDir,
    batchSize,
    paceMs: 0,
    sleep: async () => {},
  });
}

describe('harvest module', () => {
  it('prepares and reuses a stable machine id without starting or constructing an uploader', () => {
    const createUploader = vi.fn(() => {
      throw new Error('uploader must stay lazy during identity preflight');
    });
    const harvest = createHarvestModule({
      data,
      createUploader,
      appVersion: '0.1.42',
      schemaVersion: 19,
      manifestDir,
    });

    expect(harvest.status()).toMatchObject({ state: 'idle', machineId: null });
    const prepared = harvest.prepareIdentity();

    expect(prepared.machineId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(harvest.prepareIdentity()).toEqual(prepared);
    expect(harvest.status()).toMatchObject({ state: 'idle', machineId: prepared.machineId });
    expect(harvest.isIncomplete()).toBe(false);
    expect(data.settings.get('harvest.install_id')).toBe(prepared.machineId);
    expect(data.settings.get('harvest.started_at')).toBeUndefined();
    expect(createUploader).not.toHaveBeenCalled();

    const reloaded = createHarvestModule({
      data,
      createUploader,
      appVersion: '0.1.42',
      schemaVersion: 19,
      manifestDir,
    });
    expect(reloaded.prepareIdentity()).toEqual(prepared);
    expect(createUploader).not.toHaveBeenCalled();
  });

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
    // Deterministic v2 id: UUIDv5 of machine + table + natural key + content.
    const machineId = harvest.status().machineId!;
    expect(messageEvents[0]!.clientEventId).toBe(
      uuidV5(
        `${machineId}:v2:messages:${String(messageEvents[0]!.payload.rowKey)}:` +
          String(messageEvents[0]!.payload.contentHash),
      ),
    );
    expect(messageEvents[0]!.payload).toMatchObject({
      table: 'messages',
      machineId,
      schemaVersion: 19,
      ofapiAccountId: 'acct_hv',
    });
    const txEvents = events.filter((event) => event.kind === 'harvest.fan_transactions');
    expect(txEvents).toHaveLength(1);
    expect(txEvents[0]!.clientEventId).toBe(
      uuidV5(
        `${machineId}:v2:fan_transactions:${String(txEvents[0]!.payload.rowKey)}:` +
          String(txEvents[0]!.payload.contentHash),
      ),
    );

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

  it('resumes from durable fingerprints after a failure without gap or re-send', async () => {
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
    expect(uploadedRevisionCount()).toBe(2);
    expect(first.isIncomplete()).toBe(true);
    expect(first.status().state).toBe('error');

    // Second full scan skips the two durable fingerprints and uploads row 3+.
    fail = false;
    const second = buildModule(flaky);
    const { manifestPath } = await second.run();
    expect(manifestPath).not.toBeNull();
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(uploadedRevisionCount()).toBe(5);
    expect(seen[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.isIncomplete()).toBe(false);

    // Walked counts across both runs cover every row exactly once.
    const manifest = JSON.parse(readFileSync(manifestPath!, 'utf8')) as {
      tables: Array<{ table: string; walked: number }>;
    };
    expect(manifest.tables.find((entry) => entry.table === 'messages')).toMatchObject({ walked: 5 });
  });

  it('quarantines a hub 400 without retrying or persisting fingerprints', async () => {
    seedMessage('1');
    seedMessage('2');

    let calls = 0;
    const rejecting = {
      async postIngestObservations(): Promise<{ accepted: number; duplicates: number }> {
        calls += 1;
        throw new HubError('bad-request', { message: 'schema drift' });
      },
    };
    const harvest = buildModule(rejecting);
    await expect(harvest.run()).rejects.toThrow('quarantined to');
    // Deterministic rejection: exactly one POST, no retry ladder.
    expect(calls).toBe(1);
    expect(uploadedRevisionCount()).toBe(0);
    expect(harvest.isIncomplete()).toBe(true);

    const quarantineFiles = readdirSync(manifestDir)
      .filter((name) => name.startsWith('chatgoose-harvest-quarantine-'));
    expect(quarantineFiles).toHaveLength(1);
    const quarantined = JSON.parse(
      readFileSync(join(manifestDir, quarantineFiles[0]!), 'utf8'),
    ) as { events: HubIngestObservationEvent[] };
    expect(quarantined.events).toHaveLength(2);
  });

  it('does not arm the purge guard when the uploader cannot even be created', async () => {
    seedMessage('1');
    const harvest = createHarvestModule({
      data,
      createUploader: () => {
        throw new Error('Hub is not configured');
      },
      appVersion: '0.1.29',
      schemaVersion: 19,
      manifestDir,
      batchSize: 2,
      paceMs: 0,
      sleep: async () => {},
    });
    expect(harvest.isIncomplete()).toBe(false);
    await expect(harvest.run()).rejects.toThrow('Hub is not configured');
    expect(harvest.status().state).toBe('error');
    // Zero-progress attempt: purge must stay available.
    expect(harvest.isIncomplete()).toBe(false);
  });

  it('arms the purge guard while uploader creation is still pending', async () => {
    let releaseUploader!: () => void;
    const { uploader } = collectingUploader();
    const uploaderPending = new Promise<void>((resolve) => {
      releaseUploader = resolve;
    });
    const harvest = createHarvestModule({
      data,
      createUploader: async () => {
        await uploaderPending;
        return uploader;
      },
      appVersion: '0.1.29',
      schemaVersion: 19,
      manifestDir,
      batchSize: 2,
      paceMs: 0,
      sleep: async () => {},
    });

    const run = harvest.run();
    expect(harvest.isIncomplete()).toBe(true);

    releaseUploader();
    await run;
    expect(harvest.isIncomplete()).toBe(false);
  });

  it('dynamically re-arms after completion and reopens a completed table', async () => {
    seedMessage('1');
    const firstUpload = collectingUploader();
    const harvest = buildModule(firstUpload.uploader);
    await harvest.run();
    expect(harvest.isIncomplete()).toBe(false);

    seedMessage('2');
    expect(harvest.isIncomplete()).toBe(true);
    expect(harvest.status().state).toBe('paused');
    expect(harvest.status().tables.messages?.completed).toBe(false);

    const secondUpload = collectingUploader();
    const resumed = buildModule(secondUpload.uploader);
    await resumed.run();
    const messageIds = secondUpload.batches
      .flat()
      .filter((event) => event.kind === 'harvest.messages')
      .map((event) => (event.payload.row as { message_id: string }).message_id);
    expect(messageIds).toEqual(['2']);
    expect(resumed.isIncomplete()).toBe(false);
    expect(resumed.status().tables.messages).toMatchObject({ walked: 2, uploaded: 2 });
  });

  it('atomically supersedes the canonical latest manifest after a later revision', async () => {
    seedMessage('1', { text: 'first' });
    const first = buildModule(collectingUploader().uploader);
    const firstResult = await first.run();
    const machineId = first.status().machineId!;
    const latestPath = join(
      manifestDir,
      `chatgoose-harvest-manifest-${machineId}-latest.json`,
    );
    const firstSnapshot = JSON.parse(readFileSync(firstResult.manifestPath!, 'utf8')) as {
      reconcileUsing: string;
      tables: Array<{ table: string; walked: number }>;
    };
    expect(firstSnapshot.reconcileUsing).toBe(
      `chatgoose-harvest-manifest-${machineId}-latest.json`,
    );
    expect(JSON.parse(readFileSync(latestPath, 'utf8'))).toEqual(firstSnapshot);

    data.db.prepare("UPDATE messages SET text_plain = 'second' WHERE message_id = '1'").run();
    const second = buildModule(collectingUploader().uploader);
    const secondResult = await second.run();
    const latest = JSON.parse(readFileSync(latestPath, 'utf8')) as {
      reconcileUsing: string;
      tables: Array<{ table: string; walked: number }>;
    };
    const secondSnapshot = JSON.parse(readFileSync(secondResult.manifestPath!, 'utf8'));

    expect(latest).toEqual(secondSnapshot);
    expect(latest.tables.find((entry) => entry.table === 'messages')).toMatchObject({ walked: 2 });
    expect(firstSnapshot.tables.find((entry) => entry.table === 'messages')).toMatchObject({ walked: 1 });
  });

  it('uploads an UPDATE revision at the same rowid with a new deterministic id', async () => {
    seedMessage('1', { text: 'before' });
    const initialUpload = collectingUploader();
    const harvest = buildModule(initialUpload.uploader);
    await harvest.run();
    const initialEvent = initialUpload.batches.flat().find((event) => event.kind === 'harvest.messages')!;
    const rowid = (data.db.prepare("SELECT rowid FROM messages WHERE message_id = '1'").get() as { rowid: number }).rowid;

    data.db.prepare("UPDATE messages SET text_plain = 'after' WHERE message_id = '1'").run();
    expect(
      (data.db.prepare("SELECT rowid FROM messages WHERE message_id = '1'").get() as { rowid: number }).rowid,
    ).toBe(rowid);
    expect(harvest.isIncomplete()).toBe(true);

    const updateUpload = collectingUploader();
    const resumed = buildModule(updateUpload.uploader);
    await resumed.run();
    const updateEvent = updateUpload.batches.flat().find((event) => event.kind === 'harvest.messages')!;
    expect((updateEvent.payload.row as { text_plain: string }).text_plain).toBe('after');
    expect(updateEvent.clientEventId).not.toBe(initialEvent.clientEventId);
    expect(uploadedRevisionCount()).toBe(2);
    expect(resumed.status().tables.messages).toMatchObject({ walked: 2, uploaded: 2 });
  });

  it('finds a new logical row after DELETE reuses an old rowid', async () => {
    seedMessage('1');
    await buildModule(collectingUploader().uploader).run();
    const oldRowid = (data.db.prepare("SELECT rowid FROM messages WHERE message_id = '1'").get() as { rowid: number }).rowid;

    data.db.prepare("DELETE FROM messages WHERE message_id = '1'").run();
    seedMessage('2', { text: 'rowid reused' });
    const newRowid = (data.db.prepare("SELECT rowid FROM messages WHERE message_id = '2'").get() as { rowid: number }).rowid;
    expect(newRowid).toBe(oldRowid);

    const deltaUpload = collectingUploader();
    const resumed = buildModule(deltaUpload.uploader);
    await resumed.run();
    const messageEvents = deltaUpload.batches.flat().filter((event) => event.kind === 'harvest.messages');
    expect(messageEvents).toHaveLength(1);
    expect((messageEvents[0]!.payload.row as { message_id: string }).message_id).toBe('2');
    expect(uploadedRevisionCount()).toBe(2);
    expect(resumed.isIncomplete()).toBe(false);
  });

  it('retries the full scan when content changes while upload is awaiting 2xx', async () => {
    seedMessage('1', { text: 'before await' });
    const messageEvents: HubIngestObservationEvent[] = [];
    let changed = false;
    const harvest = buildModule({
      async postIngestObservations({ events }: { events: HubIngestObservationEvent[] }) {
        const messages = events.filter((event) => event.kind === 'harvest.messages');
        messageEvents.push(...messages);
        if (!changed && messages.length > 0) {
          changed = true;
          data.db.prepare("UPDATE messages SET text_plain = 'during await' WHERE message_id = '1'").run();
          await Promise.resolve();
        }
        return { accepted: events.length, duplicates: 0 };
      },
    });

    await harvest.run();

    expect(messageEvents.map((event) => (event.payload.row as { text_plain: string }).text_plain))
      .toEqual(['before await', 'during await']);
    expect(new Set(messageEvents.map((event) => event.clientEventId)).size).toBe(2);
    expect(uploadedRevisionCount()).toBe(2);
    expect(harvest.status().tables.messages).toMatchObject({ walked: 2, completed: true });
  });

  it('upgrades completed v1 state with one full v2 scan and cumulative reconciliation counts', async () => {
    seedMessage('1');
    data.settings.set('harvest.started_at', '2026-07-12T00:00:00.000Z');
    data.settings.set('harvest.completed_at', '2026-07-12T00:01:00.000Z');
    data.settings.set('harvest.cursor.messages', 1);
    data.settings.set('harvest.progress.messages', {
      walked: 1,
      uploaded: 1,
      duplicates: 0,
      minObservedAt: '2026-01-02T00:00:00.000Z',
      maxObservedAt: '2026-01-02T00:00:00.000Z',
      completed: true,
    });
    const upload = collectingUploader();
    const harvest = buildModule(upload.uploader);

    expect(harvest.isIncomplete()).toBe(true);
    const { manifestPath } = await harvest.run();

    expect(upload.batches.flat().filter((event) => event.kind === 'harvest.messages')).toHaveLength(1);
    expect(uploadedRevisionCount()).toBe(1);
    expect(data.settings.get('harvest.format_version')).toBe(2);
    expect(harvest.status().tables.messages).toMatchObject({ walked: 2, uploaded: 2 });
    const manifest = JSON.parse(readFileSync(manifestPath!, 'utf8')) as {
      harvestFormatVersion: number;
      tables: Array<{ table: string; walked: number; uploaded: number; duplicates: number }>;
    };
    expect(manifest.harvestFormatVersion).toBe(2);
    expect(manifest.tables.find((entry) => entry.table === 'messages'))
      .toMatchObject({ walked: 2, uploaded: 2, duplicates: 0 });
    expect(harvest.isIncomplete()).toBe(false);
  });

  it('forces a new content revision when the harvested source schema changes', async () => {
    seedMessage('1', { text: 'same row bytes' });
    const firstUpload = collectingUploader();
    const first = buildModule(firstUpload.uploader, 2, 19);
    await first.run();
    const firstEvent = firstUpload.batches.flat().find(
      (event) => event.kind === 'harvest.messages',
    )!;
    expect(data.settings.get('harvest.source_schema_version')).toBe(19);

    const upgradedUpload = collectingUploader();
    const upgraded = buildModule(upgradedUpload.uploader, 2, 20);
    expect(upgraded.isIncomplete()).toBe(true);
    await upgraded.run();
    const upgradedEvent = upgradedUpload.batches.flat().find(
      (event) => event.kind === 'harvest.messages',
    )!;

    expect(upgradedEvent.clientEventId).not.toBe(firstEvent.clientEventId);
    expect((upgradedEvent.payload.row as { text_plain: string }).text_plain).toBe('same row bytes');
    expect(data.settings.get('harvest.source_schema_version')).toBe(20);
    expect(uploadedRevisionCount()).toBe(2);
    expect(upgraded.status().tables.messages).toMatchObject({ walked: 2, uploaded: 2 });
    expect(upgraded.isIncomplete()).toBe(false);
  });

  it('retains historical hashes so content reversion does not re-upload or inflate counts', async () => {
    seedMessage('1', { text: 'A' });
    const first = buildModule(collectingUploader().uploader);
    await first.run();

    data.db.prepare("UPDATE messages SET text_plain = 'B' WHERE message_id = '1'").run();
    await buildModule(collectingUploader().uploader).run();
    expect(uploadedRevisionCount()).toBe(2);

    data.db.prepare("UPDATE messages SET text_plain = 'A' WHERE message_id = '1'").run();
    const revertedUpload = collectingUploader();
    const reverted = buildModule(revertedUpload.uploader);
    await reverted.run();

    expect(revertedUpload.batches.flat().filter((event) => event.kind === 'harvest.messages'))
      .toHaveLength(0);
    expect(uploadedRevisionCount()).toBe(2);
    expect(reverted.status().tables.messages).toMatchObject({ walked: 2, uploaded: 2 });
    expect(reverted.isIncomplete()).toBe(false);
  });

  it('recovers after Core 2xx but local fingerprint commit failure using the same id', async () => {
    seedMessage('1');
    data.db.exec(`
      CREATE TRIGGER fail_harvest_fingerprint
      BEFORE INSERT ON harvest_uploaded_revisions
      BEGIN
        SELECT RAISE(ABORT, 'simulated local commit failure');
      END;
    `);
    const acceptedIds: string[] = [];
    const first = buildModule({
      async postIngestObservations({ events }: { events: HubIngestObservationEvent[] }) {
        acceptedIds.push(...events.map((event) => event.clientEventId));
        return { accepted: events.length, duplicates: 0 };
      },
    });

    await expect(first.run()).rejects.toThrow('simulated local commit failure');
    expect(uploadedRevisionCount()).toBe(0);
    expect(first.status().tables.messages).toMatchObject({ walked: 0, uploaded: 0 });
    data.db.exec('DROP TRIGGER fail_harvest_fingerprint');

    const resumedIds: string[] = [];
    const resumed = buildModule({
      async postIngestObservations({ events }: { events: HubIngestObservationEvent[] }) {
        resumedIds.push(...events.map((event) => event.clientEventId));
        return { accepted: 0, duplicates: events.length };
      },
    });
    await resumed.run();

    expect(resumedIds).toEqual(acceptedIds);
    expect(uploadedRevisionCount()).toBe(1);
    expect(resumed.status().tables.messages).toMatchObject({ walked: 1, uploaded: 0, duplicates: 1 });
  });

  it('repeats full passes until a row created behind the walk is uploaded', async () => {
    seedMessage('1');
    await buildModule(collectingUploader().uploader).run();

    data.fanTransactions.upsertMany([
      { accountId: 'acct_hv', txId: 'tx-race', fanId: '555', amount: 5, net: 4, type: 'tip', createdAt: '2026-01-05T00:00:00.000Z' },
    ]);
    let insertedBehindWalk = false;
    const uploadedKinds: string[] = [];
    const resumed = buildModule({
      async postIngestObservations({ events }: { events: HubIngestObservationEvent[] }) {
        uploadedKinds.push(...events.map((event) => event.kind));
        if (!insertedBehindWalk && events.some((event) => event.kind === 'harvest.fan_transactions')) {
          insertedBehindWalk = true;
          seedMessage('2');
        }
        return { accepted: events.length, duplicates: 0 };
      },
    });

    await resumed.run();

    expect(uploadedKinds).toEqual(['harvest.fan_transactions', 'harvest.messages']);
    expect(resumed.status().tables.messages).toMatchObject({ walked: 2, completed: true });
    expect(resumed.isIncomplete()).toBe(false);
  });

  it('uploads a delta created during runtime drain before terminal purge continues', async () => {
    seedMessage('1');
    await buildModule(collectingUploader().uploader).run();

    // Purge's first guard is clear. Its runtime drain then lets one already-
    // accepted DB continuation finish before all producers are quiescent.
    const finalUpload = collectingUploader();
    const harvest = buildModule(finalUpload.uploader);
    expect(harvest.isIncomplete()).toBe(false);
    seedMessage('2');

    await finishHarvestDeltaBeforePurge(harvest);

    const messageIds = finalUpload.batches
      .flat()
      .filter((event) => event.kind === 'harvest.messages')
      .map((event) => (event.payload.row as { message_id: string }).message_id);
    expect(messageIds).toEqual(['2']);
    expect(harvest.isIncomplete()).toBe(false);
  });

  it('fails closed when a terminal purge races an already-running harvest', async () => {
    expect.assertions(2);
    const stillRunning = {
      isIncomplete: () => true,
      run: async () => ({ manifestPath: null }),
    };

    await expect(finishHarvestDeltaBeforePurge(stillRunning)).rejects.toThrow(
      'local data was not purged',
    );
    expect(stillRunning.isIncomplete()).toBe(true);
  });

  it('quarantines an oversized row and keeps purge blocked until it is reconciled', async () => {
    seedMessage('1');
    // A row whose serialized event alone exceeds the byte budget.
    data.db
      .prepare(
        'INSERT INTO messages (account_id, chat_id, message_id, created_at, is_sent_by_me, text_plain, raw, deleted) ' +
          "VALUES ('acct_hv', '555', '2', '2026-01-02T00:00:00.000Z', 0, @text, '{}', 0)",
      )
      .run({ text: 'x'.repeat(950_000) });

    const { uploader } = collectingUploader();
    const harvest = buildModule(uploader);
    await expect(harvest.run()).rejects.toThrow('quarantined to');
    // The oversize row is preserved for manual replay, not silently dropped.
    const quarantineFiles = readdirSync(manifestDir)
      .filter((name) => name.startsWith('chatgoose-harvest-quarantine-'));
    expect(quarantineFiles).toHaveLength(1);
    expect(harvest.status().state).toBe('error');
    expect(harvest.isIncomplete()).toBe(true);
  });

  it('degrades a garbage local timestamp to epoch instead of poisoning the batch', async () => {
    // One unparseable observedAt would 400 the WHOLE hub batch (whole-batch
    // atomic) and halt the harvest with no recovery — the walker must never
    // emit one.
    data.db
      .prepare(
        'INSERT INTO messages (account_id, chat_id, message_id, created_at, is_sent_by_me, text_plain, raw, deleted) ' +
          "VALUES ('acct_hv', '555', '1', 'garbage-not-a-date', 0, 'old row', '{}', 0)",
      )
      .run();
    seedMessage('2');

    const { batches, uploader } = collectingUploader();
    const harvest = buildModule(uploader);
    await harvest.run();

    const events = batches.flat().filter((event) => event.kind === 'harvest.messages');
    expect(events).toHaveLength(2);
    const byRow = new Map(
      events.map((event) => [(event.payload.row as { message_id: string }).message_id, event]),
    );
    expect(byRow.get('1')!.observedAt).toBe(new Date(0).toISOString());
    // The raw value still rides in the payload for later canonicalization.
    expect((byRow.get('1')!.payload.row as { created_at: string }).created_at)
      .toBe('garbage-not-a-date');
    expect(byRow.get('2')!.observedAt).not.toBe(new Date(0).toISOString());
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
    const excluded = [
      'settings',
      'summaries',
      'chats',
      'accounts',
      'fans',
      'media_urls',
      'thread_fetch_log',
      'ai_acceptance_ops',
      'harvest_uploaded_revisions',
    ];
    for (const table of excluded) {
      expect(HARVEST_TABLES.some((spec) => spec.table === table)).toBe(false);
    }
  });
});
