import { CELLS, rotateGrid90, validateKey } from './grid.js';
import { readWordGrid } from './ocr.js';
import { analyzeKeyCard } from './keycard.js';
import {
  buildGame, categorize, toggleRevealed,
  saveGame, loadGame, clearGame,
} from './game.js';

const $ = sel => document.querySelector(sel);
const screens = {};
document.querySelectorAll('.screen').forEach(s => screens[s.dataset.screen] = s);

function show(name) {
  for (const k in screens) screens[k].hidden = (k !== name);
  window.scrollTo(0, 0);
}

// ---- session-pending data (pre-game) ----
let pendingWords = new Array(CELLS).fill('');
let pendingColors = new Array(CELLS).fill('tan');
let myTeam = 'red';
let editingIndex = -1;

// ---- in-game ----
let game = null;
const undoStack = [];

/* ---------------- HOME ---------------- */
$('#btn-new').addEventListener('click', () => {
  pendingWords = new Array(CELLS).fill('');
  pendingColors = new Array(CELLS).fill('tan');
  resetCapture();
  show('words');
});
$('#btn-resume').addEventListener('click', () => {
  game = loadGame();
  if (game) { myTeam = game.myTeam; renderPlay(); show('play'); }
});

function refreshHome() {
  const saved = loadGame();
  $('#btn-resume').hidden = !saved;
}

document.querySelectorAll('[data-back]').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.back)));

function resetCapture() {
  for (const id of ['words', 'key']) {
    $(`#${id}-file`).value = '';
    const p = $(`#${id}-preview`); p.hidden = true; p.removeAttribute('src');
    $(`#${id}-run`).disabled = true;
  }
  $('#words-progress').hidden = true;
}

/* ---------------- CAPTURE: WORDS ---------------- */
const wordsImg = new Image();
$('#words-file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  wordsImg.onload = () => {
    const p = $('#words-preview'); p.src = url; p.hidden = false;
    $('#words-run').disabled = false;
  };
  wordsImg.src = url;
});

$('#words-run').addEventListener('click', async () => {
  const prog = $('#words-progress');
  prog.hidden = false;
  $('#words-run').disabled = true;
  try {
    pendingWords = await readWordGrid(wordsImg, (status, p) => {
      $('#words-progress .bar i').style.width = Math.round(p * 100) + '%';
      $('#words-progress .ptext').textContent =
        status === 'recognizing text' ? `Reading words… ${Math.round(p * 100)}%`
                                       : `Loading OCR (${status})…`;
    });
    prog.hidden = true;
    show('key');
  } catch (err) {
    prog.hidden = true;
    $('#words-run').disabled = false;
    alert('Could not read the photo. Try better light / framing.\n\n' + err);
  }
});

/* ---------------- CAPTURE: KEY ---------------- */
const keyImg = new Image();
$('#key-file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  keyImg.onload = () => {
    const p = $('#key-preview'); p.src = url; p.hidden = false;
    $('#key-run').disabled = false;
  };
  keyImg.src = url;
});

$('#key-run').addEventListener('click', () => {
  try {
    const { colors } = analyzeKeyCard(keyImg);
    pendingColors = colors;
    renderReview();
    show('review');
  } catch (err) {
    alert('Could not read the key card.\n\n' + err);
  }
});

/* ---------------- REVIEW ---------------- */
$('#team-seg').addEventListener('click', e => {
  const b = e.target.closest('[data-team]'); if (!b) return;
  myTeam = b.dataset.team;
  document.querySelectorAll('#team-seg button')
    .forEach(x => x.classList.toggle('active', x === b));
});

$('#rotate-key').addEventListener('click', () => {
  pendingColors = rotateGrid90(pendingColors);
  renderReview();
});

function renderReview() {
  const grid = $('#review-grid');
  grid.innerHTML = '';
  for (let i = 0; i < CELLS; i++) {
    const cell = document.createElement('div');
    const word = pendingWords[i] || '';
    cell.className = `rcell c-${pendingColors[i]}${word ? '' : ' empty'}`;
    cell.textContent = word || '?';
    cell.addEventListener('click', () => openEdit(i));
    grid.appendChild(cell);
  }
  const v = validateKey(pendingColors);
  const banner = $('#review-banner');
  banner.className = 'banner show ' + (v.ok ? 'ok' : 'warn');
  banner.textContent = v.ok
    ? `Key looks valid · ${v.startingTeam} starts (9 agents).`
    : 'Check the key: ' + v.issues.join(' ') + ' Use ⟳ if orientation is off.';
}

function openEdit(i) {
  editingIndex = i;
  const dlg = $('#edit-dialog');
  $('#edit-input').value = pendingWords[i] || '';
  dlg.returnValue = '';
  dlg.showModal();
  $('#edit-input').focus();
}
$('#edit-dialog').addEventListener('close', () => {
  if ($('#edit-dialog').returnValue === 'ok' && editingIndex >= 0) {
    pendingWords[editingIndex] =
      $('#edit-input').value.toUpperCase().replace(/[^A-Z]/g, '');
    renderReview();
  }
  editingIndex = -1;
});

$('#start-game').addEventListener('click', () => {
  game = buildGame(pendingWords, pendingColors, myTeam);
  undoStack.length = 0;
  saveGame(game);
  renderPlay();
  show('play');
});

/* ---------------- PLAY ---------------- */
function wordCard(entry, extraClass = '') {
  const el = document.createElement('button');
  el.className = `wcard ${extraClass}${entry.revealed ? ' revealed' : ''}`;
  el.textContent = entry.word;
  el.addEventListener('click', () => {
    toggleRevealed(game, entry.i);
    undoStack.push(entry.i);
    saveGame(game);
    renderPlay();
  });
  return el;
}

function renderPlay() {
  const cat = categorize(game);

  $('#play-counts').innerHTML =
    `<span class="pill mine">You: ${cat.mineLeft}/${cat.mineTotal} left</span>` +
    `<span class="pill opp">Opponent: ${cat.oppLeft}/${cat.oppTotal} left</span>` +
    `<span class="pill">${game.startingTeam ?? '?'} started</span>`;

  const ab = $('#assassin-box');
  if (cat.assassin) {
    ab.className = 'assassin-box' + (cat.assassin.revealed ? ' done' : '');
    ab.innerHTML = `<div class="lab">☠ ASSASSIN — NEVER CLUE THIS</div>
                    <div class="w">${cat.assassin.word}</div>`;
    ab.onclick = () => {
      toggleRevealed(game, cat.assassin.i);
      undoStack.push(cat.assassin.i);
      saveGame(game); renderPlay();
    };
  } else {
    ab.className = 'assassin-box';
    ab.innerHTML = `<div class="lab">No assassin detected — re-check key</div>`;
    ab.onclick = null;
  }

  $('#mine-left').textContent = `${cat.mineLeft} left`;
  const mine = $('#mine-list'); mine.innerHTML = '';
  cat.mine.forEach(e => mine.appendChild(wordCard(e)));

  const avoid = $('#avoid-list'); avoid.innerHTML = '';
  cat.opponent.forEach(e => avoid.appendChild(wordCard(e, 't-' +
    (game.myTeam === 'red' ? 'blue' : 'red'))));
  cat.bystanders.forEach(e => avoid.appendChild(wordCard(e, 't-tan')));

  $('#undo-btn').disabled = undoStack.length === 0;
}

$('#undo-btn').addEventListener('click', () => {
  const i = undoStack.pop();
  if (i === undefined) return;
  toggleRevealed(game, i);
  saveGame(game);
  renderPlay();
});
$('#rescan-btn').addEventListener('click', () => {
  resetCapture();
  show('words');
});
$('#newgame-btn').addEventListener('click', () => {
  if (!confirm('Discard this game?')) return;
  clearGame();
  game = null;
  undoStack.length = 0;
  refreshHome();
  show('home');
});

/* ---------------- boot ---------------- */
refreshHome();
show('home');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
