// Word-grid photo -> 25 words, fully offline via vendored Tesseract.js.
import { bucketWordsToGrid } from './grid.js';

const MAX_SIDE = 1600; // downscale long edge for speed without hurting accuracy

function toCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
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
      conf: w.confidence || 0,
    };
  }).filter(w => w.text && Number.isFinite(w.cx) && Number.isFinite(w.cy));
  return bucketWordsToGrid(words);
}
