// Core cross-module enums and small shared types. Modules own their domain types;
// this file holds only what several modules must agree on.

/** All AI features. `compare` runs fast-reply across personality cards. */
export type FeatureType =
  | 'fast-reply'
  | 'improve-draft'
  | 'help-me'
  | 'fan-summary'
  | 'chat-review'
  | 'ping'
  | 'hi-greeting'
  | 'compare';

/** Features with their own model selection; improve-draft & hi-greeting delegate to fast-reply. */
export type ModelSelectableFeature = 'fast-reply' | 'help-me' | 'fan-summary' | 'chat-review' | 'ping';

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

/** Fast Reply tone override. Stored default is 'casual' (owner 2026-06-10); 'none' = personality only. */
export type ReplyTone = 'none' | 'casual' | 'flirty' | 'upsell' | 'spicy';

export type ReplyMode = 'default' | 'preferSplit';

/** Safety-preamble selector: in-character reply features vs analysis/coaching features. */
export type PromptMode = 'reply' | 'analysis';

/** Shape of a feature's output: multi-part reply, single message, or XML document. */
export type ResultKind = 'reply' | 'single-reply' | 'xml';

export type PingSegment = 'segment-a' | 'segment-b' | 'active';

/** PPV purchase state as rendered in transcript labels. */
export type PpvState = 'purchased' | 'not purchased' | 'unknown';

export interface Personality {
  id: string;
  name: string;
  content: string;
  /** Unix ms; used for summary-cache staleness detection. */
  updatedAt: number;
  builtin?: boolean;
  builtinVersion?: number;
}
