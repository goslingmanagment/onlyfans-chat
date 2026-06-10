import { describe, expect, it } from 'vitest';
import {
  loadSqliteDriver,
  readSchemaVersion,
  runMigrations,
  SCHEMA_VERSION,
} from '@main/db/index';
import type { Migration, SqliteDatabase } from '@main/db/index';
import { ALL_TABLES } from '../../src/main/db/schema';
import { memoryDataLayer, TEST_DRIVER } from './helpers';

function rawDb(): SqliteDatabase {
  const Driver = loadSqliteDriver(TEST_DRIVER);
  return new Driver(':memory:');
}

describe('migration runner', () => {
  it('creates the full v1 schema with indexes via openDatabase', () => {
    const layer = memoryDataLayer();
    try {
      const names = layer.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      for (const table of ALL_TABLES) {
        expect(names).toContain(table);
      }
      const indexes = layer.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      expect(indexes).toContain('idx_chats_account_recent');
      expect(indexes).toContain('idx_messages_chat_recent');
      expect(layer.db.schemaVersion()).toBe(SCHEMA_VERSION);
    } finally {
      layer.close();
    }
  });

  it('applies steps sequentially and records the version', () => {
    const db = rawDb();
    const applied: number[] = [];
    const migrations: Migration[] = [
      { toVersion: 1, up: () => applied.push(1) },
      { toVersion: 2, up: () => applied.push(2) },
      { toVersion: 3, up: () => applied.push(3) },
    ];
    expect(runMigrations(db, migrations)).toEqual({ from: 0, to: 3 });
    expect(applied).toEqual([1, 2, 3]);
    expect(readSchemaVersion(db)).toBe(3);
    db.close();
  });

  it('is idempotent: a second run applies nothing', () => {
    const db = rawDb();
    let calls = 0;
    const migrations: Migration[] = [{ toVersion: 1, up: () => void (calls += 1) }];
    runMigrations(db, migrations);
    expect(runMigrations(db, migrations)).toEqual({ from: 1, to: 1 });
    expect(calls).toBe(1);
    db.close();
  });

  it('resumes from the stored version, skipping applied steps', () => {
    const db = rawDb();
    const applied: number[] = [];
    const v1: Migration[] = [{ toVersion: 1, up: () => applied.push(1) }];
    runMigrations(db, v1);
    const v2: Migration[] = [...v1, { toVersion: 2, up: () => applied.push(2) }];
    expect(runMigrations(db, v2)).toEqual({ from: 1, to: 2 });
    expect(applied).toEqual([1, 2]);
    db.close();
  });

  it('rejects non-sequential migration lists', () => {
    const db = rawDb();
    const noop = (): void => undefined;
    expect(() =>
      runMigrations(db, [
        { toVersion: 1, up: noop },
        { toVersion: 3, up: noop },
      ]),
    ).toThrow(/sequential/);
    expect(() =>
      runMigrations(db, [
        { toVersion: 2, up: noop },
        { toVersion: 1, up: noop },
      ]),
    ).toThrow(/sequential/);
    db.close();
  });

  it('rolls back a failed step: no DDL, no version bump', () => {
    const db = rawDb();
    const migrations: Migration[] = [
      {
        toVersion: 1,
        up(handle) {
          handle.exec('CREATE TABLE half_done (id TEXT)');
          throw new Error('boom');
        },
      },
    ];
    expect(() => runMigrations(db, migrations)).toThrow('boom');
    expect(readSchemaVersion(db)).toBe(0);
    const row: unknown = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half_done'")
      .get();
    expect(row).toBeUndefined();
    db.close();
  });

  it('throws when the stored version is newer than the build (downgrade guard)', () => {
    const db = rawDb();
    const noop = (): void => undefined;
    runMigrations(db, [
      { toVersion: 1, up: noop },
      { toVersion: 2, up: noop },
    ]);
    expect(() => runMigrations(db, [{ toVersion: 1, up: noop }])).toThrow(/newer/);
    db.close();
  });
});
