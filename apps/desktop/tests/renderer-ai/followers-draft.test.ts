import { describe, expect, it, vi } from 'vitest';
import { createDraftWriter } from '../../src/renderer/src/features/followers/draftWriter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('follower draft write ordering', () => {
  it('flush waits for edits made while a previous save is still pending', async () => {
    const first = deferred();
    const second = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const writer = createDraftWriter(save);
    writer.edit('old');
    const flushing = writer.flush();
    writer.edit('latest');
    expect(writer.flush()).toBe(flushing);
    first.resolve();
    await Promise.resolve();
    expect(save.mock.calls.map((args) => args[0])).toEqual(['old', 'latest']);
    expect(writer.isDirty()).toBe(true);
    second.resolve();
    await flushing;
    expect(writer.isDirty()).toBe(false);
  });

  it('retains a failed edit for an explicit retry instead of claiming it was saved', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('IPC unavailable'))
      .mockResolvedValueOnce(undefined);
    const writer = createDraftWriter(save);
    writer.edit('keep me');
    await expect(writer.flush()).rejects.toThrow('IPC unavailable');
    expect(writer.isDirty()).toBe(true);
    await writer.flush();
    expect(save.mock.calls.map((args) => args[0])).toEqual([
      'keep me',
      'keep me',
    ]);
    expect(writer.isDirty()).toBe(false);
  });

  it('flushes an empty edit, and writers cannot cross account or fan identities', async () => {
    const saveA = vi.fn().mockResolvedValue(undefined);
    const saveB = vi.fn().mockResolvedValue(undefined);
    const a = createDraftWriter(saveA);
    const b = createDraftWriter(saveB);
    a.edit('');
    b.edit('other fan');
    await Promise.all([a.flush(), b.flush()]);
    expect(saveA).toHaveBeenCalledExactlyOnceWith('');
    expect(saveB).toHaveBeenCalledExactlyOnceWith('other fan');
    await a.flush();
    expect(saveA).toHaveBeenCalledTimes(1);
  });
});
