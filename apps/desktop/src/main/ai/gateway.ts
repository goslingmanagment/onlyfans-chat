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

export type AiGatewayTransport = 'direct' | 'hub' | 'feature';

/** Stage 31: the kernel feature-service lane — refs, not assembled blocks.
 * The kernel loads context, builds the (byte-identical) prompt, and streams
 * through its gateway; the desktop keeps only lifecycle + insertion UX. */
export interface AiFeatureGatewayRequest {
  feature: string;
  /** Stable operation id; core uses it as the gateway idempotency key AND
   * the acceptance correlation anchor (Stage 31 §2). */
  clientRequestId: string;
  /** Local OFAPI account id; resolved to a core page label by the adapter. */
  accountId: string;
  /** Raw OnlyFans fan/conversation id. */
  chatId: string;
  tone?: string | undefined;
  mode?: string | undefined;
  draftText?: string | undefined;
  personaKey?: string | undefined;
  isRegeneration: boolean;
}

export interface AiFeatureGateway {
  stream(req: AiFeatureGatewayRequest, cb: AiGatewayCallbacks): CancelFn;
}

export interface AiGatewayRequest extends LlmStreamRequest {
  /** Stable operation/request id; core uses it as the gateway idempotency key. */
  clientRequestId: string;
  /** Local OFAPI account id; hub mode resolves this to a core page label. */
  accountId: string;
  /** Raw OnlyFans fan/conversation id. */
  chatId: string;
  isRegeneration: boolean;
  transport: AiGatewayTransport;
}

/** Provider StreamCallbacks plus the terminal success signal. */
export interface AiGatewayCallbacks extends StreamCallbacks {
  /** Fired exactly once with the full raw text after the stream completes. */
  onComplete: (rawText: string) => void;
  /** Stage 31: kernel lanes surface the gateway generation ref (meta frame
   * requestId) — the acceptance correlation anchor. Absent on direct. */
  onGenerationRef?: (requestId: string) => void;
}

export interface AiGateway {
  stream(req: AiGatewayRequest, cb: AiGatewayCallbacks): CancelFn;
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

export interface SelectableAiGatewayOptions {
  direct: AiGateway;
  hub: AiGateway;
}

export function createSelectableAiGateway(options: SelectableAiGatewayOptions): AiGateway {
  return {
    stream(req, cb) {
      const target = req.transport === 'hub' ? options.hub : options.direct;
      return target.stream(req, cb);
    },
  };
}
