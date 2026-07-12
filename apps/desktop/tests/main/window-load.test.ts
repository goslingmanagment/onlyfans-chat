import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { awaitRendererLoad } from '@main/window-load';

afterEach(() => {
  vi.useRealTimers();
});

describe('awaitRendererLoad', () => {
  it('does not resolve on did-finish-load until the committed renderer acknowledges IPC', async () => {
    const events = new EventEmitter();
    const beginLoad = vi.fn(async () => undefined);
    let acknowledge: (() => void) | undefined;
    const rendererReady = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    let resolved = false;
    const loaded = awaitRendererLoad(events, beginLoad, rendererReady).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(beginLoad).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    events.emit('did-finish-load');
    await Promise.resolve();
    expect(resolved).toBe(false);
    acknowledge?.();
    await loaded;
    expect(resolved).toBe(true);
    expect(events.eventNames()).toEqual([]);
  });

  it('also waits for navigation when renderer acknowledgement arrives first', async () => {
    const events = new EventEmitter();
    let resolved = false;
    const loaded = awaitRendererLoad(events, async () => undefined, Promise.resolve()).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    events.emit('did-finish-load');
    await loaded;
    expect(resolved).toBe(true);
  });

  it.each([
    ['did-fail-load', [null, -6, 'FILE_NOT_FOUND', 'file:///missing/index.html']],
    ['preload-error', [null, '/missing/preload.mjs', new Error('module missing')]],
    ['render-process-gone', [null, { reason: 'crashed', exitCode: 1 }]],
  ] as const)('rejects on %s before renderer success', async (eventName, args) => {
    const events = new EventEmitter();
    const loaded = awaitRendererLoad(events, async () => undefined, new Promise<void>(() => undefined));
    events.emit(eventName, ...args);
    await expect(loaded).rejects.toThrow();
    expect(events.eventNames()).toEqual([]);
  });

  it('rejects a navigation promise failure and ignores later success', async () => {
    const events = new EventEmitter();
    const loaded = awaitRendererLoad(
      events,
      () => Promise.reject(new Error('loadFile rejected')),
      Promise.resolve(),
    );
    await expect(loaded).rejects.toThrow(/navigation rejected.*loadFile rejected/i);
    events.emit('did-finish-load');
  });

  it('rejects when the renderer acknowledgement never arrives', async () => {
    vi.useFakeTimers();
    const events = new EventEmitter();
    const loaded = awaitRendererLoad(
      events,
      async () => undefined,
      new Promise<void>(() => undefined),
      50,
    );
    const rejected = expect(loaded).rejects.toThrow(/did not become ready within 50 ms/i);
    events.emit('did-finish-load');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(events.eventNames()).toEqual([]);
  });
});
