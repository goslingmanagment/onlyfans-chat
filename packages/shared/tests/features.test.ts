import { describe, expect, it } from 'vitest';
import {
  DEEP_FEATURES,
  FEATURE_POLICIES,
  OPERATION_FEATURES,
  QUICK_FEATURES,
  getFeaturePolicy,
  isDeepFeature,
  isOperationFeature,
  resolveFeatureMessageCount,
  resolveFeatureModelFeature,
} from '../src/features';
import { DEFAULT_SETTINGS, MIN_MESSAGES_FOR_DEEP } from '../src/constants';
import type { Settings } from '../src/constants';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  quickMessageCount: 111,
  pingMessageCount: 122,
  improveMessageCount: 33,
  deepMessageCount: 2444,
};

describe('feature policy registry', () => {
  it('covers exactly the seven operation features', () => {
    expect(Object.keys(FEATURE_POLICIES)).toEqual([...OPERATION_FEATURES]);
    expect(OPERATION_FEATURES).toEqual([
      'fast-reply',
      'improve-draft',
      'help-me',
      'fan-summary',
      'chat-review',
      'ping',
      'hi-greeting',
    ]);
  });

  it('compare is not an operation feature (orchestrates fast-reply per card)', () => {
    expect(isOperationFeature('compare')).toBe(false);
    expect(isOperationFeature('fast-reply')).toBe(true);
    expect(isOperationFeature('hi-greeting')).toBe(true);
  });

  it('matches the legacy policy table (surfaces renamed for desktop)', () => {
    expect(getFeaturePolicy('fast-reply')).toEqual({
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
    });

    expect(getFeaturePolicy('improve-draft')).toEqual({
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
    });

    expect(getFeaturePolicy('help-me')).toEqual({
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
    });

    expect(getFeaturePolicy('fan-summary')).toEqual({
      surface: 'panel-tab',
      resultKind: 'single-reply',
      promptMode: 'analysis',
      timeoutBucket: 'deep',
      messageCountBucket: 'deep',
      modelFeature: 'fan-summary',
      includesEarnings: true,
      minMessages: 30,
      rerunAction: 'refresh',
      supportsReplyMode: false,
      supportsReplyTone: false,
      requiresDraft: false,
      usesPingSegment: false,
    });

    expect(getFeaturePolicy('chat-review')).toEqual({
      surface: 'panel-tab',
      resultKind: 'xml',
      promptMode: 'analysis',
      timeoutBucket: 'deep',
      messageCountBucket: 'deep',
      modelFeature: 'chat-review',
      includesEarnings: true,
      minMessages: 30,
      rerunAction: 'refresh',
      supportsReplyMode: false,
      supportsReplyTone: false,
      requiresDraft: false,
      usesPingSegment: false,
    });

    expect(getFeaturePolicy('ping')).toEqual({
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
    });

    expect(getFeaturePolicy('hi-greeting')).toEqual({
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
    });
  });

  it('only fast-reply has tone and split-mode controls', () => {
    for (const feature of OPERATION_FEATURES) {
      const policy = getFeaturePolicy(feature);
      expect(policy.supportsReplyTone).toBe(feature === 'fast-reply');
      expect(policy.supportsReplyMode).toBe(feature === 'fast-reply');
    }
  });

  it('only improve-draft requires a draft; only ping uses segment analysis', () => {
    for (const feature of OPERATION_FEATURES) {
      const policy = getFeaturePolicy(feature);
      expect(policy.requiresDraft).toBe(feature === 'improve-draft');
      expect(policy.usesPingSegment).toBe(feature === 'ping');
    }
  });

  it('hi-greeting is the only feature without earnings context', () => {
    for (const feature of OPERATION_FEATURES) {
      expect(getFeaturePolicy(feature).includesEarnings).toBe(feature !== 'hi-greeting');
    }
  });

  it('improve-draft and hi-greeting delegate model selection to fast-reply', () => {
    expect(resolveFeatureModelFeature('improve-draft')).toBe('fast-reply');
    expect(resolveFeatureModelFeature('hi-greeting')).toBe('fast-reply');
    expect(resolveFeatureModelFeature('fast-reply')).toBe('fast-reply');
    expect(resolveFeatureModelFeature('help-me')).toBe('help-me');
    expect(resolveFeatureModelFeature('fan-summary')).toBe('fan-summary');
    expect(resolveFeatureModelFeature('chat-review')).toBe('chat-review');
    expect(resolveFeatureModelFeature('ping')).toBe('ping');
  });

  it('deep features gate on MIN_MESSAGES_FOR_DEEP and use deep timeouts', () => {
    for (const feature of OPERATION_FEATURES) {
      const policy = getFeaturePolicy(feature);
      const deep = isDeepFeature(feature);
      expect(policy.minMessages).toBe(deep ? MIN_MESSAGES_FOR_DEEP : 0);
      expect(policy.timeoutBucket).toBe(deep ? 'deep' : 'quick');
    }
  });

  it('categorizes deep vs quick by message-count bucket (legacy derivation)', () => {
    expect(DEEP_FEATURES).toEqual(['fan-summary', 'chat-review']);
    expect(QUICK_FEATURES).toEqual(['fast-reply', 'help-me']);
    expect(isDeepFeature('fan-summary')).toBe(true);
    expect(isDeepFeature('chat-review')).toBe(true);
    expect(isDeepFeature('fast-reply')).toBe(false);
    expect(isDeepFeature('ping')).toBe(false);
  });
});

describe('resolveFeatureMessageCount', () => {
  it('routes each bucket to its settings key', () => {
    expect(resolveFeatureMessageCount('fast-reply', SETTINGS)).toBe(111);
    expect(resolveFeatureMessageCount('help-me', SETTINGS)).toBe(111);
    expect(resolveFeatureMessageCount('ping', SETTINGS)).toBe(122);
    expect(resolveFeatureMessageCount('improve-draft', SETTINGS)).toBe(33);
    expect(resolveFeatureMessageCount('fan-summary', SETTINGS)).toBe(2444);
    expect(resolveFeatureMessageCount('chat-review', SETTINGS)).toBe(2444);
  });

  it('hi-greeting is fixed at 25 regardless of settings', () => {
    expect(resolveFeatureMessageCount('hi-greeting', SETTINGS)).toBe(25);
    expect(resolveFeatureMessageCount('hi-greeting', DEFAULT_SETTINGS)).toBe(25);
  });
});
