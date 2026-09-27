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
      expect(indexes).toContain('idx_fan_tx_fan'); // v6 spend window
      expect(indexes).toContain('idx_message_guard_events_occurred');
      expect(indexes).toContain('idx_message_guard_events_hash');
      expect(indexes).toContain('idx_sync_intents_account'); // v24 (D38)
      expect(indexes).toContain('idx_message_facts_message'); // v25 (D39)
      expect(SCHEMA_VERSION).toBe(26);
      expect(layer.db.schemaVersion()).toBe(SCHEMA_VERSION);
      const guardCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('message_guard_events')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      for (const col of [
        'message_text',
        'message_hash',
        'matched_original',
        'matched_normalized',
        'policy_version',
        'rule_id',
      ]) {
        expect(guardCols).toContain(col);
      }
      // v10: per-fan thread-fetch stamps (spenders freshness, PLAN item 13)
      expect(names).toContain('thread_fetch_log');
      // v9: fan_transactions carries net alongside the gross amount
      const txCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('fan_transactions')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      expect(txCols).toContain('net');
      expect(names).toContain('media_urls');
      // v7: per-purpose credit ledger + the durable AI spend ledger
      const creditCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('credit_log')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      for (const col of ['day', 'purpose', 'used', 'requests']) {
        expect(creditCols).toContain(col);
      }
      expect(names).toContain('ai_spend_log');
      expect(names).toContain('ai_acceptance_ops');
      expect(names).toContain('unsend_commands');
      const accountCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('accounts')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      expect(accountCols).toContain('grant_state');
      const acceptanceCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('ai_acceptance_ops')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      for (const col of ['operation_id', 'feature', 'day', 'parts', 'known_at', 'accepted_at']) {
        expect(acceptanceCols).toContain(col);
      }
      const chatCols = layer.db
        .prepare("SELECT name FROM pragma_table_info('chats')")
        .all()
        .map((row) => (typeof row === 'object' && row !== null && 'name' in row ? row.name : null));
      expect(chatCols).toContain('last_message_id');
      // v22: the hide moment that lets a hidden chat resurface on new activity
      expect(chatCols).toContain('locally_hidden_at');
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
        'core_command_id',
        'price',
        'media_files',
        'previews',
        'transport',
      ]) {
        expect(outboxCols).toContain(col);
      }
      const transportDefault = layer.db
        .prepare("SELECT dflt_value FROM pragma_table_info('outbox') WHERE name = 'transport'")
        .get();
      expect(transportDefault).toEqual({ dflt_value: "'hub'" });
      const coreCommandDefault = layer.db
        .prepare("SELECT dflt_value FROM pragma_table_info('outbox') WHERE name = 'core_command_id'")
        .get();
      expect(coreCommandDefault).toEqual({ dflt_value: null });
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
      "INSERT INTO accounts (id, username, display_name, auth_state, raw, updated_at) " +
        "VALUES ('acct_1', 'loravie', 'Lora Vie', 'authenticated', '{}', '2026-06-11T00:00:00.000Z')",
    );
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
    expect(db.prepare("SELECT grant_state FROM accounts WHERE id = 'acct_1'").get()).toEqual({
      grant_state: 'granted',
    });

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

  it('v23 → v24 seeds the delta detector from the head and adds the durable intents table (D38)', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 23));
    expect(readSchemaVersion(db)).toBe(23);
    db.exec(
      "INSERT INTO chats (account_id, chat_id, fan_name, raw, updated_at, last_message_id) " +
        "VALUES ('acct_1', '101', 'Fan', '{}', '2026-09-01T10:00:00.000Z', '900')",
    );
    db.exec(
      "INSERT INTO chats (account_id, chat_id, fan_name, raw, updated_at, last_message_id) " +
        "VALUES ('acct_1', '102', 'Empty', '{}', '2026-09-01T10:00:00.000Z', NULL)",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 23, to: SCHEMA_VERSION });
    expect(
      db
        .prepare("SELECT chat_id, sync_baseline_message_id FROM chats WHERE account_id = 'acct_1' ORDER BY chat_id")
        .all(),
    ).toEqual([
      { chat_id: '101', sync_baseline_message_id: '900' },
      { chat_id: '102', sync_baseline_message_id: null },
    ]);
    // The natural key is unique per open obligation ('' = not applicable).
    db.exec(
      "INSERT INTO sync_intents (kind, account_id, not_before_ms, reason, next_attempt_ms, created_ms) " +
        "VALUES ('account_list', 'acct_1', 1, 'list-nudge', 1, 1)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO sync_intents (kind, account_id, not_before_ms, reason, next_attempt_ms, created_ms) " +
          "VALUES ('account_list', 'acct_1', 2, 'list-nudge', 2, 2)",
      )).toThrow(/UNIQUE/);
    expect(() =>
      db.exec(
        "INSERT INTO sync_intents (kind, account_id, not_before_ms, reason, next_attempt_ms, created_ms) " +
          "VALUES ('bogus', 'acct_1', 2, 'x', 2, 2)",
      )).toThrow(/CHECK/);
    db.close();
  });

  it('v25 → v26 keeps every URL token and adds OFAPI id tokens plus the report queue (D43)', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 25));
    expect(readSchemaVersion(db)).toBe(25);
    db.exec(
      "INSERT INTO media_urls (url_hash, url, created_at) " +
        "VALUES ('" + 'a'.repeat(64) + "', 'https://public.onlyfans.com/files/avatar.jpg', '2026-09-27T00:00:00.000Z')",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 25, to: SCHEMA_VERSION });
    // Existing avatars stay URL tokens.
    expect(db.prepare('SELECT url_hash, kind, account_id, media_id, variant FROM media_urls').all()).toEqual([
      { url_hash: 'a'.repeat(64), kind: 'url', account_id: null, media_id: null, variant: null },
    ]);
    db.exec(
      "INSERT INTO media_urls (url_hash, url, created_at, kind, account_id, media_id, variant) " +
        "VALUES ('" + 'b'.repeat(64) + "', 'ofapi:acct_1/1/thumb', '2026-09-27T00:00:00.000Z', 'ofapi', 'acct_1', '1', 'thumb')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO media_urls (url_hash, url, created_at, kind) VALUES ('" + 'c'.repeat(64) + "', 'x', 'y', 'bogus')",
      )).toThrow(/CHECK/);
    expect(() =>
      db.exec(
        "INSERT INTO media_urls (url_hash, url, created_at, kind, variant) VALUES ('" + 'd'.repeat(64) + "', 'x', 'y', 'ofapi', 'huge')",
      )).toThrow(/CHECK/);
    db.exec(
      "INSERT INTO media_fetch_reports (resolve_id, payload, created_at) " +
        "VALUES ('00000000-0000-4000-8000-000000000001', '{}', '2026-09-27T00:00:00.000Z')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO media_fetch_reports (resolve_id, payload, created_at) " +
          "VALUES ('00000000-0000-4000-8000-000000000001', '{}', '2026-09-27T00:00:00.000Z')",
      )).toThrow(/UNIQUE|PRIMARY/);
    db.close();
  });

  it('v24 → v25 adds purchase facts and marks every existing transaction as read by the sweep (D39)', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 24));
    expect(readSchemaVersion(db)).toBe(24);
    db.exec(
      "INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, net, type, created_at) " +
        "VALUES ('acct_1', 'eb118196c33625aa23c4dda8de8e4501', '499106230', 67, 53.6, 'message', '2026-09-26T14:37:10.000Z')",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 24, to: SCHEMA_VERSION });
    expect(db.prepare('SELECT tx_id, source FROM fan_transactions').all()).toEqual([
      { tx_id: 'eb118196c33625aa23c4dda8de8e4501', source: 'sweep' },
    ]);
    expect(() =>
      db.exec(
        "INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, net, created_at, source) " +
          "VALUES ('acct_1', 't2', '1', 5, 4, '2026-09-26T14:37:10.000Z', 'bogus')",
      )).toThrow(/CHECK/);
    db.exec(
      "INSERT INTO message_facts (account_id, chat_id, message_id, kind, provenance, source, recorded_at) " +
        "VALUES ('acct_1', '15544628', '11365803781187', 'ppv_unlocked', 'live', 'catch-up', '2026-09-27T00:00:00.000Z')",
    );
    // Keyed by (account, chat, message).
    expect(() =>
      db.exec(
        "INSERT INTO message_facts (account_id, chat_id, message_id, kind, provenance, source, recorded_at) " +
          "VALUES ('acct_1', '15544628', '11365803781187', 'ppv_unlocked', 'live', 'stream', '2026-09-27T00:00:00.000Z')",
      )).toThrow(/UNIQUE|PRIMARY/);
    expect(() =>
      db.exec(
        "INSERT INTO message_facts (account_id, chat_id, message_id, kind, provenance, source, recorded_at) " +
          "VALUES ('acct_1', '1', '2', 'tip', 'live', 'stream', '2026-09-27T00:00:00.000Z')",
      )).toThrow(/CHECK/);
    db.close();
  });

  it('v21 → v22 stamps already-hidden chats with their last write so a newer head can un-hide them', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 21));
    expect(readSchemaVersion(db)).toBe(21);
    db.exec(
      "INSERT INTO chats (account_id, chat_id, fan_name, raw, updated_at, locally_hidden) " +
        "VALUES ('acct_1', '101', 'Hidden Fan', '{}', '2026-09-01T10:00:00.000Z', 1)",
    );
    db.exec(
      "INSERT INTO chats (account_id, chat_id, fan_name, raw, updated_at, locally_hidden) " +
        "VALUES ('acct_1', '102', 'Visible Fan', '{}', '2026-09-01T10:00:00.000Z', 0)",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 21, to: SCHEMA_VERSION });
    expect(
      db
        .prepare("SELECT chat_id, locally_hidden, locally_hidden_at FROM chats WHERE account_id = 'acct_1' ORDER BY chat_id")
        .all(),
    ).toEqual([
      { chat_id: '101', locally_hidden: 1, locally_hidden_at: '2026-09-01T10:00:00.000Z' },
      { chat_id: '102', locally_hidden: 0, locally_hidden_at: null },
    ]);
    db.close();
  });

  it('v17 → v18 scrubs reply parts from operations that were already accepted', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 17));
    expect(readSchemaVersion(db)).toBe(17);
    db.prepare(
      `INSERT INTO ai_acceptance_ops (
         operation_id, feature, day, request_id, account_id,
         conversation_id, parts, known_at, accepted_at
       ) VALUES (
         @operation_id, 'fast-reply', '2026-07-12', 'req-old', 'acct_1',
         '101', @parts, '2026-07-12T10:00:00.000Z', '2026-07-12T10:01:00.000Z'
       )`,
    ).run({
      operation_id: '00000000-0000-4000-8000-0000000000ff',
      parts: JSON.stringify(['previously retained reply']),
    });

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 17, to: SCHEMA_VERSION });
    expect(
      db.prepare(
        "SELECT parts, accepted_at FROM ai_acceptance_ops WHERE operation_id = '00000000-0000-4000-8000-0000000000ff'",
      ).get(),
    ).toEqual({ parts: '[]', accepted_at: '2026-07-12T10:01:00.000Z' });
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

  it('v6 → v7 preserves credit_log history under the untagged purpose', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 6));
    expect(readSchemaVersion(db)).toBe(6);

    db.exec("INSERT INTO credit_log (day, used) VALUES ('2026-06-10', 480)");
    db.exec("INSERT INTO credit_log (day, used) VALUES ('2026-06-11', 75)");

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 6, to: SCHEMA_VERSION });

    const rows = db
      .prepare('SELECT day, purpose, used, requests FROM credit_log ORDER BY day')
      .all();
    expect(rows).toEqual([
      { day: '2026-06-10', purpose: 'untagged', used: 480, requests: 0 },
      { day: '2026-06-11', purpose: 'untagged', used: 75, requests: 0 },
    ]);

    // the new shape is writable per purpose
    db.exec(
      "INSERT INTO credit_log (day, purpose, used, requests) VALUES ('2026-06-11', 'hot-poll', 12, 12)",
    );
    const total: unknown = db
      .prepare("SELECT SUM(used) AS used FROM credit_log WHERE day = '2026-06-11'")
      .get();
    expect(total).toEqual({ used: 87 });
    db.close();
  });

  it('v7 → v8 carries the spenders rename: settings mapping key + credit_log purpose', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 7));
    expect(readSchemaVersion(db)).toBe(7);

    db.exec(
      'INSERT INTO settings (key, value) VALUES (\'supportersListMappings\', \'{"acct_1":["101"]}\')',
    );
    db.exec(
      "INSERT INTO credit_log (day, purpose, used, requests) VALUES ('2026-06-13', 'supporters', 9, 9)",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 7, to: SCHEMA_VERSION });

    const mapping: unknown = db
      .prepare("SELECT value FROM settings WHERE key = 'spendersListMappings'")
      .get();
    expect(mapping).toEqual({ value: '{"acct_1":["101"]}' });
    const oldKey: unknown = db
      .prepare("SELECT value FROM settings WHERE key = 'supportersListMappings'")
      .get();
    expect(oldKey).toBeUndefined();

    const ledger = db.prepare('SELECT day, purpose, used, requests FROM credit_log').all();
    expect(ledger).toEqual([{ day: '2026-06-13', purpose: 'spenders', used: 9, requests: 9 }]);
    db.close();
  });

  it('v8 → v9 rebuilds fan_transactions with the net column; cached gross rows are discarded', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 8));
    expect(readSchemaVersion(db)).toBe(8);

    db.exec(
      "INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, type, created_at) " +
        "VALUES ('acct_1', 't1', '101', 25, 'tips', '2026-06-12T00:00:00.000Z')",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 8, to: SCHEMA_VERSION });

    // gross-only rows are gone — the next sweep refetches the full -30days window
    expect(db.prepare('SELECT COUNT(*) AS n FROM fan_transactions').get()).toEqual({ n: 0 });

    db.exec(
      "INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, net, type, created_at) " +
        "VALUES ('acct_1', 't2', '101', 25, 20, 'tips', '2026-06-12T00:00:00.000Z')",
    );
    const row: unknown = db
      .prepare("SELECT amount, net FROM fan_transactions WHERE tx_id = 't2'")
      .get();
    expect(row).toEqual({ amount: 25, net: 20 });
    db.close();
  });

  it('v9 → v10 is additive: thread_fetch_log appears, existing data untouched', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 9));
    expect(readSchemaVersion(db)).toBe(9);

    db.exec(
      "INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, net, type, created_at) " +
        "VALUES ('acct_1', 't1', '101', 25, 20, 'tips', '2026-06-12T00:00:00.000Z')",
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 9, to: SCHEMA_VERSION });

    expect(db.prepare('SELECT COUNT(*) AS n FROM fan_transactions').get()).toEqual({ n: 1 });
    db.exec(
      "INSERT INTO thread_fetch_log (account_id, chat_id, fetched_at) " +
        "VALUES ('acct_1', '101', '2026-06-13T12:00:00.000Z')",
    );
    expect(db.prepare('SELECT COUNT(*) AS n FROM thread_fetch_log').get()).toEqual({ n: 1 });
    db.close();
  });

  it('v10 → latest keeps existing outbox rows on direct transport', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 10));
    db.exec(
      `INSERT INTO outbox (
        local_id, account_id, chat_id, text, state, sequence_id, part_index,
        message_id, error_code, error_message, text_highlights, attempts, retry_of,
        price, media_files, previews, created_at, updated_at
      ) VALUES (
        'L1', 'acct_1', '101', 'hello', 'failed', NULL, 0,
        NULL, 'CG-APP-01', 'failed', '[]', 1, NULL,
        0, '[]', '[]', '2026-06-20T00:00:00.000Z', '2026-06-20T00:00:01.000Z'
      )`,
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 10, to: SCHEMA_VERSION });
    expect(db.prepare("SELECT transport FROM outbox WHERE local_id = 'L1'").get()).toEqual({
      transport: 'direct',
    });
    db.close();
  });

  it('v11 → v12 flips reversible production custody defaults', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 11));
    db.exec(
      `INSERT INTO settings (key, value) VALUES
        ('ofapiReadTransport', '"direct"'),
        ('ofapiWriteTransport', '"direct"'),
        ('spendSweepRollbackToLegacy', 'true')
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 11, to: SCHEMA_VERSION });
    const values = db
      .prepare(
        `SELECT key, value FROM settings
         WHERE key IN ('ofapiReadTransport', 'ofapiWriteTransport', 'spendSweepRollbackToLegacy')
         ORDER BY key`,
      )
      .all();
    expect(values).toEqual([
      { key: 'ofapiReadTransport', value: '"hub"' },
      { key: 'ofapiWriteTransport', value: '"hub"' },
      { key: 'spendSweepRollbackToLegacy', value: 'false' },
    ]);
    db.close();
  });

  it('v13 changes only the outbox transport default to hub', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 12));
    db.exec(
      `INSERT INTO outbox (
        local_id, account_id, chat_id, text, transport, state, sequence_id, part_index,
        message_id, error_code, error_message, text_highlights, attempts, retry_of,
        price, media_files, previews, created_at, updated_at
      ) VALUES (
        'legacy-direct', 'acct_1', '101', 'hello', 'direct', 'failed', NULL, 0,
        NULL, 'CG-APP-01', 'failed', '[]', 1, NULL,
        0, '[]', '[]', '2026-06-20T00:00:00.000Z', '2026-06-20T00:00:01.000Z'
      )`,
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 12, to: SCHEMA_VERSION });
    expect(db.prepare("SELECT transport FROM outbox WHERE local_id = 'legacy-direct'").get()).toEqual({
      transport: 'direct',
    });

    db.exec(
      `INSERT INTO outbox (
        local_id, account_id, chat_id, text, state, sequence_id, part_index,
        message_id, error_code, error_message, text_highlights, attempts, retry_of,
        price, media_files, previews, created_at, updated_at
      ) VALUES (
        'default-hub', 'acct_1', '101', 'hello', 'queued', NULL, 0,
        NULL, NULL, NULL, '[]', 0, NULL,
        0, '[]', '[]', '2026-06-20T00:00:02.000Z', '2026-06-20T00:00:02.000Z'
      )`,
    );
    expect(db.prepare("SELECT transport FROM outbox WHERE local_id = 'default-hub'").get()).toEqual({
      transport: 'hub',
    });
    db.close();
  });

  it('v14 forces persisted write transport back to hub without rewriting outbox audit rows', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 13));
    db.exec(
      `INSERT INTO settings (key, value) VALUES ('ofapiWriteTransport', '"direct"')
       ON CONFLICT (key) DO UPDATE SET value = excluded.value;
       INSERT INTO outbox (
         local_id, account_id, chat_id, text, transport, state, sequence_id, part_index,
         message_id, error_code, error_message, text_highlights, attempts, retry_of,
         price, media_files, previews, created_at, updated_at
       ) VALUES (
         'legacy-direct', 'acct_1', '101', 'hello', 'direct', 'failed', NULL, 0,
         NULL, 'CG-APP-01', 'failed', '[]', 1, NULL,
         0, '[]', '[]', '2026-06-20T00:00:00.000Z', '2026-06-20T00:00:01.000Z'
       )`,
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 13, to: SCHEMA_VERSION });
    expect(db.prepare("SELECT value FROM settings WHERE key = 'ofapiWriteTransport'").get()).toEqual({
      value: '"hub"',
    });
    expect(db.prepare("SELECT transport FROM outbox WHERE local_id = 'legacy-direct'").get()).toEqual({
      transport: 'direct',
    });
    db.close();
  });

  it('v16 → latest adds durable AI acceptance and unsend lineage without touching spend history', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 16));
    db.exec(
      `INSERT INTO ai_spend_log (day, feature, runs, inserted)
       VALUES ('2026-07-12', 'fast-reply', 3, 1)`,
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 16, to: SCHEMA_VERSION });
    expect(db.prepare("SELECT runs, inserted FROM ai_spend_log WHERE day = '2026-07-12'").get())
      .toEqual({ runs: 3, inserted: 1 });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_acceptance_ops'").get(),
    ).toEqual({ name: 'ai_acceptance_ops' });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'unsend_commands'").get(),
    ).toEqual({ name: 'unsend_commands' });
    db.close();
  });

  it('v18 → latest installs the harvest fingerprint ledger and revision triggers', () => {
    const db = rawDb();
    runMigrations(db, MIGRATIONS.slice(0, 18));
    db.exec(
      `INSERT INTO settings (key, value) VALUES
         ('harvest.started_at', '"2026-07-12T00:00:00.000Z"'),
         ('harvest.completed_at', '"2026-07-12T00:01:00.000Z"');
       INSERT INTO messages (
         account_id, chat_id, message_id, created_at, is_sent_by_me,
         text_plain, raw, deleted
       ) VALUES (
         'acct_hv', '101', '1', '2026-07-12T00:00:00.000Z', 0,
         'before', '{}', 0
       );`,
    );

    expect(runMigrations(db, MIGRATIONS)).toEqual({ from: 18, to: SCHEMA_VERSION });
    expect(
      db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'harvest_uploaded_revisions'",
      ).get(),
    ).toEqual({ name: 'harvest_uploaded_revisions' });
    expect(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master " +
          "WHERE type = 'trigger' AND name LIKE 'harvest_revision_%'",
      ).get() as { count: number }).count,
    ).toBe(21);
    expect(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_temp_master " +
          "WHERE type = 'trigger' AND name LIKE 'harvest_revision_%'",
      ).get() as { count: number }).count,
    ).toBe(0);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'harvest.revision.messages'").get())
      .toBeUndefined();
    expect(db.prepare("SELECT value FROM settings WHERE key = 'harvest.format_version'").get())
      .toBeUndefined();

    db.exec("UPDATE messages SET text_plain = 'after' WHERE message_id = '1'");
    expect(db.prepare("SELECT value FROM settings WHERE key = 'harvest.revision.messages'").get())
      .toEqual({ value: '1' });
    db.exec("DELETE FROM messages WHERE message_id = '1'");
    expect(db.prepare("SELECT value FROM settings WHERE key = 'harvest.revision.messages'").get())
      .toEqual({ value: '2' });
    db.exec(
      `INSERT INTO messages (
         account_id, chat_id, message_id, created_at, is_sent_by_me,
         text_plain, raw, deleted
       ) VALUES (
         'acct_hv', '101', '2', '2026-07-12T00:02:00.000Z', 0,
         'reused slot', '{}', 0
       )`,
    );
    expect(db.prepare("SELECT value FROM settings WHERE key = 'harvest.revision.messages'").get())
      .toEqual({ value: '3' });
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
