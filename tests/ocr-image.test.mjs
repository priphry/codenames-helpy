// End-to-end OCR check: real (vendored) Tesseract on samples/words.png ->
// bucketWordsToGrid. Synthetic 5x7 font is blocky, so this measures the
// pipeline, not real-card accuracy. Run: node tests/ocr-image.test.mjs
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bucketWordsToGrid } from '../js/grid.js';
import { SAMPLE_WORDS } from '../tools/make-assets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const worker = await createWorker('eng', 1, {
  langPath: join(ROOT, 'vendor/tesseract/lang'),
  gzip: true,
  cacheMethod: 'none',
});
await worker.setParameters({
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  tessedit_pageseg_mode: '11',
});

const { data } = await worker.recognize(join(ROOT, 'samples/words.png'), {}, { blocks: true });
await worker.terminate();

const acc = [];
for (const block of data.blocks || [])
  for (const para of block.paragraphs || [])
    for (const line of para.lines || [])
      for (const w of line.words || []) acc.push(w);

const boxes = acc.map(w => ({
  text: (w.text || '').trim(),
  cx: (w.bbox.x0 + w.bbox.x1) / 2,
  cy: (w.bbox.y0 + w.bbox.y1) / 2,
  h: Math.abs(w.bbox.y1 - w.bbox.y0),
  conf: w.confidence,
})).filter(w => w.text);

const grid = bucketWordsToGrid(boxes);
let hit = 0;
for (let i = 0; i < 25; i++) if (grid[i] === SAMPLE_WORDS[i]) hit++;

console.log('detected boxes:', boxes.length);
console.log('grid:', JSON.stringify(grid));
console.log(`exact cell matches: ${hit}/25`);
// Engine+clustering wiring is what we assert here (blocky synthetic font);
// a low bar that still proves words flow through to the right cells.
process.exit(hit >= 13 ? 0 : 1);
