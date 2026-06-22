import { describe, expect, it } from 'vitest';
import {
  INSERT_SEQUENCE_JOINER,
  appendToDraft,
  insertPayload,
  resolveDockPartAction,
} from '../../src/renderer/src/features/ai/dockLogic';
import { splitDraftParts } from '../../src/renderer/src/features/conversation/sendLogic';

describe('insertPayload (⌘0 insert-all / bubble click)', () => {
  const parts = ['first part', 'second part', 'third part'];

  it('partIndex N inserts part N (1-based)', () => {
    expect(insertPayload(parts, 1)).toBe('first part');
    expect(insertPayload(parts, 3)).toBe('third part');
  });

  it('partIndex 0 joins all parts as a [NEXT] sequence', () => {
    expect(insertPayload(parts, 0)).toBe(
      `first part${INSERT_SEQUENCE_JOINER}second part${INSERT_SEQUENCE_JOINER}third part`,
    );
  });

  it('⌘0 round-trips: the inserted draft splits back into the same parts', () => {
    const inserted = insertPayload(parts, 0);
    expect(inserted).not.toBeNull();
    expect(splitDraftParts(inserted ?? '')).toEqual(parts);
  });

  it('out-of-range and empty inputs insert nothing', () => {
    expect(insertPayload(parts, 4)).toBeNull();
    expect(insertPayload(parts, -1)).toBeNull();
    expect(insertPayload([], 0)).toBeNull();
    expect(insertPayload([], 1)).toBeNull();
  });
});

describe('appendToDraft (insert lands below what the chatter typed)', () => {
  it('replaces a blank draft', () => {
    expect(appendToDraft('', 'new text')).toBe('new text');
    expect(appendToDraft('   \n ', 'new text')).toBe('new text');
  });

  it('appends with a newline to an existing draft', () => {
    expect(appendToDraft('typed so far', 'new text')).toBe('typed so far\nnew text');
  });

  it('a [NEXT] insert into an existing draft still splits cleanly', () => {
    const draft = appendToDraft('intro', `a${INSERT_SEQUENCE_JOINER}b`);
    expect(splitDraftParts(draft)).toEqual(['intro\na', 'b']);
  });
});

describe('resolveDockPartAction (insert→feedback wiring + SPEC §7.0 degrade)', () => {
  const parts = ['a', 'b'];

  it('canSend → insert with the inserted feedback action', () => {
    expect(resolveDockPartAction(parts, 1, true)).toEqual({
      mode: 'insert',
      payload: 'a',
      feedback: 'inserted',
    });
    expect(resolveDockPartAction(parts, 0, true)).toEqual({
      mode: 'insert',
      payload: `a${INSERT_SEQUENCE_JOINER}b`,
      feedback: 'inserted',
    });
  });

  it('canSend=false degrades to copy with the copied feedback action', () => {
    expect(resolveDockPartAction(parts, 2, false)).toEqual({
      mode: 'copy',
      payload: 'b',
      feedback: 'copied',
    });
    // ⌘0 degrade keeps the companion copy join (blank lines, no [NEXT])
    expect(resolveDockPartAction(parts, 0, false)).toEqual({
      mode: 'copy',
      payload: 'a\n\nb',
      feedback: 'copied',
    });
  });

  it('null when there is nothing at that index', () => {
    expect(resolveDockPartAction(parts, 3, true)).toBeNull();
    expect(resolveDockPartAction([], 0, true)).toBeNull();
    expect(resolveDockPartAction([], 1, false)).toBeNull();
  });
});
