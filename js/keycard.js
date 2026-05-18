// Key-card photo -> 25 colours. The card is usually small and angled within
// a table photo, so we sample from a quad the user taps (the 4 corners of
// the coloured grid) using bilinear interpolation — robust to perspective.
import { GRID, CELLS, classifyColor } from './grid.js';

/** Rasterise an image to a bounds-checked pixel accessor. */
export function imagePixels(img) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const getPixel = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const p = ((y | 0) * W + (x | 0)) * 4;
    return [data[p], data[p + 1], data[p + 2]];
  };
  return { getPixel, W, H };
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * @param {(x:number,y:number)=>[number,number,number]|null} getPixel
 * @param {[{x,y},{x,y},{x,y},{x,y}]} quad  TL, TR, BR, BL of the coloured grid
 * @returns {{colors:string[], samples:number[][]}}
 */
// Vote across many points in the inner cell instead of averaging one patch:
// each tile has a white centre icon, so a mean would wash red/blue toward
// tan. A colour wins if it's a meaningful share; dark -> assassin; else tan.
function decideCell(getPixel, TL, TR, BL, BR, c, r) {
  const tally = { red: 0, blue: 0, tan: 0, black: 0 };
  let total = 0;
  const K = 6;
  for (let sy = 0; sy <= K; sy++) {
    for (let sx = 0; sx <= K; sx++) {
      const u = (c + 0.15 + 0.70 * sx / K) / GRID;
      const v = (r + 0.15 + 0.70 * sy / K) / GRID;
      const p = lerp(lerp(TL, TR, u), lerp(BL, BR, u), v);
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const px = getPixel(p.x + dx, p.y + dy);
          if (px) { sr += px[0]; sg += px[1]; sb += px[2]; n++; }
        }
      if (!n) continue;
      tally[classifyColor(sr / n, sg / n, sb / n)]++;
      total++;
    }
  }
  if (!total) return 'tan';
  const colored = Math.max(tally.red, tally.blue);
  if (colored >= total * 0.28)
    return tally.red >= tally.blue ? 'red' : 'blue';
  if (tally.black >= total * 0.30) return 'black';
  return 'tan';
}

export function sampleKeyByQuad(getPixel, quad) {
  const [TL, TR, BR, BL] = quad;
  const colors = new Array(CELLS);
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      colors[r * GRID + c] = decideCell(getPixel, TL, TR, BL, BR, c, r);
  return { colors };
}
