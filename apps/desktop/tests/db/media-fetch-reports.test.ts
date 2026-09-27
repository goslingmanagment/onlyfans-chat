// D42: the durable media report queue — idempotent by resolve id, oldest
// first, poison rows dropped, a row leaves only when Core took it.

import { describe, expect, it } from 'vitest';
import { memoryDataLayer } from './helpers';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('media_fetch_reports queue', () => {
  it('enqueues once per resolve id, reads oldest first, removes on acceptance', () => {
    const layer = memoryDataLayer();
    try {
      const reports = layer.mediaFetchReports;
      reports.enqueue({ resolveId: ID(1), result: 'ok', bytesReceived: 21821, httpStatus: 200 });
      reports.enqueue({ resolveId: ID(1), result: 'failed', bytesReceived: 0, httpStatus: null }); // duplicate id
      reports.enqueue({ resolveId: ID(2), result: 'aborted_size', bytesReceived: 5_000_001, httpStatus: 200 });
      expect(reports.count()).toBe(2);
      expect(reports.next(100)).toEqual([
        { resolveId: ID(1), result: 'ok', bytesReceived: 21821, httpStatus: 200 },
        { resolveId: ID(2), result: 'aborted_size', bytesReceived: 5_000_001, httpStatus: 200 },
      ]);
      reports.noteAttempt([ID(1)]);
      reports.remove([ID(1)]);
      expect(reports.next(100).map((report) => report.resolveId)).toEqual([ID(2)]);
      expect(() => reports.enqueue({ resolveId: 'not-a-uuid', result: 'ok', bytesReceived: 1, httpStatus: 200 })).toThrow();
    } finally {
      layer.close();
    }
  });

  it('drops a malformed row instead of wedging the queue', () => {
    const layer = memoryDataLayer();
    try {
      layer.db.prepare("INSERT INTO media_fetch_reports (resolve_id, payload, created_at) VALUES ('x', 'not json', '2026-01-01')").run();
      layer.mediaFetchReports.enqueue({ resolveId: ID(3), result: 'timeout', bytesReceived: 10, httpStatus: null });
      expect(layer.mediaFetchReports.next(100)).toEqual([{ resolveId: ID(3), result: 'timeout', bytesReceived: 10, httpStatus: null }]);
      expect(layer.mediaFetchReports.count()).toBe(1);
    } finally {
      layer.close();
    }
  });

  it('media_urls keeps URL and id kinds apart', () => {
    const layer = memoryDataLayer();
    try {
      layer.mediaUrls.register('a'.repeat(64), 'https://public.onlyfans.com/files/avatar.jpg');
      layer.mediaUrls.registerOfapi('b'.repeat(64), { accountId: 'acct_1', mediaId: '42', variant: 'full' });
      expect(layer.mediaUrls.lookup('a'.repeat(64))).toBe('https://public.onlyfans.com/files/avatar.jpg');
      expect(layer.mediaUrls.lookup('b'.repeat(64))).toBeUndefined();
      expect(layer.mediaUrls.lookupEntry('b'.repeat(64))).toEqual({ kind: 'ofapi', accountId: 'acct_1', mediaId: '42', variant: 'full' });
      expect(layer.mediaUrls.lookupEntry('c'.repeat(64))).toBeUndefined();
    } finally {
      layer.close();
    }
  });
});
