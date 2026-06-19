// Desktop HubGateway adapter (C6c/R4): keeps prompt/context construction in
// desktop, but streams the provider call through core when explicitly selected.

import { CgError } from '@chatgoose/shared/errors/index';
import { HubError } from '@chatgoose/shared/hub/index';
import type { HubClient, HubUsageFeature } from '@chatgoose/shared/hub/index';
import type { FeatureType } from '@chatgoose/shared/types';
import type { AiGateway } from '../ai/gateway';

export interface HubAiGatewayOptions {
  client: Pick<HubClient, 'streamAiGateway'>;
  resolvePageLabel: (accountId: string) => Promise<string | null>;
}

function toHubFeature(feature: FeatureType): HubUsageFeature {
  // `compare` never reaches the coordinator today; keep the same fallback as
  // direct usage reporting for future local orchestration.
  return feature === 'compare' ? 'fast-reply' : feature;
}

function toGatewayError(error: unknown): CgError {
  if (error instanceof CgError) {
    return error;
  }
  return new CgError('CG-HUB-02', {
    message: error instanceof Error ? error.message : String(error),
  });
}

export function createHubAiGateway(options: HubAiGatewayOptions): AiGateway {
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
              message: 'Hub AI gateway needs a mapped core page label for this account',
              detail: { providerMessage: req.accountId },
            });
          }

          const rawText = await options.client.streamAiGateway(
            {
              signal: controller.signal,
              request: {
                clientRequestId: req.clientRequestId,
                feature: toHubFeature(req.feature),
                pageLabel,
                platform: 'onlyfans',
                platformUserId: req.chatId,
                conversationId: req.chatId,
                model: req.modelId,
                reasoningEffort: req.reasoningEffort,
                ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
                ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
                isRegeneration: req.isRegeneration,
                prompt: {
                  systemBlocks: req.systemBlocks,
                  userBlocks: req.userBlocks,
                },
              },
            },
            {
              onProgress: () => cb.onProgress?.(),
              onReasoningDelta: (text) => cb.onReasoningDelta?.(text),
              onStopReason: (stopReason) => cb.onStopReason?.(stopReason),
              onUsage: (usage) => cb.onUsage?.(usage),
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
