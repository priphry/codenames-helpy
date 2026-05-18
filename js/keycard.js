// Key-card photo -> 25 colours. Assumes the user framed the card to roughly
// fill the photo (per the "full auto" capture flow).
import { GRID, CELLS, classifyColor } from './grid.js';

/**
 * Pure sampler — shared by the browser and the Node tests.
 * @param {(x:number,y:number)=>[number,number,number]} getPixel
 * @param {number} W image width
 * @param {number} H image height
 * @returns {{colors:string[], samples:number[][]}}
 */
export function sampleKeyColors(getPixel, W, H) {
  // A thin outer band is the coloured border (starting-team marker); read the
  // 5x5 grid from the inset area and only sample each cell's inner ~40%.
  const inset = 0.06;
  const gx0 = W * inset, gy0 = H * inset;
  const gW = W * (1 - 2 * inset), gH = H * (1 - 2 * inset);
  const cellW = gW / GRID, cellH = gH / GRID;
  const padX = cellW * 0.30, padY = cellH * 0.30;

  const colors = new Array(CELLS);
  const samples = new Array(CELLS);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const x0 = Math.floor(gx0 + c * cellW + padX);
      const y0 = Math.floor(gy0 + r * cellH + padY);
      const x1 = Math.ceil(gx0 + (c + 1) * cellW - padX);
      const y1 = Math.ceil(gy0 + (r + 1) * cellH - padY);
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = getPixel(x, y);
          sr += p[0]; sg += p[1]; sb += p[2]; n++;
        }
      }
      const rgb = n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
      const i = r * GRID + c;
      samples[i] = rgb;
      colors[i] = classifyColor(rgb[0], rgb[1], rgb[2]);
    }
  }
  return { colors, samples };
}

/**
 * Browser entry: rasterise the photo and sample it.
 * @param {HTMLImageElement|HTMLCanvasElement} img
 */
export function analyzeKeyCard(img) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const getPixel = (x, y) => {
    const p = (y * W + x) * 4;
    return [data[p], data[p + 1], data[p + 2]];
  };
  return sampleKeyColors(getPixel, W, H);
}
