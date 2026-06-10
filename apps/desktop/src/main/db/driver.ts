// Typed seam over better-sqlite3-multiple-ciphers. The driver module is injected
// by name (Electron-ABI build at runtime, Node-ABI alias in tests) and loaded
// dynamically, so nothing here imports the native module statically.

import { createRequire } from 'node:module';

export type SqlValue = string | number | bigint | null;
export type BindParams = Record<string, SqlValue>;

export interface SqliteStatement {
  run(params?: BindParams): { changes: number };
  get(params?: BindParams): unknown;
  all(params?: BindParams): unknown[];
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
  pragma(directive: string, options?: { simple?: boolean }): unknown;
  /** better-sqlite3 transaction wrapper (savepoint-nested when re-entered). */
  transaction<Result>(fn: () => Result): () => Result;
  close(): void;
}

export type SqliteDriverConstructor = new (filename: string) => SqliteDatabase;

const requireModule = createRequire(import.meta.url);

function isDriverConstructor(value: unknown): value is SqliteDriverConstructor {
  return typeof value === 'function';
}

/**
 * Dynamic require of the driver module named by the caller — the only place a
 * SQLite native binding enters the process. Runtime-narrowed: a module that does
 * not export a constructor function is rejected.
 */
export function loadSqliteDriver(driverPath: string): SqliteDriverConstructor {
  const loaded: unknown = requireModule(driverPath);
  const candidate: unknown =
    typeof loaded === 'object' && loaded !== null && 'default' in loaded
      ? loaded.default
      : loaded;
  if (!isDriverConstructor(candidate)) {
    throw new Error(`SQLite driver "${driverPath}" does not export a Database constructor`);
  }
  return candidate;
}
