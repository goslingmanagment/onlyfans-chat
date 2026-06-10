// Lenient tag extraction for the two XML-shaped features. `valid: false` means the
// caller must fall back to showing `raw` instead of the structured view.

export interface HelpMeParsed {
  coaching: string | null;
  engaging: string | null;
  flirty: string | null;
  raw: string;
  valid: boolean;
}

export interface ChatReviewParsed {
  rating: number | null;
  evaluation: string | null;
  recommendations: string | null;
  raw: string;
  valid: boolean;
}

function tagContent(raw: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(raw);
  const inner = match?.[1];
  return inner === undefined ? null : inner.trim();
}

export function parseHelpMeXml(raw: string): HelpMeParsed {
  const coaching = tagContent(raw, 'coaching');
  const engaging = tagContent(raw, 'engaging');
  const flirty = tagContent(raw, 'flirty');
  return {
    coaching,
    engaging,
    flirty,
    raw,
    valid: Boolean(coaching && engaging && flirty),
  };
}

export function parseChatReviewXml(raw: string): ChatReviewParsed {
  const ratingText = tagContent(raw, 'rating');
  // Rating must be a bare integer; anything else (7.5, "8/10", negative) is a parse failure.
  const parsed = ratingText !== null && /^\d+$/.test(ratingText) ? Number(ratingText) : null;
  const rating = parsed !== null && parsed >= 1 && parsed <= 10 ? parsed : null;
  const evaluation = tagContent(raw, 'evaluation');
  const recommendations = tagContent(raw, 'recommendations');
  return {
    rating,
    evaluation,
    recommendations,
    raw,
    valid: Boolean(rating && evaluation && recommendations),
  };
}
