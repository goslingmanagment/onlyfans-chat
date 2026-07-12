// Stage 12: one-time local-DB harvest. Walks the harvested tables in rowid
// order and uploads every row to the kernel's capture lane
// (POST /api/v1/ingest/observations) with DETERMINISTIC clientEventIds
// (UUIDv5 of machineId:table:rowPk), so a re-run or resume re-sends the same
// ids and the lane's idempotency makes it a no-op. Over-uploading is free;
// under-uploading is the only failure mode that matters — cursors advance
// ONLY after a 2xx for the batch that contained the rows.
//
// Excluded tables, per spec §2: chats/accounts/fans (kernel reference data),
// summaries (already hub-synced), media_cache/media_urls (binary cache),
// thread_fetch_log (local ops telemetry), settings (secrets — never leaves).

import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { HubError, type HubIngestObservationEvent } from '@chatgoose/shared/hub/index';
import type { DataLayer } from '../db/index';

export const HARVEST_BATCH_SIZE = 100;
export const HARVEST_BATCH_PACE_MS = 2_000;
const HARVEST_RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
// The hub's ingest route caps bodies at 1 MiB; batches are split to stay
// under this serialized-bytes budget (headroom covers the JSON envelope).
export const HARVEST_MAX_BATCH_BYTES = 900_000;

const INSTALL_ID_KEY = 'harvest.install_id';
const CURSOR_KEY_PREFIX = 'harvest.cursor.';
const PROGRESS_KEY_PREFIX = 'harvest.progress.';
const STARTED_KEY = 'harvest.started_at';
const COMPLETED_KEY = 'harvest.completed_at';

// Fixed namespace for UUIDv5 ids (generated once for this feature; never
// change it — determinism across runs and releases depends on it).
const HARVEST_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export interface HarvestTableSpec {
  table: string;
  kind: string;
  /** Natural-key columns joined into the deterministic id (NOT rowid — VACUUM renumbers rowids). */
  pkColumns: string[];
  /** Column carrying the row's own timestamp for observedAt. */
  observedAtColumn: string;
  /** Column holding the OFAPI account id, when the table is account-scoped. */
  accountColumn: string | null;
  /** Day-typed observedAt (YYYY-MM-DD) → normalized to midnight UTC. */
  dayGranularity?: boolean;
}

export const HARVEST_TABLES: readonly HarvestTableSpec[] = [
  { table: 'messages', kind: 'harvest.messages', pkColumns: ['account_id', 'chat_id', 'message_id'], observedAtColumn: 'created_at', accountColumn: 'account_id' },
  { table: 'fan_transactions', kind: 'harvest.fan_transactions', pkColumns: ['account_id', 'tx_id'], observedAtColumn: 'created_at', accountColumn: 'account_id' },
  { table: 'outbox', kind: 'harvest.outbox', pkColumns: ['local_id'], observedAtColumn: 'created_at', accountColumn: 'account_id' },
  { table: 'message_guard_events', kind: 'harvest.message_guard_events', pkColumns: ['id'], observedAtColumn: 'occurred_at', accountColumn: 'account_id' },
  { table: 'usage_events', kind: 'harvest.usage_events', pkColumns: ['client_event_id'], observedAtColumn: 'created_at', accountColumn: null },
  { table: 'ai_spend_log', kind: 'harvest.ai_spend_log', pkColumns: ['day', 'feature'], observedAtColumn: 'day', accountColumn: null, dayGranularity: true },
  { table: 'credit_log', kind: 'harvest.credit_log', pkColumns: ['day', 'purpose'], observedAtColumn: 'day', accountColumn: null, dayGranularity: true },
];

/** RFC 4122 v5 (SHA-1, name-based) — deterministic per (namespace, name). */
export function uuidV5(name: string, namespace: string = HARVEST_UUID_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface TableProgress {
  walked: number;
  uploaded: number;
  duplicates: number;
  minObservedAt: string | null;
  maxObservedAt: string | null;
  completed: boolean;
}

export interface HarvestStatus {
  state: 'idle' | 'running' | 'paused' | 'error' | 'complete';
  machineId: string | null;
  currentTable: string | null;
  error: string | null;
  tables: Record<string, TableProgress>;
}

export interface HarvestUploader {
  postIngestObservations(args: {
    events: HubIngestObservationEvent[];
  }): Promise<{ accepted: number; duplicates: number }>;
}

export interface HarvestModuleOptions {
  data: DataLayer;
  /** Built lazily per run so key/baseUrl changes apply; throws when unconfigured. */
  createUploader: () => HarvestUploader | Promise<HarvestUploader>;
  appVersion: string;
  schemaVersion: number;
  /** Directory the manifest lands in (Electron userData). */
  manifestDir: string;
  paceMs?: number;
  batchSize?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emptyProgress(): TableProgress {
  return { walked: 0, uploaded: 0, duplicates: 0, minObservedAt: null, maxObservedAt: null, completed: false };
}

export function createHarvestModule(options: HarvestModuleOptions) {
  const { data } = options;
  const paceMs = options.paceMs ?? HARVEST_BATCH_PACE_MS;
  const batchSize = options.batchSize ?? HARVEST_BATCH_SIZE;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? (() => {});

  let running = false;
  let pauseRequested = false;
  let lastError: string | null = null;
  let currentTable: string | null = null;

  function machineId(): string {
    const existing = data.settings.get(INSTALL_ID_KEY);
    if (typeof existing === 'string' && existing.length > 0) {
      return existing;
    }
    const generated = randomUUID();
    data.settings.set(INSTALL_ID_KEY, generated);
    return generated;
  }

  function readCursor(table: string): number {
    const value = data.settings.get(`${CURSOR_KEY_PREFIX}${table}`);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  function readProgress(table: string): TableProgress {
    const value = data.settings.get(`${PROGRESS_KEY_PREFIX}${table}`);
    if (value && typeof value === 'object') {
      return { ...emptyProgress(), ...(value as Partial<TableProgress>) };
    }
    return emptyProgress();
  }

  function writeProgress(table: string, progress: TableProgress): void {
    data.settings.set(`${PROGRESS_KEY_PREFIX}${table}`, progress);
  }

  function observedAtOf(spec: HarvestTableSpec, row: Record<string, unknown>): string {
    const raw = row[spec.observedAtColumn];
    const value = typeof raw === 'string' && raw.length > 0 ? raw : null;
    if (value === null) {
      return new Date(0).toISOString();
    }
    const candidate = spec.dayGranularity ? `${value}T00:00:00.000Z` : value;
    // The hub rejects a WHOLE batch over one unparseable observedAt
    // (whole-batch atomic), and a deterministic 400 halts the harvest with
    // no auto-recovery — so garbage local timestamps degrade to epoch here.
    // The row's real value still rides untouched inside payload.row.
    return Number.isNaN(new Date(candidate).getTime()) ? new Date(0).toISOString() : candidate;
  }

  function toEvent(
    spec: HarvestTableSpec,
    row: Record<string, unknown>,
    machine: string,
  ): HubIngestObservationEvent {
    const pk = spec.pkColumns.map((column) => String(row[column] ?? '')).join(':');
    const account = spec.accountColumn ? row[spec.accountColumn] : null;
    const { __rowid: _rowid, ...cleanRow } = row;
    return {
      clientEventId: uuidV5(`${machine}:${spec.table}:${pk}`),
      kind: spec.kind,
      observedAt: observedAtOf(spec, row),
      payload: {
        table: spec.table,
        machineId: machine,
        schemaVersion: options.schemaVersion,
        ...(typeof account === 'string' && account.length > 0 ? { ofapiAccountId: account } : {}),
        row: cleanRow,
      },
    };
  }

  async function writeQuarantineFile(
    reason: string,
    events: HubIngestObservationEvent[],
  ): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = events.length === 1 ? `-${events[0]!.clientEventId}` : '';
    const file = join(options.manifestDir, `chatgoose-harvest-quarantine-${stamp}${suffix}.json`);
    await writeFile(file, JSON.stringify({ error: reason, events }, null, 2), 'utf8');
    return file;
  }

  async function postChunk(
    uploader: HarvestUploader,
    events: HubIngestObservationEvent[],
  ): Promise<{ accepted: number; duplicates: number }> {
    let attempt = 0;
    for (;;) {
      try {
        return await uploader.postIngestObservations({ events });
      } catch (error) {
        // 400 = contract bug, never retriable verbatim: quarantine + halt.
        // (Same HubError classification as the usage reporter's spool.)
        const name = error instanceof Error ? error.message : String(error);
        if (error instanceof HubError && error.reason === 'bad-request') {
          let file: string;
          try {
            file = await writeQuarantineFile(name, events);
          } catch (writeError) {
            // A failed quarantine write (disk full/permission) must not
            // mask WHY the batch halted — the 400 reason stays in the
            // message; the write failure rides as the cause.
            throw new Error(
              `Harvest batch rejected (400): ${name}; quarantine file write also failed: ` +
                `${writeError instanceof Error ? writeError.message : String(writeError)}`,
              { cause: writeError },
            );
          }
          throw new Error(`Harvest batch rejected (400); quarantined to ${file}`, { cause: error });
        }
        if (attempt >= HARVEST_RETRY_DELAYS_MS.length) {
          throw error instanceof Error ? error : new Error(name);
        }
        await sleep(HARVEST_RETRY_DELAYS_MS[attempt]!);
        attempt += 1;
      }
    }
  }

  async function uploadBatch(
    uploader: HarvestUploader,
    events: HubIngestObservationEvent[],
  ): Promise<{ accepted: number; duplicates: number }> {
    // Split by serialized size so no POST can trip the hub's 1 MiB body cap
    // (a 413 is not retriable and would wedge the walk on this batch forever).
    const totals = { accepted: 0, duplicates: 0 };
    let chunk: HubIngestObservationEvent[] = [];
    let chunkBytes = 0;
    const flush = async () => {
      if (chunk.length === 0) {
        return;
      }
      const result = await postChunk(uploader, chunk);
      totals.accepted += result.accepted;
      totals.duplicates += result.duplicates;
      chunk = [];
      chunkBytes = 0;
    };
    for (const event of events) {
      const size = Buffer.byteLength(JSON.stringify(event), 'utf8');
      if (size > HARVEST_MAX_BATCH_BYTES) {
        // A single event the hub can never accept is preserved for manual
        // replay, but it must also keep the harvest/purge guard armed. Advancing
        // past it and stamping global completion would falsely certify a
        // snapshot that the kernel never received.
        const file = await writeQuarantineFile('event exceeds max batch bytes', [event]);
        log('harvest event quarantined (oversize)', { clientEventId: event.clientEventId, file });
        throw new Error(`Harvest event exceeds max batch bytes; quarantined to ${file}`);
      }
      if (chunk.length > 0 && chunkBytes + size > HARVEST_MAX_BATCH_BYTES) {
        await flush();
      }
      chunk.push(event);
      chunkBytes += size;
    }
    await flush();
    return totals;
  }

  async function walkTable(spec: HarvestTableSpec, uploader: HarvestUploader, machine: string) {
    currentTable = spec.table;
    const progress = readProgress(spec.table);
    if (progress.completed) {
      return;
    }
    const statement = data.db.prepare(
      `SELECT rowid AS __rowid, * FROM ${spec.table} WHERE rowid > @cursor ORDER BY rowid LIMIT @limit`,
    );
    for (;;) {
      if (pauseRequested) {
        return;
      }
      const cursor = readCursor(spec.table);
      const rows = statement.all({ cursor, limit: batchSize }) as Record<string, unknown>[];
      if (rows.length === 0) {
        progress.completed = true;
        writeProgress(spec.table, progress);
        return;
      }
      const events = rows.map((row) => toEvent(spec, row, machine));
      const result = await uploadBatch(uploader, events);
      // Cursor + progress persist ONLY after the 2xx that covered these rows.
      const lastRowid = Number(rows[rows.length - 1]!.__rowid);
      progress.walked += rows.length;
      progress.uploaded += result.accepted;
      progress.duplicates += result.duplicates;
      for (const event of events) {
        progress.minObservedAt = progress.minObservedAt === null || event.observedAt < progress.minObservedAt
          ? event.observedAt
          : progress.minObservedAt;
        progress.maxObservedAt = progress.maxObservedAt === null || event.observedAt > progress.maxObservedAt
          ? event.observedAt
          : progress.maxObservedAt;
      }
      data.settings.set(`${CURSOR_KEY_PREFIX}${spec.table}`, lastRowid);
      writeProgress(spec.table, progress);
      log('harvest batch uploaded', {
        table: spec.table,
        rows: rows.length,
        accepted: result.accepted,
        duplicates: result.duplicates,
      });
      if (rows.length < batchSize) {
        progress.completed = true;
        writeProgress(spec.table, progress);
        return;
      }
      await sleep(paceMs);
    }
  }

  async function writeManifest(machine: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const manifest = {
      machineId: machine,
      appVersion: options.appVersion,
      schemaVersion: options.schemaVersion,
      completedAt: new Date().toISOString(),
      tables: HARVEST_TABLES.map((spec) => {
        const progress = readProgress(spec.table);
        return {
          table: spec.table,
          kind: spec.kind,
          walked: progress.walked,
          uploaded: progress.uploaded,
          duplicates: progress.duplicates,
          minObservedAt: progress.minObservedAt,
          maxObservedAt: progress.maxObservedAt,
        };
      }),
    };
    const file = join(options.manifestDir, `chatgoose-harvest-manifest-${machine}-${stamp}.json`);
    await writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
    return file;
  }

  return {
    /** Purge/prune guard: history must reach the kernel before it may die here. */
    isIncomplete(): boolean {
      const started = data.settings.get(STARTED_KEY);
      const completed = data.settings.get(COMPLETED_KEY);
      return typeof started === 'string' && typeof completed !== 'string';
    },

    status(): HarvestStatus {
      const completed = typeof data.settings.get(COMPLETED_KEY) === 'string';
      const started = typeof data.settings.get(STARTED_KEY) === 'string';
      const tables: Record<string, TableProgress> = {};
      for (const spec of HARVEST_TABLES) {
        tables[spec.table] = readProgress(spec.table);
      }
      return {
        state: running
          ? 'running'
          : lastError !== null
            ? 'error'
            : completed
              ? 'complete'
              : started
                ? 'paused'
                : 'idle',
        machineId: (data.settings.get(INSTALL_ID_KEY) as string | undefined) ?? null,
        currentTable: running ? currentTable : null,
        error: lastError,
        tables,
      };
    },

    pause(): void {
      pauseRequested = true;
    },

    async run(): Promise<{ manifestPath: string | null }> {
      if (running) {
        return { manifestPath: null };
      }
      running = true;
      pauseRequested = false;
      lastError = null;
      try {
        const machine = machineId();
        // Validate the uploader BEFORE persisting the started marker: a Start
        // click with the Hub unconfigured must not arm the purge guard (a
        // zero-progress attempt has captured nothing worth guarding).
        const uploader = await options.createUploader();
        if (typeof data.settings.get(STARTED_KEY) !== 'string') {
          data.settings.set(STARTED_KEY, new Date().toISOString());
        }
        for (const spec of HARVEST_TABLES) {
          await walkTable(spec, uploader, machine);
          if (pauseRequested) {
            return { manifestPath: null };
          }
        }
        const manifestPath = await writeManifest(machine);
        data.settings.set(COMPLETED_KEY, new Date().toISOString());
        log('harvest complete', { manifestPath });
        return { manifestPath };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        log('harvest failed', { error: lastError });
        throw error;
      } finally {
        running = false;
        currentTable = null;
      }
    },
  };
}

export type HarvestModule = ReturnType<typeof createHarvestModule>;
