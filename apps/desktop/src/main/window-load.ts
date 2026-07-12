// Testable renderer-load gate used by packaged smoke and normal boot. Electron's
// loadFile/loadURL promise alone does not cover preload failure or a renderer
// process crash, so success is the did-finish-load event while every fatal load
// surface rejects the same promise.

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
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      events.removeListener('did-finish-load', onFinish);
      events.removeListener('did-fail-load', onFailLoad);
      events.removeListener('preload-error', onPreloadError);
      events.removeListener('render-process-gone', onRenderGone);
    };
    const succeed = (): void => {
      if (settled) return;
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
    const onFinish = (): void => succeed();
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

    try {
      void beginLoad().catch((error: unknown) => {
        fail(new Error(`Renderer navigation rejected: ${detailMessage(error)}`, { cause: error }));
      });
    } catch (error) {
      fail(new Error(`Renderer navigation threw: ${detailMessage(error)}`, { cause: error }));
    }
  });
}
