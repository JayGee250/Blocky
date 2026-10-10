import { createBoard, canPlace, placeAndClear, isEmpty } from './board.js';
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
export function newGame({ seed = Date.now() >>> 0, level = 1 } = {}) {
  const startLevel = Math.min(Math.max(Math.floor(level) || 1, 1), MAX_LEVEL);
  const state = {
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
// Returns { ok, points, clearedRows, clearedCols, boardCleared, dealt, levelUp, gameOver }.
export function place(state, slot, r, c) {
  if (!canPlaceSlot(state, slot, r, c)) return { ok: false };
  const piece = getPiece(state.tray[slot].id);
  const { clearedRows, clearedCols } = placeAndClear(state.board, piece, r, c);
  state.tray[slot].used = true;
  state.moves++;

  const lines = clearedRows.length + clearedCols.length;
  const boardCleared = lines > 0 && isEmpty(state.board);
  const points = scorePlacement({ cells: piece.size, lines, combo: lines ? state.combo : 0, boardCleared });
  state.score += points;
  state.linesCleared += lines;
  if (lines) {
    state.combo++;
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
  } else if (!anyOrderSolvable(state.board, remaining)) {
    state.gameOver = true;
  }

  return { ok: true, points, clearedRows, clearedCols, boardCleared, dealt, levelUp: state.level > oldLevel, gameOver: state.gameOver };
}

function deal(state) {
  const rng = createRng(state.rngState);
  const round = dealRound(state.board, rng, difficultyForLevel(state.level));
  state.rngState = rng.state;
  state.tray = round.pieces.map((p) => ({ id: p.id, used: false }));
  state.rounds++;
  state.lastRound = { solvableOrders: round.solvableOrders, totalOrders: round.totalOrders, inBand: round.inBand };
}
