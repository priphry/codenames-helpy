// Game state model, categorization, and persistence.
import { CELLS, validateKey } from './grid.js';

const STORAGE_KEY = 'codenames_helper_game_v1';

/**
 * Build a fresh game from the reviewed words + key colours.
 * @param {string[]} words   length-25, row-major
 * @param {string[]} colors  length-25, row-major ('red'|'blue'|'tan'|'black')
 * @param {'red'|'blue'} myTeam
 */
export function buildGame(words, colors, myTeam) {
  const { startingTeam } = validateKey(colors);
  return {
    words: words.slice(0, CELLS),
    colors: colors.slice(0, CELLS),
    myTeam,
    startingTeam,
    revealed: new Array(CELLS).fill(false),
    createdAt: Date.now(),
  };
}

/**
 * Split the board into the lists the Play screen renders.
 * "opponent" is the other agent colour; bystanders are tan; assassin is black.
 */
export function categorize(game) {
  const other = game.myTeam === 'red' ? 'blue' : 'red';
  const mine = [], opponent = [], bystanders = [];
  let assassin = null;
  for (let i = 0; i < CELLS; i++) {
    const entry = { i, word: game.words[i] || `(cell ${i + 1})`, revealed: !!game.revealed[i] };
    const c = game.colors[i];
    if (c === game.myTeam) mine.push(entry);
    else if (c === other) opponent.push({ ...entry, kind: 'opp' });
    else if (c === 'tan') bystanders.push({ ...entry, kind: 'tan' });
    else if (c === 'black') assassin = { ...entry, kind: 'black' };
  }
  const remaining = arr => arr.filter(e => !e.revealed).length;
  return {
    mine, opponent, bystanders, assassin,
    mineLeft: remaining(mine),
    mineTotal: mine.length,
    oppLeft: remaining(opponent),
    oppTotal: opponent.length,
  };
}

export function toggleRevealed(game, i) {
  game.revealed[i] = !game.revealed[i];
  return game;
}

// ---- persistence (guarded so the module also imports cleanly under Node) ----
const store = typeof localStorage !== 'undefined' ? localStorage : null;

export function saveGame(game) {
  if (store) store.setItem(STORAGE_KEY, JSON.stringify(game));
}
export function loadGame() {
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!Array.isArray(g.words) || g.words.length !== CELLS) return null;
    return g;
  } catch { return null; }
}
export function clearGame() {
  if (store) store.removeItem(STORAGE_KEY);
}
