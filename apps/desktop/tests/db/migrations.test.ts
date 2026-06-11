import { describe, expect, it } from 'vitest';
import {
  loadSqliteDriver,
  MIGRATIONS,
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
  it('fresh install lands at the latest version with the full schema and indexes', () => {
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
      expect(SCHEMA_VERSION).toBe(5);
      expect(layer.db.schemaVersion()).toBe(SCHEMA_VERSION);
      expect(names).toContain('media_urls');
      const chatCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('chats')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      expect(chatCols).toContain('last_message_id');
      const outboxCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('outbox')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      // v4 shape + the v5 PPV columns
      for (const col of [
        'text',
        'sequence_id',
        'part_index',
        'text_highlights',
        'attempts',
        'retry_of',
        'price',
        'media_files',
        'previews',
      ]) {
        expect(outboxCols).toContain(col);
      }
    } finally {
      layer.close();
    }
  });

  it('upgrades v1 → latest in place, preserving data through media_urls and last_message_id', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 1));
    expect(readSchemaVersion(db)).toBe(1);

    // v1 data that must survive the upgrade
    db.exec(
      "INSERT INTO chats (account_id, chat_id, fan_name, raw, updated_at) " +
        "VALUES ('acct_1', '101', 'Fan One', '{}', '2026-06-11T00:00:00.000Z')",
    );
    db.exec(
      "INSERT INTO media_cache (url_hash, path, bytes, fetched_at) " +
        "VALUES ('h1', 'h1.bin', 10, '2026-06-11T00:00:00.000Z')",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 1, to: SCHEMA_VERSION });
    expect(readSchemaVersion(db)).toBe(SCHEMA_VERSION);

    const chat: unknown = db
      .prepare("SELECT fan_name FROM chats WHERE account_id = 'acct_1' AND chat_id = '101'")
      .get();
    expect(chat).toEqual({ fan_name: 'Fan One' });
    const cacheRow: unknown = db.prepare("SELECT bytes FROM media_cache WHERE url_hash = 'h1'").get();
    expect(cacheRow).toEqual({ bytes: 10 });

    // the new table is present and usable
    db.exec(
      "INSERT INTO media_urls (url_hash, url, created_at) " +
        "VALUES ('t1', 'https://thumbs.onlyfans.com/a.jpg', '2026-06-11T00:00:00.000Z')",
    );
    const urlRow: unknown = db.prepare("SELECT url FROM media_urls WHERE url_hash = 't1'").get();
    expect(urlRow).toEqual({ url: 'https://thumbs.onlyfans.com/a.jpg' });

    // v3: pre-existing chat rows read back with a null delta baseline
    const upgraded: unknown = db
      .prepare("SELECT last_message_id FROM chats WHERE account_id = 'acct_1' AND chat_id = '101'")
      .get();
    expect(upgraded).toEqual({ last_message_id: null });
    db.close();
  });

  it('v4 → v5 is additive: existing outbox rows survive with PPV defaults (price 0, empty arrays)', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 4));
    expect(readSchemaVersion(db)).toBe(4);

    // a v4-era audit row that must survive the upgrade untouched
    db.exec(
      "INSERT INTO outbox (local_id, account_id, chat_id, text, state, sequence_id, part_index, " +
        "message_id, error_code, error_message, text_highlights, attempts, retry_of, created_at, updated_at) " +
        "VALUES ('L1', 'acct_1', '101', 'old text send', 'sent', NULL, 0, " +
        "'9000000001', NULL, NULL, '[]', 1, NULL, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:01.000Z')",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 4, to: SCHEMA_VERSION });

    const row: unknown = db
      .prepare(
        "SELECT text, state, message_id, price, media_files, previews FROM outbox WHERE local_id = 'L1'",
      )
      .get();
    expect(row).toEqual({
      text: 'old text send',
      state: 'sent',
      message_id: '9000000001',
      price: 0,
      media_files: '[]',
      previews: '[]',
    });

    // the new columns are writable with PPV payloads
    db.exec(
      "INSERT INTO outbox (local_id, account_id, chat_id, text, state, sequence_id, part_index, " +
        "message_id, error_code, error_message, text_highlights, attempts, retry_of, " +
        "price, media_files, previews, created_at, updated_at) " +
        "VALUES ('L2', 'acct_1', '101', 'ppv caption', 'queued', NULL, 0, " +
        "NULL, NULL, NULL, '[]', 0, NULL, " +
        "25, '[3866342509,\"ofapi_media_abc\"]', '[3866342509]', '2026-06-11T00:00:02.000Z', '2026-06-11T00:00:02.000Z')",
    );
    const ppv: unknown = db
      .prepare("SELECT price, media_files, previews FROM outbox WHERE local_id = 'L2'")
      .get();
    expect(ppv).toEqual({
      price: 25,
      media_files: '[3866342509,"ofapi_media_abc"]',
      previews: '[3866342509]',
    });
    db.close();
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
