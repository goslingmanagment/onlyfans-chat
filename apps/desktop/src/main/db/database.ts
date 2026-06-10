// Encrypted SQLite handle (SPEC §10): SQLCipher-compatible cipher via the
// multiple-ciphers PRAGMA flow, WAL, sequential migrations. The encryption key
// is supplied by the composition root (OS keychain / safeStorage) — never stored.

import { loadSqliteDriver } from './driver';
import type { SqliteDatabase, SqliteStatement } from './driver';
import { MIGRATIONS, runMigrations } from './migrations';
import type { Migration } from './migrations';

export interface OpenDatabaseOptions {
  /** Module name of the better-sqlite3-multiple-ciphers build to load. */
  driverPath: string;
  /** Database file path, or ':memory:' (tests only — in-memory cannot be keyed). */
  filePath: string;
  /** Required for file databases (encryption-at-rest invariant); null only for ':memory:'. */
  encryptionKey: string | null;
  migrations?: readonly Migration[];
}

export interface ChatGooseDb {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(directive: string, options?: { simple?: boolean }): unknown;
  transaction<Result>(fn: () => Result): Result;
  schemaVersion(): number;
  close(): void;
}

function quotePragmaValue(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function openDatabase(options: OpenDatabaseOptions): ChatGooseDb {
  const { driverPath, filePath, encryptionKey } = options;
  const isMemory = filePath === ':memory:';
  if (isMemory && encryptionKey !== null) {
    throw new Error('In-memory databases cannot be encrypted; pass encryptionKey: null');
  }
  if (!isMemory && (encryptionKey === null || encryptionKey.length === 0)) {
    throw new Error('File databases must be encrypted (SPEC §15.9); encryptionKey is required');
  }

  const Driver = loadSqliteDriver(driverPath);
  const db = new Driver(filePath);
  try {
    if (encryptionKey !== null) {
      // Cipher selection must precede the key, both before any other statement.
      db.pragma("cipher='sqlcipher'");
      db.pragma(`key=${quotePragmaValue(encryptionKey)}`);
    }
    // First real read: throws SQLITE_NOTADB on a wrong/missing key.
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get();

    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');

    runMigrations(db, options.migrations ?? MIGRATIONS);
  } catch (error) {
    db.close();
    throw error;
  }

  return wrap(db);
}

function wrap(db: SqliteDatabase): ChatGooseDb {
  const statements = new Map<string, SqliteStatement>();
  let open = true;

  const prepare = (sql: string): SqliteStatement => {
    const cached = statements.get(sql);
    if (cached) {
      return cached;
    }
    const statement = db.prepare(sql);
    statements.set(sql, statement);
    return statement;
  };

  return {
    prepare,
    exec(sql) {
      db.exec(sql);
    },
    pragma(directive, options) {
      return db.pragma(directive, options);
    },
    transaction(fn) {
      return db.transaction(fn)();
    },
    schemaVersion() {
      const row: unknown = prepare('SELECT value FROM settings WHERE key = @key').get({
        key: 'schema_version',
      });
      if (typeof row === 'object' && row !== null && 'value' in row && typeof row.value === 'string') {
        const parsed: unknown = JSON.parse(row.value);
        if (typeof parsed === 'number') {
          return parsed;
        }
      }
      return 0;
    },
    close() {
      if (open) {
        open = false;
        statements.clear();
        db.close();
      }
    },
  };
}
