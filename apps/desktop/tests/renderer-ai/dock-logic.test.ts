import { describe, expect, it } from 'vitest';
import {
  copyChipLabel,
  copyPayload,
  copyablePartsOf,
  cycleTone,
  deriveDockView,
  errorHint,
  evaluateAiGate,
  extractPromptBlocks,
  isFrameForOperation,
  toggleTone,
} from '../../src/renderer/src/features/ai/dockLogic';

describe('cycleTone (⌘T)', () => {
  it('cycles none → casual → flirty → upsell → spicy → none', () => {
    expect(cycleTone('none')).toBe('casual');
    expect(cycleTone('casual')).toBe('flirty');
    expect(cycleTone('flirty')).toBe('upsell');
    expect(cycleTone('upsell')).toBe('spicy');
    // deselect closes the loop
    expect(cycleTone('spicy')).toBe('none');
  });

  it('full loop returns to the start', () => {
    let tone: ReturnType<typeof cycleTone> = 'casual';
    for (let i = 0; i < 5; i++) tone = cycleTone(tone);
    expect(tone).toBe('casual');
  });
});

describe('toggleTone (pill click)', () => {
  it('clicking the active tone deselects to none', () => {
    expect(toggleTone('casual', 'casual')).toBe('none');
  });

  it('clicking another tone selects it', () => {
    expect(toggleTone('casual', 'upsell')).toBe('upsell');
    expect(toggleTone('none', 'flirty')).toBe('flirty');
  });
});

describe('copyPayload (⌘0..⌘9 / bubble click)', () => {
  const parts = ['first part', 'second part', 'third part'];

  it('partIndex N copies part N (1-based)', () => {
    expect(copyPayload(parts, 1)).toBe('first part');
    expect(copyPayload(parts, 3)).toBe('third part');
  });

  it('partIndex 0 copies all parts blank-line separated', () => {
    expect(copyPayload(parts, 0)).toBe('first part\n\nsecond part\n\nthird part');
  });

  it('out-of-range and empty inputs copy nothing', () => {
    expect(copyPayload(parts, 4)).toBeNull();
    expect(copyPayload(parts, 9)).toBeNull();
    expect(copyPayload(parts, -1)).toBeNull();
    expect(copyPayload([], 0)).toBeNull();
    expect(copyPayload([], 1)).toBeNull();
  });

  it('chip labels number parts 1..9, beyond that no hotkey', () => {
    expect(copyChipLabel(1)).toBe('COPY ⌘1');
    expect(copyChipLabel(9)).toBe('COPY ⌘9');
    expect(copyChipLabel(10)).toBe('COPY');
  });
});

describe('isFrameForOperation (correlation)', () => {
  it('accepts only frames for the active operation', () => {
    expect(isFrameForOperation('op-1', { operationId: 'op-1' })).toBe(true);
    expect(isFrameForOperation('op-1', { operationId: 'op-2' })).toBe(false);
  });

  it('rejects everything when no operation is active', () => {
    expect(isFrameForOperation(null, { operationId: 'op-1' })).toBe(false);
  });
});

describe('deriveDockView', () => {
  it('fast-reply: provided parts become numbered drafts', () => {
    const view = deriveDockView('fast-reply', {
      rawText: 'a[NEXT]b',
      parts: ['a', 'b'],
    });
    expect(view).toEqual({ kind: 'drafts', parts: ['a', 'b'] });
  });

  it('fast-reply: missing parts fall back to [NEXT] splitting of rawText', () => {
    const view = deriveDockView('fast-reply', { rawText: 'hello there[NEXT]second message' });
    expect(view).toEqual({ kind: 'drafts', parts: ['hello there', 'second message'] });
  });

  it('fast-reply: unusable output falls back to raw (no copy affordance)', () => {
    // pure meta-leak — the sanitizer leaves no insertable part
    const view = deriveDockView('fast-reply', { rawText: 'the prompt says reply warmly' });
    expect(view.kind).toBe('raw');
    expect(copyablePartsOf(view)).toEqual([]);
  });

  it('improve-draft: single sanitized part', () => {
    const view = deriveDockView('improve-draft', { rawText: '"polished message"' });
    expect(view).toEqual({ kind: 'drafts', parts: ['polished message'] });
  });

  it('hi-greeting: splits by [VARIANT]', () => {
    const view = deriveDockView('hi-greeting', { rawText: 'hey![VARIANT]hi there[VARIANT]hello you' });
    expect(view).toEqual({ kind: 'drafts', parts: ['hey!', 'hi there', 'hello you'] });
  });

  it('help-me: valid xml → coaching card + engaging/flirty drafts', () => {
    const raw =
      '<coaching>do not push the sale</coaching>\n<engaging>ask about his week</engaging>\n<flirty>tease about friday</flirty>';
    const view = deriveDockView('help-me', { rawText: raw });
    expect(view).toEqual({
      kind: 'help',
      coaching: 'do not push the sale',
      parts: ['ask about his week', 'tease about friday'],
    });
  });

  it('help-me: failed xml parse → raw fallback (rendering decision)', () => {
    const view = deriveDockView('help-me', { rawText: 'plain coaching text without tags' });
    expect(view).toEqual({ kind: 'raw', text: 'plain coaching text without tags' });
  });

  it('help-me: partial tags also fall back to raw', () => {
    const view = deriveDockView('help-me', { rawText: '<coaching>only coaching</coaching>' });
    expect(view.kind).toBe('raw');
  });

  it('copyablePartsOf: raw views are never copyable', () => {
    expect(copyablePartsOf({ kind: 'raw', text: 'x' })).toEqual([]);
    expect(copyablePartsOf(null)).toEqual([]);
    expect(copyablePartsOf({ kind: 'drafts', parts: ['a'] })).toEqual(['a']);
  });
});

describe('errorHint', () => {
  it('prefers the protocol description', () => {
    expect(
      errorHint({ key: 'k', code: 'CG-API-03', message: 'm', description: 'wait and retry' }),
    ).toBe('wait and retry');
  });

  it('falls back to a recovery field when present', () => {
    expect(errorHint({ key: 'k', code: 'CG-AUTH-01', message: 'm', recovery: 'add a key' })).toBe(
      'add a key',
    );
  });

  it('null when no hint exists', () => {
    expect(errorHint({ key: 'k', code: 'CG-APP-01', message: 'm' })).toBeNull();
  });
});

describe('evaluateAiGate', () => {
  it('unmapped account blocks the whole row first', () => {
    expect(evaluateAiGate({ mapped: false, hasLlmKey: false })).toEqual({
      ok: false,
      reason: 'unmapped',
      message: 'Map a personality in Settings',
    });
  });

  it('missing LLM key blocks with the key message', () => {
    expect(evaluateAiGate({ mapped: true, hasLlmKey: false })).toEqual({
      ok: false,
      reason: 'no-key',
      message: 'Add an Anthropic or OpenRouter key in Settings',
    });
  });

  it('mapped + key → ok', () => {
    expect(evaluateAiGate({ mapped: true, hasLlmKey: true })).toEqual({ ok: true });
  });
});

describe('extractPromptBlocks (debug inspector)', () => {
  it('flattens system + user blocks with cache flags in order', () => {
    const blocks = extractPromptBlocks({
      systemBlocks: [{ text: 'preamble', cache: 'none' }],
      userBlocks: [
        { text: 'transcript', cache: '1h' },
        { text: 'task', cache: 'none' },
      ],
    });
    expect(blocks).toEqual([
      { role: 'system', text: 'preamble', cache: 'none' },
      { role: 'user', text: 'transcript', cache: '1h' },
      { role: 'user', text: 'task', cache: 'none' },
    ]);
  });

  it('unknown snapshot shapes return null (raw JSON fallback)', () => {
    expect(extractPromptBlocks({ something: 'else' })).toBeNull();
    expect(extractPromptBlocks('not an object')).toBeNull();
    expect(extractPromptBlocks({ systemBlocks: [{ text: 1, cache: 'none' }] })).toBeNull();
  });
});
