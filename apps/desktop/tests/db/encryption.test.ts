// Encryption-at-rest proof (SPEC §10/§15.9): a DB written with a key cannot be
// opened without it, and the on-disk bytes never contain plaintext probes.

import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createChangeBus, createDataLayer, loadSqliteDriver, openDatabase } from '@main/db/index';
import { sampleChat, tempDbFile, TEST_DRIVER } from './helpers';
import type { TempDir } from './helpers';

const PROBE = 'PLAINTEXT_PROBE_super_secret_fan_name_8842';
const KEY = 'unit-test-key-with-\'quote\'-and-unicode-ü';

let tmp: TempDir | null = null;

afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function writeProbeDb(file: string): void {
  const layer = createDataLayer({
    driverPath: TEST_DRIVER,
    filePath: file,
    encryptionKey: KEY,
    bus: createChangeBus(0),
  });
  layer.chats.upsert(sampleChat({ fanName: PROBE, lastMessagePreview: PROBE }));
  layer.close();
}

describe('database encryption', () => {
  it('round-trips data with the right key and runs in WAL mode', () => {
    tmp = tempDbFile();
    writeProbeDb(tmp.file);

    const reopened = openDatabase({ driverPath: TEST_DRIVER, filePath: tmp.file, encryptionKey: KEY });
    expect(reopened.pragma('journal_mode', { simple: true })).toBe('wal');
    const row: unknown = reopened
      .prepare('SELECT fan_name FROM chats WHERE chat_id = @chat_id')
      .get({ chat_id: '101' });
    expect(row).toEqual({ fan_name: PROBE });
    reopened.close();
  });

  it('throws when reopened with the wrong key', () => {
    const t = (tmp = tempDbFile());
    writeProbeDb(t.file);
    expect(() =>
      openDatabase({ driverPath: TEST_DRIVER, filePath: t.file, encryptionKey: 'wrong-key' }),
    ).toThrow(/not a database/);
  });

  it('cannot be read without any key (raw driver)', () => {
    tmp = tempDbFile();
    writeProbeDb(tmp.file);
    const Driver = loadSqliteDriver(TEST_DRIVER);
    const raw = new Driver(tmp.file);
    expect(() => raw.prepare('SELECT * FROM chats').all()).toThrow(/not a database/);
    raw.close();
  });

  it('never writes the probe string to disk in plaintext', () => {
    tmp = tempDbFile();
    writeProbeDb(tmp.file);
    const probeBytes = Buffer.from(PROBE, 'utf8');
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${tmp.file}${suffix}`;
      if (existsSync(path)) {
        expect(readFileSync(path).includes(probeBytes)).toBe(false);
      }
    }
  });

  it('refuses an unencrypted file database', () => {
    const t = (tmp = tempDbFile());
    expect(() =>
      openDatabase({ driverPath: TEST_DRIVER, filePath: t.file, encryptionKey: null }),
    ).toThrow(/encrypt/i);
    expect(() =>
      openDatabase({ driverPath: TEST_DRIVER, filePath: t.file, encryptionKey: '' }),
    ).toThrow(/encrypt/i);
  });

  it('refuses a key on in-memory databases (driver limitation, tests only)', () => {
    expect(() =>
      openDatabase({ driverPath: TEST_DRIVER, filePath: ':memory:', encryptionKey: KEY }),
    ).toThrow(/memory/i);
  });
});
