/**
 * Escapes untrusted text (fan messages, drafts, spending data) before it is
 * interpolated into a prompt template.
 *
 * Replacement order is load-bearing: `&` must be escaped first, otherwise the
 * `&` produced by `&lt;`/`&gt;` would be double-escaped.
 */
export function escapeForPrompt(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
