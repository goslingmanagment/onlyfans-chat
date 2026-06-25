// Encrypted disk media cache (SPEC §4/§10): blobs are AES-256-GCM-encrypted
// with the keychain-held mediaCacheKey before touching disk; LRU-evicted by
// last access with a 2 GB cap. Rows live in the media_cache table.

import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';

export const MEDIA_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // SPEC §10 LRU cap

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const KEY_BYTES = 32;

// ─── Blob encryption (format: iv ‖ authTag ‖ ciphertext) ────────────────

export function encryptBlob(key: Buffer, plain: Uint8Array): Buffer {
  assertKey(key);
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws on tampered/garbage input (GCM auth failure). */
export function decryptBlob(key: Buffer, blob: Uint8Array): Buffer {
  assertKey(key);
  if (blob.byteLength < GCM_IV_BYTES + GCM_TAG_BYTES) {
    throw new Error('encrypted blob too short');
  }
  const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  const iv = buf.subarray(0, GCM_IV_BYTES);
  const tag = buf.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES);
  const ciphertext = buf.subarray(GCM_IV_BYTES + GCM_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function assertKey(key: Buffer): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new Error(`media cache key must be ${KEY_BYTES} bytes, got ${key.byteLength}`);
  }
}

export function stableRemoteUrlKey(remoteUrl: string): string {
  const url = new URL(remoteUrl);
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function hashRemoteUrl(remoteUrl: string): string {
  return createHash('sha256').update(stableRemoteUrlKey(remoteUrl), 'utf8').digest('hex');
}

// ─── media_cache rows ────────────────────────────────────────────────────

export interface MediaCacheRow {
  urlHash: string;
  /** Plain file name inside cacheDir (never a path). */
  path: string;
  contentType: string | null;
  /** Encrypted size on disk. */
  bytes: number;
  fetchedAt: string; // ISO
  lastAccessedAt: string; // ISO
}

/** Minimal media_cache access (db module provides the real implementation). */
export interface MediaCacheQueries {
  get(urlHash: string): MediaCacheRow | undefined;
  upsert(row: MediaCacheRow): void;
  touch(urlHash: string, lastAccessedAt: string): void;
  delete(urlHash: string): void;
  totalBytes(): number;
  /** Up to `limit` rows ordered by last_accessed_at ascending (LRU first). */
  evictionCandidates(limit: number): MediaCacheRow[];
  clear(): void;
}

// ─── Cache ───────────────────────────────────────────────────────────────

export interface MediaBlob {
  data: Buffer;
  contentType: string | null;
}

export interface MediaCache {
  get(remoteUrl: string): Promise<MediaBlob | null>;
  put(remoteUrl: string, data: Uint8Array, contentType: string | null): Promise<void>;
  clear(): Promise<void>;
}

export interface MediaCacheOptions {
  cacheDir: string;
  /** 32-byte mediaCacheKey from the keychain. */
  encryptionKey: Buffer;
  queries: MediaCacheQueries;
  maxBytes?: number;
  now?: () => Date;
  onPruneUrlHash?: (urlHash: string) => void;
  onClear?: () => void;
}

export function createMediaCache(options: MediaCacheOptions): MediaCache {
  const { cacheDir, encryptionKey, queries } = options;
  assertKey(encryptionKey);
  const maxBytes = options.maxBytes ?? MEDIA_CACHE_MAX_BYTES;
  const now = options.now ?? (() => new Date());

  function fileFor(row: MediaCacheRow): string {
    // Row paths come from storage (trust boundary): refuse anything path-like.
    if (row.path !== basename(row.path)) {
      throw new Error(`media_cache row has non-plain path: ${row.path}`);
    }
    return join(cacheDir, row.path);
  }

  async function dropEntry(row: MediaCacheRow): Promise<void> {
    // Tolerates poisoned rows: a bad path must not wedge eviction.
    if (row.path === basename(row.path)) {
      await rm(join(cacheDir, row.path), { force: true });
    }
    queries.delete(row.urlHash);
    options.onPruneUrlHash?.(row.urlHash);
  }

  async function evict(keepUrlHash: string): Promise<void> {
    let total = queries.totalBytes();
    while (total > maxBytes) {
      const candidates = queries
        .evictionCandidates(16)
        .filter((row) => row.urlHash !== keepUrlHash);
      if (candidates.length === 0) return;
      for (const row of candidates) {
        if (total <= maxBytes) return;
        await dropEntry(row);
        total -= row.bytes;
      }
    }
  }

  return {
    async get(remoteUrl) {
      const urlHash = hashRemoteUrl(remoteUrl);
      const row = queries.get(urlHash);
      if (row === undefined) return null;

      const filePath = fileFor(row); // throws on path-like row paths
      let encrypted: Buffer;
      try {
        encrypted = await readFile(filePath);
      } catch {
        await dropEntry(row);
        return null;
      }

      let data: Buffer;
      try {
        data = decryptBlob(encryptionKey, encrypted);
      } catch {
        await dropEntry(row); // tampered or key-rotated entry: refetch
        return null;
      }

      queries.touch(urlHash, now().toISOString());
      return { data, contentType: row.contentType };
    },

    async put(remoteUrl, data, contentType) {
      const urlHash = hashRemoteUrl(remoteUrl);
      const encrypted = encryptBlob(encryptionKey, data);
      const fileName = `${urlHash}.bin`;
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, fileName), encrypted, { mode: 0o600 });
      const ts = now().toISOString();
      queries.upsert({
        urlHash,
        path: fileName,
        contentType,
        bytes: encrypted.byteLength,
        fetchedAt: ts,
        lastAccessedAt: ts,
      });
      await evict(urlHash);
    },

    async clear() {
      queries.clear();
      options.onClear?.();
      await rm(cacheDir, { recursive: true, force: true });
    },
  };
}

// ─── better-sqlite3-backed queries ───────────────────────────────────────
// Structural db types mirror src/main/db/driver.ts (named @params), so both
// the db module's ChatGooseDb and a raw better-sqlite3 handle satisfy them.

export type SqlValue = string | number | bigint | null;
export type BindParams = Record<string, SqlValue>;

export interface SqliteStatementLike {
  run(params?: BindParams): unknown;
  get(params?: BindParams): unknown;
  all(params?: BindParams): unknown[];
}

export interface SqliteDatabaseLike {
  prepare(sql: string): SqliteStatementLike;
  exec(sql: string): unknown;
}

const mediaCacheRowSchema = z.object({
  url_hash: z.string().min(1),
  path: z.string().min(1),
  content_type: z.string().nullable(),
  bytes: z.number().int().nonnegative(),
  fetched_at: z.string(),
  last_accessed_at: z.string(),
});

const totalBytesRowSchema = z.object({ total: z.number().nullable() });
const columnRowSchema = z.object({ name: z.string() });

function rowFromDb(raw: unknown): MediaCacheRow {
  const row = mediaCacheRowSchema.parse(raw);
  return {
    urlHash: row.url_hash,
    path: row.path,
    contentType: row.content_type,
    bytes: row.bytes,
    fetchedAt: row.fetched_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

/**
 * The db module's base schema declares media_cache per SPEC §10
 * (url_hash, path, bytes, fetched_at); this adds the columns the cache needs
 * (content_type passthrough, last_accessed_at LRU) until a db migration owns
 * them. ALTERs are no-ops once the columns exist.
 */
function ensureMediaCacheColumns(db: SqliteDatabaseLike): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS media_cache (
      url_hash TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      fetched_at TEXT NOT NULL
    )`,
  );
  const columns = db
    .prepare("SELECT name FROM pragma_table_info('media_cache')")
    .all()
    .map((raw) => columnRowSchema.parse(raw).name);
  if (!columns.includes('content_type')) {
    db.exec('ALTER TABLE media_cache ADD COLUMN content_type TEXT');
  }
  if (!columns.includes('last_accessed_at')) {
    // '' sorts before every ISO timestamp → legacy rows are first out under LRU.
    db.exec("ALTER TABLE media_cache ADD COLUMN last_accessed_at TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_media_cache_last_access ON media_cache (last_accessed_at)',
  );
}

export function createSqliteMediaCacheQueries(db: SqliteDatabaseLike): MediaCacheQueries {
  ensureMediaCacheColumns(db);
  const selectStmt = db.prepare('SELECT * FROM media_cache WHERE url_hash = @url_hash');
  const upsertStmt = db.prepare(
    `INSERT INTO media_cache (url_hash, path, content_type, bytes, fetched_at, last_accessed_at)
     VALUES (@url_hash, @path, @content_type, @bytes, @fetched_at, @last_accessed_at)
     ON CONFLICT (url_hash) DO UPDATE SET
       path = excluded.path,
       content_type = excluded.content_type,
       bytes = excluded.bytes,
       fetched_at = excluded.fetched_at,
       last_accessed_at = excluded.last_accessed_at`,
  );
  const touchStmt = db.prepare(
    'UPDATE media_cache SET last_accessed_at = @last_accessed_at WHERE url_hash = @url_hash',
  );
  const deleteStmt = db.prepare('DELETE FROM media_cache WHERE url_hash = @url_hash');
  const totalStmt = db.prepare('SELECT SUM(bytes) AS total FROM media_cache');
  const lruStmt = db.prepare(
    'SELECT * FROM media_cache ORDER BY last_accessed_at ASC, url_hash ASC LIMIT @limit',
  );

  return {
    get(urlHash) {
      const raw = selectStmt.get({ url_hash: urlHash });
      if (raw === undefined || raw === null) return undefined;
      return rowFromDb(raw);
    },
    upsert(row) {
      upsertStmt.run({
        url_hash: row.urlHash,
        path: row.path,
        content_type: row.contentType,
        bytes: row.bytes,
        fetched_at: row.fetchedAt,
        last_accessed_at: row.lastAccessedAt,
      });
    },
    touch(urlHash, lastAccessedAt) {
      touchStmt.run({ last_accessed_at: lastAccessedAt, url_hash: urlHash });
    },
    delete(urlHash) {
      deleteStmt.run({ url_hash: urlHash });
    },
    totalBytes() {
      return totalBytesRowSchema.parse(totalStmt.get()).total ?? 0;
    },
    evictionCandidates(limit) {
      return lruStmt.all({ limit }).map(rowFromDb);
    },
    clear() {
      db.exec('DELETE FROM media_cache');
    },
  };
}
