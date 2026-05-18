// Word-grid photo -> 25 words, fully offline via vendored Tesseract.js.
import { bucketWordsToGrid } from './grid.js';

const MAX_SIDE = 2000; // higher res = more pixels per small word, still phone-safe

function toCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  cv.getContext('2d', { willReadFrequently: true })
    .drawImage(img, 0, 0, cv.width, cv.height);
  return preprocess(cv);
}

// Grayscale + robust contrast stretch: pushes card faces toward white and
// the dark table toward black so Tesseract sees clean dark-on-light text.
// Not a hard threshold (which would merge the dark background into the text).
function preprocess(cv) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const im = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = im.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    hist[L]++;
  }
  const total = d.length / 4;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let n = (v - lo) / range;
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    lut[v] = (Math.pow(n, 0.85) * 255) | 0; // mild gamma to lift mid-tones
  }
  for (let i = 0; i < d.length; i += 4) {
    const g = lut[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(im, 0, 0);
  return cv;
}

let workerPromise = null;
function getWorker(onProgress) {
  if (workerPromise) return workerPromise;
  workerPromise = Tesseract.createWorker('eng', 1, {
    workerPath: 'vendor/tesseract/worker.min.js',
    corePath: 'vendor/tesseract/core',
    langPath: 'vendor/tesseract/lang',
    gzip: true,
    cacheMethod: 'none',
    logger: m => {
      if (onProgress && m.status && typeof m.progress === 'number') {
        onProgress(m.status, m.progress);
      }
    },
  }).then(async w => {
    await w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      tessedit_pageseg_mode: '11', // SPARSE_TEXT: scattered words, any order
    });
    return w;
  });
  return workerPromise;
}

// data.words is deprecated in v5; walk the block tree and collect word nodes.
function collectWords(data) {
  if (Array.isArray(data.words) && data.words.length) return data.words;
  const acc = [];
  for (const block of data.blocks || [])
    for (const para of block.paragraphs || [])
      for (const line of para.lines || [])
        for (const word of line.words || []) acc.push(word);
  return acc;
}

/**
 * @param {HTMLImageElement} img
 * @param {(status:string, progress:number)=>void} [onProgress]
 * @returns {Promise<string[]>} length-25 row-major words ('' = not detected)
 */
export async function readWordGrid(img, onProgress) {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(toCanvas(img), {}, { blocks: true });
  const words = collectWords(data).map(w => {
    const bb = w.bbox || {};
    return {
      text: (w.text || '').trim(),
      cx: (bb.x0 + bb.x1) / 2,
      cy: (bb.y0 + bb.y1) / 2,
      w: Math.abs(bb.x1 - bb.x0),
      h: Math.abs(bb.y1 - bb.y0),
      conf: w.confidence || 0,
    };
  }).filter(w => w.text && Number.isFinite(w.cx) && Number.isFinite(w.cy));
  return bucketWordsToGrid(words);
}
