// Feature policy registry (legacy features.ts pattern; SPEC §8.4).
//
// Surface rename map (legacy extension → desktop):
//   'inline-reply' (panel under the Fansly composer)            → 'ai-dock'   (inline AI dock under the composer)
//   'overlay'      (modal overlay; helpMe/readOnly kinds)        → 'panel-tab' (read-only panel tab / dock cards)
//
// Result kinds collapsed from legacy's five to the shared three (types.ts ResultKind):
//   legacy 'reply' → 'reply'; 'single-reply' → 'single-reply';
//   'help-me'/'chat-review' → 'xml' (tagged document, XML-extracted);
//   'summary' → 'single-reply' (plain document, rendered raw; read-only comes from the surface).

import type { FeatureType, ModelSelectableFeature, PromptMode, ResultKind } from './types';
import type { Settings } from './constants';
import { HI_GREETING_MESSAGE_COUNT, MIN_MESSAGES_FOR_DEEP } from './constants';

/** Features that run as a single operation. 'compare' orchestrates fast-reply per personality card. */
export type OperationFeature = Exclude<FeatureType, 'compare'>;

export type FeatureSurface = 'ai-dock' | 'panel-tab';
export type FeatureTimeoutBucket = 'quick' | 'deep';
export type FeatureMessageCountBucket = 'quick' | 'ping' | 'improve' | 'deep' | 'hi';
/** 'regenerate' re-runs the same prompt; 'refresh' forces regeneration (drops any cache). */
export type FeatureRerunAction = 'regenerate' | 'refresh';

export interface FeaturePolicy {
  surface: FeatureSurface;
  resultKind: ResultKind;
  promptMode: PromptMode;
  timeoutBucket: FeatureTimeoutBucket;
  messageCountBucket: FeatureMessageCountBucket;
  /** Model/reasoning selection delegation (improve-draft & hi-greeting → fast-reply). */
  modelFeature: ModelSelectableFeature;
  includesEarnings: boolean;
  /** 0 = no gate; deep features require MIN_MESSAGES_FOR_DEEP (CG-FLOW-03). */
  minMessages: number;
  rerunAction: FeatureRerunAction;
  supportsReplyMode: boolean;
  supportsReplyTone: boolean;
  requiresDraft: boolean;
  usesPingSegment: boolean;
}

export const OPERATION_FEATURES = [
  'fast-reply',
  'improve-draft',
  'help-me',
  'fan-summary',
  'chat-review',
  'ping',
  'hi-greeting',
] as const satisfies readonly OperationFeature[];

export const FEATURE_POLICIES = {
  'fast-reply': {
    surface: 'ai-dock',
    resultKind: 'reply',
    promptMode: 'reply',
    timeoutBucket: 'quick',
    messageCountBucket: 'quick',
    modelFeature: 'fast-reply',
    includesEarnings: true,
    minMessages: 0,
    rerunAction: 'regenerate',
    supportsReplyMode: true,
    supportsReplyTone: true,
    requiresDraft: false,
    usesPingSegment: false,
  },
  'improve-draft': {
    surface: 'ai-dock',
    resultKind: 'single-reply',
    promptMode: 'reply',
    timeoutBucket: 'quick',
    messageCountBucket: 'improve',
    modelFeature: 'fast-reply',
    includesEarnings: true,
    minMessages: 0,
    rerunAction: 'regenerate',
    supportsReplyMode: false,
    supportsReplyTone: false,
    requiresDraft: true,
    usesPingSegment: false,
  },
  'help-me': {
    surface: 'panel-tab',
    resultKind: 'xml',
    promptMode: 'analysis',
    timeoutBucket: 'quick',
    messageCountBucket: 'quick',
    modelFeature: 'help-me',
    includesEarnings: true,
    minMessages: 0,
    rerunAction: 'regenerate',
    supportsReplyMode: false,
    supportsReplyTone: false,
    requiresDraft: false,
    usesPingSegment: false,
  },
  'fan-summary': {
    surface: 'panel-tab',
    resultKind: 'single-reply',
    promptMode: 'analysis',
    timeoutBucket: 'deep',
    messageCountBucket: 'deep',
    modelFeature: 'fan-summary',
    includesEarnings: true,
    minMessages: MIN_MESSAGES_FOR_DEEP,
    rerunAction: 'refresh',
    supportsReplyMode: false,
    supportsReplyTone: false,
    requiresDraft: false,
    usesPingSegment: false,
  },
  'chat-review': {
    surface: 'panel-tab',
    resultKind: 'xml',
    promptMode: 'analysis',
    timeoutBucket: 'deep',
    messageCountBucket: 'deep',
    modelFeature: 'chat-review',
    includesEarnings: true,
    minMessages: MIN_MESSAGES_FOR_DEEP,
    rerunAction: 'refresh',
    supportsReplyMode: false,
    supportsReplyTone: false,
    requiresDraft: false,
    usesPingSegment: false,
  },
  'ping': {
    surface: 'ai-dock',
    resultKind: 'reply',
    promptMode: 'reply',
    timeoutBucket: 'quick',
    messageCountBucket: 'ping',
    modelFeature: 'ping',
    includesEarnings: true,
    minMessages: 0,
    rerunAction: 'regenerate',
    supportsReplyMode: false,
    supportsReplyTone: false,
    requiresDraft: false,
    usesPingSegment: true,
  },
  'hi-greeting': {
    surface: 'ai-dock',
    resultKind: 'reply',
    promptMode: 'reply',
    timeoutBucket: 'quick',
    messageCountBucket: 'hi',
    modelFeature: 'fast-reply',
    includesEarnings: false,
    minMessages: 0,
    rerunAction: 'regenerate',
    supportsReplyMode: false,
    supportsReplyTone: false,
    requiresDraft: false,
    usesPingSegment: false,
  },
} as const satisfies Record<OperationFeature, FeaturePolicy>;

export function isOperationFeature(feature: FeatureType): feature is OperationFeature {
  return feature !== 'compare';
}

export function getFeaturePolicy(feature: OperationFeature): FeaturePolicy {
  return FEATURE_POLICIES[feature];
}

export function isDeepFeature(feature: OperationFeature): boolean {
  return getFeaturePolicy(feature).messageCountBucket === 'deep';
}

export const DEEP_FEATURES: OperationFeature[] = OPERATION_FEATURES.filter(
  (feature) => FEATURE_POLICIES[feature].messageCountBucket === 'deep',
);

export const QUICK_FEATURES: OperationFeature[] = OPERATION_FEATURES.filter(
  (feature) => FEATURE_POLICIES[feature].messageCountBucket === 'quick',
);

export function resolveFeatureMessageCount(feature: OperationFeature, settings: Settings): number {
  switch (getFeaturePolicy(feature).messageCountBucket) {
    case 'deep':
      return settings.deepMessageCount;
    case 'ping':
      return settings.pingMessageCount;
    case 'improve':
      return settings.improveMessageCount;
    case 'quick':
      return settings.quickMessageCount;
    case 'hi':
      return HI_GREETING_MESSAGE_COUNT;
  }
}

export function resolveFeatureModelFeature(feature: OperationFeature): ModelSelectableFeature {
  return getFeaturePolicy(feature).modelFeature;
}
