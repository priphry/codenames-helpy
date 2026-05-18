// Pure, dependency-free logic shared by the browser app and the Node tests.
// Keep everything here side-effect free so it can run under both.

export const GRID = 5;            // 5x5 board
export const CELLS = GRID * GRID; // 25

/** RGB (0-255) -> HSV (h 0-360, s/v 0-1). */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Classify a key-card cell colour into the four Codenames categories.
 * red / blue = agents, tan = innocent bystander, black = assassin.
 * Tuned for the real card palette (bright red, mid blue, warm beige, near-black)
 * but deliberately lenient so phone-camera white balance still lands right.
 */
export function classifyColor(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.30) return 'black';                 // assassin: very dark
  if (s < 0.20) return 'tan';                   // washed-out / beige bystander
  if (h < 22 || h >= 335) return 'red';
  if (h >= 185 && h <= 265) return 'blue';
  return 'tan';                                  // warm orange/yellow hues -> beige
}

/**
 * Bucket OCR word boxes into a row-major 5x5 grid using their centroids.
 * Orientation-agnostic: whatever the user framed becomes rows/cols, and the
 * key card is read the same way, so the two line up.
 *
 * @param {{text:string,cx:number,cy:number,conf:number}[]} words
 * @returns {string[]} length-25 array, '' for cells with no detected text
 */
export function bucketWordsToGrid(words) {
  const out = new Array(CELLS).fill('');
  const good = (words || []).filter(w => w && w.text && w.text.length >= 2);
  if (good.length === 0) return out;

  const xs = good.map(w => w.cx), ys = good.map(w => w.cy);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
  const idx = (min, span, v) =>
    Math.max(0, Math.min(GRID - 1, Math.floor(((v - min) / span) * GRID * 0.999)));

  const buckets = Array.from({ length: CELLS }, () => []);
  for (const w of good) {
    const col = idx(minX, spanX, w.cx);
    const row = idx(minY, spanY, w.cy);
    buckets[row * GRID + col].push(w);
  }
  for (let i = 0; i < CELLS; i++) {
    out[i] = pickCellWord(buckets[i]);
  }
  return out;
}

const MIN_CONF = 35; // below this, blank the cell so it shows '?' for a quick fix

// Codenames cards print the word twice: large in the centre and a tiny
// upside-down copy near the top. Cluster a cell's tokens into horizontal
// lines by vertical position, then keep the dominant line (widest, tallest,
// most confident) — this separates the real word from the mirrored mini-line
// and the faint icon by geometry instead of guessing.
function pickCellWord(cell) {
  if (!cell || cell.length === 0) return '';
  const estW = t => (t.w != null ? t.w : t.text.length * (t.h || 10) * 0.6);
  const tokens = cell.slice().sort((a, b) => a.cy - b.cy);

  const lines = [];
  let cur = [];
  for (const t of tokens) {
    if (cur.length) {
      const avgH = cur.reduce((s, x) => s + (x.h || 0), 0) / cur.length;
      const lastCy = cur[cur.length - 1].cy;
      if (t.cy - lastCy > 0.8 * Math.max(avgH, 1)) {
        lines.push(cur); cur = [];
      }
    }
    cur.push(t);
  }
  if (cur.length) lines.push(cur);

  let best = null, bestScore = -1, bestConf = 0;
  for (const ln of lines) {
    const width = ln.reduce((s, x) => s + estW(x), 0);
    const avgH = ln.reduce((s, x) => s + (x.h || 0), 0) / ln.length;
    const avgConf = ln.reduce((s, x) => s + (x.conf || 0), 0) / ln.length;
    const score = width * Math.max(avgH, 1) * (avgConf + 1);
    if (score > bestScore) { bestScore = score; best = ln; bestConf = avgConf; }
  }
  if (!best) return '';

  const txt = best.sort((a, b) => a.cx - b.cx)
    .map(x => x.text).join('')
    .toUpperCase().replace(/[^A-Z]/g, '');
  return (txt.length >= 2 && bestConf >= MIN_CONF) ? txt : '';
}

/** Rotate a flat 5x5 array 90° clockwise (used for key/word orientation fixes). */
export function rotateGrid90(flat) {
  const out = new Array(CELLS);
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      out[c * GRID + (GRID - 1 - r)] = flat[r * GRID + c];
  return out;
}

/**
 * Sanity-check detected key colours against the fixed Codenames distribution:
 * exactly 1 assassin, 7 bystanders, and a 9/8 agent split.
 */
export function validateKey(colors) {
  const count = { red: 0, blue: 0, tan: 0, black: 0 };
  for (const c of colors) if (c in count) count[c]++;
  const issues = [];
  if (count.black !== 1) issues.push(`Found ${count.black} assassin cells (need exactly 1).`);
  if (count.tan !== 7) issues.push(`Found ${count.tan} bystander cells (need 7).`);
  const nineEight = (count.red === 9 && count.blue === 8) || (count.red === 8 && count.blue === 9);
  if (!nineEight) issues.push(`Agent split is ${count.red} red / ${count.blue} blue (need 9 and 8).`);
  const startingTeam = count.red === 9 ? 'red' : count.blue === 9 ? 'blue' : null;
  return { ok: issues.length === 0, counts: count, startingTeam, issues };
}
