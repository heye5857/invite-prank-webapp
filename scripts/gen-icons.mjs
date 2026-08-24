/**
 * Generate PWA icons (192/512) as pure-node PNGs via pngjs.
 * Placeholder art: purple rounded square + white "card" with two text lines.
 * Replace public/icons/*.png with real artwork anytime; manifest paths stay identical.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const ACCENT = { r: 0x7c, g: 0x3a, b: 0xed };
const BG = { r: 0xfa, g: 0xf5, b: 0xff };
const WHITE = { r: 255, g: 255, b: 255 };

function roundedMask(x, y, size, radius) {
  const minX = radius, maxX = size - 1 - radius;
  const minY = radius, maxY = size - 1 - radius;
  if (x >= minX && x <= maxX) return true;
  if (y >= minY && y <= maxY) return true;
  const cx = x < minX ? minX : maxX;
  const cy = y < minY ? minY : maxY;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  const radius = Math.round(size * 0.22);
  // outer rounded square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      if (!roundedMask(x, y, size, radius)) {
        png.data[idx + 3] = 0; // transparent corner
        continue;
      }
      png.data[idx] = BG.r;
      png.data[idx + 1] = BG.g;
      png.data[idx + 2] = BG.b;
      png.data[idx + 3] = 255;
    }
  }
  // white card
  const cardX = Math.round(size * 0.26), cardY = Math.round(size * 0.30);
  const cardW = Math.round(size * 0.48), cardH = Math.round(size * 0.40);
  const cardR = Math.round(size * 0.05);
  for (let y = cardY; y < cardY + cardH; y++) {
    for (let x = cardX; x < cardX + cardW; x++) {
      if (!roundedMask(x - cardX + cardR, y - cardY + cardR, cardW, cardR)) continue;
      if (x >= size || y >= size) continue;
      const idx = (size * y + x) << 2;
      png.data[idx] = WHITE.r;
      png.data[idx + 1] = WHITE.g;
      png.data[idx + 2] = WHITE.b;
      png.data[idx + 3] = 255;
    }
  }
  // two accent lines on the card ("text")
  const lineYs = [Math.round(cardY + cardH * 0.35), Math.round(cardY + cardH * 0.62)];
  for (const ly of lineYs) {
    const h = Math.max(2, Math.round(size * 0.03));
    for (let y = ly; y < ly + h; y++) {
      for (let x = cardX + Math.round(cardW * 0.15); x < cardX + cardW - Math.round(cardW * (ly === lineYs[0] ? 0.15 : 0.35)); x++) {
        const idx = (size * y + x) << 2;
        png.data[idx] = ACCENT.r;
        png.data[idx + 1] = ACCENT.g;
        png.data[idx + 2] = ACCENT.b;
        png.data[idx + 3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, makeIcon(size));
  console.log(`wrote ${file}`);
}
