// schema_version + sequential migrations (legacy storage pattern, SPEC §10).
// The version lives as a settings row so it migrates with the data it describes.

import { z } from 'zod';
import type { SqliteDatabase } from './driver';
import {
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  SCHEMA_V7,
  SCHEMA_V8,
} from './schema';

export interface Migration {
  toVersion: number;
  up(db: SqliteDatabase): void;
}

export const SCHEMA_VERSION = 8;

export const MIGRATIONS: readonly Migration[] = [
  {
    toVersion: 1,
    up(db) {
      db.exec(SCHEMA_V1);
    },
  },
  {
    toVersion: 2,
    up(db) {
      db.exec(SCHEMA_V2);
    },
  },
  {
    toVersion: 3,
    up(db) {
      db.exec(SCHEMA_V3);
    },
  },
  {
    toVersion: 4,
    up(db) {
      db.exec(SCHEMA_V4);
    },
  },
  {
    toVersion: 5,
    up(db) {
      db.exec(SCHEMA_V5);
    },
  },
  {
    toVersion: 6,
    up(db) {
      db.exec(SCHEMA_V6);
    },
  },
  {
    toVersion: 7,
    up(db) {
      db.exec(SCHEMA_V7);
    },
  },
  {
    toVersion: 8,
    up(db) {
      db.exec(SCHEMA_V8);
    },
  },
];

const SCHEMA_VERSION_KEY = 'schema_version';

const versionValueSchema = z.number().int().nonnegative();
const versionRowSchema = z.object({ value: z.string() });

function ensureSettingsTable(db: Pick<SqliteDatabase, 'exec'>): void {
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
}

export function readSchemaVersion(db: Pick<SqliteDatabase, 'prepare' | 'exec'>): number {
  ensureSettingsTable(db);
  const row: unknown = db
    .prepare('SELECT value FROM settings WHERE key = @key')
    .get({ key: SCHEMA_VERSION_KEY });
  if (row === undefined) {
    return 0;
  }
  const json: unknown = JSON.parse(versionRowSchema.parse(row).value);
  return versionValueSchema.parse(json);
}

function writeSchemaVersion(db: SqliteDatabase, version: number): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ' +
      'ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run({ key: SCHEMA_VERSION_KEY, value: JSON.stringify(version) });
}

function validateSequence(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.toVersion !== index + 1) {
      throw new Error(
        `Migrations must be sequential from 1: index ${index} has toVersion ${migration.toVersion}`,
      );
    }
  });
}

/**
 * Applies every migration above the stored version, each inside its own
 * transaction (step failure rolls back both DDL and the version bump).
 * Idempotent: a database already at the latest version is untouched.
 */
export function runMigrations(
  db: SqliteDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): { from: number; to: number } {
  validateSequence(migrations);
  const from = readSchemaVersion(db);
  const latest = migrations.at(-1)?.toVersion ?? 0;
  if (from > latest) {
    throw new Error(
      `Database schema_version ${from} is newer than this build's latest migration (${latest})`,
    );
  }
  for (const migration of migrations) {
    if (migration.toVersion <= from) {
      continue;
    }
    db.transaction(() => {
      migration.up(db);
      writeSchemaVersion(db, migration.toVersion);
    })();
  }
  return { from, to: Math.max(from, latest) };
}

export { SCHEMA_VERSION_KEY };
