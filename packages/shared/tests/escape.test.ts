import { describe, expect, it } from 'vitest';
import { escapeForPrompt } from '../src/prompts/escape';

describe('escapeForPrompt', () => {
  it('escapes & to &amp;', () => {
    expect(escapeForPrompt('&')).toBe('&amp;');
  });

  it('escapes < to &lt;', () => {
    expect(escapeForPrompt('<')).toBe('&lt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeForPrompt('>')).toBe('&gt;');
  });

  it('escapes a combined string with all three characters', () => {
    expect(escapeForPrompt('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('ORDER-CRITICAL: escapes & before < so &lt; in input becomes &amp;lt;', () => {
    expect(escapeForPrompt('&lt;')).toBe('&amp;lt;');
  });

  it('prevents double-escaping: &amp; in input becomes &amp;amp;', () => {
    expect(escapeForPrompt('&amp;')).toBe('&amp;amp;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeForPrompt('')).toBe('');
  });

  it('returns unchanged string when no special chars', () => {
    expect(escapeForPrompt('hello world 123')).toBe('hello world 123');
  });

  it('escapes <script>alert("xss")</script> properly', () => {
    expect(escapeForPrompt('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
    );
  });

  it('handles a realistic fan message with all three characters', () => {
    const input = 'hey babe <3 how r u? tips & tricks > everything';
    expect(escapeForPrompt(input)).toBe(
      'hey babe &lt;3 how r u? tips &amp; tricks &gt; everything',
    );
  });

  it('handles multiple & and < and > in sequence', () => {
    expect(escapeForPrompt('&&&')).toBe('&amp;&amp;&amp;');
    expect(escapeForPrompt('<<<')).toBe('&lt;&lt;&lt;');
    expect(escapeForPrompt('>>>')).toBe('&gt;&gt;&gt;');
  });

  it('handles mixed sequences of special chars', () => {
    expect(escapeForPrompt('<>&')).toBe('&lt;&gt;&amp;');
  });
});
