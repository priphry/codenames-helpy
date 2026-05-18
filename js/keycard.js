// Key-card photo -> 25 colours. The card is usually small and angled within
// a table photo, so we sample from a quad the user taps (the 4 corners of
// the coloured grid) using bilinear interpolation — robust to perspective.
import { GRID, CELLS } from './grid.js';

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
// Average a ring around each tile's centre — avoids the white centre icon
// AND the dark grid frame at the tile edges.
function cellColor(getPixel, TL, TR, BL, BR, c, r) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (const rad of [0.26, 0.36]) {
    for (let a = 0; a < 12; a++) {
      const ang = a * Math.PI / 6;
      const u = (c + 0.5 + rad * Math.cos(ang)) / GRID;
      const v = (r + 0.5 + rad * Math.sin(ang)) / GRID;
      const p = lerp(lerp(TL, TR, u), lerp(BL, BR, u), v);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const px = getPixel(p.x + dx, p.y + dy);
          if (px) { sr += px[0]; sg += px[1]; sb += px[2]; n++; }
        }
    }
  }
  return n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
}

const bright = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/**
 * Structure-aware: a Codenames key is ALWAYS 1 assassin, 7 bystanders and
 * 17 agents (9/8). Rank cells instead of using absolute colour thresholds,
 * so it self-calibrates to the photo's lighting:
 *  - darkest cell            -> assassin
 *  - 7 least-saturated of rest -> bystanders
 *  - remaining 17            -> agents, red vs blue by R/B dominance
 */
export function sampleKeyByQuad(getPixel, quad) {
  const [TL, TR, BR, BL] = quad;
  const rgb = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      rgb.push(cellColor(getPixel, TL, TR, BL, BR, c, r));

  const idx = [...Array(CELLS).keys()];
  const colors = new Array(CELLS);

  const assassin = idx.slice().sort((a, b) => bright(rgb[a]) - bright(rgb[b]))[0];
  colors[assassin] = 'black';

  const rest = idx.filter(i => i !== assassin)
    .sort((a, b) => sat(rgb[a]) - sat(rgb[b]));
  rest.slice(0, 7).forEach(i => { colors[i] = 'tan'; });
  rest.slice(7).forEach(i => {
    const [rr, , bb] = rgb[i];
    colors[i] = rr >= bb ? 'red' : 'blue';
  });
  return { colors };
}
