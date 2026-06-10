import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from '../src/transcript/html';

// New for OFAPI: legacy Fansly content was plain text; OF `text` is HTML.

describe('htmlToPlainText', () => {
  it('passes plain text through unchanged', () => {
    expect(htmlToPlainText('hello there')).toBe('hello there');
  });

  it('unwraps a single <p> paragraph', () => {
    expect(htmlToPlainText('<p>mmh definitely feet </p>')).toBe('mmh definitely feet');
  });

  it('joins multiple <p> paragraphs with newlines (probe-observed shape)', () => {
    expect(htmlToPlainText('<p>first para</p><p>second para</p>')).toBe('first para\nsecond para');
  });

  it('converts <br>, <br/>, <br /> and <BR> to newlines', () => {
    expect(htmlToPlainText('a<br>b<br/>c<br />d<BR>e')).toBe('a\nb\nc\nd\ne');
  });

  it('strips styling spans and unknown tags but keeps their text', () => {
    expect(htmlToPlainText('<p><span style="color:red">hot</span> <strong>stuff</strong></p>')).toBe(
      'hot stuff',
    );
  });

  it('decodes named entities', () => {
    expect(htmlToPlainText('Tom &amp; Jerry &lt;3 &quot;forever&quot; &apos;ok&apos;')).toBe(
      'Tom & Jerry <3 "forever" \'ok\'',
    );
  });

  it('decodes numeric decimal and hex entities including astral codepoints', () => {
    expect(htmlToPlainText('&#39;hi&#x27; &#128525;')).toBe("'hi' \u{1F60D}");
  });

  it('decodes entities only once — &amp;lt; stays the literal text "&lt;"', () => {
    expect(htmlToPlainText('a &amp;lt; b')).toBe('a &lt; b');
  });

  it('decodes entities after tag stripping so encoded markup stays literal', () => {
    expect(htmlToPlainText('<p>&lt;b&gt;not bold&lt;/b&gt;</p>')).toBe('<b>not bold</b>');
  });

  it('keeps unknown and malformed entities verbatim', () => {
    expect(htmlToPlainText('caf&eacute; &#xZZ; AT&T')).toBe('caf&eacute; &#xZZ; AT&T');
  });

  it('keeps out-of-range numeric entities verbatim', () => {
    expect(htmlToPlainText('&#1114112;')).toBe('&#1114112;');
  });

  it('normalizes &nbsp; and raw NBSP to plain spaces', () => {
    expect(htmlToPlainText('a&nbsp;b c')).toBe('a b c');
  });

  it('tolerates unclosed/stray tags without throwing', () => {
    expect(htmlToPlainText('<p>open <em>forever')).toBe('open forever');
  });

  it('strips HTML comments', () => {
    expect(htmlToPlainText('<p>real<!-- hidden --> text</p>')).toBe('real text');
  });

  it('drops trailing whitespace before paragraph breaks and trims the result', () => {
    expect(htmlToPlainText('<p>a </p><p> b</p>')).toBe('a\n b');
  });

  it('returns empty string for markup-only content', () => {
    expect(htmlToPlainText('<p></p>')).toBe('');
  });
});
