import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { awaitRendererLoad } from '@main/window-load';

describe('awaitRendererLoad', () => {
  it('resolves only after did-finish-load', async () => {
    const events = new EventEmitter();
    const beginLoad = vi.fn(async () => undefined);
    let resolved = false;
    const loaded = awaitRendererLoad(events, beginLoad).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(beginLoad).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    events.emit('did-finish-load');
    await loaded;
    expect(resolved).toBe(true);
    expect(events.eventNames()).toEqual([]);
  });

  it.each([
    ['did-fail-load', [null, -6, 'FILE_NOT_FOUND', 'file:///missing/index.html']],
    ['preload-error', [null, '/missing/preload.mjs', new Error('module missing')]],
    ['render-process-gone', [null, { reason: 'crashed', exitCode: 1 }]],
  ] as const)('rejects on %s before renderer success', async (eventName, args) => {
    const events = new EventEmitter();
    const loaded = awaitRendererLoad(events, async () => undefined);
    events.emit(eventName, ...args);
    await expect(loaded).rejects.toThrow();
    expect(events.eventNames()).toEqual([]);
  });

  it('rejects a navigation promise failure and ignores later success', async () => {
    const events = new EventEmitter();
    const loaded = awaitRendererLoad(events, () => Promise.reject(new Error('loadFile rejected')));
    await expect(loaded).rejects.toThrow(/navigation rejected.*loadFile rejected/i);
    events.emit('did-finish-load');
  });
});
