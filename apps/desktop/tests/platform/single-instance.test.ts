// second-instance focus behavior (PLAN item 11): the lock-holding process
// must surface its window when a duplicate launch is forwarded to it.

import { describe, expect, it } from 'vitest';
import { focusExistingWindow } from '@main/platform/single-instance';
import type { FocusableWindow } from '@main/platform/single-instance';

function fakeWindow(state: { destroyed?: boolean; minimized?: boolean } = {}): {
  win: FocusableWindow;
  calls: string[];
} {
  const calls: string[] = [];
  const win: FocusableWindow = {
    isDestroyed: () => state.destroyed === true,
    isMinimized: () => state.minimized === true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
  return { win, calls };
}

describe('focusExistingWindow', () => {
  it('shows and focuses a normal window', () => {
    const { win, calls } = fakeWindow();
    focusExistingWindow(win);
    expect(calls).toEqual(['show', 'focus']);
  });

  it('restores first when the window is minimized', () => {
    const { win, calls } = fakeWindow({ minimized: true });
    focusExistingWindow(win);
    expect(calls).toEqual(['restore', 'show', 'focus']);
  });

  it('ignores a null window (second instance raced window creation)', () => {
    expect(() => focusExistingWindow(null)).not.toThrow();
  });

  it('ignores a destroyed window', () => {
    const { win, calls } = fakeWindow({ destroyed: true });
    focusExistingWindow(win);
    expect(calls).toEqual([]);
  });
});
