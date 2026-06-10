// Platform-pure (no DOM) tolerant OF-HTML → plain-text conversion for transcript lines.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(match: string, body: string): string {
  if (body.startsWith('#')) {
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
      return match;
    }
    return String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[body] ?? match;
}

/** Single pass so '&amp;lt;' decodes once to '&lt;', never to '<'. Unknown entities kept verbatim. */
function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, decodeEntity);
}

/**
 * `<br>` → newline, `</p>` boundaries → newline, every other tag stripped,
 * entities decoded last (so '&lt;b&gt;' stays literal text), NBSP normalized
 * to a plain space, result trimmed.
 */
export function htmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p\s*>/gi, '\n');
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  text = decodeEntities(text);
  text = text.replace(/\u00a0/g, ' ');
  text = text.replace(/[ \t]+\n/g, '\n');
  return text.trim();
}
