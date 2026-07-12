import { describe, expect, it } from 'vitest';
import { createRendererReadiness } from '@main/renderer-readiness';

describe('renderer readiness registry', () => {
  it('resolves only the matching WebContents waiter and ignores late duplicates', async () => {
    const readiness = createRendererReadiness();
    const ready = readiness.waitForNext(41);
    expect(readiness.markReady(99)).toBe(false);
    expect(readiness.markReady(41)).toBe(true);
    await expect(ready).resolves.toBeUndefined();
    expect(readiness.markReady(41)).toBe(false);
  });

  it('rejects a waiter when its window closes', async () => {
    const readiness = createRendererReadiness();
    const ready = readiness.waitForNext(7);
    const rejected = expect(ready).rejects.toThrow(/window closed/i);
    readiness.cancel(7, new Error('window closed'));
    await rejected;
  });
});
