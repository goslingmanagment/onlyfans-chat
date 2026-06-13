// Single-instance behavior (PLAN item 11). Two app processes on one encrypted
// db would double polling/credits and race the SQLite WAL; macOS masks the
// hazard (the dock re-activates the running app) but on Windows every shortcut
// launch spawns a fresh process. The composition root takes
// app.requestSingleInstanceLock() and routes 'second-instance' here.

export interface FocusableWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

/**
 * Surface the existing window when a duplicate launch is forwarded to the
 * lock-holding process: restore if minimized, then show + focus.
 */
export function focusExistingWindow(win: FocusableWindow | null): void {
  if (win === null || win.isDestroyed()) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}
