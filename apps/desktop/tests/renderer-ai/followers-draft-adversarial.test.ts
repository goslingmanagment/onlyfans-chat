import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFollowerDraftWriter,
  resetFollowerDraftWriters,
} from '../../src/renderer/src/features/followers/draftWriter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => resetFollowerDraftWriters());
afterEach(() => resetFollowerDraftWriters());

describe('follower draft custody across component lifetimes', () => {
  it('keeps the newest edit when a previous mount acknowledges after the fan was reopened', async () => {
    const firstAck = deferred();
    let persisted = '';
    const writes: string[] = [];
    const save = vi.fn(async (text: string) => {
      persisted = text;
      writes.push(text);
      if (writes.length === 1) await firstAck.promise;
    });
    const firstMount = getFollowerDraftWriter('acct_a', '123', save);
    firstMount.edit('initial draft');
    const firstFlush = firstMount.flush();
    firstMount.edit('stale edit before switching away');
    // Unmount cleanup requests a flush while the first IPC acknowledgement waits.
    const cleanup = firstMount.flush();
    const reopened = getFollowerDraftWriter('acct_a', '123', save);
    reopened.edit('latest edit after returning');
    const reopenedFlush = reopened.flush();
    firstAck.resolve();
    await Promise.all([firstFlush, cleanup, reopenedFlush]);

    expect(writes).toEqual(['initial draft', 'latest edit after returning']);
    expect(persisted).toBe('latest edit after returning');
    expect(reopened.isDirty()).toBe(false);
  });

  it('does not serialize or transfer text across another fan or account', async () => {
    const firstAck = deferred();
    const blockedSave = vi.fn(async () => firstAck.promise);
    const fanSave = vi.fn(async (_text: string) => undefined);
    const accountSave = vi.fn(async (_text: string) => undefined);
    const a = getFollowerDraftWriter('acct_a', '123', blockedSave);
    const b = getFollowerDraftWriter('acct_a', '456', fanSave);
    const c = getFollowerDraftWriter('acct_b', '123', accountSave);
    a.edit('account A / fan 123');
    const blocked = a.flush();
    b.edit('account A / fan 456');
    c.edit('account B / fan 123');
    await Promise.all([b.flush(), c.flush()]);
    expect(fanSave).toHaveBeenCalledExactlyOnceWith('account A / fan 456');
    expect(accountSave).toHaveBeenCalledExactlyOnceWith('account B / fan 123');
    firstAck.resolve();
    await blocked;
    expect(blockedSave).toHaveBeenCalledExactlyOnceWith('account A / fan 123');
  });

  it('retires delayed old-context edits and rejects a flush that could otherwise continue a send', async () => {
    const oldAck = deferred();
    const writes: string[] = [];
    const oldSave = vi.fn(async (text: string) => { writes.push(text); await oldAck.promise; });
    const oldMount = getFollowerDraftWriter('acct_a', '123', oldSave);
    oldMount.edit('already dispatched under the old context');
    const oldFlush = oldMount.flush();
    oldMount.edit('queued stale edit under the old context');
    const sendContinuation = vi.fn();
    const oldAction = oldFlush.then(sendContinuation, () => undefined);

    resetFollowerDraftWriters();
    const currentSave = vi.fn(async (text: string) => { writes.push(text); });
    const currentMount = getFollowerDraftWriter('acct_a', '123', currentSave);
    currentMount.edit('new runtime draft');
    await currentMount.flush();
    oldAck.resolve();
    await oldAction;

    expect(sendContinuation).not.toHaveBeenCalled();
    expect(writes).toEqual(['already dispatched under the old context', 'new runtime draft']);
    expect(currentSave).toHaveBeenCalledExactlyOnceWith('new runtime draft');
  });

  it('keeps a failed save dirty for the reopened fan and retries its latest text', async () => {
    const save = vi.fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('IPC acknowledgement failed'))
      .mockResolvedValue(undefined);
    const firstMount = getFollowerDraftWriter('acct_a', '123', save);
    firstMount.edit('unsaved edit');
    await expect(firstMount.flush()).rejects.toThrow('IPC acknowledgement failed');
    const reopened = getFollowerDraftWriter('acct_a', '123', save);
    expect(reopened.isDirty()).toBe(true);
    reopened.edit('latest recovered edit');
    await reopened.flush();
    expect(save.mock.calls.map(([text]) => text)).toEqual(['unsaved edit', 'latest recovered edit']);
    expect(reopened.isDirty()).toBe(false);
  });
});
