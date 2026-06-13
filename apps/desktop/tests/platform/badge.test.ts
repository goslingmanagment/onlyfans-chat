// Windows taskbar badge generator (PLAN item 11). The PNG output is decoded
// back with node zlib in these tests — no image library, same as the encoder.

import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { badgePng, badgeText, encodePng, renderBadgeRgba } from '@main/platform/badge';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Walk PNG chunks; return IHDR fields + reassembled raw scanline bytes. */
function decodePng(png: Buffer): { width: number; height: number; raw: Buffer } {
  expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIG);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString('ascii');
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect(body[8]).toBe(8); // bit depth
      expect(body[9]).toBe(6); // RGBA
    }
    if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    }
    at += 12 + length;
  }
  return { width, height, raw: inflateSync(Buffer.concat(idat)) };
}

function pixelAt(raw: Buffer, width: number, x: number, y: number): number[] {
  const at = y * (width * 4 + 1) + 1 + x * 4;
  expect(raw[y * (width * 4 + 1)]).toBe(0); // scanline filter: None
  return Array.from(raw.subarray(at, at + 4));
}

describe('badgeText', () => {
  it('maps unread totals to overlay text', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(-3)).toBe('');
    expect(badgeText(1)).toBe('1');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(10)).toBe('10');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(2500)).toBe('99+');
  });
});

describe('encodePng + renderBadgeRgba', () => {
  it('round-trips a valid 32×32 RGBA PNG', () => {
    const png = encodePng(renderBadgeRgba('8'), 32, 32);
    const { width, height, raw } = decodePng(png);
    expect(width).toBe(32);
    expect(height).toBe(32);
    expect(raw.length).toBe(32 * (32 * 4 + 1));
  });

  it('draws an opaque clay disc with transparent corners and white text', () => {
    const { width, raw } = decodePng(encodePng(renderBadgeRgba('8'), 32, 32));
    // Corner is outside the disc.
    expect(pixelAt(raw, width, 0, 0)).toEqual([0, 0, 0, 0]);
    // Disc edge pixel (mid-left) is clay-deep and opaque.
    expect(pixelAt(raw, width, 1, 16)).toEqual([0xc2, 0x60, 0x3f, 255]);
    // The '8' has a white pixel at the glyph center (scaled 5×7 font block
    // centered in 32px: x 11..20, y 9..22 — middle bar of the 8 at y=15/16).
    expect(pixelAt(raw, width, 16, 16)).toEqual([255, 255, 255, 255]);
  });

  it("'99+' (the widest badge) stays inside the 32px square", () => {
    const { raw, width } = decodePng(encodePng(renderBadgeRgba('99+'), 32, 32));
    // Text block is horizontally centered, 30px wide (x 1..30): the outermost
    // columns must hold no white text pixels — only disc edge or transparency.
    for (let y = 0; y < 32; y++) {
      expect(pixelAt(raw, width, 0, y).slice(0, 3)).not.toEqual([255, 255, 255]);
      expect(pixelAt(raw, width, 31, y).slice(0, 3)).not.toEqual([255, 255, 255]);
    }
    // And it does hold text: at least one white pixel somewhere on the midline.
    const midline = Array.from({ length: 32 }, (_, x) => pixelAt(raw, width, x, 16));
    expect(midline.some((px) => px[0] === 255 && px[1] === 255 && px[2] === 255)).toBe(true);
  });

  it('rejects glyphs outside the font', () => {
    expect(() => renderBadgeRgba('A')).toThrow(/glyph/);
  });

  it('rejects mismatched rgba dimensions', () => {
    expect(() => encodePng(new Uint8Array(3), 32, 32)).toThrow(/length/);
  });
});

describe('badgePng', () => {
  it('returns null for zero unread (clears the overlay)', () => {
    expect(badgePng(0)).toBeNull();
  });

  it('caches by text', () => {
    expect(badgePng(5)).toBe(badgePng(5));
    expect(badgePng(100)).toBe(badgePng(250)); // both render '99+'
  });
});
