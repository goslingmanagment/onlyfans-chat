// AI gateway seam (Stage 31): the kernel feature-service lane is the ONLY
// generation lane. The direct/hub-proxy gateways and their provider clients
// died with the cutover (kernel owns prompts, models, keys — Stage 30/31);
// this module keeps the streaming seam types the coordinator and adapters
// share.

import type { CgError } from '@chatgoose/shared/errors/index';
import type { LlmReasoningSignal, LlmUsageMetrics } from '@chatgoose/shared/usage-metrics';

export type CancelFn = () => void;

export interface StreamCallbacks {
  onText: (text: string) => void;
  onUsage?: (usage: LlmUsageMetrics) => void;
  onProgress?: () => void;
  onReasoningObserved?: (signal: LlmReasoningSignal) => void;
  /** Reasoning text deltas (legacy debug-profiling channel). */
  onReasoningDelta?: (text: string) => void;
  onStopReason?: (stopReason: string | null) => void;
  /** Fired exactly once with the terminal classified error. Aborts reject without firing it. */
  onError?: (error: CgError) => void;
}

/** Provider StreamCallbacks plus the terminal success signal. */
export interface AiGatewayCallbacks extends StreamCallbacks {
  /** Fired exactly once with the full raw text after the stream completes. */
  onComplete: (rawText: string) => void;
  /** Kernel lanes surface the gateway generation ref (meta frame requestId) —
   * the acceptance correlation anchor. */
  onGenerationRef?: (requestId: string) => void;
  /** The page's remaining daily gateway requests, from the meta quota frame
   * (#120) — the dock pre-warns before the cap turns into CG-HUB-03. */
  onQuotaRemaining?: (remainingRequests: number) => void;
}

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
