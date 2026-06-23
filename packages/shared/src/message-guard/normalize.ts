import type { MappedChar, MappedText } from './types';

const ZERO_WIDTH_SINGLE = new Set([
  0x00ad,
  0x034f,
  0x061c,
  0x115f,
  0x1160,
  0x17b4,
  0x17b5,
  0x180e,
  0xfeff,
]);

const HOMOGLYPHS: Readonly<Record<string, string>> = {
  а: 'a',
  А: 'a',
  е: 'e',
  Е: 'e',
  о: 'o',
  О: 'o',
  р: 'p',
  Р: 'p',
  с: 'c',
  С: 'c',
  х: 'x',
  Х: 'x',
  у: 'y',
  У: 'y',
  к: 'k',
  К: 'k',
  м: 'm',
  М: 'm',
  т: 't',
  Т: 't',
  і: 'i',
  І: 'i',
  ј: 'j',
  Ј: 'j',
  ѕ: 's',
  Ѕ: 's',
  α: 'a',
  Α: 'a',
  ε: 'e',
  Ε: 'e',
  ο: 'o',
  Ο: 'o',
  ρ: 'p',
  Ρ: 'p',
  τ: 't',
  Τ: 't',
  χ: 'x',
  Χ: 'x',
  ν: 'v',
  Ν: 'n',
};

const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
};

function isAsciiLetter(ch: string): boolean {
  return /^[a-z]$/u.test(ch);
}

function isAsciiDigit(ch: string): boolean {
  return /^[0-9]$/u.test(ch);
}

export function isAsciiAlnum(ch: string): boolean {
  return isAsciiLetter(ch) || isAsciiDigit(ch);
}

function isZeroWidth(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    ZERO_WIDTH_SINGLE.has(cp) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  );
}

function foldBasic(ch: string): string {
  const normalized = ch.normalize('NFKC');
  let out = '';
  for (const raw of normalized) {
    if (isZeroWidth(raw)) continue;
    const folded = HOMOGLYPHS[raw] ?? raw;
    out += folded.toLowerCase();
  }
  return out;
}

function previousSemantic(raw: string, start: number): string | null {
  for (let i = start - 1; i >= 0; i -= 1) {
    const ch = raw[i];
    if (ch === undefined) break;
    const folded = foldBasic(ch);
    if (folded.length === 0) continue;
    if (folded.length === 1 && !isAsciiAlnum(folded)) continue;
    return folded[0] ?? null;
  }
  return null;
}

function nextSemantic(raw: string, end: number): string | null {
  for (let i = end; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === undefined) break;
    const folded = foldBasic(ch);
    if (folded.length === 0) continue;
    if (folded.length === 1 && !isAsciiAlnum(folded)) continue;
    return folded[0] ?? null;
  }
  return null;
}

function immediateLetter(raw: string, index: number): boolean {
  const ch = raw[index];
  if (ch === undefined) return false;
  const folded = foldBasic(ch);
  return folded.length === 1 && isAsciiLetter(folded);
}

function shouldLeetFold(raw: string, start: number, end: number, ch: string): boolean {
  if (isAsciiDigit(ch)) {
    return immediateLetter(raw, start - 1) && immediateLetter(raw, end);
  }
  const prev = previousSemantic(raw, start);
  const next = nextSemantic(raw, end);
  return prev !== null && next !== null && isAsciiLetter(prev) && isAsciiLetter(next);
}

function collapseRepeats(units: MappedChar[]): MappedChar[] {
  const out: MappedChar[] = [];
  let i = 0;
  while (i < units.length) {
    const first = units[i];
    if (first === undefined) break;
    let j = i + 1;
    while (j < units.length && units[j]?.ch === first.ch) j += 1;
    if (j - i >= 3) {
      const last = units[j - 1] ?? first;
      out.push({ ch: first.ch, srcStart: first.srcStart, srcEnd: last.srcEnd });
    } else {
      out.push(...units.slice(i, j));
    }
    i = j;
  }
  return out;
}

export function normalizeWithMap(raw: string, aggressive = false): MappedText {
  const units: MappedChar[] = [];
  for (let index = 0; index < raw.length;) {
    const char = raw[index] ?? '';
    const codePoint = raw.codePointAt(index);
    const width = codePoint === undefined || codePoint <= 0xffff ? 1 : 2;
    const srcStart = index;
    const srcEnd = index + width;
    index = srcEnd;

    const basic = foldBasic(char);
    for (const foldedRaw of basic) {
      if (foldedRaw.length === 0) continue;
      let folded = foldedRaw;
      const leet = LEET[folded];
      if (aggressive && leet !== undefined && shouldLeetFold(raw, srcStart, srcEnd, folded)) {
        folded = leet;
      }
      if (aggressive && !isAsciiAlnum(folded)) {
        continue;
      }
      units.push({ ch: folded, srcStart, srcEnd });
    }
  }
  const finalUnits = aggressive ? collapseRepeats(units) : units;
  return { text: finalUnits.map((unit) => unit.ch).join(''), units: finalUnits };
}

export function normalizeForGuard(raw: string): { canonical: MappedText; skeleton: MappedText } {
  return {
    canonical: normalizeWithMap(raw, false),
    skeleton: normalizeWithMap(raw, true),
  };
}
