import { describe, expect, it } from 'vitest';
import { parseChatReviewXml, parseHelpMeXml } from '../src/output/xml';

describe('parseHelpMeXml', () => {
  it('parses valid XML with all three tags', () => {
    const raw =
      '<coaching>Be warm</coaching><engaging>Hey!</engaging><flirty>You look great</flirty>';
    const result = parseHelpMeXml(raw);
    expect(result.valid).toBe(true);
    expect(result.coaching).toBe('Be warm');
    expect(result.engaging).toBe('Hey!');
    expect(result.flirty).toBe('You look great');
  });

  it('trims whitespace from tag content; empty-after-trim tag makes the parse invalid', () => {
    const raw = '<coaching>  spaces  </coaching><engaging> tabs </engaging><flirty>  </flirty>';
    const result = parseHelpMeXml(raw);
    expect(result.coaching).toBe('spaces');
    expect(result.engaging).toBe('tabs');
    expect(result.flirty).toBe('');
    expect(result.valid).toBe(false);
  });

  it('returns valid=false when coaching is missing', () => {
    const result = parseHelpMeXml('<engaging>Hey</engaging><flirty>Hi</flirty>');
    expect(result.valid).toBe(false);
    expect(result.coaching).toBeNull();
    expect(result.engaging).toBe('Hey');
  });

  it('returns valid=false when engaging is missing', () => {
    expect(parseHelpMeXml('<coaching>Advice</coaching><flirty>Wink</flirty>').valid).toBe(false);
  });

  it('returns valid=false when flirty is missing', () => {
    expect(parseHelpMeXml('<coaching>Advice</coaching><engaging>Hello</engaging>').valid).toBe(
      false,
    );
  });

  it('returns all null for completely unstructured text', () => {
    const result = parseHelpMeXml('just plain text');
    expect(result.valid).toBe(false);
    expect(result.coaching).toBeNull();
    expect(result.engaging).toBeNull();
    expect(result.flirty).toBeNull();
    expect(result.raw).toBe('just plain text');
  });

  it('preserves raw text on all results', () => {
    const raw = '<coaching>A</coaching><engaging>B</engaging><flirty>C</flirty>';
    expect(parseHelpMeXml(raw).raw).toBe(raw);
  });

  it('handles multiline content in tags', () => {
    const raw = '<coaching>Line 1\nLine 2</coaching><engaging>E</engaging><flirty>F</flirty>';
    const result = parseHelpMeXml(raw);
    expect(result.valid).toBe(true);
    expect(result.coaching).toBe('Line 1\nLine 2');
  });

  it('is case-insensitive for tag names', () => {
    const raw = '<COACHING>A</COACHING><Engaging>B</Engaging><FLIRTY>C</FLIRTY>';
    const result = parseHelpMeXml(raw);
    expect(result.valid).toBe(true);
    expect(result.coaching).toBe('A');
  });
});

describe('parseChatReviewXml', () => {
  const wrap = (rating: string): string =>
    `<rating>${rating}</rating><evaluation>E</evaluation><recommendations>R</recommendations>`;

  it('parses a valid review with all fields', () => {
    const raw =
      '<rating>8</rating><evaluation>Great</evaluation><recommendations>Keep it up</recommendations>';
    const result = parseChatReviewXml(raw);
    expect(result.valid).toBe(true);
    expect(result.rating).toBe(8);
    expect(result.evaluation).toBe('Great');
    expect(result.recommendations).toBe('Keep it up');
  });

  it('returns valid=false for rating 0 (out of range)', () => {
    expect(parseChatReviewXml(wrap('0')).valid).toBe(false);
  });

  it('returns valid=false for rating 11 (out of range)', () => {
    expect(parseChatReviewXml(wrap('11')).valid).toBe(false);
  });

  it('returns valid=false and a null rating for non-integer rating', () => {
    expect(parseChatReviewXml(wrap('7.5')).valid).toBe(false);
    expect(parseChatReviewXml(wrap('7.5')).rating).toBeNull();
  });

  it('rejects non-bare-integer rating forms', () => {
    expect(parseChatReviewXml(wrap('-3')).rating).toBeNull();
    expect(parseChatReviewXml(wrap('8/10')).rating).toBeNull();
    expect(parseChatReviewXml(wrap('eight')).rating).toBeNull();
  });

  it('accepts rating of 1 (minimum)', () => {
    expect(parseChatReviewXml(wrap('1')).rating).toBe(1);
    expect(parseChatReviewXml(wrap('1')).valid).toBe(true);
  });

  it('accepts rating of 10 (maximum)', () => {
    expect(parseChatReviewXml(wrap('10')).rating).toBe(10);
  });

  it('returns valid=false when evaluation is missing', () => {
    const raw = '<rating>8</rating><recommendations>R</recommendations>';
    expect(parseChatReviewXml(raw).valid).toBe(false);
  });

  it('returns valid=false when recommendations is missing', () => {
    const raw = '<rating>8</rating><evaluation>E</evaluation>';
    expect(parseChatReviewXml(raw).valid).toBe(false);
  });

  it('preserves raw text on invalid input', () => {
    const result = parseChatReviewXml('unstructured garbage');
    expect(result.valid).toBe(false);
    expect(result.raw).toBe('unstructured garbage');
    expect(result.rating).toBeNull();
  });
});
