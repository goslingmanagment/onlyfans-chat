// Windows taskbar unread badge (PLAN item 11) — parity with the macOS dock
// badge. macOS takes a string (app.dock.setBadge); Windows wants an overlay
// IMAGE (win.setOverlayIcon), and Electron main has no canvas. So the badge is
// drawn here from scratch: a clay disc + white count in a 5×7 pixel font,
// encoded as a minimal PNG via node zlib — no native deps, unit-testable, and
// the composition root only touches nativeImage.createFromBuffer.

import { deflateSync } from 'node:zlib';

/** Overlay text for an unread total: '' (no overlay), '1'…'99', or '99+'. */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return '';
  }
  return count > 99 ? '99+' : String(Math.floor(count));
}

// ─── 5×7 pixel font (digits + a narrow 3-column '+') ─────────────────────

const FONT: Readonly<Record<string, readonly string[]>> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '+': ['000', '000', '010', '111', '010', '000', '000'],
};

const GLYPH_ROWS = 7;
const SCALE = 2;
const GAP = 2;

// Disc in the app's clay-deep (styles/index.css --color-clay-deep), text white.
const DISC_R = 0xc2;
const DISC_G = 0x60;
const DISC_B = 0x3f;

/**
 * Rasterize the badge into straight RGBA: an anti-aliased full-bleed disc with
 * the text block centered on it. `text` must be non-empty and consist of FONT
 * glyphs ('99+' at scale 2 is the widest fit for the default 32px square).
 */
export function renderBadgeRgba(text: string, size = 32): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - center, y - center);
      const coverage = Math.min(1, Math.max(0, radius - dist + 0.5));
      if (coverage > 0) {
        const at = (y * size + x) * 4;
        rgba[at] = DISC_R;
        rgba[at + 1] = DISC_G;
        rgba[at + 2] = DISC_B;
        rgba[at + 3] = Math.round(coverage * 255);
      }
    }
  }

  const glyphs = Array.from(text, (ch) => {
    const glyph = FONT[ch];
    if (glyph === undefined) {
      throw new Error(`badge glyph not in FONT: ${ch}`);
    }
    return glyph;
  });
  const totalWidth =
    glyphs.reduce((sum, glyph) => sum + (glyph[0]?.length ?? 0) * SCALE, 0) +
    GAP * (glyphs.length - 1);
  let penX = Math.round((size - totalWidth) / 2);
  const penY = Math.round((size - GLYPH_ROWS * SCALE) / 2);
  for (const glyph of glyphs) {
    const cols = glyph[0]?.length ?? 0;
    for (let row = 0; row < GLYPH_ROWS; row++) {
      const bits = glyph[row] ?? '';
      for (let col = 0; col < cols; col++) {
        if (bits[col] !== '1') {
          continue;
        }
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = penX + col * SCALE + dx;
            const py = penY + row * SCALE + dy;
            if (px < 0 || py < 0 || px >= size || py >= size) {
              continue;
            }
            const at = (py * size + px) * 4;
            rgba[at] = 255;
            rgba[at + 1] = 255;
            rgba[at + 2] = 255;
            rgba[at + 3] = 255;
          }
        }
      }
    }
    penX += cols * SCALE + GAP;
  }
  return rgba;
}

// ─── Minimal PNG encoder (RGBA8, filter 0, single IDAT) ───────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Uint8Array): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const out = Buffer.alloc(typed.length + 8);
  out.writeUInt32BE(body.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), typed.length + 4);
  return out;
}

export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error('encodePng: rgba length does not match dimensions');
  }
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    // Leading 0 = "None" scanline filter.
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Only ~101 distinct badges exist; cache the encoded PNGs for the overlay path.
const pngCache = new Map<string, Buffer>();

/** Badge PNG for an unread total; null = clear the overlay. */
export function badgePng(count: number): Buffer | null {
  const text = badgeText(count);
  if (text === '') {
    return null;
  }
  let png = pngCache.get(text);
  if (png === undefined) {
    png = encodePng(renderBadgeRgba(text), 32, 32);
    pngCache.set(text, png);
  }
  return png;
}
