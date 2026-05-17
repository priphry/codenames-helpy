// Dependency-free generator for PWA icons + offline test samples.
// Run: node tools/make-assets.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- minimal RGBA PNG encoder ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- tiny canvas ---------- */
function canvas(w, h, bg = [255, 255, 255, 255]) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) buf.set(bg, i * 4);
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    buf.set(c, (y * w + x) * 4);
  };
  const rect = (x, y, rw, rh, c) => {
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) px(x + i, y + j, c);
  };
  return { w, h, buf, px, rect, png: () => encodePNG(w, h, buf) };
}

/* ---------- 5x7 font ---------- */
const G = `
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .#### #.... #.... #.... #.... #.... .####
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .#### #.... #.... #..## #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I ##### ..#.. ..#.. ..#.. ..#.. ..#.. #####
J ..### ...#. ...#. ...#. #..#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# ##..# #.#.# #.#.# #..## #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# #...# .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# ##.## #...#
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
`.trim().split('\n').reduce((m, ln) => {
  const p = ln.trim().split(' ');
  m[p[0]] = p.slice(1);
  return m;
}, {});

function drawText(cv, text, cx, cy, scale, color) {
  const glyphW = 5, glyphH = 7, gap = 1;
  const total = text.length * (glyphW + gap) - gap;
  let x = Math.round(cx - (total * scale) / 2);
  const y = Math.round(cy - (glyphH * scale) / 2);
  for (const ch of text) {
    const g = G[ch];
    if (g) for (let r = 0; r < glyphH; r++)
      for (let c = 0; c < glyphW; c++)
        if (g[r][c] === '#') cv.rect(x + c * scale, y + r * scale, scale, scale, color);
    x += (glyphW + gap) * scale;
  }
}

/* ---------- icons ---------- */
const PALETTE = { r: [220, 38, 38, 255], b: [37, 99, 235, 255], t: [200, 183, 143, 255], k: [11, 11, 12, 255] };
function makeIcon(size, maskable) {
  const cv = canvas(size, size, [15, 23, 42, 255]);
  const pad = maskable ? size * 0.18 : size * 0.10;
  const area = size - pad * 2, gap = area * 0.04, cell = (area - gap * 4) / 5;
  const layout = 'rtbrt tbrtk btrtb rtbtr tbrtb'.replace(/ /g, '');
  for (let i = 0; i < 25; i++) {
    const r = Math.floor(i / 5), c = i % 5;
    cv.rect(
      Math.round(pad + c * (cell + gap)),
      Math.round(pad + r * (cell + gap)),
      Math.round(cell), Math.round(cell),
      PALETTE[layout[i]]
    );
  }
  return cv.png();
}

/* ---------- key card sample (known layout for tests) ---------- */
// 9 red (starting), 8 blue, 7 tan, 1 black — row-major.
export const SAMPLE_KEY = [
  'red', 'tan', 'blue', 'red', 'tan',
  'blue', 'red', 'red', 'blue', 'tan',
  'tan', 'blue', 'black', 'red', 'blue',
  'red', 'tan', 'blue', 'red', 'blue',
  'tan', 'red', 'blue', 'red', 'tan',
];
const KEY_RGB = { red: [200, 40, 36], blue: [40, 90, 190], tan: [205, 188, 150], black: [18, 18, 20] };

function makeKeyCardSample() {
  const S = 900, cv = canvas(S, S, KEY_RGB.red.concat(255)); // red border = starting team
  const inset = S * 0.06, area = S - inset * 2, cell = area / 5;
  for (let i = 0; i < 25; i++) {
    const r = Math.floor(i / 5), c = i % 5;
    cv.rect(
      Math.round(inset + c * cell + cell * 0.05),
      Math.round(inset + r * cell + cell * 0.05),
      Math.round(cell * 0.9), Math.round(cell * 0.9),
      KEY_RGB[SAMPLE_KEY[i]].concat(255)
    );
  }
  return cv.png();
}

/* ---------- word grid sample ---------- */
export const SAMPLE_WORDS = [
  'APPLE', 'TOWER', 'RIVER', 'KNIGHT', 'PIANO',
  'CLOUD', 'TIGER', 'BRIDGE', 'STONE', 'COMET',
  'GLOVE', 'NURSE', 'PIRATE', 'MAPLE', 'ROBOT',
  'SHELL', 'CANDLE', 'DRAGON', 'OASIS', 'PRISM',
  'FALCON', 'JUNGLE', 'MARBLE', 'VAULT', 'ZEBRA',
];
function makeWordsSample() {
  const W = 1500, H = 1200, cv = canvas(W, H, [255, 255, 255, 255]);
  const cw = W / 5, ch = H / 5, ink = [20, 20, 20, 255], line = [210, 210, 210, 255];
  for (let i = 1; i < 5; i++) {
    cv.rect(Math.round(i * cw), 0, 2, H, line);
    cv.rect(0, Math.round(i * ch), W, 2, line);
  }
  SAMPLE_WORDS.forEach((wd, i) => {
    const r = Math.floor(i / 5), c = i % 5;
    drawText(cv, wd, c * cw + cw / 2, r * ch + ch / 2, 6, ink);
  });
  return cv.png();
}

/* ---------- write ---------- */
if (process.argv[1] && process.argv[1].endsWith('make-assets.mjs')) {
  mkdirSync(join(ROOT, 'icons'), { recursive: true });
  mkdirSync(join(ROOT, 'samples'), { recursive: true });
  writeFileSync(join(ROOT, 'icons/icon-192.png'), makeIcon(192, false));
  writeFileSync(join(ROOT, 'icons/icon-512.png'), makeIcon(512, false));
  writeFileSync(join(ROOT, 'icons/icon-512-maskable.png'), makeIcon(512, true));
  writeFileSync(join(ROOT, 'samples/keycard.png'), makeKeyCardSample());
  writeFileSync(join(ROOT, 'samples/words.png'), makeWordsSample());
  console.log('Assets written: icons/*, samples/keycard.png, samples/words.png');
}
