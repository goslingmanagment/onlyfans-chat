// Stage 31: the kernel feature-service lane. Unlike hub/ai-gateway.ts (the
// proxy adapter this supersedes), NO prompt or context leaves the desktop —
// the request carries refs and the kernel assembles the byte-identical
// prompt (Stage 30 parity sign-off). Same SSE frames, same dock lifecycle.

import { CgError } from '@chatgoose/shared/errors/index';
import { HubError } from '@chatgoose/shared/hub/index';
import type { HubClient } from '@chatgoose/shared/hub/index';
import type { AiFeatureGateway } from '../ai/gateway';

export interface FeatureAiGatewayOptions {
  client: Pick<HubClient, 'streamAiFeature'>;
  resolvePageLabel: (accountId: string) => Promise<string | null>;
}

/**
 * The kernel enforces the migrated product gates (draft required, deep
 * minimum, hi-greeting lock, active-ping block) — map its 400 messages back
 * onto the legacy CG codes so the dock shows the exact same errors.
 */
function mapKernelGateError(message: string): CgError | null {
  if (message.includes('requires at least')) {
    return new CgError('CG-FLOW-03');
  }
  if (message.includes('at most') && message.includes('hi-greeting')) {
    return new CgError('CG-FLOW-09');
  }
  if (message.includes('blocked while the conversation is active')) {
    return new CgError('CG-FLOW-05');
  }
  if (message.includes('requires draftText')) {
    return new CgError('CG-APP-01', { message: 'Draft text is required for this feature' });
  }
  return null;
}

function toGatewayError(error: unknown): CgError {
  // Kernel gate messages ride HubError (a CgError subclass) — map them
  // BEFORE the pass-through or every gate would surface as CG-HUB-02.
  const message = error instanceof Error ? error.message : String(error);
  const mapped = mapKernelGateError(message);
  if (mapped !== null) {
    return mapped;
  }
  // Timeouts and connection drops get the actionable CG-NET wording instead
  // of the generic hub-failed card; quota (CG-HUB-03) and auth (CG-HUB-01)
  // already carry their own codes via HubError.
  if (error instanceof HubError) {
    if (error.reason === 'timeout') {
      return new CgError('CG-NET-02', { message: error.message, ...(error.detail ? { detail: error.detail } : {}) });
    }
    if (error.reason === 'network') {
      return new CgError('CG-NET-01', { message: error.message, ...(error.detail ? { detail: error.detail } : {}) });
    }
  }
  if (error instanceof CgError) {
    return error;
  }
  return new CgError('CG-HUB-02', { message });
}

export function createFeatureAiGateway(options: FeatureAiGatewayOptions): AiFeatureGateway {
  return {
    stream(req, cb) {
      const controller = new AbortController();

      void (async () => {
        try {
          const pageLabel = await options.resolvePageLabel(req.accountId);
          if (controller.signal.aborted) {
            return;
          }
          if (pageLabel === null) {
            throw new HubError('bad-request', {
              message: 'AI feature lane needs a mapped core page label for this account',
              detail: { providerMessage: req.accountId },
            });
          }

          const rawText = await options.client.streamAiFeature(
            {
              feature: req.feature,
              signal: controller.signal,
              request: {
                clientRequestId: req.clientRequestId,
                pageLabel,
                platform: 'onlyfans',
                conversationRef: req.chatId,
                ...(req.tone !== undefined ? { replyTone: req.tone as never } : {}),
                ...(req.mode !== undefined ? { replyMode: req.mode as never } : {}),
                ...(req.draftText !== undefined ? { draftText: req.draftText } : {}),
                ...(req.personaKey !== undefined ? { personaKey: req.personaKey } : {}),
                isRegeneration: req.isRegeneration,
              },
            },
            {
              onProgress: () => cb.onProgress?.(),
              onReasoningDelta: (text) => cb.onReasoningDelta?.(text),
              onStopReason: (stopReason) => cb.onStopReason?.(stopReason),
              onUsage: (usage) => cb.onUsage?.(usage),
              onMeta: (meta) => cb.onGenerationRef?.(meta.requestId),
              onText: (text) => cb.onText(text),
            },
          );
          if (!controller.signal.aborted) {
            cb.onComplete(rawText);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            cb.onError?.(toGatewayError(error));
          }
        }
      })();

      return () => controller.abort();
    },
  };
}
