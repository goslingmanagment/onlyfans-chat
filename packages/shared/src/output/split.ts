// Splitting runs only after a stream completes — never on partial text (SPEC §8).

function splitOnMarker(text: string, marker: string): string[] {
  const parts: string[] = [];
  for (const piece of text.split(marker)) {
    const trimmed = piece.trim();
    if (trimmed.length > 0) {
      parts.push(trimmed);
    }
  }
  return parts;
}

/** Splits AI output into sequential message parts. Marker is case-sensitive; empty parts are discarded. */
export function splitByNext(text: string): string[] {
  return splitOnMarker(text, '[NEXT]');
}

/** Splits AI output into alternative standalone variants (greeting options). */
export function splitByVariant(text: string): string[] {
  return splitOnMarker(text, '[VARIANT]');
}
