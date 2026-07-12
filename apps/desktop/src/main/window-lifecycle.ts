// BrowserWindow lifecycle policy kept outside the Electron composition root so
// replacement-window and destroyed-window behavior can be regression tested.

export interface LifecycleWindow {
  on(
    event: 'focus' | 'show' | 'hide' | 'minimize' | 'closed',
    listener: () => void,
  ): unknown;
  isDestroyed(): boolean;
  isVisible(): boolean;
  isFocused(): boolean;
}

export interface WindowVisibilityTarget {
  setWindowVisible(visible: boolean): void;
}

/** Keep window state outside a replaceable sync generation. A newly published
 * provider receives the latest hidden/visible value even when no new native
 * window event fires after the swap. */
export function createWindowVisibilityTracker(initialVisible = false): {
  update(visible: boolean, target: WindowVisibilityTarget | null): void;
  apply(target: WindowVisibilityTarget): void;
  current(): boolean;
} {
  let visible = initialVisible;
  return {
    update(next, target) {
      visible = next;
      target?.setWindowVisible(next);
    },
    apply(target) {
      target.setWindowVisible(visible);
    },
    current: () => visible,
  };
}

export function wireWindowLifecycle<Window extends LifecycleWindow>(
  window: Window,
  options: {
    setWindowVisible: (visible: boolean) => void;
    onClosed: (window: Window) => void;
  },
): void {
  window.on('focus', () => options.setWindowVisible(true));
  window.on('show', () => options.setWindowVisible(true));
  window.on('hide', () => options.setWindowVisible(false));
  window.on('minimize', () => options.setWindowVisible(false));
  window.on('closed', () => {
    options.onClosed(window);
    options.setWindowVisible(false);
  });
}

/** A closed/destroyed window is background state too. Keep every Electron
 * accessor behind this guard: a queued sync event can arrive after `closed`. */
export function isWindowBackgrounded(window: LifecycleWindow | null): boolean {
  if (window === null) {
    return true;
  }
  try {
    return window.isDestroyed() || !window.isVisible() || !window.isFocused();
  } catch {
    // Electron accessors may throw while native teardown is in progress.
    return true;
  }
}
