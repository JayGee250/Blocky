import { createBoard, canPlace, placeAndClear, isEmpty, MODES } from './board.js';
import { getPiece } from './pieces.js';
import { createRng } from './rng.js';
import { dealRound } from './generator.js';
import { anyOrderSolvable } from './solver.js';
import { difficultyForLevel, levelForProgress, MAX_LEVEL } from './difficulty.js';
import { scorePlacement, COMBO_GRACE } from './scoring.js';

// Game state is a plain JSON-serializable object, so the UI can save it to
// storage and resume after iOS closes the app.
//
// A round is always dealt solvable in at least one order. The game ends when
// the player places a piece so that the remaining pieces of the round can no
// longer all be placed: picking the order is the challenge.

// `level` is the start level (1..MAX_LEVEL): the game deals that level's pieces
// from the first round, and levels go up from there as lines are cleared.
// `mode` is classic, slide or gravity (see board.js). Saved games from before
// modes existed have no mode and play as classic.
export const modeOf = (state) => (MODES.includes(state?.mode) ? state.mode : 'classic');

export function newGame({ seed = Date.now() >>> 0, level = 1, mode = 'classic' } = {}) {
  const startLevel = Math.min(Math.max(Math.floor(level) || 1, 1), MAX_LEVEL);
  const state = {
    mode: MODES.includes(mode) ? mode : 'classic',
    board: createBoard(),
    tray: [],              // [{ id, used }]
    score: 0,
    linesCleared: 0,
    level: startLevel,
    startLevel,
    combo: 0,
    movesSinceClear: 0,
    moves: 0,
    rounds: 0,
    rngState: seed >>> 0,
    gameOver: false,
  };
  deal(state);
  return state;
}

export function trayPieces(state) {
  return state.tray.map((t) => ({ ...t, piece: getPiece(t.id) }));
}

export function canPlaceSlot(state, slot, r, c) {
  const t = state.tray[slot];
  return !state.gameOver && !!t && !t.used && canPlace(state.board, getPiece(t.id), r, c);
}

// Place tray piece `slot` with its top-left corner at (r, c).
// Returns { ok, points, clearedRows, clearedCols, steps, lines, boardCleared, dealt, levelUp, gameOver }.
// `steps` lists each clear with its map of where every block moved (board.js);
// classic and slide have at most one step, gravity one per link of the chain.
export function place(state, slot, r, c) {
  if (!canPlaceSlot(state, slot, r, c)) return { ok: false };
  const piece = getPiece(state.tray[slot].id);
  const mode = modeOf(state);
  const { clearedRows, clearedCols, steps } = placeAndClear(state.board, piece, r, c, mode, true);
  state.tray[slot].used = true;
  state.moves++;

  const chain = steps.map((s) => s.clearedRows.length + s.clearedCols.length);
  const lines = chain.reduce((a, b) => a + b, 0);
  const boardCleared = lines > 0 && isEmpty(state.board);
  const points = scorePlacement({ cells: piece.size, lines, combo: lines ? state.combo : 0, boardCleared, chain });
  state.score += points;
  state.linesCleared += lines;
  if (lines) {
    state.combo += steps.length;
    state.movesSinceClear = 0;
  } else if (++state.movesSinceClear >= COMBO_GRACE) {
    state.combo = 0;
  }

  const oldLevel = state.level;
  state.level = levelForProgress(state);

  let dealt = false;
  const remaining = state.tray.filter((t) => !t.used).map((t) => getPiece(t.id));
  if (remaining.length === 0) {
    deal(state);
    dealt = true;
  } else if (!anyOrderSolvable(state.board, remaining, mode)) {
    state.gameOver = true;
  }

  return { ok: true, points, clearedRows, clearedCols, steps, lines, boardCleared, dealt, levelUp: state.level > oldLevel, gameOver: state.gameOver };
}

function deal(state) {
  const rng = createRng(state.rngState);
  const round = dealRound(state.board, rng, difficultyForLevel(state.level, modeOf(state)));
  state.rngState = rng.state;
  state.tray = round.pieces.map((p) => ({ id: p.id, used: false }));
  state.rounds++;
  state.lastRound = { solvableOrders: round.solvableOrders, totalOrders: round.totalOrders, inBand: round.inBand };
}
