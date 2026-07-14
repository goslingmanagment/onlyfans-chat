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
  /** Exact synchronous page-label proof for the full operation lifetime. */
  isPageLabelCurrent: (accountId: string, pageLabel: string) => boolean;
}

// Kernel gate codes (#120): the kernel stamps each product-gate 400 with a
// machine code, so the CG mapping is structural — no message parsing.
const KERNEL_GATE_CODES: Record<string, () => CgError> = {
  gate_min_messages: () => new CgError('CG-FLOW-03'),
  gate_hi_greeting_limit: () => new CgError('CG-FLOW-09'),
  gate_ping_active: () => new CgError('CG-FLOW-05'),
  gate_draft_required: () => new CgError('CG-APP-01', { message: 'Draft text is required for this feature' }),
};

/**
 * The kernel enforces the migrated product gates (draft required, deep
 * minimum, hi-greeting lock, active-ping block) — map them back onto the
 * legacy CG codes so the dock shows the exact same errors. Structural code
 * first; the message match stays as a fallback for pre-#120 kernels.
 */
function mapKernelGateError(kernelCode: string | undefined, message: string): CgError | null {
  if (kernelCode !== undefined) {
    const structural = KERNEL_GATE_CODES[kernelCode];
    if (structural !== undefined) {
      return structural();
    }
  }
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
  // Kernel gate denials ride HubError (a CgError subclass) — map them
  // BEFORE the pass-through or every gate would surface as CG-HUB-02.
  const message = error instanceof Error ? error.message : String(error);
  const kernelCode = error instanceof HubError ? error.detail?.kernelCode : undefined;
  const mapped = mapKernelGateError(kernelCode, message);
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
      let routeInvalidated = false;

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
          const ensureCurrentRoute = (): boolean => {
            if (controller.signal.aborted) return false;
            if (options.isPageLabelCurrent(req.accountId, pageLabel)) return true;
            if (!routeInvalidated) {
              routeInvalidated = true;
              controller.abort();
              cb.onError?.(new CgError('CG-FLOW-02', {
                message: 'Core page mapping changed during generation; retry the operation.',
              }));
            }
            return false;
          };
          if (!ensureCurrentRoute()) return;

          const rawText = await options.client.streamAiFeature(
            {
              feature: req.feature,
              signal: controller.signal,
              ...(req.debugPromptEcho ? { debugPromptEcho: true } : {}),
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
              onProgress: () => {
                if (ensureCurrentRoute()) cb.onProgress?.();
              },
              onReasoningDelta: (text) => {
                if (ensureCurrentRoute()) cb.onReasoningDelta?.(text);
              },
              onStopReason: (stopReason) => {
                if (ensureCurrentRoute()) cb.onStopReason?.(stopReason);
              },
              onUsage: (usage) => {
                if (ensureCurrentRoute()) cb.onUsage?.(usage);
              },
              onMeta: (meta) => {
                if (!ensureCurrentRoute()) return;
                cb.onGenerationRef?.(meta.requestId);
                if (meta.quotaRemainingRequests !== null) {
                  cb.onQuotaRemaining?.(meta.quotaRemainingRequests);
                }
              },
              onDebugInput: (input) => {
                if (ensureCurrentRoute()) cb.onDebugInput?.(input);
              },
              onText: (text) => {
                if (ensureCurrentRoute()) cb.onText(text);
              },
            },
          );
          if (ensureCurrentRoute()) {
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
