// Pure-logic tests (no browser). Run: node tests/logic.test.mjs
import {
  classifyColor, bucketWordsToGrid, rotateGrid90, validateKey,
} from '../js/grid.js';
import { buildGame, categorize, toggleRevealed } from '../js/game.js';
import { SAMPLE_KEY, SAMPLE_WORDS } from '../tools/make-assets.mjs';

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}

/* classifyColor — exact render colours + camera-shifted variants */
ok('classify red',   classifyColor(200, 40, 36) === 'red');
ok('classify blue',  classifyColor(40, 90, 190) === 'blue');
ok('classify tan',   classifyColor(205, 188, 150) === 'tan');
ok('classify black', classifyColor(18, 18, 20) === 'black');
ok('classify warm-white-balanced red',  classifyColor(190, 70, 60) === 'red');
ok('classify cool-white-balanced blue', classifyColor(70, 110, 200) === 'blue');
ok('classify dim beige still tan',      classifyColor(170, 156, 128) === 'tan');

/* validateKey on the known sample */
const v = validateKey(SAMPLE_KEY);
ok('sample key valid', v.ok === true);
ok('sample starting team = red', v.startingTeam === 'red');
ok('sample counts 9/8/7/1',
  eq(v.counts, { red: 9, blue: 8, tan: 7, black: 1 }));
ok('invalid key flagged',
  validateKey(SAMPLE_KEY.map((c, i) => i === 0 ? 'black' : c)).ok === false);

/* bucketWordsToGrid — synthetic Tesseract boxes with positional jitter */
const boxes = [];
SAMPLE_WORDS.forEach((wd, i) => {
  const r = Math.floor(i / 5), c = i % 5;
  boxes.push({
    text: wd,
    cx: c * 300 + 150 + (Math.random() * 30 - 15),
    cy: r * 240 + 120 + (Math.random() * 24 - 12),
    w: wd.length * 22,
    h: 40,
    conf: 90,
  });
});
ok('bucket reconstructs row-major grid',
  eq(bucketWordsToGrid(boxes), SAMPLE_WORDS));
// Realistic: cell 0's word arrives as two close fragments amid the full grid.
const fragBoxes = boxes.slice(1).concat([
  { text: 'AP',  cx: 140, cy: 120, w: 40, h: 40, conf: 80 },
  { text: 'PLE', cx: 165, cy: 120, w: 60, h: 40, conf: 80 },
]);
ok('bucket stitches split fragments',
  bucketWordsToGrid(fragBoxes)[0] === 'APPLE');
// Codenames cards: tiny upside-down duplicate must be dropped (separate,
// smaller, less confident line). Add a mirrored mini-copy into cell 0.
const dupBoxes = boxes.concat([
  { text: 'EVPPA', cx: boxes[0].cx, cy: boxes[0].cy - 20, w: 30, h: 12, conf: 55 },
]);
ok('bucket keeps the large word, drops tiny duplicate',
  bucketWordsToGrid(dupBoxes)[0] === 'APPLE');
// Low-confidence cell is blanked (shows '?') rather than confident gibberish.
ok('bucket blanks low-confidence detections',
  bucketWordsToGrid([
    { text: 'XQZJV', cx: 150, cy: 120, w: 80, h: 30, conf: 18 },
  ])[0] === '');
ok('bucket handles empty input',
  bucketWordsToGrid([]).length === 25 &&
  bucketWordsToGrid([]).every(s => s === ''));

/* rotateGrid90 — four turns is identity */
let g = SAMPLE_KEY.slice();
for (let i = 0; i < 4; i++) g = rotateGrid90(g);
ok('rotate x4 = identity', eq(g, SAMPLE_KEY));
ok('rotate changes orientation once',
  !eq(rotateGrid90(SAMPLE_KEY), SAMPLE_KEY));

/* game model: build / categorize / reveal / undo */
const game = buildGame(SAMPLE_WORDS, SAMPLE_KEY, 'red');
let cat = categorize(game);
ok('mine = 9 red words', cat.mineTotal === 9);
ok('opponent = 8 blue words', cat.oppTotal === 8);
ok('bystanders = 7', cat.bystanders.length === 7);
ok('assassin word is cell-12 (PIRATE)', cat.assassin && cat.assassin.word === 'PIRATE');
ok('all 9 mine left initially', cat.mineLeft === 9);

const firstMine = cat.mine[0].i;
toggleRevealed(game, firstMine);
cat = categorize(game);
ok('reveal drops mineLeft to 8', cat.mineLeft === 8);
toggleRevealed(game, firstMine); // undo
cat = categorize(game);
ok('undo restores mineLeft to 9', cat.mineLeft === 9);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
