// Stage 12: revision-aware local-DB harvest. Dirty-table revisions come from
// SQLite triggers; each scan uploads natural-key + content-hash revisions to
// the kernel capture lane (POST /api/v1/ingest/observations). A durable local
// fingerprint ledger advances ONLY after the covering 2xx, so retry/resume is
// idempotent while UPDATEs and rowid reuse remain observable.
//
// Excluded tables, per spec §2: chats/accounts/fans (kernel reference data),
// summaries (already hub-synced), media_cache/media_urls (binary cache),
// thread_fetch_log (local ops telemetry), settings (secrets — never leaves).

import { createHash, randomUUID } from 'node:crypto';
import { copyFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { HubError, type HubIngestObservationEvent } from '@chatgoose/shared/hub/index';
import type { DataLayer } from '../db/index';

export const HARVEST_BATCH_SIZE = 100;
export const HARVEST_BATCH_PACE_MS = 2_000;
const HARVEST_RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
// The hub's ingest route caps bodies at 1 MiB; batches are split to stay
// under this serialized-bytes budget (headroom covers the JSON envelope).
export const HARVEST_MAX_BATCH_BYTES = 900_000;

const INSTALL_ID_KEY = 'harvest.install_id';
const PROGRESS_KEY_PREFIX = 'harvest.progress.';
const REVISION_KEY_PREFIX = 'harvest.revision.';
const STABLE_REVISION_KEY_PREFIX = 'harvest.stable_revision.';
const STARTED_KEY = 'harvest.started_at';
const COMPLETED_KEY = 'harvest.completed_at';
const FORMAT_VERSION_KEY = 'harvest.format_version';
const SOURCE_SCHEMA_VERSION_KEY = 'harvest.source_schema_version';
const HARVEST_FORMAT_VERSION = 2;

// Fixed namespace for UUIDv5 ids (generated once for this feature; never
// change it — determinism across runs and releases depends on it).
const HARVEST_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export interface HarvestTableSpec {
  table: string;
  kind: string;
  /** Natural-key columns identifying a logical row across rowid changes. */
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

interface RowRevision {
  rowKey: string;
  contentHash: string;
  event: HubIngestObservationEvent;
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

  function ensureMachineId(): string {
    const existing = data.settings.get(INSTALL_ID_KEY);
    if (typeof existing === 'string' && existing.length > 0) {
      return existing;
    }
    const generated = randomUUID();
    data.settings.set(INSTALL_ID_KEY, generated);
    return generated;
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

  function readIntegerSetting(key: string, fallback: number): number {
    const value = data.settings.get(key);
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : fallback;
  }

  function readRevision(table: string): number {
    return readIntegerSetting(`${REVISION_KEY_PREFIX}${table}`, 0);
  }

  function readStableRevision(table: string): number {
    return readIntegerSetting(`${STABLE_REVISION_KEY_PREFIX}${table}`, -1);
  }

  function isTableDirty(table: string): boolean {
    return readRevision(table) !== readStableRevision(table);
  }

  function hasDirtyTables(): boolean {
    return HARVEST_TABLES.some((spec) => isTableDirty(spec.table));
  }

  function isCurrentFormat(): boolean {
    return (
      data.settings.get(FORMAT_VERSION_KEY) === HARVEST_FORMAT_VERSION &&
      data.settings.get(SOURCE_SCHEMA_VERSION_KEY) === options.schemaVersion
    );
  }

  function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
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

  function toRevision(
    spec: HarvestTableSpec,
    row: Record<string, unknown>,
    machine: string,
  ): RowRevision {
    const rowKey = JSON.stringify(spec.pkColumns.map((column) => row[column] ?? null));
    const account = spec.accountColumn ? row[spec.accountColumn] : null;
    const { __rowid: _rowid, ...cleanRow } = row;
    const contentHash = createHash('sha256')
      .update(canonicalJson({ schemaVersion: options.schemaVersion, row: cleanRow }))
      .digest('hex');
    return {
      rowKey,
      contentHash,
      event: {
        clientEventId: uuidV5(
          `${machine}:v${HARVEST_FORMAT_VERSION}:${spec.table}:${rowKey}:${contentHash}`,
        ),
        kind: spec.kind,
        observedAt: observedAtOf(spec, row),
        payload: {
          table: spec.table,
          machineId: machine,
          schemaVersion: options.schemaVersion,
          harvestFormatVersion: HARVEST_FORMAT_VERSION,
          rowKey,
          contentHash,
          ...(typeof account === 'string' && account.length > 0 ? { ofapiAccountId: account } : {}),
          row: cleanRow,
        },
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

  const fingerprintExistsStatement = data.db.prepare(
    'SELECT 1 AS present FROM harvest_uploaded_revisions ' +
      'WHERE table_name = @tableName AND row_key = @rowKey AND content_hash = @contentHash',
  );
  const insertFingerprintStatement = data.db.prepare(
    'INSERT OR IGNORE INTO harvest_uploaded_revisions ' +
      '(table_name, row_key, content_hash, uploaded_at) ' +
      'VALUES (@tableName, @rowKey, @contentHash, @uploadedAt)',
  );

  function fingerprintExists(table: string, revision: RowRevision): boolean {
    const row = fingerprintExistsStatement.get({
      tableName: table,
      rowKey: revision.rowKey,
      contentHash: revision.contentHash,
    }) as { present: number } | undefined;
    return row?.present === 1;
  }

  async function scanTableUntilStable(
    spec: HarvestTableSpec,
    uploader: HarvestUploader,
    machine: string,
    forceFullScan: boolean,
  ): Promise<void> {
    currentTable = spec.table;
    const progress = readProgress(spec.table);
    if (!forceFullScan && !isTableDirty(spec.table)) {
      if (!progress.completed) {
        progress.completed = true;
        writeProgress(spec.table, progress);
      }
      return;
    }
    if (progress.completed) {
      progress.completed = false;
      writeProgress(spec.table, progress);
    }
    const statement = data.db.prepare(
      `SELECT rowid AS __rowid, * FROM ${spec.table} ` +
        'WHERE rowid > @cursor ORDER BY rowid LIMIT @limit',
    );

    // A revision change at any point invalidates only the stable checkpoint,
    // not the successful fingerprints. The next full pass skips those exact
    // key+hash revisions and finds UPDATEs or reused rowids deterministically.
    for (;;) {
      const scanRevision = readRevision(spec.table);
      let cursor = 0;
      for (;;) {
        if (pauseRequested) {
          return;
        }
        const rows = statement.all({ cursor, limit: batchSize }) as Record<string, unknown>[];
        if (rows.length === 0) {
          break;
        }
        cursor = Number(rows[rows.length - 1]!.__rowid);
        const unseen = rows
          .map((row) => toRevision(spec, row, machine))
          .filter((revision) => !fingerprintExists(spec.table, revision));
        if (unseen.length > 0) {
          const events = unseen.map((revision) => revision.event);
          const result = await uploadBatch(uploader, events);
          if (result.accepted + result.duplicates !== events.length) {
            throw new Error(
              `Harvest acknowledgement mismatch for ${spec.table}: ` +
                `${result.accepted} accepted + ${result.duplicates} duplicates for ${events.length} events`,
            );
          }
          // Fingerprints and cumulative manifest counters commit together,
          // strictly after every event in this logical batch received a 2xx.
          data.db.transaction(() => {
            const uploadedAt = new Date().toISOString();
            for (const revision of unseen) {
              insertFingerprintStatement.run({
                tableName: spec.table,
                rowKey: revision.rowKey,
                contentHash: revision.contentHash,
                uploadedAt,
              });
            }
            progress.walked += unseen.length;
            progress.uploaded += result.accepted;
            progress.duplicates += result.duplicates;
            for (const event of events) {
              progress.minObservedAt =
                progress.minObservedAt === null || event.observedAt < progress.minObservedAt
                  ? event.observedAt
                  : progress.minObservedAt;
              progress.maxObservedAt =
                progress.maxObservedAt === null || event.observedAt > progress.maxObservedAt
                  ? event.observedAt
                  : progress.maxObservedAt;
            }
            writeProgress(spec.table, progress);
          });
          log('harvest batch uploaded', {
            table: spec.table,
            rows: unseen.length,
            accepted: result.accepted,
            duplicates: result.duplicates,
          });
        }
        if (rows.length < batchSize) {
          break;
        }
        await sleep(paceMs);
      }
      if (pauseRequested) {
        return;
      }
      if (readRevision(spec.table) !== scanRevision) {
        continue;
      }
      // No await may separate this comparison from the stable-revision write;
      // same-process SQLite producers therefore cannot interleave a mutation.
      data.db.transaction(() => {
        data.settings.set(`${STABLE_REVISION_KEY_PREFIX}${spec.table}`, scanRevision);
        progress.completed = true;
        writeProgress(spec.table, progress);
      });
      return;
    }
  }

  async function writeManifest(machine: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const latestName = `chatgoose-harvest-manifest-${machine}-latest.json`;
    const manifest = {
      machineId: machine,
      appVersion: options.appVersion,
      schemaVersion: options.schemaVersion,
      harvestFormatVersion: HARVEST_FORMAT_VERSION,
      reconcileUsing: latestName,
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

  async function publishLatestManifest(manifestPath: string, machine: string): Promise<string> {
    const latest = join(
      options.manifestDir,
      `chatgoose-harvest-manifest-${machine}-latest.json`,
    );
    const temporary = `${latest}.${randomUUID()}.tmp`;
    await copyFile(manifestPath, temporary);
    await rename(temporary, latest);
    return latest;
  }

  return {
    /** Purge/prune guard: history must reach the kernel before it may die here. */
    isIncomplete(): boolean {
      // Arm immediately, including while createUploader is still pending. A
      // purge racing that await must not delete the DB out from under the run.
      if (running) {
        return true;
      }
      const started = data.settings.get(STARTED_KEY);
      const completed = data.settings.get(COMPLETED_KEY);
      if (typeof started !== 'string') {
        return false;
      }
      if (typeof completed !== 'string' || !isCurrentFormat()) {
        return true;
      }
      // Source-table triggers make INSERT/UPDATE/DELETE dirtiness observable,
      // including content changes at the same rowid and rowid reuse.
      return hasDirtyTables();
    },

    status(): HarvestStatus {
      const completed =
        typeof data.settings.get(COMPLETED_KEY) === 'string' &&
        isCurrentFormat() &&
        !hasDirtyTables();
      const started = typeof data.settings.get(STARTED_KEY) === 'string';
      const tables: Record<string, TableProgress> = {};
      for (const spec of HARVEST_TABLES) {
        const progress = readProgress(spec.table);
        tables[spec.table] = progress.completed && (!isCurrentFormat() || isTableDirty(spec.table))
          ? { ...progress, completed: false }
          : progress;
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

    /**
     * Local-only owner preflight. Persists the stable install identity without
     * constructing an uploader, starting a harvest, or touching the network.
     */
    prepareIdentity(): { machineId: string } {
      return { machineId: ensureMachineId() };
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
        const machine = ensureMachineId();
        // Validate the uploader BEFORE persisting the started marker: a Start
        // click with the Hub unconfigured must not arm the purge guard (a
        // zero-progress attempt has captured nothing worth guarding).
        const uploader = await options.createUploader();
        if (typeof data.settings.get(STARTED_KEY) !== 'string') {
          data.settings.set(STARTED_KEY, new Date().toISOString());
        }
        const forceV2Rescan = !isCurrentFormat();
        if (forceV2Rescan || hasDirtyTables()) {
          // A process exit mid-resume must not leave a v1/stale global marker
          // claiming completion while v2 revisions are outstanding.
          data.settings.remove(COMPLETED_KEY);
        }
        // A row can change in an earlier table while a later table uploads.
        // Repeat full passes until all trigger revisions simultaneously match
        // their stable checkpoints; only then may global completion advance.
        let manifestPath: string;
        for (;;) {
          for (const spec of HARVEST_TABLES) {
            await scanTableUntilStable(spec, uploader, machine, forceV2Rescan);
            if (pauseRequested) {
              return { manifestPath: null };
            }
          }
          if (hasDirtyTables()) {
            continue;
          }
          // Manifest I/O yields to runtime producers. Re-check after it and
          // discard the stale snapshot if a continuation appended behind the
          // just-finished walk; the final check and marker write are then
          // synchronous, so no same-process producer can interleave them.
          manifestPath = await writeManifest(machine);
          if (!hasDirtyTables()) {
            const latestManifestPath = await publishLatestManifest(manifestPath, machine);
            if (hasDirtyTables()) {
              // The canonical file still accurately describes the last Core
              // observation count; another pass will supersede it after the
              // new revision is uploaded. Never stamp global completion here.
              continue;
            }
            data.db.transaction(() => {
              data.settings.set(FORMAT_VERSION_KEY, HARVEST_FORMAT_VERSION);
              data.settings.set(SOURCE_SCHEMA_VERSION_KEY, options.schemaVersion);
              data.settings.set(COMPLETED_KEY, new Date().toISOString());
            });
            log('harvest latest manifest published', {
              manifestPath: basename(latestManifestPath),
            });
            // The operator-facing result must always be the canonical file;
            // timestamped snapshots become stale after later revisions.
            manifestPath = latestManifestPath;
            break;
          }
          await rm(manifestPath, { force: true });
        }
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

/** Final custody check used after runtime producers have drained but before a
 * terminal purge deletes SQLite. It uploads a delta created during that drain
 * and fails closed if another run or pause leaves history outstanding. */
export async function finishHarvestDeltaBeforePurge(
  harvest: Pick<HarvestModule, 'isIncomplete' | 'run'>,
): Promise<void> {
  if (!harvest.isIncomplete()) {
    return;
  }
  await harvest.run();
  if (harvest.isIncomplete()) {
    throw new Error(
      'History changed during runtime shutdown and could not be fully harvested; local data was not purged.',
    );
  }
}
