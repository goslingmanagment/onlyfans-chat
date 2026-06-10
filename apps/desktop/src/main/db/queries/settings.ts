// settings(key, value JSON). schema_version lives in this table but belongs to
// the migration runner — guarded against writes here. Reads are zod-validated
// via caller-supplied schemas (storage is a trust boundary).

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { SCHEMA_VERSION_KEY } from '../migrations';

const valueRowSchema = z.object({ value: z.string() });
const keyValueRowSchema = z.object({ key: z.string(), value: z.string() });

export interface SettingsQueries {
  /** Parsed JSON value, or undefined when unset. */
  get(key: string): unknown;
  /** Validated read; undefined when unset OR when the stored value fails the schema. */
  getParsed<T>(key: string, schema: z.ZodType<T>): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  /** All settings except schema_version. */
  all(): Record<string, unknown>;
}

function guardKey(key: string): void {
  if (key === SCHEMA_VERSION_KEY) {
    throw new Error('schema_version is owned by the migration runner');
  }
}

export function createSettingsQueries(db: ChatGooseDb, bus: DbChangeBus): SettingsQueries {
  function readRaw(key: string): string | undefined {
    const row: unknown = db.prepare('SELECT value FROM settings WHERE key = @key').get({ key });
    return row === undefined ? undefined : valueRowSchema.parse(row).value;
  }

  return {
    get(key) {
      const raw = readRaw(key);
      if (raw === undefined) {
        return undefined;
      }
      const parsed: unknown = JSON.parse(raw);
      return parsed;
    },

    getParsed(key, schema) {
      const raw = readRaw(key);
      if (raw === undefined) {
        return undefined;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return undefined;
      }
      const result = schema.safeParse(json);
      return result.success ? result.data : undefined;
    },

    set(key, value) {
      guardKey(key);
      // JSON.stringify returns undefined at runtime for non-serializable roots.
      const serialized: string | undefined = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error(`Setting "${key}" is not JSON-serializable`);
      }
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (@key, @value) ' +
          'ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      ).run({ key, value: serialized });
      bus.publish({ scope: 'settings' });
    },

    remove(key) {
      guardKey(key);
      const { changes } = db.prepare('DELETE FROM settings WHERE key = @key').run({ key });
      if (changes > 0) {
        bus.publish({ scope: 'settings' });
      }
    },

    all() {
      const rows = db
        .prepare('SELECT key, value FROM settings WHERE key != @schema_key')
        .all({ schema_key: SCHEMA_VERSION_KEY });
      const out: Record<string, unknown> = {};
      for (const raw of rows) {
        const row = keyValueRowSchema.parse(raw);
        try {
          out[row.key] = JSON.parse(row.value);
        } catch {
          // Corrupt JSON value — skip rather than crash the read path.
        }
      }
      return out;
    },
  };
}
