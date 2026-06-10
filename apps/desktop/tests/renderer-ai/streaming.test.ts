// Streaming hot-path logic (DESIGN §3.4): chunk batching ≤1 flush / 50 ms and
// the live [NEXT] splitter feeding the imperative DOM appender.

import { describe, expect, it } from 'vitest';
import {
  createChunkBatcherWith,
  createStreamSplitter,
  STREAM_FLUSH_MS,
  type SchedulerLike,
  type StreamRenderOp,
} from '../../src/renderer/src/features/ai/dockLogic';

// ─── fake scheduler ────────────────────────────────────────────────────────

interface FakeTask {
  id: number;
  fn: () => void;
  ms: number;
  cleared: boolean;
}

function fakeScheduler(): SchedulerLike<number> & { tasks: FakeTask[]; fire(id: number): void } {
  const tasks: FakeTask[] = [];
  let seq = 0;
  return {
    tasks,
    set(fn, ms) {
      seq += 1;
      tasks.push({ id: seq, fn, ms, cleared: false });
      return seq;
    },
    clear(handle) {
      const task = tasks.find((t) => t.id === handle);
      if (task !== undefined) task.cleared = true;
    },
    fire(id) {
      const task = tasks.find((t) => t.id === id);
      if (task !== undefined && !task.cleared) task.fn();
    },
  };
}

describe('createChunkBatcherWith', () => {
  it('batches consecutive pushes into a single flush at the interval', () => {
    const scheduler = fakeScheduler();
    const flushes: string[] = [];
    const batcher = createChunkBatcherWith(scheduler, (text) => flushes.push(text));

    batcher.push('hel');
    batcher.push('lo ');
    batcher.push('you');
    expect(flushes).toEqual([]); // nothing until the timer fires
    expect(scheduler.tasks.filter((t) => !t.cleared)).toHaveLength(1); // ≤1 pending flush
    expect(scheduler.tasks[0]?.ms).toBe(STREAM_FLUSH_MS);

    scheduler.fire(1);
    expect(flushes).toEqual(['hello you']);
  });

  it('schedules a new window after a flush, never two timers at once', () => {
    const scheduler = fakeScheduler();
    const flushes: string[] = [];
    const batcher = createChunkBatcherWith(scheduler, (text) => flushes.push(text));

    batcher.push('a');
    batcher.push('b');
    scheduler.fire(1);
    batcher.push('c');
    expect(scheduler.tasks).toHaveLength(2); // one per window
    scheduler.fire(2);
    expect(flushes).toEqual(['ab', 'c']);
  });

  it('flush() emits pending text immediately and cancels the timer', () => {
    const scheduler = fakeScheduler();
    const flushes: string[] = [];
    const batcher = createChunkBatcherWith(scheduler, (text) => flushes.push(text));

    batcher.push('tail');
    batcher.flush();
    expect(flushes).toEqual(['tail']);
    expect(scheduler.tasks[0]?.cleared).toBe(true);
    scheduler.fire(1); // cleared timer must not double-flush
    expect(flushes).toEqual(['tail']);
  });

  it('flush() with nothing pending emits nothing', () => {
    const scheduler = fakeScheduler();
    const flushes: string[] = [];
    const batcher = createChunkBatcherWith(scheduler, (text) => flushes.push(text));
    batcher.flush();
    expect(flushes).toEqual([]);
  });

  it('empty pushes do not schedule a flush', () => {
    const scheduler = fakeScheduler();
    const batcher = createChunkBatcherWith(scheduler, () => undefined);
    batcher.push('');
    expect(scheduler.tasks).toHaveLength(0);
  });

  it('dispose() drops pending text and ignores later pushes', () => {
    const scheduler = fakeScheduler();
    const flushes: string[] = [];
    const batcher = createChunkBatcherWith(scheduler, (text) => flushes.push(text));

    batcher.push('dead');
    batcher.dispose();
    batcher.push('more');
    batcher.flush();
    scheduler.fire(1);
    expect(flushes).toEqual([]);
  });
});

// ─── splitter ──────────────────────────────────────────────────────────────

function appended(ops: StreamRenderOp[]): string {
  return ops.map((op) => (op.kind === 'append' ? op.text : '|')).join('');
}

describe('createStreamSplitter', () => {
  it('passes plain text through (leading whitespace trimmed at part start)', () => {
    const splitter = createStreamSplitter();
    expect(appended(splitter.feed('  hello'))).toBe('hello');
    expect(appended(splitter.feed(' world'))).toBe(' world');
  });

  it('breaks on a [NEXT] inside a single chunk', () => {
    const splitter = createStreamSplitter();
    const ops = splitter.feed('first part[NEXT]second part');
    expect(ops).toEqual([
      { kind: 'append', text: 'first part' },
      { kind: 'break' },
      { kind: 'append', text: 'second part' },
    ]);
  });

  it('handles the marker split across chunk boundaries', () => {
    const splitter = createStreamSplitter();
    const a = splitter.feed('aaa[NE');
    expect(a).toEqual([{ kind: 'append', text: 'aaa' }]); // '[NE' withheld
    const b = splitter.feed('XT]bbb');
    expect(b).toEqual([{ kind: 'break' }, { kind: 'append', text: 'bbb' }]);
  });

  it('releases a false marker prefix as plain text', () => {
    const splitter = createStreamSplitter();
    expect(appended(splitter.feed('aaa[NE'))).toBe('aaa');
    expect(appended(splitter.feed('VER]bbb'))).toBe('[NEVER]bbb');
  });

  it('finish() releases a withheld tail', () => {
    const splitter = createStreamSplitter();
    expect(appended(splitter.feed('end with [NEXT'))).toBe('end with ');
    expect(splitter.finish()).toEqual([{ kind: 'append', text: '[NEXT' }]);
    expect(splitter.finish()).toEqual([]); // idempotent
  });

  it('suppresses empty parts (leading / consecutive markers)', () => {
    const splitter = createStreamSplitter();
    expect(splitter.feed('[NEXT]hi')).toEqual([{ kind: 'append', text: 'hi' }]);
    const ops = splitter.feed('a[NEXT][NEXT]b');
    expect(ops).toEqual([
      { kind: 'append', text: 'a' },
      { kind: 'break' },
      { kind: 'append', text: 'b' },
    ]);
  });

  it('trims whitespace at the start of a new part', () => {
    const splitter = createStreamSplitter();
    const ops = splitter.feed('a[NEXT] \n b');
    expect(ops).toEqual([
      { kind: 'append', text: 'a' },
      { kind: 'break' },
      { kind: 'append', text: 'b' },
    ]);
  });

  it('reassembles a realistic chunked stream', () => {
    const full = "payday huh… counting days too 😏[NEXT]no pressure baby, it'll be waiting";
    const splitter = createStreamSplitter();
    const ops: StreamRenderOp[] = [];
    for (let i = 0; i < full.length; i += 3) {
      ops.push(...splitter.feed(full.slice(i, i + 3)));
    }
    ops.push(...splitter.finish());
    const parts: string[] = [''];
    for (const op of ops) {
      if (op.kind === 'break') parts.push('');
      else parts[parts.length - 1] = (parts[parts.length - 1] ?? '') + op.text;
    }
    expect(parts.map((p) => p.trim())).toEqual([
      'payday huh… counting days too 😏',
      "no pressure baby, it'll be waiting",
    ]);
  });
});
