// End-to-end key-card pipeline against the real generated PNG.
// Decodes samples/keycard.png and runs the SAME quad sampler the browser uses.
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sampleKeyByQuad } from '../js/keycard.js';
import { validateKey } from '../js/grid.js';
import { SAMPLE_KEY } from '../tools/make-assets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal PNG decoder — our encoder writes 8-bit RGBA, filter 0 on every row.
function decodePNG(buf) {
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  let idat = [], off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = W * 4 + 1;
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    if (raw[y * stride] !== 0) throw new Error('unexpected PNG filter');
    raw.copy(px, y * W * 4, y * stride + 1, y * stride + 1 + W * 4);
  }
  return { W, H, px };
}

const { W, H, px } = decodePNG(readFileSync(join(ROOT, 'samples/keycard.png')));
const getPixel = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const p = ((y | 0) * W + (x | 0)) * 4;
  return [px[p], px[p + 1], px[p + 2]];
};

// Synthetic card: 6% border, then the 5x5 coloured area. Tap those 4 corners.
const m = 0.06;
const quad = [
  { x: W * m, y: H * m }, { x: W * (1 - m), y: H * m },
  { x: W * (1 - m), y: H * (1 - m) }, { x: W * m, y: H * (1 - m) },
];
const { colors } = sampleKeyByQuad(getPixel, quad);

let fail = 0;
const mismatches = colors.map((c, i) => c === SAMPLE_KEY[i] ? null : i).filter(x => x !== null);
if (mismatches.length) { fail++; console.log('FAIL  cell mismatches at', mismatches); }
else console.log('  ok  all 25 cells classified correctly from real PNG (quad sampler)');

const v = validateKey(colors);
if (!v.ok || v.startingTeam !== 'red') { fail++; console.log('FAIL  validateKey', v); }
else console.log('  ok  validateKey: valid, red starts (9 agents)');

console.log(`\n${fail ? 'FAILED' : 'PASSED'} key-card image pipeline`);
process.exit(fail ? 1 : 0);
