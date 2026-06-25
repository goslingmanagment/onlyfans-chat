import { describe, expect, it } from 'vitest';
import {
  appendSearchToUrl,
  isAllowedDevRendererUrl,
  isAllowedExternalOpenUrl,
} from '@main/platform/navigation';

describe('main-window navigation hardening', () => {
  it('allows dev renderer URLs only on loopback HTTP(S)', () => {
    expect(isAllowedDevRendererUrl('http://localhost:5173')).toBe(true);
    expect(isAllowedDevRendererUrl('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedDevRendererUrl('http://[::1]:5173')).toBe(true);
    expect(isAllowedDevRendererUrl('https://localhost:5173')).toBe(true);

    expect(isAllowedDevRendererUrl('https://example.com/app')).toBe(false);
    expect(isAllowedDevRendererUrl('file:///tmp/index.html')).toBe(false);
    expect(isAllowedDevRendererUrl('javascript:alert(1)')).toBe(false);
  });

  it('adds debug boot search params without dropping existing origin checks', () => {
    expect(appendSearchToUrl('http://localhost:5173/', 'view=settings')).toBe(
      'http://localhost:5173/?view=settings',
    );
  });

  it('limits external opens to browser/mail protocols', () => {
    expect(isAllowedExternalOpenUrl('https://example.com')).toBe(true);
    expect(isAllowedExternalOpenUrl('mailto:support@example.com')).toBe(true);

    expect(isAllowedExternalOpenUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalOpenUrl('javascript:alert(1)')).toBe(false);
  });
});
