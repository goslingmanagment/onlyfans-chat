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
  /** One SQLite transaction and one settings-bus publication. */
  batch(mutations: readonly SettingsMutation[]): void;
  /** All settings except schema_version. */
  all(): Record<string, unknown>;
}

export type SettingsMutation =
  | { kind: 'set'; key: string; value: unknown }
  | { kind: 'remove'; key: string };

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

  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ' +
      'ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  );
  const remove = db.prepare('DELETE FROM settings WHERE key = @key');

  function serialize(value: unknown, key: string): string {
    const serialized: string | undefined = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error(`Setting "${key}" is not JSON-serializable`);
    }
    return serialized;
  }

  function batch(mutations: readonly SettingsMutation[]): void {
    const prepared = mutations.map((mutation) => {
      guardKey(mutation.key);
      return mutation.kind === 'set'
        ? { ...mutation, serialized: serialize(mutation.value, mutation.key) }
        : mutation;
    });
    let changed = false;
    db.transaction(() => {
      for (const mutation of prepared) {
        if (mutation.kind === 'set') {
          upsert.run({ key: mutation.key, value: mutation.serialized });
          changed = true;
        } else if (remove.run({ key: mutation.key }).changes > 0) {
          changed = true;
        }
      }
    });
    if (changed) {
      bus.publish({ scope: 'settings' });
    }
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
      batch([{ kind: 'set', key, value }]);
    },

    remove(key) {
      batch([{ kind: 'remove', key }]);
    },

    batch,

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
