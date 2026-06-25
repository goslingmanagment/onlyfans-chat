import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer Content-Security-Policy', () => {
  it('blocks renderer-initiated navigation and form submits', () => {
    const html = readFileSync(resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
    expect(html).toContain("navigate-to 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-src 'none'");
  });
});
