// thread_fetch_log (schema v10; PLAN item 13) — internal per-fan stamp of the
// last thread tail fetch. Written by EVERY fetch path (poll-delta tail,
// conversation open, quick-look hydrate, scoped refresh), including fans whose
// thread came back empty — automatic paths must never re-spend on fans who
// never wrote. Consulted with the shared 5-min TTL; never rendered per row
// (the UI shows one per-scope «последний апдейт» line only), so no change-bus
// events are published here.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import { chunked } from './fans';

export interface ThreadFetchLogQueries {
  stamp(accountId: string, chatId: string, fetchedAt: string): void;
  get(accountId: string, chatId: string): string | null;
  /** Batched stamps; chats never fetched are absent from the map. */
  getMany(accountId: string, chatIds: readonly string[]): Map<string, string>;
}

const rowSchema = z.object({ chat_id: z.string(), fetched_at: z.string() });

export function createThreadFetchLogQueries(db: ChatGooseDb): ThreadFetchLogQueries {
  return {
    stamp(accountId, chatId, fetchedAt) {
      db.prepare(
        'INSERT INTO thread_fetch_log (account_id, chat_id, fetched_at) ' +
          'VALUES (@account_id, @chat_id, @fetched_at) ' +
          'ON CONFLICT (account_id, chat_id) DO UPDATE SET fetched_at = excluded.fetched_at',
      ).run({ account_id: accountId, chat_id: chatId, fetched_at: fetchedAt });
    },

    get(accountId, chatId) {
      const row: unknown = db
        .prepare(
          'SELECT chat_id, fetched_at FROM thread_fetch_log ' +
            'WHERE account_id = @account_id AND chat_id = @chat_id',
        )
        .get({ account_id: accountId, chat_id: chatId });
      return row === undefined ? null : rowSchema.parse(row).fetched_at;
    },

    getMany(accountId, chatIds) {
      const out = new Map<string, string>();
      for (const chunk of chunked(chatIds)) {
        const placeholders = chunk.map((_, i) => `@id${i}`).join(', ');
        const params: Record<string, string> = { account_id: accountId };
        chunk.forEach((id, i) => {
          params[`id${i}`] = id;
        });
        const rows: unknown[] = db
          .prepare(
            `SELECT chat_id, fetched_at FROM thread_fetch_log
             WHERE account_id = @account_id AND chat_id IN (${placeholders})`,
          )
          .all(params);
        for (const raw of rows) {
          const row = rowSchema.parse(raw);
          out.set(row.chat_id, row.fetched_at);
        }
      }
      return out;
    },
  };
}
