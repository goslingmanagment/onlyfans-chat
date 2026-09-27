// media_urls(url_hash → source) — registry behind the opaque media:// token
// (SPEC §4). Minting a renderer-facing media URL registers its source here;
// the protocol handler resolves only registered hashes, so the renderer can
// never make main fetch something the sync/mapping layer did not mint.
// Two kinds (v26, D43): `url` (a remote URL — avatars) and `ofapi` (a file
// named by OFAPI account + media id + variant; Core decides how it is fetched).
// No DbChangedEvent scope: rows are protocol plumbing, nothing renders them.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';

export type MediaVariant = 'thumb' | 'full';

export type MediaUrlEntry =
  | { kind: 'url'; url: string }
  | { kind: 'ofapi'; accountId: string; mediaId: string; variant: MediaVariant };

const entryRowSchema = z.object({
  url: z.string(),
  kind: z.enum(['url', 'ofapi']),
  account_id: z.string().nullable(),
  media_id: z.string().nullable(),
  variant: z.enum(['thumb', 'full']).nullable(),
});

export interface MediaUrlsQueries {
  /** Latest signed URL wins for a stable media hash. */
  register(urlHash: string, url: string): void;
  /** An OFAPI file's id token (idempotent). */
  registerOfapi(urlHash: string, entry: { accountId: string; mediaId: string; variant: MediaVariant }): void;
  /** The remote URL of a `url` token; undefined for unknown or `ofapi` tokens. */
  lookup(urlHash: string): string | undefined;
  lookupEntry(urlHash: string): MediaUrlEntry | undefined;
  delete(urlHash: string): void;
  clear(): void;
}

export function createMediaUrlsQueries(
  db: ChatGooseDb,
  now: () => Date = () => new Date(),
): MediaUrlsQueries {
  function lookupEntry(urlHash: string): MediaUrlEntry | undefined {
    const raw: unknown = db
      .prepare('SELECT url, kind, account_id, media_id, variant FROM media_urls WHERE url_hash = @url_hash')
      .get({ url_hash: urlHash });
    if (raw === undefined) return undefined;
    const row = entryRowSchema.safeParse(raw);
    if (!row.success) return undefined;
    if (row.data.kind === 'url') return { kind: 'url', url: row.data.url };
    if (row.data.account_id === null || row.data.media_id === null || row.data.variant === null) {
      return undefined; // a partial id row is poison, never a fetch
    }
    return { kind: 'ofapi', accountId: row.data.account_id, mediaId: row.data.media_id, variant: row.data.variant };
  }

  return {
    register(urlHash, url) {
      db.prepare(
        `INSERT INTO media_urls (url_hash, url, created_at, kind)
         VALUES (@url_hash, @url, @created_at, 'url')
         ON CONFLICT (url_hash) DO UPDATE SET
           url = excluded.url, kind = 'url', account_id = NULL, media_id = NULL, variant = NULL`,
      ).run({ url_hash: urlHash, url, created_at: now().toISOString() });
    },

    registerOfapi(urlHash, entry) {
      db.prepare(
        `INSERT INTO media_urls (url_hash, url, created_at, kind, account_id, media_id, variant)
         VALUES (@url_hash, @label, @created_at, 'ofapi', @account_id, @media_id, @variant)
         ON CONFLICT (url_hash) DO NOTHING`,
      ).run({
        url_hash: urlHash,
        // Not a URL: an older build that reads this row refuses it (allowlist).
        label: `ofapi:${entry.accountId}/${entry.mediaId}/${entry.variant}`,
        created_at: now().toISOString(),
        account_id: entry.accountId,
        media_id: entry.mediaId,
        variant: entry.variant,
      });
    },

    lookup(urlHash) {
      const entry = lookupEntry(urlHash);
      return entry?.kind === 'url' ? entry.url : undefined;
    },

    lookupEntry,

    delete(urlHash) {
      db.prepare('DELETE FROM media_urls WHERE url_hash = @url_hash').run({ url_hash: urlHash });
    },

    clear() {
      db.exec('DELETE FROM media_urls');
    },
  };
}
