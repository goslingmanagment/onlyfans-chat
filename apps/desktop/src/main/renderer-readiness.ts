// Per-WebContents renderer-ready rendezvous. Navigation success alone does not
// prove that preload IPC works or that React committed its healthy app tree.

export interface RendererReadiness {
  waitForNext(webContentsId: number): Promise<void>;
  markReady(webContentsId: number): boolean;
  cancel(webContentsId: number, reason?: Error): void;
}

interface Waiter {
  resolve: () => void;
  reject: (reason: Error) => void;
}

export function createRendererReadiness(): RendererReadiness {
  const waiters = new Map<number, Waiter>();

  const cancel = (
    webContentsId: number,
    reason = new Error(`Renderer readiness cancelled for WebContents ${String(webContentsId)}`),
  ): void => {
    const waiter = waiters.get(webContentsId);
    if (waiter === undefined) {
      return;
    }
    waiters.delete(webContentsId);
    waiter.reject(reason);
  };

  return {
    waitForNext(webContentsId) {
      cancel(
        webContentsId,
        new Error(`Renderer readiness superseded for WebContents ${String(webContentsId)}`),
      );
      return new Promise<void>((resolve, reject) => {
        waiters.set(webContentsId, { resolve, reject });
      });
    },
    markReady(webContentsId) {
      const waiter = waiters.get(webContentsId);
      if (waiter === undefined) {
        return false;
      }
      waiters.delete(webContentsId);
      waiter.resolve();
      return true;
    },
    cancel,
  };
}
