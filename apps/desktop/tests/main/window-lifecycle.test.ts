import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createWindowVisibilityTracker,
  isWindowBackgrounded,
  wireWindowLifecycle,
} from '@main/window-lifecycle';

class FakeWindow extends EventEmitter {
  destroyed = false;
  visible = false;
  focused = false;

  isDestroyed(): boolean { return this.destroyed; }
  isVisible(): boolean { return this.visible; }
  isFocused(): boolean { return this.focused; }
}

describe('window lifecycle', () => {
  it('transfers hidden state to a replacement sync provider without another window event', () => {
    const tracker = createWindowVisibilityTracker(true);
    const first = { setWindowVisible: vi.fn() };
    const replacement = { setWindowVisible: vi.fn() };

    tracker.update(false, first);
    tracker.apply(replacement);

    expect(first.setWindowVisible).toHaveBeenCalledWith(false);
    expect(replacement.setWindowVisible).toHaveBeenCalledWith(false);
    expect(tracker.current()).toBe(false);
  });

  it('wires visibility and clears only the replacement that actually closed', () => {
    const first = new FakeWindow();
    const second = new FakeWindow();
    let current: FakeWindow | null = first;
    const visibility: boolean[] = [];
    const wire = (window: FakeWindow): void => wireWindowLifecycle(window, {
      setWindowVisible: (visible) => visibility.push(visible),
      onClosed: (closed) => {
        if (current === closed) current = null;
      },
    });
    wire(first);
    wire(second);
    current = second;

    first.emit('closed');
    expect(current).toBe(second);
    second.emit('show');
    second.emit('focus');
    second.emit('minimize');
    second.emit('closed');

    expect(current).toBeNull();
    expect(visibility).toEqual([false, true, true, false, false]);
  });

  it('treats missing, destroyed, and teardown-throwing windows as background', () => {
    expect(isWindowBackgrounded(null)).toBe(true);
    const window = new FakeWindow();
    window.visible = true;
    window.focused = true;
    expect(isWindowBackgrounded(window)).toBe(false);
    window.destroyed = true;
    expect(isWindowBackgrounded(window)).toBe(true);
    window.isDestroyed = () => { throw new Error('native object gone'); };
    expect(isWindowBackgrounded(window)).toBe(true);
  });
});
