// media_urls(url_hash → url) — registry behind the opaque media:// token
// (SPEC §4). Minting a renderer-facing media URL registers the remote URL
// here; the protocol handler resolves only registered hashes, so the renderer
// can never make main fetch a URL the sync/mapping layer did not mint.
// No DbChangedEvent scope: rows are protocol plumbing, nothing renders them.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';

const urlRowSchema = z.object({ url: z.string() });

export interface MediaUrlsQueries {
  /** Latest signed URL wins for a stable media hash. */
  register(urlHash: string, url: string): void;
  lookup(urlHash: string): string | undefined;
  delete(urlHash: string): void;
  clear(): void;
}

export function createMediaUrlsQueries(
  db: ChatGooseDb,
  now: () => Date = () => new Date(),
): MediaUrlsQueries {
  return {
    register(urlHash, url) {
      db.prepare(
        `INSERT INTO media_urls (url_hash, url, created_at)
         VALUES (@url_hash, @url, @created_at)
         ON CONFLICT (url_hash) DO UPDATE SET
           url = excluded.url`,
      ).run({ url_hash: urlHash, url, created_at: now().toISOString() });
    },

    lookup(urlHash) {
      const row: unknown = db
        .prepare('SELECT url FROM media_urls WHERE url_hash = @url_hash')
        .get({ url_hash: urlHash });
      return row === undefined ? undefined : urlRowSchema.parse(row).url;
    },

    delete(urlHash) {
      db.prepare('DELETE FROM media_urls WHERE url_hash = @url_hash').run({ url_hash: urlHash });
    },

    clear() {
      db.exec('DELETE FROM media_urls');
    },
  };
}
