import { describe, expect, it } from 'vitest';
import { splitByNext, splitByVariant } from '../src/output/split';

describe('splitByNext', () => {
  it('returns a single-element array when no [NEXT] is present', () => {
    expect(splitByNext('hello world')).toEqual(['hello world']);
  });

  it('splits into two parts on [NEXT]', () => {
    expect(splitByNext('hello[NEXT]world')).toEqual(['hello', 'world']);
  });

  it('splits into three parts on multiple [NEXT]', () => {
    expect(splitByNext('a[NEXT]b[NEXT]c')).toEqual(['a', 'b', 'c']);
  });

  it('discards the empty first part when [NEXT] is at the start', () => {
    expect(splitByNext('[NEXT]hello')).toEqual(['hello']);
  });

  it('discards the empty last part when [NEXT] is at the end', () => {
    expect(splitByNext('hello[NEXT]')).toEqual(['hello']);
  });

  it('trims whitespace around [NEXT] delimiters', () => {
    expect(splitByNext('hello  [NEXT]  world')).toEqual(['hello', 'world']);
  });

  it('discards empty parts when several [NEXT] markers appear in a row', () => {
    expect(splitByNext('a[NEXT][NEXT][NEXT]b')).toEqual(['a', 'b']);
  });

  it('returns an empty array when the input is just [NEXT]', () => {
    expect(splitByNext('[NEXT]')).toEqual([]);
  });

  it('trims a marker-free input', () => {
    expect(splitByNext('  hello world  ')).toEqual(['hello world']);
  });

  it('is case sensitive: [next] is NOT a separator', () => {
    expect(splitByNext('hello[next]world')).toEqual(['hello[next]world']);
  });

  it('handles [NEXT] surrounded by newlines', () => {
    expect(splitByNext('line one\n[NEXT]\nline two')).toEqual(['line one', 'line two']);
  });

  it('does not split on [VARIANT]', () => {
    expect(splitByNext('a[VARIANT]b')).toEqual(['a[VARIANT]b']);
  });
});

describe('splitByVariant', () => {
  it('returns a single-element array when no [VARIANT] is present', () => {
    expect(splitByVariant('hey you')).toEqual(['hey you']);
  });

  it('splits on [VARIANT] and trims each option', () => {
    expect(splitByVariant('hey there \n[VARIANT]\n hi cutie')).toEqual(['hey there', 'hi cutie']);
  });

  it('discards empty parts at the edges and between consecutive markers', () => {
    expect(splitByVariant('[VARIANT]a[VARIANT][VARIANT]b[VARIANT]')).toEqual(['a', 'b']);
  });

  it('returns an empty array when the input is just [VARIANT]', () => {
    expect(splitByVariant('[VARIANT]')).toEqual([]);
  });

  it('is case sensitive: [variant] is NOT a separator', () => {
    expect(splitByVariant('a[variant]b')).toEqual(['a[variant]b']);
  });

  it('does not split on [NEXT]', () => {
    expect(splitByVariant('a[NEXT]b')).toEqual(['a[NEXT]b']);
  });
});
