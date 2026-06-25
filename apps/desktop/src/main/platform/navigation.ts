const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEV_RENDERER_PROTOCOLS = new Set(['http:', 'https:']);
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function parseUrl(rawUrl: string | undefined): URL | null {
  if (rawUrl === undefined || rawUrl.trim() === '') return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

export function isAllowedDevRendererUrl(rawUrl: string | undefined): rawUrl is string {
  const parsed = parseUrl(rawUrl);
  return parsed !== null &&
    DEV_RENDERER_PROTOCOLS.has(parsed.protocol) &&
    LOOPBACK_HOSTS.has(parsed.hostname);
}

export function appendSearchToUrl(rawUrl: string, search: string | null): string {
  if (search === null) return rawUrl;
  const parsed = new URL(rawUrl);
  parsed.search = search;
  return parsed.toString();
}

export function isAllowedExternalOpenUrl(rawUrl: string): boolean {
  const parsed = parseUrl(rawUrl);
  return parsed !== null && EXTERNAL_PROTOCOLS.has(parsed.protocol);
}
