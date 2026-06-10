// AiGateway seam (SPEC §8.6): the coordinator streams through this interface so
// P6 can swap in a HubGateway without touching the lifecycle. DirectGateway (P2)
// routes to the provider SSE clients with keys read from the OS keychain at
// call time — keys never live in coordinator state.

import { CgError } from '@chatgoose/shared/errors/index';
import { routeStream } from './providers/index';
import type {
  CancelFn,
  FetchImpl,
  LlmStreamRequest,
  ProviderKeys,
  StreamCallbacks,
} from './providers/index';
import type { Keychain } from '../secrets/keychain';

export type { CancelFn, LlmStreamRequest } from './providers/index';

/** Provider StreamCallbacks plus the terminal success signal. */
export interface AiGatewayCallbacks extends StreamCallbacks {
  /** Fired exactly once with the full raw text after the stream completes. */
  onComplete: (rawText: string) => void;
}

export interface AiGateway {
  stream(req: LlmStreamRequest, cb: AiGatewayCallbacks): CancelFn;
}

export interface DirectGatewayOptions {
  keychain: Pick<Keychain, 'getSecret'>;
  fetchImpl?: FetchImpl;
}

export function createDirectGateway(options: DirectGatewayOptions): AiGateway {
  return {
    stream(req, cb) {
      const controller = new AbortController();
      let errorFired = false;
      // routeStream/runWithLegacyRetry fire onError exactly once before
      // rejecting; the wrapper tracks that to avoid a second onError from the
      // outer catch. Aborts reject without onError (cancellation is silent).
      const innerCb: StreamCallbacks = {
        onText: (text) => cb.onText(text),
        ...(cb.onUsage ? { onUsage: cb.onUsage } : {}),
        ...(cb.onProgress ? { onProgress: cb.onProgress } : {}),
        ...(cb.onReasoningObserved ? { onReasoningObserved: cb.onReasoningObserved } : {}),
        ...(cb.onReasoningDelta ? { onReasoningDelta: cb.onReasoningDelta } : {}),
        ...(cb.onStopReason ? { onStopReason: cb.onStopReason } : {}),
        onError: (error) => {
          errorFired = true;
          cb.onError?.(error);
        },
      };

      void (async () => {
        let keys: ProviderKeys;
        try {
          const [anthropicApiKey, openRouterApiKey] = await Promise.all([
            options.keychain.getSecret('anthropicKey'),
            options.keychain.getSecret('openRouterKey'),
          ]);
          keys = {
            ...(anthropicApiKey ? { anthropicApiKey } : {}),
            ...(openRouterApiKey ? { openRouterApiKey } : {}),
          };
        } catch (error) {
          if (!controller.signal.aborted) {
            cb.onError?.(
              new CgError('CG-APP-01', {
                message: 'Failed to read provider API keys from the keychain',
                detail: {
                  providerMessage: error instanceof Error ? error.message : String(error),
                },
              }),
            );
          }
          return;
        }

        try {
          const rawText = await routeStream(req, innerCb, {
            keys,
            signal: controller.signal,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          });
          if (!controller.signal.aborted) {
            cb.onComplete(rawText);
          }
        } catch (error) {
          if (controller.signal.aborted || errorFired) {
            return;
          }
          cb.onError?.(
            error instanceof CgError
              ? error
              : new CgError('CG-APP-01', {
                  detail: {
                    providerMessage: error instanceof Error ? error.message : String(error),
                  },
                }),
          );
        }
      })();

      return () => controller.abort();
    },
  };
}
