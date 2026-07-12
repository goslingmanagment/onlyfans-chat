// Testable renderer-load gate used by packaged smoke and normal boot. Electron's
// loadFile/loadURL promise alone does not cover preload failure or a renderer
// process crash. Success requires BOTH did-finish-load and a post-commit
// renderer IPC acknowledgement while every fatal load surface rejects the same
// promise.

import type { EventEmitter } from 'node:events';

type LoadEventSource = Pick<EventEmitter, 'once' | 'removeListener'>;

function detailMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function awaitRendererLoad(
  events: LoadEventSource,
  beginLoad: () => Promise<unknown>,
  rendererReady: Promise<void>,
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let navigationFinished = false;
    let rendererAcknowledged = false;
    const timeout = setTimeout(() => {
      fail(new Error(`Renderer did not become ready within ${String(timeoutMs)} ms`));
    }, timeoutMs);
    timeout.unref?.();

    const cleanup = (): void => {
      clearTimeout(timeout);
      events.removeListener('did-finish-load', onFinish);
      events.removeListener('did-fail-load', onFailLoad);
      events.removeListener('preload-error', onPreloadError);
      events.removeListener('render-process-gone', onRenderGone);
    };
    const succeedIfReady = (): void => {
      if (settled || !navigationFinished || !rendererAcknowledged) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onFinish = (): void => {
      navigationFinished = true;
      succeedIfReady();
    };
    const onFailLoad = (
      _event: unknown,
      errorCode: unknown,
      errorDescription: unknown,
      validatedUrl: unknown,
    ): void => {
      fail(
        new Error(
          `Renderer failed to load (${detailMessage(errorCode)}): ${detailMessage(errorDescription)} ` +
            `[${detailMessage(validatedUrl)}]`,
        ),
      );
    };
    const onPreloadError = (_event: unknown, preloadPath: unknown, error: unknown): void => {
      fail(new Error(`Preload failed (${detailMessage(preloadPath)}): ${detailMessage(error)}`));
    };
    const onRenderGone = (_event: unknown, details: unknown): void => {
      fail(new Error(`Renderer process exited before load completed: ${detailMessage(details)}`));
    };

    events.once('did-finish-load', onFinish);
    events.once('did-fail-load', onFailLoad);
    events.once('preload-error', onPreloadError);
    events.once('render-process-gone', onRenderGone);

    void rendererReady.then(
      () => {
        rendererAcknowledged = true;
        succeedIfReady();
      },
      (error: unknown) => {
        fail(new Error(`Renderer readiness rejected: ${detailMessage(error)}`, { cause: error }));
      },
    );

    try {
      void beginLoad().catch((error: unknown) => {
        fail(new Error(`Renderer navigation rejected: ${detailMessage(error)}`, { cause: error }));
      });
    } catch (error) {
      fail(new Error(`Renderer navigation threw: ${detailMessage(error)}`, { cause: error }));
    }
  });
}
