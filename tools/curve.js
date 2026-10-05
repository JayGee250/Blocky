// Measures the difficulty curve with bots that play roughly like people.
//   node tools/curve.js [games=40] [profiles=all]
//
// Part 1 pins the game at each level and reports the chance of losing per
// round and the median rounds survived (capped at CAP rounds).
// Part 2 plays normal games from level 1 and reports where each bot ends up.
//
// Bot profiles: every bot places pieces sensibly (prefers clearing lines,
// hugging walls and filled cells, avoiding single-cell holes). They differ in
// how often they check that a move keeps the rest of the round placeable
// ("lookahead"), which is the skill the order puzzle asks for. A bot that
// always checks never loses, because every round is dealt solvable.
import {
  newGame, place, trayPieces, placements, cloneBoard, placeAndClear, anyOrderSolvable,
  createRng, SIZE, LINES_PER_LEVEL, MAX_LEVEL, dealRound, difficultyForLevel,
} from '../engine/index.js';

export const PROFILES = {
  kid: { lookahead: 0, noise: 6 },        // places fairly sensibly, never plans the order
  casual: { lookahead: 0.3, noise: 2 },   // sometimes thinks ahead
  attentive: { lookahead: 0.7, noise: 1 },
  strong: { lookahead: 0.92, noise: 0.5 },
};

const CAP = 150;

function filled(b, r, c) {
  return r < 0 || c < 0 || r >= SIZE || c >= SIZE || ((b[r] >> c) & 1);
}

// Higher is better: lines cleared, contact with walls and filled cells,
// minus empty cells left boxed in on all four sides.
function moveValue(board, piece, r, c) {
  let contact = 0;
  for (const [dr, dc] of piece.cells) {
    const y = r + dr, x = c + dc;
    for (const [ny, nx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]) {
      if (filled(board, ny, nx)) contact++;
    }
  }
  const b = cloneBoard(board);
  const { clearedRows, clearedCols } = placeAndClear(b, piece, r, c);
  let isolated = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!filled(b, y, x) && filled(b, y - 1, x) && filled(b, y + 1, x) && filled(b, y, x - 1) && filled(b, y, x + 1)) isolated++;
  }
  return { value: 10 * (clearedRows.length + clearedCols.length) + contact - 5 * isolated, board: b };
}

export function botMove(state, profile, rng) {
  const tray = trayPieces(state);
  const thinks = rng.next() < profile.lookahead;
  let best = null, bestSafe = null;
  tray.forEach((t, slot) => {
    if (t.used) return;
    const rest = tray.filter((u, i) => !u.used && i !== slot).map((u) => u.piece);
    for (const [r, c] of placements(state.board, t.piece)) {
      const m = moveValue(state.board, t.piece, r, c);
      const v = m.value + rng.next() * profile.noise;
      const move = { slot, r, c, v };
      if (!best || v > best.v) best = move;
      if (thinks && (!bestSafe || v > bestSafe.v) && (!rest.length || anyOrderSolvable(m.board, rest))) bestSafe = move;
    }
  });
  return bestSafe || best;
}

// Plays one game pinned at `level`; returns rounds completed before losing (or CAP).
function pinnedGame(level, profile, seed) {
  const rng = createRng(seed ^ 0x9e3779b9);
  const state = newGame({ seed });
  const base = (level - 1) * LINES_PER_LEVEL;
  const pin = () => { state.linesCleared = base; state.level = level; };
  pin();
  const first = dealRound(state.board, createRng(seed), difficultyForLevel(level));
  state.tray = first.pieces.map((p) => ({ id: p.id, used: false }));
  state.rounds = 1;
  while (!state.gameOver && state.rounds <= CAP) {
    const m = botMove(state, profile, rng);
    place(state, m.slot, m.r, m.c);
    pin();
  }
  return state.gameOver ? state.rounds - 1 : CAP;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 40);
  const names = process.argv[3] ? process.argv[3].split(',') : Object.keys(PROFILES);

  console.log(`Pinned levels, ${games} games each. Cell = loss chance per round / median rounds survived (cap ${CAP})`);
  console.log('level  ' + names.map((n) => n.padStart(14)).join(''));
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const cells = names.map((n) => {
      const runs = Array.from({ length: games }, (_, g) => pinnedGame(level, PROFILES[n], 5000 + g));
      const deaths = runs.filter((x) => x < CAP).length;
      const rounds = runs.reduce((a, b) => a + b, 0) + deaths;
      return `${(100 * deaths / rounds).toFixed(1)}% / ${median(runs)}`.padStart(14);
    });
    console.log(String(level).padStart(5) + '  ' + cells.join(''));
  }

  console.log(`\nFull games from level 1, ${games} games each (stops at 400 rounds)`);
  console.log('profile     median level  median rounds  median score  reached L10');
  for (const n of names) {
    const res = Array.from({ length: games }, (_, g) => {
      const rng = createRng((9000 + g) ^ 0x9e3779b9);
      const state = newGame({ seed: 9000 + g });
      while (!state.gameOver && state.rounds < 400) {
        const m = botMove(state, PROFILES[n], rng);
        place(state, m.slot, m.r, m.c);
      }
      return state;
    });
    console.log(`${n.padEnd(10)}  ${String(median(res.map((s) => s.level))).padStart(12)}  ${String(median(res.map((s) => s.rounds))).padStart(13)}  ${String(median(res.map((s) => s.score))).padStart(12)}  ${String(res.filter((s) => s.level === MAX_LEVEL).length).padStart(6)}/${games}`);
  }
}
